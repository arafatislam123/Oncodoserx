/**
 * OncoDoseRx — Clinical Trial Matcher
 * ===================================
 * Deterministic, explainable scoring of a patient profile against trials.
 *
 * DESIGN PRINCIPLE: a score is never produced without its reasons. Every
 * criterion resolves to one of three states, and all three are returned to the
 * UI so a clinician can audit the number:
 *   MET      — the patient demonstrably satisfies the criterion
 *   NOT MET  — the patient demonstrably fails it
 *   UNKNOWN  — the data needed to decide is missing
 *
 * Missing data must never masquerade as a mismatch. UNKNOWN earns nothing but
 * only costs half weight in the denominator, so an incomplete record lowers
 * confidence without wrongly rejecting a patient.
 *
 * Criteria a trial doesn't mention are "not applicable" and are dropped from
 * the calculation entirely, so a trial silent on biomarkers isn't penalised.
 *
 * No ML, no external calls — pure functions over already-extracted data.
 */

"use strict";

const WEIGHTS = {
  condition:  { weight: 40, hardFail: true  },
  biomarker:  { weight: 25, hardFail: false },
  stage:      { weight: 10, hardFail: false },
  ecog:       { weight: 10, hardFail: false },
  age:        { weight: 5,  hardFail: true  },
  sex:        { weight: 5,  hardFail: true  },
  priorLines: { weight: 5,  hardFail: false },
};

// A trial publishing less eligibility text than this can't be meaningfully
// checked, so its score is damped (see scoreTrial).
const MIN_ELIGIBILITY_CHARS = 200;

// Denominator weight added when the published eligibility is too thin to
// evaluate — roughly the combined weight of the clinical criteria it hides
// (biomarker 25 + stage 10 + ECOG 10).
const THIN_EVIDENCE_WEIGHT = 45;

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────────────────────
// Gene-level biomarker keys as produced by engine/parser.js → canonical names.
const PARSER_GENE_MAP = {
  egfr: "EGFR", kras: "KRAS", braf: "BRAF", alk: "ALK",
  her2: "HER2", brca: "BRCA1", ros1: "ROS1", met: "MET", nras: "NRAS",
};

/**
 * Merge the three data sources into one profile.
 * Precedence: NGS panel (most specific) > doctor override > parsed report.
 * `sources` records where each clinical field came from, so the UI can show
 * "from report" vs "entered by clinician".
 */
