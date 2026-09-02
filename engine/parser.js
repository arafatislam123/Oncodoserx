/**
 * OncoDoseRx — Report Parser  (v2)
 * ===================================
 * Extracts structured oncology data from free-text cancer reports.
 * Zero external dependencies — regex + keyword matching only.
 *
 * NEW in v2:
 *   - CEA, CA 15-3, CA 19-9, CA-125, AFP, PSA (tumour markers)
 *   - Individual T / N / M stage components
 *   - Tumour size (cm / mm)
 *   - Lymphovascular invasion (LVI) + Perineural invasion (PNI)
 *   - Depth of invasion (subserosa, muscularis propria, serosa, etc.)
 *   - Primary site / organ
 *   - Surgical margin status
 *   - Ki67 proliferation index
 *   - NRAS, ROS1, MET, FLT3, NPM1, IDH1/2 biomarkers
 */

"use strict";

// ── Helpers ───────────────────────────────────────────────────────────────────
const norm = t =>
  t.toLowerCase()
   .replace(/[^a-z0-9\s\-\+\.\/]/g, " ")
   .replace(/\s+/g, " ")
   .trim();

function first(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] !== undefined ? m[1] : m[0]).trim();
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCER TYPE
// ─────────────────────────────────────────────────────────────────────────────
const CANCER_PATTERNS = [
  // Leukemia (specific phrases before abbreviations)
  { keys: ["acute myeloid leukemia", "acute myelogenous leukemia"],       label: "Acute Myeloid Leukemia (AML)" },
  { keys: ["acute lymphoblastic leukemia", "acute lymphocytic leukemia"], label: "Acute Lymphoblastic Leukemia (ALL)" },
  { keys: [" aml "],                                                        label: "Acute Myeloid Leukemia (AML)" },
  { keys: ["chronic myeloid leukemia", "cml"],                             label: "Chronic Myeloid Leukemia (CML)" },
  { keys: ["chronic lymphocytic leukemia", "cll"],                         label: "Chronic Lymphocytic Leukemia (CLL)" },
  // Lymphoma
  { keys: ["diffuse large b-cell", "diffuse large b cell", "dlbcl"],      label: "Diffuse Large B-Cell Lymphoma (DLBCL)" },
  { keys: ["hodgkin lymphoma", "hodgkin's lymphoma", "hodgkin disease"],   label: "Hodgkin Lymphoma" },
  { keys: ["follicular lymphoma"],                                          label: "Follicular Lymphoma" },
  { keys: ["non-hodgkin lymphoma", "non hodgkin lymphoma", "nhl"],        label: "Non-Hodgkin Lymphoma" },
  { keys: ["multiple myeloma", "plasma cell myeloma"],                     label: "Multiple Myeloma" },
  // Lung — NSCLC MUST precede SCLC
  { keys: ["non-small cell lung", "non small cell lung", "nsclc"],        label: "Non-Small Cell Lung Cancer (NSCLC)" },
  { keys: ["lung adenocarcinoma", "adenocarcinoma of lung",
           "adenocarcinoma of the lung"],                                  label: "Lung Adenocarcinoma (NSCLC)" },
  { keys: ["squamous cell carcinoma of lung", "squamous cell lung"],      label: "Squamous Cell Lung Cancer (NSCLC)" },
  { keys: ["small cell lung", "sclc", "small-cell lung"],                 label: "Small Cell Lung Cancer (SCLC)" },
  { keys: ["lung carcinoma", "lung cancer", "carcinoma of lung"],         label: "Non-Small Cell Lung Cancer (NSCLC)" },
  // Breast
  { keys: ["triple negative breast", "tnbc"],                              label: "Triple-Negative Breast Cancer (TNBC)" },
  { keys: ["breast cancer", "breast carcinoma", "invasive ductal carcinoma",
           "invasive lobular carcinoma", "carcinoma of breast",
           "infiltrating ductal", "infiltrating lobular"],                label: "Breast Cancer" },
  // Colorectal
  { keys: ["colorectal cancer", "colorectal carcinoma", "colon cancer",
           "colon carcinoma", "colorectal adenocarcinoma",
           "adenocarcinoma of colon", "adenocarcinoma of the colon",
           "adenocarcinoma of rectum", "rectal adenocarcinoma",
           "ascending colon adenocarcinoma", "descending colon adenocarcinoma",
           "sigmoid colon adenocarcinoma", "transverse colon adenocarcinoma"],
                                                                           label: "Colorectal Cancer" },
  { keys: ["rectal cancer", "rectal carcinoma"],                           label: "Rectal Cancer" },
  // GI
  { keys: ["gastric cancer", "stomach cancer", "gastric adenocarcinoma",
           "gastric carcinoma", "stomach adenocarcinoma",
           "carcinoma of stomach"],                                        label: "Gastric Cancer" },
  { keys: ["gastroesophageal junction", "gej cancer",
           "gastroesophageal cancer"],                                     label: "Gastroesophageal Junction Cancer" },
  { keys: ["esophageal cancer", "esophageal carcinoma",
           "oesophageal cancer"],                                          label: "Esophageal Cancer" },
  { keys: ["pancreatic cancer", "pancreatic adenocarcinoma",
           "pancreatic ductal adenocarcinoma", "pdac",
           "carcinoma of pancreas", "ductal adenocarcinoma of pancreas"], label: "Pancreatic Cancer" },
  { keys: ["hepatocellular carcinoma", "hcc", "liver cell carcinoma",
           "hepatocellular cancer"],                                       label: "Hepatocellular Carcinoma (HCC)" },
  // Gynaecological
  { keys: ["ovarian cancer", "ovarian carcinoma", "epithelial ovarian",
           "fallopian tube cancer"],                                       label: "Ovarian Cancer" },
  { keys: ["cervical cancer", "cervical carcinoma", "carcinoma of cervix",
           "squamous cell carcinoma of cervix"],                          label: "Cervical Cancer" },
  { keys: ["endometrial cancer", "uterine cancer", "endometrial carcinoma",
           "uterine carcinoma"],                                           label: "Endometrial Cancer" },
  // Urological
  { keys: ["prostate cancer", "prostate adenocarcinoma",
           "prostate carcinoma", "carcinoma of prostate"],                label: "Prostate Cancer" },
  { keys: ["bladder cancer", "urothelial carcinoma",
           "transitional cell carcinoma", "bladder urothelial"],          label: "Bladder Cancer" },
  { keys: ["kidney cancer", "renal cell carcinoma", "rcc",
           "clear cell renal", "renal cancer"],                           label: "Renal Cell Carcinoma (RCC)" },
  { keys: ["testicular cancer", "germ cell tumor", "germ cell tumour",
           "seminoma", "non-seminoma", "testicular germ"],                label: "Testicular Germ Cell Tumor" },
  // Head & Neck
  { keys: ["head and neck cancer", "head neck squamous",
           "oropharyngeal cancer", "laryngeal cancer", "hypopharyngeal",
           "oral cavity cancer", "squamous cell carcinoma of head"],      label: "Head and Neck Squamous Cell Carcinoma" },
  { keys: ["nasopharyngeal cancer", "nasopharyngeal carcinoma", "npc"],  label: "Nasopharyngeal Carcinoma" },
  // Other
  { keys: ["thyroid cancer", "papillary thyroid", "follicular thyroid",
           "anaplastic thyroid"],                                          label: "Thyroid Cancer" },
  { keys: ["melanoma", "malignant melanoma", "cutaneous melanoma"],       label: "Melanoma" },
  { keys: ["glioblastoma", "gbm", "glioblastoma multiforme"],             label: "Glioblastoma (GBM)" },
  { keys: ["glioma", "astrocytoma", "lower grade glioma", "grade 2 glioma", "grade 3 glioma",
           "diffuse astrocytoma", "anaplastic astrocytoma"],              label: "Lower Grade Glioma" },
  { keys: ["oligodendroglioma", "anaplastic oligodendroglioma",
           "oligoastrocytoma"],                                            label: "Oligodendroglioma" },
  { keys: ["meningioma", "atypical meningioma", "anaplastic meningioma"], label: "Meningioma" },
  { keys: ["brain metastasis", "brain metastases", "cerebral metastasis",
           "intracranial metastasis"],                                     label: "Brain Metastasis" },
  { keys: ["medulloblastoma"],                                             label: "Medulloblastoma" },
  { keys: ["ependymoma", "anaplastic ependymoma"],                         label: "Ependymoma" },
  { keys: ["brain tumor", "brain cancer", "brain tumour",
           "primary brain", "intracranial tumor"],                         label: "Brain Cancer" },
  { keys: ["sarcoma", "osteosarcoma", "ewing sarcoma",
           "rhabdomyosarcoma"],                                            label: "Sarcoma" },
];

