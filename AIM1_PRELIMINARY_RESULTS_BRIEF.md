# Updated Preliminary Results Briefing for Grant Proposal (`qCLS` + `qVCV` + `qPRO` / `qPRO-Rx`)

**Purpose:** Updated technical & quantitative handoff (Nov 20, 2026) for the *Preliminary Studies* and *Approach* sections of the grant proposal, incorporating:
1. Blind external electroacoustic & behavioral validation against Audioscan Verifit `NAL-NL2` targets and lab-fitted hearing aids (`qVCV_HAfit.xlsx`, `n = 19` Verifit ears / `n = 18` aided outcome ears),
2. Frequency-specific **soft-speech compression kneepoints (`CT`, `dB SPL`)** now implemented and live in `qPRO-Rx` (`http://audres.org/qPRO/`),
3. Mechanistic analysis of **aided rollover prevention (`HL048`)** and **proximal loudness restoration vs. functional speech-clarity guardrails**, and
4. Deployed clinical workflow updates across `audres.org/qCLS/`, `audres.org/qVCV/` (Dual-Mode Fixed + Adaptive SNR), and `audres.org/qPRO/`.

---

## 1. Core Conceptual Framing for the Grant Text

Keep a sharp two-tier distinction throughout *Significance* and *Approach*:
- **Proximal Electroacoustic Objective (`qCLS`):** Restore individualized loudness perception across soft, conversational, and loud speech by mapping measured `qCLS` equal-loudness contours (`CU 5–50`) onto frequency-specific **soft-speech compression kneepoints (`CT` near `CU 10`)**, **Real-Ear Aided Response targets (`REAR 50 / 65 / 80 dB SPL`)**, **compression ratios (`CR`)**, and **`CU 50` Maximum Power Output (`MPO`) ceilings**.
- **Governing Functional Goal (`qVCV`):** Maximize consonant recognition in noise by constraining loudness-mapped amplification with **speech-clarity guardrails**: (a) low-frequency (`<1 kHz`) upward-spread-of-masking cuts when high-frequency `OHC` loss/filter broadening is elevated, (b) `CR <= 2.8:1` caps to preserve spectral-temporal modulation contrast, (c) slow-acting WDRC release (`>= 400 ms`) when manner/place/clarity cues are degraded, and (d) pre-fitting identification of suprathreshold clarity ceilings requiring directional or remote-microphone `SNR` support.

---

## 2. Operational WebAssembly Clinical Prototypes (De-Risking Feasibility)

All three browser-based C99/WebAssembly booth tools are live (`<20 ms` local compute, zero PHI transmitted externally) with clinician-requested interrupt-safe **Pause / Resume / Restart** controls:
1. **`qCLS` (`http://audres.org/qCLS/`):** Bayesian multi-frequency categorical loudness scaling (`0.25–8 kHz`, `CU 5–50`) with audiogram-informed prior initialization and calibrated `ER-3A` RETSPL tables. *(Also compiled locally in `qcls_core.c` for Aim 1 prospective testing: **`5TC-lin`**, a linearly spaced Schroeder-negative 5-tone complex with crest factor **`CF = 1.86 < 2`** vs. **`CF = 3.14`** for zero-phase geometric `5TC-log`, providing `~4.5 dB` cleaner peak headroom near `CU 45–50`.)*
2. **Dual-Mode `qVCV` (`http://audres.org/qVCV/`):** Supports both Standard Fixed-SNR (`100` trials) and Real-Time Hierarchical Bayesian Adaptive-SNR (`50` or `100` trials) with circular LTASS noise, true stereo ear routing, `<80%` `60 dB SNR` clear-speech QC gating, Plomp audibility/clarity split, and Miller–Nicely Voicing/Manner/Place information transmission.
3. **`qPRO` & `qPRO-Rx` (`http://audres.org/qPRO/`):** 1-page diagnostic interpreter (`Max |WASM - Python| = 0.020 dB` across all `98` listeners) and real-ear WDRC prescription sheet outputting **`REAR 50/65/80`**, **`IG 50/65/80`**, **`CT` (`dB SPL`)**, **`CR`**, and **`CU 50` `MPO`** across `250–8000 Hz`.

