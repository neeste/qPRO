/*
 * qpro_core.c
 *
 * Client-side C99 / WebAssembly biophysical interpretation engine for:
 *   qPRO — Quick Suprathreshold Clinical Profile (Audiogram + qCLS + qVCV)
 *
 * Compiles cleanly across all three targets:
 *   1. Native C99 parity/CLI binary : cc -O3 -std=c99 qpro_core.c ... -lm
 *   2. Emscripten WebAssembly       : emcc -O3 qpro_core.c -o qpro_core.js ... -lm
 *   3. Standalone LLVM wasm32       : clang --target=wasm32 -O3 -c qpro_core.c ...
 */

#include <stdint.h>
#include "qpro_model.h"

#if defined(__wasm__) && !defined(__EMSCRIPTEN__)
__attribute__((import_module("env"), import_name("js_exp"))) extern double js_exp(double x);
__attribute__((import_module("env"), import_name("js_log"))) extern double js_log(double x);
__attribute__((import_module("env"), import_name("js_pow"))) extern double js_pow(double x, double y);
__attribute__((import_module("env"), import_name("js_sqrt"))) extern double js_sqrt(double x);
#define Q_EXP(x)    js_exp(x)
#define Q_LOG(x)    js_log(x)
#define Q_POW(x, y) js_pow((x), (y))
#define Q_SQRT(x)   js_sqrt(x)
#define QPRO_EXPORT(name) __attribute__((export_name(name), visibility("default")))
#else
#include <math.h>
#define Q_EXP(x)    exp(x)
#define Q_LOG(x)    log(x)
#define Q_POW(x, y) pow((x), (y))
#define Q_SQRT(x)   sqrt(x)
#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#define QPRO_EXPORT(name) EMSCRIPTEN_KEEPALIVE
#else
#define QPRO_EXPORT(name)
#endif
#endif

#define Q_LOG10(x) (Q_LOG(x) * 0.43429448190325182765)
#define Q_LOG2(x)  (Q_LOG(x) * 1.44269504088896340736)
#define Q_POW10(x) Q_POW(10.0, (x))

static inline double q_max(double a, double b) { return a > b ? a : b; }
static inline double q_min(double a, double b) { return a < b ? a : b; }
static inline double q_abs(double x) { return x < 0.0 ? -x : x; }
static inline double q_clip(double x, double lo, double hi) {
    return x < lo ? lo : (x > hi ? hi : x);
}
static inline int q_isnan_s(double x) {
    return (x != x) || (x < -500.0);
}

/*
 * Single contiguous state struct so standalone wasm32 modules have one
 * deterministic data segment with zero multi-symbol relocation ambiguity.
 */
typedef struct {
    QProModelConst M;
    double in_buf[256];
    double out_buf[420];
} QProGlobalState;

static QProGlobalState G = {
    .M = QPRO_MODEL_INIT
};

QPRO_EXPORT("qpro_get_in_ptr")
double *qpro_get_in_ptr(void) {
    return G.in_buf;
}

QPRO_EXPORT("qpro_get_out_ptr")
double *qpro_get_out_ptr(void) {
    return G.out_buf;
}

/* Deterministic 64-bit SplitMix64 PRNG for parametric bootstrap SE */
static inline uint64_t q_rng_next(uint64_t *state) {
    uint64_t z = (*state += 0x9e3779b97f4a7c15ULL);
    z = (z ^ (z >> 30)) * 0xbf58476d1ce4e5b9ULL;
    z = (z ^ (z >> 27)) * 0x94d049bb133111ebULL;
    return z ^ (z >> 31);
}

static inline double q_rng_uniform(uint64_t *state) {
    return (double)(q_rng_next(state) >> 11) * (1.0 / 9007199254740992.0);
}

/* Map recognition accuracy [0..1] onto NH-equivalent SNR loss (dB) */
static double q_eq_snr_deficit_db(double pc_val) {
    double pc_nh0 = G.M.pc_nh0;
    if (pc_val >= pc_nh0) {
        double denom = q_max(0.990 - pc_nh0, 1e-4);
        return -2.2 * (pc_val - pc_nh0) / denom;
    }
    double lo_pc = G.M.pc_mono[0] + 1e-4;
    double pc_c = q_clip(pc_val, lo_pc, pc_nh0);
    if (pc_c <= G.M.pc_mono[0]) return -G.M.ds_mono[0];
    for (int i = 0; i < QPRO_N_MONO - 1; i++) {
        double y0 = G.M.pc_mono[i];
        double y1 = G.M.pc_mono[i + 1];
        if (pc_c >= y0 && pc_c <= y1) {
            double t = (y1 > y0 + 1e-12) ? ((pc_c - y0) / (y1 - y0)) : 0.0;
            double ds = G.M.ds_mono[i] + t * (G.M.ds_mono[i + 1] - G.M.ds_mono[i]);
            return -ds;
        }
    }
    return -G.M.ds_mono[QPRO_N_MONO - 1];
}

/* Piecewise-linear forward/inverse lookup on a 10-point qCLS contour (CU 5..50) */
static double q_elc_cu_at_spl(const double y10[10], double spl) {
    if (spl <= y10[0]) {
        double slp = q_max(y10[1] - y10[0], 2.5);
        return q_clip(5.0 - 5.0 * (y10[0] - spl) / slp, 0.0, 5.0);
    }
    for (int c = 0; c < 9; c++) {
        double a = y10[c], b = q_max(y10[c + 1], a + 0.5);
        if (spl <= b) {
            return (double)((c + 1) * 5) + 5.0 * (spl - a) / (b - a);
        }
    }
    double slp_hi = q_max(y10[9] - y10[8], 2.5);
    return q_clip(50.0 + 5.0 * (spl - y10[9]) / slp_hi, 50.0, 55.0);
}

static double q_elc_spl_at_cu(const double y10[10], double cu) {
    if (cu <= 5.0) {
        double slp = q_max(y10[1] - y10[0], 2.5);
        return y10[0] - ((5.0 - cu) / 5.0) * slp;
    }
    if (cu >= 50.0) {
        double slp = q_max(y10[9] - y10[8], 2.5);
        return y10[9] + ((cu - 50.0) / 5.0) * slp;
    }
    int idx = (int)(cu / 5.0) - 1;
    if (idx < 0) idx = 0;
    if (idx > 8) idx = 8;
    double frac = (cu - (double)((idx + 1) * 5)) / 5.0;
    return y10[idx] + frac * (y10[idx + 1] - y10[idx]);
}

