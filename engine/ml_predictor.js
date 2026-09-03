/**
 * OncoDoseRx — ML Prediction Bridge
 * ===================================
 * Loads the trained Random Forest output (model_rules.json) and
 * the dataset stats from data/ folder to power ML-backed predictions.
 *
 * The model was trained on 120,000 synthetic cancer patients derived
 * from SEER / NCCN / ACS Cancer Statistics 2023 distributions.
 * Accuracy: 79.4% (bucket), 58.1% (exact cycle).
 *
 * Cancer type is the #1 predictor (32.5% importance), followed by
 * age (10.7%), stage (9.6%), ECOG PS (7.6%), RAS status (5.8%).
 */

"use strict";

const path = require("path");
const fs   = require("fs");

// Honours DATA_DIR so the retrainer, the dataset writer and this loader all
// read the same directory when one is overridden (tests, alternate corpus).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");

// ── Load model artefacts ──────────────────────────────────────────────────────
let MODEL_RULES    = null;
let DATASET_STATS  = null;
let FEAT_IMPORT    = null;

function loadArtefacts(force = false) {
  if (MODEL_RULES && !force) return; // already loaded
  try {
    MODEL_RULES   = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "model_rules.json"),      "utf8"));
    DATASET_STATS = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "dataset_stats.json"),    "utf8"));
    FEAT_IMPORT   = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "feature_importance.json"),"utf8"));
    console.log(`  [ML] Model artefacts loaded — ${DATASET_STATS.total_patients.toLocaleString()} training patients`);
  } catch (e) {
    console.error("  [ML] Could not load model artefacts:", e.message);
    MODEL_RULES   = {};
    DATASET_STATS = {};
    FEAT_IMPORT   = {};
  }
}

// ── Cancer type normaliser ────────────────────────────────────────────────────
// Maps the parser's labels → dataset cancer type labels
const CANCER_MAP = {
  // Parser label                           → Dataset label
  "Acute Myeloid Leukemia (AML)":            "Leukemia (AML)",
  "Acute Lymphoblastic Leukemia (ALL)":       "Leukemia (ALL)",
  "Diffuse Large B-Cell Lymphoma (DLBCL)":   "Non-Hodgkin Lymphoma",
  "Non-Hodgkin Lymphoma":                    "Non-Hodgkin Lymphoma",
  "Hodgkin Lymphoma":                        "Hodgkin Lymphoma",
  "Small Cell Lung Cancer (SCLC)":           "Lung Cancer (SCLC)",
  "Non-Small Cell Lung Cancer (NSCLC)":      "Lung Cancer (NSCLC)",
  "Lung Adenocarcinoma (NSCLC)":             "Lung Cancer (NSCLC)",
  "Squamous Cell Lung Cancer (NSCLC)":       "Lung Cancer (NSCLC)",
  "Triple-Negative Breast Cancer (TNBC)":   "Breast Cancer",
  "Breast Cancer":                           "Breast Cancer",
  "Colorectal Cancer":                       "Colorectal Cancer",
  "Rectal Cancer":                           "Colorectal Cancer",
  "Gastric Cancer":                          "Gastric Cancer",
  "Gastroesophageal Junction Cancer":        "Gastric Cancer",
  "Esophageal Cancer":                       "Esophageal Cancer",
  "Pancreatic Cancer":                       "Pancreatic Cancer",
  "Hepatocellular Carcinoma (HCC)":          "Liver Cancer (HCC)",
  "Ovarian Cancer":                          "Ovarian Cancer",
  "Cervical Cancer":                         "Cervical Cancer",
  "Endometrial Cancer":                      "Endometrial Cancer",
  "Prostate Cancer":                         "Prostate Cancer",
  "Bladder Cancer":                          "Bladder Cancer",
  "Renal Cell Carcinoma (RCC)":              "Kidney Cancer (RCC)",
  "Testicular Germ Cell Tumor":              "Testicular Cancer",
  "Head and Neck Squamous Cell Carcinoma":   "Head & Neck Cancer",
  "Nasopharyngeal Carcinoma":                "Head & Neck Cancer",
  "Melanoma":                                "Melanoma",
  "Multiple Myeloma":                        "Multiple Myeloma",
  "Thyroid Cancer":                          "Thyroid Cancer",
  // Brain tumors
  "Brain Cancer":                            "Brain Cancer",
  "Brain Tumor":                             "Brain Tumor",
  "Glioblastoma (GBM)":                      "Glioblastoma (GBM)",
  "Lower Grade Glioma":                      "Lower Grade Glioma",
  "Brain Tumor / Glioma":                    "Lower Grade Glioma",
  "Oligodendroglioma":                       "Oligodendroglioma",
  "Meningioma":                              "Meningioma",
  "Brain Metastasis":                        "Brain Metastasis",
  "Medulloblastoma":                         "Medulloblastoma",
  "Ependymoma":                              "Ependymoma",
};

