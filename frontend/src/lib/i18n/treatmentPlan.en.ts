// Content used by lib/treatmentPlan.ts's generateTreatmentPlan(). This is
// static text we author ourselves (not fetched from the backend), so unlike
// the NCCN rule text and ML-generated notes (which come from server.js /
// engine/*.js and are left in English — see i18n README), this can be
// safely localized.
const treatmentPlanContent = {
  interval: "21 days",
  durationTemplate: "{weeks} weeks ({cycles} cycles × 21 days)",
  durationContinuous: "Continuous / targeted therapy (no fixed cycles)",
  generalNotes: {
    ecogPs2: "ECOG PS 2 — consider dose reduction (75-80% standard dose)",
    ageOver70: "Age >70 — consider geriatric assessment and dose adjustments",
  },
  breast: {
    supportiveCare: [
      "G-CSF (Filgrastim) support with dose-dense schedule",
      "Antiemetic prophylaxis: 5-HT3 antagonist + NK1 antagonist + Dexamethasone",
      "Cardiac monitoring (LVEF) with anthracycline-containing regimens",
      "Herceptin (Trastuzumab) cardiac monitoring if HER2+",
    ],
    monitoring: [
      "CBC before each cycle",
      "Liver function tests",
      "Cardiac echo every 3 months (if anthracycline)",
      "HER2/ER/PR reassessment if progression",
    ],
    secondaryNotes: {
      canAvoidChemo1: "Genomic Risk Score: Low risk — chemotherapy safely avoided per Oncotype DX/MammaPrint",
      canAvoidChemo2: "Endocrine therapy alone is sufficient for this patient",
      brcaPositive1: "BRCA1/BRCA2 mutation detected — PARP inhibitor (olaparib/talazoparib) eligible for metastatic disease",
      brcaPositive2: "Consider risk-reducing bilateral mastectomy and salpingo-oophorectomy",
      nodeNegative1: "Sentinel node biopsy: Node-negative — excellent prognosis",
      nodeNegative2: "Chemotherapy decision guided by genomic risk score and tumor size",
      nodePositive1: "Sentinel node biopsy: Node-positive — chemotherapy recommended",
      nodePositive2: "Consider dose-dense regimen and extended nodal irradiation",
    },
  },
  lung: {
    supportiveCare: [
      "Pneumocystis prophylaxis (if high-dose steroids)",
      "Antiemetic prophylaxis",
      "Pulmonary function monitoring",
    ],
    monitoring: [
      "CBC, CMP before each cycle",
      "CT chest every 2-3 cycles",
      "EGFR/ALK reassessment if progression",
      "PD-L1 reassessment if considering immunotherapy",
    ],
  },
  colorectal: {
    supportiveCare: [
      "Antiemetic prophylaxis",
      "Peripheral neuropathy monitoring (oxaliplatin)",
      "Diarrhea management (loperamide PRN)",
    ],
    monitoring: [
      "CBC, CMP before each cycle",
      "CEA every 2-3 cycles",
      "CT chest/abdomen/pelvis every 8-12 weeks",
      "KRAS/NRAS/BRAF reassessment if progression",
    ],
  },
  brain: {
    supportiveCare: [
      "Dexamethasone for cerebral edema",
      "Antiepileptic prophylaxis (levetiracetam)",
      "G-CSF support if concurrent RT",
      "PJP prophylaxis if on prolonged steroids",
    ],
    monitoring: [
      "MRI brain every 2-3 months during treatment",
      "Neurological assessment before each RT fraction",
      "MGMT methylation status review",
      "KPS/ECOG assessment before each cycle",
    ],
    stuppNote: "Stupp Protocol: RT with concomitant temozolomide followed by adjuvant temozolomide",
    optuneNote: "Consider tumour treating fields (Optune) for eligible patients",
  },
  lymphoma: {
    supportiveCare: [
      "Antiemetic prophylaxis",
      "Tumor lysis syndrome prophylaxis (allopurinol/hydration)",
      "HBV prophylaxis if HBsAg+ (rituximab-containing regimens)",
    ],
    monitoring: [
      "CBC, CMP before each cycle",
      "PET-CT after cycle 2 (interim response assessment)",
      "LDH monitoring",
      "CD20 levels if rituximab-based regimen",
    ],
  },
  leukemia: {
    supportiveCare: [
      "Tumor lysis syndrome prophylaxis (aggressive hydration + allopurinol)",
      "Antiemetic prophylaxis",
      "Antifungal prophylaxis (posaconazole during neutropenia)",
      "Antiviral prophylaxis (acyclovir)",
    ],
    monitoring: [
      "CBC daily during induction",
      "Bone marrow biopsy at day 14 and day 28",
      "Cytogenetics/FISH monitoring",
      "MRD (minimal residual disease) assessment post-consolidation",
    ],
  },
  ovarian: {
    supportiveCare: [
      "Antiemetic prophylaxis",
      "Peripheral neuropathy monitoring",
      "Hypersensitivity reaction monitoring (carboplatin)",
    ],
    monitoring: [
      "CBC, CMP before each cycle",
      "CA-125 every 3 cycles",
      "CT chest/abdomen/pelvis post-completion",
      "BRCA/HRD status review for maintenance therapy",
    ],
  },
  pancreatic: {
    supportiveCare: [
      "Antiemetic prophylaxis",
      "Nutritional support (pancreatic enzyme replacement)",
      "Diabetes management if new-onset",
    ],
    monitoring: [
      "CBC, CMP before each cycle",
      "CA 19-9 every 2-3 cycles",
      "CT pancreas protocol every 8-12 weeks",
      "BRCA/PALB2 status review for olaparib eligibility",
    ],
  },
  prostate: {
    supportiveCare: [
      "Androgen deprivation therapy (ADT) coordination",
      "Bone health management (zoledronic acid/denosumab)",
      "Hot flash management",
    ],
    monitoring: [
      "PSA every 3 months",
      "Bone scan if symptomatic progression",
      "PSMA PET-CT for restaging",
      "Testosterone levels (if on ADT)",
    ],
  },
} as const;

export default treatmentPlanContent;