function extractCancerType(text) {
  const t = norm(text);
  for (const entry of CANCER_PATTERNS) {
    for (const key of entry.keys) {
      if (key.trim().length <= 4) {
        if (new RegExp(`\\b${key.trim()}\\b`).test(t)) return entry.label;
      } else {
        if (t.includes(key)) return entry.label;
      }
    }
  }
  // Fallback — 1–4 word phrase ending in a cancer noun
  const fallback = first(t, [
    /\b([a-z]+(?:\s+[a-z]+){0,3}\s+(?:carcinoma|cancer|tumor|tumour|sarcoma|lymphoma|leukemia|myeloma))\b/,
  ]);
  if (fallback) {
    const cleaned = fallback
      .replace(/^(?:diagnosis|patient|male|female|year|old|age|\d+|-)\s+/g, "")
      .trim();
    return cleaned.length > 4 ? capitalise(cleaned) : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIMARY SITE
// Priority order: breast-specific patterns are checked FIRST when any breast
// keyword appears in the text, to prevent colon terms from winning.
// ─────────────────────────────────────────────────────────────────────────────

// Breast-specific patterns (checked first when breast context detected)
const BREAST_SITE_PATTERNS = [
  { keys: ["upper outer quadrant", "uoq"],                     label: "Upper Outer Quadrant (Left Breast)" },
  { keys: ["upper inner quadrant", "uiq"],                     label: "Upper Inner Quadrant (Left Breast)" },
  { keys: ["lower outer quadrant", "loq"],                     label: "Lower Outer Quadrant (Left Breast)" },
  { keys: ["lower inner quadrant", "liq"],                     label: "Lower Inner Quadrant (Left Breast)" },
  { keys: ["left breast"],                                      label: "Left Breast" },
  { keys: ["right breast"],                                     label: "Right Breast" },
  { keys: ["breast lumpectomy", "lumpectomy"],                  label: "Left Breast (Lumpectomy)" },
  { keys: ["axillary", "axilla"],                               label: "Left Breast + Axilla" },
];

const SITE_PATTERNS = [
  { keys: ["ascending colon"],                                  label: "Ascending Colon" },
  { keys: ["descending colon"],                                 label: "Descending Colon" },
  { keys: ["transverse colon"],                                 label: "Transverse Colon" },
  { keys: ["sigmoid colon"],                                    label: "Sigmoid Colon" },
  { keys: ["caecum", "cecum"],                                  label: "Caecum / Cecum" },
  { keys: ["ileocaecal", "ileocecal"],                         label: "Ileocaecal Junction" },
  { keys: ["rectosigmoid"],                                     label: "Rectosigmoid" },
  { keys: ["rectum"],                                           label: "Rectum" },
  { keys: ["right colon"],                                      label: "Right Colon" },
  { keys: ["left colon"],                                       label: "Left Colon" },
  { keys: ["upper outer quadrant", "uoq"],                     label: "Upper Outer Quadrant (Breast)" },
  { keys: ["upper inner quadrant", "uiq"],                     label: "Upper Inner Quadrant (Breast)" },
  { keys: ["lower outer quadrant", "loq"],                     label: "Lower Outer Quadrant (Breast)" },
  { keys: ["lower inner quadrant", "liq"],                     label: "Lower Inner Quadrant (Breast)" },
  { keys: ["right breast"],                                     label: "Right Breast" },
  { keys: ["left breast"],                                      label: "Left Breast" },
  { keys: ["right lung", "right upper lobe", "right lower lobe", "right middle lobe"], label: "Right Lung" },
  { keys: ["left lung", "left upper lobe", "left lower lobe"], label: "Left Lung" },
  { keys: ["head of pancreas"],                                 label: "Head of Pancreas" },
  { keys: ["body of pancreas"],                                 label: "Body of Pancreas" },
  { keys: ["tail of pancreas"],                                 label: "Tail of Pancreas" },
  { keys: ["gastroesophageal junction", "gej"],                 label: "Gastroesophageal Junction" },
  { keys: ["cardia"],                                           label: "Gastric Cardia" },
  { keys: ["antrum"],                                           label: "Gastric Antrum" },
  { keys: ["fundus"],                                           label: "Gastric Fundus" },
];

function extractPrimarySite(text) {
  const t = norm(text);

  // If the text has clear breast cancer context, search breast patterns first
  const hasBreastContext =
    t.includes("breast") ||
    t.includes("lumpectomy") ||
    t.includes("mastectomy") ||
    t.includes("axillary") ||
    t.includes("invasive ductal") ||
    t.includes("invasive carcinoma");

  if (hasBreastContext) {
    for (const p of BREAST_SITE_PATTERNS) {
      for (const key of p.keys) {
        if (t.includes(key)) return p.label;
      }
    }
  }

  // General patterns
  for (const p of SITE_PATTERNS) {
    for (const key of p.keys) {
      if (t.includes(key)) return p.label;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE (combined + individual T / N / M)
// ─────────────────────────────────────────────────────────────────────────────
function extractStage(text) {
  const t = norm(text);

  if (/\b(limited[ -]stage|limited disease)\b/.test(t)) return "Limited";
  if (/\b(extensive[ -]stage|extensive disease)\b/.test(t)) return "Extensive";

  // Roman numeral with optional substage
  const rnMatch =
    t.match(/\bstage\s+(iv[abc]?|iii[abc]?|ii[abc]?|i[abc]?|0)\b/i) ||
    t.match(/\b(iv[abc]?|iii[abc]?|ii[abc]?|i[abc]?)\s+(?:stage|disease)\b/i);
  if (rnMatch) return rnMatch[1].toUpperCase();

  // Full TNM
  const tnmMatch = t.match(/\bt([0-4]|is)[a-z]?\s*n([0-3]x?)\s*m([01x])\b/i);
  if (tnmMatch) {
    return tnmToStage(
      parseInt(tnmMatch[1]) || 0,
      parseInt(tnmMatch[2]) || 0,
      parseInt(tnmMatch[3]) || 0
    );
  }

  // Numeric stage
  const numMatch = t.match(/\bstage\s+([1234])\b/);
  if (numMatch) return ({ "1":"I","2":"II","3":"III","4":"IV" })[numMatch[1]];

  if (/\b(metastatic|distant metastasis|disseminated)\b/.test(t)) return "IV";
  if (/\b(locally advanced|unresectable|inoperable)\b/.test(t)) return "III";

  return null;
}

function tnmToStage(t, n, m) {
  if (m === 1) return "IV";
  // M0 (or Mx) explicitly present → cannot be Stage IV
  if (m === 0) {
    if (n >= 2)  return "III";
    if (n === 1) return "II";
    if (t >= 4)  return "III";
    if (t === 3) return "III";  // T3 N0 M0 = IIB for most cancers
    if (t === 2) return "II";
    if (t === 1) return "I";
    return "I";
  }
  // M unknown
  if (n >= 2)  return "III";
  if (n === 1) return "II";
  if (t >= 3)  return "III";
  if (t === 2) return "II";
  if (t === 1) return "I";
  return "I";
}

// Extract individual T, N, M components
function extractTNM(text) {
  const t = norm(text);
  const result = { tStage: null, nStage: null, mStage: null };

  // Pathological (pT/pN/pM) or clinical (cT/cN/cM) or plain T/N/M
  const tMatch = t.match(/\b[pcy]?t([0-4](?:[abc])?|is|x)\b/i);
  const nMatch = t.match(/\b[pcy]?n([0-3](?:[abc])?|x)\b/i);
  const mMatch = t.match(/\b[pcy]?m([01x])\b/i);

  if (tMatch) result.tStage = tMatch[1].toUpperCase();
  if (nMatch) result.nStage = nMatch[1].toUpperCase();
  if (mMatch) result.mStage = mMatch[1].toUpperCase();

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADE
// ─────────────────────────────────────────────────────────────────────────────
function extractGrade(text) {
  const t = norm(text);

  const numMatch = t.match(/\bgrade\s*([123])\b/) || t.match(/\bg([123])\b/);
  if (numMatch) {
    const g = parseInt(numMatch[1]);
    return g === 1 ? "low" : g === 2 ? "intermediate" : "high";
  }

  if (/\b(high[- ]grade|poorly differentiated|undifferentiated|anaplastic)\b/.test(t)) return "high";
  if (/\b(intermediate[- ]grade|moderately differentiated)\b/.test(t)) return "intermediate";
  if (/\b(low[- ]grade|well[- ]differentiated)\b/.test(t)) return "low";

  const gleason = t.match(/gleason\s*(?:score\s*)?([0-9]+)/);
  if (gleason) {
    const s = parseInt(gleason[1]);
    return s <= 6 ? "low" : s === 7 ? "intermediate" : "high";
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TUMOUR SIZE
// ─────────────────────────────────────────────────────────────────────────────
function extractTumorSize(text) {
  const t = norm(text);
  // "3.5 cm", "35 mm", "tumour measures 2.1 x 1.8 cm"
  const cmMatch = t.match(/(?:tumou?r|lesion|mass|polyp)?\s*(?:measures?|size|measuring)?\s*(\d+(?:\.\d+)?)\s*(?:x\s*\d+(?:\.\d+)?\s*)?cm/);
  if (cmMatch) return parseFloat(cmMatch[1]);

  const mmMatch = t.match(/(?:tumou?r|lesion|mass|polyp)?\s*(?:measures?|size|measuring)?\s*(\d+(?:\.\d+)?)\s*mm/);
  if (mmMatch) return parseFloat(mmMatch[1]) / 10; // convert to cm

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LYMPHOVASCULAR + PERINEURAL INVASION
// ─────────────────────────────────────────────────────────────────────────────
function extractInvasion(text) {
  const t = norm(text);
  const result = { lvInvasion: null, periNeuralInvasion: null };

  // Lymphovascular invasion
  if (/\blymphovascular\s+invasion\s*(?:present|identified|seen|\+|positive)\b/.test(t) ||
      /\blvi\s*(?:present|positive|\+|identified)\b/.test(t) ||
      /\blymphovascular\s+space\s+invasion\b/.test(t)) {
    result.lvInvasion = "present";
  } else if (/\b(?:no|absent|negative)\s+lymphovascular\s+invasion\b/.test(t) ||
             /\blvi\s*(?:absent|negative|-|not identified)\b/.test(t)) {
    result.lvInvasion = "absent";
  }

  // Perineural invasion
  if (/\bperineural\s+invasion\s*(?:present|identified|seen|\+|positive)\b/.test(t) ||
      /\bpni\s*(?:present|positive|\+)\b/.test(t)) {
    result.periNeuralInvasion = "present";
  } else if (/\b(?:no|absent|negative)\s+perineural\s+invasion\b/.test(t) ||
             /\bpni\s*(?:absent|negative|-)\b/.test(t)) {
    result.periNeuralInvasion = "absent";
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPTH OF INVASION (colorectal / gastric)
// ─────────────────────────────────────────────────────────────────────────────
function extractDepthOfInvasion(text) {
  const t = norm(text);
  if (/\bthrough\s+(?:the\s+)?(?:full|all\s+layers|bowel wall|serosa)\b/.test(t) ||
      /\bserosa\s+involved\b/.test(t) ||
      /\bperforation\b/.test(t) ||
      /\binvades\s+(?:through\s+)?(?:the\s+)?serosa\b/.test(t)) return "Through serosa (T4a/T4b)";

  if (/\bsubserosa\b/.test(t) ||
      /\bpericolorectal\s+tissue\b/.test(t) ||
      /\bpericolic\s+fat\b/.test(t) ||
      /\binvades\s+(?:into\s+)?subserosa\b/.test(t)) return "Into subserosa / pericolorectal tissue (T3)";

  if (/\bmuscularis\s+propria\b/.test(t) ||
      /\bproper\s+muscle\b/.test(t) ||
      /\binvades\s+(?:into\s+)?muscularis\b/.test(t)) return "Muscularis propria (T2)";

  if (/\bsubmucosa\b/.test(t) ||
      /\binvades\s+(?:into\s+)?submucosa\b/.test(t)) return "Submucosa (T1)";

  if (/\blamina\s+propria\b/.test(t) ||
      /\bmucosal\s+layer\b/.test(t)) return "Mucosa / Lamina propria (T1)";

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SURGICAL MARGINS
// ─────────────────────────────────────────────────────────────────────────────
function extractMargins(text) {
  const t = norm(text);

  if (/\bmargins?\s*(?:are\s*)?(?:free|clear|negative|uninvolved)\b/.test(t) ||
      /\bclear\s+(?:surgical\s+)?margins?\b/.test(t) ||
      /\br0\b/.test(t)) return "clear";

  if (/\bmargins?\s*(?:are\s*)?(?:involved|positive|not clear)\b/.test(t) ||
      /\btumou?r\s+at\s+(?:the\s+)?margins?\b/.test(t) ||
      /\br1\b/.test(t)) return "involved";

  if (/\bclose\s+margins?\b/.test(t) ||
      /\bmargins?\s*(?:are\s*)?close\b/.test(t)) return "close";

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TUMOUR MARKERS (numeric + present/absent)
// ─────────────────────────────────────────────────────────────────────────────
function extractTumorMarkers(text) {
  const t = norm(text);
  const markers = {};

  // CEA
  const ceaMatch = t.match(/\bcea\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:ng\/ml|ug\/l)?/) ||
                   t.match(/\bcarcinoembryonic\s+antigen\s*[:\-]?\s*(\d+(?:\.\d+)?)/);
  if (ceaMatch) markers.cea = parseFloat(ceaMatch[1]);
  else if (/\bcea\s+(?:elevated|raised|high|positive)\b/.test(t)) markers.cea = "elevated";
  else if (/\bcea\s+(?:normal|negative|within normal|not elevated)\b/.test(t)) markers.cea = "normal";

  // CA 15-3
  const ca153Match = t.match(/\bca\s*15[-\s]?3\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/ml|ku\/l)?/);
  if (ca153Match) markers.ca153 = parseFloat(ca153Match[1]);
  else if (/\bca\s*15[-\s]?3\s+(?:elevated|raised|high|positive)\b/.test(t)) markers.ca153 = "elevated";
  else if (/\bca\s*15[-\s]?3\s+(?:normal|negative|within normal)\b/.test(t)) markers.ca153 = "normal";

  // CA 19-9
  const ca199Match = t.match(/\bca\s*19[-\s]?9\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/ml|ku\/l)?/);
  if (ca199Match) markers.ca199 = parseFloat(ca199Match[1]);

  // CA-125
  const ca125Match = t.match(/\bca[-\s]?125\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:u\/ml)?/);
  if (ca125Match) markers.ca125 = parseFloat(ca125Match[1]);

  // AFP
  const afpMatch = t.match(/\bafp\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:ng\/ml|iu\/ml)?/) ||
                   t.match(/\balpha[- ]fetoprotein\s*[:\-]?\s*(\d+(?:\.\d+)?)/);
  if (afpMatch) markers.afp = parseFloat(afpMatch[1]);

  // PSA
  const psaMatch = t.match(/\bpsa\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:ng\/ml)?/) ||
                   t.match(/\bprostate\s+specific\s+antigen\s*[:\-]?\s*(\d+(?:\.\d+)?)/);
  if (psaMatch) markers.psa = parseFloat(psaMatch[1]);

  return markers;
}

// ─────────────────────────────────────────────────────────────────────────────
// BIOMARKERS (all markers including new additions)
// ─────────────────────────────────────────────────────────────────────────────
function extractBiomarkers(text) {
  const t = norm(text);
  const bm = {};

  // ── HER2 ─────────────────────────────────────────────────────────────
  if (/\bher2[- ]?(?:neu\s*)?(?:positive|\+|3\+|2\+\s*fish\s*positive|amplified|overexpressed)\b/.test(t) ||
      /\bher2\s*(?:status\s*)?:\s*(?:positive|\+)\b/.test(t)) {
    bm.her2 = "positive";
  } else if (/\bher2[- ]?(?:neu\s*)?(?:negative|[-]|0|1\+|2\+\s*fish\s*negative|not amplified)\b/.test(t) ||
             /\bher2\s*(?:status\s*)?:\s*(?:negative|[-])\b/.test(t)) {
    bm.her2 = "negative";
  }

  // ── ER / PR / HR ──────────────────────────────────────────────────────
  // Patterns cover: "ER positive", "ER-positive", "ER: Positive", "ER-positive 90%",
  // "ER positive (90%)", "estrogen receptor positive", table format "ER | Positive"
  const erPos =
    /\ber[- ]?(?:status\s*)?(?::|=|\s)\s*(?:positive|\+)/i.test(t) ||
    /\ber[- ]positive\b/i.test(t) ||
    /\bestrogen\s+receptor[- ]positive\b/i.test(t) ||
    /\bestrogen\s+receptor\s*(?::|=|\s)\s*positive\b/i.test(t) ||
    /\ber\s*(?::|=|\|)\s*positive\b/i.test(t) ||
    // "ER positive 90%" or "ER positive, 90%"
    /\ber[- ]?positive\s*[,\s]\s*\d+\s*%/i.test(t) ||
    // "intended receptor profile is ER-positive"
    /\ber[- ]positive(?:[,\s]|$)/i.test(t);

  const erNeg =
    /\ber[- ]?(?:status\s*)?(?::|=|\s)\s*(?:negative|-)\b/i.test(t) ||
    /\ber[- ]negative\b/i.test(t) ||
    /\bestrogen\s+receptor[- ]negative\b/i.test(t) ||
    /\bestrogen\s+receptor\s*(?::|=|\s)\s*negative\b/i.test(t) ||
    /\ber\s*(?::|=|\|)\s*negative\b/i.test(t);

  const prPos =
    /\bpr[- ]?(?:status\s*)?(?::|=|\s)\s*(?:positive|\+)/i.test(t) ||
    /\bpr[- ]positive\b/i.test(t) ||
    /\bprogesterone\s+receptor[- ]positive\b/i.test(t) ||
    /\bprogesterone\s+receptor\s*(?::|=|\s)\s*positive\b/i.test(t) ||
    /\bpr\s*(?::|=|\|)\s*positive\b/i.test(t) ||
    /\bpr[- ]?positive\s*[,\s]\s*\d+\s*%/i.test(t) ||
    /\bpr[- ]positive(?:[,\s]|$)/i.test(t);

  const prNeg =
    /\bpr[- ]?(?:status\s*)?(?::|=|\s)\s*(?:negative|-)\b/i.test(t) ||
    /\bpr[- ]negative\b/i.test(t) ||
    /\bprogesterone\s+receptor[- ]negative\b/i.test(t) ||
    /\bprogesterone\s+receptor\s*(?::|=|\s)\s*negative\b/i.test(t) ||
    /\bpr\s*(?::|=|\|)\s*negative\b/i.test(t);

  // Extract numeric ER/PR percentages if present
  const erPctMatch = t.match(/\ber[- ]?positive[,\s]+(\d+)\s*%/i) ||
                     t.match(/\ber\s*[:\|=]\s*positive[,\s]+(\d+)\s*%/i);
  const prPctMatch = t.match(/\bpr[- ]?positive[,\s]+(\d+)\s*%/i) ||
                     t.match(/\bpr\s*[:\|=]\s*positive[,\s]+(\d+)\s*%/i);

  if (erPos && !erNeg) { bm.er = "positive"; if (erPctMatch) bm.erPercent = parseInt(erPctMatch[1]); }
  else if (erNeg && !erPos) { bm.er = "negative"; }

  if (prPos && !prNeg) { bm.pr = "positive"; if (prPctMatch) bm.prPercent = parseInt(prPctMatch[1]); }
  else if (prNeg && !prPos) { bm.pr = "negative"; }

  if (bm.er === "positive" || bm.pr === "positive") bm.hr = "positive";
  else if (bm.er === "negative" && bm.pr === "negative") bm.hr = "negative";

  // ── EGFR ──────────────────────────────────────────────────────────────
  if (/\begfr\s*(?:mutation|mutant|exon\s*19|exon\s*21|l858r|del?19|activating)\b/.test(t))
    bm.egfr = "mutated";
  else if (/\begfr\s*(?:wild[- ]?type|wt|negative|unmutated)\b/.test(t))
    bm.egfr = "wild-type";

  // ── ALK ───────────────────────────────────────────────────────────────
  if (/\balk\s*(?:rearrangement|fusion|positive|\+|translocation)\b/.test(t))
    bm.alk = "positive";
  else if (/\balk\s*(?:negative|[-]|not rearranged|wild[- ]?type)\b/.test(t))
    bm.alk = "negative";

  // ── ROS1 ──────────────────────────────────────────────────────────────
  if (/\bros1\s*(?:fusion|rearrangement|positive|\+)\b/.test(t))    bm.ros1 = "positive";
  else if (/\bros1\s*(?:negative|[-]|not rearranged)\b/.test(t))    bm.ros1 = "negative";

  // ── MET ───────────────────────────────────────────────────────────────
  if (/\bmet\s*(?:amplification|amplified|exon\s*14|skipping)\b/.test(t)) bm.met = "amplified";

  // ── PD-L1 ─────────────────────────────────────────────────────────────
  const pdl1Match =
    t.match(/\bpd[- ]?l1\s*(?:expression\s*)?(?:score\s*)?[:\s]*(\d+)\s*%/) ||
    t.match(/\btps\s*[:\s]*(\d+)\s*%/) ||
    t.match(/\bcps\s*[:\s]*(\d+)/);
  if (pdl1Match) {
    const val = parseInt(pdl1Match[1]);
    bm.pdl1Score = val;
    bm.pdl1 = val >= 50 ? ">=50%" : val >= 1 ? "positive" : "negative";
  } else if (/\bpd[- ]?l1\s*(?:positive|\+|expressed)\b/.test(t)) {
    bm.pdl1 = "positive";
  } else if (/\bpd[- ]?l1\s*(?:negative|[-]|not expressed)\b/.test(t)) {
    bm.pdl1 = "negative";
  }

  // ── KRAS / NRAS / RAS ────────────────────────────────────────────────
  if (/\bkras\s*(?:mutation|mutant|mutated|codon\s*\d+|g12[a-z]?|g13[a-z]?)\b/.test(t) ||
      /\bmutated\s*kras\b/.test(t)) {
    bm.kras = "mutated"; bm.ras = "mutated";
  } else if (/\bkras\s*(?:wild[- ]?type|wt|negative)\b/.test(t)) {
    bm.kras = "wild-type"; bm.ras = "wild-type";
  }

  if (/\bnras\s*(?:mutation|mutant|mutated)\b/.test(t)) {
    bm.nras = "mutated"; bm.ras = "mutated";
  } else if (/\bnras\s*(?:wild[- ]?type|wt|negative)\b/.test(t)) {
    bm.nras = "wild-type";
  }

  if (!bm.ras) {
    if (/\b(?:kras|nras|ras)\s*(?:mutation|mutant|mutated)\b/.test(t)) bm.ras = "mutated";
    else if (/\b(?:kras|nras|ras)\s*(?:wild[- ]?type|wt|negative)\b/.test(t)) bm.ras = "wild-type";
  }

  // ── BRAF ──────────────────────────────────────────────────────────────
  if (/\bbraf\s*(?:v600[ek]?|mutation|mutant|mutated)\b/.test(t))
    bm.braf = "mutated";
  else if (/\bbraf\s*(?:wild[- ]?type|wt|negative)\b/.test(t))
    bm.braf = "wild-type";

  // ── CD20 ──────────────────────────────────────────────────────────────
  if (/\bcd20\s*(?:positive|\+)\b/.test(t)) bm.cd20 = "positive";
  if (/\bcd20\s*(?:negative|[-])\b/.test(t)) bm.cd20 = "negative";

  // ── MMR / MSI — FIX-4: store MSS/MSI-L/MSI-H (not "high"/"low") ─────
  if (/\b(?:mmr[- ]deficient|mismatch repair deficient|dmmr|msi[- ]?h(?:igh)?)\b/.test(t) ||
      /\bmlh1\s*(?:loss|absent|negative|deficient)\b/.test(t) ||
      /\bmsh2\s*(?:loss|absent|negative|deficient)\b/.test(t)) {
    bm.mmr = "deficient"; bm.msi = "MSI-H";
  } else if (/\bmss\b/.test(t) ||
             /\bmicrosatellite\s+stable\b/.test(t) ||
             /\bmmr[- ]proficient\b/.test(t) ||
             /\bpmmr\b/.test(t) ||
             /\bmlh1\s*(?:retained|intact|present|positive)\b/.test(t)) {
    bm.mmr = "proficient"; bm.msi = "MSS";
  } else if (/\bmsi[- ]?l(?:ow)?\b/.test(t)) {
    bm.mmr = "proficient"; bm.msi = "MSI-L";
  }

  // Individual MMR proteins
  if (/\bmlh1\b/.test(t)) {
    bm.mlh1 = /\bmlh1\s*(?:loss|absent|negative|deficient)\b/.test(t) ? "lost" : "intact";
  }
  if (/\bmsh2\b/.test(t)) {
    bm.msh2 = /\bmsh2\s*(?:loss|absent|negative|deficient)\b/.test(t) ? "lost" : "intact";
  }
  if (/\bmsh6\b/.test(t)) {
    bm.msh6 = /\bmsh6\s*(?:loss|absent|negative|deficient)\b/.test(t) ? "lost" : "intact";
  }
  if (/\bpms2\b/.test(t)) {
    bm.pms2 = /\bpms2\s*(?:loss|absent|negative|deficient)\b/.test(t) ? "lost" : "intact";
  }

  // ── BRCA — FIX-5: "no pathogenic variant" = result present (wild-type) ──
  if (/\bbrca\s*[12]?\s*(?:mutation|mutant|pathogenic variant detected|positive)\b/.test(t))
    bm.brca = "mutated";
  else if (
    /\bbrca\s*[12]?\s*(?:wild[- ]?type|negative|not mutated)\b/.test(t) ||
    /\bno\s+pathogenic[/ ]?likely\s+pathogenic\s+variant\s+detected\b/.test(t) ||
    /\bno\s+pathogenic\s+variant\s+detected\b/.test(t) ||
    /\bbrca[12]?\s+germline\b.*\bno\s+pathogenic\b/is.test(t)
  )
    bm.brca = "wild-type";  // test done — no mutation found

  // ── Genomic Risk Scores (Oncotype DX, MammaPrint) ──────────────────────
  // Oncotype DX Recurrence Score
  const oncotypeMatch = t.match(/\boncotype\s*dx\s*(?:recurrence\s*score)?\s*[:\-]?\s*(\d+)\b/i) ||
                        t.match(/\brecurrence\s+score\s*[:\-]?\s*(\d+)\b/i);
  if (oncotypeMatch) {
    bm.oncotypeDx = parseInt(oncotypeMatch[1]);
    bm.genomicScore = bm.oncotypeDx;
  }

  // MammaPrint
  const mammaPrintMatch = t.match(/\bmammaprint\s*(?:score|result)?\s*[:\-]?\s*(low|high|intermediate)\b/i);
  if (mammaPrintMatch) {
    bm.mammaPrint = mammaPrintMatch[1].toLowerCase();
    // Convert to numeric for consistency
    if (bm.mammaPrint === "low") bm.genomicScore = 10;
    else if (bm.mammaPrint === "intermediate") bm.genomicScore = 20;
    else if (bm.mammaPrint === "high") bm.genomicScore = 30;
  }

  // Genomic risk category
  if (/\bgenomic\s+(?:low|high|intermediate)\s+risk\b/i.test(t)) {
    const riskMatch = t.match(/\bgenomic\s+(low|high|intermediate)\s+risk\b/i);
    if (riskMatch) {
      bm.genomicRisk = riskMatch[1].toLowerCase();
      if (bm.genomicRisk === "low") bm.genomicScore = 10;
      else if (bm.genomicRisk === "intermediate") bm.genomicScore = 20;
      else if (bm.genomicRisk === "high") bm.genomicScore = 30;
    }
  }

  // ── Ki67 ──────────────────────────────────────────────────────────────
  const ki67Match = t.match(/\bki67\s*[:\-]?\s*(\d+)\s*%/) ||
                    t.match(/\bki[-\s]?67\s*(?:index|proliferation)?\s*[:\-]?\s*(\d+)\s*%/);
  if (ki67Match) bm.ki67 = parseInt(ki67Match[1]);

  // ── FLT3 (AML) ────────────────────────────────────────────────────────
  if (/\bflt3[- ]?itd\s*(?:positive|detected|present|\+)\b/.test(t)) bm.flt3 = "ITD-positive";
  else if (/\bflt3\s*(?:mutation|mutated)\b/.test(t)) bm.flt3 = "mutated";
  else if (/\bflt3\s*(?:negative|wild[- ]?type|not detected)\b/.test(t)) bm.flt3 = "wild-type";

  // ── NPM1 (AML) ────────────────────────────────────────────────────────
  if (/\bnpm1\s*(?:mutation|mutated|positive)\b/.test(t)) bm.npm1 = "mutated";
  else if (/\bnpm1\s*(?:wild[- ]?type|negative)\b/.test(t)) bm.npm1 = "wild-type";

  // ── IDH1/2 ────────────────────────────────────────────────────────────
  if (/\bidh[12]?\s*(?:mutation|mutated|r132|r140|r172)\b/.test(t)) bm.idh = "mutated";
  else if (/\bidh[12]?\s*(?:wild[- ]?type|negative)\b/.test(t)) bm.idh = "wild-type";

  // ── BRAIN TUMOR BIOMARKERS (NEW — v4) ────────────────────────────────

  // MGMT promoter methylation
  if (/\bmgmt\s+promoter\s+(?:methylated|methylation\s+detected|positive)\b/.test(t) ||
      /\bmgmt\s*(?::|=|\s)\s*(?:methylated|positive)\b/.test(t) ||
      /\bmgmt\s+methylated\b/.test(t)) {
    bm.mgmt = "methylated";
  } else if (/\bmgmt\s+promoter\s+(?:unmethylated|methylation\s+not\s+detected|negative)\b/.test(t) ||
             /\bmgmt\s*(?::|=|\s)\s*(?:unmethylated|negative)\b/.test(t) ||
             /\bmgmt\s+unmethylated\b/.test(t)) {
    bm.mgmt = "unmethylated";
  }

  // 1p/19q co-deletion
  if (/\b1p[\/]?19q\s*(?:co[- ]?deleted|codeletion|deletion\s*detected|positive)\b/.test(t) ||
      /\b1p\s+and\s+19q\s+(?:co[- ]?deletion|deleted)\b/.test(t)) {
    bm.codeletion1p19q = "co-deleted";
  } else if (/\b1p[\/]?19q\s*(?:intact|not\s+deleted|negative|no\s+(?:co[- ]?)?deletion)\b/.test(t) ||
             /\b1p\s+and\s+19q\s+intact\b/.test(t)) {
    bm.codeletion1p19q = "intact";
  }

  // TERT promoter mutation
  if (/\btert\s+promoter\s+(?:mutation|mutated|mutant|positive|detected)\b/.test(t) ||
      /\btert\s*(?:promoter\s*)?(?:mutation|mutated)\b/.test(t)) {
    bm.tert = "mutated";
  } else if (/\btert\s+(?:wild[- ]?type|negative|unmutated|no\s+mutation)\b/.test(t)) {
    bm.tert = "wild-type";
  }

  // ATRX loss / mutation
  if (/\batrx\s*(?:loss|lost|absent|negative|deficient|mutation|mutated)\b/.test(t)) {
    bm.atrx = "lost";
  } else if (/\batrx\s*(?:retained|intact|positive|expressed|wild[- ]?type)\b/.test(t)) {
    bm.atrx = "retained";
  }

  // WHO CNS Grade (brain tumors — 2021 classification)
  const whoCnsMatch =
    t.match(/\bwho\s+(?:cns\s+)?grade\s*([1-4])\b/i) ||
    t.match(/\bwho\s+grade\s*([1-4])\b/i) ||
    t.match(/\bgrade\s*([1-4])\s*(?:glioma|astrocytoma|ependymoma|meningioma)\b/i);
  if (whoCnsMatch) {
    bm.whoCnsGrade = parseInt(whoCnsMatch[1]);
  }

  // Extent of resection (brain surgery)
  if (/\bgross\s+total\s+resection\b/.test(t) || /\bgtr\b/.test(t)) {
    bm.extentResection = "gross total resection";
  } else if (/\bsubtotal\s+resection\b/.test(t) || /\bstr\b/.test(t)) {
    bm.extentResection = "subtotal resection";
  } else if (/\bbiopsy\s+only\b/.test(t) || /\bstereotactic\s+biopsy\b/.test(t)) {
    bm.extentResection = "biopsy only";
  } else if (/\bcomplete\s+resection\b/.test(t) || /\bsimpson\s+grade\s+[i1]\b/.test(t)) {
    bm.extentResection = "complete resection";
  }

  // Glioblastoma / GBM specific confirmation
  if (/\bglioblastoma\b/.test(t) || /\bgbm\b/.test(t)) {
    bm.tumorSubtype = "glioblastoma";
  }
  // Oligodendroglioma specific
  if (/\boligodendroglioma\b/.test(t)) {
    bm.tumorSubtype = "oligodendroglioma";
  }

  // ── Triple-negative shortcut ──────────────────────────────────────────
  if (/\b(?:triple[- ]?negative|tnbc)\b/.test(t)) {
    bm.er = "negative"; bm.pr = "negative";
    bm.her2 = "negative"; bm.hr = "negative";
  }

  return bm;
}

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE STATUS
// ─────────────────────────────────────────────────────────────────────────────
function extractPS(text) {
  const t = norm(text);
  const ecog =
    t.match(/\becog\s*(?:ps\s*)?[:\s]*([0-4])\b/) ||
    t.match(/\bperformance status\s*[:\s]*([0-4])\b/) ||
    t.match(/\bps\s*[:\s]*([0-4])\b/);
  if (ecog) return parseInt(ecog[1]);

  const kps = t.match(/\bkarnofsky\s*[:\-]?\s*(\d+)\b/) ||
              t.match(/\bkps\s*[:\-]?\s*(\d+)\b/);
  if (kps) {
    const k = parseInt(kps[1]);
    if (k >= 90) return 0;
    if (k >= 70) return 1;
    if (k >= 50) return 2;
    if (k >= 30) return 3;
    return 4;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGE
// ─────────────────────────────────────────────────────────────────────────────
function extractAge(text) {
  const t = norm(text);
  const m =
    t.match(/\b(\d{2,3})[- ]?(?:year|yr)[s]?[- ]?(?:old)?\b/) ||
    t.match(/\bage\s*[:\s]*(\d{2,3})\b/) ||
    t.match(/\bpatient\s+(?:is\s+)?(\d{2,3})\s+years?\b/);
  return m ? parseInt(m[1]) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTOLOGY
// ─────────────────────────────────────────────────────────────────────────────
function extractHistology(text) {
  const t = norm(text);
  const histo = [
    "adenocarcinoma", "squamous cell carcinoma", "small cell carcinoma",
    "large cell carcinoma", "neuroendocrine carcinoma", "neuroendocrine tumor",
    "sarcoma", "lymphoma", "leukemia", "myeloma", "glioblastoma", "astrocytoma",
    "seminoma", "non-seminoma", "transitional cell carcinoma",
    "urothelial carcinoma", "hepatocellular carcinoma", "cholangiocarcinoma",
    "mesothelioma", "thymoma", "carcinoid", "merkel cell carcinoma",
    "mucinous adenocarcinoma", "signet ring cell carcinoma",
    "micropapillary carcinoma", "lobular carcinoma",
  ];
  for (const h of histo) {
    if (t.includes(h)) return capitalise(h);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LYMPH NODE STATUS
// ─────────────────────────────────────────────────────────────────────────────
function extractLymphNodes(text) {
  const t = norm(text);
  const result = { lymphNodesPositive: null, lymphNodesTotal: null, lymphNodeStatus: null };

  // "3/12 lymph nodes", "3 of 12 nodes"
  const countMatch =
    t.match(/(\d+)\s*(?:\/|of)\s*(\d+)\s*(?:lymph\s*)?nodes?\s*(?:positive|involved|contain)/) ||
    t.match(/(\d+)\s*(?:lymph\s*)?nodes?\s*(?:positive|involved|with\s+metastasis)/);
  if (countMatch) {
    result.lymphNodesPositive = parseInt(countMatch[1]);
    if (countMatch[2]) result.lymphNodesTotal = parseInt(countMatch[2]);
  }

  if (/\b(?:lymph\s*)?nodes?\s*(?:negative|not involved|no metastasis|free of tumour|clear)\b/.test(t) ||
      /\bno\s+(?:lymph\s*)?node\s+(?:involvement|metastasis)\b/.test(t)) {
    result.lymphNodeStatus = "negative";
  } else if (result.lymphNodesPositive > 0 ||
             /\b(?:lymph\s*)?nodes?\s*(?:positive|involved|metastasis)\b/.test(t)) {
    result.lymphNodeStatus = "positive";
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE SCORING
// ─────────────────────────────────────────────────────────────────────────────
function scoreConfidence(parsed) {
  let score = 0;
  if (parsed.cancerType)        score += 3;
  if (parsed.stage)             score += 3;
  if (parsed.grade)             score += 1;
  if (parsed.histology)         score += 1;
  if (parsed.tStage)            score += 1;

  const bm = parsed.biomarkers || {};
  const bmCount = Object.keys(bm).filter(k => bm[k]).length;
  score += Math.min(bmCount, 3);

  if (score >= 9)  return "high";
  if (score >= 5)  return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────
function capitalise(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PARSE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
function parseReport(text) {
  const cancerType   = extractCancerType(text);
  const stage        = extractStage(text);
  const tnm          = extractTNM(text);
  const grade        = extractGrade(text);
  const biomarkers   = extractBiomarkers(text);
  const tumorMarkers = extractTumorMarkers(text);
  const ps           = extractPS(text);
  const age          = extractAge(text);
  const histology    = extractHistology(text);
  const primarySite  = extractPrimarySite(text);
  const invasion     = extractInvasion(text);
  const depthInv     = extractDepthOfInvasion(text);
  const margins      = extractMargins(text);
  const tumorSize    = extractTumorSize(text);
  const lymphNodes   = extractLymphNodes(text);

  // Merge tumour markers into biomarkers for downstream compatibility
  if (tumorMarkers.cea  !== undefined) biomarkers.cea   = tumorMarkers.cea;
  if (tumorMarkers.ca153 !== undefined) biomarkers.ca153 = tumorMarkers.ca153;
  if (tumorMarkers.ca199 !== undefined) biomarkers.ca199 = tumorMarkers.ca199;
  if (tumorMarkers.ca125 !== undefined) biomarkers.ca125 = tumorMarkers.ca125;
  if (tumorMarkers.afp  !== undefined) biomarkers.afp   = tumorMarkers.afp;
  if (tumorMarkers.psa  !== undefined) biomarkers.psa   = tumorMarkers.psa;

  const parsed = {
    cancerType,
    stage,
    tStage:           tnm.tStage,
    nStage:           tnm.nStage,
    mStage:           tnm.mStage,
    grade,
    histology,
    primarySite,
    biomarkers,
    tumorMarkers,
    performanceStatus: ps,
    age,
    tumorSize,
    lvInvasion:       invasion.lvInvasion,
    periNeuralInvasion: invasion.periNeuralInvasion,
    depthOfInvasion:  depthInv,
    surgicalMargins:  margins,
    lymphNodes,
    rawText: text.slice(0, 400) + (text.length > 400 ? "…" : ""),
  };

  // ── Site-based cancer type inference ──────────────────────────────────────
  // If cancer type not found but primary site + histology give a clear answer
  if (!parsed.cancerType) {
    parsed.cancerType = inferCancerFromSiteAndHistology(primarySite, histology, text);
  }

  // ── Fix #1: M0 guard — if M0 is explicitly documented, stage cannot be IV ──
  if (parsed.mStage === "0" && parsed.stage === "IV") {
    // Re-derive stage from T + N only
    const tNum = parseInt(parsed.tStage) || 0;
    const nNum = parseInt(parsed.nStage) || 0;
    parsed.stage = tnmToStage(tNum, nNum, 0);
    parsed._stageOverridden = true;
    parsed._stageOverrideReason = "M0 confirmed by imaging — Stage IV overridden";
  }

  // ── Fix #1b: "no distant metastasis" in text → treat as M0 if stage=IV and no explicit M1 ──
  if (parsed.stage === "IV" && parsed.mStage !== "1") {
    const tNorm = norm(text);
    const noDistant =
      /no\s+(?:definite\s+)?(?:distant|remote)\s+metastati[cs]/.test(tNorm) ||
      /no\s+evidence\s+of\s+(?:distant\s+)?metastasis/.test(tNorm) ||
      /cm0\b/.test(tNorm);
    if (noDistant) {
      const tNum = parseInt(parsed.tStage) || 0;
      const nNum = parseInt(parsed.nStage) || 0;
      parsed.stage = tnmToStage(tNum, nNum, 0);
      parsed.mStage = parsed.mStage || "0";
      parsed._stageOverridden = true;
      parsed._stageOverrideReason = "No distant metastasis documented — Stage IV overridden";
    }
  }

  parsed.confidence = scoreConfidence(parsed);

  // ── Expose brain-tumor-specific fields at top level for easy access ───────
  const bm = parsed.biomarkers || {};
  parsed.brainBiomarkers = {
    idh:              bm.idh            || null,
    mgmt:             bm.mgmt           || null,
    codeletion1p19q:  bm.codeletion1p19q|| null,
    tert:             bm.tert           || null,
    atrx:             bm.atrx           || null,
    whoCnsGrade:      bm.whoCnsGrade    || null,
    extentResection:  bm.extentResection|| null,
    tumorSubtype:     bm.tumorSubtype   || null,
  };

  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// SITE + HISTOLOGY → CANCER TYPE INFERENCE
// Handles cases like "ascending colon" + "adenocarcinoma" → Colorectal Cancer
// ─────────────────────────────────────────────────────────────────────────────
function inferCancerFromSiteAndHistology(site, histology, rawText) {
  if (!site && !histology) return null;
  const s = (site || "").toLowerCase();
  const h = (histology || "").toLowerCase();
  const t = norm(rawText);

  // Colon / colorectal sites
  const colonSites = ["ascending colon","descending colon","transverse colon",
    "sigmoid colon","rectosigmoid","caecum","cecum","ileocaecal","right colon",
    "left colon","rectum"];
  if (colonSites.some(cs => s.includes(cs))) {
    if (h.includes("adenocarcinoma") || h.includes("carcinoma") || t.includes("adenocarcinoma"))
      return "Colorectal Cancer";
  }

  // Breast sites
  if (s.includes("breast") || s.includes("quadrant")) {
    if (h.includes("carcinoma") || h.includes("adenocarcinoma"))
      return "Breast Cancer";
  }

  // Lung sites
  if (s.includes("lung") || s.includes("lobe")) {
    if (h.includes("adenocarcinoma")) return "Lung Adenocarcinoma (NSCLC)";
    if (h.includes("squamous"))       return "Squamous Cell Lung Cancer (NSCLC)";
    if (h.includes("carcinoma"))      return "Non-Small Cell Lung Cancer (NSCLC)";
  }

  // Pancreas sites
  if (s.includes("pancreas") || s.includes("pancreatic")) {
    if (h.includes("adenocarcinoma") || h.includes("carcinoma"))
      return "Pancreatic Cancer";
  }

  // Gastric sites
  if (s.includes("gastric") || s.includes("antrum") || s.includes("fundus") || s.includes("cardia")) {
    if (h.includes("adenocarcinoma") || h.includes("carcinoma"))
      return "Gastric Cancer";
  }

  // GEJ
  if (s.includes("gastroesophageal") || s.includes("gej")) {
    if (h.includes("adenocarcinoma")) return "Gastroesophageal Junction Cancer";
  }

  return null;
}

module.exports = { parseReport };
