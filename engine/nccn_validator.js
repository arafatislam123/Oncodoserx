/**
 * OncoDoseRx — NCCN Concordance Validator
 * =======================================
 * Before a clinician's decision is written into the training corpus, it is
 * checked against the NCCN rule set in `engine/dataset.js` (via the rule
 * predictor) for the same patient profile.
 *
 * This is the quality gate on the learning loop. Without it, a mistyped cycle
 * count or a regimen for the wrong cancer would be learned as ground truth and
 * would degrade every subsequent prediction. The gate does NOT block a doctor
 * from recording an off-guideline decision — off-guideline care is legitimate
 * and clinically common — it only labels the row so the retraining script can
 * weight it appropriately and so the audit trail shows what happened.
 *
 * Concordance levels:
 *   guideline_match  — regimen and cycle count both align with an NCCN rule
 *   regimen_match    — right regimen, cycle count outside the guideline range
 *   variant          — a different NCCN-listed option for this profile
 *   off_guideline    — no NCCN rule for this profile matches the decision
 *   unverifiable     — no NCCN rule exists for this profile at all
 */

"use strict";

const { predict } = require("./predictor");

// Cycle counts inside this tolerance of the guideline still count as a match —
// NCCN protocols routinely allow 4–6 or 6–8 cycles, and a report's rule stores
// only the single most common value.
const CYCLE_TOLERANCE = 2;

// Words that describe a regimen without identifying it. Stripping them is what
// lets "AC-T Dose-Dense ... - HR+/HER2- Stage II adjuvant" be recognised as the
// same protocol as plain "AC-T".
const QUALIFIERS = new Set([
  "dose", "dense", "adjusted", "modified", "single", "agent", "regimen",
  "protocol", "therapy", "chemo", "chemotherapy", "based", "alone",
  "stage", "adjuvant", "neoadjuvant", "curative", "palliative", "maintenance",
  "hr", "her", "her2", "er", "pr", "msi", "mss", "ras", "wt", "wild", "type",
  "positive", "negative", "high", "low", "and", "with", "the", "for",
  "i", "ii", "iii", "iv", "v",
]);

function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length > 0 && !QUALIFIERS.has(tok) && !/^\d+$/.test(tok));
}

/**
 * The protocol name itself - everything before the first parenthesis or dash,
 * which is where these strings put the acronym ("FOLFOX", "AC-T", "TC"). The
 * drug list that follows in parentheses is expansion, not identity: "FOLFOX"
 * and "FOLFOX (Folinic Acid + Fluorouracil + Oxaliplatin)" name one regimen.
 */
function headTokens(name) {
  const head = String(name || "").split(/[(\u2014\u2013-]/)[0];
  // An acronym that itself contains a dash (AC-T) gets truncated to "AC" by the
  // split, so anything that leaves fewer than the full name's leading tokens
  // falls back to tokenising the whole string before the parenthesis.
  const beforeParen = String(name || "").split("(")[0];
  const tokens = tokenise(head).length > 0 ? tokenise(beforeParen) : tokenise(name);
  return new Set(tokens);
}

/** Every significant token, including the drug names inside parentheses. */
function regimenTokens(name) {
  return new Set(tokenise(name));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const tok of a) if (b.has(tok)) shared++;
  return shared / (a.size + b.size - shared);
}

function setsEqual(a, b) {
  if (a.size !== b.size || a.size === 0) return false;
  for (const tok of a) if (!b.has(tok)) return false;
  return true;
}

/**
 * How much two regimen names refer to the same protocol, 0-1.
 *
 * Two passes, because neither alone is right. Matching on the protocol acronym
 * alone would call "FOLFOX" and "FOLFOX + Cetuximab" identical; matching on the
 * full drug list alone would call "FOLFOX" and "FOLFOX (Folinic Acid +
 * Fluorouracil + Oxaliplatin)" different, because the short form lists no
 * drugs. So an exact acronym match is decisive, and everything else falls back
 * to token overlap across the whole name.
 */
function regimenSimilarity(a, b) {
  if (setsEqual(headTokens(a), headTokens(b))) return 1;
  return jaccard(regimenTokens(a), regimenTokens(b));
}

// Two names for the same protocol share most of their tokens; "FOLFOX" and
// "FOLFIRI" share none of theirs. At exactly 0.5 the two share a backbone
// (FOLFOX vs FOLFOX + Cetuximab), close enough to treat as the same family for
// weighting purposes.
const SAME_REGIMEN_THRESHOLD = 0.5;