/* Compute peripheral spectro-temporal template distances nd[10][2][10] & aud_cue ac[10][2] */
static void q_compute_peripheral_features_ex(
    const double snr_per_cons[10],
    const double aud_hl[10],
    const double hl_ohc[10],
    const double *ha_gain_10,
    double wdrc_smear,
    double nd_out[10][2][10],
    double ac_out[10][2]
) {
    double hl_tot[10], w_erb[10], in_band_pen[10], thr_spl[10], log2_f[10], s_low[10], gain[10];
    for (int f = 0; f < 10; f++) {
        hl_tot[f] = q_max(aud_hl[f], 0.0);
        gain[f] = (ha_gain_10 != 0) ? ha_gain_10[f] : 0.0;
        double ohc_c = q_clip(hl_ohc[f], 0.0, 55.0);
        w_erb[f] = 1.0 + G.M.gamma_ohc * (ohc_c / 50.0);
        in_band_pen[f] = 10.0 * Q_LOG10(w_erb[f]);
        thr_spl[f] = G.M.retspl_ansi[f] + hl_tot[f] - gain[f] + G.M.thr_offset_db;
        log2_f[f] = Q_LOG2(G.M.aud_freqs_hz[f]);
        s_low[f] = 65.0 / w_erb[f];
    }

    /* Prototype templates averaged across both talker tokens (in power domain) */
    double proto_pwr[10][3][10];
    double proto_voice[10], proto_cont[10];
    for (int cand = 0; cand < 10; cand++) {
        proto_voice[cand] = 0.5 * (G.M.voicing_acorr[cand * 2 + 0] + G.M.voicing_acorr[cand * 2 + 1]);
        proto_cont[cand]  = 0.5 * (G.M.continuant_idx[cand * 2 + 0] + G.M.continuant_idx[cand * 2 + 1]);
        for (int ep = 0; ep < 3; ep++) {
            for (int f = 0; f < 10; f++) {
                double db0 = G.M.cue_spl[((cand * 2 + 0) * 3 + ep) * 10 + f];
                double db1 = G.M.cue_spl[((cand * 2 + 1) * 3 + ep) * 10 + f];
                proto_pwr[cand][ep][f] = 0.5 * (Q_POW10(db0 / 10.0) + Q_POW10(db1 / 10.0));
            }
        }
    }

    const double ep_wt[3] = {0.40, 0.40, 0.20};

    for (int c = 0; c < 10; c++) {
        double eff_snr = snr_per_cons[c] - 2.5 * wdrc_smear;
        double n_ext[10];
        for (int f = 0; f < 10; f++) {
            n_ext[f] = G.M.ltass_0snr_spl[f] - eff_snr + in_band_pen[f];
        }

        for (int m = 0; m < 2; m++) {
            double v_src[10];
            for (int src = 0; src < 10; src++) {
                double vs = G.M.vowel_spl[(c * 2 + m) * 10 + src] - G.M.usom_vowel_att_db;
                double ns = G.M.ltass_0snr_spl[src] - eff_snr;
                v_src[src] = q_max(vs, ns);
            }

            double tot_mask_pwr[10], m_db[10];
            for (int dst = 0; dst < 10; dst++) {
                double usom_pwr = 0.0;
                for (int src = 0; src < 10; src++) {
                    double df_oct = log2_f[dst] - log2_f[src];
                    if (df_oct > 0.05) {
                        double att = s_low[dst] * df_oct;
                        double diff_gain = gain[src] - gain[dst];
                        usom_pwr += Q_POW10(q_clip(v_src[src] + diff_gain - att, -40.0, 120.0) / 10.0);
                    }
                }
                tot_mask_pwr[dst] =
                    Q_POW10(q_clip(n_ext[dst], -40.0, 120.0) / 10.0)
                    + usom_pwr
                    + Q_POW10(q_clip(thr_spl[dst], -40.0, 120.0) / 10.0);
                m_db[dst] = 10.0 * Q_LOG10(tot_mask_pwr[dst]);
            }

            double y_obs[3][10];
            double aud_sum = 0.0;
            for (int ep = 0; ep < 3; ep++) {
                for (int f = 0; f < 10; f++) {
                    double sp_db = G.M.cue_spl[((c * 2 + m) * 3 + ep) * 10 + f];
                    double sp_pwr = Q_POW10(sp_db / 10.0);
                    y_obs[ep][f] = 10.0 * Q_LOG10(sp_pwr + tot_mask_pwr[f]);
                    double aud_s = q_max(y_obs[ep][f] - m_db[f], 0.0);
                    aud_sum += ep_wt[ep] * aud_s;
                }
            }
            ac_out[c][m] = aud_sum;

            double lf_margin = 0.0;
            for (int f = 0; f < 3; f++) {
                lf_margin += (G.M.cue_spl[((c * 2 + m) * 3 + 0) * 10 + f] - m_db[f]);
            }
            lf_margin /= 3.0;

            double vis_voice = 1.0 / (1.0 + Q_EXP(-q_clip((lf_margin + 8.0) / 4.0, -20.0, 20.0)));
            double vis_cont  = (1.0 - 0.35 * wdrc_smear) / (1.0 + Q_EXP(-q_clip((aud_sum - 3.0) / 3.5, -20.0, 20.0)));
            double vc_cm = G.M.voicing_acorr[c * 2 + m];
            double ct_cm = G.M.continuant_idx[c * 2 + m];

            for (int cand = 0; cand < 10; cand++) {
                double d_spec = 0.0;
                for (int ep = 0; ep < 3; ep++) {
                    for (int f = 0; f < 10; f++) {
                        double t_exp = 10.0 * Q_LOG10(proto_pwr[cand][ep][f] + tot_mask_pwr[f]);
                        double diff = y_obs[ep][f] - t_exp;
                        d_spec += ep_wt[ep] * diff * diff;
                    }
                }
                d_spec /= 100.0;
                double dv = vc_cm - proto_voice[cand];
                double dc = ct_cm - proto_cont[cand];
                double d_voice = vis_voice * dv * dv;
                double d_cont  = vis_cont  * dc * dc;
                nd_out[c][m][cand] = -(
                    G.M.spec_scale * d_spec + G.M.voice_scale * d_voice + G.M.cont_scale * d_cont
                );
            }
        }
    }
}

static void q_compute_peripheral_features(
    const double snr_per_cons[10],
    const double aud_hl[10],
    const double hl_ohc[10],
    double nd_out[10][2][10],
    double ac_out[10][2]
) {
    q_compute_peripheral_features_ex(snr_per_cons, aud_hl, hl_ohc, 0, 0.0, nd_out, ac_out);
}

