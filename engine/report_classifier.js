/**
 * OncoDoseRx — Report Type Classifier
 * =====================================
 * Detects what KIND of report was uploaded before any prediction runs.
 *
 * Core principle (from clinical guidance):
 *   "Your system should first determine what type of report it is
 *    before applying a cancer-specific prediction model."
 *
 * Report types detected:
 *   TUMOR_MARKER    — CA 15-3, CA 19-9, CA 125, CEA, AFP, PSA (alone)
 *   HISTOPATHOLOGY  — biopsy / pathology / surgical specimen report
 *   COLONOSCOPY     — endoscopy / colonoscopy report
 *   IMAGING         — CECT / CT scan / MRI / PET / X-ray / ultrasound
 *   MOLECULAR       — KRAS/NRAS/BRAF/NGS/MSI/MMR genetic panel
 *   BLOOD           — CBC / blood count / haematology report
 *   SURGICAL_PATH   — post-operative / surgical resection specimen
 *   CLINICAL_NOTES  — clinical / discharge / consultation notes
 *   UNKNOWN         — cannot be classified
 */

"use strict";

const norm = t => t.toLowerCase().replace(/[^a-z0-9\s\-\.]/g, " ").replace(/\s+/g, " ").trim();

// ── Report-type signature patterns ───────────────────────────────────────────
const REPORT_SIGNATURES = [

  // ── Tumor markers (standalone labs) ─────────────────────────────────────
  {
    type: "TUMOR_MARKER",
    label: "Tumor Marker Lab Report",
    markers: ["ca 15-3", "ca15-3", "ca-15-3", "ca 153",
               "ca 19-9", "ca19-9", "ca-19-9", "ca 199",
               "ca 125",  "ca125",  "ca-125",
               "cea",     "carcinoembryonic antigen",
               "afp",     "alpha-fetoprotein",
               "psa",     "prostate specific antigen",
               "ca 27-29","hcg",    "lhd",     "nse",
               "cyfra",   "scc antigen", "her2 serum",
               "beta-hcg"],
    // Keywords that indicate it is ONLY a marker report (no histology)
    exclusiveHints: ["reference range", "result", "units", "ng/ml", "u/ml", "iu/ml",
                     "laboratory report", "lab report", "serology"],
    // Keywords that disqualify it from being a standalone marker report
    promoters: ["histopathology", "biopsy", "specimen", "colonoscopy", "cect", "ct scan"],
  },

  // ── Histopathology / Biopsy ──────────────────────────────────────────────
  {
    type: "HISTOPATHOLOGY",
    label: "Histopathology / Biopsy Report",
    markers: ["histopathology", "histopathological", "biopsy", "pathology report",
               "microscopic examination", "microscopy", "macroscopic description",
               "core needle biopsy", "excision biopsy", "incision biopsy",
               "fine needle aspiration", "fnac", "fna", "cytology",
               "haematoxylin", "hematoxylin", "eosin", "h&e stain",
               "immunohistochemistry", "ihc", "tumour", "carcinoma",
               "adenocarcinoma", "sections show", "sections reveal",
               "tumour grade", "differentiation", "mitoses", "ki67",
               "lymphovascular invasion", "perineural invasion",
               "resection margins", "surgical margins"],
    exclusiveHints: [],
    promoters: [],
  },

  // ── Colonoscopy / Endoscopy ──────────────────────────────────────────────
  {
    type: "COLONOSCOPY",
    label: "Colonoscopy / Endoscopy Report",
    markers: ["colonoscopy", "endoscopy", "colonoscopic", "endoscopic",
               "sigmoidoscopy", "gastroscopy", "esophagoscopy",
               "ascending colon", "descending colon", "transverse colon",
               "sigmoid colon", "rectosigmoid", "ileocaecal",
               "polyp", "polypectomy", "biopsy taken", "mucosal lesion",
               "luminal obstruction", "bleeding per rectum",
               "scope passed", "cecum reached", "retroflexion"],
    exclusiveHints: [],
    promoters: [],
  },

  // ── Imaging (CECT, CT, MRI, PET, USG) ───────────────────────────────────
  {
    type: "IMAGING",
    label: "Radiology / Imaging Report (CT / MRI / PET / USG)",
    markers: ["cect", "contrast enhanced ct", "computed tomography",
               "ct scan", "ct chest", "ct abdomen", "ct pelvis",
               "mri", "magnetic resonance", "pet scan", "pet-ct",
               "positron emission", "ultrasound", "usg", "sonography",
               "x-ray", "chest x-ray", "radiograph",
               "lymph node", "metastasis", "lesion", "mass",
               "liver lesion", "lung nodule", "adrenal", "retroperitoneal",
               "hounsfield", "mm in size", "cm in size", "enhancing lesion",
               "impression:", "findings:", "no evidence of metastasis"],
    exclusiveHints: [],
    promoters: [],
  },

  // ── Molecular / Genetic panel ────────────────────────────────────────────
  {
    type: "MOLECULAR",
    label: "Molecular / Genetic Testing Report",
    markers: ["molecular testing", "molecular pathology", "next generation sequencing",
               "ngs report", "genomic profiling", "genetic testing",
               "kras mutation", "nras mutation", "braf mutation", "braf v600",
               "mlh1", "msh2", "msh6", "pms2",
               "msi testing", "msi-h", "msi-l", "mss",
               "mmr testing", "mismatch repair",
               "microsatellite instability",
               "tmb", "tumour mutational burden",
               "her2 amplification", "fish", "cish",
               "egfr mutation analysis", "alk rearrangement",
               "ros1", "ret fusion", "met amplification",
               "brca1", "brca2", "brca mutation"],
    exclusiveHints: [],
    promoters: [],
  },

  // ── Post-surgical / Resection specimen ──────────────────────────────────
  {
    type: "SURGICAL_PATH",
    label: "Surgical Histopathology Report (Post-Operative)",
    markers: ["right hemicolectomy", "left hemicolectomy", "anterior resection",
               "whipple", "mastectomy", "lumpectomy", "prostatectomy",
               "nephrectomy", "cystectomy", "hysterectomy",
               "surgical specimen", "resection specimen",
               "lymph nodes examined", "lymph nodes positive",
               "lymph nodes negative", "nodes retrieved",
               "proximal margin", "distal margin", "circumferential margin",
               "pt stage", "pn stage", "pm stage",
               "pathological stage", "tnm stage", "ptnm",
               "depth of invasion", "subserosa", "muscularis propria",
               "serosa", "perforated"],
    exclusiveHints: [],
    promoters: [],
  },

  // ── Blood / CBC ──────────────────────────────────────────────────────────
  {
    type: "BLOOD",
    label: "Blood / Haematology Report",
    markers: ["complete blood count", "cbc", "haemoglobin", "hemoglobin",
               "white blood cell", "wbc", "platelet", "rbc",
               "differential count", "neutrophil", "lymphocyte",
               "monocyte", "eosinophil", "basophil",
               "mcv", "mch", "mchc", "haematocrit", "hematocrit",
               "blood film", "peripheral smear"],
    exclusiveHints: [],
    promoters: [],
  },

  // ── Clinical notes / Discharge summary ──────────────────────────────────
  {
    type: "CLINICAL_NOTES",
    label: "Clinical Notes / Discharge Summary",
    markers: ["discharge summary", "discharge note", "clinical notes",
               "consultation note", "referred to", "admitted on",
               "clinical history", "presenting complaints",
               "examination findings", "plan of management",
               "follow up", "advised", "prescribed"],
    exclusiveHints: [],
    promoters: [],
  },
];