/**
 * @param {object} parsed    parser output for the report
 * @param {object} decision  { regimen, cycles }
 * @param {object[]} [ruleRecommendations]  pre-computed rule output; recomputed
 *        from `parsed` when omitted, so callers that already ran the predictor
 *        do not pay for it twice.
 */
function validateDecision(parsed, decision, ruleRecommendations = null) {
  const recs = ruleRecommendations
    || (predict(parsed).recommendations || []);

  const decisionRegimen = String(decision.regimen || "").trim();
  const decisionCycles  = Number(decision.cycles);

  if (recs.length === 0) {
    return {
      concordance: "unverifiable",
      matchedRule: null,
      reference: null,
      similarity: 0,
      message:
        "No NCCN rule in the local guideline set covers this cancer type, stage " +
        "and biomarker profile, so this decision could not be cross-checked. " +
        "It is recorded as an unverified clinical observation.",
      warnings: [],
    };
  }

  // Best-matching rule by regimen name.
  let best = null;
  for (const rec of recs) {
    const similarity = regimenSimilarity(decisionRegimen, rec.regimen);
    if (!best || similarity > best.similarity) best = { rec, similarity };
  }

  const warnings = [];
  const sameRegimen = best.similarity >= SAME_REGIMEN_THRESHOLD;

  if (!sameRegimen) {
    return {
      concordance: "off_guideline",
      matchedRule: null,
      reference: recs[0].reference || null,
      similarity: Number(best.similarity.toFixed(2)),
      message:
        `"${decisionRegimen}" does not match any NCCN option this profile maps to ` +
        `(closest guideline option: "${recs[0].regimen}"). The decision is recorded ` +
        "as off-guideline and is weighted lower during retraining.",
      warnings: [
        `NCCN options for this profile: ${recs.map((r) => r.regimen).join("; ")}`,
      ],
    };
  }

  const ruleCycles = Number(best.rec.cycles);
  const cyclesKnown = Number.isFinite(ruleCycles) && ruleCycles > 0
    && Number.isFinite(decisionCycles);
  const cycleDelta = cyclesKnown ? Math.abs(decisionCycles - ruleCycles) : null;

  if (cyclesKnown && cycleDelta > CYCLE_TOLERANCE) {
    warnings.push(
      `NCCN lists ${ruleCycles} cycles for ${best.rec.regimen}; ` +
      `${decisionCycles} was recorded (difference of ${cycleDelta}).`
    );
  }

  // A rule ranked first is the guideline's preferred option; a lower-ranked one
  // is still NCCN-listed but is an alternative for this profile.
  const isPreferred = best.rec === recs[0];

  let concordance;
  if (cyclesKnown && cycleDelta <= CYCLE_TOLERANCE && isPreferred) {
    concordance = "guideline_match";
  } else if (!isPreferred) {
    concordance = "variant";
  } else {
    concordance = "regimen_match";
  }

  const messages = {
    guideline_match:
      `Matches the preferred NCCN option for this profile (${best.rec.regimen}, ` +
      `${ruleCycles} cycles).`,
    regimen_match:
      `Regimen matches the NCCN option (${best.rec.regimen}) but the cycle count ` +
      "differs from the guideline value.",
    variant:
      `${best.rec.regimen} is an NCCN-listed alternative for this profile rather ` +
      "than the preferred option.",
  };

  return {
    concordance,
    matchedRule: {
      ruleId:  best.rec.ruleId || null,
      regimen: best.rec.regimen,
      cycles:  Number.isFinite(ruleCycles) ? ruleCycles : null,
      intent:  best.rec.intent || null,
    },
    reference: best.rec.reference || null,
    similarity: Number(best.similarity.toFixed(2)),
    message: messages[concordance],
    warnings,
  };
}

/**
 * Retraining weight multiplier for a concordance level. An off-guideline
 * decision is still learned from — a clinician may be right and the local rule
 * set out of date — but it should not outvote guideline-concordant cases until
 * many of them accumulate.
 */
const CONCORDANCE_WEIGHT = {
  guideline_match: 1.0,
  regimen_match:   0.8,
  variant:         0.8,
  unverifiable:    0.5,
  off_guideline:   0.4,
};

function weightFor(concordance) {
  return CONCORDANCE_WEIGHT[concordance] ?? 0.5;
}

module.exports = {
  validateDecision,
  regimenSimilarity,
  weightFor,
  CONCORDANCE_WEIGHT,
  CYCLE_TOLERANCE,
};
