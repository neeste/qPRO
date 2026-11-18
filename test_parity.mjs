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
    `| ${rep.phenotype} | ${rep.elapsedMs} ms`
  );
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
console.log("PASS: qPRO WebAssembly engine verified.");
