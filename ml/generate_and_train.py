"""
OncoDoseRx — Dataset Generator + Model Trainer  (v3 — Full Multi-Cancer TNM)
=============================================================================
Root-cause fixes from Momtaz Begum breast cancer test case:

  FIX-1  Breast (and all solid tumours) now get PROPER T/N/M fields derived
         from the SAME TNM-to-stage tables used in AJCC 8th edition.
         Stage is DERIVED from T+N+M, not assigned independently.
         T2 N1 M0 → Stage IIB  (never Stage IV when M=0).

  FIX-2  ER, PR, Ki67 added as ML FEATURES so HR+/HER2- breast cancer
         learns the correct regimen (AC-T, not Capecitabine).

  FIX-3  Breast HR+ HER2- Stage II → AC-T (8 cycles) regimen corrected.
         Breast HR+ HER2- Stage I  → TC (4 cycles).
         Breast HR+ HER2+ any stage → trastuzumab-based.

  FIX-4  MSI field now stores "MSS", "MSI-L", "MSI-H" (not "low"/"high").

  FIX-5  BRCA column added to dataset; data_checker updated to mark
         BRCA as satisfied when a BRCA report is present even if result
         is "no pathogenic variant detected".

  FIX-6  CRC-specific columns (depth, LVI, PNI, CEA) remain only for CRC;
         breast/lung patients carry N/A — preventing cross-cancer leakage.
"""

import json, os, warnings
from collections import Counter

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore")
np.random.seed(42)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(OUT_DIR, exist_ok=True)

N = 170_000   # bumped to ~18k brain tumor patients
print(f"Generating {N:,} cancer patient records (v4 — Brain Tumor Expanded)...")

# ══════════════════════════════════════════════════════════════════════════════
# 1. CANCER TYPE DISTRIBUTION
# ══════════════════════════════════════════════════════════════════════════════
CANCER_TYPES = {
    "Breast Cancer":         0.140,
    "Lung Cancer (NSCLC)":   0.105,
    "Colorectal Cancer":     0.110,
    "Prostate Cancer":       0.082,
    "Melanoma":              0.046,
    "Bladder Cancer":        0.041,
    "Non-Hodgkin Lymphoma":  0.038,
    "Kidney Cancer (RCC)":   0.035,
    "Endometrial Cancer":    0.033,
    "Pancreatic Cancer":     0.035,
    "Leukemia (AML)":        0.027,
    "Thyroid Cancer":        0.024,
    "Liver Cancer (HCC)":    0.022,
    "Ovarian Cancer":        0.021,
    "Gastric Cancer":        0.020,
    "Cervical Cancer":       0.017,
    "Lung Cancer (SCLC)":    0.015,
    "Head & Neck Cancer":    0.015,
    "Hodgkin Lymphoma":      0.011,
    "Multiple Myeloma":      0.010,
    "Testicular Cancer":     0.007,
    "Leukemia (ALL)":        0.006,
    "Esophageal Cancer":     0.006,
    # ── Brain tumors (new — v4) ───────────────────────────────────────────
    "Glioblastoma (GBM)":              0.038,   # ~18k patients at N=170k
    "Lower Grade Glioma":              0.022,   # Grade 2–3 IDH-mutant
    "Oligodendroglioma":               0.010,   # 1p/19q co-deleted
    "Meningioma":                      0.014,
    "Brain Metastasis":                0.012,
    "Medulloblastoma":                 0.006,
    "Ependymoma":                      0.005,
}
names = list(dict.fromkeys(CANCER_TYPES.keys()))  # dedup
probs = np.array([CANCER_TYPES[k] for k in names])
probs /= probs.sum()
cancer_type = np.random.choice(names, size=N, p=probs)

# ══════════════════════════════════════════════════════════════════════════════
# 2. DEMOGRAPHICS
# ══════════════════════════════════════════════════════════════════════════════
age    = np.clip(np.random.normal(62, 13, N).astype(int), 18, 95)
gender = np.random.choice(["Male","Female"], N, p=[0.50,0.50])
gender[np.isin(cancer_type, ["Breast Cancer","Ovarian Cancer",
                               "Cervical Cancer","Endometrial Cancer"])] = "Female"
gender[cancer_type == "Prostate Cancer"]   = "Male"
gender[cancer_type == "Testicular Cancer"] = "Male"

# Brain tumor age adjustments (from TCGA/SEER distributions)
# GBM median ~65, LGG median ~38, Oligodendroglioma ~44, Medulloblastoma ~10
gbm_mask   = cancer_type == "Glioblastoma (GBM)"
lgg_mask   = cancer_type == "Lower Grade Glioma"
oligo_mask = cancer_type == "Oligodendroglioma"
meni_mask  = cancer_type == "Meningioma"
medullo_mask = cancer_type == "Medulloblastoma"
brain_meta_mask = cancer_type == "Brain Metastasis"
ependy_mask = cancer_type == "Ependymoma"

age[gbm_mask]   = np.clip(np.random.normal(62, 13, gbm_mask.sum()).astype(int),   35, 90)
age[lgg_mask]   = np.clip(np.random.normal(38, 10, lgg_mask.sum()).astype(int),    18, 65)
age[oligo_mask] = np.clip(np.random.normal(44, 11, oligo_mask.sum()).astype(int),  18, 70)
age[meni_mask]  = np.clip(np.random.normal(58, 14, meni_mask.sum()).astype(int),   25, 85)
age[medullo_mask]= np.clip(np.random.normal(12,  8, medullo_mask.sum()).astype(int), 4, 40)
age[ependy_mask] = np.clip(np.random.normal(30, 15, ependy_mask.sum()).astype(int), 5, 70)
# Meningioma is more common in women
gender[meni_mask] = np.random.choice(["Male","Female"], meni_mask.sum(), p=[0.35,0.65])

# ══════════════════════════════════════════════════════════════════════════════
# 3. FIX-1: DERIVE STAGE FROM TNM — not the other way around
#    Each cancer type gets a realistic T × N × M table.
#    Stage is then COMPUTED from TNM so the model learns the mapping.
# ══════════════════════════════════════════════════════════════════════════════

def tnm_to_stage_breast(t, n, m):
    """AJCC 8th edition anatomic stage for breast cancer."""
    if m >= 1: return "IV"
    if t == 4 or n == 3: return "III"        # T4 any N M0, any T N3 M0
    if n == 2: return "III"                   # any T N2 M0
    if t == 3 and n == 0: return "IIB"
    if t == 3 and n == 1: return "III"
    if t == 2 and n == 1: return "IIB"        # THE MOMTAZ BEGUM CASE
    if t == 2 and n == 0: return "IIA"
    if t == 1 and n == 1: return "IIA"
    if t == 0 and n == 1: return "IIA"
    if t == 1 and n == 0: return "IA"
    if t == 2 and n == 0: return "IIA"
    return "I"

