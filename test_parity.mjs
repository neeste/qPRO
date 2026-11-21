#!/usr/bin/env node
/**
 * test_parity.mjs
 *
 * Automated end-to-end parity verification of qpro_core.js + qpro_core.wasm
 * against the Python reference table (cohort_98_clinical_interpretation.csv)
 * across all 98 human listeners in qtest_dataset.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load baked demo & normative globals:
const demoJs = fs.readFileSync(path.join(__dirname, "qpro_demo_cases.js"), "utf8");
globalThis.window = globalThis;
new Function(demoJs)();

const QProEngine = require("./qpro_core.js");

const wasmBytes = fs.readFileSync(path.join(__dirname, "qpro_core.wasm"));
await QProEngine.init(wasmBytes);

// Test all 6 baked demo cases first:
for (const d of globalThis.QPRO_DATA.demos) {
  const rep = QProEngine.evaluate({
    listenerId: d.id,
    group: d.group,
    ear: d.ear,
    transducer: d.transducer,
    practicePc: d.practice_pc,
    audiogramHL: d.audiogram_hl,
    elc10x10: d.elc_10x10,
    countsS1: d.counts_s1,
    countsS2: d.counts_s2,
    aided: d.aided,
    nBoot: 36,
  });
  console.log(
    `[Demo ${rep.listenerId}] Total=${rep.totalDeficitDb >= 0 ? "+" : ""}${rep.totalDeficitDb.toFixed(1)} ± ${rep.totalDeficitSeDb.toFixed(1)} dB ` +
    `(Aud=${rep.audibilityDeficitDb.toFixed(1)}, OHC=${rep.ohcDeficitDb.toFixed(1)}, Clarity=${rep.neuralDeficitDb.toFixed(1)}) ` +
    `| CT=[${rep.prescription.ctSpl.join(",")}] dB | ${rep.phenotype} | ${rep.elapsedMs} ms`
  );
  if (!Array.isArray(rep.prescription.ctSpl) || rep.prescription.ctSpl.length !== 10 || rep.prescription.ctSpl.some(v => !(v >= 36 && v <= 48))) {
    console.error("FAIL: Invalid ctSpl array:", rep.prescription.ctSpl);
    process.exit(1);
  }
}

// If /tmp/qpro_parity_inputs_98.json exists, verify all 98 listeners < 0.05 dB:
const parityPath = "/tmp/qpro_parity_inputs_98.json";
const refCsvPath = path.join(__dirname, "..", "qVCV", "sim", "clinical_reports", "cohort_98_clinical_interpretation.csv");
if (fs.existsSync(parityPath) && fs.existsSync(refCsvPath)) {
  const inputs98 = JSON.parse(fs.readFileSync(parityPath, "utf8"));
  const lines = fs.readFileSync(refCsvPath, "utf8").trim().split(/\r?\n/);
  const hdr = lines[0].split(",");
  const pyMap = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const obj = {};
    hdr.forEach((h, k) => (obj[h] = cols[k]));
    pyMap[obj.listener_id] = obj;
  }

  let maxErr = 0;
  let phenoAgree = 0;
  for (const r of inputs98) {
    const rep = QProEngine.evaluate({
      listenerId: r.listener_id,
      audiogramHL: r.audiogram_hl,
      elc10x10: r.elc_10x10,
      practicePc: r.practice_pc,
      countsS1: r.counts_s1,
      countsS2: r.counts_s2,
      nBoot: 24,
    });
    const py = pyMap[r.listener_id];
    const err = Math.max(
      Math.abs(rep.totalDeficitDb - parseFloat(py.total_deficit_db)),
      Math.abs(rep.audibilityDeficitDb - parseFloat(py.audibility_deficit_db)),
      Math.abs(rep.ohcDeficitDb - parseFloat(py.ohc_recruitment_deficit_db)),
      Math.abs(rep.neuralDeficitDb - parseFloat(py.neural_coding_deficit_db))
    );
    if (err > maxErr) maxErr = err;
    if (rep.phenotype === py.phenotype) phenoAgree++;
  }
  console.log(`\n98-Listener Parity Check: Max |WASM - Python| = ${maxErr.toFixed(4)} dB | Phenotype Agreement = ${phenoAgree}/98`);
  if (maxErr > 0.05) {
    console.error("FAIL: Max error exceeded 0.05 dB!");
    process.exit(1);
  }
}

/* =========================================================================
 * Extended Automated Tests: Adaptive qVCV CSVs, Test+Retest Merge, Aided
 * Adaptive Benefit, Separate-Ear Contralateral Check, SVG Render, & DOM IDs
 * ========================================================================= */