function normaliseCancerType(parserLabel) {
  if (!parserLabel) return null;
  // Direct match
  if (CANCER_MAP[parserLabel]) return CANCER_MAP[parserLabel];

  const lower = parserLabel.toLowerCase();

  // Keyword-based fallback (catches parser labels not in the map)
  if (lower.includes("colorectal") || lower.includes("colon") || lower.includes("rectal"))
    return "Colorectal Cancer";
  if (lower.includes("small cell lung") || lower.includes("sclc"))
    return "Lung Cancer (SCLC)";
  if (lower.includes("lung") || lower.includes("nsclc") || lower.includes("non-small"))
    return "Lung Cancer (NSCLC)";
  if (lower.includes("breast"))
    return "Breast Cancer";
  if (lower.includes("gastric") || lower.includes("stomach"))
    return "Gastric Cancer";
  if (lower.includes("esophag") || lower.includes("oesophag"))
    return "Esophageal Cancer";
  if (lower.includes("pancrea"))
    return "Pancreatic Cancer";
  if (lower.includes("hepato") || lower.includes("liver"))
    return "Liver Cancer (HCC)";
  if (lower.includes("ovarian"))
    return "Ovarian Cancer";
  if (lower.includes("cervical") || lower.includes("cervix"))
    return "Cervical Cancer";
  if (lower.includes("endometri") || lower.includes("uterine") || lower.includes("uterus"))
    return "Endometrial Cancer";
  if (lower.includes("prostate"))
    return "Prostate Cancer";
  if (lower.includes("bladder") || lower.includes("urothelial"))
    return "Bladder Cancer";
  if (lower.includes("renal") || lower.includes("kidney") || lower.includes("rcc"))
    return "Kidney Cancer (RCC)";
  if (lower.includes("testicular") || lower.includes("germ cell") || lower.includes("seminoma"))
    return "Testicular Cancer";
  if (lower.includes("head") || lower.includes("neck") || lower.includes("oropharyn") || lower.includes("laryn"))
    return "Head & Neck Cancer";
  if (lower.includes("nasopharyn"))
    return "Head & Neck Cancer";
  if (lower.includes("hodgkin"))
    return "Hodgkin Lymphoma";
  if (lower.includes("dlbcl") || lower.includes("diffuse large"))
    return "Non-Hodgkin Lymphoma";
  if (lower.includes("lymphoma"))
    return "Non-Hodgkin Lymphoma";
  if (lower.includes("myeloma"))
    return "Multiple Myeloma";
  if (lower.includes("aml") || lower.includes("acute myeloid"))
    return "Leukemia (AML)";
  if (lower.includes("all") || lower.includes("acute lymph"))
    return "Leukemia (ALL)";
  if (lower.includes("melanoma"))
    return "Melanoma";
  if (lower.includes("thyroid"))
    return "Thyroid Cancer";
  // Brain tumors
  if (lower.includes("brain cancer") || lower.includes("brain tumour") ||
      lower.includes("primary brain") || lower.includes("intracranial tumor"))
    return "Brain Cancer";
  if (lower.includes("glioblastoma") || lower === "gbm")
    return "Glioblastoma (GBM)";
  if (lower.includes("oligodendroglioma"))
    return "Oligodendroglioma";
  if (lower.includes("meningioma"))
    return "Meningioma";
  if (lower.includes("brain metastasis") || lower.includes("cerebral metastasis"))
    return "Brain Metastasis";
  if (lower.includes("medulloblastoma"))
    return "Medulloblastoma";
  if (lower.includes("ependymoma"))
    return "Ependymoma";
  if (lower.includes("lower grade glioma") || lower.includes("lgg") ||
      lower.includes("astrocytoma") || lower.includes("glioma"))
    return "Lower Grade Glioma";

  // Map key fuzzy match as last resort
  for (const [key, val] of Object.entries(CANCER_MAP)) {
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
      return val;
    }
  }
  return null;
}

