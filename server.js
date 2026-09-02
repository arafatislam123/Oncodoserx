/**
 * OncoDoseRx — Server
 * =====================
 * Express backend combining:
 *   1. Text / PDF report parser   (engine/parser.js)
 *   2. Rule-based NCCN engine     (engine/predictor.js)
 *   3. ML model bridge            (engine/ml_predictor.js)
 *      → trained on 120,000 patient SEER/NCCN dataset
 *
 * No external AI API required.
 */

"use strict";

require("dotenv").config();
const express   = require("express");
const multer    = require("multer");
const path      = require("path");
const fs        = require("fs");
const cors      = require("cors");
const pdfParse  = require("pdf-parse");
const Tesseract = require("tesseract.js");

const { parseReport }          = require("./engine/parser");
const { predict }              = require("./engine/predictor");
const { mlPredict, getDatasetInfo, normaliseCancerType, loadArtefacts, getModelTypes } = require("./engine/ml_predictor");
const { classifyReport }       = require("./engine/report_classifier");
const { checkMissingData, PATHWAYS, DEFAULT_PATHWAY } = require("./engine/data_checker");
const db                       = require("./services/database");
const { calculateBSA, validateBSAInputs } = require("./services/bsaCalculator");
const { calculateDose, generateExplanation } = require("./services/doseEngine");
const { generateComprehensiveExplanation } = require("./services/explainableAI");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Allowed MIME types ────────────────────────────────────────────────────────
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const ALLOWED_EXTS = new Set([".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp"]);

function isImage(mimetype, originalname) {
  return (
    ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimetype) ||
    [".png", ".jpg", ".jpeg", ".webp"].includes(
      path.extname(originalname).toLowerCase()
    )
  );
}

// ── Upload ────────────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file,  cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok  = ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTS.has(ext);
    ok
      ? cb(null, true)
      : cb(new Error("Unsupported file type. Use PDF, TXT, PNG, JPG, JPEG, or WEBP."));
  },
});

// ── Text extraction ───────────────────────────────────────────────────────────
async function extractText(filePath, mimetype, originalname) {
  const ext = path.extname(originalname).toLowerCase();

  // PDF
  if (mimetype === "application/pdf" || ext === ".pdf") {
    const buf  = fs.readFileSync(filePath);
    const data = await pdfParse(buf);
    return data.text;
  }

  // Images — run OCR via Tesseract.js
  if (isImage(mimetype, originalname)) {
    console.log(`  [OCR] Running Tesseract on ${originalname}…`);
    const { data } = await Tesseract.recognize(filePath, "eng", {
      logger: () => {},   // suppress progress logs
    });
    const text = data.text || "";
    console.log(`  [OCR] Extracted ${text.length} characters (confidence: ${data.confidence?.toFixed(1)}%)`);
    return text;
  }

  // Plain text
  return fs.readFileSync(filePath, "utf-8");
}

// ── Core analysis function ────────────────────────────────────────────────────
function runAnalysis(rawText, filename, selectedCancerType = null) {
  // 1. Classify what kind of report this is
  const reportClass = classifyReport(rawText);

  // 2. Parse structured data from report text
  const parsed = parseReport(rawText);

  // 3. If user pre-selected a cancer type, validate and enforce it
  let cancerTypeMismatch = null;
  if (selectedCancerType) {
    const parsedType = parsed.cancerType || "";
    const normalisedSelected = normaliseCancerType(selectedCancerType);
    const normalisedParsed = normaliseCancerType(parsedType);

    if (normalisedSelected && normalisedParsed && normalisedSelected !== normalisedParsed) {
      cancerTypeMismatch = {
        selected: selectedCancerType,
        detected: parsedType,
        normalisedSelected,
        normalisedParsed,
      };
    }
    // Override parsed cancer type with user selection for downstream processing
    if (normalisedSelected) {
      parsed.cancerType = selectedCancerType;
      parsed._selectedCancerType = normalisedSelected;
    }
  }

  // 4. Check for missing data / required reports
  const dataCheck = checkMissingData(parsed, reportClass);

  // 5. Rule-based NCCN prediction (always runs — provides reference protocols)
  const ruleResult = predict(parsed);

  // 6. ML model prediction — passes dataCheck so it can block if needed
  const mlResult = mlPredict(parsed, dataCheck);

  // 7. Build final response
  return buildFinalResult(parsed, ruleResult, mlResult, filename, reportClass, dataCheck, cancerTypeMismatch);
}