import assert from "node:assert/strict";

const svgJs = fs.readFileSync(path.join(__dirname, "qpro_report_svg.js"), "utf8");
new Function(svgJs)();

const STIM_CONS = QProEngine.STIM_CONS;
const REF_SNR = [18, 4, 3, 0, 15, 0, 0, 0, 18, 0];

function buildSyntheticAdaptiveCsv({ id, ear, cond, mode, finalLossDb, seDb, hitRate = 0.56 }) {
  const rows = [
    "Trial,Phase,Stimulus,Target,Response,Target_SNR_dB,RT_ms,Running_SNR_Loss_dB,Running_SE_dB,Final_SNR_Loss_dB,Mode,Condition,Ear"
  ];
  for (let i = 0; i < 10; i++) {
    const c = STIM_CONS[i];
    rows.push(`${i + 1},Practice,VCV_a${c.toLowerCase()}a_1,${c},${c},60,520,,,,${mode},${cond},${ear}`);
  }
  const nTrials = mode === "adaptive_100" ? 100 : 50;
  let hits = 0;
  const targetHits = Math.round(nTrials * hitRate);
  for (let t = 0; t < nTrials; t++) {
    const ci = t % 10;
    const c = STIM_CONS[ci];
    const correct = (hits < targetHits) && ((t % 2 === 0) || (nTrials - t <= targetHits - hits));
    if (correct) hits++;
    const resp = correct ? c : STIM_CONS[(ci + 1) % 10];
    /* Adaptive tracker presents near ~56% point (about -6 dB below reference + listener SNR loss) */
    const snrPresented = Math.round(REF_SNR[ci] - 6.0 + finalLossDb);
    rows.push(
      `${t + 1},Graded,VCV_a${c.toLowerCase()}a_1,${c},${resp},${snrPresented},610,${finalLossDb.toFixed(3)},${seDb.toFixed(3)},${finalLossDb.toFixed(3)},${mode},${cond},${ear}`
    );
  }
  return rows.join("\n") + "\n";
}

/* 1. Normal-Hearing Adaptive ADP50 CSV must classify as NORMAL (not clarity loss!) */
const nhAdpCsv = buildSyntheticAdaptiveCsv({
  id: "NH901",
  ear: "Right",
  cond: "Unaided",
  mode: "adaptive_50",
  finalLossDb: 0.20,
  seDb: 1.12,
  hitRate: 0.56
});
const pNh = QProEngine.parseQvcvCsv(nhAdpCsv, "qVCV_NH901_R_ADP50_20261121_0900.csv");
assert.equal(pNh.participantId, "NH901");
assert.equal(pNh.ear, "Right");
assert.equal(pNh.isAdaptive, true);
assert.equal(pNh.practicePc, 100);
assert.ok(Math.abs(pNh.finalSnrLossDb - 0.20) < 1e-6);