/* Compute 10x11 confusion probability matrix averaged over both talker tokens */
static void q_compute_probs_10x11(
    const double nd[10][2][10],
    const double ac[10][2],
    const double eff[10],
    double unk_crit,
    double lapse_rate,
    double probs_out[10][11]
) {
    for (int c = 0; c < 10; c++) {
        for (int j = 0; j < 11; j++) probs_out[c][j] = 0.0;
        for (int m = 0; m < 2; m++) {
            double logits[11];
            double ac_cm = ac[c][m];
            double uncert_gate = 1.0 / (1.0 + Q_EXP((ac_cm - 22.0) / 7.5));
            double bias_scale = 0.35 + 0.65 * uncert_gate;
            for (int j = 0; j < 10; j++) {
                logits[j] = eff[c] * nd[c][m][j] + bias_scale * G.M.dir_choice_bias[c * 10 + j];
            }
            logits[c] += G.M.self_clarity_offset[c] + 0.14 * eff[c] * ac_cm;
            double low_evid = 1.0 / (1.0 + Q_EXP((ac_cm - 8.0) / 4.0));
            logits[10] = unk_crit + 2.2 * low_evid;

            double max_l = logits[0];
            for (int j = 1; j < 11; j++) if (logits[j] > max_l) max_l = logits[j];
            double sum_e = 0.0;
            double p_tok[11];
            for (int j = 0; j < 11; j++) {
                p_tok[j] = Q_EXP(logits[j] - max_l);
                sum_e += p_tok[j];
            }
            for (int j = 0; j < 11; j++) {
                double p_ij = p_tok[j] / sum_e;
                if (lapse_rate > 0.0) {
                    p_ij = (1.0 - lapse_rate) * p_ij + (lapse_rate / 11.0);
                }
                probs_out[c][j] += 0.5 * p_ij;
            }
        }
    }
}

typedef struct {
    const double (*counts)[11];
    const double (*nd)[2][10];
    const double (*ac)[2];
    const double (*nd_prac)[2][10];
    const double (*ac_prac)[2];
    double practice_pc;
    int use_nuisance;
} QProFitCtx;

static void q_unpack_theta(const double *theta, int n_dim, double eff_out[10], double *unk_out) {
    /* LF: B(0), D(1), G(2), N(4), V(8); HF: K(3), S(5), SH(6), T(7), Z(9) */
    const int is_hf[10] = {0, 0, 0, 1, 0, 1, 1, 1, 0, 1};
    double g_lf = theta[0];
    double g_hf = theta[1];
    for (int c = 0; c < 10; c++) {
        double le = is_hf[c] ? g_hf : g_lf;
        if (n_dim == 13) le += theta[3 + c];
        eff_out[c] = Q_EXP(q_clip(le, -2.2, 1.4));
    }
    *unk_out = q_clip(theta[2], -6.5, 2.5);
}

static double q_neg_log_post(const double *theta, int n_dim, const QProFitCtx *ctx) {
    double eff[10], u_c;
    q_unpack_theta(theta, n_dim, eff, &u_c);
    double p_mat[10][11];
    q_compute_probs_10x11(ctx->nd, ctx->ac, eff, u_c, G.M.lapse_rate, p_mat);

    double nll = 0.0;
    for (int i = 0; i < 10; i++) {
        for (int j = 0; j < 11; j++) {
            double c_ij = ctx->counts[i][j];
            if (c_ij > 0.0) {
                nll -= c_ij * Q_LOG(q_max(p_mat[i][j], 1e-12));
            }
        }
    }

    double t0 = theta[0] / 0.75;
    double t1 = theta[1] / 0.75;
    double td = (theta[0] - theta[1]) / 0.55;
    double tu = (theta[2] - (-2.5)) / 1.8;
    double reg = 0.5 * (t0 * t0 + t1 * t1 + td * td + tu * tu);
    if (n_dim == 13) {
        for (int k = 0; k < 10; k++) {
            double tk = theta[3 + k] / 0.32;
            reg += 0.5 * tk * tk;
        }
    }

    if (ctx->practice_pc >= 0.0 && ctx->nd_prac != 0 && ctx->ac_prac != 0) {
        double p_prac[10][11];
        q_compute_probs_10x11(ctx->nd_prac, ctx->ac_prac, eff, u_c, 0.023, p_prac);
        double pc_pred = 0.0;
        for (int c = 0; c < 10; c++) pc_pred += p_prac[c][c];
        pc_pred /= 10.0;
        double k_pr = 10.0 * ctx->practice_pc / 100.0;
        nll -= (k_pr * Q_LOG(q_max(pc_pred, 1e-9)) + (10.0 - k_pr) * Q_LOG(q_max(1.0 - pc_pred, 1e-9)));
    }
    return nll + reg;
}

/* Deterministic BFGS optimizer (matching scipy.optimize.minimize(method='BFGS')) */
static void q_fit_listener_bfgs(
    const QProFitCtx *ctx,
    double eff_hat[10],
    double *unk_hat,
    double p_hat[10][11]
) {
    int n_dim = ctx->use_nuisance ? 13 : 3;
    double x[13], g[13], g_new[13], p[13], s[13], y[13], Hy[13];
    double H[13][13];

    for (int i = 0; i < n_dim; i++) {
        x[i] = 0.0;
        for (int j = 0; j < n_dim; j++) H[i][j] = (i == j) ? 1.0 : 0.0;
    }
    x[2] = -2.5;

    const double eps = 1.4901161193847656e-8;
    double f_val = q_neg_log_post(x, n_dim, ctx);
    for (int i = 0; i < n_dim; i++) {
        double orig = x[i];
        x[i] = orig + eps; double fp = q_neg_log_post(x, n_dim, ctx);
        x[i] = orig;
        g[i] = (fp - f_val) / eps;
    }

    int max_iter = ctx->use_nuisance ? 75 : 45;
    for (int iter = 0; iter < max_iter; iter++) {
        double g_norm = 0.0;
        for (int i = 0; i < n_dim; i++) {
            double ag = q_abs(g[i]);
            if (ag > g_norm) g_norm = ag;
        }
        if (g_norm < 1e-4) break;

        double dir_deriv = 0.0;
        for (int i = 0; i < n_dim; i++) {
            double sum = 0.0;
            for (int j = 0; j < n_dim; j++) sum -= H[i][j] * g[j];
            p[i] = sum;
            dir_deriv += p[i] * g[i];
        }
        if (dir_deriv >= -1e-12) {
            for (int i = 0; i < n_dim; i++) {
                p[i] = -g[i];
                for (int j = 0; j < n_dim; j++) H[i][j] = (i == j) ? 1.0 : 0.0;
            }
            dir_deriv = 0.0;
            for (int i = 0; i < n_dim; i++) dir_deriv += p[i] * g[i];
        }

        /* Strong Wolfe / Armijo backtracking with steepest-descent fallback */
        double p_norm = 0.0;
        for (int i = 0; i < n_dim; i++) p_norm += p[i] * p[i];
        p_norm = Q_SQRT(p_norm);
        double alpha = (iter == 0 && p_norm > 1.0) ? (1.0 / p_norm) : 1.0;
        double x_cand[13];
        double f_cand = f_val;
        int accepted = 0;
        for (int pass = 0; pass < 2 && !accepted; pass++) {
            if (pass == 1) {
                for (int i = 0; i < n_dim; i++) {
                    p[i] = -g[i];
                    for (int j = 0; j < n_dim; j++) H[i][j] = (i == j) ? 1.0 : 0.0;
                }
                dir_deriv = 0.0;
                for (int i = 0; i < n_dim; i++) dir_deriv += p[i] * g[i];
                alpha = 1.0 / q_max(g_norm, 1.0);
            }
            for (int ls = 0; ls < 22; ls++) {
                for (int i = 0; i < n_dim; i++) x_cand[i] = x[i] + alpha * p[i];
                f_cand = q_neg_log_post(x_cand, n_dim, ctx);
                if (f_cand <= f_val + 1e-4 * alpha * dir_deriv) {
                    accepted = 1;
                    break;
                }
                alpha *= 0.5;
            }
        }
        if (!accepted) break;

        for (int i = 0; i < n_dim; i++) {
            s[i] = x_cand[i] - x[i];
            x[i] = x_cand[i];
        }
        f_val = f_cand;

        for (int i = 0; i < n_dim; i++) {
            double orig = x[i];
            x[i] = orig + eps; double fp = q_neg_log_post(x, n_dim, ctx);
            x[i] = orig;
            g_new[i] = (fp - f_val) / eps;
            y[i] = g_new[i] - g[i];
            g[i] = g_new[i];
        }

        double ys = 0.0;
        for (int i = 0; i < n_dim; i++) ys += y[i] * s[i];
        if (ys > 1e-10) {
            double rho = 1.0 / ys;
            double yHy = 0.0;
            for (int i = 0; i < n_dim; i++) {
                double sum = 0.0;
                for (int j = 0; j < n_dim; j++) sum += H[i][j] * y[j];
                Hy[i] = sum;
                yHy += y[i] * sum;
            }
            for (int i = 0; i < n_dim; i++) {
                for (int j = 0; j < n_dim; j++) {
                    H[i][j] += (rho * (1.0 + rho * yHy)) * s[i] * s[j]
                             - rho * (Hy[i] * s[j] + s[i] * Hy[j]);
                }
            }
        }
    }

    q_unpack_theta(x, n_dim, eff_hat, unk_hat);
    q_compute_probs_10x11(ctx->nd, ctx->ac, eff_hat, *unk_hat, G.M.lapse_rate, p_hat);
}