def tnm_to_stage_generic(t, n, m):
    """Simplified generic AJCC stage."""
    if m >= 1: return "IV"
    if n >= 2 or t >= 4: return "III"
    if n == 1 or t == 3: return "II"
    if t == 2: return "II"
    if t <= 1: return "I"
    return "I"

# T distribution per cancer type (values: 1,2,3,4)
# Higher stage → higher T
T_DIST = {
    "Breast Cancer":     {1:[4,3,2,1],2:[3,4,2,1],3:[2,3,4,1],4:[1,2,3,4]},
    "Colorectal Cancer": {1:[3,3,2,1],2:[2,3,3,1],3:[1,2,4,2],4:[1,1,3,4]},
    "Lung Cancer (NSCLC)":{1:[3,3,2,1],2:[2,3,3,1],3:[1,2,3,3],4:[1,1,2,4]},
}
# Default T distribution for other cancers
T_DEFAULT = {1:[4,3,2,1],2:[3,3,3,1],3:[2,3,3,2],4:[1,2,3,4]}

N_DIST = {   # per stage: p(N=0), p(N=1), p(N=2), p(N=3)
    1:[0.90,0.08,0.02,0.00],
    2:[0.65,0.25,0.08,0.02],
    3:[0.20,0.35,0.35,0.10],
    4:[0.10,0.25,0.40,0.25],
}
M_DIST = {   # per stage: p(M=0), p(M=1)
    1:[1.00,0.00],2:[1.00,0.00],3:[0.97,0.03],4:[0.05,0.95],
}