function buildProfile({ parsed = {}, overrides = {}, genomic = null } = {}) {
  const sources = {};
  const pick = (field, parsedValue) => {
    const manual = overrides[field];
    if (manual !== undefined && manual !== null && manual !== "") {
      sources[field] = "manual";
      return manual;
    }
    if (parsedValue !== undefined && parsedValue !== null && parsedValue !== "") {
      sources[field] = "report";
      return parsedValue;
    }
    sources[field] = "missing";
    return null;
  };

  // Start from parser.js's gene-level biomarkers…
  const biomarkers = {};
  const pb = parsed.biomarkers || {};
  for (const [key, canonical] of Object.entries(PARSER_GENE_MAP)) {
    const value = pb[key];
    if (!value) continue;
    const v = norm(value);
    const status =
      v === "mutated" ? "mutated" :
      v === "positive" ? "positive" :
      v === "wild-type" ? "wild-type" :
      v === "negative" ? "negative" : v;
    biomarkers[canonical] = { status, variant: null, source: "report" };
  }

  // …then let the NGS panel overwrite with variant-level detail.
  if (genomic && genomic.genes) {
    for (const [gene, info] of Object.entries(genomic.genes)) {
      biomarkers[gene] = { status: info.status, variant: info.variant || null, source: "ngs" };
    }
  }

  return {
    cancerType: pick("cancerType", parsed.cancerType),
    stage:      pick("stage", parsed.stage),
    ecog:       pick("ecog", parsed.performanceStatus),
    age:        pick("age", parsed.age),
    sex:        pick("sex", parsed.gender),
    priorLines: pick("priorLines", null), // parser cannot extract this — always manual
    biomarkers,
    tmb: genomic?.tmb ?? null,
    msi: genomic?.msi ?? (pb.msi ? String(pb.msi) : null),
    sources,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONDITION
// ─────────────────────────────────────────────────────────────────────────────
const CONDITION_SYNONYMS = [
  ["nsclc", "non-small cell lung", "non small cell lung", "lung adenocarcinoma", "squamous cell lung", "lung cancer", "lung carcinoma"],
  ["sclc", "small cell lung"],
  ["breast"],
  ["colorectal", "colon", "rectal", "crc"],
  ["glioblastoma", "gbm", "glioma", "astrocytoma"],
  ["ovarian", "fallopian", "peritoneal"],
  ["pancreatic", "pancreas", "pdac"],
  ["gastric", "stomach", "gastroesophageal", "gej"],
  ["prostate"],
  ["melanoma"],
  ["hepatocellular", "hcc", "liver cancer"],
  ["bladder", "urothelial"],
  ["renal", "kidney", "rcc"],
  ["lymphoma", "dlbcl", "hodgkin"],
  ["leukemia", "aml", "cml", "cll"],
  ["myeloma"],
  ["cervical"],
  ["endometrial", "uterine"],
  ["head and neck", "hnscc", "oropharyngeal", "laryngeal", "nasopharyngeal"],
  ["esophageal", "oesophageal"],
  ["thyroid"],
  ["sarcoma", "osteosarcoma", "ewing"],
  ["mesothelioma"],
  ["testicular", "germ cell", "seminoma"],
];

// Pan-tumour basket trials genuinely accept any solid tumour.
const BASKET_TERMS = ["solid tumor", "solid tumour", "advanced solid", "any solid"];

// Partial credit for a basket match (full condition weight is 40).
const BASKET_CONDITION_CREDIT = 20;

// Haematological malignancies are NOT solid tumours, so a "solid tumour"
// basket trial must never match them.
const HAEMATOLOGICAL = ["lymphoma", "leukemia", "leukaemia", "myeloma", "dlbcl", "hodgkin", "aml", "cml", "cll", "mds"];

const isHaematological = (cancerType) => {
  const c = norm(cancerType);
  return HAEMATOLOGICAL.some((term) => c.includes(term));
};

function synonymsFor(cancerType) {
  const c = norm(cancerType);
  for (const group of CONDITION_SYNONYMS) {
    if (group.some((term) => c.includes(term))) return group;
  }
  return null;
}

function checkCondition(trial, profile) {
  const meta = WEIGHTS.condition;
  if (!profile.cancerType) {
    return { key: "condition", label: "Cancer type", status: "unknown", detail: "No cancer type on record", ...meta };
  }

  const conditions = trial.conditions || [];
  const haystack = norm(conditions.join(" | "));
  const group = synonymsFor(profile.cancerType);

  if (group && group.some((term) => haystack.includes(term))) {
    // Report the condition that ACTUALLY matched, not conditions[0] — a
    // multi-tumour trial lists many, and naming the wrong one makes the
    // explanation look wrong even when the match is right.
    const matched = conditions.find((c) => group.some((term) => norm(c).includes(term)));
    return {
      key: "condition", label: "Cancer type", status: "met",
      detail: `Trial covers ${matched || profile.cancerType}`, ...meta,
    };
  }
  if (BASKET_TERMS.some((term) => haystack.includes(term)) && !isHaematological(profile.cancerType)) {
    // A basket trial is a genuine but weaker match than a trial written for
    // this cancer. `credit` awards partial points while the full weight stays
    // in the denominator, so exact matches always outrank baskets.
    return {
      key: "condition", label: "Cancer type", status: "met",
      detail: "Pan-tumour basket trial — open to any solid tumour, not specific to this cancer",
      ...meta, credit: BASKET_CONDITION_CREDIT,
    };
  }
  return {
    key: "condition", label: "Cancer type", status: "notMet",
    detail: `Trial is for ${trial.conditions?.[0] || "another condition"}, patient has ${profile.cancerType}`, ...meta,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BIOMARKER — the payoff of variant-level extraction
// ─────────────────────────────────────────────────────────────────────────────
const GENE_PATTERNS = {
  EGFR:  /\begfr\b/i,
  KRAS:  /\bkras\b/i,
  BRAF:  /\bbraf\b/i,
  ALK:   /\balk\b/i,
  HER2:  /\bher2\b|\berbb2\b/i,
  BRCA1: /\bbrca1\b|\bbrca\b/i,
  BRCA2: /\bbrca2\b|\bbrca\b/i,
  ROS1:  /\bros1\b/i,
  MET:   /\bmet\s+(amplification|exon)\b/i,
  NRAS:  /\bnras\b/i,
};

const POSITIVE_STATUSES = new Set(["mutated", "positive", "amplified"]);

// Does the trial ask for a specific variant of this gene?
function variantRequirement(eligibility, gene) {
  const t = norm(eligibility);
  if (gene === "EGFR") {
    if (/exon\s*20\s*(insertion|ins)/.test(t)) return "Exon 20 insertion";
    if (/exon\s*19\s*(deletion|del)/.test(t)) return "Exon 19 deletion";
    if (/\bl858r\b/.test(t)) return "L858R";
    if (/\bt790m\b/.test(t)) return "T790M";
  }
  if (gene === "KRAS" && /\bg12c\b/.test(t)) return "G12C";
  if (gene === "BRAF" && /\bv600e\b/.test(t)) return "V600E";
  return null;
}

function checkBiomarker(trial, profile) {
  const meta = WEIGHTS.biomarker;
  const eligibility = trial.eligibilityText || "";
  if (!eligibility.trim()) return null; // not applicable — nothing to compare

  // Which genes does this trial actually talk about?
  const mentioned = Object.entries(GENE_PATTERNS)
    .filter(([, re]) => re.test(eligibility))
    .map(([gene]) => gene);

  if (mentioned.length === 0) return null; // not applicable

  const hits = [];
  const misses = [];
  const unknowns = [];

  for (const gene of mentioned) {
    const patient = profile.biomarkers?.[gene];
    if (!patient || !patient.status) {
      unknowns.push(gene);
      continue;
    }

    const required = variantRequirement(eligibility, gene);
    const isPositive = POSITIVE_STATUSES.has(norm(patient.status));

    if (required && patient.variant) {
      // Variant-level comparison — this is why exon 19 vs exon 20 matters.
      if (norm(patient.variant) === norm(required)) hits.push(`${gene} ${patient.variant}`);
      else misses.push(`${gene} ${patient.variant} (trial requires ${required})`);
    } else if (required && !patient.variant) {
      unknowns.push(`${gene} (trial requires ${required}, patient variant not specified)`);
    } else if (isPositive) {
      hits.push(patient.variant ? `${gene} ${patient.variant}` : `${gene} ${patient.status}`);
    } else {
      misses.push(`${gene} ${patient.status}`);
    }
  }

  if (hits.length > 0) {
    return { key: "biomarker", label: "Biomarker", status: "met", detail: hits.join("; "), ...meta };
  }
  if (misses.length > 0) {
    return { key: "biomarker", label: "Biomarker", status: "notMet", detail: misses.join("; "), ...meta };
  }
  return {
    key: "biomarker", label: "Biomarker", status: "unknown",
    detail: `Trial references ${unknowns.join(", ")} — no result on record`, ...meta,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE
// ─────────────────────────────────────────────────────────────────────────────
function checkStage(trial, profile) {
  const meta = WEIGHTS.stage;
  const t = norm(trial.eligibilityText);
  const wantsAdvanced = /\b(metastatic|advanced|stage\s*(iv|4)|unresectable|recurrent)\b/.test(t);
  const wantsEarly = /\b(early[- ]stage|stage\s*(i|1|ii|2)\b|adjuvant|neoadjuvant|resectable)\b/.test(t);
  if (!wantsAdvanced && !wantsEarly) return null; // not applicable

  if (!profile.stage) {
    return { key: "stage", label: "Disease stage", status: "unknown", detail: "No stage on record", ...meta };
  }

  const s = norm(profile.stage);
  const patientAdvanced = /\b(iv|4)\b/.test(s) || s === "extensive";
  const patientEarly = /^(0|i|ii|1|2)[abc]?$/.test(s) || s === "limited";

  if (wantsAdvanced && patientAdvanced) {
    return { key: "stage", label: "Disease stage", status: "met", detail: `Stage ${profile.stage} — trial enrols advanced/metastatic disease`, ...meta };
  }
  if (wantsEarly && patientEarly) {
    return { key: "stage", label: "Disease stage", status: "met", detail: `Stage ${profile.stage} — trial enrols early-stage disease`, ...meta };
  }
  if (wantsAdvanced && patientEarly) {
    return { key: "stage", label: "Disease stage", status: "notMet", detail: `Trial requires advanced/metastatic disease, patient is stage ${profile.stage}`, ...meta };
  }
  if (wantsEarly && patientAdvanced) {
    return { key: "stage", label: "Disease stage", status: "notMet", detail: `Trial requires early-stage disease, patient is stage ${profile.stage}`, ...meta };
  }
  return { key: "stage", label: "Disease stage", status: "unknown", detail: `Stage ${profile.stage} — trial's stage requirement is not stated precisely`, ...meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// ECOG
// ─────────────────────────────────────────────────────────────────────────────
function parseEcogRange(eligibility) {
  const t = norm(eligibility);
  const range = t.match(/ecog[^.]{0,30}?\b([0-4])\s*(?:-|to|–|or)\s*([0-4])\b/) ||
                t.match(/performance status[^.]{0,30}?\b([0-4])\s*(?:-|to|–|or)\s*([0-4])\b/);
  if (range) return { min: parseInt(range[1]), max: parseInt(range[2]) };

  const atMost = t.match(/ecog[^.]{0,30}?(?:≤|<=|of|less than or equal to|not exceeding)\s*([0-4])\b/) ||
                 t.match(/performance status[^.]{0,30}?(?:≤|<=|of)\s*([0-4])\b/);
  if (atMost) return { min: 0, max: parseInt(atMost[1]) };

  const exact = t.match(/ecog[^.]{0,20}?\bof\s*([0-4])\b/);
  if (exact) return { min: 0, max: parseInt(exact[1]) };

  return null;
}

function checkEcog(trial, profile) {
  const meta = WEIGHTS.ecog;
  const range = parseEcogRange(trial.eligibilityText);
  if (!range) return null; // not applicable

  if (profile.ecog === null || profile.ecog === undefined) {
    return { key: "ecog", label: "ECOG performance status", status: "unknown", detail: `Trial requires ECOG ${range.min}-${range.max}; no ECOG on record`, ...meta };
  }
  const ecog = Number(profile.ecog);
  if (ecog >= range.min && ecog <= range.max) {
    return { key: "ecog", label: "ECOG performance status", status: "met", detail: `ECOG ${ecog} is within the required ${range.min}-${range.max}`, ...meta };
  }
  return { key: "ecog", label: "ECOG performance status", status: "notMet", detail: `ECOG ${ecog} is outside the required ${range.min}-${range.max}`, ...meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// AGE / SEX
// ─────────────────────────────────────────────────────────────────────────────
function checkAge(trial, profile) {
  const meta = WEIGHTS.age;
  const { minAgeYears: min, maxAgeYears: max } = trial;
  if (min == null && max == null) return null; // not applicable

  const bounds = `${min != null ? min + "y" : "any"}–${max != null ? max + "y" : "any"}`;
  if (profile.age == null) {
    return { key: "age", label: "Age", status: "unknown", detail: `Trial accepts ${bounds}; no age on record`, ...meta };
  }
  const age = Number(profile.age);
  if ((min != null && age < min) || (max != null && age > max)) {
    return { key: "age", label: "Age", status: "notMet", detail: `Patient is ${age}; trial accepts ${bounds}`, ...meta };
  }
  return { key: "age", label: "Age", status: "met", detail: `Patient is ${age}; trial accepts ${bounds}`, ...meta };
}

function checkSex(trial, profile) {
  const meta = WEIGHTS.sex;
  const required = norm(trial.sex);
  if (!required || required === "all") return null; // not applicable

  if (!profile.sex) {
    return { key: "sex", label: "Sex", status: "unknown", detail: `Trial enrols ${required} only; no sex on record`, ...meta };
  }
  if (norm(profile.sex) === required) {
    return { key: "sex", label: "Sex", status: "met", detail: `Trial enrols ${required}`, ...meta };
  }
  return { key: "sex", label: "Sex", status: "notMet", detail: `Trial enrols ${required} only; patient is ${profile.sex}`, ...meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIOR TREATMENT LINES
// ─────────────────────────────────────────────────────────────────────────────
function checkPriorLines(trial, profile) {
  const meta = WEIGHTS.priorLines;
  const t = norm(trial.eligibilityText);
  const wantsNaive = /\b(treatment[- ]na[iï]ve|no prior (systemic|chemotherapy|therapy)|previously untreated|first[- ]line)\b/.test(t);
  const wantsPretreated = /\b(previously treated|at least one prior|≥\s*1 prior|progressed (on|after)|second[- ]line|refractory to)\b/.test(t);
  if (!wantsNaive && !wantsPretreated) return null; // not applicable

  if (profile.priorLines == null) {
    const need = wantsNaive ? "treatment-naïve patients" : "previously treated patients";
    return { key: "priorLines", label: "Prior treatment lines", status: "unknown", detail: `Trial enrols ${need}; prior lines not recorded`, ...meta };
  }
  const lines = Number(profile.priorLines);
  if (wantsNaive) {
    return lines === 0
      ? { key: "priorLines", label: "Prior treatment lines", status: "met", detail: "Treatment-naïve, as the trial requires", ...meta }
      : { key: "priorLines", label: "Prior treatment lines", status: "notMet", detail: `Trial requires treatment-naïve; patient has had ${lines} prior line(s)`, ...meta };
  }
  return lines >= 1
    ? { key: "priorLines", label: "Prior treatment lines", status: "met", detail: `${lines} prior line(s); trial enrols previously treated patients`, ...meta }
    : { key: "priorLines", label: "Prior treatment lines", status: "notMet", detail: "Trial requires prior therapy; patient is treatment-naïve", ...meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Score one trial. Returns null when a hard-fail criterion is definitively not
 * met — such a trial is excluded rather than shown with a low score, because
 * displaying an ineligible trial is worse than showing nothing.
 */
function scoreTrial(trial, profile) {
  const checks = [
    checkCondition(trial, profile),
    checkBiomarker(trial, profile),
    checkStage(trial, profile),
    checkEcog(trial, profile),
    checkAge(trial, profile),
    checkSex(trial, profile),
    checkPriorLines(trial, profile),
  ].filter(Boolean); // nulls = criterion not applicable to this trial

  // A trial that publishes almost no eligibility detail (registries, natural
  // history studies) can only be checked on one or two criteria. Dropping the
  // rest would score it 100% — a confident number resting on almost nothing.
  // Record that thinness as an explicit UNKNOWN so it both damps the score and
  // tells the reader why.
  const eligibilityChars = (trial.eligibilityText || "").trim().length;
  if (eligibilityChars < MIN_ELIGIBILITY_CHARS || checks.length < 3) {
    checks.push({
      key: "evidence",
      label: "Eligibility detail",
      status: "unknown",
      detail:
        eligibilityChars < MIN_ELIGIBILITY_CHARS
          ? "This trial publishes little structured eligibility text, so most criteria could not be checked"
          : `Only ${checks.length} criteria could be checked against this trial's published eligibility`,
      weight: THIN_EVIDENCE_WEIGHT,
      hardFail: false,
    });
  }

  const met = [];
  const notMet = [];
  const unknown = [];
  let earned = 0;
  let possible = 0;

  for (const c of checks) {
    if (c.status === "notMet" && c.hardFail) return null; // ineligible

    const entry = { key: c.key, label: c.label, detail: c.detail };
    if (c.status === "met") {
      met.push(entry);
      // `credit` lets a partial match (e.g. a basket trial) earn less than the
      // full weight while still occupying full weight in the denominator.
      earned += c.credit !== undefined ? c.credit : c.weight;
      possible += c.weight;
    } else if (c.status === "notMet") {
      notMet.push(entry);
      possible += c.weight;
    } else {
      unknown.push(entry);
      possible += c.weight * 0.5; // missing data costs confidence, not eligibility
    }
  }

  if (possible === 0) return null; // nothing could be evaluated — no basis to show it

  return {
    ...trial,
    score: Math.round((earned / possible) * 100),
    met,
    notMet,
    unknown,
  };
}

/**
 * Score and rank a list of trials for a patient profile.
 * Every returned trial carries at least one reason — the UI never has to
 * render a bare number.
 */
function matchTrials(trials, profile, limit = 20) {
  // Observational studies (registries, natural-history, quality-of-life
  // surveys) can match a patient perfectly yet offer no treatment. They stay
  // in the list — hiding a legitimate match would be dishonest — but rank
  // below interventional trials so therapy options surface first.
  const rank = (t) => (t.studyType === "OBSERVATIONAL" ? 1 : 0);

  return (trials || [])
    .map((t) => scoreTrial(t, profile))
    .filter((r) => r && (r.met.length > 0 || r.notMet.length > 0 || r.unknown.length > 0))
    .sort((a, b) => rank(a) - rank(b) || b.score - a.score || a.nctId.localeCompare(b.nctId))
    .slice(0, limit);
}

module.exports = { buildProfile, scoreTrial, matchTrials, WEIGHTS };
