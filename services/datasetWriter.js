/**
 * OncoDoseRx — Dataset Writer (continuous learning)
 * =================================================
 * Turns a doctor-confirmed treatment decision into a training row and appends
 * it to `data/cancer_patients.csv` — the same file `ml/generate_and_train.py`
 * produced the synthetic corpus into — so the model retrains on real clinical
 * decisions alongside the synthetic baseline.
 *
 * Two rules keep this safe:
 *
 *  1. ONLY doctor-confirmed rows are written. A row is never created from the
 *     model's own prediction — training a model on its own output collapses it
 *     onto its existing bias instead of teaching it anything new. The label
 *     (`recommended_regimen` + `chemotherapy_cycles`) is always what the
 *     clinician signed off on.
 *
 *  2. Real rows carry an `RW-` patient_id prefix. The CSV schema is otherwise
 *     identical to the synthetic one (same 35 columns, same order, same
 *     categorical vocabulary), so nothing downstream needs to change — but the
 *     retraining script can still find the real rows and up-weight them.
 *
 * A parallel `data/clinical_contributions.csv` keeps the provenance the main
 * schema has no room for (who decided, NCCN concordance, whether the doctor
 * overrode the model, source report id). That file is the audit trail; the
 * main CSV is the training corpus.
 */

"use strict";

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

const { normaliseCancerType } = require("../engine/ml_predictor");

// DATA_DIR is overridable so a test run can point the whole learning loop at a
// throwaway copy of the corpus instead of the live 30 MB one.
const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DATASET_CSV = process.env.DATASET_CSV || path.join(DATA_DIR, "cancer_patients.csv");
const CONTRIB_CSV = path.join(path.dirname(DATASET_CSV), "clinical_contributions.csv");

// How much a real clinical case counts for during retraining, relative to a
// synthetic row. 150k synthetic rows would otherwise drown out the first few
// hundred real ones entirely.
const DEFAULT_SAMPLE_WEIGHT = Number(process.env.CLINICAL_SAMPLE_WEIGHT) || 25;

// Column order of data/cancer_patients.csv. Must stay identical to what
// ml/generate_and_train.py writes — a mismatch would silently shift every
// value one column left when pandas reads the appended rows.
const DATASET_COLUMNS = [
  "patient_id", "age", "gender", "cancer_type", "stage", "grade",
  "t_stage", "n_stage", "m_stage",
  "her2_status", "er_status", "pr_status", "hr_status", "ki67_score",
  "egfr_status", "pdl1_status", "kras_status", "nras_status", "braf_status",
  "mmr_msi_status", "brca_status",
  "primary_site", "depth_of_invasion", "lvi", "pni",
  "cea_value", "tumour_size_cm", "lymph_nodes_positive", "lymph_nodes_total",
  "ecog_ps", "charlson_score", "prior_treatment", "treatment_intent",
  "recommended_regimen", "chemotherapy_cycles",
];

// Provenance columns — sidecar file only, never in the training CSV.
const CONTRIB_COLUMNS = [
  ...DATASET_COLUMNS,
  "contributed_at", "source_report_id", "source_patient_id",
  "nccn_concordance", "decided_by", "overrode_model",
  "model_predicted_regimen", "model_predicted_cycles", "sample_weight",
];

// "N/A" is what the synthetic generator writes for a categorical field that
// does not apply to this cancer — matching it keeps the label encoder stable.
const NA = "N/A";

// ── Value mappers (parser vocabulary → dataset vocabulary) ────────────────────

function mapGrade(grade) {
  switch (String(grade || "").toLowerCase()) {
    case "low":          return "Grade 1 (Low)";
    case "intermediate": return "Grade 2 (Moderate)";
    case "high":         return "Grade 3 (High)";
    default:             return NA;
  }
}

function mapStage(stage) {
  if (!stage) return "";
  const s = String(stage).toUpperCase().replace(/[^IV0]/g, "");
  if (s.startsWith("IV"))  return "IV";
  if (s.startsWith("III")) return "III";
  if (s.startsWith("II"))  return "II";
  if (s.startsWith("I"))   return "I";
  return "";
}