// ── Stage normaliser ──────────────────────────────────────────────────────────
function normaliseStage(stage) {
  if (!stage) return null;
  const s = stage.toUpperCase();
  if (s === "IV" || s === "IVA" || s === "IVB" || s === "EXTENSIVE" || s === "METASTATIC") return "IV";
  if (s === "III" || s === "IIIA" || s === "IIIB" || s === "IIIC") return "III";
  if (s === "IIB" || s === "IIA" || s === "IIC" || s === "II")  return "II";
  if (s === "I"   || s === "IA"   || s === "IB"  || s === "IC" || s === "LIMITED") return "I";
  return null;
}

// ── Similar patients lookup ───────────────────────────────────────────────────
// Returns how many patients in the training set match this profile
function getSimilarPatientCount(cancerType, stage) {
  if (!DATASET_STATS || !DATASET_STATS.top_cancers) return null;
  const stageCount  = DATASET_STATS.stage_distribution?.[stage] || 0;
  const cancerTotal = DATASET_STATS.total_patients || 120000;
  // Approximate: (cancer proportion) * (stage proportion)
  const cancerCounts = DATASET_STATS.top_cancers;
  const cancerCount  = cancerCounts[cancerType] || Math.round(cancerTotal * 0.02);
  const stageProportion = stageCount / cancerTotal;
  return Math.round(cancerCount * stageProportion);
}

// ── Cycle bucket ──────────────────────────────────────────────────────────────
function getCycleBucket(cycles) {
  if (cycles === 0) return "Continuous / Targeted Therapy";
  if (cycles <= 3)  return "1–3 cycles";
  if (cycles <= 6)  return "4–6 cycles";
  if (cycles <= 9)  return "7–9 cycles";
  return "10+ cycles";
}