# Stage distribution per cancer type (for sampling)
STAGE_DIST_P = {
    "Breast Cancer":         [0.35,0.30,0.20,0.15],
    "Lung Cancer (NSCLC)":   [0.15,0.20,0.25,0.40],
    "Colorectal Cancer":     [0.18,0.25,0.28,0.29],
    "Prostate Cancer":       [0.40,0.30,0.20,0.10],
    "Melanoma":              [0.50,0.25,0.15,0.10],
    "Bladder Cancer":        [0.30,0.25,0.25,0.20],
    "Non-Hodgkin Lymphoma":  [0.15,0.20,0.30,0.35],
    "Kidney Cancer (RCC)":   [0.35,0.25,0.20,0.20],
    "Endometrial Cancer":    [0.45,0.25,0.20,0.10],
    "Pancreatic Cancer":     [0.10,0.15,0.30,0.45],
    "Leukemia (AML)":        [0.25,0.25,0.25,0.25],
    "Thyroid Cancer":        [0.55,0.25,0.15,0.05],
    "Liver Cancer (HCC)":    [0.15,0.20,0.30,0.35],
    "Ovarian Cancer":        [0.15,0.20,0.30,0.35],
    "Gastric Cancer":        [0.15,0.20,0.30,0.35],
    "Cervical Cancer":       [0.25,0.25,0.30,0.20],
    "Lung Cancer (SCLC)":    [0.10,0.10,0.30,0.50],
    "Head & Neck Cancer":    [0.15,0.20,0.40,0.25],
    "Hodgkin Lymphoma":      [0.20,0.25,0.30,0.25],
    "Multiple Myeloma":      [0.10,0.20,0.35,0.35],
    "Testicular Cancer":     [0.30,0.30,0.25,0.15],
    "Leukemia (ALL)":        [0.25,0.25,0.25,0.25],
    "Esophageal Cancer":     [0.10,0.20,0.30,0.40],
    # Brain tumors use WHO CNS grades mapped to I–IV
    # GBM = always Grade IV = Stage IV equivalent
    "Glioblastoma (GBM)":              [0.00,0.00,0.00,1.00],
    # LGG = Grade 2 mostly, some Grade 3
    "Lower Grade Glioma":              [0.10,0.65,0.25,0.00],
    # Oligodendroglioma: Grade 2 or 3
    "Oligodendroglioma":               [0.05,0.60,0.35,0.00],
    # Meningioma: mostly benign (Grade I), some atypical (II), rare anaplastic (III)
    "Meningioma":                      [0.70,0.22,0.08,0.00],
    # Brain Metastasis: always Stage IV (primary cancer spread to brain)
    "Brain Metastasis":                [0.00,0.00,0.00,1.00],
    # Medulloblastoma: classified as risk groups mapped to stages
    "Medulloblastoma":                 [0.15,0.40,0.30,0.15],
    # Ependymoma: Grade 2–3
    "Ependymoma":                      [0.10,0.55,0.30,0.05],
STAGE_LABELS = [1,2,3,4]  # numeric for indexing

# Sample T, N, M for every patient
t_num = np.zeros(N, dtype=int)
n_num = np.zeros(N, dtype=int)
m_num = np.zeros(N, dtype=int)
stage_num = np.zeros(N, dtype=int)   # 1..4

for ct in names:
    mask = cancer_type == ct
    if not mask.sum(): continue
    p_stage = STAGE_DIST_P.get(ct, [0.25,0.25,0.25,0.25])
    st_arr  = np.random.choice(STAGE_LABELS, mask.sum(), p=p_stage)
    stage_num[mask] = st_arr
    t_dist_map = T_DIST.get(ct, T_DEFAULT)
    for i, idx in enumerate(np.where(mask)[0]):
        st = st_arr[i]
        t_weights = t_dist_map[st]
        t_val = np.random.choice([1,2,3,4], p=np.array(t_weights)/sum(t_weights))
        n_val = np.random.choice([0,1,2,3], p=N_DIST[st])
        m_val = np.random.choice([0,1],     p=M_DIST[st])
        t_num[idx] = t_val
        n_num[idx] = n_val
        m_num[idx] = m_val

# Now DERIVE stage from TNM (the correct direction)
stage = np.empty(N, dtype=object)
for i in range(N):
    ct = cancer_type[i]
    if ct == "Breast Cancer":
        s = tnm_to_stage_breast(t_num[i], n_num[i], m_num[i])
    else:
        s = tnm_to_stage_generic(t_num[i], n_num[i], m_num[i])
    # Collapse sub-stages to I/II/III/IV for model
    stage[i] = s[0:3].rstrip("AB") if len(s) >= 2 else s

# String versions for dataset
t_stage_str = np.array([f"T{v}" for v in t_num])
n_stage_str = np.array([f"N{v}" for v in n_num])
m_stage_str = np.array([f"M{v}" for v in m_num])

print(f"  Stage distribution: {dict(zip(*np.unique(stage, return_counts=True)))}")
breast_mask = cancer_type == "Breast Cancer"
print(f"  Breast IIB (T2N1M0) count: {((t_num==2)&(n_num==1)&(m_num==0)&breast_mask).sum()}")

# ══════════════════════════════════════════════════════════════════════════════
# 4. GRADE
# ══════════════════════════════════════════════════════════════════════════════
grade_p = {"I":[0.35,0.40,0.25],"II":[0.25,0.40,0.35],"III":[0.15,0.35,0.50],"IV":[0.10,0.25,0.65]}
GRADE_LABELS = ["Grade 1 (Low)","Grade 2 (Moderate)","Grade 3 (High)"]
grade = np.empty(N, dtype=object)
for s in ["I","II","III","IV"]:
    m = stage == s
    if m.sum(): grade[m] = np.random.choice(GRADE_LABELS, m.sum(), p=grade_p[s])

# ══════════════════════════════════════════════════════════════════════════════
# 5. BIOMARKERS  (FIX-2: ER, PR, Ki67 as real features)
# ══════════════════════════════════════════════════════════════════════════════

# HER2: Breast 20% pos, others 5%
her2 = np.where(breast_mask,
    np.random.choice(["Positive","Negative"],N,p=[0.20,0.80]),
    np.random.choice(["Positive","Negative"],N,p=[0.05,0.95]))

# ER, PR — breast only, correlated
er = np.full(N,"N/A",dtype=object)
pr = np.full(N,"N/A",dtype=object)
hr = np.full(N,"N/A",dtype=object)
# Breast: 75% ER+, 70% PR+ (among ER+)
er[breast_mask] = np.random.choice(["Positive","Negative"], breast_mask.sum(), p=[0.75,0.25])
for idx in np.where(breast_mask)[0]:
    if er[idx] == "Positive":
        pr[idx] = np.random.choice(["Positive","Negative"], p=[0.85,0.15])
    else:
        pr[idx] = np.random.choice(["Positive","Negative"], p=[0.20,0.80])
    hr[idx] = "Positive" if (er[idx]=="Positive" or pr[idx]=="Positive") else "Negative"

# Ki67 — breast only: HR+/HER2- ~ 5-40%; TNBC ~ 40-90%
ki67 = np.full(N, -1, dtype=int)
for idx in np.where(breast_mask)[0]:
    is_tnbc = er[idx]=="Negative" and pr[idx]=="Negative" and her2[idx]=="Negative"
    if is_tnbc:
        ki67[idx] = int(np.clip(np.random.normal(60,15), 20, 95))
    elif her2[idx] == "Positive":
        ki67[idx] = int(np.clip(np.random.normal(35,15), 5, 80))
    else:
        ki67[idx] = int(np.clip(np.random.normal(20,12), 3, 60))

# EGFR — NSCLC only
nsclc_mask = cancer_type == "Lung Cancer (NSCLC)"
egfr = np.full(N,"N/A",dtype=object)
egfr[nsclc_mask] = np.random.choice(["Mutated","Wild-Type"], nsclc_mask.sum(), p=[0.20,0.80])

# PD-L1 — NSCLC/HNC/cervical/bladder
pdl1_mask = np.isin(cancer_type,["Lung Cancer (NSCLC)","Head & Neck Cancer",
                                   "Cervical Cancer","Bladder Cancer"])
pdl1 = np.full(N,"N/A",dtype=object)
pdl1[pdl1_mask] = np.random.choice(
    ["High (>=50%)","Low (1-49%)","Negative (<1%)"], pdl1_mask.sum(), p=[0.30,0.35,0.35])

# KRAS/NRAS/BRAF — CRC only
crc_mask = cancer_type == "Colorectal Cancer"
kras = np.full(N,"N/A",dtype=object)
kras[crc_mask] = np.random.choice(["Mutated","Wild-Type"], crc_mask.sum(), p=[0.45,0.55])
kras_wt_crc = crc_mask & (kras=="Wild-Type")
nras = np.full(N,"N/A",dtype=object)
nras[kras_wt_crc] = np.random.choice(["Mutated","Wild-Type"],kras_wt_crc.sum(),p=[0.08,0.92])
nras[crc_mask & (kras!="Wild-Type")] = "Wild-Type"
braf = np.full(N,"N/A",dtype=object)
braf[kras_wt_crc] = np.random.choice(["Mutated","Wild-Type"],kras_wt_crc.sum(),p=[0.10,0.90])
braf[crc_mask & (kras=="Mutated")] = "Wild-Type"

# FIX-4: MMR/MSI — now stores MSS/MSI-L/MSI-H
mmr = np.full(N,"N/A",dtype=object)
# CRC MSI distribution
mmr_crc_dist = {"I":0.20,"II":0.22,"III":0.15,"IV":0.05}
for s in ["I","II","III","IV"]:
    m = crc_mask & (stage==s)
    if m.sum():
        r = np.random.rand(m.sum())
        p_h = mmr_crc_dist[s]
        mmr[m] = np.where(r < p_h, "MSI-H",
                 np.where(r < p_h+0.05, "MSI-L", "MSS"))
# Breast MSI is almost always MSS
mmr[breast_mask] = "MSS"

# BRCA — breast + ovarian + pancreatic (FIX-5)
brca = np.full(N,"N/A",dtype=object)
brca_cancers = np.isin(cancer_type,["Breast Cancer","Ovarian Cancer","Pancreatic Cancer"])
brca[brca_cancers] = np.random.choice(
    ["Pathogenic Variant","No Pathogenic Variant"], brca_cancers.sum(), p=[0.12,0.88])
# Breast HER2- HR+ patients less likely BRCA
for idx in np.where(breast_mask)[0]:
    if her2[idx]=="Negative" and hr[idx]=="Positive":
        brca[idx] = np.random.choice(["Pathogenic Variant","No Pathogenic Variant"], p=[0.08,0.92])

# ══════════════════════════════════════════════════════════════════════════════
# 5b. BRAIN TUMOR BIOMARKERS  (TCGA-GBM + TCGA-LGG distributions)
#     IDH1/2, MGMT methylation, 1p/19q co-deletion, TERT promoter, ATRX
#     WHO CNS Grade (2025 classification)
# ══════════════════════════════════════════════════════════════════════════════
brain_mask = np.isin(cancer_type, [
    "Glioblastoma (GBM)","Lower Grade Glioma","Oligodendroglioma",
    "Meningioma","Brain Metastasis","Medulloblastoma","Ependymoma"
])

# IDH1/2 mutation status
# GBM: ~10% IDH-mutant (mostly young patients); LGG: ~80% IDH-mutant; Oligo: ~100% IDH-mutant
idh = np.full(N, "N/A", dtype=object)
idh[gbm_mask]    = np.random.choice(["Mutated","Wild-Type"], gbm_mask.sum(), p=[0.10, 0.90])
idh[lgg_mask]    = np.random.choice(["Mutated","Wild-Type"], lgg_mask.sum(), p=[0.80, 0.20])
idh[oligo_mask]  = np.full(oligo_mask.sum(), "Mutated")   # virtually 100%
idh[meni_mask]   = np.full(meni_mask.sum(), "Wild-Type")  # IDH-WT in meningioma
idh[medullo_mask]= np.full(medullo_mask.sum(), "Wild-Type")
idh[ependy_mask] = np.full(ependy_mask.sum(), "Wild-Type")
idh[brain_meta_mask] = np.full(brain_meta_mask.sum(), "Wild-Type")

# MGMT promoter methylation
# GBM IDH-WT: ~45% methylated; GBM IDH-mut: ~75% methylated
# LGG: ~60–70% methylated; Oligo: ~80% methylated
mgmt = np.full(N, "N/A", dtype=object)
for idx in np.where(gbm_mask)[0]:
    p_meth = 0.75 if idh[idx] == "Mutated" else 0.45
    mgmt[idx] = "Methylated" if np.random.rand() < p_meth else "Unmethylated"
for idx in np.where(lgg_mask)[0]:
    p_meth = 0.70 if idh[idx] == "Mutated" else 0.35
    mgmt[idx] = "Methylated" if np.random.rand() < p_meth else "Unmethylated"
mgmt[oligo_mask]  = np.random.choice(["Methylated","Unmethylated"], oligo_mask.sum(), p=[0.80,0.20])
mgmt[meni_mask]   = np.full(meni_mask.sum(), "N/A")   # Not routinely tested
mgmt[medullo_mask]= np.full(medullo_mask.sum(), "N/A")
mgmt[ependy_mask] = np.full(ependy_mask.sum(), "N/A")
mgmt[brain_meta_mask] = np.full(brain_meta_mask.sum(), "N/A")

# 1p/19q co-deletion — ONLY in Oligodendroglioma (required by WHO 2021 definition)
codeletion_1p19q = np.full(N, "N/A", dtype=object)
codeletion_1p19q[oligo_mask] = np.full(oligo_mask.sum(), "Co-deleted")    # definition
codeletion_1p19q[lgg_mask]   = np.random.choice(
    ["Co-deleted","Intact"], lgg_mask.sum(), p=[0.25, 0.75])
codeletion_1p19q[gbm_mask]   = np.full(gbm_mask.sum(), "Intact")

# TERT promoter mutation
# GBM IDH-WT: ~75% TERT mutated; Oligo: ~80%; IDH-mut astrocytoma: ~15%
tert = np.full(N, "N/A", dtype=object)
for idx in np.where(gbm_mask)[0]:
    p_tert = 0.75 if idh[idx] == "Wild-Type" else 0.15
    tert[idx] = "Mutated" if np.random.rand() < p_tert else "Wild-Type"
tert[oligo_mask]  = np.random.choice(["Mutated","Wild-Type"], oligo_mask.sum(), p=[0.80,0.20])
tert[lgg_mask]    = np.random.choice(["Mutated","Wild-Type"], lgg_mask.sum(), p=[0.20,0.80])

# ATRX mutation (IDH-mutant astrocytomas ~70%; Oligodendroglioma ~0%)
atrx = np.full(N, "N/A", dtype=object)
for idx in np.where(lgg_mask)[0]:
    if idh[idx] == "Mutated":
        atrx[idx] = "Lost" if np.random.rand() < 0.65 else "Retained"
    else:
        atrx[idx] = "Retained"
atrx[oligo_mask]  = np.full(oligo_mask.sum(), "Retained")   # ATRX retained in oligo
atrx[gbm_mask]    = np.random.choice(["Lost","Retained"], gbm_mask.sum(), p=[0.25,0.75])

# WHO CNS Grade (2021 classification — different from solid tumour TNM grading)
who_cns_grade = np.full(N, "N/A", dtype=object)
who_cns_grade[gbm_mask]    = np.full(gbm_mask.sum(), "WHO Grade 4")
who_cns_grade[oligo_mask]  = np.random.choice(["WHO Grade 2","WHO Grade 3"], oligo_mask.sum(), p=[0.60,0.40])
who_cns_grade[meni_mask]   = np.random.choice(["WHO Grade 1","WHO Grade 2","WHO Grade 3"],
                                meni_mask.sum(), p=[0.70,0.22,0.08])
who_cns_grade[medullo_mask]= np.random.choice(
    ["WHO Grade 4 (High-Risk)","WHO Grade 4 (Standard-Risk)","WHO Grade 4 (Low-Risk)"],
    medullo_mask.sum(), p=[0.25,0.50,0.25])
who_cns_grade[ependy_mask] = np.random.choice(["WHO Grade 2","WHO Grade 3"], ependy_mask.sum(), p=[0.65,0.35])
who_cns_grade[brain_meta_mask] = np.full(brain_meta_mask.sum(), "Metastatic")
for idx in np.where(lgg_mask)[0]:
    who_cns_grade[idx] = "WHO Grade 2" if stage[idx] in ("I","II") else "WHO Grade 3"

# Extent of resection (important predictor for brain tumors)
extent_resection = np.full(N, "N/A", dtype=object)
for mask, opts, probs_r in [
    (gbm_mask,   ["Gross Total Resection","Subtotal Resection","Biopsy Only"],     [0.40,0.40,0.20]),
    (lgg_mask,   ["Gross Total Resection","Subtotal Resection","Biopsy Only"],     [0.35,0.45,0.20]),
    (oligo_mask, ["Gross Total Resection","Subtotal Resection","Biopsy Only"],     [0.40,0.40,0.20]),
    (meni_mask,  ["Complete Resection (Simpson I-II)","Subtotal Resection","Biopsy Only"],[0.65,0.28,0.07]),
    (medullo_mask,["Gross Total Resection","Subtotal Resection"],                   [0.75,0.25]),
    (ependy_mask, ["Gross Total Resection","Subtotal Resection"],                   [0.60,0.40]),
]:
    cnt = mask.sum()
    if cnt: extent_resection[mask] = np.random.choice(opts, cnt, p=probs_r)

# ══════════════════════════════════════════════════════════════════════════════
# 6. CRC-SPECIFIC FIELDS (kept N/A for non-CRC — FIX-6)
# ══════════════════════════════════════════════════════════════════════════════
# CEA
cea = np.full(N, np.nan)
cea_by_stage = {"I":4,"II":12,"III":28,"IV":85}
for s,mu in cea_by_stage.items():
    m = crc_mask & (stage==s)
    if m.sum(): cea[m] = np.round(np.clip(np.random.exponential(mu,m.sum()),0.5,5000),1)

# Depth of invasion
depth_labels = ["Mucosa/Submucosa","Muscularis propria","Subserosa/Pericolorectal",
                "Through serosa (T4a)","Adjacent organs (T4b)"]
depth_dist = {
    "I":[0.40,0.45,0.10,0.05,0.00],"II":[0.05,0.15,0.40,0.35,0.05],
    "III":[0.02,0.10,0.35,0.40,0.13],"IV":[0.01,0.05,0.25,0.45,0.24],
}
depth = np.full(N,"N/A",dtype=object)
for s in ["I","II","III","IV"]:
    m = crc_mask & (stage==s)
    if m.sum(): depth[m] = np.random.choice(depth_labels, m.sum(), p=depth_dist[s])

# LVI
lvi = np.full(N,"N/A",dtype=object)
lvi_p = {"I":0.15,"II":0.30,"III":0.60,"IV":0.75}
for s,p in lvi_p.items():
    m = crc_mask & (stage==s)
    if m.sum(): lvi[m] = np.where(np.random.rand(m.sum())<p,"Present","Absent")

# PNI
pni = np.full(N,"N/A",dtype=object)
pni_p = {"I":0.08,"II":0.18,"III":0.38,"IV":0.50}
for s,p in pni_p.items():
    m = crc_mask & (stage==s)
    if m.sum(): pni[m] = np.where(np.random.rand(m.sum())<p,"Present","Absent")

# Lymph nodes
ln_pos   = np.full(N,-1,dtype=int)
ln_total = np.full(N,-1,dtype=int)
for s in ["I","II","III","IV"]:
    m = crc_mask & (stage==s)
    if m.sum():
        tot = np.random.randint(10,28,m.sum())
        pos_map = {"I":0,"II":0,"III":4,"IV":8}
        pos = np.random.randint(0,pos_map.get(s,4)+1,m.sum())
        ln_pos[m]=pos; ln_total[m]=tot

# Tumour size
tumour_size = np.full(N,np.nan)
tumour_size[crc_mask] = np.clip(np.random.normal(4.2,1.8,crc_mask.sum()),0.5,12.0).round(1)

# Primary site
CRC_SITES = ["Ascending Colon","Transverse Colon","Descending Colon",
             "Sigmoid Colon","Rectosigmoid","Rectum","Caecum"]
CRC_SITE_P= [0.20,0.12,0.08,0.22,0.10,0.18,0.10]
primary_site = np.full(N,"N/A",dtype=object)
primary_site[crc_mask] = np.random.choice(CRC_SITES, crc_mask.sum(), p=CRC_SITE_P)

# ══════════════════════════════════════════════════════════════════════════════
# 7. CLINICAL
# ══════════════════════════════════════════════════════════════════════════════
ecog_by_s = {"I":[0.50,0.35,0.12,0.03,0.00],"II":[0.35,0.40,0.18,0.05,0.02],
             "III":[0.20,0.40,0.27,0.10,0.03],"IV":[0.10,0.35,0.33,0.16,0.06]}
ecog = np.empty(N,dtype=int)
for s in ["I","II","III","IV"]:
    m = stage==s
    if m.sum(): ecog[m] = np.random.choice([0,1,2,3,4],m.sum(),p=ecog_by_s[s])

charlson = np.random.choice([0,1,2,3,4,5],N,p=[0.35,0.25,0.18,0.12,0.07,0.03])
prior_treatment = np.random.choice(
    ["None","Surgery","Radiation","Surgery+Radiation","Previous Chemo"],
    N, p=[0.30,0.30,0.10,0.20,0.10])

def assign_intent(ct,st):
    if st=="IV": return "Palliative"
    if st=="III": return np.random.choice(["Curative","Palliative"],p=[0.70,0.30])
    return np.random.choice(["Adjuvant","Curative","Neoadjuvant"],p=[0.50,0.30,0.20])
intent = np.array([assign_intent(c,s) for c,s in zip(cancer_type,stage)])

# ══════════════════════════════════════════════════════════════════════════════
# 8. CHEMOTHERAPY CYCLES — FIX-3: Breast HR+/HER2- now gets correct regimen
# ══════════════════════════════════════════════════════════════════════════════
def assign_cycles(ct, st, h2, eg, k, nr, bf, mm, ps, er_val, pr_val, ki67_val,
                  idh_val, mgmt_val, codeletion_val, tert_val, who_grade_val, extent_val):
    if ps >= 3: return (0,"Best Supportive Care / Clinical Trial")

    # ── Breast ────────────────────────────────────────────────────────────────
    if ct == "Breast Cancer":
        is_hr_pos = er_val=="Positive" or pr_val=="Positive"
        is_her2_pos = h2=="Positive"
        is_tnbc = (er_val=="Negative" and pr_val=="Negative" and h2=="Negative")

        if st == "IV":
            if is_her2_pos: return (6,"THP → HP Maintenance (HER2+)")
            if is_tnbc:     return (6,"Capecitabine or Eribulin (TNBC metastatic)")
            return (6,"CDK4/6 inhibitor + Endocrine Therapy (HR+ metastatic)")

        if is_tnbc:
            if st in ("II","III"):
                return (8,"Pembrolizumab + Paclitaxel/Carbo → Pembro + AC (KEYNOTE-522)")
            return (4,"TC (TNBC Stage I)")

        if is_her2_pos:
            if st == "I":   return (6,"TC + Trastuzumab (HER2+ Stage I)")
            if st == "II":  return (8,"AC-THP Neoadjuvant (HER2+ Stage II)")
            if st == "III": return (8,"AC-THP Neoadjuvant (HER2+ Stage III)")

        # HR+ HER2- (the Momtaz Begum subtype)  — FIX-3 CORE
        if is_hr_pos and not is_her2_pos:
            high_ki67 = ki67_val > 25
            if st == "I":
                return (4,"TC (HR+/HER2- Stage I adjuvant)")
            if st in ("II","IIA","IIB"):
                # High Ki67 / ≥4 nodes → dose-dense AC-T
                # Low Ki67 / favourable → TC x4 or OncotypeDx-guided
                if high_ki67 or (n_num is not None):
                    return (8,"AC-T (Dose-Dense, HR+/HER2- Stage II adjuvant)")
                return (4,"TC x4 (HR+/HER2- Stage II, low-risk)")
            if st == "III":
                return (8,"AC-T (HR+/HER2- Stage III adjuvant)")

        # Fallback breast
        return (8,"AC-T")

    # ── CRC ───────────────────────────────────────────────────────────────────
    if ct == "Colorectal Cancer":
        if st == "I":   return (0,"Surveillance")
        if st == "II":
            if mm == "MSI-H": return (0,"Surveillance — MSI-H Stage II, no 5-FU benefit")
            if bf == "Mutated": return (8,"CAPOX (BRAF-mutated Stage II high-risk)")
            return (8,"CAPOX" ) if np.random.rand()<0.5 else (12,"FOLFOX")
        if st == "III":
            if mm == "MSI-H": return (12,"FOLFOX (MSI-H Stage III — oxaliplatin benefit retained)")
            return (12,"FOLFOX")
        if st == "IV":
            if k=="Mutated" or nr=="Mutated": return (12,"FOLFIRI + Bevacizumab")
            if bf=="Mutated":  return (8,"FOLFOX + Bevacizumab (BRAF-mutated)")
            if mm=="MSI-H":    return (35,"Pembrolizumab (dMMR/MSI-H Stage IV)")
            return (12,"FOLFOX + Cetuximab (RAS WT)")

    # ── NSCLC ─────────────────────────────────────────────────────────────────
    if ct == "Lung Cancer (NSCLC)":
        if eg=="Mutated": return (0,"Osimertinib (EGFR TKI)")
        return ({"I":(4,"Adj Carbo+Pac"),"II":(4,"Carbo+Pac"),
                 "III":(6,"Carbo+Pac+CRT"),"IV":(4,"Carbo+Pac+Pembro")}.get(st,(4,"Carbo+Pac")))
    if ct == "Lung Cancer (SCLC)":
        return ({"IV":(4,"Atezo+Carbo+Etop")}.get(st,(4,"EP+CRT")))
    if ct == "Prostate Cancer":
        return ({"IV":(10,"Docetaxel+Pred")}.get(st,(0,"ADT")))
    if ct == "Ovarian Cancer":     return (6,"Carbo+Pac+Bev")
    if ct == "Pancreatic Cancer":
        return ({"IV":(12,"FOLFIRINOX")}.get(st,(8,"Gem+nabPac")))
    if ct == "Gastric Cancer":
        return ({"IV":(8,"FOLFOX+Nivo")}.get(st,(8,"FLOT")))
    if ct == "Cervical Cancer":
        return ({"IV":(6,"Pembro+Carbo+Pac")}.get(st,(6,"Cisplatin+RT")))
    if ct == "Endometrial Cancer": return (6,"Carbo+Pac")
    if ct == "Bladder Cancer":     return ({"IV":(6,"Gem+Cis")}.get(st,(4,"Neoadj GemCis")))
    if ct == "Non-Hodgkin Lymphoma":
        return ({"I":(6,"R-CHOP"),"II":(6,"R-CHOP")}.get(st,(8,"R-CHOP")))
    if ct == "Hodgkin Lymphoma":
        return ({"I":(4,"ABVD"),"II":(4,"ABVD")}.get(st,(6,"BV-AVD")))
    if ct == "Multiple Myeloma":   return (8,"VRd")
    if ct == "Testicular Cancer":  return ({"IV":(4,"BEP x4")}.get(st,(3,"BEP x3")))
    if ct == "Head & Neck Cancer": return ({"IV":(6,"Carbo+5FU+Cetux")}.get(st,(3,"Cisplatin+RT")))
    if ct == "Leukemia (AML)":     return (4,"7+3 Induction+HiDAC")
    if ct == "Leukemia (ALL)":     return (8,"Hyper-CVAD")
    if ct == "Liver Cancer (HCC)": return (0,"Atezolizumab+Bev")
    if ct == "Kidney Cancer (RCC)":return (0,"Nivo+Ipi")
    if ct == "Melanoma":           return ({"IV":(0,"Nivo+Ipi")}.get(st,(4,"Adj Nivo")))

    # ── Brain Tumors (NEW — v4) ───────────────────────────────────────────────
    # Source: STUPP trial (GBM), CATNON trial (Grade 3), RTOG 9802 (LGG),
    #         EORTC 26951 (anaplastic oligo), CODEL trial, NCCN CNS v2.2024
    if ct == "Glioblastoma (GBM)":
        # Stupp Protocol (NEJM 2005): RT + concurrent TMZ → 6 adjuvant cycles
        if mgmt_val == "Methylated":
            return (6, "Stupp Protocol — RT + concomitant TMZ → Adjuvant TMZ ×6 (MGMT methylated)")
        elif mgmt_val == "Unmethylated" and ps <= 1:
            return (6, "RT + concomitant TMZ → Adjuvant TMZ ×6 (consider TTFields for eligible)")
        elif ps == 2:
            return (6, "Hypofractionated RT + concomitant TMZ → Adjuvant TMZ ×6 (PS2)")
        else:  # elderly / poor PS
            return (6, "Hypofractionated RT ± TMZ (elderly or poor PS protocol)")

    if ct == "Lower Grade Glioma":
        if idh_val == "Wild-Type":
            # IDH-WT LGG = molecular GBM → treat as GBM
            return (6, "Stupp Protocol (IDH-WT LGG = molecular GBM) — RT + TMZ ×6")
        if who_grade_val == "WHO Grade 3":
            # CATNON trial: IDH-mutant Grade 3 → 12 adjuvant TMZ cycles
            return (12, "RT + Adjuvant TMZ ×12 (CATNON trial — IDH-mutant Grade 3 Astrocytoma)")
        if who_grade_val == "WHO Grade 2":
            # RTOG 9802: high-risk LGG → RT + PCV ×6 or TMZ
            r = np.random.rand()
            if r < 0.50:
                return (6,  "RT + Adjuvant PCV ×6 (RTOG 9802 — high-risk LGG)")
            elif r < 0.80:
                return (12, "RT + Adjuvant TMZ ×12 (RTOG 0424 — IDH-mutant Grade 2)")
            else:
                return (0,  "Surveillance (low-risk Grade 2 LGG, observation)")
        return (12, "RT + Adjuvant TMZ ×12 (IDH-mutant Astrocytoma)")

    if ct == "Oligodendroglioma":
        # EORTC 26951 / RTOG 9402: RT + PCV chemotherapy
        if who_grade_val == "WHO Grade 3":
            return (6, "RT + Adjuvant PCV ×6 (EORTC 26951 — 1p/19q co-deleted Anaplastic Oligo)")
        if who_grade_val == "WHO Grade 2":
            r = np.random.rand()
            if r < 0.55:
                return (6,  "RT + Adjuvant PCV ×6 (RTOG 9802 — Grade 2 Oligodendroglioma)")
            else:
                return (0,  "Surveillance (Grade 2 Oligodendroglioma, observation after maximal resection)")
        return (6, "RT + Adjuvant PCV ×6 (Oligodendroglioma)")

    if ct == "Meningioma":
        if who_grade_val == "WHO Grade 1":
            if extent_val and "Complete" in extent_val:
                return (0, "Observation — Simpson Grade I/II resection, no adjuvant required")
            return (0, "Radiotherapy (SRS/FSRT) — subtotal resection Grade 1 Meningioma")
        if who_grade_val == "WHO Grade 2":
            return (0, "Adjuvant RT (fractionated) — Atypical Meningioma Grade 2")
        if who_grade_val == "WHO Grade 3":
            return (6, "RT + Adjuvant Chemotherapy (Anaplastic Meningioma — experimental TMZ/Bev)")
        return (0, "Observation / RT depending on resection")

    if ct == "Brain Metastasis":
        # Systemic therapy depends on primary; brain treatment = SRS/WBRT
        return (0, "SRS/WBRT + Primary Cancer Systemic Therapy (brain-directed RT, not standard chemo cycles)")

    if ct == "Medulloblastoma":
        # Risk-stratified: High-risk → Craniospinal RT + 6 cycles adjuvant chemo
        if "High-Risk" in who_grade_val:
            return (6, "Craniospinal RT + Adjuvant Cisplatin/CCNU/Vincristine ×6 (High-Risk Medulloblastoma)")
        elif "Standard-Risk" in who_grade_val:
            return (4, "Craniospinal RT + Adjuvant Vincristine ×4 (Standard-Risk Medulloblastoma)")
        else:
            return (4, "Reduced-Dose Craniospinal RT + Adjuvant Chemotherapy ×4 (Low-Risk)")

    if ct == "Ependymoma":
        if who_grade_val == "WHO Grade 3":
            return (6, "Focal RT + Adjuvant Chemotherapy ×6 (Anaplastic Ependymoma)")
        return (0, "Focal RT (Grade 2 Ependymoma — RT alone, chemo at recurrence)")

    return (6,"Carboplatin+Paclitaxel")

print("Assigning chemotherapy cycles...")
results_raw = [
    assign_cycles(ct, st, h2, eg, k, nr, bf, mm, ps, er_v, pr_v, ki_v,
                  idh_v, mgmt_v, cdel_v, tert_v, who_v, ext_v)
    for ct, st, h2, eg, k, nr, bf, mm, ps, er_v, pr_v, ki_v,
        idh_v, mgmt_v, cdel_v, tert_v, who_v, ext_v
    in zip(cancer_type, stage, her2, egfr, kras, nras, braf, mmr, ecog, er, pr, ki67,
           idh, mgmt, codeletion_1p19q, tert, who_cns_grade, extent_resection)
]
chemo_cycles = np.array([r[0] for r in results_raw])
regimen      = np.array([r[1] for r in results_raw])

noise_mask   = chemo_cycles > 0
chemo_cycles = np.where(noise_mask,
    np.clip(chemo_cycles + np.random.choice([-1,0,0,1],N), 0, 35), chemo_cycles)

# ══════════════════════════════════════════════════════════════════════════════
# 9. DATAFRAME
# ══════════════════════════════════════════════════════════════════════════════
print("Building DataFrame...")
df = pd.DataFrame({
    "patient_id":          [f"ONC-{i+1:06d}" for i in range(N)],
    "age":                 age,
    "gender":              gender,
    "cancer_type":         cancer_type,
    "stage":               stage,
    "grade":               grade,
    "t_stage":             t_stage_str,
    "n_stage":             n_stage_str,
    "m_stage":             m_stage_str,
    # Universal biomarkers
    "her2_status":         her2,
    "er_status":           er,           # FIX-2
    "pr_status":           pr,           # FIX-2
    "hr_status":           hr,
    "ki67_score":          ki67,         # FIX-2
    "egfr_status":         egfr,
    "pdl1_status":         pdl1,
    "kras_status":         kras,
    "nras_status":         nras,
    "braf_status":         braf,
    "mmr_msi_status":      mmr,          # FIX-4: MSS/MSI-L/MSI-H
    "brca_status":         brca,         # FIX-5
    # Brain-tumor-specific biomarkers (N/A for non-brain cancers)
    "idh_status":          idh,
    "mgmt_status":         mgmt,
    "codeletion_1p19q":    codeletion_1p19q,
    "tert_status":         tert,
    "atrx_status":         atrx,
    "who_cns_grade":       who_cns_grade,
    "extent_resection":    extent_resection,
    # CRC-specific (N/A for others — FIX-6)
    "primary_site":        primary_site,
    "depth_of_invasion":   depth,
    "lvi":                 lvi,
    "pni":                 pni,
    "cea_value":           cea,
    "tumour_size_cm":      tumour_size,
    "lymph_nodes_positive":ln_pos,
    "lymph_nodes_total":   ln_total,
    # Clinical
    "ecog_ps":             ecog,
    "charlson_score":      charlson,
    "prior_treatment":     prior_treatment,
    "treatment_intent":    intent,
    # Target
    "recommended_regimen": regimen,
    "chemotherapy_cycles": chemo_cycles,
})

csv_path = os.path.join(OUT_DIR, "cancer_patients.csv")
df.to_csv(csv_path, index=False)
print(f"  Saved {len(df):,} rows → {csv_path}")

# Validate the Momtaz Begum pattern
bc_iib = df[(df.cancer_type=="Breast Cancer") &
            (df.t_stage=="T2") & (df.n_stage=="N1") & (df.m_stage=="M0")]
print(f"  Breast T2 N1 M0 rows : {len(bc_iib)}")
if len(bc_iib):
    top_stage = bc_iib["stage"].value_counts().idxmax()
    top_reg   = bc_iib["recommended_regimen"].value_counts().idxmax()
    print(f"  → Top stage: {top_stage}  (expected: II or IIB)")
    print(f"  → Top regimen: {top_reg}  (expected: AC-T)")

# ══════════════════════════════════════════════════════════════════════════════
# 10. TRAIN RANDOM FOREST  (FIX-2: ER, PR, Ki67 now in feature set)
# ══════════════════════════════════════════════════════════════════════════════
print("\nTraining Random Forest model...")

FEATURES = [
    # Demographics
    "age", "gender",
    # Oncology
    "cancer_type", "stage", "grade",
    "t_stage", "n_stage", "m_stage",
    # Universal biomarkers — FIX-2 adds er_status, pr_status, ki67_score
    "her2_status", "er_status", "pr_status", "hr_status", "ki67_score",
    "egfr_status", "pdl1_status",
    "kras_status", "nras_status", "braf_status",
    "mmr_msi_status", "brca_status",
    # Brain-tumor biomarkers
    "idh_status", "mgmt_status", "codeletion_1p19q",
    "tert_status", "atrx_status", "who_cns_grade", "extent_resection",
    # CRC-specific
    "lvi", "pni", "depth_of_invasion", "primary_site",
    # Clinical
    "ecog_ps", "charlson_score", "prior_treatment", "treatment_intent",
]

X = df[FEATURES].copy()
for col in ["age","ecog_ps","charlson_score","ki67_score"]:
    X[col] = pd.to_numeric(X[col], errors="coerce").fillna(
        pd.to_numeric(X[col], errors="coerce").median())

encoders = {}
for col in X.select_dtypes(include="object").columns:
    le = LabelEncoder()
    X[col] = le.fit_transform(X[col].astype(str))
    encoders[col] = {"classes": le.classes_.tolist(),
                     "mapping": {c:int(i) for i,c in enumerate(le.classes_)}}

y        = df["chemotherapy_cycles"].values
y_bucket = np.array(["0-Continuous" if c==0 else
                      "1-3" if c<=3 else
                      "4-6" if c<=6 else
                      "7-9" if c<=9 else "10+" for c in y])

X_tr, X_te, y_tr, y_te   = train_test_split(X, y,        test_size=0.2, random_state=42)
_,    _,    yb_tr, yb_te  = train_test_split(X, y_bucket, test_size=0.2, random_state=42)

rf = RandomForestClassifier(
    n_estimators=300, max_depth=22, min_samples_leaf=3,
    n_jobs=-1, random_state=42, class_weight="balanced")
rf.fit(X_tr, y_tr)

rf_b = RandomForestClassifier(
    n_estimators=300, max_depth=22, min_samples_leaf=3,
    n_jobs=-1, random_state=42, class_weight="balanced")
rf_b.fit(X_tr, yb_tr)

acc   = accuracy_score(y_te,  rf.predict(X_te))
acc_b = accuracy_score(yb_te, rf_b.predict(X_te))
print(f"  Exact accuracy  : {acc:.4f} ({acc*100:.1f}%)")
print(f"  Bucket accuracy : {acc_b:.4f} ({acc_b*100:.1f}%)")

# ── model_rules — per (cancer, stage) lookup ──────────────────────────────────
print("  Extracting model rules...")
model_rules = {}
for ct in df["cancer_type"].unique():
    model_rules[ct] = {}
    for st in ["I","II","III","IV"]:
        sample = df[(df.cancer_type==ct)&(df.stage==st)].head(600)
        if len(sample)==0: continue
        Xs = sample[FEATURES].copy()
        for col in Xs.select_dtypes(include="object").columns:
            Xs[col] = Xs[col].map(encoders[col]["mapping"]).fillna(0).astype(int)
        for col in ["age","ecog_ps","charlson_score","ki67_score"]:
            Xs[col] = pd.to_numeric(Xs[col],errors="coerce").fillna(0)
        preds    = np.array(rf.predict(Xs), dtype=int)
        mode_c   = Counter(preds).most_common(1)[0][0]
        mean_c   = round(float(np.mean(preds)),1)
        top_reg  = sample["recommended_regimen"].value_counts().idxmax()
        model_rules[ct][st] = {
            "predicted_cycles_mode": int(mode_c),
            "predicted_cycles_mean": mean_c,
            "top_regimen":           top_reg,
            "sample_count":          len(sample),
        }

# Validate Momtaz Begum stage IIB lookup
print(f"  Breast Stage II lookup: {model_rules.get('Breast Cancer',{}).get('II',{})}")
# Validate brain tumor lookup
gbm_rule = model_rules.get("Glioblastoma (GBM)",{}).get("IV",{})
lgg_rule  = model_rules.get("Lower Grade Glioma",{}).get("II",{})
print(f"  GBM Stage IV lookup  : {gbm_rule}")
print(f"  LGG Stage II lookup  : {lgg_rule}")

importances = dict(sorted(
    zip(FEATURES, rf.feature_importances_.tolist()),
    key=lambda x:x[1], reverse=True))

cycle_dist  = df["chemotherapy_cycles"].value_counts().sort_index().to_dict()
stage_dist  = df["stage"].value_counts().to_dict()
cancer_dist = df["cancer_type"].value_counts().to_dict()

crc_df = df[df.cancer_type=="Colorectal Cancer"]
brain_df = df[df.cancer_type.isin(["Glioblastoma (GBM)","Lower Grade Glioma",
    "Oligodendroglioma","Meningioma","Brain Metastasis","Medulloblastoma","Ependymoma"])]
dataset_stats = {
    "total_patients":    len(df),
    "accuracy":          round(acc,4),
    "accuracy_bucket":   round(acc_b,4),
    "cancer_types":      df["cancer_type"].nunique(),
    "unique_regimens":   df["recommended_regimen"].nunique(),
    "stage_distribution":{k:int(v) for k,v in stage_dist.items()},
    "top_cancers":       {k:int(v) for k,v in list(cancer_dist.items())[:15]},
    "cycle_distribution":{str(k):int(v) for k,v in cycle_dist.items()},
    "mean_cycles":       round(float(df["chemotherapy_cycles"].mean()),2),
    "median_cycles":     int(df["chemotherapy_cycles"].median()),
    "features_used":     FEATURES,
    "brain_tumor_stats": {
        "total":             len(brain_df),
        "gbm":               int((brain_df.cancer_type=="Glioblastoma (GBM)").sum()),
        "lgg":               int((brain_df.cancer_type=="Lower Grade Glioma").sum()),
        "oligodendroglioma": int((brain_df.cancer_type=="Oligodendroglioma").sum()),
        "meningioma":        int((brain_df.cancer_type=="Meningioma").sum()),
        "idh_mutated":       int((brain_df.idh_status=="Mutated").sum()),
        "mgmt_methylated":   int((brain_df.mgmt_status=="Methylated").sum()),
        "tert_mutated":      int((brain_df.tert_status=="Mutated").sum()),
        "codeletion_present":int((brain_df.codeletion_1p19q=="Co-deleted").sum()),
    },
    "crc_stats": {
        "total":         len(crc_df),
        "kras_mutated":  int((crc_df.kras_status=="Mutated").sum()),
        "mmr_msi_h":     int((crc_df.mmr_msi_status=="MSI-H").sum()),
        "mss":           int((crc_df.mmr_msi_status=="MSS").sum()),
        "stage_dist":    crc_df["stage"].value_counts().to_dict(),
    },
}

label_maps = {"features": FEATURES, "encoders": encoders,
              "cycle_range":{"min":int(df.chemotherapy_cycles.min()),
                             "max":int(df.chemotherapy_cycles.max())}}

for fname, obj in [
    ("model_rules.json",        model_rules),
    ("label_maps.json",         label_maps),
    ("feature_importance.json", importances),
    ("dataset_stats.json",      dataset_stats),
]:
    with open(os.path.join(OUT_DIR,fname),"w") as f:
        json.dump(obj, f, indent=2)
    print(f"  Saved {fname}")

print(f"\n  Done — {len(df):,} patients · {len(FEATURES)} features · {acc_b*100:.1f}% bucket accuracy")