// The parser returns TNM without the letter prefix and sometimes with a
// subletter ("3", "4A", "IS", "X"); the dataset only ever has T1–T4 / N0–N3 /
// M0–M1, so anything else becomes N/A rather than a new encoder class.
function mapT(t) {
  const m = String(t || "").match(/^([0-4])/);
  return m ? `T${m[1]}` : NA;
}
function mapN(n) {
  const m = String(n || "").match(/^([0-3])/);
  return m ? `N${m[1]}` : NA;
}
function mapM(m) {
  const v = String(m || "").match(/^([01])/);
  return v ? `M${v[1]}` : NA;
}

function mapPosNeg(v) {
  const s = String(v || "").toLowerCase();
  if (s === "positive" || s === ">=50%") return "Positive";
  if (s === "negative") return "Negative";
  return NA;
}

function mapMutWt(v) {
  const s = String(v || "").toLowerCase();
  if (s === "mutated") return "Mutated";
  if (s === "wild-type" || s === "wildtype") return "Wild-Type";
  return NA;
}

function mapPdl1(bm) {
  if (typeof bm.pdl1Score === "number") {
    if (bm.pdl1Score >= 50) return "High (>=50%)";
    if (bm.pdl1Score >= 1)  return "Low (1-49%)";
    return "Negative (<1%)";
  }
  const s = String(bm.pdl1 || "").toLowerCase();
  if (s === ">=50%")    return "High (>=50%)";
  if (s === "positive") return "Low (1-49%)";
  if (s === "negative") return "Negative (<1%)";
  return NA;
}

function mapMmr(bm) {
  const msi = String(bm.msi || "").toUpperCase();
  if (msi === "MSI-H" || msi === "MSI-L" || msi === "MSS") return msi;
  const mmr = String(bm.mmr || "").toLowerCase();
  if (mmr === "deficient")  return "MSI-H";
  if (mmr === "proficient") return "MSS";
  return NA;
}

function mapBrca(v) {
  const s = String(v || "").toLowerCase();
  if (s === "mutated")   return "Pathogenic Variant";
  if (s === "wild-type") return "No Pathogenic Variant";
  return NA;
}

function mapPresentAbsent(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return NA;
  if (s.includes("present") || s === "positive" || s === "yes") return "Present";
  if (s.includes("absent")  || s === "negative" || s === "no")  return "Absent";
  return NA;
}

function mapGender(v) {
  const s = String(v || "").toLowerCase();
  if (s.startsWith("m")) return "Male";
  if (s.startsWith("f")) return "Female";
  return NA;
}

const INTENTS = ["Curative", "Palliative", "Adjuvant", "Neoadjuvant"];
function mapIntent(v) {
  const s = String(v || "").toLowerCase();
  return INTENTS.find((i) => i.toLowerCase() === s) || "Curative";
}

const PRIOR_TREATMENTS = ["None", "Surgery", "Radiation", "Surgery+Radiation", "Previous Chemo"];
function mapPriorTreatment(v) {
  const s = String(v || "").toLowerCase();
  return PRIOR_TREATMENTS.find((p) => p.toLowerCase() === s) || "None";
}