const mNh = QProEngine.mergeQvcvRuns([pNh]);
const repNhAdp = QProEngine.evaluate({
  listenerId: mNh.participantId,
  ear: mNh.ear,
  audiogramHL: [5, 5, 10, 5, 10, 10, 10, 15, 15, 15],
  practicePc: mNh.practicePc,
  measuredSrtLossDb: mNh.measuredSrtLossDb,
  measuredSrtSeDb: mNh.measuredSrtSeDb,
  obsSnrPerCons: mNh.obsSnrPerCons,
  meanAdaptiveSnrDb: mNh.meanAdaptiveSnrDb,
  qvcvMode: mNh.qvcvMode,
  countsS1: mNh.countsS1
});
assert.equal(repNhAdp.isAdaptiveQvcv, true);
assert.equal(repNhAdp.empPcPooled, 56.0);
assert.ok(Math.abs(repNhAdp.eqFixedPc - repNhAdp.pcNhRef) < 1.0, `Expected eqFixedPc near NH ref ${repNhAdp.pcNhRef}%, got ${repNhAdp.eqFixedPc}`);
assert.equal(repNhAdp.phenotype, "NORMAL HEARING & SPEECH-IN-NOISE CLARITY");
assert.ok(repNhAdp.rtrPlacePct >= 78, `Expected preserved NH place cue clarity (>75%), got ${repNhAdp.rtrPlacePct}%`);
console.log(
  `\n[PASS Adaptive NH] Raw=${repNhAdp.empPcPooled}% -> EquivFixed=${repNhAdp.eqFixedPc}%, ` +
  `Total=${repNhAdp.totalDeficitDb}±${repNhAdp.totalDeficitSeDb} dB, Phenotype="${repNhAdp.phenotype}"`
);

/* 2. Hearing-Impaired Test+Retest Adaptive CSVs + Adaptive Aided CSV */
const hlRun1 = QProEngine.parseQvcvCsv(
  buildSyntheticAdaptiveCsv({ id: "HL902", ear: "Left", cond: "Unaided", mode: "adaptive_50", finalLossDb: 11.4, seDb: 1.20 }),
  "qVCV_HL902_L_ADP50_20261121_0910.csv"
);
const hlRun2 = QProEngine.parseQvcvCsv(
  buildSyntheticAdaptiveCsv({ id: "HL902", ear: "Left", cond: "Unaided", mode: "adaptive_50", finalLossDb: 12.0, seDb: 1.20 }),
  "qVCV_HL902_L_ADP50_20261121_0920.csv"
);
const hlAided = QProEngine.parseQvcvCsv(
  buildSyntheticAdaptiveCsv({ id: "HL902", ear: "Left", cond: "Aided", mode: "adaptive_50", finalLossDb: 4.5, seDb: 1.15 }),
  "qVCV_HL902_L_AIDED_ADP50_20261121_0935.csv"
);
const mHl = QProEngine.mergeQvcvRuns([hlRun1, hlRun2]);
assert.ok(Math.abs(mHl.measuredSrtLossDb - 11.7) < 0.05);
assert.ok(mHl.measuredSrtSeDb < 0.90, "Pooled 2-run SE should shrink by ~1/sqrt(2)");

const repHlAdp = QProEngine.evaluate({
  listenerId: mHl.participantId,
  ear: mHl.ear,
  audiogramHL: [25, 30, 35, 40, 45, 50, 55, 60, 65, 65],
  practicePc: mHl.practicePc,
  measuredSrtLossDb: mHl.measuredSrtLossDb,
  measuredSrtSeDb: mHl.measuredSrtSeDb,
  obsSnrPerCons: mHl.obsSnrPerCons,
  qvcvMode: mHl.qvcvMode,
  srtLossS1Db: mHl.srtLossS1Db,
  srtLossS2Db: mHl.srtLossS2Db,
  countsS1: mHl.countsS1,
  countsS2: mHl.countsS2,
  aided: {
    "Aided Run": {
      label: "Aided Run",
      counts: hlAided.counts,
      isAdaptive: hlAided.isAdaptive,
      finalSnrLossDb: hlAided.finalSnrLossDb
    }
  }
});
assert.ok(repHlAdp.empPcS1Eq !== null && repHlAdp.empPcS2Eq !== null);
assert.equal(repHlAdp.aidedSessions.length, 1);
assert.ok(repHlAdp.aidedSessions[0].deltaPc > 20.0, `Expected >20% equiv aided gain, got ${repHlAdp.aidedSessions[0].deltaPc}`);
assert.ok(Math.abs(repHlAdp.aidedSessions[0].snrBenefitDb - 7.2) < 0.2);
assert.ok(repHlAdp.recommendations.some(r => r.includes("AIDED VERIFICATION PASS")));
console.log(
  `[PASS Adaptive HL Test+Retest + Aided] Unaided Equiv=${repHlAdp.eqFixedPc}% -> Aided Equiv=${repHlAdp.aidedSessions[0].aidedPc}% ` +
  `(+${repHlAdp.aidedSessions[0].snrBenefitDb} dB SNR benefit)`
);