// ── Biomarker adjustments ─────────────────────────────────────────────────────
// Post-process the model's baseline prediction using biomarker signals
// (mirrors what the RF learned as feature interactions)
function applyBiomarkerAdjustment(baseCycles, baseRegimen, cancerType, stage, bm, secondaryAnalysis = null) {
  let cycles  = baseCycles;
  let regimen = baseRegimen;
  let notes   = [];

  if (!bm) return { cycles, regimen, notes };

  // HER2+ breast → AC-THP regimen (8 cycles)
  if (cancerType === "Breast Cancer" && bm.her2 === "positive") {
    cycles  = stage === "IV" ? 6 : 8;
    regimen = stage === "IV" ? "THP (Docetaxel + Trastuzumab + Pertuzumab)" : "AC-THP (Neoadjuvant)";
    notes.push("HER2+ status → anti-HER2 targeted regimen selected");
    return { cycles, regimen, notes };
  }

  // HR+/HER2- breast → correct adjuvant regimen by stage (FIX-7)
  if (cancerType === "Breast Cancer" && bm.her2 === "negative") {
    const isHRPos = bm.hr === "positive" || bm.er === "positive" || bm.pr === "positive";
    const isTNBC  = bm.er === "negative" && bm.pr === "negative" && bm.her2 === "negative";

    if (isTNBC && (stage === "II" || stage === "III")) {
      cycles  = 8;
      regimen = "Pembrolizumab + Paclitaxel/Carboplatin → Pembrolizumab + AC (KEYNOTE-522)";
      notes.push("Triple-negative phenotype → KEYNOTE-522 immunotherapy-chemotherapy regimen");
      return { cycles, regimen, notes };
    }

    if (isHRPos) {
      // Check for genomic risk score from secondary analysis
      const genomicResult = secondaryAnalysis?.chemotherapyAdjustments;
      if (genomicResult?.action === "avoid" && (stage === "I" || stage === "II" || stage === "IIA" || stage === "IIB")) {
        cycles  = 0;
        regimen = "Endocrine Therapy Alone (Genomic Low Risk — Chemotherapy Avoided)";
        notes.push("Oncotype DX/MammaPrint low risk — chemotherapy safely avoided per genomic testing");
        notes.push("Endocrine therapy (tamoxifen or aromatase inhibitor) ± ovarian suppression recommended");
        return { cycles, regimen, notes };
      }

      if (stage === "IV") {
        cycles  = 6;
        regimen = "CDK4/6 Inhibitor + Endocrine Therapy (HR+/HER2- metastatic)";
        notes.push("HR+/HER2- Stage IV → endocrine-based therapy preferred over cytotoxic chemotherapy");
        return { cycles, regimen, notes };
      }
      if (stage === "I") {
        cycles  = 4;
        regimen = "TC (Docetaxel + Cyclophosphamide) — HR+/HER2- Stage I adjuvant";
        notes.push("HR+/HER2- Stage I → TC × 4 cycles adjuvant chemotherapy");
        return { cycles, regimen, notes };
      }
      if (stage === "II" || stage === "IIB" || stage === "IIA") {
        cycles  = 8;
        regimen = "AC-T Dose-Dense (Doxorubicin + Cyclophosphamide → Paclitaxel) — HR+/HER2- Stage II adjuvant";
        notes.push("HR+/HER2- Stage II → dose-dense AC-T × 8 cycles adjuvant; consider OncotypeDx for low-risk");
        return { cycles, regimen, notes };
      }
      if (stage === "III") {
        cycles  = 8;
        regimen = "AC-T Dose-Dense — HR+/HER2- Stage III neoadjuvant/adjuvant";
        notes.push("HR+/HER2- Stage III → AC-T × 8 cycles");
        return { cycles, regimen, notes };
      }
    }
  }
  if (cancerType === "Lung Cancer (NSCLC)" && bm.egfr === "mutated") {
    cycles  = 0;
    regimen = "Osimertinib 80 mg daily (EGFR TKI)";
    notes.push("EGFR mutation → FLAURA-based targeted TKI (continuous, no fixed cycles)");
  }

  // RAS-mutated CRC → FOLFIRI + Bev instead of anti-EGFR
  if (cancerType === "Colorectal Cancer" && bm.ras === "mutated" && stage === "IV") {
    cycles  = 12;
    regimen = "FOLFIRI + Bevacizumab";
    notes.push("RAS mutation → anti-EGFR excluded; bevacizumab-based regimen selected");
  }

  // RAS WT CRC → FOLFOX + Cetuximab
  if (cancerType === "Colorectal Cancer" && bm.ras === "wild-type" && stage === "IV") {
    cycles  = 12;
    regimen = "FOLFOX + Cetuximab";
    notes.push("RAS wild-type → anti-EGFR (Cetuximab) eligible");
  }

  // TNBC → pembrolizumab-based
  if (cancerType === "Breast Cancer" &&
      bm.her2 === "negative" && bm.hr === "negative") {
    if (stage === "II" || stage === "III") {
      cycles  = 8;
      regimen = "Pembrolizumab + Paclitaxel/Carboplatin → Pembrolizumab + AC (KEYNOTE-522)";
      notes.push("Triple-negative phenotype → KEYNOTE-522 immunotherapy-chemotherapy regimen");
    }
  }

  // PD-L1 ≥50% NSCLC → pembrolizumab monotherapy
  if (cancerType === "Lung Cancer (NSCLC)" &&
      bm.egfr !== "mutated" && bm.pdl1 === ">=50%" && stage === "IV") {
    cycles  = 35;
    regimen = "Pembrolizumab 200mg q3w (KEYNOTE-024 — up to 2 years)";
    notes.push("PD-L1 ≥50% → pembrolizumab monotherapy preferred (KEYNOTE-024)");
  }

  // ── BRAIN TUMOR BIOMARKER ADJUSTMENTS ────────────────────────────────────
  const brainBm = bm;

  // General Brain Cancer / Brain Tumor: apply Stupp-like protocol based on available biomarkers
  if (cancerType === "Brain Cancer" || cancerType === "Brain Tumor") {
    if (brainBm.mgmt === "methylated") {
      cycles  = 6;
      regimen = "Stupp Protocol — RT + concomitant TMZ → Adjuvant TMZ ×6 (MGMT methylated, NEJM 2005)";
      notes.push("MGMT promoter methylated → Temozolomide-responsive; full Stupp protocol recommended");
    } else if (brainBm.mgmt === "unmethylated") {
      cycles  = 6;
      regimen = "RT + concomitant TMZ → Adjuvant TMZ ×6 (MGMT unmethylated — consider TTFields, NCCN)";
      notes.push("MGMT unmethylated → reduced TMZ benefit; consider tumour treating fields (Optune)");
    } else if (brainBm.idh === "wild-type") {
      cycles  = 6;
      regimen = "Stupp Protocol (IDH-WT = molecular GBM) — RT + TMZ ×6 (NCCN 2024)";
      notes.push("IDH wild-type brain tumor reclassified as molecular GBM per WHO 2021 — treated with Stupp protocol");
    } else {
      // Default for brain cancer/tumor without specific biomarkers
      cycles  = 6;
      regimen = "RT + Temozolomide (Stupp Protocol — MGMT/IDH status pending)";
      notes.push("Brain cancer/tumor — Stupp protocol applied; MGMT methylation and IDH status should be tested for prognostic refinement");
    }
    return { cycles, regimen, notes };
  }

  // GBM: MGMT methylation → Stupp Protocol (6 cycles TMZ)
  if (cancerType === "Glioblastoma (GBM)") {
    if (brainBm.mgmt === "methylated") {
      cycles  = 6;
      regimen = "Stupp Protocol — RT + concomitant TMZ → Adjuvant TMZ ×6 (MGMT methylated, NEJM 2005)";
      notes.push("MGMT promoter methylated → Temozolomide-responsive; full Stupp protocol recommended");
    } else if (brainBm.mgmt === "unmethylated") {
      cycles  = 6;
      regimen = "RT + concomitant TMZ → Adjuvant TMZ ×6 (MGMT unmethylated — consider TTFields, NCCN)";
      notes.push("MGMT unmethylated → reduced TMZ benefit; consider tumour treating fields (Optune)");
    } else {
      // MGMT unknown
      cycles  = 6;
      regimen = "Stupp Protocol — RT + concomitant TMZ → Adjuvant TMZ ×6 (MGMT status unknown)";
      notes.push("MGMT status unknown — Stupp protocol applied by default; test MGMT for prognostic value");
    }
    return { cycles, regimen, notes };
  }

  // Lower Grade Glioma: IDH + WHO grade drives regimen
  if (cancerType === "Lower Grade Glioma") {
    if (brainBm.idh === "wild-type") {
      cycles  = 6;
      regimen = "Stupp Protocol (IDH-WT LGG = molecular GBM) — RT + TMZ ×6 (NCCN 2024)";
      notes.push("IDH wild-type LGG reclassified as molecular GBM per WHO 2021 — treated accordingly");
    } else if (brainBm.whoCnsGrade === 3) {
      cycles  = 12;
      regimen = "RT + Adjuvant TMZ ×12 (CATNON trial — IDH-mutant Grade 3 Astrocytoma)";
      notes.push("IDH-mutant Grade 3 → 12 cycles adjuvant TMZ after RT (CATNON trial)");
    } else {
      // Grade 2
      cycles  = 6;
      regimen = "RT + Adjuvant PCV ×6 (RTOG 9802 — high-risk Grade 2 LGG) or TMZ ×12";
      notes.push("Grade 2 LGG — RT + PCV ×6 (RTOG 9802) or RT + TMZ ×12 (RTOG 0424)");
    }
    return { cycles, regimen, notes };
  }

  // Oligodendroglioma: 1p/19q co-deletion → PCV chemotherapy
  if (cancerType === "Oligodendroglioma") {
    if (brainBm.codeletion1p19q === "co-deleted" || brainBm.whoCnsGrade === 3) {
      cycles  = 6;
      regimen = "RT + Adjuvant PCV ×6 (EORTC 26951 / RTOG 9402 — 1p/19q co-deleted Oligodendroglioma)";
      notes.push("1p/19q co-deletion confirmed → PCV chemotherapy with RT (EORTC 26951 / RTOG 9402 — survival benefit)");
    } else {
      cycles  = 6;
      regimen = "RT + Adjuvant PCV ×6 (Oligodendroglioma protocol)";
      notes.push("Oligodendroglioma — RT + PCV combination; verify 1p/19q co-deletion status");
    }
    return { cycles, regimen, notes };
  }

  // Meningioma: surgery ± RT, rarely chemo
  if (cancerType === "Meningioma") {
    if (brainBm.whoCnsGrade === 3) {
      cycles  = 6;
      regimen = "RT + Adjuvant Chemotherapy (Anaplastic Meningioma — TMZ or Bevacizumab, experimental)";
      notes.push("WHO Grade 3 (Anaplastic) Meningioma → adjuvant RT + experimental chemotherapy");
    } else {
      cycles  = 0;
      regimen = "Surgery ± RT (Meningioma — chemotherapy not standard; RT for Grade 2–3 or subtotal resection)";
      notes.push("Meningioma: primary treatment is surgery; RT for WHO Grade 2–3 or incomplete resection");
    }
    return { cycles, regimen, notes };
  }

  return { cycles, regimen, notes };
}

