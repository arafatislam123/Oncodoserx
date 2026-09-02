/**
 * OncoDoseRx — Prediction Engine
 * Matches parsed report data against the treatment dataset
 * and returns ranked chemotherapy recommendations.
 */

"use strict";

const dataset = require("./dataset");

// ── Stage helpers ─────────────────────────────────────────────────────────────
const STAGE_ORDER = {
  "0": 0, "IS": 0,
  "I": 1, "IA": 1, "IB": 1, "IC": 1,
  "II": 2, "IIA": 2, "IIB": 2, "IIC": 2,
  "IB2": 2,
  "III": 3, "IIIA": 3, "IIIB": 3, "IIIC": 3,
  "IVA": 4, "IVB": 4, "IV": 4,
  "LIMITED": 1, "EXTENSIVE": 4,
  "METASTATIC": 4, "ADVANCED": 3,
  "ISS II": 2, "ISS III": 3
};

function stageInList(reportStage, ruleStages) {
  if (!reportStage) return false;
  const rs = reportStage.toUpperCase();
  // Direct match
  if (ruleStages.includes("*")) return true;
  if (ruleStages.map(s => s.toUpperCase()).includes(rs)) return true;

  // Numeric rank match — e.g. report says "IIIA", rule has "III"
  const reportRank = STAGE_ORDER[rs] ?? -1;
  if (reportRank === -1) return false;

  return ruleStages.some(s => {
    const su = s.toUpperCase();
    if (STAGE_ORDER[su] === reportRank) return true;
    // Allow IIA to match rule "II"
    if (su === "IV"  && reportRank === 4) return true;
    if (su === "III" && reportRank === 3) return true;
    if (su === "II"  && reportRank === 2) return true;
    if (su === "I"   && reportRank === 1) return true;
    return false;
  });
}

// ── Cancer type match ─────────────────────────────────────────────────────────
function cancerMatches(reportCancerLabel, ruleKeywords) {
  if (!reportCancerLabel) return false;
  const label = reportCancerLabel.toLowerCase();
  return ruleKeywords.some(k => label.includes(k.toLowerCase()));
}

// ── Biomarker match ───────────────────────────────────────────────────────────
/**
 * Returns a score 0–N:
 *   N   = all required biomarkers matched exactly  → highest priority
 *  0.5  = rule has no biomarker requirements (catch-all)
 *   0   = a required biomarker is present but mismatched → disqualified
 */
function biomarkerScore(reportBM, ruleBM) {
  if (!ruleBM || Object.keys(ruleBM).length === 0) return 0.5; // neutral

  let matched = 0;
  let mismatched = 0;
  const keys = Object.keys(ruleBM);

  for (const key of keys) {
    const required = ruleBM[key];
    const actual   = reportBM[key];

    if (actual === undefined || actual === null) {
      // data missing — treat as soft miss, not hard disqualify
      matched += 0.3;
      continue;
    }

    if (required === "positive" && (actual === "positive" || actual === ">=50%")) {
      matched++;
    } else if (required === "negative" && actual === "negative") {
      matched++;
    } else if (required === "mutated" && actual === "mutated") {
      matched++;
    } else if (required === "wild-type" && actual === "wild-type") {
      matched++;
    } else if (required === "deficient" && actual === "deficient") {
      matched++;
    } else if (required === "proficient" && actual === "proficient") {
      matched++;
    } else if (required === "high" && actual === "high") {
      matched++;
    } else if (required === "poor" && actual === "poor") {
      matched++;
    } else if (required === ">=50%" && actual === ">=50%") {
      matched++;
    } else if (required === actual) {
      matched++;
    } else {
      // Known conflicting value — hard disqualify
      mismatched++;
    }
  }

  if (mismatched > 0) return 0; // disqualified
  return matched / keys.length;
}

// ── Grade match ───────────────────────────────────────────────────────────────
function gradeMatches(reportGrade, ruleGrade) {
  if (ruleGrade === "*") return true;
  if (!reportGrade) return true; // missing = soft pass
  return ruleGrade === reportGrade;
}