/* Empirical-Bayes concentration kappa (matching estimate_eb_concentration) */
static double q_estimate_eb_kappa(const double counts[10][11], const double mu[10][11]) {
    double row_tot[10];
    int n_active = 0;
    double sum_n = 0.0;
    for (int i = 0; i < 10; i++) {
        double rs = 0.0;
        for (int j = 0; j < 11; j++) rs += counts[i][j];
        row_tot[i] = rs;
        if (rs >= 3.0) {
            n_active++;
            sum_n += rs;
        }
    }
    if (n_active < 3) return 3.25;
    double pearson = 0.0;
    for (int i = 0; i < 10; i++) {
        if (row_tot[i] < 3.0) continue;
        for (int j = 0; j < 11; j++) {
            double exp_ij = row_tot[i] * q_max(mu[i][j], 1e-3);
            double d = counts[i][j] - exp_ij;
            pearson += (d * d) / exp_ij;
        }
    }
    double df = q_max(1.0, (double)(n_active * 10 - 8));
    double disp = pearson / df;
    if (disp <= 1.05) return 4.50;
    double mean_n = sum_n / (double)n_active;
    if (mean_n <= disp) return 1.25;
    return q_clip((mean_n - disp) / (disp - 1.0), 1.25, 4.50);
}

/* Mutual information % for Miller & Nicely Voicing, Manner, Place */
static double q_feature_rtr_pct(const double ccm[10][11], const int stim_cls[10], int n_cls) {
    double joint[4][5];
    for (int s = 0; s < n_cls; s++)
        for (int r = 0; r < n_cls + 1; r++) joint[s][r] = 0.0;

    for (int i = 0; i < 10; i++) {
        int si = stim_cls[i];
        for (int j = 0; j < 11; j++) {
            int rj = (j == 10) ? n_cls : stim_cls[j];
            joint[si][rj] += ccm[i][j] * 0.1;
        }
    }
    double px[4] = {0}, py[5] = {0};
    for (int s = 0; s < n_cls; s++) {
        for (int r = 0; r < n_cls + 1; r++) {
            px[s] += joint[s][r];
            py[r] += joint[s][r];
        }
    }
    double hx = 0.0, mi = 0.0;
    for (int s = 0; s < n_cls; s++) {
        if (px[s] > 0.0) hx -= px[s] * Q_LOG2(px[s]);
        for (int r = 0; r < n_cls + 1; r++) {
            double pxy = joint[s][r];
            double den = px[s] * py[r];
            if (pxy > 0.0 && den > 0.0) {
                mi += pxy * Q_LOG2(pxy / den);
            }
        }
    }
    return (hx > 0.0 && mi > 0.0) ? (100.0 * mi / hx) : 0.0;
}

/*
 * Main entry point: reads G.in_buf and populates G.out_buf.
 * Returns 0 on success.
 */