// ── ECOG PS adjustment ────────────────────────────────────────────────────────
function applyECOGAdjustment(cycles, regimen, ps) {
  if (ps === null || ps === undefined) return { cycles, regimen, psNote: null };
  if (ps >= 3) {
    return {
      cycles:  0,
      regimen: "Best Supportive Care / Clinical Trial recommended",
      psNote:  `ECOG PS ${ps} — intensive chemotherapy not recommended; supportive care preferred`,
    };
  }
  if (ps === 2) {
    return {
      cycles,
      regimen,
      psNote: `ECOG PS 2 — consider dose reduction (75–80% standard dose); carboplatin preferred over cisplatin`,
    };
  }
  return { cycles, regimen, psNote: null };
}

// ── Main ML prediction function ───────────────────────────────────────────────
function mlPredict(parsed, dataCheck) {
  loadArtefacts();

  const { cancerType, stage, grade, biomarkers, performanceStatus, age } = parsed;

  // ── Guard 1: blocked by data-checker ─────────────────────────────────────
  if (dataCheck && dataCheck.predictionBlock) {
    const blockMessages = {
      TUMOR_MARKER_ONLY_NO_CANCER:
        "This appears to be a standalone tumour-marker report (e.g. CA 15-3, CEA). " +
        "A tumour marker alone cannot determine cancer type or stage. " +
        "Please provide a histopathology or biopsy report.",
      MARKER_CANCER_MISMATCH:
        `The tumour marker in this report (${dataCheck.markerMismatch?.marker?.toUpperCase() || "unknown"}) ` +
        `is associated with ${dataCheck.markerMismatch?.expectedCancer || "a different cancer"}, ` +
        `but the detected cancer type is '${cancerType}'. ` +
        "Verify the correct report has been uploaded before prediction.",
      NO_CANCER_TYPE:
        "Cancer type could not be determined from this report. " +
        "A histopathology or biopsy report confirming the cancer type is required.",
    };
    return {
      success: false,
      blocked: true,
      reason:  dataCheck.predictionBlock,
      message: blockMessages[dataCheck.predictionBlock] ||
               "Insufficient data for prediction.",
    };
  }

  // ── Guard 2: CA 15-3 / marker → cancer type mismatch (direct check) ──────
  const bm = biomarkers || {};
  if (bm.ca153 !== undefined && cancerType &&
      !cancerType.toLowerCase().includes("breast")) {
    return {
      success: false,
      blocked: true,
      reason:  "MARKER_CANCER_MISMATCH",
      message: `CA 15-3 is a breast cancer tumour marker. ` +
               `The detected cancer type '${cancerType}' does not match. ` +
               `Do NOT use CA 15-3 as the primary input for ${cancerType} staging.`,
    };
  }

  // 1. Normalise inputs
  const datasetCancerType = normaliseCancerType(cancerType);
  const datasetStage      = normaliseStage(stage);

  // FIX-6: Guard against CRC-specific ML features contaminating non-CRC cancers.
  const isColorectal = datasetCancerType === "Colorectal Cancer";
  const isBrainTumor = ["Glioblastoma (GBM)","Lower Grade Glioma","Oligodendroglioma",
    "Meningioma","Brain Metastasis","Medulloblastoma","Ependymoma","Brain Cancer","Brain Tumor"].includes(datasetCancerType);
  const cleanBm = { ...bm };
  if (!isColorectal) {
    delete cleanBm.ras;
    delete cleanBm.kras;
    delete cleanBm.nras;
    delete cleanBm.cea;
  }

  // 2. Look up model rules
  let modelEntry = null;
  if (datasetCancerType && datasetStage && MODEL_RULES[datasetCancerType]) {
    modelEntry = MODEL_RULES[datasetCancerType][datasetStage] || null;
  }

  // Fall back to closest stage if exact not found
  if (!modelEntry && datasetCancerType && MODEL_RULES[datasetCancerType]) {
    const stageOrder = ["IV", "III", "II", "I"];
    for (const s of stageOrder) {
      if (MODEL_RULES[datasetCancerType][s]) {
        modelEntry = MODEL_RULES[datasetCancerType][s];
        break;
      }
    }
  }

  if (!modelEntry) {
    return { success: false, reason: "no_match", datasetCancerType, datasetStage };
  }

  // 3. Start from model baseline
  let cycles  = modelEntry.predicted_cycles_mode;
  let regimen = modelEntry.top_regimen;
  const sampleCount = modelEntry.sample_count;

  // 4. Apply biomarker adjustments (use cleanBm — CRC fields stripped for non-CRC)
  const bmAdj = applyBiomarkerAdjustment(
    cycles, regimen, datasetCancerType, datasetStage || "III", cleanBm, null
  );
  cycles  = bmAdj.cycles;
  regimen = bmAdj.regimen;

  // 5. Apply ECOG PS adjustment
  const psAdj = applyECOGAdjustment(cycles, regimen, performanceStatus);
  cycles  = psAdj.cycles;
  regimen = psAdj.regimen;

  // 6. Similar patient count
  const similarPatients = getSimilarPatientCount(datasetCancerType, datasetStage || "III");

  // 7. Cycle bucket
  const cycleBucket = getCycleBucket(cycles);

  // 8. Dataset prevalence for this cancer
  const cancerPrevalence = DATASET_STATS.top_cancers?.[datasetCancerType] || null;

  // 9. Data completeness note
  const completenessNote = dataCheck && dataCheck.completeness < 60
    ? `Data completeness is ${dataCheck.completeness}% — prediction confidence is reduced. Providing ${dataCheck.missingReports?.length || 0} additional report(s) would improve accuracy.`
    : null;

  return {
    success: true,
    mlResult: {
      predictedCycles:     cycles,
      predictedCycleMean:  modelEntry.predicted_cycles_mean,
      cycleBucket,
      regimen,
      datasetCancerType,
      datasetStage:        datasetStage || "Unknown",
      similarPatients:     similarPatients || sampleCount,
      cancerPrevalence,
      modelAccuracy:       DATASET_STATS.accuracy_bucket,
      trainingPatients:    DATASET_STATS.total_patients,
      biomarkerNotes:      bmAdj.notes,
      psNote:              psAdj.psNote,
      completenessNote,
      featureImportance:   FEAT_IMPORT,
      cycleBucketAccuracy: `${(DATASET_STATS.accuracy_bucket * 100).toFixed(1)}%`,
    }
  };
}

