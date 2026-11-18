# Preliminary Results Briefing for Grant Proposal: `qCLS` + `qPRO` Prototype

**Purpose:** Self-contained technical & quantitative handoff for drafting the *Preliminary Studies* / *Approach* sections of **Aim 1** (and any subsequent Speech-in-Noise / Aided Outcome Aims), based on the completed **`qCLS`** and **`qPRO` (*Quick Suprathreshold Profile*)** clinical WebAssembly prototypes and retrospective analysis of the **`qtest_dataset` human cohort (`N = 98` unaided listeners; `94` with paired `qCLS`; `67` aided sessions)**.

---

## 1. Summary of Operational Software Prototypes

1. **Browser-Based Clinical `qCLS` Engine (`/Users/neely/Library/CloudStorage/OneDrive-FatherFlanagan'sBoysHome/STN/2026_Quick_Tests/Web_Apps/qCLS/`):**
   - Implemented in standard C99 compiled to client-side WebAssembly (`qcls_core.c` → `qcls_core.wasm`, `~54 KB`), running 100% locally in the browser with zero PHI transmitted over the network.
   - Already incorporates **audiogram-informed Bayesian prior initialization** (`_qcls_audiogram_prior`), calibrated **BTNRH Etymotic ER-3A RETSPL** lookup tables (`250–8000 Hz`), 21-model anchor-frequency Bayesian adaptive tracking / Laplace-GP tracking, and 5-component PCA/MCPF post-hoc contour fitting (`CU 5` through `CU 50` across frequency).

2. **`qPRO` Clinical Interpretation & Direct `qCLS`-to-WDRC Prescription Tool (`/Users/neely/Library/CloudStorage/OneDrive-FatherFlanagan'sBoysHome/STN/2026_Quick_Tests/Web_Apps/qPRO/`, live at `http://audres.org/qPRO`):**
   - Pure C99 / WebAssembly clinical engine (`qpro_core.c` → `qpro_core.wasm`, `~69 KB`) executing in **`10–25 ms` per ear** in the browser (`Max |WASM − Python| = 0.020 dB` across all 98 human listeners).
   - Ingests `qCLS` Equal-Loudness Contours (`CU 5–50`), the pure-tone audiogram (`0.25–8 kHz`), and optional `qVCV` speech-in-noise runs to generate:
     1. **Automated Profile Quality-Control (`QC`) Cross-Checks**, and
     2. **An Individualized Multiband WDRC Prescription (`qPRO-Rx`)** outputting Real-Ear Aided Response targets (`REAR 50 / 65 / 80 dB SPL` ISTS speech), Insertion Gain (`IG 50 / 65 / 80 dB`), channel Compression Ratios (`CR`), and `CU 50`-anchored **Maximum Power Output (`MPO`, `dB SPL`)** across `250–8000 Hz`.

---

## 2. Verified Preliminary Cohort Findings Supporting **Aim 1** (`qtest_dataset`)

### A. Scientific Premise: Wide Inter-Individual Recruitment Variability Invisible to Audiogram-Only Formulas
- Across hearing-impaired listeners in `qtest_dataset` with valid `qCLS` contours, **high-frequency loudness dynamic range (`CU 50 − CU 5` averaged over `3–8 kHz`) spans a >3.4-fold range from `34.1 dB` to `118.9 dB`** (median `71.6 dB`, interquartile range `56.8–84.0 dB`), even among listeners within the same Mild-to-Moderate pure-tone category.
- Standard threshold-based prescriptions (e.g., NAL-NL2, DSL v5) assign identical compression ratios and estimated UCLs to ears with matching audiograms despite `>50 dB` differences in measured residual dynamic range—motivating Aim 1's direct `qCLS` contour-to-WDRC mapping.

### B. Feasibility of Automated `qCLS` Profile Quality Control (`QC`)
- Applying `qPRO`'s initial automated QC rules across the `94` archival paired `qCLS` listener profiles in `qtest_dataset`:
  - **`93 / 94` (`98.9%`) yielded monotonic, usable equal-loudness contour matrices** (`min[CU 50 − CU 5] >= 8 dB` and `CU 5 <= 130 dB SPL`).
  - Automated monotonicity checking isolated the `1 / 94` (`1.1%`) corrupted/non-monotonic contour fit (`HL062`) without manual chart inspection.
  - Cross-checking uninitialized archival `qCLS` softest-level contours (`CU 5`) against RETSPL-converted pure-tone thresholds revealed a mean offset of `-8.3 dB` with **`SD = 9.7 dB`** (`57%` within `±10 dB`). This variance in uninitialized archival runs **directly motivates Aim 1's audiogram-informed initialization, calibrated transducer/Bluetooth verification, and prospective boundary-sampling QC criteria**.