/* 3. Standardized Export Filename & SVG / DOM Wiring Check */
assert.equal(QProEngine.formatExportFilename("HL068", "Right", "csv", "20261121"), "qPRO_HL068_R_20261121.csv");
assert.equal(QProEngine.formatExportFilename("HL068", "Left", "json", "20261121"), "qPRO_HL068_L_20261121.json");
assert.equal(QProEngine.formatExportFilename("BT_042", "RL", "csv", "20261121", "1245"), "qPRO_BT_042_RL_20261121_1245.csv");
assert.match(QProEngine.formatExportFilename("HL068", "Right", "csv"), /^qPRO_HL068_R_\d{8}_\d{4}\.csv$/);

/* 4. Multi-underscore + duplicate-suffix filename parsing, 17-col Final_SE_dB & Audiogram_Hz_dBHL, & mismatch flags */
const metaUnderscore = QProEngine.inferFileMeta("qVCV_BT_042_Subj_L_AIDED_ADP50_20261121_1130 (2).csv");
assert.equal(metaUnderscore.participantId, "BT_042_Subj");
assert.equal(metaUnderscore.ear, "Left");
assert.equal(metaUnderscore.isAidedName, true);
assert.equal(metaUnderscore.isAdaptiveName, true);

const metaQcls = QProEngine.inferFileMeta("qCLS_ELC_BT_042_R_20261121_1105 (1).csv");
assert.equal(metaQcls.participantId, "BT_042");
assert.equal(metaQcls.ear, "Right");

const aud17Str = "250:15;500:20;750:20;1000:25;1500:30;2000:35;3000:45;4000:55;6000:60;8000:65";
const csv17 = [
  "Trial,Phase,Stimulus,Target,Response,Target_SNR_dB,RT_ms,Running_SNR_Loss_dB,Running_SE_dB,Final_SNR_Loss_dB,Final_SE_dB,Mode,Condition,Ear,Presentation_SPL_dB,Noise_Offset_Samples,Audiogram_Hz_dBHL",
  `1,Graded,"VCV_aba_1,+12SNR",B,B,12,510,5.200,1.850,4.850,0.940,adaptive_50,Unaided,Right,60,1024,"${aud17Str}"`,
  `2,Graded,"VCV_ada_1,-2SNR",D,D,-2,530,4.850,1.420,4.850,0.940,adaptive_50,Unaided,Right,60,2048,"${aud17Str}"`
].join("\n") + "\n";
const parsed17 = QProEngine.parseQvcvCsv(csv17, "qVCV_BT_042_R_ADP50_20261121_1200 (1).csv");
assert.equal(parsed17.participantId, "BT_042");
assert.equal(parsed17.ear, "Right");
assert.ok(Math.abs(parsed17.finalSnrLossDb - 4.85) < 1e-6);
assert.ok(Math.abs(parsed17.finalSeDb - 0.94) < 1e-6, `Expected Final_SE_dB=0.94, got ${parsed17.finalSeDb}`);
assert.deepEqual(parsed17.audiogramHL, [15, 20, 20, 25, 30, 35, 45, 55, 60, 65]);

const mismatchMerge = QProEngine.mergeQvcvRuns([hlRun1, pNh]);
assert.equal(mismatchMerge.idMismatch, true);
assert.equal(mismatchMerge.earMismatch, true);

/* 5. Blank / Staged Peripheral-Only Patient Guard (hasQvcv=false) + Provisional qCLS Audiogram */
const d4 = globalThis.QPRO_DATA.demos.find(d => d.id === "HL068");
const estAudFromQcls = QProEngine.deriveAudiogramFromQclsElc(d4.elc_10x10, "er3a");
assert.ok(Array.isArray(estAudFromQcls) && estAudFromQcls.length === 10);
const repPending = QProEngine.evaluate({
  listenerId: "NEW_PT",
  ear: "Right",
  hasAudiogram: false,
  audiogramEstimatedFromQcls: true,
  hasQvcv: false,
  audiogramHL: estAudFromQcls,
  elc10x10: d4.elc_10x10,
  countsS1: QProEngine.makeBlankEarSlot().countsS1
});
assert.equal(repPending.hasQvcv, false);
assert.equal(repPending.nTrials, 0);
assert.ok(repPending.phenotype.includes("PERIPHERAL PROFILE ONLY"));
assert.ok(repPending.qcChecks.some(c => c[1].includes("qVCV") && c[0] === "WARN"));