// Number(null) and Number("") are both 0, so an unparsed field would otherwise
// be written as a real measurement of zero — "0 of 0 lymph nodes positive"
// instead of "not recorded". Missing has to be checked before coercion.
function num(v, fallback = "") {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── parsed report + decision → one dataset row ────────────────────────────────

/**
 * @param {object} args.parsed    the parser output for the report
 * @param {object} args.decision  the clinician's confirmed decision —
 *        { regimen, cycles, intent, priorTreatment, gender, age, ecog, charlson,
 *          cancerType, stage, grade }
 * @returns {{row: object|null, errors: string[]}}
 */
function buildDatasetRow({ parsed = {}, decision = {} }) {
  const errors = [];
  const bm = parsed.biomarkers || {};
  const ln = parsed.lymphNodes || {};

  const cancerType = normaliseCancerType(decision.cancerType || parsed.cancerType);
  const stage      = mapStage(decision.stage || parsed.stage);
  const regimen    = String(decision.regimen || "").trim();
  const cycles     = Number(decision.cycles);

  // A training row is only useful if it has the label AND the two features that
  // carry most of the model's signal (cancer type 32.5%, stage 9.6%).
  if (!cancerType) errors.push("cancer_type could not be resolved to a dataset label");
  if (!stage)      errors.push("stage is required and must resolve to I, II, III or IV");
  if (!regimen)    errors.push("regimen (the decision label) is required");
  if (!Number.isInteger(cycles) || cycles < 0 || cycles > 60) {
    errors.push("cycles must be a whole number between 0 and 60");
  }
  if (errors.length) return { row: null, errors };

  const row = {
    patient_id:           "",           // assigned at append time
    age:                  num(decision.age ?? parsed.age),
    gender:               mapGender(decision.gender ?? parsed.gender),
    cancer_type:          cancerType,
    stage,
    grade:                mapGrade(decision.grade || parsed.grade),
    t_stage:              mapT(parsed.tStage),
    n_stage:              mapN(parsed.nStage),
    m_stage:              mapM(parsed.mStage),
    her2_status:          mapPosNeg(bm.her2),
    er_status:            mapPosNeg(bm.er),
    pr_status:            mapPosNeg(bm.pr),
    hr_status:            mapPosNeg(bm.hr),
    ki67_score:           num(bm.ki67, -1),
    egfr_status:          mapMutWt(bm.egfr),
    pdl1_status:          mapPdl1(bm),
    kras_status:          mapMutWt(bm.kras || bm.ras),
    nras_status:          mapMutWt(bm.nras),
    braf_status:          mapMutWt(bm.braf),
    mmr_msi_status:       mapMmr(bm),
    brca_status:          mapBrca(bm.brca),
    primary_site:         parsed.primarySite || NA,
    depth_of_invasion:    parsed.depthOfInvasion || NA,
    lvi:                  mapPresentAbsent(parsed.lvInvasion),
    pni:                  mapPresentAbsent(parsed.periNeuralInvasion),
    cea_value:            num(bm.cea, -1),
    tumour_size_cm:       num(parsed.tumorSize, -1),
    lymph_nodes_positive: num(ln.lymphNodesPositive, -1),
    lymph_nodes_total:    num(ln.lymphNodesTotal, -1),
    ecog_ps:              num(decision.ecog ?? parsed.performanceStatus, -1),
    charlson_score:       num(decision.charlson, 0),
    prior_treatment:      mapPriorTreatment(decision.priorTreatment),
    treatment_intent:     mapIntent(decision.intent),
    recommended_regimen:  regimen,
    chemotherapy_cycles:  cycles,
  };

  return { row, errors: [] };
}

// ── CSV plumbing ──────────────────────────────────────────────────────────────

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsvLine(row, columns) {
  return columns.map((c) => csvEscape(row[c])).join(",");
}

/**
 * Verifies the on-disk CSV really has the column order this module assumes.
 * Reads only the first 4 KB — the file is ~30 MB.
 */
function verifyHeader() {
  if (!fs.existsSync(DATASET_CSV)) {
    throw new Error(`Training dataset not found at ${DATASET_CSV}`);
  }
  const fd = fs.openSync(DATASET_CSV, "r");
  try {
    const buf = Buffer.alloc(4096);
    const read = fs.readSync(fd, buf, 0, 4096, 0);
    const header = buf.toString("utf8", 0, read).split(/\r?\n/)[0].trim();
    const expected = DATASET_COLUMNS.join(",");
    if (header !== expected) {
      throw new Error(
        "data/cancer_patients.csv header does not match the expected schema — " +
        "refusing to append. Expected:\n  " + expected + "\nFound:\n  " + header
      );
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** True when the file's last byte is a newline (so we know whether to prepend one). */
function endsWithNewline(file) {
  const { size } = fs.statSync(file);
  if (size === 0) return true;
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(1);
    fs.readSync(fd, buf, 0, 1, size - 1);
    return buf[0] === 0x0a;
  } finally {
    fs.closeSync(fd);
  }
}

function ensureContribFile() {
  if (!fs.existsSync(CONTRIB_CSV)) {
    fs.writeFileSync(CONTRIB_CSV, CONTRIB_COLUMNS.join(",") + "\n", "utf8");
  }
}

/** Number of clinical rows contributed so far — also the RW- id sequence. */
function contributionCount() {
  if (!fs.existsSync(CONTRIB_CSV)) return 0;
  const text = fs.readFileSync(CONTRIB_CSV, "utf8");
  return Math.max(0, text.split("\n").filter((l) => l.trim().length > 0).length - 1);
}

/**
 * Stable fingerprint of the clinical content of a row, used to reject the same
 * case being contributed twice (a doctor re-submitting the same analysis).
 */
function rowFingerprint(row) {
  const material = DATASET_COLUMNS
    .filter((c) => c !== "patient_id")
    .map((c) => row[c])
    .join("|");
  return crypto.createHash("sha1").update(material).digest("hex");
}

/**
 * Appends one confirmed case to the training corpus and the audit sidecar.
 * Both writes are a single-line `appendFileSync`, which is atomic enough for
 * the single-process Express server this runs in.
 *
 * @returns {{patientId: string, fingerprint: string, sampleWeight: number}}
 */
function appendContribution(row, provenance = {}) {
  verifyHeader();
  ensureContribFile();

  const seq = contributionCount() + 1;
  const patientId = `RW-${String(seq).padStart(6, "0")}`;
  const fullRow = { ...row, patient_id: patientId };
  const fingerprint = rowFingerprint(fullRow);
  const sampleWeight = Number(provenance.sampleWeight) || DEFAULT_SAMPLE_WEIGHT;

  const prefix = endsWithNewline(DATASET_CSV) ? "" : "\n";
  fs.appendFileSync(DATASET_CSV, prefix + toCsvLine(fullRow, DATASET_COLUMNS) + "\n", "utf8");

  fs.appendFileSync(
    CONTRIB_CSV,
    toCsvLine(
      {
        ...fullRow,
        contributed_at:          new Date().toISOString(),
        source_report_id:        provenance.reportId || "",
        source_patient_id:       provenance.patientId || "",
        nccn_concordance:        provenance.nccnConcordance || "",
        decided_by:              provenance.decidedBy || "",
        overrode_model:          provenance.overrodeModel ? "yes" : "no",
        model_predicted_regimen: provenance.modelRegimen || "",
        model_predicted_cycles:  provenance.modelCycles ?? "",
        sample_weight:           sampleWeight,
      },
      CONTRIB_COLUMNS
    ) + "\n",
    "utf8"
  );

  return { patientId, fingerprint, sampleWeight };
}

/** Total rows in the training corpus, counted without loading 30 MB into memory. */
function datasetRowCount() {
  if (!fs.existsSync(DATASET_CSV)) return 0;
  let count = 0;
  const fd = fs.openSync(DATASET_CSV, "r");
  try {
    const buf = Buffer.alloc(1024 * 1024);
    let read;
    while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      for (let i = 0; i < read; i++) if (buf[i] === 0x0a) count++;
    }
  } finally {
    fs.closeSync(fd);
  }
  return Math.max(0, count - 1); // minus the header
}

module.exports = {
  DATASET_COLUMNS,
  DATASET_CSV,
  CONTRIB_CSV,
  DEFAULT_SAMPLE_WEIGHT,
  buildDatasetRow,
  appendContribution,
  contributionCount,
  datasetRowCount,
  rowFingerprint,
  verifyHeader,
};
