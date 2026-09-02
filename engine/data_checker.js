/**
 * OncoDoseRx — Missing Data Checker
 * ====================================
 * For each cancer pathway, defines the MINIMUM set of reports and fields
 * required for a reliable ML prediction.
 *
 * Based on clinical guidance:
 *   "Minimum dataset: Cancer Type + Primary Site + Histology + Grade +
 *    T + N + M/Stage + CEA + MMR/MSI + KRAS/NRAS/BRAF + HER2 + ECOG PS +
 *    Age + Previous Treatment"
 *
 * Returns:
 *   missingFields   — individual data fields not yet extracted
 *   missingReports  — reports that should be obtained to fill those fields
 *   completeness    — 0–100 %
 *   canPredict      — whether enough data exists to make a prediction
 *   predictionBlock — reason string if blocked, null if ok
 *   warnings        — soft clinical warnings (non-blocking)
 */

"use strict";

// ═══════════════════════════════════════════════════════════════════════════
// CANCER PATHWAY DEFINITIONS
// Each pathway defines:
//   requiredFields    — fields that MUST be present for high-confidence prediction
//   importantFields   — fields that significantly improve accuracy
//   requiredReports   — human-readable report names needed
//   molecularNeeded   — whether molecular/genetic panel is important
// ═══════════════════════════════════════════════════════════════════════════
const PATHWAYS = {

  // ── Colorectal / Colon / Rectal ──────────────────────────────────────────
  "Colorectal Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["grade", "ras", "braf", "mmr", "msi", "cea", "tStage", "nStage"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Histopathology / Biopsy Report",         reason: "Confirms tumour type, grade, differentiation, LVI, perineural invasion" },
      { id: "imaging", icon: "🖥️",  name: "CECT Chest + Abdomen + Pelvis",           reason: "Essential for staging — liver mets, lymph nodes, lung spread" },
      { id: "cea",     icon: "🧪", name: "CEA (Carcinoembryonic Antigen)",           reason: "Baseline tumour marker; important for treatment response monitoring" },
      { id: "mmr",     icon: "🧬", name: "MMR / MSI Testing (MLH1, MSH2, MSH6, PMS2)", reason: "Critical for prognosis and immunotherapy eligibility" },
      { id: "ras",     icon: "🧬", name: "KRAS / NRAS / BRAF Molecular Panel",       reason: "Determines eligibility for anti-EGFR therapy (cetuximab/panitumumab)" },
      { id: "scope",   icon: "🩺", name: "Colonoscopy Report",                       reason: "Confirms tumour location, size, obstruction" },
      { id: "surg",    icon: "⚕️", name: "Surgical Histopathology (if surgery done)", reason: "Provides pTNM stage, node count, margin status" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "ras":  "KRAS/NRAS status is essential for Stage IV CRC treatment selection — anti-EGFR therapy is contraindicated in RAS-mutated tumours.",
      "mmr":  "MMR/MSI status affects prognosis and immunotherapy (pembrolizumab) eligibility in CRC.",
      "stage":"Without staging (CECT), it is impossible to determine if this is curative or palliative intent.",
    },
  },

  "Rectal Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["grade", "ras", "braf", "mmr", "msi", "cea", "tStage", "nStage"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Histopathology / Biopsy Report",         reason: "Confirms rectal adenocarcinoma, grade, LVI" },
      { id: "mri",     icon: "🖥️",  name: "MRI Rectum (high-resolution)",           reason: "Local staging: T-stage, mesorectal fascia, CRM involvement" },
      { id: "cect",    icon: "🖥️",  name: "CECT Chest + Abdomen",                   reason: "Distant metastasis staging" },
      { id: "mmr",     icon: "🧬", name: "MMR / MSI Testing",                      reason: "Immunotherapy eligibility; dMMR rectal cancer may avoid surgery" },
      { id: "ras",     icon: "🧬", name: "KRAS / NRAS / BRAF Panel",               reason: "Required for metastatic disease treatment planning" },
      { id: "cea",     icon: "🧪", name: "CEA",                                    reason: "Baseline marker; elevated CEA affects prognosis" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "ras":  "Molecular testing required if considering anti-EGFR therapy.",
      "stage":"MRI rectum is the gold standard for local T/N staging in rectal cancer.",
    },
  },

  // ── Breast Cancer ────────────────────────────────────────────────────────
  "Breast Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["her2", "er", "pr", "hr", "grade", "ki67", "brca"],
    // Primary reports (always needed for initial calculation)
    primaryReports: [
      { id: "histo",     icon: "🔬", name: "Core Needle Biopsy / Histopathology",       reason: "Tumour type, grade, Ki67, lymphovascular invasion" },
      { id: "receptor",  icon: "🧬", name: "Receptor Testing (ER, PR, HER2 IHC/FISH)",  reason: "Defines breast cancer subtype — directly determines chemotherapy regimen" },
      { id: "imaging",   icon: "🖥️", name: "CT Chest + Abdomen + Pelvis (or staging MRI)", reason: "Distant staging for Stage II–IV" },
    ],
    // Conditional reports (needed after primary calculation based on specific scenarios)
    conditionalReports: [
      { id: "genomic",   icon: "🧬", name: "Genomic Risk Score (Oncotype DX / MammaPrint)", reason: "Recommended for ER+/HER2- early-stage cancers to predict recurrence risk and determine if chemotherapy can be safely avoided", condition: "er_positive_and_her2_negative_and_early_stage" },
      { id: "brca",      icon: "🧬", name: "BRCA1/BRCA2 Germline Testing",                reason: "Required for young patients, strong family histories of breast/ovarian cancer, or to evaluate eligibility for PARP inhibitors", condition: "young_patient_or_strong_family_history" },
      { id: "nodal",     icon: "🖥️", name: "Sentinel Node Biopsy / Axillary Evaluation",   reason: "Performed during or prior to surgery if imaging does not clearly define node involvement", condition: "imaging_does_not_define_nodes" },
    ],
    molecularNeeded: false,
    minimumToPredict: ["cancerType", "her2"],
    noteIfMissing: {
      "her2": "HER2 status is the single most important factor — HER2+ requires trastuzumab-based regimen (AC-THP), HER2- does not.",
      "er":   "ER/PR status determines whether hormonal therapy is added to chemotherapy.",
      "stage":"Without staging scans, it is unknown whether the disease is localised or metastatic.",
    },
    // Conditions that trigger conditional reports
    conditionalTriggers: {
      genomic:   "ER+/HER2- early-stage (I–II) cancer detected — Genomic Risk Score recommended to assess chemotherapy benefit",
      brca:      "Patient age ≤50 or strong family history of breast/ovarian cancer — BRCA1/BRCA2 testing recommended",
      nodal:     "Imaging shows indeterminate nodal status — Sentinel Node Biopsy / Axillary Evaluation recommended",
    },
  },

  "Triple-Negative Breast Cancer (TNBC)": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["pdl1", "brca", "grade"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Biopsy / Histopathology",              reason: "Grade, Ki67, LVI confirmation" },
      { id: "receptor",icon: "🧬", name: "ER / PR / HER2 Confirmation",          reason: "Must confirm triple-negative status (IHC + FISH)" },
      { id: "pdl1",    icon: "🧬", name: "PD-L1 Testing (CPS score)",            reason: "Determines pembrolizumab eligibility (KEYNOTE-522)" },
      { id: "brca",    icon: "🧬", name: "BRCA1/BRCA2 Testing",                  reason: "BRCA-mutated TNBC eligible for olaparib (OlympiAD trial)" },
      { id: "imaging", icon: "🖥️",  name: "CECT Chest + Abdomen",                reason: "Staging for distant metastasis" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "pdl1": "PD-L1 CPS score determines whether pembrolizumab should be added (KEYNOTE-522 / KEYNOTE-355).",
      "brca": "BRCA mutation enables olaparib use in metastatic TNBC.",
    },
  },

  // ── NSCLC ────────────────────────────────────────────────────────────────
  "Non-Small Cell Lung Cancer (NSCLC)": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["egfr", "alk", "pdl1", "ros1", "braf", "met"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Bronchoscopy Biopsy / CT-guided Biopsy", reason: "Histological confirmation: adenocarcinoma vs squamous vs NOS" },
      { id: "imaging", icon: "🖥️",  name: "PET-CT or CECT Chest + Abdomen + Pelvis", reason: "Accurate mediastinal and distant staging" },
      { id: "mol",     icon: "🧬", name: "Molecular Panel (EGFR, ALK, ROS1, BRAF, MET, RET, KRAS G12C)", reason: "Mandatory for all non-squamous NSCLC — determines TKI eligibility" },
      { id: "pdl1",    icon: "🧬", name: "PD-L1 TPS Score",                        reason: "≥50% → pembrolizumab monotherapy; 1–49% → combination regimen" },
      { id: "mri_brain",icon:"🖥️", name: "MRI Brain",                             reason: "Brain metastasis staging, especially for Stage IV" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType", "stage"],
    noteIfMissing: {
      "egfr": "EGFR mutation is the most actionable biomarker — exon 19 del / L858R → osimertinib (FLAURA). Without EGFR status, a TKI cannot be safely recommended.",
      "pdl1": "PD-L1 TPS determines pembrolizumab eligibility. Without this, immunotherapy planning is incomplete.",
      "alk":  "ALK rearrangement → alectinib/brigatinib (highly effective). Must be tested in all non-squamous NSCLC.",
    },
  },

  "Lung Adenocarcinoma (NSCLC)": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["egfr", "alk", "pdl1", "braf", "ros1"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Biopsy / Histopathology",               reason: "Adenocarcinoma confirmation, TTF-1 staining" },
      { id: "mol",     icon: "🧬", name: "Comprehensive Molecular Panel",          reason: "EGFR, ALK, ROS1, BRAF, MET, KRAS — all mandatory in adenocarcinoma" },
      { id: "pdl1",    icon: "🧬", name: "PD-L1 TPS",                             reason: "Immunotherapy eligibility" },
      { id: "imaging", icon: "🖥️",  name: "PET-CT / CECT",                        reason: "Full staging" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType", "stage"],
    noteIfMissing: {
      "egfr": "EGFR mutation testing is mandatory in all lung adenocarcinomas per NCCN guidelines.",
    },
  },

  // ── SCLC ─────────────────────────────────────────────────────────────────
  "Small Cell Lung Cancer (SCLC)": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["pdl1"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Biopsy (bronchoscopy or CT-guided)",    reason: "SCLC confirmation — synaptophysin, chromogranin, CD56 IHC" },
      { id: "cect",    icon: "🖥️",  name: "CECT Chest + Abdomen",                reason: "Limited vs extensive stage determination" },
      { id: "mri_brain",icon:"🖥️", name: "MRI Brain",                            reason: "Brain metastasis — very common in SCLC" },
      { id: "pet",     icon: "🖥️",  name: "PET Scan (if limited stage)",          reason: "Precise limited-stage definition for radical CRT planning" },
    ],
    molecularNeeded: false,
    minimumToPredict: ["cancerType", "stage"],
    noteIfMissing: {
      "stage": "Limited vs extensive stage distinction is critical — completely different treatment approach (CRT + PCI vs systemic + atezolizumab).",
    },
  },

  // ── Pancreatic ───────────────────────────────────────────────────────────
  "Pancreatic Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["grade", "ca199", "brca"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "EUS-guided Biopsy / CT-guided Biopsy",  reason: "Confirms PDAC vs other pancreatic tumours" },
      { id: "cect",    icon: "🖥️",  name: "CECT Pancreas Protocol (multiphase)",   reason: "Resectability assessment — SMA, SMV, portal vein involvement" },
      { id: "ca199",   icon: "🧪", name: "CA 19-9 (tumour marker)",               reason: "Baseline marker; used for treatment monitoring" },
      { id: "brca",    icon: "🧬", name: "BRCA1/BRCA2 / PALB2 Germline Testing", reason: "BRCA-mutated pancreatic cancer responds to olaparib maintenance (POLO trial)" },
      { id: "msi",     icon: "🧬", name: "MSI / MMR Testing",                    reason: "dMMR pancreatic cancer eligible for pembrolizumab" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "stage": "CT pancreas protocol is the first-line investigation — determines if the tumour is resectable, borderline, or metastatic.",
      "brca":  "BRCA-mutated PDAC can receive olaparib maintenance after platinum-based chemotherapy.",
    },
  },

  // ── Ovarian ──────────────────────────────────────────────────────────────
  "Ovarian Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["brca", "grade", "ca125"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Histopathology (surgery or biopsy)",    reason: "Subtype: HGSC vs LGSC vs clear cell vs mucinous — changes treatment" },
      { id: "cect",    icon: "🖥️",  name: "CECT Chest + Abdomen + Pelvis",        reason: "Disease extent for upfront vs interval debulking decision" },
      { id: "ca125",   icon: "🧪", name: "CA-125 (tumour marker)",               reason: "Baseline; used for response monitoring and recurrence detection" },
      { id: "brca",    icon: "🧬", name: "BRCA1/BRCA2 Germline + Somatic Testing", reason: "BRCA mutation → PARP inhibitor maintenance (olaparib, niraparib)" },
      { id: "hrd",     icon: "🧬", name: "HRD Testing (Homologous Recombination Deficiency)", reason: "HRD-positive tumours respond better to PARP inhibitors even without BRCA mutation" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "brca":  "BRCA status is mandatory — determines PARP inhibitor maintenance eligibility (standard of care in 2024).",
    },
  },

  // ── Gastric ──────────────────────────────────────────────────────────────
  "Gastric Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["her2", "pdl1", "mmr", "msi"],
    requiredReports: [
      { id: "scope",   icon: "🩺", name: "OGD / Gastroscopy with Biopsy",        reason: "Confirms location, histological subtype, Lauren classification" },
      { id: "cect",    icon: "🖥️",  name: "CECT Chest + Abdomen + Pelvis",       reason: "Staging, liver mets, peritoneal spread" },
      { id: "her2",    icon: "🧬", name: "HER2 Testing (IHC / FISH)",            reason: "HER2+ gastric cancer → trastuzumab (ToGA trial); now + nivolumab" },
      { id: "pdl1",    icon: "🧬", name: "PD-L1 CPS Score",                     reason: "CPS ≥5 → nivolumab added to FOLFOX (CheckMate 649)" },
      { id: "mmr",     icon: "🧬", name: "MMR / MSI Testing",                   reason: "dMMR → pembrolizumab option" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "her2": "HER2 testing is mandatory in all advanced gastric cancer per NCCN/ESMO guidelines.",
      "pdl1": "PD-L1 CPS determines nivolumab + FOLFOX eligibility (CheckMate 649).",
    },
  },

  // ── Prostate ─────────────────────────────────────────────────────────────
  "Prostate Cancer": {
    requiredFields: ["cancerType"],
    importantFields: ["grade", "psa", "stage"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Prostate Biopsy (TRUS or MRI-guided)", reason: "Gleason score / ISUP grade group — defines risk category" },
      { id: "mri",     icon: "🖥️",  name: "Multiparametric MRI (mpMRI) Prostate", reason: "Local staging, extracapsular extension, seminal vesicle involvement" },
      { id: "psa",     icon: "🧪", name: "PSA + PSA Kinetics",                   reason: "Absolute PSA, velocity, doubling time — critical for risk stratification" },
      { id: "bone_scan",icon:"🖥️", name: "Bone Scan / PSMA PET-CT",             reason: "Bone and lymph node metastasis staging" },
      { id: "brca",    icon: "🧬", name: "Germline BRCA / HRD Testing",          reason: "BRCA2 mutation → olaparib eligibility (PROfound trial)" },
    ],
    molecularNeeded: false,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "grade": "Gleason/ISUP grade group is essential — Grade Group 1 is managed very differently from Grade Group 5.",
      "stage": "Without staging (PSMA PET-CT or bone scan), localised vs metastatic disease cannot be determined.",
    },
  },

  // ── Cervical ─────────────────────────────────────────────────────────────
  "Cervical Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["pdl1", "grade"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Cervical Biopsy / Punch Biopsy",       reason: "SCC vs adenocarcinoma — different prognosis and management" },
      { id: "mri",     icon: "🖥️",  name: "MRI Pelvis",                         reason: "Local T-staging, parametrial extension, uterine involvement" },
      { id: "cect",    icon: "🖥️",  name: "CECT Chest + Abdomen",               reason: "Lymph node and distant metastasis staging" },
      { id: "pdl1",    icon: "🧬", name: "PD-L1 CPS Score",                     reason: "PD-L1+ → pembrolizumab + carboplatin + paclitaxel ± bev (KEYNOTE-826)" },
    ],
    molecularNeeded: false,
    minimumToPredict: ["cancerType", "stage"],
    noteIfMissing: {
      "pdl1": "PD-L1 CPS determines pembrolizumab eligibility in metastatic/recurrent cervical cancer.",
      "stage":"FIGO staging requires MRI pelvis — clinical staging alone is insufficient.",
    },
  },

  // ── Bladder ──────────────────────────────────────────────────────────────
  "Bladder Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["grade", "pdl1"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "TURBT (Transurethral Resection) Specimen", reason: "T-stage, grade, LVI, variant histology, muscle invasion status" },
      { id: "cect",    icon: "🖥️",  name: "CECT Abdomen + Pelvis",              reason: "Lymph node staging, upper tract evaluation" },
      { id: "pdl1",    icon: "🧬", name: "PD-L1 Testing",                       reason: "Avelumab maintenance eligibility after platinum chemotherapy" },
    ],
    molecularNeeded: false,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "stage": "Muscle invasion (T2+) vs non-muscle invasive disease is the critical decision point.",
    },
  },

  // ── Hepatocellular ───────────────────────────────────────────────────────
  "Hepatocellular Carcinoma (HCC)": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["afp", "grade"],
    requiredReports: [
      { id: "imaging", icon: "🖥️",  name: "CT/MRI with contrast (LI-RADS criteria)", reason: "HCC can be diagnosed radiologically — biopsy not always needed" },
      { id: "afp",     icon: "🧪", name: "AFP (Alpha-Fetoprotein)",              reason: "Baseline tumour marker; very high AFP suggests HCC" },
      { id: "liver_fn",icon: "🧪", name: "Liver Function Tests + Child-Pugh Score", reason: "Determines eligibility for systemic therapy vs TACE vs ablation" },
      { id: "hbv_hcv", icon: "🧪", name: "HBV / HCV Serology",                 reason: "Aetiology affects prognosis; antiviral therapy required if HBV active" },
    ],
    molecularNeeded: false,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "stage": "BCLC staging (Barcelona Clinic Liver Cancer) requires imaging and liver function — cannot stage without both.",
    },
  },

  // ── Haematological ───────────────────────────────────────────────────────
  "Non-Hodgkin Lymphoma": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["cd20", "grade"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Excision Biopsy / Core Biopsy",       reason: "Lymphoma subtype classification — DLBCL, follicular, mantle cell, etc." },
      { id: "ihc",     icon: "🧬", name: "Immunophenotyping (IHC / Flow Cytometry)", reason: "CD20, BCL2, BCL6, MYC — defines subtype and treatment" },
      { id: "pet_ct",  icon: "🖥️",  name: "PET-CT (FDG)",                      reason: "Ann Arbor staging; baseline for response assessment" },
      { id: "bm",      icon: "🔬", name: "Bone Marrow Biopsy",                  reason: "Stage IV determination; treatment planning" },
      { id: "ldh",     icon: "🧪", name: "LDH + IPI Score",                    reason: "International Prognostic Index — determines prognosis and intensity" },
    ],
    molecularNeeded: false,
    minimumToPredict: ["cancerType", "stage"],
    noteIfMissing: {
      "cd20": "CD20 status determines whether rituximab can be added (R-CHOP vs CHOP).",
      "stage":"PET-CT staging is mandatory before starting R-CHOP.",
    },
  },

  "Hodgkin Lymphoma": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["grade"],
    requiredReports: [
      { id: "histo",   icon: "🔬", name: "Excision Biopsy",                     reason: "Classic HL (RS cells) vs nodular lymphocyte-predominant HL" },
      { id: "pet_ct",  icon: "🖥️",  name: "PET-CT (FDG)",                      reason: "Ann Arbor staging; interim PET after Cycle 2 guides treatment" },
      { id: "bm",      icon: "🔬", name: "Bone Marrow Biopsy (if PET non-avid)", reason: "Stage IV determination in non-FDG-avid disease" },
    ],
    molecularNeeded: false,
    minimumToPredict: ["cancerType", "stage"],
    noteIfMissing: {
      "stage": "Ann Arbor stage determines number of cycles (4 vs 6) and whether radiotherapy is added.",
    },
  },

  "Leukemia (AML)": {
    requiredFields: ["cancerType"],
    importantFields: ["grade", "flt3", "npm1", "idh"],
    requiredReports: [
      { id: "bm",      icon: "🔬", name: "Bone Marrow Biopsy + Aspirate",       reason: "Blast percentage, morphology, cytochemistry" },
      { id: "cytogen", icon: "🧬", name: "Cytogenetics (Karyotype)",             reason: "Favourable / intermediate / adverse — defines risk and consolidation" },
      { id: "mol",     icon: "🧬", name: "Molecular Panel (FLT3-ITD, NPM1, IDH1/2, CEBPA)", reason: "FLT3-ITD → midostaurin; IDH1 → ivosidenib; IDH2 → enasidenib" },
      { id: "cbc",     icon: "🧪", name: "CBC + Peripheral Blood Film",         reason: "Blast count, pancytopenia degree" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "flt3": "FLT3-ITD mutation determines midostaurin addition to 7+3 induction (RATIFY trial).",
    },
  },

  "Multiple Myeloma": {
    requiredFields: ["cancerType"],    importantFields: ["stage", "grade"],
    requiredReports: [
      { id: "bm",      icon: "🔬", name: "Bone Marrow Biopsy (trephine + aspirate)", reason: "Plasma cell percentage, cytogenetics" },
      { id: "spep",    icon: "🧪", name: "SPEP / UPEP + Free Light Chains",     reason: "M-protein quantification — diagnosis and response monitoring" },
      { id: "cytogen", icon: "🧬", name: "FISH Cytogenetics (del17p, t(4;14), t(14;16))", reason: "High-risk cytogenetics affect VRd intensity and ASCT timing" },
      { id: "imaging", icon: "🖥️",  name: "PET-CT or Whole Body Low-dose CT",   reason: "Bone disease, plasmacytomas" },
      { id: "ldh_b2m", icon: "🧪", name: "LDH + Beta-2 Microglobulin + Albumin (ISS staging)", reason: "ISS/R-ISS staging determines prognosis" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "stage": "ISS/R-ISS staging uses B2M + albumin + LDH + FISH — determines VRd intensity.",
    },
  },

  // ── Brain Cancer / Brain Tumor ────────────────────────────────────────────
  "Brain Cancer": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["grade", "mgmt", "idh", "whoCnsGrade", "extentResection"],
    requiredReports: [
      { id: "mri_brain", icon: "🖥️", name: "MRI Brain with Contrast",              reason: "Essential for diagnosis, grading, and surgical planning — defines tumor type, size, and edema" },
      { id: "histo",     icon: "🔬", name: "Surgical Resection / Biopsy Specimen", reason: "Histopathology confirms tumor type (GBM, LGG, oligodendroglioma, etc.) and WHO grade" },
      { id: "mgmt",      icon: "🧬", name: "MGMT Promoter Methylation Testing",    reason: "Critical for GBM — predicts temozolomide response and prognosis" },
      { id: "molecular", icon: "🧬", name: "Molecular Panel (IDH1/2, 1p/19q, TERT, ATRX)", reason: "WHO 2021 classification — IDH status, 1p/19q co-deletion, TERT promoter mutation" },
      { id: "neuro",     icon: "🧪", name: "Neurological Assessment + KPS/ECOG",   reason: "Baseline functional status — affects treatment intensity and clinical trial eligibility" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "mgmt": "MGMT promoter methylation is the most important prognostic biomarker in GBM — determines temozolomide benefit.",
      "stage": "MRI brain is essential for staging — defines resectability, eloquent cortex involvement, and need for adjuvant therapy.",
      "idh": "IDH mutation status reclassifies gliomas per WHO 2021 — IDH-mutant has better prognosis and different treatment.",
    },
  },

  "Brain Tumor": {
    requiredFields: ["cancerType", "stage"],
    importantFields: ["grade", "mgmt", "idh", "whoCnsGrade", "extentResection"],
    requiredReports: [
      { id: "mri_brain", icon: "🖥️", name: "MRI Brain with Contrast",              reason: "Essential for diagnosis, grading, and surgical planning" },
      { id: "histo",     icon: "🔬", name: "Surgical Resection / Biopsy Specimen", reason: "Histopathology confirms tumor type and WHO grade" },
      { id: "mgmt",      icon: "🧬", name: "MGMT Promoter Methylation Testing",    reason: "Critical for GBM — predicts temozolomide response" },
      { id: "molecular", icon: "🧬", name: "Molecular Panel (IDH1/2, 1p/19q, TERT, ATRX)", reason: "WHO 2021 classification markers" },
      { id: "neuro",     icon: "🧪", name: "Neurological Assessment + KPS/ECOG",   reason: "Baseline functional status" },
    ],
    molecularNeeded: true,
    minimumToPredict: ["cancerType"],
    noteIfMissing: {
      "mgmt": "MGMT promoter methylation is the most important prognostic biomarker in GBM.",
      "stage": "MRI brain is essential for staging and treatment planning.",
      "idh": "IDH mutation status reclassifies gliomas per WHO 2021.",
    },
  },
};

// Default for cancers not explicitly defined
const DEFAULT_PATHWAY = {
  requiredFields: ["cancerType", "stage"],
  importantFields: ["grade", "histology"],
  requiredReports: [
    { id: "histo",   icon: "🔬", name: "Histopathology / Biopsy Report",        reason: "Confirms cancer type, grade, histological subtype" },
    { id: "imaging", icon: "🖥️",  name: "CECT / MRI (staging)",                 reason: "Disease extent, lymph node and distant staging" },
  ],
  molecularNeeded: false,
  minimumToPredict: ["cancerType"],
  noteIfMissing: {},
};

// ── Field presence evaluator ──────────────────────────────────────────────────
function fieldPresent(parsed, field) {
  const bm = parsed.biomarkers || {};
  const map = {
    cancerType:  !!parsed.cancerType,
    stage:       !!parsed.stage,
    grade:       !!parsed.grade,
    histology:   !!parsed.histology,
    age:         parsed.age !== null && parsed.age !== undefined,
    ecog:        parsed.performanceStatus !== null && parsed.performanceStatus !== undefined,
    her2:        !!bm.her2,
    er:          !!bm.er,
    pr:          !!bm.pr,
    hr:          !!bm.hr,
    egfr:        !!bm.egfr,
    alk:         !!bm.alk,
    pdl1:        !!bm.pdl1,
    ras:         !!bm.ras,
    kras:        !!bm.kras,
    nras:        !!bm.nras,
    braf:        !!bm.braf,
    mmr:         !!bm.mmr,
    msi:         !!bm.msi,
    brca:        !!(bm.brca),          // present if extracted (even wild-type)
    msi:         !!(bm.msi),           // MSS / MSI-L / MSI-H all count as present
    cea:         !!bm.cea,
    ca125:       !!bm.ca125,
    ca199:       !!bm.ca199,
    afp:         !!bm.afp,
    psa:         !!bm.psa,
    tStage:      !!parsed.tStage,
    nStage:      !!parsed.nStage,
    mStage:      !!parsed.mStage,
    ki67:        !!bm.ki67,
    lvInvasion:  parsed.lvInvasion !== null && parsed.lvInvasion !== undefined,
    tumorSize:   parsed.tumorSize !== null && parsed.tumorSize !== undefined,
    // Molecular panel aliases
    flt3:        !!bm.flt3,
    npm1:        !!bm.npm1,
    idh:         !!bm.idh,
    // Brain tumor biomarkers
    mgmt:        !!bm.mgmt,
    codeletion1p19q: !!bm.codeletion1p19q,
    tert:        !!bm.tert,
    atrx:        !!bm.atrx,
    whoCnsGrade: !!bm.whoCnsGrade,
    extentResection: !!bm.extentResection,
  };
  return map[field] ?? false;
}

// ── Main checker ──────────────────────────────────────────────────────────────
function checkMissingData(parsed, reportClassification) {
  // Find the best matching pathway
  const cancerType = parsed.cancerType || "";
  let pathway = PATHWAYS[cancerType];

  // Fuzzy pathway match
  if (!pathway) {
    for (const [key, val] of Object.entries(PATHWAYS)) {
      if (cancerType.toLowerCase().includes(key.toLowerCase()) ||
          key.toLowerCase().includes(cancerType.toLowerCase())) {
        pathway = val;
        break;
      }
    }
  }
  if (!pathway) pathway = DEFAULT_PATHWAY;

  // ── Check required fields ──────────────────────────────────────────────
  const missingRequired  = pathway.requiredFields.filter(f => !fieldPresent(parsed, f));
  const missingImportant = pathway.importantFields.filter(f => !fieldPresent(parsed, f));

  // ── Score completeness ─────────────────────────────────────────────────
  const allFields   = [...new Set([...pathway.requiredFields, ...pathway.importantFields])];
  const presentCount = allFields.filter(f => fieldPresent(parsed, f)).length;
  const completeness = Math.round((presentCount / allFields.length) * 100);

  // ── Determine which reports are still needed ──────────────────────────
  const reportClassType = reportClassification?.primaryType || "UNKNOWN";

  // Map present report type → which pathway report IDs it satisfies
  const satisfiedReportIds = new Set();
  if (reportClassType === "HISTOPATHOLOGY" || reportClassType === "SURGICAL_PATH") {
    satisfiedReportIds.add("histo"); satisfiedReportIds.add("surg");
  }
  if (reportClassType === "IMAGING") {
    satisfiedReportIds.add("imaging"); satisfiedReportIds.add("cect");
    satisfiedReportIds.add("mri"); satisfiedReportIds.add("mri_brain");
  }
  if (reportClassType === "COLONOSCOPY") {
    satisfiedReportIds.add("scope");
  }
  if (reportClassType === "MOLECULAR") {
    satisfiedReportIds.add("mol"); satisfiedReportIds.add("mmr");
    satisfiedReportIds.add("ras"); satisfiedReportIds.add("pdl1");
    satisfiedReportIds.add("receptor"); satisfiedReportIds.add("brca");
    satisfiedReportIds.add("cytogen"); satisfiedReportIds.add("ihc");
  }
  if (reportClassType === "TUMOR_MARKER") {
    satisfiedReportIds.add("cea"); satisfiedReportIds.add("afp");
    satisfiedReportIds.add("psa"); satisfiedReportIds.add("ca199");
    satisfiedReportIds.add("ca125");
  }
  if (reportClassType === "BLOOD") {
    satisfiedReportIds.add("cbc"); satisfiedReportIds.add("ldh_b2m");
    satisfiedReportIds.add("ldh");
  }

  // Also mark reports as satisfied if field data was extracted successfully
  if (fieldPresent(parsed, "ras") || fieldPresent(parsed, "braf"))
    satisfiedReportIds.add("ras");
  if (fieldPresent(parsed, "mmr") || fieldPresent(parsed, "msi"))
    satisfiedReportIds.add("mmr");
  if (fieldPresent(parsed, "pdl1"))
    satisfiedReportIds.add("pdl1");
  if (fieldPresent(parsed, "her2")) {
    satisfiedReportIds.add("receptor"); satisfiedReportIds.add("her2");
  }
  // FIX-5: BRCA "wild-type" (no pathogenic variant) counts as test DONE
  if (fieldPresent(parsed, "brca"))
    satisfiedReportIds.add("brca");
  if (fieldPresent(parsed, "stage"))
    { satisfiedReportIds.add("imaging"); satisfiedReportIds.add("cect"); }
  if (fieldPresent(parsed, "tStage") || fieldPresent(parsed, "nStage"))
    { satisfiedReportIds.add("surg"); satisfiedReportIds.add("histo"); }

  // Handle both old (requiredReports) and new (primaryReports + conditionalReports) structures
  const allReports = pathway.requiredReports || [...(pathway.primaryReports || []), ...(pathway.conditionalReports || [])];
  const missingReports = allReports.filter(
    r => !satisfiedReportIds.has(r.id)
  );

  // Separate primary and conditional missing reports
  const primaryReports = pathway.primaryReports || pathway.requiredReports || [];
  const conditionalReports = pathway.conditionalReports || [];
  const missingPrimary = primaryReports.filter(r => !satisfiedReportIds.has(r.id));
  const missingConditional = conditionalReports.filter(r => !satisfiedReportIds.has(r.id));

  // ── Blocking conditions ────────────────────────────────────────────────
  let predictionBlock = null;

  // Block 1: Pure tumor-marker report with no cancer type
  if (reportClassification?.isTumorMarkerOnly && !parsed.cancerType) {
    predictionBlock = "TUMOR_MARKER_ONLY_NO_CANCER";
  }

  // Block 2: Marker–cancer mismatch (e.g. CA 15-3 report but cancer detected as NSCLC)
  if (reportClassification?.markerMismatch && parsed.cancerType) {
    const { expectedCancer } = reportClassification.markerMismatch;
    const detected = parsed.cancerType;
    // Only block if they're clearly different (not subtypes of same cancer)
    const sameFamily =
      detected.toLowerCase().includes(expectedCancer.toLowerCase().split(" ")[0]) ||
      expectedCancer.toLowerCase().includes(detected.toLowerCase().split(" ")[0]);
    if (!sameFamily) {
      predictionBlock = "MARKER_CANCER_MISMATCH";
    }
  }

  // Block 3: No cancer type at all
  if (!parsed.cancerType) {
    predictionBlock = predictionBlock || "NO_CANCER_TYPE";
  }

  // ── Minimum-to-predict check ───────────────────────────────────────────
  const minimumMet = pathway.minimumToPredict.every(f => fieldPresent(parsed, f));
  const canPredict = minimumMet && predictionBlock === null;

  // ── Field-specific clinical notes ─────────────────────────────────────
  const clinicalNotes = [];
  for (const field of missingImportant) {
    if (pathway.noteIfMissing?.[field]) {
      clinicalNotes.push({ field, note: pathway.noteIfMissing[field] });
    }
  }

  // ── Overall data quality tier ──────────────────────────────────────────
  let dataTier;
  if (completeness >= 75 && missingRequired.length === 0) {
    dataTier = "complete";
  } else if (completeness >= 40 || missingRequired.length <= 1) {
    dataTier = "partial";
  } else {
    dataTier = "insufficient";
  }

  return {
    pathway:         cancerType || "Unknown",
    completeness,
    dataTier,          // "complete" | "partial" | "insufficient"
    canPredict,
    predictionBlock,   // null | "TUMOR_MARKER_ONLY_NO_CANCER" | "MARKER_CANCER_MISMATCH" | "NO_CANCER_TYPE"
    missingRequired,   // field names
    missingImportant,  // field names
    missingReports,    // { id, icon, name, reason }[]
    satisfiedReports:  allReports.filter(r => satisfiedReportIds.has(r.id)),
    primaryReports:    primaryReports,
    conditionalReports: conditionalReports,
    missingPrimary:    missingPrimary,
    missingConditional: missingConditional,
    clinicalNotes,     // { field, note }[]
    molecularNeeded:   pathway.molecularNeeded,
    totalReportsNeeded: allReports.length,
    conditionalTriggers: pathway.conditionalTriggers || {},
  };
}

module.exports = { checkMissingData, PATHWAYS, DEFAULT_PATHWAY };