function buildFinalResult(parsed, ruleResult, mlResult, filename, reportClass, dataCheck, cancerTypeMismatch = null) {
  const hasML    = mlResult.success && mlResult.mlResult;
  const blocked  = mlResult.blocked === true;
  const hasRules = ruleResult.recommendations && ruleResult.recommendations.length > 0;

  // Primary prediction (null if blocked)
  let primaryPrediction = null;
  if (hasML) {
    const ml = mlResult.mlResult;
    primaryPrediction = {
      source:             "ML Model (120k patient dataset)",
      datasetCancerType:  ml.datasetCancerType,
      datasetStage:       ml.datasetStage,
      predictedCycles:    ml.predictedCycles,
      predictedCycleMean: ml.predictedCycleMean,
      cycleBucket:        ml.cycleBucket,
      regimen:            ml.regimen,
      similarPatients:    ml.similarPatients,
      cancerPrevalence:   ml.cancerPrevalence,
      trainingPatients:   ml.trainingPatients,
      modelAccuracy:      ml.cycleBucketAccuracy,
      biomarkerNotes:     ml.biomarkerNotes,
      psNote:             ml.psNote,
      completenessNote:   ml.completenessNote,
      featureImportance:  ml.featureImportance,
    };
  }

  const ruleRecommendations = hasRules ? ruleResult.recommendations : [];

  // Cross-validate ML vs rules
  let agreement = null;
  if (hasML && hasRules && ruleRecommendations[0]) {
    const mlCycles   = primaryPrediction.predictedCycles;
    const ruleCycles = ruleRecommendations[0].cycles;
    if (mlCycles === ruleCycles)                    agreement = "strong";
    else if (Math.abs(mlCycles - ruleCycles) <= 2)  agreement = "moderate";
    else                                             agreement = "divergent";
  }

  return {
    success:             true,
    filename,
    // Report validation
    reportClassification: {
      primaryType:       reportClass.primaryType,
      primaryLabel:      reportClass.primaryLabel,
      isTumorMarkerOnly: reportClass.isTumorMarkerOnly,
      markerMismatch:    reportClass.markerMismatch,
      detectedMarkers:   reportClass.detectedMarkers,
      allTypes:          reportClass.allTypes,
    },
    // Data completeness
    dataCheck: {
      completeness:     dataCheck.completeness,
      dataTier:         dataCheck.dataTier,
      canPredict:       dataCheck.canPredict,
      predictionBlock:  dataCheck.predictionBlock,
      missingRequired:  dataCheck.missingRequired,
      missingImportant: dataCheck.missingImportant,
      missingReports:   dataCheck.missingReports,
      satisfiedReports: dataCheck.satisfiedReports,
      primaryReports:   dataCheck.primaryReports,
      conditionalReports: dataCheck.conditionalReports,
      missingPrimary:   dataCheck.missingPrimary,
      missingConditional: dataCheck.missingConditional,
      conditionalTriggers: dataCheck.conditionalTriggers,
      clinicalNotes:    dataCheck.clinicalNotes,
      molecularNeeded:  dataCheck.molecularNeeded,
      totalReportsNeeded: dataCheck.totalReportsNeeded,
    },
    // Cancer type validation
    cancerTypeMismatch,
    // Block info (if ML was blocked)
    predictionBlocked:   blocked,
    blockReason:         blocked ? mlResult.reason   : null,
    blockMessage:        blocked ? mlResult.message  : null,
    // Results
    parsed,
    primaryPrediction,
    ruleRecommendations,
    agreement,
    datasetInfo: {
      totalPatients: 120000,
      source:        "SEER Program / NCCN Guidelines / ACS Cancer Statistics 2023",
      accuracy:      "79.4% (cycle range)",
    },
  };
}

// ── POST /api/analyze (single file upload) ───────────────────────────────────
app.post("/api/analyze", upload.single("report"), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const rawText = await extractText(filePath, req.file.mimetype, req.file.originalname);
    if (!rawText || rawText.trim().length < 30) {
      const isImg = isImage(req.file.mimetype, req.file.originalname);
      return res.status(400).json({
        error: isImg
          ? "OCR could not extract readable text from the image. Ensure the image is clear and contains printed text."
          : "Could not extract text from the file. Ensure the PDF is text-based.",
      });
    }
    const selectedCancerType = req.body?.cancerType || null;
    res.json(runAnalysis(rawText, req.file.originalname, selectedCancerType));
  } catch (err) {
    console.error("Analyze error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  } finally {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

// ── POST /api/analyze-multi (multi-report intake) ────────────────────────────
// Accepts up to 7 named files matching the report-intake slots.
// Each field name = slot id (e.g. "histopathology", "colonoscopy", "cect", etc.)
// Also accepts extra_0, extra_1 … for unassigned files from bulk upload.
const MULTI_FIELDS = [
  "histopathology", "colonoscopy", "cect",
  "cea", "mmr", "molecular", "surgical",
];
const uploadMulti = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok  = ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTS.has(ext);
    ok ? cb(null, true) : cb(new Error(`Unsupported file type: ${file.originalname}`));
  },
}).fields([
  ...MULTI_FIELDS.map(f => ({ name: f,          maxCount: 1 })),
  ...MULTI_FIELDS.map(f => ({ name: f + "_extra",maxCount: 3 })), // duplicate slots
  ...Array.from({ length: 10 }, (_, i) => ({ name: `extra_${i}`, maxCount: 1 })), // unassigned
]);

