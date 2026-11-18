/*
 * qpro_report_svg.js
 *
 * Pure vector SVG + DOM renderer for the 1-page US Letter Landscape
 * qPRO — Quick Suprathreshold Clinical Profile report.
 * Uses tall near-square viewBoxes (440 x 430) matched to the 3x2 landscape
 * grid cells so plots fill the full vertical height with minimal whitespace.
 */
(function (global) {
  "use strict";

  const FREQ_LABELS = ["250", "500", "750", "1k", "1.5k", "2k", "3k", "4k", "6k", "8k"];
  const NAVY = "#14284B";
  const SLATE = "#334155";
  const MUTED = "#64748B";
  const GREEN_OK = "#15803D";
  const CORAL_OHC = "#EA580C";
  const BLUE_AUD = "#1D4ED8";
  const RED_NEURAL = "#B91C1C";
  const TEAL_AID = "#0F766E";
  const GOLD = "#D4A017";

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function smearShort(mult) {
    if (mult < 1.25) return "Min";
    if (mult < 1.60) return "Mild";
    if (mult < 2.10) return "Mod";
    return "Sev";
  }

  /* =====================================================================
   * PANEL A: Loudness Scaling & SPL-o-gram (SVG viewBox 0 0 440 462)
   * ===================================================================== */
  function renderPanelASvg(rep, norms) {
    const W = 440, H = 462;
    const padL = 46, padR = 14, padT = 28, padB = 40;
    const pw = W - padL - padR, ph = H - padT - padB;
    const xOf = i => padL + (i / 9) * pw;
    const yMin = -15, yMax = 140;
    const yOf = v => padT + ((yMax - v) / (yMax - yMin)) * ph;

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="qpro-svg" role="img" aria-label="Loudness Scaling and SPL-o-gram">`;
    const drTxt = rep.dynRangeHfDb !== null
      ? `  [HF Range: ${rep.dynRangeHfDb.toFixed(0)} dB | ${rep.slopeCuPerDb.toFixed(2)} CU/dB]`
      : "";
    svg += `<text x="${W / 2}" y="17" text-anchor="middle" font-size="11.6" font-weight="700" fill="${NAVY}">A. Loudness Scaling &amp; SPL-o-gram${esc(drTxt)}</text>`;
    svg += `<rect x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>`;

    /* Grid lines */
    for (let yv = 0; yv <= 120; yv += 20) {
      const y = yOf(yv);
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + pw}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.9"/>`;
      svg += `<text x="${padL - 6}" y="${(y + 3.8).toFixed(1)}" text-anchor="end" font-size="10.0" fill="${SLATE}">${yv}</text>`;
    }
    for (let i = 0; i < 10; i++) {
      const x = xOf(i);
      svg += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" stroke="#F1F5F9" stroke-width="0.9"/>`;
      svg += `<text x="${x.toFixed(1)}" y="${padT + ph + 15}" text-anchor="middle" font-size="9.8" fill="${SLATE}">${FREQ_LABELS[i]}</text>`;
    }

    /* NH CU 5 & CU 50 shaded +/-1 SD bands */
    if (norms && norms.y_nh_elc) {
      const cu5Up = [], cu5Lo = [], cu50Up = [], cu50Lo = [];
      for (let i = 0; i < 10; i++) {
        const x = xOf(i).toFixed(1);
        cu5Up.push(`${x},${yOf(norms.y_nh_elc[i][0] + norms.y_nh_cu5_sd[i]).toFixed(1)}`);
        cu5Lo.unshift(`${x},${yOf(norms.y_nh_elc[i][0] - norms.y_nh_cu5_sd[i]).toFixed(1)}`);
        cu50Up.push(`${x},${yOf(norms.y_nh_elc[i][9] + norms.y_nh_cu50_sd[i]).toFixed(1)}`);
        cu50Lo.unshift(`${x},${yOf(norms.y_nh_elc[i][9] - norms.y_nh_cu50_sd[i]).toFixed(1)}`);
      }
      svg += `<polygon points="${cu5Up.concat(cu5Lo).join(" ")}" fill="#BFDBFE" fill-opacity="0.45"/>`;
      svg += `<polygon points="${cu50Up.concat(cu50Lo).join(" ")}" fill="#FECACA" fill-opacity="0.40"/>`;
    }

    /* Consonant Cue Frequency Zones at top */
    const zones = [
      [0.0, 2.25, "Voicing / Nasals", "#DBEAFE", "#1E40AF"],
      [3.7, 6.2, "Place Bursts", "#FEF3C7", "#92400E"],
      [6.65, 9.0, "Fricatives (S/SH/Z)", "#FCE7F3", "#9D174D"]
    ];
    for (const [z0, z1, zLbl, zBg, zFg] of zones) {
      const xz0 = xOf(z0), xz1 = xOf(z1);
      const yzTop = yOf(137.0), yzBot = yOf(126.0);
      svg += `<rect x="${xz0.toFixed(1)}" y="${yzTop.toFixed(1)}" width="${(xz1 - xz0).toFixed(1)}" height="${(yzBot - yzTop).toFixed(1)}" rx="3" fill="${zBg}" stroke="${zFg}" stroke-width="0.7"/>`;
      svg += `<text x="${(0.5 * (xz0 + xz1)).toFixed(1)}" y="${(0.5 * (yzTop + yzBot) + 3.0).toFixed(1)}" text-anchor="middle" font-size="8.0" font-weight="700" fill="${zFg}">${esc(zLbl)}</text>`;
    }

    /* 60 dB SPL conversational speech reference line */
    const y60 = yOf(60);
    svg += `<line x1="${padL}" y1="${y60.toFixed(1)}" x2="${padL + pw}" y2="${y60.toFixed(1)}" stroke="#0F766E" stroke-width="1.7" stroke-dasharray="4,3"/>`;

    /* qCLS Contours */
    if (rep.elc10x10 && rep.qclsValid) {
      const cuSpecs = [
        [0, "#2563EB", 2.2],
        [2, "#0284C7", 1.5],
        [4, "#7C3AED", 1.9],
        [6, "#D97706", 1.5],
        [9, "#DC2626", 2.3]
      ];
      for (const [ci, col, lw] of cuSpecs) {
        const pts = [];
        for (let f = 0; f < 10; f++) {
          const v = rep.elc10x10[f]?.[ci];
          if (v !== null && v !== undefined && v > -500 && !Number.isNaN(v)) {
            pts.push([xOf(f), yOf(v)]);
          }
        }
        if (pts.length >= 2) {
          svg += `<polyline fill="none" stroke="${col}" stroke-width="${lw}" points="${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"/>`;
          for (const [px, py] of pts) {
            svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.0" fill="${col}"/>`;
          }
        }
      }
    } else {
      svg += `<text x="${padL + pw / 2}" y="${padT + ph * 0.45}" text-anchor="middle" font-size="11.2" font-weight="700" fill="${MUTED}">qCLS Contours Not Provided (Audiogram SPL Only)</text>`;
    }

    /* Audiogram in dB SPL */
    const audPts = rep.audiogramSpl.map((v, i) => [xOf(i), yOf(v)]);
    svg += `<polyline fill="none" stroke="${NAVY}" stroke-width="2.1" stroke-dasharray="5,3" points="${audPts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"/>`;
    for (const [px, py] of audPts) {
      svg += `<rect x="${(px - 3.1).toFixed(1)}" y="${(py - 3.1).toFixed(1)}" width="6.2" height="6.2" fill="${NAVY}"/>`;
    }

    /* Compact Legend (bottom-right) */
    const lx = padL + pw - 224, ly = padT + ph - 58;
    svg += `<rect x="${lx}" y="${ly}" width="218" height="52" rx="4" fill="#FFFFFF" fill-opacity="0.93" stroke="#CBD5E1" stroke-width="0.8"/>`;
    const legItems = [
      ["#2563EB", "CU 5 (Softest)", 0, 0],
      ["#7C3AED", "CU 25 (Comfort)", 0, 1],
      ["#DC2626", "CU 50 (UCL/MPO)", 0, 2],
      [NAVY, "Audiogram (SPL)", 1, 0],
      ["#0F766E", "Speech (60 SPL)", 1, 1],
      ["#93C5FD", "NH Soft/UCL ±1SD", 1, 2]
    ];
    for (const [col, txt, colIdx, rowIdx] of legItems) {
      const ix = lx + 7 + colIdx * 107, iy = ly + 13 + rowIdx * 15.5;
      svg += `<line x1="${ix}" y1="${iy - 3.2}" x2="${ix + 13}" y2="${iy - 3.2}" stroke="${col}" stroke-width="2.4"/>`;
      svg += `<text x="${ix + 16}" y="${iy}" font-size="8.5" fill="${SLATE}">${esc(txt)}</text>`;
    }

    svg += `<text x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}">Frequency (Hz)</text>`;
    svg += `<text x="14" y="${padT + ph / 2}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}" transform="rotate(-90 14 ${padT + ph / 2})">Presentation Level (dB SPL)</text>`;
    svg += `</svg>`;
    return svg;
  }

  /* =====================================================================
   * PANEL B: Audiogram & Cochlear Loss Breakdown (SVG viewBox 0 0 440 462)
   * ===================================================================== */
  function renderPanelBSvg(rep, topDown) {
    const W = 440, H = 462;
    const padL = 44, padR = 14, padT = 28, padB = 40;
    const pw = W - padL - padR, ph = H - padT - padB;
    const barSlot = pw / 10;
    const xOf = i => padL + (i + 0.5) * barSlot;

    const maxAud = Math.max(85, ...rep.audiogramHl.map(v => v + 18));
    const yLo = -12, yHi = Math.ceil(maxAud / 10) * 10;
    const yOf = v => topDown
      ? (padT + ((v - yLo) / (yHi - yLo)) * ph)
      : (padT + ((yHi - v) / (yHi - yLo)) * ph);

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="qpro-svg" role="img" aria-label="Audiogram and Cochlear Loss Breakdown">`;
    svg += `<text x="${W / 2}" y="17" text-anchor="middle" font-size="11.6" font-weight="700" fill="${NAVY}">B. Audiogram &amp; Cochlear Loss  [HF Recr.: ${rep.hfOhcDb.toFixed(0)} dB | ${esc(rep.hfSmearingLabel)}]</text>`;
    svg += `<rect x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>`;

    /* Normal threshold green band (-12..20 dB HL) */
    const yn0 = Math.min(yOf(-12), yOf(20));
    const ynH = Math.abs(yOf(20) - yOf(-12));
    svg += `<rect x="${padL}" y="${yn0.toFixed(1)}" width="${pw}" height="${ynH.toFixed(1)}" fill="#DCFCE7" fill-opacity="0.55"/>`;

    /* Grid */
    for (let yv = 0; yv <= yHi - 5; yv += 20) {
      const y = yOf(yv);
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + pw}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.9"/>`;
      svg += `<text x="${padL - 6}" y="${(y + 3.8).toFixed(1)}" text-anchor="end" font-size="10.0" fill="${SLATE}">${yv}</text>`;
    }

    const bw = barSlot * 0.60;
    const yZero = yOf(0);
    for (let i = 0; i < 10; i++) {
      const xc = xOf(i);
      const ohc = rep.hlOhc[i], ihc = rep.hlIhc[i];
      const yOhc = yOf(ohc);
      const yTot = yOf(ohc + ihc);

      if (ohc > 0.1) {
        svg += `<rect x="${(xc - bw / 2).toFixed(1)}" y="${Math.min(yZero, yOhc).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(yOhc - yZero).toFixed(1)}" fill="${CORAL_OHC}" fill-opacity="0.86"/>`;
      }
      if (ihc > 0.1) {
        svg += `<rect x="${(xc - bw / 2).toFixed(1)}" y="${Math.min(yOhc, yTot).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(yTot - yOhc).toFixed(1)}" fill="${BLUE_AUD}" fill-opacity="0.82"/>`;
      }
      svg += `<text x="${xc.toFixed(1)}" y="${padT + ph + 15}" text-anchor="middle" font-size="9.8" fill="${SLATE}">${FREQ_LABELS[i]}</text>`;

      if (i % 2 === 1) {
        const tipVal = Math.max(ohc + ihc, rep.audiogramHl[i], 0);
        const tag = smearShort(rep.erbFactor[i]);
        const colT = rep.erbFactor[i] >= 1.25 ? CORAL_OHC : SLATE;
        const yt = topDown ? (yOf(tipVal) + 12.5) : (yOf(tipVal) - 5.5);
        svg += `<text x="${xc.toFixed(1)}" y="${yt.toFixed(1)}" text-anchor="middle" font-size="9.2" font-weight="700" fill="${colT}">${tag}</text>`;
      }
    }

    /* Pure-Tone Audiogram Curve with Clinical Ear Symbols (Right O Red / Left X Blue) */
    const audColor = rep.ear === "Right" ? "#DC2626" : (rep.ear === "Left" ? "#2563EB" : "#0F172A");
    const audPts = rep.audiogramHl.map((v, i) => [xOf(i), yOf(v)]);
    svg += `<polyline fill="none" stroke="${audColor}" stroke-width="2.0" points="${audPts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"/>`;
    for (const [px, py] of audPts) {
      if (rep.ear === "Right") {
        svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.4" fill="#FFFFFF" stroke="#DC2626" stroke-width="2.2"/>`;
      } else if (rep.ear === "Left") {
        svg += `<path d="M${(px - 4.0).toFixed(1)},${(py - 4.0).toFixed(1)} L${(px + 4.0).toFixed(1)},${(py + 4.0).toFixed(1)} M${(px - 4.0).toFixed(1)},${(py + 4.0).toFixed(1)} L${(px + 4.0).toFixed(1)},${(py - 4.0).toFixed(1)}" stroke="#2563EB" stroke-width="2.2"/>`;
      } else {
        svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.6" fill="${audColor}"/>`;
      }
    }

    /* Legend */
    const lx = padL + 7, ly = topDown ? (padT + ph - 66) : (padT + 7);
    svg += `<rect x="${lx}" y="${ly}" width="232" height="59" rx="4" fill="#FFFFFF" fill-opacity="0.93" stroke="#CBD5E1" stroke-width="0.8"/>`;
    const bLegs = [
      ["#BBF7D0", "Normal Threshold Zone (<= 20 dB HL)"],
      [CORAL_OHC, "Outer Hair Cell Loss (Recruitment)"],
      [BLUE_AUD, "Inner Hair Cell / Sensitivity Loss"],
      [audColor, `Pure-Tone Audiogram (dB HL${rep.ear === "Right" ? " • O" : (rep.ear === "Left" ? " • X" : "")})`]
    ];
    bLegs.forEach(([c, t], idx) => {
      const iy = ly + 13 + idx * 13.8;
      svg += `<rect x="${lx + 7}" y="${iy - 7.5}" width="12" height="8" fill="${c}"/>`;
      svg += `<text x="${lx + 23}" y="${iy}" font-size="8.6" fill="${SLATE}">${esc(t)}</text>`;
    });

    const tagWord = topDown ? "Tip tags" : "Top tags";
    svg += `<text x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="9.9" font-weight="700" fill="${SLATE}">Frequency (Hz)  [${tagWord} = Smearing: Min / Mild / Mod / Sev]</text>`;
    svg += `<text x="14" y="${padT + ph / 2}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}" transform="rotate(-90 14 ${padT + ph / 2})">Hearing Level (dB HL)</text>`;
    svg += `</svg>`;
    return svg;
  }

  /* =====================================================================
   * PANEL C: Estimated SNR Loss Breakdown (SVG viewBox 0 0 440 462)
   * ===================================================================== */
  function renderPanelCSvg(rep, norms) {
    const W = 440, H = 462;
    const padL = 118, padR = 14, padT = 28, padB = 40;
    const pw = W - padL - padR, ph = H - padT - padB;

    const p90Tot = norms?.p90_total_db ?? 4.5;
    const p90Neu = norms?.p90_neural_db ?? 3.7;
    const vals = [rep.totalDeficitDb, rep.audibilityDeficitDb, rep.ohcDeficitDb, rep.neuralDeficitDb];
    const ses  = [rep.totalDeficitSeDb, 0, 0, rep.neuralSeDb];
    const cols = [NAVY, BLUE_AUD, CORAL_OHC, rep.neuralDeficitDb > p90Neu ? RED_NEURAL : GREEN_OK];
    const lbls = [
      ["Total Estimated", "SNR Loss"],
      ["1. Inaudibility", "(Restorable w/ Gain)"],
      ["2. Recruitment &", "Upward Masking"],
      ["3. Suprathreshold", "Clarity Loss"]
    ];

    const xMin = -2.5, xMax = Math.max(18.0, Math.max(...vals) + 6.8);
    const xOf = v => padL + ((v - xMin) / (xMax - xMin)) * pw;

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="qpro-svg" role="img" aria-label="Estimated SNR Loss Breakdown">`;
    svg += `<text x="${W / 2}" y="17" text-anchor="middle" font-size="11.6" font-weight="700" fill="${NAVY}">C. Estimated SNR Loss Breakdown  [Overall: ${esc(rep.snrLossSeverity)}]</text>`;
    svg += `<rect x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>`;

    /* Normal zone */
    const xn0 = xOf(xMin), xn1 = xOf(p90Tot);
    svg += `<rect x="${xn0.toFixed(1)}" y="${padT}" width="${(xn1 - xn0).toFixed(1)}" height="${ph}" fill="#DCFCE7" fill-opacity="0.58"/>`;

    /* X ticks */
    const stepX = xMax > 22 ? 5 : 2.5;
    for (let xv = 0; xv <= xMax - 0.5; xv += stepX) {
      const x = xOf(xv);
      svg += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" stroke="#E2E8F0" stroke-width="0.9"/>`;
      svg += `<text x="${x.toFixed(1)}" y="${padT + ph + 15}" text-anchor="middle" font-size="9.8" fill="${SLATE}">${xv % 1 === 0 ? xv : xv.toFixed(1)}</text>`;
    }
    svg += `<line x1="${xOf(0).toFixed(1)}" y1="${padT}" x2="${xOf(0).toFixed(1)}" y2="${padT + ph}" stroke="${SLATE}" stroke-width="1.1"/>`;
    svg += `<line x1="${xOf(p90Neu).toFixed(1)}" y1="${padT}" x2="${xOf(p90Neu).toFixed(1)}" y2="${padT + ph}" stroke="${RED_NEURAL}" stroke-width="1.2" stroke-dasharray="4,3"/>`;

    const rowH = ph / 4;
    const bh = rowH * 0.50;
    const xZero = xOf(0);

    for (let i = 0; i < 4; i++) {
      const yc = padT + (i + 0.5) * rowH;
      const v = vals[i], se = ses[i], col = cols[i];
      const xv = xOf(v);
      const bx = Math.min(xZero, xv), bw = Math.max(1.5, Math.abs(xv - xZero));
      svg += `<rect x="${bx.toFixed(1)}" y="${(yc - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}" fill-opacity="0.88" stroke="#1E293B" stroke-width="0.8"/>`;

      if (se > 0.05) {
        const xe0 = xOf(v - se), xe1 = xOf(v + se);
        svg += `<line x1="${xe0.toFixed(1)}" y1="${yc.toFixed(1)}" x2="${xe1.toFixed(1)}" y2="${yc.toFixed(1)}" stroke="#0F172A" stroke-width="1.7"/>`;
        svg += `<line x1="${xe0.toFixed(1)}" y1="${(yc - 5).toFixed(1)}" x2="${xe0.toFixed(1)}" y2="${(yc + 5).toFixed(1)}" stroke="#0F172A" stroke-width="1.5"/>`;
        svg += `<line x1="${xe1.toFixed(1)}" y1="${(yc - 5).toFixed(1)}" x2="${xe1.toFixed(1)}" y2="${(yc + 5).toFixed(1)}" stroke="#0F172A" stroke-width="1.5"/>`;
      }

      const txtVal = `${v >= 0 ? "+" : ""}${v.toFixed(1)}${se > 0.05 ? ` ± ${se.toFixed(1)}` : ""} dB`;
      const tx = Math.max(xOf(v + se) + 5, xOf(0.4));
      svg += `<text x="${tx.toFixed(1)}" y="${(yc + 4.0).toFixed(1)}" font-size="10.4" font-weight="700" fill="${col}">${esc(txtVal)}</text>`;

      svg += `<text x="${padL - 7}" y="${(yc - 2.5).toFixed(1)}" text-anchor="end" font-size="9.8" font-weight="700" fill="${SLATE}">${esc(lbls[i][0])}</text>`;
      svg += `<text x="${padL - 7}" y="${(yc + 10.5).toFixed(1)}" text-anchor="end" font-size="9.0" font-weight="600" fill="${MUTED}">${esc(lbls[i][1])}</text>`;
    }

    /* Legend in middle-right open space */
    const lx = padL + pw - 176, ly = padT + ph * 0.51;
    svg += `<rect x="${lx}" y="${ly.toFixed(1)}" width="170" height="36" rx="4" fill="#FFFFFF" fill-opacity="0.94" stroke="#CBD5E1" stroke-width="0.8"/>`;
    svg += `<rect x="${lx + 7}" y="${(ly + 6).toFixed(1)}" width="12" height="8" fill="#BBF7D0"/>`;
    svg += `<text x="${lx + 23}" y="${(ly + 13).toFixed(1)}" font-size="8.5" fill="${SLATE}">Normal Range (&lt;= +${p90Tot.toFixed(1)} dB)</text>`;
    svg += `<line x1="${lx + 7}" y1="${(ly + 26).toFixed(1)}" x2="${lx + 19}" y2="${(ly + 26).toFixed(1)}" stroke="${RED_NEURAL}" stroke-width="1.5" stroke-dasharray="3,2"/>`;
    svg += `<text x="${lx + 23}" y="${(ly + 29).toFixed(1)}" font-size="8.5" fill="${SLATE}">Clarity Loss Cutoff (+${p90Neu.toFixed(1)} dB)</text>`;

    svg += `<text x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.2" font-weight="700" fill="${SLATE}">Estimated SNR Loss vs. Normal Hearing (dB) ↑</text>`;
    svg += `</svg>`;
    return svg;
  }

  /* =====================================================================
   * PANEL D: Expected vs. Actual qVCV Score (SVG viewBox 0 0 440 462)
   * ===================================================================== */
  function renderPanelDSvg(rep, norms) {
    const W = 440, H = 462;
    const padL = 44, padR = 14, padT = 28, padB = 50;
    const pw = W - padL - padR, ph = H - padT - padB;
    const nhP05 = norms?.nh_pc_p05 ?? 86.5;

    const bars = [
      { lines: ["Normal", "Hearing", "Avg"], val: rep.pcNhRef, col: GREEN_OK },
      { lines: ["Expected:", "Audiogram", "Only"], val: rep.pcStage1Aud, col: BLUE_AUD },
      { lines: ["Expected:", "Audiogram", "+ qCLS"], val: rep.pcStage2Periph, col: CORAL_OHC },
      { lines: ["Actual", "Unaided", "qVCV"], val: rep.empPcPooled, col: NAVY }
    ];
    for (const a of rep.aidedSessions) {
      const parts = a.aidType.split(" ");
      bars.push({
        lines: ["Actual", parts[0] || "Aided", parts.slice(1).join(" ") || "qVCV"],
        val: a.aidedPc,
        col: a.deltaPc >= 0 ? TEAL_AID : RED_NEURAL
      });
    }

    const nB = bars.length;
    const slotW = pw / nB;
    const bw = Math.min(50, slotW * 0.58);
    const yOf = v => padT + ((108 - v) / 108) * ph;

    const gapPp = rep.empPcPooled - rep.pcStage2Periph;
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="qpro-svg" role="img" aria-label="Expected vs Actual qVCV Score">`;
    svg += `<text x="${W / 2}" y="17" text-anchor="middle" font-size="11.6" font-weight="700" fill="${NAVY}">D. Expected vs. Actual qVCV Score  [Actual - Exp: ${gapPp >= 0 ? "+" : ""}${gapPp.toFixed(1)}%]</text>`;
    svg += `<rect x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>`;

    /* NH green range */
    const yNhTop = yOf(103), yNhBot = yOf(nhP05);
    svg += `<rect x="${padL}" y="${yNhTop.toFixed(1)}" width="${pw}" height="${(yNhBot - yNhTop).toFixed(1)}" fill="#DCFCE7" fill-opacity="0.50"/>`;

    for (let yv = 0; yv <= 100; yv += 20) {
      const y = yOf(yv);
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + pw}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.9"/>`;
      svg += `<text x="${padL - 6}" y="${(y + 3.8).toFixed(1)}" text-anchor="end" font-size="10.0" fill="${SLATE}">${yv}</text>`;
    }
    const y10 = yOf(10);
    svg += `<line x1="${padL}" y1="${y10.toFixed(1)}" x2="${padL + pw}" y2="${y10.toFixed(1)}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="3,3"/>`;

    bars.forEach((b, idx) => {
      const xc = padL + (idx + 0.5) * slotW;
      const yb = yOf(b.val), y0 = yOf(0);
      svg += `<rect x="${(xc - bw / 2).toFixed(1)}" y="${yb.toFixed(1)}" width="${bw.toFixed(1)}" height="${(y0 - yb).toFixed(1)}" fill="${b.col}" fill-opacity="0.88" stroke="#1E293B" stroke-width="0.8"/>`;

      let topRef = b.val;
      if (idx === 3 && rep.empPcS2 !== null) {
        topRef = Math.max(b.val, rep.empPcS1, rep.empPcS2);
        svg += `<circle cx="${(xc - 6.5).toFixed(1)}" cy="${yOf(rep.empPcS1).toFixed(1)}" r="4.0" fill="${GOLD}" stroke="#000" stroke-width="1.0"/>`;
        svg += `<circle cx="${(xc + 6.5).toFixed(1)}" cy="${yOf(rep.empPcS2).toFixed(1)}" r="4.0" fill="${GOLD}" stroke="#000" stroke-width="1.0"/>`;
      }
      svg += `<text x="${xc.toFixed(1)}" y="${yOf(Math.min(topRef + 2.2, 101)).toFixed(1)}" text-anchor="middle" font-size="10.0" font-weight="700" fill="${NAVY}">${b.val.toFixed(1)}%</text>`;

      b.lines.forEach((ln, li) => {
        svg += `<text x="${xc.toFixed(1)}" y="${padT + ph + 14 + li * 11.2}" text-anchor="middle" font-size="9.1" font-weight="700" fill="${SLATE}">${esc(ln)}</text>`;
      });
    });

    /* Lower-left legend */
    const lx = padL + 7, ly = padT + ph - 48;
    svg += `<rect x="${lx}" y="${ly}" width="174" height="42" rx="4" fill="#FFFFFF" fill-opacity="0.92" stroke="#CBD5E1" stroke-width="0.8"/>`;
    svg += `<rect x="${lx + 7}" y="${ly + 6}" width="12" height="8" fill="#BBF7D0"/>`;
    svg += `<text x="${lx + 23}" y="${ly + 13}" font-size="8.4" fill="${SLATE}">Normal Hearing Range (&gt;=${nhP05.toFixed(0)}%)</text>`;
    svg += `<line x1="${lx + 7}" y1="${ly + 23}" x2="${lx + 19}" y2="${ly + 23}" stroke="${MUTED}" stroke-width="1.3" stroke-dasharray="3,2"/>`;
    svg += `<text x="${lx + 23}" y="${ly + 26}" font-size="8.4" fill="${SLATE}">Guessing Floor (10%)</text>`;
    svg += `<circle cx="${lx + 13}" cy="${ly + 35}" r="3.4" fill="${GOLD}" stroke="#000" stroke-width="0.9"/>`;
    svg += `<text x="${lx + 23}" y="${ly + 38}" font-size="8.4" fill="${SLATE}">Test / Retest Runs</text>`;

    svg += `<text x="14" y="${padT + ph / 2}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}" transform="rotate(-90 14 ${padT + ph / 2})">qVCV Consonant Recognition (%)</text>`;
    svg += `</svg>`;
    return svg;
  }

  /* =====================================================================
   * PANEL E: Consonant Confusion Pattern (%) (SVG viewBox 0 0 440 462)
   * ===================================================================== */
  function renderPanelESvg(rep) {
    const W = 440, H = 462;
    const padL = 42, padR = 12, padT = 28, padB = 44;
    const pw = W - padL - padR, ph = H - padT - padB;
    const cw = pw / 11, ch = ph / 10;
    const stims = ["B", "D", "G", "K", "N", "S", "SH", "T", "V", "Z"];
    const resps = ["B", "D", "G", "K", "N", "S", "SH", "T", "V", "Z", "???"];

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="qpro-svg" role="img" aria-label="Consonant Confusion Matrix">`;
    svg += `<text x="${W / 2}" y="17" text-anchor="middle" font-size="11.6" font-weight="700" fill="${NAVY}">E. Consonant Confusion Pattern (%) — De-Noised Estimate</text>`;

    for (let i = 0; i < 10; i++) {
      const y = padT + i * ch;
      svg += `<text x="${padL - 5}" y="${(y + ch / 2 + 3.6).toFixed(1)}" text-anchor="end" font-size="9.8" font-weight="700" fill="${NAVY}">${stims[i]}</text>`;
      for (let j = 0; j < 11; j++) {
        const x = padL + j * cw;
        const p = (rep.smoothedCcm[i]?.[j] ?? 0) * 100.0;
        const cnt = Math.round(rep.rawCounts[i]?.[j] ?? 0);
        let fillRgb = "rgb(255,255,255)";
        if (i === j) {
          const f = Math.min(Math.max(p / 100.0, 0), 1);
          const r = Math.round(255 * (1 - 0.72 * f));
          const g = Math.round(255 * (1 - 0.52 * f));
          const b = Math.round(255 * (1 - 0.18 * f));
          fillRgb = `rgb(${r},${g},${b})`;
        } else {
          const s = Math.min(Math.max((p / 100.0) / 0.55, 0), 1);
          const g = Math.round(255 * (1 - 0.68 * s));
          const b = Math.round(255 * (1 - 0.80 * s));
          fillRgb = `rgb(255,${g},${b})`;
        }
        svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${fillRgb}" stroke="#F1F5F9" stroke-width="0.6"/>`;

        if (i === j) {
          const tc = p >= 62 ? "#FFFFFF" : NAVY;
          svg += `<text x="${(x + cw / 2).toFixed(1)}" y="${(y + ch / 2 + 3.8).toFixed(1)}" text-anchor="middle" font-size="10.0" font-weight="700" fill="${tc}">${Math.round(p)}</text>`;
        } else if (cnt >= 1 || p >= 6.0) {
          const tc = p >= 15 ? "#7F1D1D" : SLATE;
          const fw = p >= 15 ? "700" : "500";
          svg += `<text x="${(x + cw / 2).toFixed(1)}" y="${(y + ch / 2 + 3.5).toFixed(1)}" text-anchor="middle" font-size="9.4" font-weight="${fw}" fill="${tc}">${Math.round(p)}</text>`;
        }
      }
    }
    svg += `<rect x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="none" stroke="#94A3B8" stroke-width="1"/>`;
    for (let j = 0; j < 11; j++) {
      const x = padL + (j + 0.5) * cw;
      svg += `<text x="${x.toFixed(1)}" y="${padT + ph + 15}" text-anchor="middle" font-size="9.6" font-weight="700" fill="${NAVY}">${resps[j]}</text>`;
    }
    svg += `<text x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="9.3" font-weight="700" fill="${SLATE}">Patient Response (%)  |  Cue Clarity: Voicing ${rep.rtrVoicingPct}% • Manner ${rep.rtrMannerPct}% • Place ${rep.rtrPlacePct}%</text>`;
    svg += `<text x="13" y="${padT + ph / 2}" text-anchor="middle" font-size="10.4" font-weight="700" fill="${SLATE}" transform="rotate(-90 13 ${padT + ph / 2})">Presented Consonant</text>`;
    svg += `</svg>`;
    return svg;
  }

  /* =====================================================================
   * FULL 1-PAGE LANDSCAPE SHEET RENDERER
   * ===================================================================== */
  function renderReportSheet(container, rep, norms, opts = {}) {
    const topDown = opts.audiogramTopDown !== false;
    let earTxt = "MONAURAL", earBg = "#475569";
    if (rep.ear === "Right") { earTxt = "RIGHT EAR (O)"; earBg = "#DC2626"; }
    else if (rep.ear === "Left") { earTxt = "LEFT EAR (X)"; earBg = "#2563EB"; }
    else if (rep.ear === "Both") { earTxt = "BINAURAL"; earBg = "#0F766E"; }

    const s12Str = rep.empPcS2 !== null
      ? `${rep.empPcPooled.toFixed(1)}% (Test ${rep.empPcS1.toFixed(0)}% / Retest ${rep.empPcS2.toFixed(0)}%)`
      : `${rep.empPcPooled.toFixed(1)}% (${rep.nTrials} trials)`;

    const aidedHtml = rep.aidedSessions.length > 0
      ? `<span class="qpro-aided-pill">Aided: ${rep.aidedSessions.map(a => `${esc(a.aidType)}: ${a.aidedPc.toFixed(0)}% (${a.deltaPc >= 0 ? "+" : ""}${a.deltaPc.toFixed(0)}%)`).join("  •  ")}</span>`
      : "";

    const qcHtml = rep.qcChecks.map(([st, name, msg]) => {
      const cls = st === "PASS" ? "qc-pass" : (st === "ALERT" ? "qc-alert" : "qc-warn");
      return `<div class="qc-row"><span class="qc-badge ${cls}">[${esc(st)}]</span><span><strong>${esc(name)}:</strong> ${esc(msg)}</span></div>`;
    }).join("");

    const confHtml = rep.topConfusions.length > 0
      ? rep.topConfusions.slice(0, 4).map(c => `Heard '${esc(c.stim)}' as '${esc(c.resp)}' (${c.count}/${c.outOf}, ${Math.round(c.pct)}%)`).join("  •  ")
      : "Minimal consonant confusions (&lt;10% per pair); Voicing, Manner, and Place speech cues preserved.";

    const remHtml = rep.remTargets
      ? `<div class="rem-strip"><strong>REM (0.5/1/2/4 kHz, dB SPL):</strong> Comfort CU25 = ${rep.remTargets.comfortCu25.join("/")}  •  MPO Cap CU50 = ${rep.remTargets.mpoCu50.join("/")}</div>`
      : "";

    const recsHtml = rep.recommendations.map(r => `<li>${esc(r)}</li>`).join("");

    container.innerHTML = `
      <div class="qpro-hdr-banner">
        <div class="qpro-hdr-top">
          <div class="qpro-hdr-title">qPRO — QUICK SUPRATHRESHOLD CLINICAL PROFILE</div>
          <div class="qpro-hdr-right">
            <span class="qpro-ear-badge" style="background:${earBg}">${esc(earTxt)}</span>
            <span class="qpro-hdr-sub">Audiogram + qCLS + qVCV Interpreter</span>
          </div>
        </div>
        <div class="qpro-hdr-meta">
          Patient ID: <strong>${esc(rep.listenerId)}</strong> &nbsp;|&nbsp;
          Group: <strong>${esc(rep.group)}</strong> &nbsp;|&nbsp;
          PTA (1,2,4 kHz): <strong>${rep.pta124.toFixed(1)} dB HL</strong> &nbsp;|&nbsp;
          HF-PTA (3-8 kHz): <strong>${rep.hfPta.toFixed(1)} dB HL</strong> &nbsp;|&nbsp;
          qVCV: <strong>${esc(s12Str)}</strong> &nbsp;|&nbsp;
          Est. SNR Loss: <strong>${rep.totalDeficitDb >= 0 ? "+" : ""}${rep.totalDeficitDb.toFixed(1)} dB (${esc(rep.snrLossSeverity)})</strong>
        </div>
        <div class="qpro-pheno-bar" style="background:${rep.phenotypeColor}">
          <span>CLINICAL SUMMARY: &nbsp;${esc(rep.phenotype)}</span>
          ${aidedHtml}
        </div>
      </div>

      <div class="qpro-grid-3x2">
        <div class="qpro-cell">${renderPanelASvg(rep, norms)}</div>
        <div class="qpro-cell">${renderPanelBSvg(rep, topDown)}</div>
        <div class="qpro-cell">${renderPanelCSvg(rep, norms)}</div>
        <div class="qpro-cell">${renderPanelDSvg(rep, norms)}</div>
        <div class="qpro-cell">${renderPanelESvg(rep)}</div>
        <div class="qpro-cell qpro-card-f">
          <div class="f-title">F. Clinical Interpretation, Test Quality &amp; Fitting Guidance</div>
          <div class="f-sec-hdr">1. TEST QUALITY &amp; BOOTH CROSS-CHECKS</div>
          <div class="f-qc-list">${qcHtml}</div>
          <div class="f-sec-hdr">2. MAIN CONSONANT CONFUSIONS</div>
          <div class="f-conf-line ${rep.topConfusions.length ? "has-conf" : ""}">${confHtml}</div>
          <div class="f-sec-hdr">3. CLINICAL FITTING &amp; COUNSELING GUIDANCE</div>
          ${remHtml}
          <ul class="f-rec-list">${recsHtml}</ul>
        </div>
      </div>
    `;
  }

  /* =====================================================================
   * PRESCRIPTION SHEET — PANEL Rx-A: Verifit REAR Targets (440 x 462)
   * ===================================================================== */
  function renderRxPanelASvg(rep) {
    const rx = rep.prescription;
    const W = 440, H = 462;
    const padL = 46, padR = 14, padT = 28, padB = 40;
    const pw = W - padL - padR, ph = H - padT - padB;
    const xOf = i => padL + (i / 9) * pw;
    const yMin = 0, yMax = 128;
    const yOf = v => padT + ((yMax - v) / (yMax - yMin)) * ph;

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="qpro-svg" role="img" aria-label="Real-Ear Aided Response Targets">`;
    svg += `<text x="${W / 2}" y="17" text-anchor="middle" font-size="11.5" font-weight="700" fill="${NAVY}">Rx-A. Real-Ear Aided Response (REAR) &amp; MPO Targets</text>`;
    svg += `<rect x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>`;

    for (let yv = 0; yv <= 120; yv += 20) {
      const y = yOf(yv);
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + pw}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.9"/>`;
      svg += `<text x="${padL - 6}" y="${(y + 3.8).toFixed(1)}" text-anchor="end" font-size="10.0" fill="${SLATE}">${yv}</text>`;
    }
    for (let i = 0; i < 10; i++) {
      const x = xOf(i);
      svg += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" stroke="#F1F5F9" stroke-width="0.9"/>`;
      svg += `<text x="${x.toFixed(1)}" y="${padT + ph + 15}" text-anchor="middle" font-size="9.8" fill="${SLATE}">${FREQ_LABELS[i]}</text>`;
    }

    /* Shaded Aided Speech Envelope (REAR 50 to REAR 80) */
    const up80 = rx.rear80Spl.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
    const lo50 = rx.rear50Spl.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).reverse();
    svg += `<polygon points="${up80.concat(lo50).join(" ")}" fill="#DDD6FE" fill-opacity="0.38"/>`;

    const drawCurve = (arr, col, lw, dash, mk) => {
      const pts = arr.map((v, i) => [xOf(i), yOf(v)]);
      const dAttr = dash ? ` stroke-dasharray="${dash}"` : "";
      svg += `<polyline fill="none" stroke="${col}" stroke-width="${lw}"${dAttr} points="${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"/>`;
      for (const [px, py] of pts) {
        if (mk === "sq") {
          svg += `<rect x="${(px - 2.8).toFixed(1)}" y="${(py - 2.8).toFixed(1)}" width="5.6" height="5.6" fill="${col}"/>`;
        } else if (mk === "ci") {
          svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.1" fill="${col}"/>`;
        }
      }
    };

    drawCurve(rx.mpoSpl, "#DC2626", 2.4, "6,3", "ci");
    drawCurve(rx.rear80Spl, "#D97706", 2.0, "", "ci");
    drawCurve(rx.rear65Spl, "#6D28D9", 2.6, "", "ci");
    drawCurve(rx.rear50Spl, "#2563EB", 2.0, "", "ci");
    drawCurve(rx.reur65Spl, "#0F766E", 1.4, "3,3", "");
    drawCurve(rep.audiogramSpl.map(v => Math.max(0, v)), NAVY, 1.8, "5,3", "sq");

    const lx = padL + pw - 224, ly = padT + ph - 66;
    svg += `<rect x="${lx}" y="${ly}" width="218" height="60" rx="4" fill="#FFFFFF" fill-opacity="0.94" stroke="#CBD5E1" stroke-width="0.8"/>`;
    const legs = [
      ["#DC2626", "MPO Cap (CU 50)", 0, 0],
      ["#D97706", "REAR 80 (Loud ISTS)", 0, 1],
      ["#6D28D9", "REAR 65 (Avg ISTS)", 0, 2],
      ["#2563EB", "REAR 50 (Soft ISTS)", 1, 0],
      ["#0F766E", "Unaided 65 SPL", 1, 1],
      [NAVY, "Threshold (SPL)", 1, 2]
    ];
    for (const [col, txt, ci, ri] of legs) {
      const ix = lx + 7 + ci * 107, iy = ly + 14 + ri * 17;
      svg += `<line x1="${ix}" y1="${iy - 3.2}" x2="${ix + 13}" y2="${iy - 3.2}" stroke="${col}" stroke-width="2.4"/>`;
      svg += `<text x="${ix + 16}" y="${iy}" font-size="8.4" fill="${SLATE}">${esc(txt)}</text>`;
    }

    svg += `<text x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}">Frequency (Hz)</text>`;
    svg += `<text x="14" y="${padT + ph / 2}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}" transform="rotate(-90 14 ${padT + ph / 2})">Ear-Canal SPL (dB SPL)</text>`;
    svg += `</svg>`;
    return svg;
  }

  /* =====================================================================
   * PRESCRIPTION SHEET — PANEL Rx-B: Insertion Gain & Guardrails (440 x 462)
   * ===================================================================== */
  function renderRxPanelBSvg(rep) {
    const rx = rep.prescription;
    const W = 440, H = 462;
    const padL = 44, padR = 14, padT = 28, padB = 40;
    const pw = W - padL - padR, ph = H - padT - padB;
    const xOf = i => padL + (i / 9) * pw;
    const maxG = Math.max(35, ...rx.ig50Db.map(v => v + 8));
    const yMin = -2, yMax = Math.ceil(maxG / 5) * 5;
    const yOf = v => padT + ((yMax - v) / (yMax - yMin)) * ph;

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="qpro-svg" role="img" aria-label="Prescribed Insertion Gain">`;
    svg += `<text x="${W / 2}" y="17" text-anchor="middle" font-size="11.5" font-weight="700" fill="${NAVY}">Rx-B. Prescribed Insertion Gain (IG50 / IG65 / IG80)</text>`;
    svg += `<rect x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>`;

    const stepY = yMax > 45 ? 10 : 5;
    for (let yv = 0; yv <= yMax; yv += stepY) {
      const y = yOf(yv);
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + pw}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.9"/>`;
      svg += `<text x="${padL - 6}" y="${(y + 3.8).toFixed(1)}" text-anchor="end" font-size="10.0" fill="${SLATE}">${yv}</text>`;
    }
    for (let i = 0; i < 10; i++) {
      const x = xOf(i);
      svg += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" stroke="#F1F5F9" stroke-width="0.9"/>`;
      svg += `<text x="${x.toFixed(1)}" y="${padT + ph + 15}" text-anchor="middle" font-size="9.8" fill="${SLATE}">${FREQ_LABELS[i]}</text>`;
    }

    /* Guardrail callout zones (2-line badges so labels fit comfortably inside frequency spans) */
    if (rx.usomCutAppliedDb >= 0.8) {
      const x0 = xOf(0), x1 = xOf(2.45);
      const xc = 0.5 * (x0 + x1);
      svg += `<rect x="${x0.toFixed(1)}" y="${(padT + 6).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="30" rx="4" fill="#FEF3C7" stroke="#D97706" stroke-width="0.8"/>`;
      svg += `<text x="${xc.toFixed(1)}" y="${(padT + 18).toFixed(1)}" text-anchor="middle" font-size="8.2" font-weight="700" fill="#92400E">LF Masking Cut</text>`;
      svg += `<text x="${xc.toFixed(1)}" y="${(padT + 30).toFixed(1)}" text-anchor="middle" font-size="8.3" font-weight="800" fill="#B45309">-${rx.usomCutAppliedDb.toFixed(1)} dB (&lt;1 kHz)</text>`;
    }
    if (rx.hfDesensAppliedDb >= 0.8) {
      const x0 = xOf(6.0), x1 = xOf(9.0);
      const xc = 0.5 * (x0 + x1);
      svg += `<rect x="${x0.toFixed(1)}" y="${(padT + 6).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="30" rx="4" fill="#FEE2E2" stroke="#DC2626" stroke-width="0.8"/>`;
      svg += `<text x="${xc.toFixed(1)}" y="${(padT + 18).toFixed(1)}" text-anchor="middle" font-size="8.2" font-weight="700" fill="#991B1B">HF Clarity Cap</text>`;
      svg += `<text x="${xc.toFixed(1)}" y="${(padT + 30).toFixed(1)}" text-anchor="middle" font-size="8.3" font-weight="800" fill="#B91C1C">-${rx.hfDesensAppliedDb.toFixed(1)} dB (&gt;=3 kHz)</text>`;
    }

    const plotIG = (arr, col, lw) => {
      const pts = arr.map((v, i) => [xOf(i), yOf(v)]);
      svg += `<polyline fill="none" stroke="${col}" stroke-width="${lw}" points="${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"/>`;
      for (const [px, py] of pts) {
        svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.2" fill="${col}"/>`;
      }
    };
    plotIG(rx.ig50Db, "#2563EB", 2.1);
    plotIG(rx.ig65Db, "#6D28D9", 2.7);
    plotIG(rx.ig80Db, "#D97706", 2.1);

    if (!rx.ampIndicated) {
      svg += `<text x="${padL + pw / 2}" y="${padT + ph * 0.45}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${GREEN_OK}">0 dB Acoustic Gain Prescribed (Normal Thresholds)</text>`;
    }

    const lx = padL + 8, ly = padT + (rx.usomCutAppliedDb >= 0.8 ? 42 : 10);
    svg += `<rect x="${lx}" y="${ly}" width="184" height="50" rx="4" fill="#FFFFFF" fill-opacity="0.93" stroke="#CBD5E1" stroke-width="0.8"/>`;
    [
      ["#2563EB", "IG 50 — Soft Speech (50 dB)"],
      ["#6D28D9", "IG 65 — Average Speech (65 dB)"],
      ["#D97706", "IG 80 — Loud Speech (80 dB)"]
    ].forEach(([c, t], idx) => {
      const iy = ly + 14 + idx * 14.5;
      svg += `<line x1="${lx + 7}" y1="${iy - 3.2}" x2="${lx + 20}" y2="${iy - 3.2}" stroke="${c}" stroke-width="2.5"/>`;
      svg += `<text x="${lx + 25}" y="${iy}" font-size="8.6" fill="${SLATE}">${esc(t)}</text>`;
    });

    svg += `<text x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}">Frequency (Hz)</text>`;
    svg += `<text x="14" y="${padT + ph / 2}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}" transform="rotate(-90 14 ${padT + ph / 2})">Insertion Gain (dB)</text>`;
    svg += `</svg>`;
    return svg;
  }

  /* =====================================================================
   * PRESCRIPTION SHEET — PANEL Rx-C: WDRC I/O & Predicted Aided qVCV (440 x 462)
   * ===================================================================== */
  function renderRxPanelCSvg(rep) {
    const rx = rep.prescription;
    const W = 440, H = 462;
    const padL = 46, padR = 14, padT = 28, padB = 40;
    const pw = W - padL - padR, ph = H - padT - padB;
    const xMin = 40, xMax = 90;
    const yMin = 35, yMax = 125;
    const xOf = v => padL + ((v - xMin) / (xMax - xMin)) * pw;
    const yOf = v => padT + ((yMax - v) / (yMax - yMin)) * ph;

    let svg = `<svg viewBox="0 0 ${W} ${H}" class="qpro-svg" role="img" aria-label="WDRC Input-Output Compression Curves">`;
    svg += `<text x="${W / 2}" y="17" text-anchor="middle" font-size="11.5" font-weight="700" fill="${NAVY}">Rx-C. WDRC Input–Output Curves &amp; Predicted Outcome</text>`;
    svg += `<rect x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1"/>`;

    for (let yv = 40; yv <= 120; yv += 20) {
      const y = yOf(yv);
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + pw}" y2="${y.toFixed(1)}" stroke="#E2E8F0" stroke-width="0.9"/>`;
      svg += `<text x="${padL - 6}" y="${(y + 3.8).toFixed(1)}" text-anchor="end" font-size="10.0" fill="${SLATE}">${yv}</text>`;
    }
    for (let xv = 40; xv <= 90; xv += 10) {
      const x = xOf(xv);
      svg += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" stroke="#F1F5F9" stroke-width="0.9"/>`;
      svg += `<text x="${x.toFixed(1)}" y="${padT + ph + 15}" text-anchor="middle" font-size="9.8" fill="${SLATE}">${xv}</text>`;
    }

    /* Unity 1:1 Reference Line */
    svg += `<line x1="${xOf(40).toFixed(1)}" y1="${yOf(40).toFixed(1)}" x2="${xOf(90).toFixed(1)}" y2="${yOf(90).toFixed(1)}" stroke="#CBD5E1" stroke-width="1.3" stroke-dasharray="4,3"/>`;

    /* Plot I/O curves at 1 kHz (idx 3), 2 kHz (idx 5), 4 kHz (idx 7) */
    const ioSpecs = [
      [3, "1 kHz", "#0284C7"],
      [5, "2 kHz", "#7C3AED"],
      [7, "4 kHz", "#EA580C"]
    ];
    for (const [fi, lbl, col] of ioSpecs) {
      const r50 = rx.rear50Spl[fi], r65 = rx.rear65Spl[fi], r80 = rx.rear80Spl[fi], mpo = rx.mpoSpl[fi];
      const slpLo = (r65 - r50) / 15.0;
      const slpHi = (r80 - r65) / 15.0;
      const r40 = Math.max(35, r50 - 10.0 * Math.max(slpLo, 1.0));
      const r90 = Math.min(mpo, r80 + 10.0 * slpHi);
      const pts = [[40, r40], [50, r50], [65, r65], [80, r80], [90, r90]].map(([ lx, ly ]) => [xOf(lx), yOf(ly)]);
      svg += `<polyline fill="none" stroke="${col}" stroke-width="2.4" points="${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}"/>`;
      for (const [px, py] of pts.slice(1, 4)) {
        svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.3" fill="${col}"/>`;
      }
      /* MPO horizontal cap tick near 90 dB */
      svg += `<line x1="${xOf(83).toFixed(1)}" y1="${yOf(mpo).toFixed(1)}" x2="${xOf(90).toFixed(1)}" y2="${yOf(mpo).toFixed(1)}" stroke="${col}" stroke-width="1.3" stroke-dasharray="2,2"/>`;
    }

    /* Predicted Aided qVCV Summary Box (top-left) */
    const bx = padL + 8, by = padT + 8;
    const dlt = rx.predAidedQvcvPct - rep.empPcPooled;
    svg += `<rect x="${bx}" y="${by}" width="214" height="62" rx="5" fill="#F0FDF4" stroke="#86EFAC" stroke-width="1.0"/>`;
    svg += `<text x="${bx + 9}" y="${by + 16}" font-size="9.2" font-weight="800" fill="#166534">BIOPHYSICAL OUTCOME PREDICTION</text>`;
    svg += `<text x="${bx + 9}" y="${by + 34}" font-size="10.4" font-weight="700" fill="${NAVY}">Unaided qVCV: ${rep.empPcPooled.toFixed(1)}%</text>`;
    svg += `<text x="${bx + 9}" y="${by + 51}" font-size="10.6" font-weight="800" fill="${TEAL_AID}">qPRO-Rx Aided: ${rx.predAidedQvcvPct.toFixed(1)}% (${dlt >= 0 ? "+" : ""}${dlt.toFixed(1)}%)</text>`;

    /* Legend (bottom-right) */
    const lx = padL + pw - 168, ly = padT + ph - 58;
    svg += `<rect x="${lx}" y="${ly}" width="162" height="52" rx="4" fill="#FFFFFF" fill-opacity="0.94" stroke="#CBD5E1" stroke-width="0.8"/>`;
    ioSpecs.forEach(([fi, lbl, col], idx) => {
      const iy = ly + 14 + idx * 15;
      svg += `<line x1="${lx + 7}" y1="${iy - 3.2}" x2="${lx + 20}" y2="${iy - 3.2}" stroke="${col}" stroke-width="2.5"/>`;
      svg += `<text x="${lx + 25}" y="${iy}" font-size="8.6" font-weight="600" fill="${SLATE}">${lbl} (CR ${rx.cr[fi].toFixed(2)} : 1)</text>`;
    });

    svg += `<text x="${padL + pw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}">Input ISTS Speech Level (dB SPL)</text>`;
    svg += `<text x="14" y="${padT + ph / 2}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${SLATE}" transform="rotate(-90 14 ${padT + ph / 2})">Ear-Canal Output Level (dB SPL)</text>`;
    svg += `</svg>`;
    return svg;
  }

  /* =====================================================================
   * FULL 1-PAGE LANDSCAPE PRESCRIPTION & REM SHEET RENDERER
   * ===================================================================== */
  function renderPrescriptionSheet(container, rep) {
    const rx = rep.prescription;
    let earTxt = "MONAURAL", earBg = "#475569";
    if (rep.ear === "Right") { earTxt = "RIGHT EAR (O)"; earBg = "#DC2626"; }
    else if (rep.ear === "Left") { earTxt = "LEFT EAR (X)"; earBg = "#2563EB"; }
    else if (rep.ear === "Both") { earTxt = "BINAURAL"; earBg = "#0F766E"; }

    const dlt = rx.predAidedQvcvPct - rep.empPcPooled;
    const statusBg = rx.ampIndicated ? TEAL_AID : (rep.neuralDeficitDb > 3.7 ? RED_NEURAL : GREEN_OK);
    const statusTxt = rx.ampIndicated
      ? `PRESCRIPTION: AMPLIFICATION INDICATED  •  Predicted qVCV: ${rep.empPcPooled.toFixed(0)}% → ${rx.predAidedQvcvPct.toFixed(0)}% (${dlt >= 0 ? "+" : ""}${dlt.toFixed(0)}%)`
      : (rep.neuralDeficitDb > 3.7
          ? "PRESCRIPTION: ACOUSTIC GAIN NOT INDICATED — Prescribe Remote-Mic / Directional SNR Support Only"
          : "PRESCRIPTION: AMPLIFICATION NOT INDICATED — Normal Peripheral & Suprathreshold Profile");

    const obsAidRight = rep.aidedSessions.length > 0
      ? `<span class="qpro-aided-pill">Observed Aided: ${rep.aidedSessions.map(a => `${esc(a.aidType)} ${a.aidedPc.toFixed(0)}%`).join(" • ")}</span>`
      : "";

    const thCells = FREQ_LABELS.map(f => `<th>${f} Hz</th>`).join("");
    const rowCells = (arr, fmtFn, cls = "") => arr.map(v => `<td class="${cls}">${fmtFn(v)}</td>`).join("");

    container.innerHTML = `
      <div class="qpro-hdr-banner">
        <div class="qpro-hdr-top">
          <div class="qpro-hdr-title">qPRO-Rx — HEARING-AID PRESCRIPTION &amp; REM TARGETS</div>
          <div class="qpro-hdr-right">
            <span class="qpro-ear-badge" style="background:${earBg}">${esc(earTxt)}</span>
            <span class="qpro-hdr-sub">qCLS Loudness-Mapping + SIN Guardrails</span>
          </div>
        </div>
        <div class="qpro-hdr-meta">
          Patient ID: <strong>${esc(rep.listenerId)}</strong> &nbsp;|&nbsp;
          PTA (1,2,4 kHz): <strong>${rep.pta124.toFixed(1)} dB HL</strong> &nbsp;|&nbsp;
          LF-PTA: <strong>${rep.lfPta.toFixed(1)} dB HL</strong> &nbsp;|&nbsp;
          HF-PTA (3-8 kHz): <strong>${rep.hfPta.toFixed(1)} dB HL</strong> &nbsp;|&nbsp;
          Est. SNR Loss: <strong>${rep.totalDeficitDb >= 0 ? "+" : ""}${rep.totalDeficitDb.toFixed(1)} dB</strong> &nbsp;|&nbsp;
          Clarity Loss: <strong>${rep.neuralDeficitDb >= 0 ? "+" : ""}${rep.neuralDeficitDb.toFixed(1)} dB</strong>
        </div>
        <div class="qpro-pheno-bar" style="background:${statusBg}">
          <span>${esc(statusTxt)}</span>
          ${obsAidRight}
        </div>
      </div>

      <div class="qpro-grid-3x2">
        <div class="qpro-cell">${renderRxPanelASvg(rep)}</div>
        <div class="qpro-cell">${renderRxPanelBSvg(rep)}</div>
        <div class="qpro-cell">${renderRxPanelCSvg(rep)}</div>

        <div class="qpro-cell rx-table-span2">
          <div class="f-title">Rx-D. Audioscan Verifit / Real-Ear &amp; Fitting Target Table (250–8000 Hz)</div>
          <table class="rx-target-table">
            <thead>
              <tr><th>Target Parameter</th>${thCells}</tr>
            </thead>
            <tbody>
              <tr><td><strong>Audiogram (dB HL)</strong></td>${rowCells(rep.audiogramHl, v => Math.round(v))}</tr>
              <tr><td><strong>REAR 50 — Soft ISTS (dB SPL)</strong></td>${rowCells(rx.rear50Spl, v => v)}</tr>
              <tr class="rx-hl-row"><td><strong>REAR 65 — Avg ISTS (dB SPL)</strong></td>${rowCells(rx.rear65Spl, v => v, "rx-bold")}</tr>
              <tr><td><strong>REAR 80 — Loud ISTS (dB SPL)</strong></td>${rowCells(rx.rear80Spl, v => v)}</tr>
              <tr class="rx-mpo-row"><td><strong>MPO / UCL Cap — CU 50 (dB SPL)</strong></td>${rowCells(rx.mpoSpl, v => v, "rx-mpo-cell")}</tr>
              <tr><td><strong>Insertion Gain IG50 (dB)</strong></td>${rowCells(rx.ig50Db, v => Math.round(v))}</tr>
              <tr class="rx-hl-row"><td><strong>Insertion Gain IG65 (dB)</strong></td>${rowCells(rx.ig65Db, v => Math.round(v), "rx-bold")}</tr>
              <tr><td><strong>Insertion Gain IG80 (dB)</strong></td>${rowCells(rx.ig80Db, v => Math.round(v))}</tr>
              <tr><td><strong>Compression Ratio (CR : 1)</strong></td>${rowCells(rx.cr, v => v.toFixed(2))}</tr>
            </tbody>
          </table>
          <div class="rx-table-note">
            <strong>Method:</strong> ${esc(rx.method)} &nbsp;•&nbsp;
            <strong>Guardrails Applied:</strong> LF Upward-Masking Cut = <strong>${rx.usomCutAppliedDb.toFixed(1)} dB</strong>, HF Clarity Desensitization = <strong>${rx.hfDesensAppliedDb.toFixed(1)} dB</strong>, Max CR Cap = <strong>2.8 : 1</strong>, Headroom Below CU 50 = <strong>4 dB</strong>.
          </div>
        </div>

        <div class="qpro-cell qpro-card-f">
          <div class="f-title">Rx-E. Electroacoustic &amp; Assistive Prescription</div>
          <div class="f-sec-hdr">1. ACOUSTIC COUPLING &amp; VENTING</div>
          <div class="f-conf-line">${esc(rx.ventLabel)}</div>

          <div class="f-sec-hdr">2. WDRC TIME CONSTANTS &amp; KNEEPOINT</div>
          <div class="f-conf-line">${esc(rx.wdrcSpeedLabel)} (Compression threshold ~45 dB SPL).</div>

          <div class="f-sec-hdr">3. DIRECTIONALITY &amp; ASSISTIVE SNR TECH</div>
          <div class="f-conf-line has-conf">${esc(rx.directionalityLabel)}</div>

          <div class="f-sec-hdr">4. REAL-EAR VERIFICATION CHECKLIST</div>
          <ul class="f-rec-list">
            <li>Match <strong>REAR 50 / 65 / 80 dB ISTS</strong> targets within ±3 dB from 0.5–4 kHz (and ±5 dB at 6 kHz).</li>
            <li>Verify 85–90 dB pure-tone sweep (<strong>RESR</strong>) never exceeds the patient's <strong>CU 50 MPO Cap</strong>.</li>
            <li>Run 50–100 aided <strong>qVCV</strong> trials at 60 dB SPL to confirm aided recognition approaches predicted <strong>${rx.predAidedQvcvPct.toFixed(0)}%</strong> without rollover.</li>
          </ul>
        </div>
      </div>
    `;
  }

  global.QProReportView = { renderReportSheet, renderPrescriptionSheet };
})(typeof globalThis !== "undefined" ? globalThis : window);