---

## 3. Verified Quantitative Preliminary Results (`qtest_dataset`)

### A. Archival Cohort (`N = 98` Unaided Ears; `93/94` Valid `qCLS`; `67` Aided Sessions)
- **Wide Recruitment Heterogeneity at Matched Audiograms:** High-frequency (`3–8 kHz`) `qCLS` dynamic range (`CU 50 − CU 5`) spans **`34.1 to 118.9 dB`** (`>3.4×` range; median `71.6 dB`, IQR `56.8–84.0 dB`) among hearing-impaired ears with comparable Mild–Moderate pure-tone thresholds.
- **Automated `qCLS` Profile QC:** `93 / 94` (`98.9%`) archival `qCLS` matrices passed monotonicity QC (`HL062` automatically flagged); uninitialized archival `CU 5` vs. RETSPL threshold offset (`-8.3 ± 9.7 dB`) directly motivates Aim 1's audiogram-informed Bayesian prior initialization.
- **Three-Way Suprathreshold `SNR` Loss Partition:**
  - **`53%` (`52/98`):** Speech-in-noise deficit explained by peripheral audibility and `qCLS` recruitment (strong amplification responders; e.g., **`HL068`**, `PTA = 43.3 dB HL`, `HF DR = 46 dB`: `64.0%` unaided → `85–88%` observed aided vs. `84.1%` `qPRO-Rx` predicted).
  - **`11%` (`11/98`):** Recruitment compounded by marked suprathreshold clarity loss (`>+3.7 dB SNR`), creating an aided clarity ceiling despite matched audiograms (e.g., **`HL030`**, `PTA = 48.3 dB HL`, clarity loss `+8.8 dB`: `42.0%` unaided → `46–49%` observed aided vs. `46.9%` predicted — guiding early remote-microphone counseling).
  - **`5%` (`5/98`):** Repeatable speech-in-noise clarity loss with clinically normal audiograms (`PTA <= 20 dB HL`; e.g., **`HL045`**, all thresholds `<= 20 dB HL`, `qVCV = 83.5%`, `+7.9 dB` `SNR` loss).

### B. Individualized Compression Kneepoint (`CT`) Physics & Aided Rollover (`HL048`)
- Composing $L_{\text{out}}(L_{\text{in}}) = L_{\text{HI}}(CU_{\text{NH}}(L_{\text{in}}))$ via a continuous bilinear hinge fit (`1:1` below `CT`, compressed above `CT` across `CU 5–40`) places the lower compression kneepoint **`CT` near `CU 10` (`~36–40 dB SPL`)**, bounded above an ambient room-noise floor (`42 dB` at `250 Hz`, `39 dB` at `500 Hz`, `36 dB SPL` at `0.75–8 kHz`), whereas the `CU 25` (`~75–85 dB SPL`) loudness inflection corresponds to high-level return toward linearity rather than the soft-speech kneepoint.
- **Mechanistic Rollover Case (`HL048`):** Mild low/mid thresholds (`PTA = 28.3 dB HL`, wide LF/mid dynamic range) with steep high-frequency loss (`HF-PTA = 51.2 dB HL`). Physical Lab-Aid amplification caused **aided rollover** from **`78.5%` unaided down to `68.0%` aided**, driven by **`10/10 S → T` sibilant collapse** and **`5/10 G → D` burst confusions** (excess LF/mid fast WDRC upward masking + insufficient `6–8 kHz` fricative audibility). `qPRO-Rx` prevents this by prescribing higher mid-band `CT` (`41–45 dB SPL`), near-linear slow-release WDRC (`CR = 1.06:1` at `2 kHz`), and verified `6–8 kHz` `REAR` targets (`83.5%` predicted aided).