app.post("/api/analyze-multi", (req, res) => {
  uploadMulti(req, res, async (uploadErr) => {
    const uploadedPaths = [];
    try {
      if (uploadErr) return res.status(400).json({ error: uploadErr.message });

      const files  = req.files || {};
      const slotsMeta = [];  // { slotId, filename, text }
      let   combinedText = "";

      // Collect all field names — named slots + extra_ variants
      const allFieldNames = [
        ...MULTI_FIELDS,
        ...MULTI_FIELDS.map(f => f + "_extra"),
        ...Array.from({ length: 10 }, (_, i) => `extra_${i}`),
      ];

      // Extract text from each uploaded slot
      for (const fieldName of allFieldNames) {
        const fileArr = files[fieldName];
        if (!fileArr || !fileArr[0]) continue;

        const file = fileArr[0];
        uploadedPaths.push(file.path);

        // Determine display slot id (strip _extra suffix)
        const displaySlot = fieldName.replace(/_extra$/, "").replace(/^extra_\d+$/, "extra");

        try {
          const text = await extractText(file.path, file.mimetype, file.originalname);
          if (text && text.trim().length > 10) {
            slotsMeta.push({ slotId: displaySlot, filename: file.originalname, chars: text.length });
            combinedText += `\n\n=== ${displaySlot.toUpperCase()} REPORT: ${file.originalname} ===\n${text}`;
          }
        } catch (e) {
          console.warn(`  [MULTI] Could not extract from ${fieldName}: ${e.message}`);
        }
      }

      // Also accept pasted text in body
      if (req.body?.pastedText && req.body.pastedText.trim().length > 20) {
        combinedText += `\n\n=== PASTED TEXT ===\n${req.body.pastedText}`;
        slotsMeta.push({ slotId: "pasted", filename: "Pasted text", chars: req.body.pastedText.length });
      }

      if (!combinedText || combinedText.trim().length < 30) {
        return res.status(400).json({ error: "No readable content found in uploaded files." });
      }

      const selectedCancerType = req.body?.cancerType || null;
      const result = runAnalysis(combinedText, `${slotsMeta.length} report(s) combined`, selectedCancerType);
      result.uploadedSlots = slotsMeta;
      res.json(result);

    } catch (err) {
      console.error("Multi-analyze error:", err.message);
      res.status(500).json({ error: err.message || "Internal server error." });
    } finally {
      // Clean up all uploaded files
      for (const p of uploadedPaths) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
  });
});

// ── POST /api/analyze-text (pasted text) ──────────────────────────────────────
app.post("/api/analyze-text", async (req, res) => {
  const { text, cancerType } = req.body;
  if (!text || text.trim().length < 30) {
    return res.status(400).json({ error: "Please provide at least 30 characters of report text." });
  }
  try {
    res.json(runAnalysis(text, "Pasted Report", cancerType || null));
  } catch (err) {
    console.error("Analyze-text error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── GET /api/dataset ──────────────────────────────────────────────────────────
app.get("/api/dataset", (_req, res) => {
  res.json({ success: true, ...getDatasetInfo() });
});

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", engine: "local", patients: 120000 });
});

// ── GET /api/cancer-types ─────────────────────────────────────────────────────
// Returns all supported cancer types with their display names and categories
app.get("/api/cancer-types", (_req, res) => {
  loadArtefacts();
  const modelTypes = getModelTypes();
  const pathwayTypes = Object.keys(PATHWAYS);

  // Combine and deduplicate
  const allTypes = [...new Set([...modelTypes, ...pathwayTypes])];

  const categories = {
    "Breast Cancer": "Breast",
    "Triple-Negative Breast Cancer (TNBC)": "Breast",
    "Lung Cancer (NSCLC)": "Lung",
    "Lung Adenocarcinoma (NSCLC)": "Lung",
    "Squamous Cell Lung Cancer (NSCLC)": "Lung",
    "Small Cell Lung Cancer (SCLC)": "Lung",
    "Colorectal Cancer": "GI",
    "Rectal Cancer": "GI",
    "Gastric Cancer": "GI",
    "Gastroesophageal Junction Cancer": "GI",
    "Esophageal Cancer": "GI",
    "Pancreatic Cancer": "GI",
    "Hepatocellular Carcinoma (HCC)": "GI",
    "Ovarian Cancer": "Gynaecological",
    "Cervical Cancer": "Gynaecological",
    "Endometrial Cancer": "Gynaecological",
    "Prostate Cancer": "Urological",
    "Bladder Cancer": "Urological",
    "Renal Cell Carcinoma (RCC)": "Urological",
    "Testicular Cancer": "Urological",
    "Head and Neck Squamous Cell Carcinoma": "Head & Neck",
    "Nasopharyngeal Carcinoma": "Head & Neck",
    "Melanoma": "Skin",
    "Non-Hodgkin Lymphoma": "Haematological",
    "Hodgkin Lymphoma": "Haematological",
    "Diffuse Large B-Cell Lymphoma (DLBCL)": "Haematological",
    "Follicular Lymphoma": "Haematological",
    "Acute Myeloid Leukemia (AML)": "Haematological",
    "Acute Lymphoblastic Leukemia (ALL)": "Haematological",
    "Chronic Myeloid Leukemia (CML)": "Haematological",
    "Chronic Lymphocytic Leukemia (CLL)": "Haematological",
    "Multiple Myeloma": "Haematological",
    "Thyroid Cancer": "Endocrine",
    "Brain Cancer": "Brain",
    "Brain Tumor": "Brain",
    "Glioblastoma (GBM)": "Brain",
    "Lower Grade Glioma": "Brain",
    "Oligodendroglioma": "Brain",
    "Meningioma": "Brain",
    "Brain Metastasis": "Brain",
    "Medulloblastoma": "Brain",
    "Ependymoma": "Brain",
  };

  const types = allTypes.map(type => ({
    id: type,
    label: type,
    category: categories[type] || "Other",
    hasModelRules: modelTypes.includes(type),
    hasPathway: !!PATHWAYS?.[type],
  }));

  res.json({ success: true, cancerTypes: types });
});

// ── GET /api/cancer-type/:type/requirements ──────────────────────────────────
// Returns the required documents and fields for a specific cancer type
app.get("/api/cancer-type/:type/requirements", (req, res) => {
  const cancerType = decodeURIComponent(req.params.type);
  const pathway = PATHWAYS[cancerType] || DEFAULT_PATHWAY;

  // Try fuzzy match if exact match fails
  let matchedPathway = pathway;
  let matchedName = cancerType;
  if (!PATHWAYS[cancerType]) {
    for (const [key, val] of Object.entries(PATHWAYS)) {
      if (cancerType.toLowerCase().includes(key.toLowerCase()) ||
          key.toLowerCase().includes(cancerType.toLowerCase())) {
        matchedPathway = val;
        matchedName = key;
        break;
      }
    }
  }

  // Build combined reports list for backward compatibility
  const allReports = matchedPathway.requiredReports || [
    ...(matchedPathway.primaryReports || []),
    ...(matchedPathway.conditionalReports || []),
  ];

  res.json({
    success: true,
    cancerType: matchedName,
    requiredFields: matchedPathway.requiredFields,
    importantFields: matchedPathway.importantFields,
    requiredReports: allReports,
    primaryReports: matchedPathway.primaryReports || [],
    conditionalReports: matchedPathway.conditionalReports || [],
    molecularNeeded: matchedPathway.molecularNeeded,
    minimumToPredict: matchedPathway.minimumToPredict,
    noteIfMissing: matchedPathway.noteIfMissing,
    totalReportsNeeded: allReports.length,
    conditionalTriggers: matchedPathway.conditionalTriggers || {},
  });
});

// ── POST /api/analyze-breast-secondary ────────────────────────────────────────
// Secondary analysis for breast cancer conditional reports
// (Genomic Risk Score, BRCA, Nodal Staging)
app.post("/api/analyze-breast-secondary", upload.single("report"), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });
    const rawText = await extractText(filePath, req.file.mimetype, req.file.originalname);
    if (!rawText || rawText.trim().length < 30) {
      const isImg = isImage(req.file.mimetype, req.file.originalname);
      return res.status(400).json({
        error: isImg
          ? "OCR could not extract readable text from the image."
          : "Could not extract text from the file.",
      });
    }

    const reportType = req.body?.reportType || "unknown";
    const primaryResults = req.body?.primaryResults ? JSON.parse(req.body.primaryResults) : null;

    // Parse the secondary report
    const parsed = parseReport(rawText);
    const reportClass = classifyReport(rawText);

    // Analyze based on report type
    const secondaryAnalysis = analyzeBreastSecondaryReport(parsed, reportClass, reportType, primaryResults);

    res.json({
      success: true,
      reportType,
      parsed,
      reportClassification: reportClass,
      secondaryAnalysis,
    });
  } catch (err) {
    console.error("Breast secondary analysis error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  } finally {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

// ── Breast Secondary Report Analyzer ─────────────────────────────────────────
function analyzeBreastSecondaryReport(parsed, reportClass, reportType, primaryResults) {
  const bm = parsed.biomarkers || {};
  const analysis = {
    reportType,
    findings: [],
    recommendations: [],
    chemotherapyAdjustments: null,
    canAvoidChemo: false,
    riskCategory: null,
    nodalStatus: null,
    brcaResult: null,
  };

  switch (reportType) {
    case "genomic":
      // Genomic Risk Score analysis (Oncotype DX, MammaPrint)
      if (bm.oncotypeDx || bm.mammaPrint || bm.genomicScore) {
        const score = bm.oncotypeDx || bm.mammaPrint || bm.genomicScore;
        const scoreNum = parseInt(score);

        if (scoreNum <= 10) {
          analysis.riskCategory = "Low Risk";
          analysis.canAvoidChemo = true;
          analysis.findings.push(`Genomic Risk Score: ${score} (Low Risk)`);
          analysis.recommendations.push("Low recurrence risk — chemotherapy may be safely avoided. Endocrine therapy alone may be sufficient.");
          analysis.chemotherapyAdjustments = {
            action: "avoid",
            reason: "Oncotype DX/MammaPrint low risk score indicates minimal chemotherapy benefit",
            alternative: "Endocrine therapy (tamoxifen or aromatase inhibitor) ± ovarian suppression",
          };
        } else if (scoreNum <= 25) {
          analysis.riskCategory = "Intermediate Risk";
          analysis.findings.push(`Genomic Risk Score: ${score} (Intermediate Risk)`);
          analysis.recommendations.push("Intermediate risk — chemotherapy benefit is uncertain. Discuss patient preferences and comorbidities.");
          analysis.chemotherapyAdjustments = {
            action: "consider",
            reason: "Intermediate genomic risk — chemotherapy benefit is modest",
            alternative: "Consider chemotherapy + endocrine therapy vs endocrine therapy alone based on patient factors",
          };
        } else {
          analysis.riskCategory = "High Risk";
          analysis.findings.push(`Genomic Risk Score: ${score} (High Risk)`);
          analysis.recommendations.push("High recurrence risk — chemotherapy recommended in addition to endocrine therapy.");
          analysis.chemotherapyAdjustments = {
            action: "recommend",
            reason: "High genomic risk score indicates significant chemotherapy benefit",
            alternative: "Chemotherapy + endocrine therapy (standard of care for high-risk ER+/HER2- early breast cancer)",
          };
        }
      } else {
        analysis.findings.push("Genomic risk score not clearly reported");
        analysis.recommendations.push("Please provide the specific Oncotype DX Recurrence Score or MammaPrint result for interpretation.");
      }
      break;

    case "brca":
      // BRCA1/BRCA2 Germline Testing analysis
      if (bm.brca) {
        if (bm.brca === "mutated" || bm.brca === "pathogenic") {
          analysis.brcaResult = "Pathogenic mutation detected";
          analysis.findings.push("BRCA1/BRCA2 pathogenic mutation detected");
          analysis.recommendations.push("BRCA mutation confirmed — PARP inhibitor (olaparib, talazoparib) eligible for metastatic disease. Consider risk-reducing surgery.");
          analysis.chemotherapyAdjustments = {
            action: "parp_eligible",
            reason: "BRCA1/BRCA2 mutation detected — PARP inhibitor maintenance eligible",
            alternative: "Platinum-based chemotherapy + PARP inhibitor maintenance (olaparib or talazoparib)",
          };
        } else if (bm.brca === "wild-type" || bm.brca === "negative") {
          analysis.brcaResult = "No pathogenic mutation";
          analysis.findings.push("BRCA1/BRCA2: No pathogenic mutation detected (wild-type)");
          analysis.recommendations.push("No BRCA mutation — standard treatment approach. PARP inhibitors not indicated.");
          analysis.chemotherapyAdjustments = {
            action: "standard",
            reason: "No BRCA mutation — standard chemotherapy regimen",
            alternative: "Standard chemotherapy per NCCN guidelines for breast cancer subtype",
          };
        } else if (bm.brca === "variant_of_uncertain_significance" || bm.brca === "vus") {
          analysis.brcaResult = "Variant of Uncertain Significance (VUS)";
          analysis.findings.push("BRCA1/BRCA2: Variant of Uncertain Significance (VUS)");
          analysis.recommendations.push("VUS detected — manage as BRCA-negative unless family history suggests otherwise. Genetic counseling recommended.");
          analysis.chemotherapyAdjustments = {
            action: "standard",
            reason: "VUS — manage as BRCA-negative",
            alternative: "Standard chemotherapy per NCCN guidelines",
          };
        }
      } else {
        analysis.findings.push("BRCA result not clearly reported");
        analysis.recommendations.push("Please provide the specific BRCA1/BRCA2 test result (pathogenic mutation, wild-type, or VUS).");
      }
      break;

    case "nodal":
      // Sentinel Node Biopsy / Axillary Evaluation analysis
      if (parsed.lymphNodes) {
        const ln = parsed.lymphNodes;
        if (ln.lymphNodeStatus === "negative" || ln.lymphNodesPositive === 0) {
          analysis.nodalStatus = "Node-negative";
          analysis.findings.push(`Sentinel node biopsy: Node-negative (0/${ln.lymphNodesTotal || "?"} positive nodes)`);
          analysis.recommendations.push("Node-negative disease — excellent prognosis. Chemotherapy may be considered based on other risk factors (tumor size, grade, genomic score).");
          analysis.chemotherapyAdjustments = {
            action: "risk_stratify",
            reason: "Node-negative — use genomic risk score and tumor size to guide chemotherapy decision",
            alternative: "Consider genomic testing (Oncotype DX) to determine chemotherapy benefit in node-negative disease",
          };
        } else if (ln.lymphNodeStatus === "positive" || (ln.lymphNodesPositive && ln.lymphNodesPositive > 0)) {
          analysis.nodalStatus = "Node-positive";
          analysis.findings.push(`Sentinel node biopsy: Node-positive (${ln.lymphNodesPositive}/${ln.lymphNodesTotal || "?"} positive nodes)`);
          analysis.recommendations.push("Node-positive disease — chemotherapy recommended. Consider dose-dense or extended nodal irradiation based on number of positive nodes.");
          analysis.chemotherapyAdjustments = {
            action: "recommend",
            reason: "Node-positive disease — chemotherapy indicated",
            alternative: "Chemotherapy + nodal irradiation (standard for 1-3 positive nodes); consider extended field RT for ≥4 nodes",
          };
        } else {
          analysis.nodalStatus = "Indeterminate";
          analysis.findings.push("Sentinel node biopsy: Indeterminate results");
          analysis.recommendations.push("Indeterminate nodal status — complete axillary evaluation recommended. Consider completion axillary lymph node dissection if indicated.");
        }
      } else if (parsed.stage && parsed.stage.includes("N")) {
        // Try to extract from stage
        analysis.nodalStatus = "Per imaging";
        analysis.findings.push(`Nodal status per imaging: ${parsed.stage}`);
        analysis.recommendations.push("Nodal status based on imaging — sentinel node biopsy provides more accurate pathological staging.");
      } else {
        analysis.findings.push("Nodal status not clearly reported");
        analysis.recommendations.push("Please provide sentinel node biopsy results or axillary evaluation for accurate staging.");
      }
      break;

    default:
      analysis.findings.push("Unknown report type for secondary analysis");
  }

  return analysis;
}

// ── POST /api/patients ────────────────────────────────────────────────────────
// Create a new patient
app.post("/api/patients", async (req, res) => {
  try {
    const { first_name, last_name, date_of_birth, gender, height_cm, weight_kg } = req.body;

    if (!first_name || !last_name || !date_of_birth || !gender) {
      return res.status(400).json({ error: "Missing required fields: first_name, last_name, date_of_birth, gender" });
    }

    const patient = await db.createPatient({
      first_name,
      last_name,
      date_of_birth,
      gender,
      height_cm,
      weight_kg,
    });

    res.status(201).json({ success: true, patient });
  } catch (err) {
    console.error("Create patient error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── GET /api/patients ─────────────────────────────────────────────────────────
// Get all patients
app.get("/api/patients", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const patients = await db.getAllPatients(limit, offset);
    res.json({ success: true, patients });
  } catch (err) {
    console.error("Get patients error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── GET /api/patients/:id ─────────────────────────────────────────────────────
// Get patient by ID
app.get("/api/patients/:id", async (req, res) => {
  try {
    const patient = await db.getPatient(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.json({ success: true, patient });
  } catch (err) {
    console.error("Get patient error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── PUT /api/patients/:id ─────────────────────────────────────────────────────
// Update patient
app.put("/api/patients/:id", async (req, res) => {
  try {
    const patient = await db.updatePatient(req.params.id, req.body);
    if (!patient) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.json({ success: true, patient });
  } catch (err) {
    console.error("Update patient error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── DELETE /api/patients/:id ──────────────────────────────────────────────────
// Delete patient
app.delete("/api/patients/:id", async (req, res) => {
  try {
    const deleted = await db.deletePatient(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Patient not found" });
    }
    res.json({ success: true, message: "Patient deleted" });
  } catch (err) {
    console.error("Delete patient error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── POST /api/calculate-bsa ───────────────────────────────────────────────────
// Calculate Body Surface Area
app.post("/api/calculate-bsa", (req, res) => {
  try {
    const { height_cm, weight_kg, formula = "Mosteller" } = req.body;

    const validation = validateBSAInputs(height_cm, weight_kg);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors.join(", ") });
    }

    const result = calculateBSA(height_cm, weight_kg, formula);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("BSA calculation error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── POST /api/calculate-dose ──────────────────────────────────────────────────
// Calculate chemotherapy dose
app.post("/api/calculate-dose", (req, res) => {
  try {
    const { drug, bsa, standard_dose, dose_reduction_percent = 0, formula = "Mosteller", route = "IV", frequency = "Every 3 weeks" } = req.body;

    if (!drug || !bsa || !standard_dose) {
      return res.status(400).json({ error: "Missing required fields: drug, bsa, standard_dose" });
    }

    const result = calculateDose({
      drug,
      bsa,
      standardDose: standard_dose,
      doseReduction: dose_reduction_percent,
      formula,
      route,
      frequency,
    });

    const explanation = generateExplanation(result);

    res.json({
      success: true,
      dose: result,
      explanation,
    });
  } catch (err) {
    console.error("Dose calculation error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── GET /api/dashboard ────────────────────────────────────────────────────────
// Get dashboard statistics
app.get("/api/dashboard", async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── GET /api/regimens ─────────────────────────────────────────────────────────
// Get all chemotherapy regimens
app.get("/api/regimens", async (req, res) => {
  try {
    const regimens = await db.getRegimens();
    res.json({ success: true, regimens });
  } catch (err) {
    console.error("Get regimens error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── GET /api/reports/:id ──────────────────────────────────────────────────────
// Get report with extracted entities
app.get("/api/reports/:id", async (req, res) => {
  try {
    const report = await db.getReport(req.params.id);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    const entities = await db.getEntitiesByReport(req.params.id);
    res.json({ success: true, report, entities });
  } catch (err) {
    console.error("Get report error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── GET /api/patients/:id/reports ─────────────────────────────────────────────
// Get all reports for a patient
app.get("/api/patients/:id/reports", async (req, res) => {
  try {
    const reports = await db.getReportsByPatient(req.params.id);
    res.json({ success: true, reports });
  } catch (err) {
    console.error("Get patient reports error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── GET /api/patients/:id/dose-results ────────────────────────────────────────
// Get dose results for a patient
app.get("/api/patients/:id/dose-results", async (req, res) => {
  try {
    const doseResults = await db.getDoseResultsByPatient(req.params.id);
    res.json({ success: true, doseResults });
  } catch (err) {
    console.error("Get dose results error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// ── POST /api/upload-and-analyze ──────────────────────────────────────────────
// Upload report, extract data, calculate BSA and dose, save to database
app.post("/api/upload-and-analyze", upload.single("report"), async (req, res) => {
  const filePath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    // Extract text from file
    const rawText = await extractText(filePath, req.file.mimetype, req.file.originalname);
    if (!rawText || rawText.trim().length < 30) {
      const isImg = isImage(req.file.mimetype, req.file.originalname);
      return res.status(400).json({
        error: isImg
          ? "OCR could not extract readable text from the image."
          : "Could not extract text from the file.",
      });
    }

    // Run analysis
    const selectedCancerType = req.body?.cancerType || null;
    const analysisResult = runAnalysis(rawText, req.file.originalname, selectedCancerType);

    // Create or find patient
    let patient;
    if (req.body?.patient_id) {
      patient = await db.getPatient(req.body.patient_id);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
    } else {
      // Create new patient from parsed data (use defaults if not available)
      const firstName = analysisResult.parsed?.patientName?.split(" ")[0] || "Unknown";
      const lastName = analysisResult.parsed?.patientName?.split(" ").slice(1).join(" ") || "Patient";
      const age = analysisResult.parsed?.age;
      const dob = age ? new Date(new Date().setFullYear(new Date().getFullYear() - age)).toISOString().split('T')[0] : "2000-01-01";

      patient = await db.createPatient({
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob,
        gender: analysisResult.parsed?.gender || "other",
        height_cm: analysisResult.parsed?.height || null,
        weight_kg: analysisResult.parsed?.weight || null,
      });
    }

    // Create report record
    const report = await db.createReport({
      patient_id: patient.id,
      filename: req.file.originalname,
      file_path: filePath,
      report_type: "oncology",
      processing_status: "completed",
      extracted_text: rawText,
    });

    // Save extracted entities
    if (analysisResult.parsed) {
      const entities = [
        { type: "cancer_type", value: analysisResult.parsed.cancerType, confidence: 0.9 },
        { type: "stage", value: analysisResult.parsed.stage, confidence: 0.85 },
        { type: "grade", value: analysisResult.parsed.grade, confidence: 0.8 },
        { type: "age", value: analysisResult.parsed.age?.toString(), confidence: 0.95 },
        { type: "gender", value: analysisResult.parsed.gender, confidence: 0.9 },
        { type: "height", value: analysisResult.parsed.height?.toString(), confidence: 0.9 },
        { type: "weight", value: analysisResult.parsed.weight?.toString(), confidence: 0.9 },
        { type: "ecog", value: analysisResult.parsed.ecog?.toString(), confidence: 0.8 },
      ];

      for (const entity of entities) {
        if (entity.value) {
          await db.createExtractedEntity({
            report_id: report.id,
            entity_type: entity.type,
            entity_value: entity.value,
            confidence_score: entity.confidence,
            source_text: rawText.substring(0, 200),
          });
        }
      }
    }

    // Calculate BSA and dose if height and weight are available
    let doseResults = [];
    if (analysisResult.parsed?.height && analysisResult.parsed?.weight) {
      const bsaResult = calculateBSA(analysisResult.parsed.height, analysisResult.parsed.weight);

      // Get regimen from prediction
      const regimenName = analysisResult.primaryPrediction?.regimen || analysisResult.ruleRecommendations?.[0]?.regimen;
      if (regimenName) {
        const regimen = await db.getRegimenByName(regimenName);
        if (regimen) {
          const doseResult = calculateDose({
            drug: regimen.drug_name,
            bsa: bsaResult.bsa,
            standardDose: regimen.standard_dose_per_m2,
            formula: bsaResult.formula,
            route: regimen.route,
            frequency: regimen.frequency,
          });

          const savedDoseResult = await db.createDoseResult({
            report_id: report.id,
            patient_id: patient.id,
            regimen_id: regimen.id,
            bsa_value: bsaResult.bsa,
            bsa_formula: bsaResult.formula,
            standard_dose: regimen.standard_dose_per_m2,
            final_dose_mg: doseResult.final_dose_mg,
            rounded_dose_mg: doseResult.rounded_dose_mg,
            calculation_steps: doseResult.calculation_steps,
            safety_warnings: doseResult.safety_warnings,
            explanation: generateExplanation(doseResult),
            confidence_score: doseResult.confidence_score,
          });

          doseResults.push(savedDoseResult);
        }
      }
    }

    // Generate explanation
    const explanation = generateComprehensiveExplanation({
      ...analysisResult,
      doseResults,
    });

    res.json({
      success: true,
      patient,
      report,
      analysis: analysisResult,
      doseResults,
      explanation,
    });
  } catch (err) {
    console.error("Upload and analyze error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error." });
  } finally {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  try {
    // Initialize database
    await db.initDatabase();
    console.log("Database initialized");
  } catch (err) {
    console.error("Database initialization error:", err.message);
  }

  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║  OncoDoseRx  →  http://localhost:${PORT}  ║`);
  console.log(`  ║  Dataset: 120,000 patients               ║`);
  console.log(`  ║  PostgreSQL + BSA + Dose Engine          ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});
