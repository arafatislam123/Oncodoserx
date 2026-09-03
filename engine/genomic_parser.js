/**
 * OncoDoseRx — Genomic Panel Parser
 * =================================
 * Variant-level extraction from NGS / molecular pathology reports.
 *
 * WHY THIS EXISTS SEPARATELY FROM engine/parser.js
 * engine/parser.js reports biomarkers at gene level only — `egfr: "mutated"`.
 * That is clinically insufficient for trial matching: EGFR exon 19 del and
 * L858R are osimertinib-sensitive, while exon 20 insertion is NOT (it needs
 * amivantamab), and T790M is an acquired resistance variant. A trial that
 * requires "EGFR exon 19 deletion or L858R" must not match an exon 20 patient.
 *
 * This module is additive: engine/parser.js is untouched, so the existing
 * analysis pipeline cannot regress. When no NGS report is supplied, the caller
 * falls back to the gene-level biomarkers parser.js already produces.
 *
 * Zero dependencies — regex only, matching the house style.
 */

"use strict";

// Gentler normaliser than parser.js's `norm()`, which strips the characters
// HGVS notation depends on (">", "_", "*", ":"). Case and whitespace only.
const gnorm = (t) =>
  String(t || "")
    .toLowerCase()
    .replace(/–|—/g, "-")   // en/em dash → hyphen
    .replace(/\s+/g, " ")
    .trim();

// Canonical variant labels — keeps display and matching consistent.
const EXON19 = "Exon 19 deletion";
const EXON20 = "Exon 20 insertion";

/**
 * Split report text into clauses so each gene's finding is judged in its own
 * context. Without this, "EGFR exon 19 deletion detected. KRAS G12C not
 * detected." would let EGFR's "detected" bleed into the KRAS verdict — or
 * worse, report a G12C-negative patient as G12C-positive.
 *
 * HGVS prefixes (p. c. g. n. m.) are protected from the sentence split so
 * "p.Glu746_Ala750del" survives intact.
 */
function segments(t) {
  return t
    .replace(/\b([pcgnm])\./g, "$1·")
    .split(/[.;\n]+/)
    .map((s) => s.replace(/·/g, ".").trim())
    .filter(Boolean);
}

/**
 * Explicit negative-result phrases only — deliberately NOT a generic "no|not"
 * check, which would misread "G12C detected, no other mutations identified"
 * as negative. A false negative merely hides an option; a false POSITIVE
 * could match a patient to a targeted therapy they cannot benefit from.
 */
const NEGATIVE_RESULT = new RegExp(
  [
    // "not detected", "not amplified", "not rearranged", …
    "\\bnot\\s+(?:detected|identified|found|observed|present|amplified|mutated|rearranged|elevated|expressed)\\b",
    "\\bnegative\\b",
    "\\bwild[- ]?type\\b",
    "\\bwt\\b",
    "\\babsent\\b",
    "\\bnone\\s+detected\\b",
    // "no pathogenic variant", "no rearrangement", "no amplification", …
    "\\bno\\s+(?:pathogenic|likely\\s+pathogenic|deleterious|rearrangement|fusion|mutation|amplification|evidence|variant|alteration|expression)\\b",
  ].join("|")
);

const isNegative = (seg) => NEGATIVE_RESULT.test(seg);

// Clauses mentioning a gene, split into those reporting a positive finding and
// those explicitly reporting a negative one.
function geneClauses(t, geneRe) {
  const segs = segments(t).filter((s) => geneRe.test(s));
  return {
    positive: segs.filter((s) => !isNegative(s)),
    negative: segs.filter(isNegative),
    any: segs.length > 0,
  };
}

const POSITIVE_CUE = /\b(mutation|mutant|mutated|positive|detected|identified|present|found)\b/;

