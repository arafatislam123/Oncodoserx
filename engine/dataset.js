/**
 * OncoDoseRx — Chemotherapy Treatment Dataset
 * Source: NCCN Clinical Practice Guidelines, ASCO recommendations,
 *         standard oncology protocols (publicly available guidelines).
 *
 * Structure per entry:
 *  id          – unique rule ID
 *  cancer      – cancer type keywords (array, matched via OR)
 *  stages      – applicable stages (array); "*" = any stage
 *  grade       – tumor grade ("low","high","*")
 *  biomarkers  – required biomarker conditions (object or null)
 *  regimen     – chemotherapy regimen name
 *  drugs       – list of drug names
 *  cycles      – exact number of cycles
 *  interval    – cycle interval (days)
 *  duration    – total treatment duration string
 *  intent      – "curative" | "adjuvant" | "neoadjuvant" | "palliative"
 *  notes       – clinical notes
 *  reference   – guideline source
 */

const dataset = [

  // ══════════════════════════════════════════════════════════════════
  // BREAST CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "BC-001",
    cancer: ["breast cancer", "breast carcinoma", "invasive ductal", "invasive lobular"],
    stages: ["I", "II", "IIA", "IIB"],
    grade: "*",
    biomarkers: { her2: "negative", hr: "positive" },
    regimen: "TC (Docetaxel + Cyclophosphamide)",
    drugs: ["Docetaxel 75 mg/m²", "Cyclophosphamide 600 mg/m²"],
    cycles: 4,
    interval: 21,
    duration: "12 weeks (4 cycles × 21 days)",
    intent: "adjuvant",
    notes: "Preferred adjuvant regimen for HR+/HER2- early breast cancer. G-CSF support recommended.",
    reference: "NCCN Breast Cancer v4.2024"
  },
  {
    id: "BC-002",
    cancer: ["breast cancer", "breast carcinoma", "invasive ductal", "invasive lobular"],
    stages: ["II", "IIA", "IIB", "III", "IIIA", "IIIB", "IIIC"],
    grade: "*",
    biomarkers: { her2: "negative" },
    regimen: "AC-T (Doxorubicin + Cyclophosphamide → Paclitaxel)",
    drugs: [
      "Doxorubicin 60 mg/m²",
      "Cyclophosphamide 600 mg/m²",
      "→ then Paclitaxel 80 mg/m² weekly"
    ],
    cycles: 8,
    interval: 21,
    duration: "24 weeks (4 AC cycles + 12 weekly Paclitaxel doses)",
    intent: "adjuvant",
    notes: "Standard dense-dose AC × 4 followed by weekly paclitaxel × 12. G-CSF required with dose-dense schedule.",
    reference: "NCCN Breast Cancer v4.2024"
  },
  {
    id: "BC-003",
    cancer: ["breast cancer", "breast carcinoma", "her2", "her-2"],
    stages: ["II", "IIA", "IIB", "III", "IIIA", "IIIB", "IIIC"],
    grade: "*",
    biomarkers: { her2: "positive" },
    regimen: "AC-THP (Doxorubicin + Cyclophosphamide → Paclitaxel + Trastuzumab + Pertuzumab)",
    drugs: [
      "Doxorubicin 60 mg/m²",
      "Cyclophosphamide 600 mg/m²",
      "→ Paclitaxel 80 mg/m² weekly",
      "Trastuzumab 8 mg/kg loading → 6 mg/kg q3w",
      "Pertuzumab 840 mg loading → 420 mg q3w"
    ],
    cycles: 10,
    interval: 21,
    duration: "~34 weeks neoadjuvant + 1 year total Trastuzumab",
    intent: "neoadjuvant",
    notes: "Preferred neoadjuvant for HER2+ breast cancer ≥ T2 or node-positive. Continue trastuzumab to complete 1 year.",
    reference: "NCCN Breast Cancer v4.2024"
  },
  {
    id: "BC-004",
    cancer: ["breast cancer", "breast carcinoma", "triple negative", "tnbc"],
    stages: ["II", "IIA", "IIB", "III", "IIIA", "IIIB", "IIIC"],
    grade: "*",
    biomarkers: { her2: "negative", hr: "negative", er: "negative", pr: "negative" },
    regimen: "Pembrolizumab + Paclitaxel/Carboplatin → Pembrolizumab + Cyclophosphamide/Doxorubicin",
    drugs: [
      "Pembrolizumab 200 mg q3w",
      "Paclitaxel 80 mg/m² weekly",
      "Carboplatin AUC 1.5 weekly",
      "→ Cyclophosphamide 600 mg/m²",
      "→ Doxorubicin 60 mg/m²"
    ],
    cycles: 8,
    interval: 21,
    duration: "~24 weeks neoadjuvant",
    intent: "neoadjuvant",
    notes: "KEYNOTE-522 regimen for TNBC. Pembrolizumab continues adjuvant × 9 cycles post-surgery.",
    reference: "NCCN Breast Cancer v4.2024 / KEYNOTE-522"
  },
  {
    id: "BC-005",
    cancer: ["breast cancer", "metastatic breast", "breast carcinoma"],
    stages: ["IV"],
    grade: "*",
    biomarkers: { her2: "positive" },
    regimen: "THP (Docetaxel + Trastuzumab + Pertuzumab)",
    drugs: [
      "Docetaxel 75 mg/m²",
      "Trastuzumab 8 mg/kg loading → 6 mg/kg q3w",
      "Pertuzumab 840 mg loading → 420 mg q3w"
    ],
    cycles: 6,
    interval: 21,
    duration: "18 weeks initial, then maintenance Trastuzumab + Pertuzumab until progression",
    intent: "palliative",
    notes: "CLEOPATRA regimen for first-line metastatic HER2+ breast cancer. Continue HP maintenance after 6 cycles.",
    reference: "NCCN Breast Cancer v4.2024 / CLEOPATRA trial"
  },

  // ══════════════════════════════════════════════════════════════════
  // COLORECTAL CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "CRC-001",
    cancer: ["colorectal cancer", "colon cancer", "rectal cancer", "colorectal carcinoma", "colon carcinoma", "rectal carcinoma", "adenocarcinoma of colon", "adenocarcinoma of rectum"],
    stages: ["III", "IIIA", "IIIB", "IIIC"],
    grade: "*",
    biomarkers: null,
    regimen: "FOLFOX (Folinic Acid + Fluorouracil + Oxaliplatin)",
    drugs: [
      "Oxaliplatin 85 mg/m² Day 1",
      "Leucovorin 400 mg/m² Day 1",
      "5-Fluorouracil 400 mg/m² IV bolus Day 1",
      "5-Fluorouracil 2400 mg/m² continuous infusion 46 h"
    ],
    cycles: 12,
    interval: 14,
    duration: "24 weeks (12 cycles × 14 days)",
    intent: "adjuvant",
    notes: "Standard adjuvant therapy for Stage III colon cancer. MOSAIC trial established benefit.",
    reference: "NCCN Colon Cancer v2.2024 / MOSAIC trial"
  },
  {
    id: "CRC-002",
    cancer: ["colorectal cancer", "colon cancer", "rectal cancer", "colorectal carcinoma"],
    stages: ["IV"],
    grade: "*",
    biomarkers: { ras: "wild-type", braf: "wild-type" },
    regimen: "FOLFOX + Cetuximab",
    drugs: [
      "Oxaliplatin 85 mg/m² Day 1",
      "Leucovorin 400 mg/m² Day 1",
      "5-Fluorouracil 400 mg/m² bolus + 2400 mg/m² infusion",
      "Cetuximab 400 mg/m² loading → 250 mg/m² weekly"
    ],
    cycles: 12,
    interval: 14,
    duration: "Until progression or unacceptable toxicity (~6 months initial)",
    intent: "palliative",
    notes: "RAS/BRAF wild-type metastatic CRC. Left-sided primary preferred for anti-EGFR therapy.",
    reference: "NCCN Colon Cancer v2.2024"
  },
  {
    id: "CRC-003",
    cancer: ["colorectal cancer", "colon cancer", "rectal cancer", "colorectal carcinoma"],
    stages: ["IV"],
    grade: "*",
    biomarkers: { ras: "mutated" },
    regimen: "FOLFIRI + Bevacizumab",
    drugs: [
      "Irinotecan 180 mg/m² Day 1",
      "Leucovorin 400 mg/m² Day 1",
      "5-Fluorouracil 400 mg/m² bolus + 2400 mg/m² infusion",
      "Bevacizumab 5 mg/kg Day 1"
    ],
    cycles: 12,
    interval: 14,
    duration: "Until progression (~6 months initial evaluation)",
    intent: "palliative",
    notes: "RAS-mutated metastatic CRC. FIRE-3 / CALGB 80405 data supports bevacizumab in RAS mutant.",
    reference: "NCCN Colon Cancer v2.2024"
  },
  {
    id: "CRC-004",
    cancer: ["colorectal cancer", "colon cancer", "rectal cancer"],
    stages: ["II", "IIA", "IIB", "IIC"],
    grade: "high",
    biomarkers: null,
    regimen: "CAPOX (Capecitabine + Oxaliplatin)",
    drugs: [
      "Oxaliplatin 130 mg/m² Day 1",
      "Capecitabine 1000 mg/m² twice daily Days 1–14"
    ],
    cycles: 8,
    interval: 21,
    duration: "24 weeks (8 cycles × 21 days)",
    intent: "adjuvant",
    notes: "Consider for high-risk Stage II (T4, perforation, <12 nodes, poor differentiation). MSS tumors.",
    reference: "NCCN Colon Cancer v2.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // LUNG CANCER — NSCLC
  // ══════════════════════════════════════════════════════════════════
  {
    id: "NSCLC-001",
    cancer: ["non-small cell lung cancer", "nsclc", "lung adenocarcinoma", "squamous cell lung", "lung carcinoma", "non small cell"],
    stages: ["IIIA", "IIIB", "IIIC"],
    grade: "*",
    biomarkers: { egfr: "wild-type", alk: "negative" },
    regimen: "Carboplatin + Paclitaxel + Concurrent Radiation",
    drugs: [
      "Carboplatin AUC 2 weekly",
      "Paclitaxel 45 mg/m² weekly",
      "→ Consolidation: Durvalumab 10 mg/kg q2w × 12 months"
    ],
    cycles: 6,
    interval: 7,
    duration: "6 weeks concurrent chemoRT + 12 months durvalumab maintenance",
    intent: "curative",
    notes: "PACIFIC regimen for unresectable Stage III NSCLC. Durvalumab maintenance after CRT (PACIFIC trial).",
    reference: "NCCN NSCLC v4.2024 / PACIFIC trial"
  },
  {
    id: "NSCLC-002",
    cancer: ["non-small cell lung cancer", "nsclc", "lung adenocarcinoma", "lung carcinoma", "non small cell"],
    stages: ["IV"],
    grade: "*",
    biomarkers: { pdl1: ">=50%", egfr: "wild-type", alk: "negative" },
    regimen: "Pembrolizumab Monotherapy",
    drugs: ["Pembrolizumab 200 mg q3w"],
    cycles: 35,
    interval: 21,
    duration: "Up to 2 years (35 cycles)",
    intent: "palliative",
    notes: "KEYNOTE-024: first-line for PD-L1 ≥ 50%, no EGFR/ALK alterations. Continue until progression or 2 years.",
    reference: "NCCN NSCLC v4.2024 / KEYNOTE-024"
  },
  {
    id: "NSCLC-003",
    cancer: ["non-small cell lung cancer", "nsclc", "lung adenocarcinoma", "lung carcinoma", "non small cell"],
    stages: ["IV"],
    grade: "*",
    biomarkers: { egfr: "wild-type", alk: "negative" },
    regimen: "Carboplatin + Paclitaxel + Pembrolizumab + Bevacizumab",
    drugs: [
      "Carboplatin AUC 6 q3w",
      "Paclitaxel 200 mg/m² q3w",
      "Pembrolizumab 200 mg q3w",
      "Bevacizumab 15 mg/kg q3w"
    ],
    cycles: 4,
    interval: 21,
    duration: "4 induction cycles → maintenance pembrolizumab + bevacizumab until progression",
    intent: "palliative",
    notes: "KEYNOTE-189 regimen for non-squamous NSCLC Stage IV. Bevacizumab only for non-squamous.",
    reference: "NCCN NSCLC v4.2024 / KEYNOTE-189"
  },
  {
    id: "NSCLC-004",
    cancer: ["non-small cell lung cancer", "nsclc", "lung adenocarcinoma", "egfr mutation", "non small cell"],
    stages: ["IV"],
    grade: "*",
    biomarkers: { egfr: "mutated" },
    regimen: "Osimertinib (EGFR TKI — Targeted Therapy)",
    drugs: ["Osimertinib 80 mg orally once daily"],
    cycles: 0,
    interval: 0,
    duration: "Continuous until progression or intolerable toxicity",
    intent: "palliative",
    notes: "FLAURA trial: first-line for EGFR-mutant (exon 19 del or L858R) NSCLC. Note: Targeted therapy — not traditional cytotoxic chemotherapy cycles.",
    reference: "NCCN NSCLC v4.2024 / FLAURA trial"
  },

  // ══════════════════════════════════════════════════════════════════
  // LUNG CANCER — SCLC
  // ══════════════════════════════════════════════════════════════════
  {
    id: "SCLC-001",
    cancer: ["small cell lung cancer", "sclc", "small-cell lung", "small cell carcinoma of lung"],
    stages: ["limited", "I", "II", "III", "IIIA", "IIIB"],
    grade: "*",
    biomarkers: null,
    regimen: "EP (Etoposide + Cisplatin) + Concurrent Thoracic RT",
    drugs: [
      "Etoposide 100 mg/m² Days 1–3",
      "Cisplatin 75 mg/m² Day 1"
    ],
    cycles: 4,
    interval: 21,
    duration: "12 weeks (4 cycles × 21 days) + concurrent RT",
    intent: "curative",
    notes: "Standard for limited-stage SCLC. Concurrent thoracic radiation + prophylactic cranial irradiation (PCI) recommended after response.",
    reference: "NCCN SCLC v2.2024"
  },
  {
    id: "SCLC-002",
    cancer: ["small cell lung cancer", "sclc", "small-cell lung", "small cell carcinoma of lung"],
    stages: ["extensive", "IV"],
    grade: "*",
    biomarkers: null,
    regimen: "Atezolizumab + Carboplatin + Etoposide",
    drugs: [
      "Atezolizumab 1200 mg Day 1",
      "Carboplatin AUC 5 Day 1",
      "Etoposide 100 mg/m² Days 1–3"
    ],
    cycles: 4,
    interval: 21,
    duration: "4 induction cycles → Atezolizumab maintenance until progression",
    intent: "palliative",
    notes: "IMpower133 trial. Atezolizumab maintenance continues after 4 induction cycles.",
    reference: "NCCN SCLC v2.2024 / IMpower133"
  },

  // ══════════════════════════════════════════════════════════════════
  // LYMPHOMA — DLBCL
  // ══════════════════════════════════════════════════════════════════
  {
    id: "DLBCL-001",
    cancer: ["diffuse large b-cell lymphoma", "dlbcl", "large b cell lymphoma", "b-cell lymphoma", "non-hodgkin lymphoma", "nhl"],
    stages: ["I", "II"],
    grade: "*",
    biomarkers: { cd20: "positive" },
    regimen: "R-CHOP",
    drugs: [
      "Rituximab 375 mg/m² Day 1",
      "Cyclophosphamide 750 mg/m² Day 1",
      "Doxorubicin 50 mg/m² Day 1",
      "Vincristine 1.4 mg/m² (max 2 mg) Day 1",
      "Prednisone 100 mg Days 1–5"
    ],
    cycles: 6,
    interval: 21,
    duration: "18 weeks (6 cycles × 21 days)",
    intent: "curative",
    notes: "Standard first-line for DLBCL. Add involved-site RT for limited-stage bulky disease.",
    reference: "NCCN B-Cell Lymphomas v5.2024"
  },
  {
    id: "DLBCL-002",
    cancer: ["diffuse large b-cell lymphoma", "dlbcl", "large b cell lymphoma", "b-cell lymphoma", "non-hodgkin lymphoma", "nhl"],
    stages: ["III", "IV"],
    grade: "*",
    biomarkers: { cd20: "positive" },
    regimen: "R-CHOP",
    drugs: [
      "Rituximab 375 mg/m² Day 1",
      "Cyclophosphamide 750 mg/m² Day 1",
      "Doxorubicin 50 mg/m² Day 1",
      "Vincristine 1.4 mg/m² (max 2 mg) Day 1",
      "Prednisone 100 mg Days 1–5"
    ],
    cycles: 8,
    interval: 21,
    duration: "24 weeks (8 cycles × 21 days)",
    intent: "curative",
    notes: "6–8 cycles based on interim PET response. PET-guided approach preferred.",
    reference: "NCCN B-Cell Lymphomas v5.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // LYMPHOMA — HODGKIN
  // ══════════════════════════════════════════════════════════════════
  {
    id: "HL-001",
    cancer: ["hodgkin lymphoma", "hodgkin's lymphoma", "hodgkin disease", "classical hodgkin"],
    stages: ["I", "II", "IIA", "IIB"],
    grade: "*",
    biomarkers: null,
    regimen: "ABVD",
    drugs: [
      "Doxorubicin (Adriamycin) 25 mg/m² Days 1 & 15",
      "Bleomycin 10 units/m² Days 1 & 15",
      "Vinblastine 6 mg/m² Days 1 & 15",
      "Dacarbazine 375 mg/m² Days 1 & 15"
    ],
    cycles: 4,
    interval: 28,
    duration: "16 weeks (4 cycles × 28 days) ± involved-site RT",
    intent: "curative",
    notes: "PET-guided response assessment after Cycle 2. Favorable early-stage may complete 2 cycles + RT.",
    reference: "NCCN Hodgkin Lymphoma v2.2024"
  },
  {
    id: "HL-002",
    cancer: ["hodgkin lymphoma", "hodgkin's lymphoma", "hodgkin disease", "classical hodgkin"],
    stages: ["III", "IV"],
    grade: "*",
    biomarkers: null,
    regimen: "BV-AVD (Brentuximab Vedotin + Doxorubicin + Vinblastine + Dacarbazine)",
    drugs: [
      "Brentuximab Vedotin 1.2 mg/kg Days 1 & 15",
      "Doxorubicin 25 mg/m² Days 1 & 15",
      "Vinblastine 6 mg/m² Days 1 & 15",
      "Dacarbazine 375 mg/m² Days 1 & 15"
    ],
    cycles: 6,
    interval: 28,
    duration: "24 weeks (6 cycles × 28 days)",
    intent: "curative",
    notes: "ECHELON-1 trial: BV-AVD superior to ABVD for advanced-stage HL. G-CSF primary prophylaxis required.",
    reference: "NCCN Hodgkin Lymphoma v2.2024 / ECHELON-1"
  },

  // ══════════════════════════════════════════════════════════════════
  // GASTRIC / GASTROESOPHAGEAL CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "GC-001",
    cancer: ["gastric cancer", "stomach cancer", "gastric adenocarcinoma", "gastroesophageal junction", "gej cancer", "esophagogastric"],
    stages: ["II", "III", "IIIA", "IIIB", "IIIC"],
    grade: "*",
    biomarkers: null,
    regimen: "FLOT (Fluorouracil + Leucovorin + Oxaliplatin + Docetaxel)",
    drugs: [
      "Docetaxel 50 mg/m² Day 1",
      "Oxaliplatin 85 mg/m² Day 1",
      "Leucovorin 200 mg/m² Day 1",
      "5-Fluorouracil 2600 mg/m² 24-h infusion Day 1"
    ],
    cycles: 8,
    interval: 14,
    duration: "16 weeks (4 cycles pre-op + 4 cycles post-op)",
    intent: "neoadjuvant",
    notes: "FLOT4-AIO trial: 4 cycles pre-operative + 4 cycles post-operative. Superior to ECF/ECX.",
    reference: "NCCN Gastric Cancer v2.2024 / FLOT4-AIO trial"
  },
  {
    id: "GC-002",
    cancer: ["gastric cancer", "stomach cancer", "gastric adenocarcinoma", "gastroesophageal", "gej"],
    stages: ["IV"],
    grade: "*",
    biomarkers: { her2: "positive" },
    regimen: "FOLFOX + Trastuzumab + Nivolumab",
    drugs: [
      "Oxaliplatin 85 mg/m² Day 1",
      "Leucovorin 400 mg/m² Day 1",
      "5-Fluorouracil 2400 mg/m² Day 1",
      "Trastuzumab 8 mg/kg loading → 6 mg/kg q3w",
      "Nivolumab 360 mg flat dose q3w"
    ],
    cycles: 8,
    interval: 14,
    duration: "Until progression or unacceptable toxicity",
    intent: "palliative",
    notes: "CheckMate 811 / ToGA extension. HER2+ gastric/GEJ Stage IV first-line.",
    reference: "NCCN Gastric Cancer v2.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // OVARIAN CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "OV-001",
    cancer: ["ovarian cancer", "ovarian carcinoma", "epithelial ovarian", "fallopian tube cancer", "peritoneal cancer"],
    stages: ["III", "IIIA", "IIIB", "IIIC", "IV"],
    grade: "*",
    biomarkers: null,
    regimen: "Carboplatin + Paclitaxel ± Bevacizumab",
    drugs: [
      "Carboplatin AUC 5–6 Day 1",
      "Paclitaxel 175 mg/m² Day 1",
      "±Bevacizumab 15 mg/kg Day 1 (from Cycle 2)"
    ],
    cycles: 6,
    interval: 21,
    duration: "18 weeks (6 cycles × 21 days) + bevacizumab maintenance × 22 cycles",
    intent: "adjuvant",
    notes: "Standard first-line ovarian cancer. BRCA testing mandatory; PARP inhibitor maintenance for BRCA-mutated. GOG-0218 / ICON7 data.",
    reference: "NCCN Ovarian Cancer v3.2024"
  },
  {
    id: "OV-002",
    cancer: ["ovarian cancer", "ovarian carcinoma", "epithelial ovarian"],
    stages: ["I", "IA", "IB", "IC"],
    grade: "high",
    biomarkers: null,
    regimen: "Carboplatin + Paclitaxel",
    drugs: [
      "Carboplatin AUC 5–6 Day 1",
      "Paclitaxel 175 mg/m² Day 1"
    ],
    cycles: 6,
    interval: 21,
    duration: "18 weeks (6 cycles × 21 days)",
    intent: "adjuvant",
    notes: "High-grade Stage I ovarian cancer benefits from adjuvant chemotherapy per ICON1/ACTION trials.",
    reference: "NCCN Ovarian Cancer v3.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // CERVICAL CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "CX-001",
    cancer: ["cervical cancer", "cervical carcinoma", "squamous cell carcinoma of cervix", "adenocarcinoma of cervix"],
    stages: ["IB2", "II", "IIA", "IIB", "III", "IIIA", "IIIB", "IVA"],
    grade: "*",
    biomarkers: null,
    regimen: "Cisplatin + Concurrent Pelvic RT",
    drugs: ["Cisplatin 40 mg/m² weekly × 5–6 cycles"],
    cycles: 6,
    interval: 7,
    duration: "5–6 weeks (concurrent with radiotherapy)",
    intent: "curative",
    notes: "Weekly cisplatin concurrent with external beam RT + brachytherapy. Standard of care for locally advanced cervical cancer.",
    reference: "NCCN Cervical Cancer v1.2024"
  },
  {
    id: "CX-002",
    cancer: ["cervical cancer", "cervical carcinoma", "metastatic cervical"],
    stages: ["IVB", "IV"],
    grade: "*",
    biomarkers: { pdl1: "positive" },
    regimen: "Pembrolizumab + Carboplatin + Paclitaxel ± Bevacizumab",
    drugs: [
      "Pembrolizumab 200 mg q3w",
      "Carboplatin AUC 5 Day 1",
      "Paclitaxel 175 mg/m² Day 1",
      "±Bevacizumab 15 mg/kg Day 1"
    ],
    cycles: 6,
    interval: 21,
    duration: "6 cycles then Pembrolizumab maintenance until progression or 2 years",
    intent: "palliative",
    notes: "KEYNOTE-826: pembrolizumab added to chemo ± bevacizumab for PD-L1+ recurrent/metastatic cervical cancer.",
    reference: "NCCN Cervical Cancer v1.2024 / KEYNOTE-826"
  },

  // ══════════════════════════════════════════════════════════════════
  // PROSTATE CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "PC-001",
    cancer: ["prostate cancer", "prostate adenocarcinoma", "prostate carcinoma"],
    stages: ["IV", "metastatic"],
    grade: "*",
    biomarkers: null,
    regimen: "Docetaxel + Prednisone",
    drugs: [
      "Docetaxel 75 mg/m² Day 1",
      "Prednisone 5 mg twice daily continuously"
    ],
    cycles: 10,
    interval: 21,
    duration: "30 weeks (10 cycles × 21 days)",
    intent: "palliative",
    notes: "TAX327 trial: standard for metastatic castration-resistant prostate cancer (mCRPC). Concurrent ADT.",
    reference: "NCCN Prostate Cancer v1.2024 / TAX327"
  },
  {
    id: "PC-002",
    cancer: ["prostate cancer", "prostate adenocarcinoma", "high-risk prostate"],
    stages: ["IV", "metastatic"],
    grade: "*",
    biomarkers: null,
    regimen: "Cabazitaxel + Prednisone",
    drugs: [
      "Cabazitaxel 25 mg/m² Day 1",
      "Prednisone 10 mg daily continuously"
    ],
    cycles: 10,
    interval: 21,
    duration: "30 weeks (10 cycles × 21 days)",
    intent: "palliative",
    notes: "Second-line after docetaxel failure in mCRPC. TROPIC trial. G-CSF prophylaxis recommended.",
    reference: "NCCN Prostate Cancer v1.2024 / TROPIC trial"
  },

  // ══════════════════════════════════════════════════════════════════
  // PANCREATIC CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "PAN-001",
    cancer: ["pancreatic cancer", "pancreatic adenocarcinoma", "pancreatic ductal adenocarcinoma", "pdac", "exocrine pancreatic"],
    stages: ["IV", "metastatic"],
    grade: "*",
    biomarkers: null,
    regimen: "FOLFIRINOX",
    drugs: [
      "Oxaliplatin 85 mg/m² Day 1",
      "Irinotecan 180 mg/m² Day 1",
      "Leucovorin 400 mg/m² Day 1",
      "5-Fluorouracil 400 mg/m² bolus + 2400 mg/m² 46-h infusion"
    ],
    cycles: 12,
    interval: 14,
    duration: "24 weeks (12 cycles × 14 days)",
    intent: "palliative",
    notes: "ACCORD11: superior to gemcitabine in good performance status (ECOG 0–1) metastatic pancreatic cancer.",
    reference: "NCCN Pancreatic Adenocarcinoma v2.2024 / ACCORD11"
  },
  {
    id: "PAN-002",
    cancer: ["pancreatic cancer", "pancreatic adenocarcinoma", "pancreatic ductal adenocarcinoma", "pdac"],
    stages: ["IV", "metastatic"],
    grade: "*",
    biomarkers: null,
    regimen: "Gemcitabine + nab-Paclitaxel",
    drugs: [
      "nab-Paclitaxel 125 mg/m² Days 1, 8, 15",
      "Gemcitabine 1000 mg/m² Days 1, 8, 15"
    ],
    cycles: 6,
    interval: 28,
    duration: "24 weeks (6 cycles × 28 days)",
    intent: "palliative",
    notes: "MPACT trial: alternative to FOLFIRINOX for ECOG PS 0–2 metastatic PDAC. Better tolerability profile.",
    reference: "NCCN Pancreatic Adenocarcinoma v2.2024 / MPACT trial"
  },

  // ══════════════════════════════════════════════════════════════════
  // BLADDER CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "BL-001",
    cancer: ["bladder cancer", "urothelial carcinoma", "transitional cell carcinoma", "bladder urothelial"],
    stages: ["II", "III", "IIIA", "IIIB"],
    grade: "*",
    biomarkers: null,
    regimen: "Gemcitabine + Cisplatin (Neoadjuvant)",
    drugs: [
      "Gemcitabine 1000 mg/m² Days 1 & 8",
      "Cisplatin 70 mg/m² Day 1"
    ],
    cycles: 4,
    interval: 21,
    duration: "12 weeks (4 cycles × 21 days) pre-cystectomy",
    intent: "neoadjuvant",
    notes: "SWOG S8710: neoadjuvant GC × 4 cycles improves survival in muscle-invasive bladder cancer before radical cystectomy.",
    reference: "NCCN Bladder Cancer v3.2024"
  },
  {
    id: "BL-002",
    cancer: ["bladder cancer", "urothelial carcinoma", "metastatic bladder", "transitional cell"],
    stages: ["IV"],
    grade: "*",
    biomarkers: null,
    regimen: "Gemcitabine + Cisplatin",
    drugs: [
      "Gemcitabine 1000 mg/m² Days 1 & 8",
      "Cisplatin 70 mg/m² Day 1"
    ],
    cycles: 6,
    interval: 21,
    duration: "18 weeks (6 cycles × 21 days)",
    intent: "palliative",
    notes: "Standard first-line for cisplatin-eligible metastatic urothelial carcinoma. Avelumab maintenance after stable/response.",
    reference: "NCCN Bladder Cancer v3.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // TESTICULAR CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "TC-001",
    cancer: ["testicular cancer", "germ cell tumor", "seminoma", "non-seminoma", "testicular germ cell"],
    stages: ["IIA", "IIB", "IIC", "III"],
    grade: "*",
    biomarkers: null,
    regimen: "BEP (Bleomycin + Etoposide + Cisplatin)",
    drugs: [
      "Bleomycin 30 units Days 1, 8, 15",
      "Etoposide 100 mg/m² Days 1–5",
      "Cisplatin 20 mg/m² Days 1–5"
    ],
    cycles: 3,
    interval: 21,
    duration: "9 weeks (3 cycles × 21 days)",
    intent: "curative",
    notes: "Good-risk germ cell tumor: 3 × BEP. Intermediate/poor risk: 4 × BEP. Cure rates >90% for good risk.",
    reference: "NCCN Testicular Cancer v1.2024"
  },
  {
    id: "TC-002",
    cancer: ["testicular cancer", "germ cell tumor", "seminoma", "non-seminoma", "poor risk germ cell"],
    stages: ["III"],
    grade: "*",
    biomarkers: { risk: "poor" },
    regimen: "BEP × 4 (Poor-Risk Germ Cell)",
    drugs: [
      "Bleomycin 30 units Days 1, 8, 15",
      "Etoposide 100 mg/m² Days 1–5",
      "Cisplatin 20 mg/m² Days 1–5"
    ],
    cycles: 4,
    interval: 21,
    duration: "12 weeks (4 cycles × 21 days)",
    intent: "curative",
    notes: "Poor-risk non-seminoma (IGCCCG criteria): 4 × BEP. Consider VIP if bleomycin contraindicated.",
    reference: "NCCN Testicular Cancer v1.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // HEAD & NECK CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "HN-001",
    cancer: ["head and neck cancer", "head neck squamous", "oropharyngeal cancer", "laryngeal cancer", "hypopharyngeal cancer", "oral cavity cancer", "squamous cell carcinoma head"],
    stages: ["III", "IVA", "IVB"],
    grade: "*",
    biomarkers: null,
    regimen: "Cisplatin + Concurrent RT (High-Dose)",
    drugs: [
      "Cisplatin 100 mg/m² Days 1, 22, 43 (every 3 weeks)"
    ],
    cycles: 3,
    interval: 21,
    duration: "7 weeks concurrent with radiotherapy (3 high-dose cisplatin cycles)",
    intent: "curative",
    notes: "High-dose cisplatin q3w concurrent with definitive RT. Alternative: weekly cisplatin 40 mg/m² × 7. Carboplatin if cisplatin-ineligible.",
    reference: "NCCN Head and Neck Cancers v3.2024"
  },
  {
    id: "HN-002",
    cancer: ["head and neck cancer", "nasopharyngeal cancer", "npc", "nasopharyngeal carcinoma"],
    stages: ["II", "III", "IVA", "IVB"],
    grade: "*",
    biomarkers: null,
    regimen: "Cisplatin + RT → Adjuvant Cisplatin + 5-FU",
    drugs: [
      "Cisplatin 100 mg/m² q3w (concurrent)",
      "→ Cisplatin 80 mg/m² Day 1 (adjuvant)",
      "→ 5-Fluorouracil 1000 mg/m² Days 1–4 (adjuvant)"
    ],
    cycles: 6,
    interval: 21,
    duration: "3 concurrent cycles + 3 adjuvant cycles",
    intent: "curative",
    notes: "MAC-NPC meta-analysis supports concurrent + adjuvant approach for locoregionally advanced NPC.",
    reference: "NCCN Head and Neck Cancers v3.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // LEUKEMIA — AML
  // ══════════════════════════════════════════════════════════════════
  {
    id: "AML-001",
    cancer: ["acute myeloid leukemia", "aml", "acute myelogenous leukemia", "acute myeloid"],
    stages: ["*"],
    grade: "*",
    biomarkers: null,
    regimen: "7+3 Induction (Cytarabine + Daunorubicin)",
    drugs: [
      "Cytarabine 100–200 mg/m² continuous infusion Days 1–7",
      "Daunorubicin 60–90 mg/m² Days 1–3"
    ],
    cycles: 2,
    interval: 28,
    duration: "Induction: 1–2 cycles; Consolidation: 3–4 cycles of high-dose cytarabine",
    intent: "curative",
    notes: "Induction: 7+3 × 1–2 cycles. CR achieved in ~60–80%. Consolidation: HiDAC × 3–4 cycles. Allogeneic SCT for high-risk.",
    reference: "NCCN AML v3.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // LEUKEMIA — ALL
  // ══════════════════════════════════════════════════════════════════
  {
    id: "ALL-001",
    cancer: ["acute lymphoblastic leukemia", "all", "acute lymphocytic leukemia", "acute lymphoid"],
    stages: ["*"],
    grade: "*",
    biomarkers: null,
    regimen: "Hyper-CVAD (Cyclophosphamide + Vincristine + Doxorubicin + Dexamethasone)",
    drugs: [
      "Cyclophosphamide 300 mg/m² q12h Days 1–3",
      "Vincristine 2 mg Days 4 & 11",
      "Doxorubicin 50 mg/m² Day 4",
      "Dexamethasone 40 mg Days 1–4 & 11–14",
      "Alternating with: Methotrexate 200 mg/m² + Cytarabine 3 g/m²"
    ],
    cycles: 8,
    interval: 21,
    duration: "8 alternating cycles (~24–28 weeks), then maintenance × 2–3 years",
    intent: "curative",
    notes: "Hyper-CVAD alternating with MTX/Ara-C × 8 cycles. CNS prophylaxis with IT chemotherapy. Maintenance for 2–3 years.",
    reference: "NCCN ALL v2.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // HEPATOCELLULAR CARCINOMA (HCC)
  // ══════════════════════════════════════════════════════════════════
  {
    id: "HCC-001",
    cancer: ["hepatocellular carcinoma", "hcc", "liver cancer", "hepatocellular cancer", "liver cell carcinoma"],
    stages: ["III", "IV", "advanced"],
    grade: "*",
    biomarkers: null,
    regimen: "Atezolizumab + Bevacizumab",
    drugs: [
      "Atezolizumab 1200 mg Day 1",
      "Bevacizumab 15 mg/kg Day 1"
    ],
    cycles: 0,
    interval: 21,
    duration: "Continuous q3w until progression or unacceptable toxicity",
    intent: "palliative",
    notes: "IMbrave150: superior to sorafenib. Requires esophageal varices screening prior to bevacizumab. Note: target therapy, not traditional cycles.",
    reference: "NCCN Hepatobiliary Cancers v2.2024 / IMbrave150"
  },

  // ══════════════════════════════════════════════════════════════════
  // ENDOMETRIAL CANCER
  // ══════════════════════════════════════════════════════════════════
  {
    id: "EC-001",
    cancer: ["endometrial cancer", "uterine cancer", "endometrial carcinoma", "uterine carcinoma", "uterine corpus"],
    stages: ["III", "IIIA", "IIIB", "IIIC", "IV"],
    grade: "*",
    biomarkers: null,
    regimen: "Carboplatin + Paclitaxel",
    drugs: [
      "Carboplatin AUC 5 Day 1",
      "Paclitaxel 175 mg/m² Day 1"
    ],
    cycles: 6,
    interval: 21,
    duration: "18 weeks (6 cycles × 21 days)",
    intent: "adjuvant",
    notes: "GOG 209: carboplatin + paclitaxel non-inferior to TAP with better tolerability. Standard for advanced/recurrent endometrial cancer.",
    reference: "NCCN Uterine Neoplasms v2.2024"
  },
  {
    id: "EC-002",
    cancer: ["endometrial cancer", "uterine cancer", "endometrial carcinoma", "mismatch repair deficient", "msi-h"],
    stages: ["III", "IV"],
    grade: "*",
    biomarkers: { mmr: "deficient", msi: "high" },
    regimen: "Pembrolizumab + Lenvatinib",
    drugs: [
      "Pembrolizumab 200 mg q3w",
      "Lenvatinib 20 mg orally daily"
    ],
    cycles: 0,
    interval: 21,
    duration: "Until progression or unacceptable toxicity (max 2 years pembrolizumab)",
    intent: "palliative",
    notes: "KEYNOTE-775: pembrolizumab + lenvatinib for previously treated advanced endometrial cancer regardless of MMR status.",
    reference: "NCCN Uterine Neoplasms v2.2024 / KEYNOTE-775"
  },

  // ══════════════════════════════════════════════════════════════════
  // MULTIPLE MYELOMA
  // ══════════════════════════════════════════════════════════════════
  {
    id: "MM-001",
    cancer: ["multiple myeloma", "plasma cell myeloma", "myeloma"],
    stages: ["II", "III", "ISS II", "ISS III"],
    grade: "*",
    biomarkers: null,
    regimen: "VRd (Bortezomib + Lenalidomide + Dexamethasone)",
    drugs: [
      "Bortezomib 1.3 mg/m² Days 1, 4, 8, 11",
      "Lenalidomide 25 mg Days 1–14",
      "Dexamethasone 20 mg Days 1, 2, 4, 5, 8, 9, 11, 12"
    ],
    cycles: 8,
    interval: 21,
    duration: "6–8 cycles induction → ASCT if eligible → maintenance lenalidomide",
    intent: "curative",
    notes: "SWOG S0777: VRd induction preferred for transplant-eligible patients. ASCT after 4–6 cycles. Lenalidomide maintenance ongoing.",
    reference: "NCCN Multiple Myeloma v6.2024"
  },

  // ══════════════════════════════════════════════════════════════════
  // BRAIN CANCER / BRAIN TUMOR
  // ══════════════════════════════════════════════════════════════════
  {
    id: "BRAIN-001",
    cancer: ["brain cancer", "brain tumor", "brain tumour", "glioblastoma", "gbm", "glioma", "astrocytoma", "primary brain", "intracranial tumor"],
    stages: ["I", "II", "IIA", "IIB"],
    grade: "*",
    biomarkers: null,
    regimen: "Surgery ± Radiation Therapy (Low-grade, localized)",
    drugs: [
      "Maximal safe surgical resection",
      "± Radiation Therapy 54–60 Gy in 30 fractions"
    ],
    cycles: 0,
    interval: 0,
    duration: "Surgery followed by observation or RT based on risk factors",
    intent: "curative",
    notes: "Low-grade glioma (WHO Grade 2): surgery alone if complete resection and low-risk. RT for subtotal resection or high-risk features (age >40, subtotal resection).",
    reference: "NCCN Central Nervous System Cancers v2.2024 / RTOG 9802"
  },
  {
    id: "BRAIN-002",
    cancer: ["brain cancer", "brain tumor", "brain tumour", "glioblastoma", "gbm", "glioma", "astrocytoma", "primary brain", "intracranial tumor"],
    stages: ["III", "IIIA", "IIIB", "IIIC"],
    grade: "*",
    biomarkers: null,
    regimen: "Stupp Protocol — RT + Concomitant Temozolomide → Adjuvant Temozolomide",
    drugs: [
      "Radiation Therapy 60 Gy in 30 fractions",
      "Temozolomide 75 mg/m² daily during RT",
      "→ Adjuvant Temozolomide 150–200 mg/m² Days 1–5 every 28 days × 6 cycles"
    ],
    cycles: 6,
    interval: 28,
    duration: "6 weeks RT + TMZ → 6 cycles adjuvant TMZ (total ~5 months)",
    intent: "curative",
    notes: "Stupp Protocol (NEJM 2005): standard of care for newly diagnosed GBM. MGMT methylation status predicts TMZ benefit. Consider tumour treating fields (Optune) for MGMT unmethylated.",
    reference: "NCCN CNS Cancers v2.2024 / Stupp et al. NEJM 2005"
  },
  {
    id: "BRAIN-003",
    cancer: ["brain cancer", "brain tumor", "brain tumour", "glioblastoma", "gbm", "glioma", "astrocytoma", "primary brain", "intracranial tumor"],
    stages: ["IV", "IVA", "IVB", "metastatic", "advanced"],
    grade: "*",
    biomarkers: null,
    regimen: "RT + Temozolomide + Bevacizumab (Recurrent/Progressive GBM)",
    drugs: [
      "Bevacizumab 10 mg/kg Days 1, 15",
      "Lomustine 90 mg/m² Day 1",
      "± Radiation Therapy for symptomatic control"
    ],
    cycles: 6,
    interval: 42,
    duration: "6 cycles (every 6 weeks) until progression or unacceptable toxicity",
    intent: "palliative",
    notes: "BELOB trial: bevacizumab + lomustine for recurrent GBM. Alternative: re-irradiation, clinical trial, or best supportive care. MGMT unmethylated tumors have poorer prognosis.",
    reference: "NCCN CNS Cancers v2.2024 / BELOB trial"
  },
  {
    id: "BRAIN-004",
    cancer: ["brain cancer", "brain tumor", "brain tumour", "meningioma", "oligodendroglioma", "ependymoma", "medulloblastoma"],
    stages: ["I", "II", "IIA", "IIB", "III", "IIIA", "IIIB", "IIIC", "IV", "IVA", "IVB"],
    grade: "*",
    biomarkers: null,
    regimen: "Surgery + Radiation Therapy (Non-GBM primary brain tumors)",
    drugs: [
      "Maximal safe surgical resection",
      "Radiation Therapy 50–60 Gy based on tumor type and grade"
    ],
    cycles: 0,
    interval: 0,
    duration: "Surgery followed by adjuvant RT (6 weeks)",
    intent: "curative",
    notes: "Meningioma: surgery alone for Grade 1; RT for Grade 2–3 or subtotal resection. Oligodendroglioma: RT + PCV or TMZ (1p/19q co-deleted). Medulloblastoma: craniospinal RT + chemotherapy (CCSG 9921).",
    reference: "NCCN CNS Cancers v2.2024"
  }
];

module.exports = dataset;