### C. Blind External Validation vs. Audioscan Verifit `NAL-NL2` & Lab-Fitted Outcomes (`qVCV_HAfit.xlsx`)
Evaluated **blindly with zero parameter tuning** on the independent real-ear verification spreadsheet (`qVCV_HAfit.xlsx`):
- **Electroacoustic Agreement with Verifit `NAL-NL2` (`n = 19` ears, `128` band-ears across `250–6000 Hz`):**
  - **`r = 0.858`** (`0.86`), **Mean Bias = `+0.19 dB`** (`-0.01 dB` on 4-frequency speech average `0.5/1/2/4 kHz`), band `MAE = 3.72 dB`, `4FA MAE = 3.07 dB`.
  - **`84.2%` (`16/19`) of 4-frequency speech averages fall within the standard `±5 dB` clinical probe-mic verification tolerance**—matching Verifit targets on average as closely as audiologist-verified Lab Aids (`r = 0.878`, `76.2% <= ±5 dB`) while individualizing `CT`, `CR`, and `CU 50` `MPO` from patient loudness scaling.
- **Physical Under-Fitting in Measured Aids (`n = 18` Lab Aids, `126` band-ears):**
  - Lab Aids under-shot conversational targets at `0.5–1 kHz` by `-3.7` to `-5.4 dB` (open-dome vent leakage) and at `4 kHz` by `-4.3 dB` (receiver roll-off); Personal Aids under-amplified conversational speech by **`-11.7 dB`**.
- **Behavioral Prediction of Aided `qVCV` (`n = 18` Lab-Aid ears):**
  - When physical Lab-Aid `4FA REAR 65` matched `qPRO-Rx` within `<= 5.5 dB` (`n = 13/18`), `qPRO-Rx` predicted observed aided `qVCV` at **`r = 0.894` (`MAE = 6.28%`; `79.8%` observed vs. `83.8%` predicted)**.
  - When physical Lab Aids under-amplified by `> 5.5 dB` (`n = 5/18`, mean shortfall `-8.6 dB`), observed aided `qVCV` fell **`24` percentage points** (`56.4%` observed vs. `80.5%` `qPRO-Rx` predicted potential; `r = 0.54` between `REAR 65` shortfall and `qVCV` loss).

---

## 4. Updated Grant-Framing Guardrails (What Remains for the Funded Aims!)

**Important correction from the Nov 16 brief:** Individualized frequency-specific `CT` (`dB SPL`) *has now been implemented* in `qPRO-Rx` (`qpro_core.c` / WebAssembly). Therefore, **do NOT state that `CT` derivation is unimplemented in software**. Instead, frame the prospective research gaps across the Aims as follows:
1. **Prospective `qCLS` Stimulus & Clinical Validation (Aim 1):** Prospectively validating the low-crest-factor **`5TC-lin` (`CF = 1.86`)** Schroeder-negative stimulus vs. `5TC-log` (`CF = 3.14`) at high levels (`CU 45–50`), quantifying older-adult test–retest reliability and boundary sampling under audiogram priors, evaluating commercial Bluetooth vs. `ER-3A` delivery, and **verifying physical electroacoustic match-to-target (`CT`, `REAR 50/65/80`, `CR`, `CU 50` `MPO`) on commercial hearing aids in coupler and real-ear probe-mic measurements**.
2. **Prospective Adaptive-SNR `qVCV` Stopping & Precision Rules (Speech-in-Noise Aim):** Early pilot Dual-Mode `qVCV` testing by clinical audiologist Co-I Sara Harris showed meaningful divergence between `50` and `100` adaptive trials in an initial listener—directly motivating prospective determination of trial-count / posterior-precision stopping rules (`50`-trial rapid `SNR` screen vs. `100`-trial confusion-matrix resolution for consonant-specific fitting guardrails).
3. **Prospective Phenotype-Stratified Crossover Trial (`qPRO-Rx` vs. Standard `NAL-NL2`):** Testing whether `qPRO-Rx` improves loudness comfort and speech-in-noise recognition in recruiting (`HL068`-like) and rollover-prone (`HL048`-like) ears while prospectively validating pre-fitting stratification of clarity-ceiling (`HL030`-like) ears for assistive `SNR` technology.