// ─────────────────────────────────────────────────────────────────────────────
// EGFR
// ─────────────────────────────────────────────────────────────────────────────
function egfrVariant(seg) {
  // Order matters: exon 20 insertion is checked before exon 19 deletion so a
  // clause naming both resolves to the more treatment-limiting variant.
  if (/\bexon\s*20\s*(insertion|ins|dup)/.test(seg) || /\bex20ins\b/.test(seg)) return EXON20;
  if (/\bexon\s*19\s*(deletion|del)/.test(seg) || /\bex19del\b/.test(seg) || /\bdel19\b/.test(seg)) return EXON19;
  if (/\bt790m\b/.test(seg)) return "T790M";
  if (/\bl858r\b/.test(seg)) return "L858R";
  if (/\bl861q\b/.test(seg)) return "L861Q";
  if (/\bs768i\b/.test(seg)) return "S768I";
  const g719 = seg.match(/\bg719([a-z])\b/);
  if (g719) return `G719${g719[1].toUpperCase()}`;
  return null;
}

function extractEGFR(t) {
  const { positive, negative, any } = geneClauses(t, /\begfr\b/);
  if (!any) return null;

  for (const seg of positive) {
    const variant = egfrVariant(seg);
    if (variant) return { status: "mutated", variant };
    if (POSITIVE_CUE.test(seg)) return { status: "mutated", variant: null };
  }
  if (negative.length > 0) return { status: "wild-type", variant: null };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// KRAS / BRAF — hotspot codon notation
// ─────────────────────────────────────────────────────────────────────────────
// Formats a codon hotspot like "g12c" → "G12C".
const formatCodon = (code) => code.slice(0, -1).toUpperCase() + code.slice(-1).toUpperCase();

function extractKRAS(t) {
  const { positive, negative, any } = geneClauses(t, /\bkras\b/);
  if (!any) return null;

  for (const seg of positive) {
    const hotspot = seg.match(/\b(g12[a-z]|g13[a-z]|q61[a-z]|a146[a-z])\b/);
    if (hotspot) return { status: "mutated", variant: formatCodon(hotspot[1]) };
    if (POSITIVE_CUE.test(seg)) return { status: "mutated", variant: null };
  }
  if (negative.length > 0) return { status: "wild-type", variant: null };
  return null;
}

function extractBRAF(t) {
  const { positive, negative, any } = geneClauses(t, /\bbraf\b/);
  if (!any) return null;

  for (const seg of positive) {
    const v600 = seg.match(/\bv600([a-z])\b/);
    if (v600) return { status: "mutated", variant: `V600${v600[1].toUpperCase()}` };
    if (/\bv600\b/.test(seg)) return { status: "mutated", variant: "V600" };
    if (POSITIVE_CUE.test(seg)) return { status: "mutated", variant: null };
  }
  if (negative.length > 0) return { status: "wild-type", variant: null };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALK — a fusion gene, so "rearranged/fusion" is the positive finding
// ─────────────────────────────────────────────────────────────────────────────
function extractALK(t) {
  const { positive, negative, any } = geneClauses(t, /\balk\b/);
  if (!any) return null;

  for (const seg of positive) {
    if (/\beml4[- ]?alk\b/.test(seg)) return { status: "positive", variant: "EML4-ALK fusion" };
    if (/\b(fusion|rearrangement|rearranged|translocation)\b/.test(seg) || POSITIVE_CUE.test(seg)) {
      return { status: "positive", variant: "ALK fusion" };
    }
  }
  if (negative.length > 0) return { status: "negative", variant: null };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HER2 / ERBB2 — amplification, overexpression, or activating mutation
// ─────────────────────────────────────────────────────────────────────────────
function extractHER2(t) {
  const { positive, negative, any } = geneClauses(t, /\bher2\b|\berbb2\b/);
  if (!any) return null;

  for (const seg of positive) {
    if (/\b(amplification|amplified)\b/.test(seg)) return { status: "positive", variant: "Amplification" };
    if (/\bexon\s*20\s*(insertion|ins)\b/.test(seg)) return { status: "mutated", variant: EXON20 };
    if (/\bihc\s*3\s*\+/.test(seg) || /\b3\s*\+/.test(seg)) return { status: "positive", variant: "IHC 3+" };
    if (/\b(mutation|mutated|mutant)\b/.test(seg)) return { status: "mutated", variant: null };
    if (/\b(positive|overexpress(ed|ion))\b/.test(seg)) return { status: "positive", variant: null };
  }
  if (negative.length > 0) return { status: "negative", variant: null };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// BRCA1 / BRCA2 — germline or somatic pathogenic variants
// ─────────────────────────────────────────────────────────────────────────────
// Formats HGVS protein notation for display: "p.glu23fs" → "p.Glu23fs".
const formatHgvs = (h) => h.replace(/^p\.([a-z]{3})/i, (_, aa) => "p." + aa.charAt(0).toUpperCase() + aa.slice(1));

function extractBRCA(t, which) {
  const gene = which === 1 ? "brca1" : "brca2";
  const { positive, negative, any } = geneClauses(t, new RegExp(`\\b${gene}\\b`));
  if (!any) return null;

  for (const seg of positive) {
    if (/\b(pathogenic|likely pathogenic|deleterious|mutation|mutant|mutated|positive)\b/.test(seg)) {
      const hgvs = seg.match(/\b(p\.[a-z]{3}\d+[a-z]{0,3}(?:fs|\*)?)/i);
      return { status: "mutated", variant: hgvs ? formatHgvs(hgvs[1]) : "Pathogenic variant" };
    }
  }
  if (negative.length > 0 || positive.some((s) => /\bbenign\b/.test(s))) {
    return { status: "wild-type", variant: null };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TMB — tumour mutational burden (mut/Mb)
// ─────────────────────────────────────────────────────────────────────────────
function extractTMB(t) {
  const numeric =
    t.match(/\btmb[^.]{0,25}?(\d+(?:\.\d+)?)\s*(?:mut(?:ations)?\s*\/\s*mb|muts?\/mb|\/mb)/) ||
    t.match(/\btumou?r mutational burden[^.]{0,25}?(\d+(?:\.\d+)?)/) ||
    t.match(/\btmb\s*[:=-]?\s*(\d+(?:\.\d+)?)\b/);

  if (numeric) {
    const value = parseFloat(numeric[1]);
    // FDA threshold for pembrolizumab (TMB-H) is ≥10 mut/Mb.
    return { value, unit: "mut/Mb", category: value >= 10 ? "high" : "low" };
  }
  if (/\btmb[- ]?h(igh)?\b/.test(t)) return { value: null, unit: null, category: "high" };
  if (/\btmb[- ]?l(ow)?\b/.test(t)) return { value: null, unit: null, category: "low" };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MSI / MMR
// ─────────────────────────────────────────────────────────────────────────────
function extractMSI(t) {
  if (/\bmsi[- ]?h(igh)?\b/.test(t) || /\bmicrosatellite instability[- ]high\b/.test(t) ||
      /\bdmmr\b/.test(t) || /\bmismatch repair deficient\b/.test(t)) {
    return "MSI-H";
  }
  if (/\bmsi[- ]?l(ow)?\b/.test(t)) return "MSI-L";
  if (/\bmss\b/.test(t) || /\bmicrosatellite stable\b/.test(t) ||
      /\bpmmr\b/.test(t) || /\bmismatch repair proficient\b/.test(t)) {
    return "MSS";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Extract a genomic panel from free-text NGS report content.
 * @returns {{ genes: Record<string, {status: string, variant: string|null}>,
 *             tmb: object|null, msi: string|null, detected: string[] }}
 */
function extractGenomicPanel(text) {
  const t = gnorm(text);

  const genes = {};
  const put = (name, result) => {
    if (result) genes[name] = result;
  };

  put("EGFR", extractEGFR(t));
  put("KRAS", extractKRAS(t));
  put("BRAF", extractBRAF(t));
  put("ALK", extractALK(t));
  put("HER2", extractHER2(t));
  put("BRCA1", extractBRCA(t, 1));
  put("BRCA2", extractBRCA(t, 2));

  const tmb = extractTMB(t);
  const msi = extractMSI(t);

  // Flat, display-ready list of positive findings only — this is what the UI
  // shows for review before the doctor runs the match.
  const detected = [];
  for (const [gene, info] of Object.entries(genes)) {
    if (info.status === "wild-type" || info.status === "negative") continue;
    detected.push(info.variant ? `${gene} ${info.variant}` : `${gene} ${info.status}`);
  }
  if (tmb) detected.push(tmb.value != null ? `TMB ${tmb.value} ${tmb.unit}` : `TMB-${tmb.category}`);
  if (msi) detected.push(msi);

  return { genes, tmb, msi, detected };
}

module.exports = { extractGenomicPanel };