### C. Proof-of-Concept of Direct `qCLS`-to-WDRC Mapping (`qPRO-Rx`)
- Across the `n = 61` hearing-impaired listeners meeting amplification criteria with valid `qCLS` contours, the prototype `qPRO-Rx` rule maps `CU 5–50` loudness contours onto clinically realistic, verifiable multiband parameters (e.g., at `4 kHz`: **`IG65` range `0.0–32.9 dB`, median `15.0 dB`; `CR` range `1.00 : 1` to `2.80 : 1`, median `1.55 : 1`; `CU 50` `MPO` cap range `101–120 dB SPL`, median `114 dB SPL`**).
- Illustrative contrasting human cases from `qtest_dataset` (available in `/Users/neely/Library/CloudStorage/OneDrive-FatherFlanagan'sBoysHome/STN/2026_Quick_Tests/Web_Apps/qVCV/sim/clinical_reports/QuickTests_6_Clinical_Case_Examples.pdf`):
  - **`HL068` (`PTA = 43.3 dB HL`, steep recruitment, HF dynamic range `46 dB`):** `qCLS` prescribes `CR = 2.05 : 1` at `2 kHz`, `IG65 = 18–27 dB` (`2–6 kHz`), `-4.0 dB` low-frequency upward-masking relief, and a patient-specific `CU 50` `MPO` cap of `112–116 dB SPL`.
  - **`HL048` (`PTA = 28.3 dB HL`, HF-PTA `51.2 dB HL`, wider dynamic range):** `qCLS` prescribes near-linear compression (`CR = 1.06 : 1` at `2 kHz`) to preserve consonant-to-vowel envelope contrast while capping HF `MPO` at `CU 50`.

---

## 3. Optional Preliminary Results for Subsequent Speech-in-Noise / Aided Aims (`qCLS + qVCV`)

*(Note for grant drafting: Keep `qVCV` results out of Aim 1 if Aim 1 focuses strictly on `qCLS` workflow and WDRC prescription; use these for Speech-in-Noise / Suprathreshold Phenotyping / Aided Outcome Aims.)*

- Combining the pure-tone audiogram, `qCLS` OHC/IHC partition, and `qVCV` consonant-in-noise recognition across all `98` listeners (`cohort_98_clinical_interpretation.csv`) separates total Estimated SNR Loss (`dB`) into **Inaudibility**, **Loudness Recruitment / Upward Masking**, and **Suprathreshold Clarity Loss**:
  - **`53%` (`52/98`)** have speech-in-noise deficits fully explained by peripheral audibility and `qCLS`-measured recruitment (strong amplification responders, e.g., `HL068`: `64%` unaided → `84.1%` predicted aided vs. `85–88%` observed aided).
  - **`11%` (`11/98`)** have recruitment compounded by marked suprathreshold clarity loss (`> +3.7 dB SNR`), predicting an aided clarity ceiling (`HL030`: `42%` unaided → `46.9%` predicted aided vs. `46–49%` observed aided).
  - **`5%` (`5/98`)** exhibit repeatable suprathreshold clarity loss despite clinically normal `PTA <= 20 dB HL` (`HL045`: all thresholds `<= 20 dB HL`, `+7.9 dB` SNR loss).

---

## 4. Critical Grant-Framing Guardrail (What Remains for **Aim 1** to Establish)

To prevent study-section reviewers from misconstruing Aim 1 as "already completed," frame `qCLS` + `qPRO` explicitly as **computational and retrospective proof-of-concept** while emphasizing the four prospective advances required in **Aim 1**:

1. **Prospective Clinical Validation in Older Adults with ARHL:** Quantifying completion time, usable-profile rate, test–retest reliability, tolerability, and agreement with conventional loudness scaling under audiogram-informed initialization.
2. **Commercial Hearing-Aid Bluetooth Delivery Pathway:** Evaluating wireless streaming through commercial hearing aids alongside the calibrated insert-earphone reference pathway.
3. **Prospective Locking of Sampling, Reliability & Safety QC Thresholds:** Replacing initial heuristic contour checks with prospectively validated criteria for trial-level reliability, adequate sampling near target loudness boundaries, and device/safety output limits.
4. **Full WDRC Parameterization (Including Individualized Kneepoints) & Physical Electroacoustic Verification:** Extending the initial `REAR 50/65/80` + `CR` + `MPO` mapping to derive **individualized multiband linear gain and compression kneepoints (`CT`)** and verifying physical match-to-target (`REAR` and `RESR` MPO) on commercial hearing aids in a coupler / real ear to satisfy the Aim 1 Milestone.

---

## 5. Key Local File Paths for Reference or Figure Generation

- **Combined 7-Page Landscape Case Booklet (PDF):**
  `/Users/neely/Library/CloudStorage/OneDrive-FatherFlanagan'sBoysHome/STN/2026_Quick_Tests/Web_Apps/qVCV/sim/clinical_reports/QuickTests_6_Clinical_Case_Examples.pdf`
- **98-Listener Normative & Phenotype Summary Table (CSV):**
  `/Users/neely/Library/CloudStorage/OneDrive-FatherFlanagan'sBoysHome/STN/2026_Quick_Tests/Web_Apps/qVCV/sim/clinical_reports/cohort_98_clinical_interpretation.csv`
- **`qPRO` WebAssembly Source & Prescription Engine:**
  `/Users/neely/Library/CloudStorage/OneDrive-FatherFlanagan'sBoysHome/STN/2026_Quick_Tests/Web_Apps/qPRO/qpro_core.c`
- **Live Deployed Prototype:**
  `http://audres.org/qPRO`