/* 6. Round-Trip JSON Export/Import & Complete Binaural Summary CSV */
const blankSlots = {
  Unspecified: QProEngine.makeBlankEarSlot(),
  Right: { ...QProEngine.makeBlankEarSlot(), audiogramHL: [15, 20, 20, 25, 30, 35, 45, 55, 60, 65], hasOwnAudiogram: true, hasQvcv: true, countsS1: d4.counts_s1 },
  Left: { ...QProEngine.makeBlankEarSlot(), audiogramHL: [25, 30, 35, 40, 45, 50, 55, 60, 65, 65], hasOwnAudiogram: true, hasQvcv: true, countsS1: hlRun1.counts }
};
const bundleJson = QProEngine.buildExportBundleJson({
  activeReport: repHlAdp,
  earReports: { Right: repNhAdp, Left: repHlAdp },
  profileState: {
    listenerId: "HL902",
    group: "Clinical",
    ear: "Left",
    transducer: "er3a",
    earSlots: blankSlots
  }
});
const restored = QProEngine.parseImportedProfileJson(bundleJson);
assert.equal(restored.ok, true);
assert.equal(restored.profile.listenerId, "HL902");
assert.equal(restored.profile.ear, "Left");
assert.equal(restored.profile.earSlots.Right.hasQvcv, true);
assert.deepEqual(restored.profile.earSlots.Right.audiogramHL, [15, 20, 20, 25, 30, 35, 45, 55, 60, 65]);

/* Also verify legacy single-report JSON fallback import */
const legacyRestored = QProEngine.parseImportedProfileJson(JSON.stringify(repHlAdp));
assert.equal(legacyRestored.ok, true);
assert.equal(legacyRestored.profile.listenerId, "HL902");
assert.equal(legacyRestored.profile.earSlots.Left.hasQvcv, true);

const summaryCsv = QProEngine.formatSummaryCsv([repNhAdp, repHlAdp]);
const csvLines = summaryCsv.trim().split("\n");
assert.equal(csvLines.length, 3, "Expected header + 2 ear rows in binaural CSV");
assert.ok(csvLines[0].includes("ig50_1k") && csvLines[0].includes("ig80_4k") && csvLines[0].includes("best_aided_qvcv_pct"));

const mockContainer = { innerHTML: "" };
globalThis.QProReportView.renderReportSheet(mockContainer, repHlAdp, globalThis.QPRO_DATA.norms);
assert.ok(mockContainer.innerHTML.includes("From Adaptive SRT"));
globalThis.QProReportView.renderPrescriptionSheet(mockContainer, repHlAdp);
assert.ok(mockContainer.innerHTML.includes("Kneepoint CT (dB SPL)"));

globalThis.QProReportView.renderReportSheet(mockContainer, repPending, globalThis.QPRO_DATA.norms);
assert.ok(mockContainer.innerHTML.includes("Pending qVCV CSV"));
globalThis.QProReportView.renderPrescriptionSheet(mockContainer, repPending);
assert.ok(mockContainer.innerHTML.includes("Expected Unaided"));

const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const htmlIds = new Set([...indexHtml.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const jsIds = [...indexHtml.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]);
const missingIds = jsIds.filter(id => !htmlIds.has(id));
assert.deepEqual(missingIds, [], `Missing DOM IDs in index.html: ${missingIds.join(", ")}`);
console.log(`[PASS DOM, CSV/JSON Round-Trip & SVG Render] Verified all ${new Set(jsIds).size} DOM IDs, 17-col qVCV ingest, pending-qVCV guard, and binaural export.`);

console.log("PASS: qPRO WebAssembly engine verified.");
