// Client-side treatment plan generator — ported from public/app.js
// (generateTreatmentPlan). This is a presentational heuristic layer on top
// of the ML prediction; it does not call the API. Keep in sync with
// public/app.js if that file is still in use.
import type { ParsedReport, PrimaryPrediction, SecondaryAnalysis } from "./api";

export interface TreatmentPlan {
  drugs: string[];
  interval: string;
  duration: string;
  intent: string;
  supportiveCare: string[];
  monitoring: string[];
  notes: string[];
}

export function generateTreatmentPlan(
  ml: PrimaryPrediction,
  parsed: ParsedReport,
  secondaryAnalyses: SecondaryAnalysis[] = []
): TreatmentPlan {
  const cancerType = ml.datasetCancerType || "";
  const stage = ml.datasetStage || "";
  const cycles = ml.predictedCycles || 0;
  const regimen = ml.regimen || "";

  const plan: TreatmentPlan = {
    drugs: [],
    interval: "21 days",
    duration: "",
    intent: "curative",
    supportiveCare: [],
    monitoring: [],
    notes: [],
  };

  if (regimen.includes("+")) {
    plan.drugs = regimen.split("+").map((d) => d.trim()).filter(Boolean);
  } else if (regimen) {
    plan.drugs = [regimen];
  }

  if (cancerType.includes("Breast Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : "adjuvant";
    plan.supportiveCare = [
      "G-CSF (Filgrastim) support with dose-dense schedule",
      "Antiemetic prophylaxis: 5-HT3 antagonist + NK1 antagonist + Dexamethasone",
      "Cardiac monitoring (LVEF) with anthracycline-containing regimens",
      "Herceptin (Trastuzumab) cardiac monitoring if HER2+",
    ];
    plan.monitoring = [
      "CBC before each cycle",
      "Liver function tests",
      "Cardiac echo every 3 months (if anthracycline)",
      "HER2/ER/PR reassessment if progression",
    ];

    for (const sa of secondaryAnalyses) {
      if (sa.canAvoidChemo) {
        plan.notes.push("Genomic Risk Score: Low risk — chemotherapy safely avoided per Oncotype DX/MammaPrint");
        plan.notes.push("Endocrine therapy alone is sufficient for this patient");
      }
      if (sa.brcaResult === "Pathogenic mutation detected") {
        plan.notes.push("BRCA1/BRCA2 mutation detected — PARP inhibitor (olaparib/talazoparib) eligible for metastatic disease");
        plan.notes.push("Consider risk-reducing bilateral mastectomy and salpingo-oophorectomy");
      }
      if (sa.nodalStatus === "Node-negative") {
        plan.notes.push("Sentinel node biopsy: Node-negative — excellent prognosis");
        plan.notes.push("Chemotherapy decision guided by genomic risk score and tumor size");
      } else if (sa.nodalStatus === "Node-positive") {
        plan.notes.push("Sentinel node biopsy: Node-positive — chemotherapy recommended");
        plan.notes.push("Consider dose-dense regimen and extended nodal irradiation");
      }
    }
  } else if (cancerType.includes("Lung Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : stage === "I" ? "adjuvant" : "curative";
    plan.supportiveCare = [
      "Pneumocystis prophylaxis (if high-dose steroids)",
      "Antiemetic prophylaxis",
      "Pulmonary function monitoring",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "CT chest every 2-3 cycles",
      "EGFR/ALK reassessment if progression",
      "PD-L1 reassessment if considering immunotherapy",
    ];
  } else if (cancerType.includes("Colorectal Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : "adjuvant";
    plan.supportiveCare = [
      "Antiemetic prophylaxis",
      "Peripheral neuropathy monitoring (oxaliplatin)",
      "Diarrhea management (loperamide PRN)",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "CEA every 2-3 cycles",
      "CT chest/abdomen/pelvis every 8-12 weeks",
      "KRAS/NRAS/BRAF reassessment if progression",
    ];
  } else if (
    cancerType.includes("Brain") ||
    cancerType.includes("Glioblastoma") ||
    cancerType.includes("Glioma")
  ) {
    plan.intent = "curative";
    plan.supportiveCare = [
      "Dexamethasone for cerebral edema",
      "Antiepileptic prophylaxis (levetiracetam)",
      "G-CSF support if concurrent RT",
      "PJP prophylaxis if on prolonged steroids",
    ];
    plan.monitoring = [
      "MRI brain every 2-3 months during treatment",
      "Neurological assessment before each RT fraction",
      "MGMT methylation status review",
      "KPS/ECOG assessment before each cycle",
    ];
    plan.notes.push("Stupp Protocol: RT with concomitant temozolomide followed by adjuvant temozolomide");
    if (cancerType.includes("Glioblastoma")) {
      plan.notes.push("Consider tumour treating fields (Optune) for eligible patients");
    }
  } else if (cancerType.includes("Lymphoma")) {
    plan.intent = "curative";
    plan.supportiveCare = [
      "Antiemetic prophylaxis",
      "Tumor lysis syndrome prophylaxis (allopurinol/hydration)",
      "HBV prophylaxis if HBsAg+ (rituximab-containing regimens)",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "PET-CT after cycle 2 (interim response assessment)",
      "LDH monitoring",
      "CD20 levels if rituximab-based regimen",
    ];
  } else if (cancerType.includes("Leukemia")) {
    plan.intent = "curative";
    plan.supportiveCare = [
      "Tumor lysis syndrome prophylaxis (aggressive hydration + allopurinol)",
      "Antiemetic prophylaxis",
      "Antifungal prophylaxis (posaconazole during neutropenia)",
      "Antiviral prophylaxis (acyclovir)",
    ];
    plan.monitoring = [
      "CBC daily during induction",
      "Bone marrow biopsy at day 14 and day 28",
      "Cytogenetics/FISH monitoring",
      "MRD (minimal residual disease) assessment post-consolidation",
    ];
  } else if (cancerType.includes("Ovarian")) {
    plan.intent = "curative";
    plan.supportiveCare = [
      "Antiemetic prophylaxis",
      "Peripheral neuropathy monitoring",
      "Hypersensitivity reaction monitoring (carboplatin)",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "CA-125 every 3 cycles",
      "CT chest/abdomen/pelvis post-completion",
      "BRCA/HRD status review for maintenance therapy",
    ];
  } else if (cancerType.includes("Pancreatic")) {
    plan.intent = stage === "IV" ? "palliative" : "curative";
    plan.supportiveCare = [
      "Antiemetic prophylaxis",
      "Nutritional support (pancreatic enzyme replacement)",
      "Diabetes management if new-onset",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "CA 19-9 every 2-3 cycles",
      "CT pancreas protocol every 8-12 weeks",
      "BRCA/PALB2 status review for olaparib eligibility",
    ];
  } else if (cancerType.includes("Prostate")) {
    plan.intent = stage === "IV" ? "palliative" : "curative";
    plan.supportiveCare = [
      "Androgen deprivation therapy (ADT) coordination",
      "Bone health management (zoledronic acid/denosumab)",
      "Hot flash management",
    ];
    plan.monitoring = [
      "PSA every 3 months",
      "Bone scan if symptomatic progression",
      "PSMA PET-CT for restaging",
      "Testosterone levels (if on ADT)",
    ];
  }

  if (cycles > 0) {
    plan.duration = `${cycles * 3} weeks (${cycles} cycles × 21 days)`;
  } else if (cycles === 0) {
    plan.duration = "Continuous / targeted therapy (no fixed cycles)";
  }

  const ps = parsed.performanceStatus;
  if (ps != null && ps >= 2) {
    plan.notes.push("ECOG PS 2 — consider dose reduction (75-80% standard dose)");
  }
  const age = parsed.age;
  if (age != null && age > 70) {
    plan.notes.push("Age >70 — consider geriatric assessment and dose adjustments");
  }

  return plan;
}