QPRO_EXPORT("qpro_evaluate")
int qpro_evaluate(void) {
    double aud_hl[10], aud_spl[10], hl_ohc[10], hl_ihc[10], erb_x[10];
    int has_elc = (G.in_buf[10] > 0.5) ? 1 : 0;
    double elc[10][10];
    double counts[10][11];

    for (int f = 0; f < 10; f++) aud_hl[f] = G.in_buf[f];
    for (int f = 0; f < 10; f++)
        for (int c = 0; c < 10; c++) elc[f][c] = G.in_buf[11 + f * 10 + c];
    for (int i = 0; i < 10; i++)
        for (int j = 0; j < 11; j++) counts[i][j] = G.in_buf[111 + i * 11 + j];

    double practice_pc = G.in_buf[221];
    int trans_id = (int)(G.in_buf[222] + 0.5);
    int n_boot = (int)(G.in_buf[223] + 0.5);
    if (n_boot < 0) n_boot = 0;
    if (n_boot > 128) n_boot = 128;
    uint64_t rng_state = (uint64_t)(uint32_t)G.in_buf[224] + 0x123456789abcdefULL;
    double measured_srt = G.in_buf[225];

    const double *retspl = (trans_id == 1) ? G.M.retspl_legacy
                         : ((trans_id == 2) ? G.M.retspl_ansi : G.M.retspl_er3a);
    for (int f = 0; f < 10; f++) aud_spl[f] = aud_hl[f] + retspl[f];

    /* 1. qCLS monotonicity & OHC / IHC partition */
    int qcls_valid = 0;
    double cu5_aud_diff = -999.0, dyn_lf = -999.0, dyn_hf = -999.0, slope_cu_db = -999.0, cu50_hf = -999.0;
    if (has_elc) {
        int n_valid_bands = 0;
        double min_span = 999.0, max_cu5 = -999.0;
        for (int f = 0; f < 10; f++) {
            if (!q_isnan_s(elc[f][0]) && !q_isnan_s(elc[f][9])) {
                n_valid_bands++;
                double sp = elc[f][9] - elc[f][0];
                if (sp < min_span) min_span = sp;
                if (elc[f][0] > max_cu5) max_cu5 = elc[f][0];
            }
        }
        if (n_valid_bands >= 4) {
            qcls_valid = (min_span >= 8.0 && max_cu5 <= 130.0) ? 1 : 0;
        }
    }

    if (has_elc) {
        double rec[10];
        int rec_ok[10];
        for (int f = 0; f < 10; f++) {
            double tot = q_max(aud_hl[f], 0.0);
            int nl = 0, nh_c = 0;
            double sl = 0.0, sh = 0.0;
            for (int c = 0; c < 2; c++) {
                if (!q_isnan_s(elc[f][c])) { sl += (elc[f][c] - G.M.y_nh_elc[f * 10 + c]); nl++; }
            }
            for (int c = 7; c < 9; c++) {
                if (!q_isnan_s(elc[f][c])) { sh += (elc[f][c] - G.M.y_nh_elc[f * 10 + c]); nh_c++; }
            }
            if (nl > 0 && nh_c > 0) {
                double loss_low = sl / (double)nl;
                double loss_high = sh / (double)nh_c;
                rec[f] = q_clip(loss_low - q_max(loss_high, 0.0), 0.0, 55.0);
                rec_ok[f] = 1;
            } else {
                rec[f] = q_min(0.70 * tot, 55.0);
                rec_ok[f] = 0;
            }
        }
        if (!rec_ok[9] && rec_ok[8] && q_max(aud_hl[8], 0.0) > 5.0) {
            double frac_6k = q_clip(rec[8] / q_max(aud_hl[8], 0.0), 0.25, 0.85);
            rec[9] = q_min(frac_6k * q_max(aud_hl[9], 0.0), 55.0);
        }
        for (int f = 0; f < 10; f++) {
            double tot = q_max(aud_hl[f], 0.0);
            double ohc = (tot >= 10.0) ? q_clip(rec[f], 0.25 * tot, q_min(tot, 55.0)) : (0.70 * tot);
            hl_ohc[f] = q_clip(ohc, 0.0, 55.0);
            hl_ihc[f] = q_max(tot - hl_ohc[f], 0.0);
        }

        if (qcls_valid) {
            double s_diff = 0.0, s_slp = 0.0, s_lf = 0.0, s_hf = 0.0, s_cu50 = 0.0;
            int n_all = 0, n_lf = 0, n_hf = 0;
            for (int f = 0; f < 10; f++) {
                if (!q_isnan_s(elc[f][0]) && !q_isnan_s(elc[f][9])) {
                    double sp = elc[f][9] - elc[f][0];
                    s_diff += (elc[f][0] - aud_spl[f]);
                    s_slp += 45.0 / q_max(sp, 10.0);
                    n_all++;
                    if (f < 4) { s_lf += sp; n_lf++; }
                    if (f >= 6) { s_hf += sp; s_cu50 += elc[f][9]; n_hf++; }
                }
            }
            if (n_all > 0) { cu5_aud_diff = s_diff / n_all; slope_cu_db = s_slp / n_all; }
            if (n_lf > 0)  { dyn_lf = s_lf / n_lf; }
            if (n_hf > 0)  { dyn_hf = s_hf / n_hf; cu50_hf = s_cu50 / n_hf; }
        }
    } else {
        for (int f = 0; f < 10; f++) {
            double tot = q_max(aud_hl[f], 0.0);
            hl_ohc[f] = q_min(0.70 * tot, 55.0);
            hl_ihc[f] = q_max(tot - hl_ohc[f], 0.0);
        }
    }

    for (int f = 0; f < 10; f++) {
        erb_x[f] = 1.0 + G.M.gamma_ohc * (hl_ohc[f] / 50.0);
    }

    /* 2. Peripheral cue extraction (Stage 1 narrow OHC=0, Stage 2 full OHC, +60 dB practice) */
    double zero_ohc[10] = {0};
    double snr_60[10] = {60, 60, 60, 60, 60, 60, 60, 60, 60, 60};
    double nd_aud[10][2][10], ac_aud[10][2];
    double nd_per[10][2][10], ac_per[10][2];
    double nd_prc[10][2][10], ac_prc[10][2];

    q_compute_peripheral_features(G.M.ref_snr_db, aud_hl, zero_ohc, nd_aud, ac_aud);
    q_compute_peripheral_features(G.M.ref_snr_db, aud_hl, hl_ohc,   nd_per, ac_per);
    q_compute_peripheral_features(snr_60,         aud_hl, hl_ohc,   nd_prc, ac_prc);

    /* 3. Fit listener biophysical clarity efficiency */
    double tot_trials = 0.0, tot_corr = 0.0, tot_unk = 0.0;
    for (int i = 0; i < 10; i++) {
        tot_corr += counts[i][i];
        tot_unk  += counts[i][10];
        for (int j = 0; j < 11; j++) tot_trials += counts[i][j];
    }
    double denom_tr = q_max(tot_trials, 1.0);
    double emp_pc = 100.0 * tot_corr / denom_tr;
    double unk_pct = 100.0 * tot_unk / denom_tr;

    QProFitCtx fit_ctx;
    fit_ctx.counts = (const double (*)[11])counts;
    fit_ctx.nd = (const double (*)[2][10])nd_per;
    fit_ctx.ac = (const double (*)[2])ac_per;
    fit_ctx.nd_prac = (practice_pc >= 0.0) ? (const double (*)[2][10])nd_prc : 0;
    fit_ctx.ac_prac = (practice_pc >= 0.0) ? (const double (*)[2])ac_prc : 0;
    fit_ctx.practice_pc = practice_pc;
    fit_ctx.use_nuisance = (tot_trials >= 180.0) ? 1 : 0;

    double eff_hat[10], unk_hat = -2.5;
    double mu_bio[10][11];
    q_fit_listener_bfgs(&fit_ctx, eff_hat, &unk_hat, mu_bio);

    /* 4. 3-Stage Recognition Waterfall & NH-Equivalent SNR Loss */
    double unit_eff[10] = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1};
    double mat_s1[10][11], mat_s2[10][11], mat_s3[10][11], mat_quiet[10][11];
    q_compute_probs_10x11((const double (*)[2][10])nd_aud, (const double (*)[2])ac_aud, unit_eff, G.M.nh_med_unk, G.M.lapse_rate, mat_s1);
    q_compute_probs_10x11((const double (*)[2][10])nd_per, (const double (*)[2])ac_per, unit_eff, G.M.nh_med_unk, G.M.lapse_rate, mat_s2);
    q_compute_probs_10x11((const double (*)[2][10])nd_per, (const double (*)[2])ac_per, eff_hat,  unk_hat,        G.M.lapse_rate, mat_s3);
    q_compute_probs_10x11((const double (*)[2][10])nd_prc, (const double (*)[2])ac_prc, eff_hat,  unk_hat,        G.M.lapse_rate, mat_quiet);

    double pc_aud = 0.0, pc_per = 0.0, pc_ful = 0.0, pc_quiet = 0.0;
    for (int c = 0; c < 10; c++) {
        pc_aud   += mat_s1[c][c];
        pc_per   += mat_s2[c][c];
        pc_ful   += mat_s3[c][c];
        pc_quiet += mat_quiet[c][c];
    }
    pc_aud /= 10.0; pc_per /= 10.0; pc_ful /= 10.0; pc_quiet /= 10.0;

    double d_aud = q_max(0.0, q_eq_snr_deficit_db(pc_aud));
    double d_per = q_max(d_aud, q_eq_snr_deficit_db(pc_per));
    double d_tot = (!q_isnan_s(measured_srt)) ? measured_srt : q_eq_snr_deficit_db(pc_ful);
    double d_ohc = d_per - d_aud;
    double d_neu = d_tot - d_per;

    /* 5. Parametric Bootstrap SE (3-param BFGS per draw) */
    double se_tot = 0.65;
    if (n_boot >= 4) {
        double boot_vals[128];
        int row_n[10];
        for (int i = 0; i < 10; i++) {
            double rs = 0.0;
            for (int j = 0; j < 11; j++) rs += counts[i][j];
            int rn = (int)(rs + 0.5);
            row_n[i] = (rn < 1) ? 1 : rn;
        }
        for (int b = 0; b < n_boot; b++) {
            double c_sim[10][11];
            for (int i = 0; i < 10; i++) {
                for (int j = 0; j < 11; j++) c_sim[i][j] = 0.0;
                for (int tr = 0; tr < row_n[i]; tr++) {
                    double u = q_rng_uniform(&rng_state);
                    double cdf = 0.0;
                    int picked = 10;
                    for (int j = 0; j < 11; j++) {
                        cdf += mat_s3[i][j];
                        if (u <= cdf) { picked = j; break; }
                    }
                    c_sim[i][picked] += 1.0;
                }
            }
            QProFitCtx b_ctx;
            b_ctx.counts = (const double (*)[11])c_sim;
            b_ctx.nd = (const double (*)[2][10])nd_per;
            b_ctx.ac = (const double (*)[2])ac_per;
            b_ctx.nd_prac = 0; b_ctx.ac_prac = 0;
            b_ctx.practice_pc = -1.0;
            b_ctx.use_nuisance = 0;
            double eff_b[10], unk_b = -2.5, p_b[10][11];
            q_fit_listener_bfgs(&b_ctx, eff_b, &unk_b, p_b);
            double pc_b = 0.0;
            for (int c = 0; c < 10; c++) pc_b += p_b[c][c];
            boot_vals[b] = q_eq_snr_deficit_db(pc_b / 10.0);
        }
        double mean_b = 0.0;
        for (int b = 0; b < n_boot; b++) mean_b += boot_vals[b];
        mean_b /= (double)n_boot;
        double var_b = 0.0;
        for (int b = 0; b < n_boot; b++) {
            double dv = boot_vals[b] - mean_b;
            var_b += dv * dv;
        }
        se_tot = Q_SQRT(var_b / (double)(n_boot - 1));
    }

    /* 6. Empirical-Bayes Smoothed Confusion Matrix & Miller-Nicely Cue Clarity */
    double kappa = q_estimate_eb_kappa(counts, mu_bio);
    double smoothed_ccm[10][11];
    for (int i = 0; i < 10; i++) {
        double rs = 0.0;
        for (int j = 0; j < 11; j++) {
            smoothed_ccm[i][j] = counts[i][j] + kappa * mu_bio[i][j];
            rs += smoothed_ccm[i][j];
        }
        for (int j = 0; j < 11; j++) smoothed_ccm[i][j] /= q_max(rs, 1e-12);
    }

    /* B, D, G, K, N, S, SH, T, V, Z */
    const int cls_voice[10]  = {0, 0, 0, 1, 0, 1, 1, 1, 0, 0}; /* 0=voiced, 1=voiceless */
    const int cls_manner[10] = {2, 2, 2, 2, 1, 0, 0, 2, 0, 0}; /* 0=fric, 1=nasal, 2=stop */
    const int cls_place[10]  = {1, 0, 3, 3, 0, 0, 2, 0, 1, 0}; /* 0=alv, 1=lab, 2=postalv, 3=velar */
    double rtr_v = q_min(100.0 * q_feature_rtr_pct(smoothed_ccm, cls_voice,  2) / q_max(G.M.nh_rtr_voicing, 1e-4), 100.0);
    double rtr_m = q_min(100.0 * q_feature_rtr_pct(smoothed_ccm, cls_manner, 3) / q_max(G.M.nh_rtr_manner,  1e-4), 100.0);
    double rtr_p = q_min(100.0 * q_feature_rtr_pct(smoothed_ccm, cls_place,  4) / q_max(G.M.nh_rtr_place,   1e-4), 100.0);

    double pta_124 = (aud_hl[3] + aud_hl[5] + aud_hl[7]) / 3.0;
    double lf_pta  = 0.25 * (aud_hl[0] + aud_hl[1] + aud_hl[2] + aud_hl[3]);
    double hf_pta  = 0.25 * (aud_hl[6] + aud_hl[7] + aud_hl[8] + aud_hl[9]);
    double hf_ohc  = 0.20 * (hl_ohc[5] + hl_ohc[6] + hl_ohc[7] + hl_ohc[8] + hl_ohc[9]);
    double hf_ihc  = 0.20 * (hl_ihc[5] + hl_ihc[6] + hl_ihc[7] + hl_ihc[8] + hl_ihc[9]);
    double hf_erb  = 0.20 * (erb_x[5]  + erb_x[6]  + erb_x[7]  + erb_x[8]  + erb_x[9]);

    double eff_lf = 0.20 * (eff_hat[0] + eff_hat[1] + eff_hat[2] + eff_hat[4] + eff_hat[8]);
    double eff_hf = 0.20 * (eff_hat[3] + eff_hat[5] + eff_hat[6] + eff_hat[7] + eff_hat[9]);

    /* Phenotype index (0..5) matching prototype_clinical_reports.py */
    double max_aud = aud_hl[0];
    for (int f = 1; f < 10; f++) if (aud_hl[f] > max_aud) max_aud = aud_hl[f];
    int aud_elev = (d_aud > G.M.p90_aud_db) ? 1 : 0;
    int ohc_elev = (d_ohc > G.M.p90_ohc_db || hf_ohc >= 15.0) ? 1 : 0;
    int neu_elev = (d_neu > G.M.p90_neural_db && (d_neu - 1.28 * se_tot) > 0.3) ? 1 : 0;
    int neu_sev  = (d_neu > q_max(G.M.p95_neural_db, 3.2)) ? 1 : 0;

    int pheno_id = 4;
    if (!aud_elev && !ohc_elev && !neu_elev && emp_pc >= G.M.nh_pc_p05) pheno_id = 0;
    else if (pta_124 <= 20.0 && max_aud <= 25.0 && (neu_elev || emp_pc < G.M.nh_pc_p05)) pheno_id = 1;
    else if (pta_124 <= 20.0 && max_aud > 25.0 && neu_elev) pheno_id = 2;
    else if ((aud_elev || ohc_elev) && !neu_elev) pheno_id = 3;
    else if ((aud_elev || ohc_elev) && neu_sev) pheno_id = 5;
    else pheno_id = 4;

    /* Populate G.out_buf */
    G.out_buf[0]  = tot_trials;
    G.out_buf[1]  = (double)has_elc;
    G.out_buf[2]  = (double)qcls_valid;
    G.out_buf[3]  = pta_124;
    G.out_buf[4]  = lf_pta;
    G.out_buf[5]  = hf_pta;
    G.out_buf[6]  = emp_pc;
    G.out_buf[7]  = unk_pct;
    G.out_buf[8]  = G.M.pc_nh0 * 100.0;
    G.out_buf[9]  = pc_aud * 100.0;
    G.out_buf[10] = pc_per * 100.0;
    G.out_buf[11] = pc_ful * 100.0;
    G.out_buf[12] = pc_quiet * 100.0;
    G.out_buf[13] = d_tot;
    G.out_buf[14] = se_tot;
    G.out_buf[15] = d_aud;
    G.out_buf[16] = d_ohc;
    G.out_buf[17] = d_neu;
    G.out_buf[18] = se_tot;
    G.out_buf[19] = 100.0 * q_min(eff_lf, 1.0);
    G.out_buf[20] = 100.0 * q_min(eff_hf, 1.0);
    G.out_buf[21] = hf_ohc;
    G.out_buf[22] = hf_ihc;
    G.out_buf[23] = hf_erb;
    G.out_buf[24] = cu5_aud_diff;
    G.out_buf[25] = dyn_lf;
    G.out_buf[26] = dyn_hf;
    G.out_buf[27] = slope_cu_db;
    G.out_buf[28] = cu50_hf;
    G.out_buf[29] = rtr_v;
    G.out_buf[30] = rtr_m;
    G.out_buf[31] = rtr_p;
    G.out_buf[32] = (double)pheno_id;
    G.out_buf[33] = kappa;

    for (int f = 0; f < 10; f++) {
        G.out_buf[40 + f] = aud_spl[f];
        G.out_buf[50 + f] = hl_ohc[f];
        G.out_buf[60 + f] = hl_ihc[f];
        G.out_buf[70 + f] = erb_x[f];
    }
    const int rem_idx[4] = {1, 3, 5, 7};
    for (int k = 0; k < 4; k++) {
        int rf = rem_idx[k];
        G.out_buf[80 + k] = qcls_valid ? elc[rf][2] : -999.0; /* CU 15 */
        G.out_buf[84 + k] = qcls_valid ? elc[rf][4] : -999.0; /* CU 25 */
        G.out_buf[88 + k] = qcls_valid ? elc[rf][9] : -999.0; /* CU 50 */
    }
    for (int i = 0; i < 10; i++) {
        for (int j = 0; j < 11; j++) {
            G.out_buf[95  + i * 11 + j] = smoothed_ccm[i][j];
            G.out_buf[205 + i * 11 + j] = mu_bio[i][j];
        }
    }

    /* ==================================================================
     * 7. qPRO-Rx (Option A): Individualized qCLS Loudness-Mapping +
     *    Speech-in-Noise Guardrails Prescription & Predicted Aided qVCV
     * ================================================================== */
    const double l_ff65[10] = {55.5, 58.0, 56.5, 54.0, 52.0, 49.5, 46.5, 44.0, 41.0, 38.0};
    const double reug[10]   = { 1.0,  2.0,  3.0,  3.5,  5.5, 11.5, 15.5, 13.5,  6.5,  3.0};
    const double nal_kf[10] = {-10.0, -6.0, -2.0,  0.0,  1.5,  2.5,  3.0,  2.5,  0.0, -2.0};
    const double lf_usom_wt[3] = {1.0, 0.75, 0.40};

    int rx_amp = (pta_124 > 20.0 || hf_pta >= 25.0 || max_aud > 25.0) ? 1 : 0;
    double rx_mpo[10], rx_ig50[10], rx_ig65[10], rx_ig80[10];
    double rx_rear50[10], rx_rear65[10], rx_rear80[10], rx_cr[10], rx_reur65[10];
    double max_usom_cut = 0.0, max_hf_desens = 0.0;

    for (int f = 0; f < 10; f++) {
        rx_reur65[f] = l_ff65[f] + reug[f];
        /* MPO Ceiling anchored to patient CU 50 when valid */
        if (qcls_valid && !q_isnan_s(elc[f][9])) {
            rx_mpo[f] = q_clip(elc[f][9], 85.0, 120.0);
        } else if (qcls_valid && f == 9 && !q_isnan_s(elc[8][9])) {
            rx_mpo[f] = q_clip(elc[8][9], 85.0, 120.0);
        } else {
            rx_mpo[f] = q_clip(96.0 + 0.35 * q_max(aud_hl[f], 0.0), 96.0, 118.0);
        }
    }

    if (!rx_amp) {
        for (int f = 0; f < 10; f++) {
            rx_ig50[f] = 0.0; rx_ig65[f] = 0.0; rx_ig80[f] = 0.0;
            rx_rear50[f] = (l_ff65[f] - 15.0) + reug[f];
            rx_rear65[f] = l_ff65[f] + reug[f];
            rx_rear80[f] = (l_ff65[f] + 15.0) + reug[f];
            rx_cr[f] = 1.0;
        }
    } else {
        for (int f = 0; f < 10; f++) {
            double hl_pos = q_max(aud_hl[f], 0.0);
            /* Smooth gate so normal-threshold bands (<=15 dB HL) receive 0 dB gain */
            double thr_gate = q_clip((hl_pos - 15.0) / 10.0, 0.0, 1.0);

            /* Audiogram NAL-style baseline fallback */
            double ga65 = thr_gate * q_max(0.0, 0.31 * hl_pos + 0.15 * (pta_124 - 20.0) + nal_kf[f]);
            double ga50 = thr_gate * q_max(0.0, ga65 + 0.15 * q_max(hl_pos - 15.0, 0.0));
            double ga80 = thr_gate * q_max(0.0, ga65 - 0.16 * q_max(hl_pos - 15.0, 0.0));

            double g50 = ga50, g65 = ga65, g80 = ga80;
            int f_elc = f;
            if (qcls_valid && f == 9 && q_isnan_s(elc[9][4]) && !q_isnan_s(elc[8][4])) {
                f_elc = 8;
            }
            if (qcls_valid && !q_isnan_s(elc[f_elc][0]) && !q_isnan_s(elc[f_elc][9])) {
                const double *ynh_f = &G.M.y_nh_elc[f_elc * 10];
                const double *ypat_f = elc[f_elc];
                double s50 = l_ff65[f] - 15.0 + 4.0;
                double s65 = l_ff65[f] + 4.0;
                double s80 = l_ff65[f] + 15.0 + 4.0;

                double cu50_nh = q_elc_cu_at_spl(ynh_f, s50);
                double cu65_nh = q_elc_cu_at_spl(ynh_f, s65);
                double cu80_nh = q_elc_cu_at_spl(ynh_f, s80);

                double gc50 = thr_gate * 0.80 * q_max(0.0, q_elc_spl_at_cu(ypat_f, cu50_nh) - s50);
                double gc65 = thr_gate * 0.70 * q_max(0.0, q_elc_spl_at_cu(ypat_f, cu65_nh) - s65);
                double gc80 = thr_gate * 0.54 * q_max(0.0, q_elc_spl_at_cu(ypat_f, cu80_nh) - s80);

                if (f == 9 && f_elc == 8 && q_max(aud_hl[8], 1.0) > 5.0) {
                    double ratio_8_6 = q_clip(hl_pos / q_max(aud_hl[8], 10.0), 0.7, 1.25);
                    gc50 *= ratio_8_6; gc65 *= ratio_8_6; gc80 *= ratio_8_6;
                }
                g50 = 0.75 * gc50 + 0.25 * ga50;
                g65 = 0.75 * gc65 + 0.25 * ga65;
                g80 = 0.75 * gc80 + 0.25 * ga80;
            }

            /* Guardrail 1: Upward-Spread-of-Masking (USOM) Low-Frequency Cut (<1 kHz) */
            if (f < 3 && (hf_ohc >= 15.0 || (hf_pta - lf_pta) >= 18.0)) {
                double usom_fac = q_clip(q_max((hf_ohc - 12.0) / 36.0, (hf_pta - lf_pta - 15.0) / 55.0), 0.0, 0.52);
                double cut_mult = 1.0 - usom_fac * lf_usom_wt[f];
                double before65 = g65;
                g50 *= cut_mult; g65 *= cut_mult; g80 *= cut_mult;
                if (before65 - g65 > max_usom_cut) max_usom_cut = before65 - g65;
            }

            /* Guardrail 2: Suprathreshold Clarity Desensitization Ceiling (>=3 kHz) */
            if (f >= 6 && d_neu > 3.0 && hl_pos >= 55.0) {
                double des_mult = q_clip(1.0 - 0.07 * (d_neu - 3.0) * ((hl_pos - 55.0) / 25.0), 0.62, 1.0);
                double before65 = g65;
                g65 *= des_mult; g80 *= des_mult;
                if (before65 - g65 > max_hf_desens) max_hf_desens = before65 - g65;
            }

            /* Convert to ear-canal REAR & enforce CU 50 MPO headroom + CR <= 2.8:1 */
            double u50 = (l_ff65[f] - 15.0) + reug[f];
            double u65 = l_ff65[f] + reug[f];
            double u80 = (l_ff65[f] + 15.0) + reug[f];

            double r80 = q_min(u80 + g80, rx_mpo[f] - 4.0);
            if (r80 < u80) r80 = u80;
            /* Enforce max CR <= 2.8:1 => r80 - r50 >= 10.7 dB */
            double r50 = q_min(u50 + g50, r80 - 10.7);
            if (r50 < u50) r50 = u50;
            if (r80 < r50 + 10.7) r80 = q_min(rx_mpo[f] - 2.0, r50 + 10.7);

            double r65 = q_clip(u65 + g65, r50 + 4.5, r80 - 4.5);
            if (r65 < u65) r65 = u65;

            rx_rear50[f] = r50;
            rx_rear65[f] = r65;
            rx_rear80[f] = r80;
            rx_ig50[f] = q_max(0.0, r50 - u50);
            rx_ig65[f] = q_max(0.0, r65 - u65);
            rx_ig80[f] = q_max(0.0, r80 - u80);
            rx_cr[f]   = q_clip(30.0 / q_max(r80 - r50, 10.7), 1.0, 2.8);
        }
    }

    int rx_vent = 0;
    if (rx_amp) {
        if (lf_pta <= 26.0) rx_vent = 1;       /* Open Dome / >=2.5 mm Vent */
        else if (lf_pta <= 45.0) rx_vent = 2;  /* Vented Tulip / 1.5-2.0 mm Vent */
        else rx_vent = 3;                      /* Custom Occluding / Power Mold */
    }
    int rx_slow_wdrc = (neu_elev || rtr_p < 75.0 || rtr_m < 75.0 || hf_ohc >= 22.0) ? 1 : 0;

    /* Simulate Predicted Aided qVCV (%) with prescribed IG65 + WDRC dynamics */
    double pred_aided_pc = emp_pc;
    if (rx_amp) {
        double mean_cr_hf = 0.25 * (rx_cr[5] + rx_cr[6] + rx_cr[7] + rx_cr[8]);
        double smear_rx = (rx_slow_wdrc ? 0.08 : 0.16) * q_max(mean_cr_hf - 1.05, 0.0);
        double nd_rx[10][2][10], ac_rx[10][2], mat_rx[10][11];
        q_compute_peripheral_features_ex(G.M.ref_snr_db, aud_hl, hl_ohc, rx_ig65, smear_rx, nd_rx, ac_rx);
        q_compute_probs_10x11((const double (*)[2][10])nd_rx, (const double (*)[2])ac_rx, eff_hat, unk_hat, G.M.lapse_rate, mat_rx);
        double s_rx = 0.0;
        for (int c = 0; c < 10; c++) s_rx += mat_rx[c][c];
        pred_aided_pc = 10.0 * s_rx;
    }
    double d_eq_rx = q_eq_snr_deficit_db(pred_aided_pc / 100.0);
    double pred_snr_benefit = d_tot - d_eq_rx;

    int rx_dir = 0;
    if (neu_elev || (rx_amp && pred_aided_pc < 76.0)) rx_dir = 2; /* Beamformer + Remote Mic */
    else if (d_tot > G.M.p90_total_db) rx_dir = 1;                /* Adaptive Directional */

    G.out_buf[315] = (double)rx_amp;
    G.out_buf[316] = pred_aided_pc;
    G.out_buf[317] = pred_snr_benefit;
    G.out_buf[318] = (double)rx_vent;
    G.out_buf[319] = (double)rx_slow_wdrc;
    G.out_buf[320] = (double)rx_dir;
    G.out_buf[321] = max_usom_cut;
    G.out_buf[322] = max_hf_desens;

    for (int f = 0; f < 10; f++) {
        G.out_buf[325 + f] = rx_rear50[f];
        G.out_buf[335 + f] = rx_rear65[f];
        G.out_buf[345 + f] = rx_rear80[f];
        G.out_buf[355 + f] = rx_mpo[f];
        G.out_buf[365 + f] = rx_ig50[f];
        G.out_buf[375 + f] = rx_ig65[f];
        G.out_buf[385 + f] = rx_ig80[f];
        G.out_buf[395 + f] = rx_cr[f];
        G.out_buf[405 + f] = rx_reur65[f];
    }
    return 0;
}

/* Helper to map an aided qVCV % score onto NH-equivalent SNR deficit (dB) */
QPRO_EXPORT("qpro_eq_snr_deficit")
double qpro_eq_snr_deficit(double pc_pct) {
    return q_eq_snr_deficit_db(pc_pct / 100.0);
}