// ── Score a single rule against the parsed report ────────────────────────────
function scoreRule(rule, parsed) {
  const { cancerType, stage, grade, biomarkers } = parsed;

  // Cancer type is mandatory
  if (!cancerMatches(cancerType, rule.cancer)) return null;

  // Stage match
  const stageOk = rule.stages.includes("*") || stageInList(stage, rule.stages);
  if (!stageOk) {
    // If no stage found in report, allow rules to still fire (penalised)
    if (stage !== null) return null;
  }

  // Grade match
  if (!gradeMatches(grade, rule.grade)) return null;

  // Biomarker scoring
  const bmScore = biomarkerScore(biomarkers || {}, rule.biomarkers);
  if (bmScore === 0) return null; // hard biomarker conflict

  // Composite score
  let score = 0;
  score += 10;                        // base for cancer type match
  score += stageOk ? 5 : 0;          // stage match bonus
  score += (grade && rule.grade !== "*") ? 2 : 0; // grade specificity bonus
  score += bmScore * 8;               // biomarker fit (0–8)
  // Prefer specific biomarker rules over catch-alls
  if (rule.biomarkers && Object.keys(rule.biomarkers).length > 0) score += 3;

  return score;
}

// ── Main prediction function ──────────────────────────────────────────────────
function predict(parsed) {
  const results = [];

  for (const rule of dataset) {
    const score = scoreRule(rule, parsed);
    if (score !== null) {
      results.push({ rule, score });
    }
  }

  if (results.length === 0) return { recommendations: [], parsed };

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // De-duplicate by regimen name (keep highest scoring)
  const seen = new Set();
  const unique = [];
  for (const r of results) {
    if (!seen.has(r.rule.regimen)) {
      seen.add(r.rule.regimen);
      unique.push(r);
    }
  }

  // Return top 3 recommendations
  const top = unique.slice(0, 3);

  const recommendations = top.map((item, idx) => ({
    rank: idx + 1,
    ruleId: item.rule.id,
    regimen: item.rule.regimen,
    drugs: item.rule.drugs,
    cycles: item.rule.cycles,
    interval: item.rule.interval,
    duration: item.rule.duration,
    intent: item.rule.intent,
    notes: item.rule.notes,
    reference: item.rule.reference,
    confidence: matchConfidence(item.score, idx),
    fitScore: Math.round(item.score),
  }));

  return {
    recommendations,
    parsed,
    summary: buildSummary(parsed, recommendations[0]),
  };
}

function matchConfidence(score, rank) {
  if (rank === 0 && score >= 20) return "High";
  if (rank === 0 && score >= 15) return "Moderate";
  if (rank <= 1 && score >= 12) return "Moderate";
  return "Low";
}

function buildSummary(parsed, top) {
  if (!top) return null;

  const lines = [];
  lines.push(`Cancer: ${parsed.cancerType || "Unknown"}`);
  if (parsed.stage) lines.push(`Stage: ${parsed.stage}`);
  if (parsed.grade) lines.push(`Grade: ${capitalise(parsed.grade)}`);

  const bm = parsed.biomarkers || {};
  const bmParts = [];
  if (bm.her2)    bmParts.push(`HER2 ${bm.her2}`);
  if (bm.er)      bmParts.push(`ER ${bm.er}`);
  if (bm.pr)      bmParts.push(`PR ${bm.pr}`);
  if (bm.egfr)    bmParts.push(`EGFR ${bm.egfr}`);
  if (bm.alk)     bmParts.push(`ALK ${bm.alk}`);
  if (bm.pdl1)    bmParts.push(`PD-L1 ${bm.pdl1}`);
  if (bm.ras)     bmParts.push(`RAS ${bm.ras}`);
  if (bm.braf)    bmParts.push(`BRAF ${bm.braf}`);
  if (bm.mmr)     bmParts.push(`MMR ${bm.mmr}`);
  // Brain tumor biomarkers
  if (bm.mgmt)    bmParts.push(`MGMT ${bm.mgmt}`);
  if (bm.idh)     bmParts.push(`IDH ${bm.idh}`);
  if (bm.codeletion1p19q) bmParts.push(`1p/19q ${bm.codeletion1p19q}`);
  if (bm.tert)    bmParts.push(`TERT ${bm.tert}`);
  if (bm.atrx)    bmParts.push(`ATRX ${bm.atrx}`);
  if (bm.whoCnsGrade) bmParts.push(`WHO CNS Grade ${bm.whoCnsGrade}`);
  if (bmParts.length) lines.push(`Biomarkers: ${bmParts.join(" | ")}`);

  lines.push(`Recommended Regimen: ${top.regimen}`);
  lines.push(`Chemotherapy Cycles: ${top.cycles > 0 ? top.cycles : "Continuous (see notes)"}`);
  lines.push(`Cycle Interval: Every ${top.interval > 0 ? top.interval + " days" : "N/A"}`);
  lines.push(`Total Duration: ${top.duration}`);
  lines.push(`Treatment Intent: ${capitalise(top.intent)}`);

  return lines.join("\n");
}

function capitalise(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

module.exports = { predict };