// ── Tumor-marker to cancer-type mapping ──────────────────────────────────────
// Used to warn when a marker doesn't match the cancer type detected
const MARKER_CANCER_MAP = {
  "ca 15-3":  "Breast Cancer",
  "ca15-3":   "Breast Cancer",
  "ca-15-3":  "Breast Cancer",
  "ca 153":   "Breast Cancer",
  "ca 27-29": "Breast Cancer",
  "ca 19-9":  "Pancreatic Cancer",
  "ca19-9":   "Pancreatic Cancer",
  "ca-19-9":  "Pancreatic Cancer",
  "ca 199":   "Pancreatic Cancer",
  "ca 125":   "Ovarian Cancer",
  "ca125":    "Ovarian Cancer",
  "ca-125":   "Ovarian Cancer",
  "afp":      "Hepatocellular Carcinoma (HCC)",
  "psa":      "Prostate Cancer",
  "hcg":      "Testicular Cancer",
  "beta-hcg": "Testicular Cancer",
  "nse":      "Small Cell Lung Cancer (SCLC)",
};

// ── Detect report type ────────────────────────────────────────────────────────
function classifyReport(text) {
  const t = norm(text);

  const typeScores = {};
  const typeMatches = {};

  for (const sig of REPORT_SIGNATURES) {
    let score = 0;
    const matched = [];

    for (const kw of sig.markers) {
      if (t.includes(kw)) {
        score++;
        matched.push(kw);
      }
    }

    // Check disqualifiers for tumor-marker type
    if (sig.type === "TUMOR_MARKER" && score > 0) {
      for (const promo of sig.promoters) {
        if (t.includes(promo)) {
          score = Math.max(0, score - 3); // Heavily penalise if other report content found
        }
      }
    }

    if (score > 0) {
      typeScores[sig.type] = score;
      typeMatches[sig.type] = { label: sig.label, keywords: matched };
    }
  }

  if (Object.keys(typeScores).length === 0) {
    return {
      primaryType:  "UNKNOWN",
      primaryLabel: "Unknown Report Type",
      allTypes:     [],
      markerMismatch: null,
      isTumorMarkerOnly: false,
    };
  }

  // Sort by score
  const sorted = Object.entries(typeScores)
    .sort(([, a], [, b]) => b - a)
    .map(([type]) => ({
      type,
      label:    typeMatches[type].label,
      keywords: typeMatches[type].keywords,
      score:    typeScores[type],
    }));

  const primaryType  = sorted[0].type;
  const primaryLabel = sorted[0].label;

  // Is this ONLY a tumor marker report (no pathology/imaging content)?
  const isTumorMarkerOnly =
    primaryType === "TUMOR_MARKER" &&
    !typeScores["HISTOPATHOLOGY"] &&
    !typeScores["SURGICAL_PATH"] &&
    !typeScores["IMAGING"] &&
    !typeScores["COLONOSCOPY"] &&
    !typeScores["MOLECULAR"];

  // Check marker–cancer mismatch
  let markerMismatch = null;
  if (typeScores["TUMOR_MARKER"]) {
    const foundMarkers = typeMatches["TUMOR_MARKER"].keywords;
    for (const marker of foundMarkers) {
      const expectedCancer = MARKER_CANCER_MAP[marker];
      if (expectedCancer) {
        markerMismatch = { marker, expectedCancer };
        break;
      }
    }
  }

  // Detect which markers are present
  const detectedMarkers = (typeMatches["TUMOR_MARKER"]?.keywords || []).filter(
    k => MARKER_CANCER_MAP[k]
  );

  return {
    primaryType,
    primaryLabel,
    allTypes: sorted,
    isTumorMarkerOnly,
    markerMismatch,
    detectedMarkers,
  };
}

module.exports = { classifyReport, MARKER_CANCER_MAP };
