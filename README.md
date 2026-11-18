# qPRO — Quick Suprathreshold Profile (WebAssembly Clinical Tool)

**qPRO** is a zero-server, 100% client-side C99 / WebAssembly clinical interpreter that synthesizes an individual patient's **Pure-Tone Audiogram (`0.25–8 kHz`)**, **`qCLS` Categorical Loudness Contours (`CU 5–50`)**, and **`qVCV` Consonant-in-Noise Test** (unaided + optional aided/contralateral runs) into a single US Letter Landscape audiologist report.

## Architecture

- **`bake_qpro_model_h.py` → `qpro_model.h` & `qpro_demo_cases.js`:** Pre-bakes the `20 × 10` waveform VCV acoustic cues, calibrated biophysical model constants, Normal-Hearing reference curve & `90th/95th` percentile cutoffs, BTNRH `RETSPL` tables (`er3a`, `legacy`, `ansi`), and 6 anonymized `qtest_dataset` clinical demo cases (`NH013`, `HL045`, `HL011`, `HL068`, `HL030`, `HL048`).
- **`qpro_core.c` → `qpro_core.wasm` (~`59 KB`) + `qpro_core.js`:** Pure C99 compute engine executing the 3-stage biophysical forward pass, BFGS MAP clarity estimation, 36-draw `SplitMix64` parametric bootstrap (`± 1 SE`), Empirical-Bayes `10 × 11` confusion smoothing, and Miller–Nicely `Voicing / Manner / Place` transmission in **`~11–20 ms`** in browser WebAssembly. Includes an embedded `file://` base64 fallback so `index.html` also works when opened directly from disk offline.
- **`index.html` + `qpro_report_svg.js` + `guide.html`:** Vector SVG `3 × 2` US Letter Landscape clinical report with `@media print` vector PDF export, `qCLS` `localStorage` (`qcls_sessions`) auto-import, CSV uploaders, Ear (`Right O` / `Left X`) & Binaural Asymmetry checks, Top-Down Clinical Audiogram orientation toggle, and direct `0.5/1/2/4 kHz` Verifit/REM `Comfort (CU 25)` & `MPO Cap (CU 50)` targets.

## Build & Parity Verification

```bash
make bake   # Regenerate qpro_model.h and qpro_demo_cases.js
make all    # Compile qpro_core.c -> qpro_core.wasm + qpro_core.js
make test   # Verify < 0.05 dB parity & 98/98 phenotype agreement vs. Python across qtest_dataset
```