// ── Model types helper ─────────────────────────────────────────────────────────
function getModelTypes() {
  loadArtefacts();
  return Object.keys(MODEL_RULES || {});
}

// ── Dataset info endpoint helper ──────────────────────────────────────────────
function getDatasetInfo() {
  loadArtefacts();
  return {
    totalPatients:      DATASET_STATS.total_patients,
    accuracy:           DATASET_STATS.accuracy,
    accuracyBucket:     DATASET_STATS.accuracy_bucket,
    cancerTypes:        DATASET_STATS.cancer_types,
    uniqueRegimens:     DATASET_STATS.unique_regimens,
    stageDistribution:  DATASET_STATS.stage_distribution,
    topCancers:         DATASET_STATS.top_cancers,
    cycleDistribution:  DATASET_STATS.cycle_distribution,
    meanCycles:         DATASET_STATS.mean_cycles,
    medianCycles:       DATASET_STATS.median_cycles,
    featureImportance:  FEAT_IMPORT,
    source:             "SEER Program / NCCN Guidelines / ACS Cancer Statistics 2023",
  };
}

// Re-reads the artefacts from disk. Called after a retraining run promotes a
// new model so the very next prediction uses it — without this the server would
// keep serving the old model until it was restarted.
function reloadArtefacts() {
  MODEL_RULES = null;
  loadArtefacts(true);
  return {
    trainingPatients: DATASET_STATS.total_patients,
    accuracyBucket:   DATASET_STATS.accuracy_bucket,
    cancerTypes:      Object.keys(MODEL_RULES || {}).length,
  };
}

module.exports = { mlPredict, getDatasetInfo, normaliseCancerType, loadArtefacts, reloadArtefacts, getModelTypes };
