#!/usr/bin/env python
"""
OncoDoseRx — Incremental Retraining
===================================
Retrains the chemotherapy-cycle model on `data/cancer_patients.csv` *as it
currently stands on disk*, including the real clinical cases the app has
appended to it since the last run.

This is deliberately a different script from `ml/generate_and_train.py`.
That one REGENERATES the synthetic corpus from scratch and overwrites the CSV —
running it after clinicians have contributed cases would erase every real row.
This one only ever reads the CSV.

Real cases are identified by their `RW-` patient_id prefix and are up-weighted,
because a few hundred real rows would otherwise be statistically invisible next
to 150,000 synthetic ones. Per-row weights (which encode NCCN concordance) are
read from `data/clinical_contributions.csv` when present.

Artefacts are written to a staging directory, never straight over the live
model. The Node side reads the JSON summary printed on the last line of stdout
and decides whether to promote them.

Usage:
    python ml/retrain_from_dataset.py --out data/models/v3 [--trees 300]
"""

import argparse
import json
import os
import sys
import time
from collections import Counter

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
DATASET_CSV = os.path.join(DATA_DIR, "cancer_patients.csv")
CONTRIB_CSV = os.path.join(DATA_DIR, "clinical_contributions.csv")

# Superset of every feature the model has ever used. Only the columns actually
# present in the CSV are used, so an older corpus (no brain-tumour columns) and
# a newer one both train without the script needing to change.
CANDIDATE_FEATURES = [
    "age", "gender",
    "cancer_type", "stage", "grade",
    "t_stage", "n_stage", "m_stage",
    "her2_status", "er_status", "pr_status", "hr_status", "ki67_score",
    "egfr_status", "pdl1_status",
    "kras_status", "nras_status", "braf_status",
    "mmr_msi_status", "brca_status",
    "idh_status", "mgmt_status", "codeletion_1p19q",
    "tert_status", "atrx_status", "who_cns_grade", "extent_resection",
    "lvi", "pni", "depth_of_invasion", "primary_site",
    "ecog_ps", "charlson_score", "prior_treatment", "treatment_intent",
]

NUMERIC_FEATURES = {
    "age", "ecog_ps", "charlson_score", "ki67_score", "who_cns_grade",
    "cea_value", "tumour_size_cm", "lymph_nodes_positive", "lymph_nodes_total",
}

TARGET = "chemotherapy_cycles"
LABEL = "recommended_regimen"

# Default multiplier for a real clinical row relative to a synthetic one.
DEFAULT_CLINICAL_WEIGHT = 25.0


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def cycle_bucket(c):
    if c == 0:
        return "0-Continuous"
    if c <= 3:
        return "1-3"
    if c <= 6:
        return "4-6"
    if c <= 9:
        return "7-9"
    return "10+"


def load_sample_weights(df, base_weight):
    """
    Weight vector aligned to df.index: 1.0 for synthetic rows, `base_weight`
    (scaled by the row's NCCN-concordance factor when known) for clinical ones.
    """
    weights = np.ones(len(df), dtype=float)
    is_clinical = df["patient_id"].astype(str).str.startswith("RW-").to_numpy()
    weights[is_clinical] = base_weight

    if os.path.exists(CONTRIB_CSV):
        try:
            contrib = pd.read_csv(CONTRIB_CSV, usecols=["patient_id", "sample_weight"],
                                  keep_default_na=False)
            per_row = dict(zip(contrib["patient_id"].astype(str),
                               pd.to_numeric(contrib["sample_weight"], errors="coerce")))
            ids = df["patient_id"].astype(str).to_numpy()
            for i in np.flatnonzero(is_clinical):
                w = per_row.get(ids[i])
                if w is not None and np.isfinite(w) and w > 0:
                    weights[i] = float(w)
        except (ValueError, KeyError) as exc:
            log(f"  [warn] could not read per-row weights from contributions file: {exc}")

    return weights, int(is_clinical.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="staging directory for the artefacts")
    ap.add_argument("--trees", type=int, default=300)
    ap.add_argument("--max-depth", type=int, default=22)
    ap.add_argument("--clinical-weight", type=float, default=DEFAULT_CLINICAL_WEIGHT)
    ap.add_argument("--csv", default=DATASET_CSV)
    args = ap.parse_args()

    started = time.time()
    os.makedirs(args.out, exist_ok=True)

    # The provenance sidecar always sits next to the corpus it describes, so a
    # run pointed at an alternate --csv picks up that copy of the weights.
    global CONTRIB_CSV
    CONTRIB_CSV = os.path.join(os.path.dirname(os.path.abspath(args.csv)),
                               "clinical_contributions.csv")

    log(f"Reading {args.csv} ...")
    # keep_default_na=False so the generator's literal "N/A" ("this field does
    # not apply to this cancer") stays a category instead of collapsing into the
    # same NaN as a genuinely absent value.
    df = pd.read_csv(args.csv, low_memory=False, keep_default_na=False)
    log(f"  {len(df):,} rows x {len(df.columns)} columns")

    missing_core = [c for c in ("patient_id", TARGET, LABEL, "cancer_type", "stage")
                    if c not in df.columns]
    if missing_core:
        raise SystemExit(f"Dataset is missing required columns: {missing_core}")

    # Drop rows without a usable label — a contributed row that somehow lost its
    # cycle count must not become a training example.
    before = len(df)
    df = df[pd.to_numeric(df[TARGET], errors="coerce").notna()].copy()
    df[TARGET] = pd.to_numeric(df[TARGET]).astype(int)
    if len(df) < before:
        log(f"  dropped {before - len(df):,} rows with an unusable cycle label")

    features = [c for c in CANDIDATE_FEATURES if c in df.columns]
    log(f"  using {len(features)} features")

    weights, clinical_rows = load_sample_weights(df, args.clinical_weight)
    log(f"  {clinical_rows:,} real clinical rows (weight up to {weights.max():.1f}x)")

    X = df[features].copy()
    for col in features:
        if col in NUMERIC_FEATURES:
            X[col] = pd.to_numeric(X[col], errors="coerce")
            X[col] = X[col].fillna(X[col].median())

    # Everything that did not coerce to a number is categorical. Checking the
    # dtype directly (rather than select_dtypes) keeps this correct across the
    # pandas 2 -> 3 change in how string columns are reported.
    encoders = {}
    for col in features:
        if pd.api.types.is_numeric_dtype(X[col]):
            continue
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))
        encoders[col] = {
            "classes": le.classes_.tolist(),
            "mapping": {c: int(i) for i, c in enumerate(le.classes_)},
        }

    y = df[TARGET].to_numpy()
    y_bucket = np.array([cycle_bucket(c) for c in y])

    # A single split shared by both models, so the two accuracies are comparable
    # and no test row leaks into either training set.
    idx = np.arange(len(df))
    idx_tr, idx_te = train_test_split(idx, test_size=0.2, random_state=42)
    X_tr, X_te = X.iloc[idx_tr], X.iloc[idx_te]
    w_tr = weights[idx_tr]

    log(f"Training on {len(idx_tr):,} rows ({args.trees} trees) ...")
    rf = RandomForestClassifier(
        n_estimators=args.trees, max_depth=args.max_depth, min_samples_leaf=3,
        n_jobs=-1, random_state=42, class_weight="balanced")
    rf.fit(X_tr, y[idx_tr], sample_weight=w_tr)

    rf_b = RandomForestClassifier(
        n_estimators=args.trees, max_depth=args.max_depth, min_samples_leaf=3,
        n_jobs=-1, random_state=42, class_weight="balanced")
    rf_b.fit(X_tr, y_bucket[idx_tr], sample_weight=w_tr)

    acc = float(accuracy_score(y[idx_te], rf.predict(X_te)))
    acc_b = float(accuracy_score(y_bucket[idx_te], rf_b.predict(X_te)))
    log(f"  exact accuracy  : {acc*100:.1f}%")
    log(f"  bucket accuracy : {acc_b*100:.1f}%")

    # Accuracy on the clinical rows alone. This is the number that actually says
    # whether the loop is learning from doctors — overall accuracy is dominated
    # by the 150k synthetic rows and barely moves.
    clinical_mask_te = df["patient_id"].astype(str).str.startswith("RW-").to_numpy()[idx_te]
    clinical_acc = None
    if clinical_mask_te.sum() >= 5:
        clinical_acc = float(accuracy_score(
            y_bucket[idx_te][clinical_mask_te],
            rf_b.predict(X_te[clinical_mask_te])))
        log(f"  bucket accuracy on real cases : {clinical_acc*100:.1f}% "
            f"({int(clinical_mask_te.sum())} held-out real rows)")

    # ── model_rules: the (cancer, stage) lookup the Node predictor reads ───────
    log("Extracting model rules ...")
    model_rules = {}
    for ct in df["cancer_type"].dropna().unique():
        stages = {}
        for st in ["I", "II", "III", "IV"]:
            sample = df[(df.cancer_type == ct) & (df.stage == st)]
            if len(sample) == 0:
                continue
            # Real cases are the most informative rows for this cell, so they go
            # in first and are never truncated away by the 600-row cap.
            real = sample[sample["patient_id"].astype(str).str.startswith("RW-")]
            synth = sample.drop(real.index).head(max(0, 600 - len(real)))
            sample = pd.concat([real, synth]) if len(real) else synth

            Xs = sample[features].copy()
            for col in Xs.columns:
                if col in encoders:
                    Xs[col] = Xs[col].astype(str).map(encoders[col]["mapping"]).fillna(0).astype(int)
                else:
                    Xs[col] = pd.to_numeric(Xs[col], errors="coerce").fillna(0)
            preds = np.array(rf.predict(Xs), dtype=int)
            stages[st] = {
                "predicted_cycles_mode": int(Counter(preds).most_common(1)[0][0]),
                "predicted_cycles_mean": round(float(np.mean(preds)), 1),
                "top_regimen": sample[LABEL].value_counts().idxmax(),
                "sample_count": int(len(sample)),
                "clinical_cases": int(len(real)),
            }
        if stages:
            model_rules[ct] = stages

    importances = dict(sorted(
        zip(features, rf.feature_importances_.tolist()),
        key=lambda kv: kv[1], reverse=True))

    cancer_dist = df["cancer_type"].value_counts()
    dataset_stats = {
        "total_patients": int(len(df)),
        "clinical_patients": int(clinical_rows),
        "accuracy": round(acc, 4),
        "accuracy_bucket": round(acc_b, 4),
        "clinical_accuracy_bucket": round(clinical_acc, 4) if clinical_acc is not None else None,
        "cancer_types": int(df["cancer_type"].nunique()),
        "unique_regimens": int(df[LABEL].nunique()),
        "stage_distribution": {k: int(v) for k, v in df["stage"].value_counts().items()},
        "top_cancers": {k: int(v) for k, v in cancer_dist.head(15).items()},
        "cycle_distribution": {str(k): int(v) for k, v in df[TARGET].value_counts().sort_index().items()},
        "mean_cycles": round(float(df[TARGET].mean()), 2),
        "median_cycles": int(df[TARGET].median()),
        "features_used": features,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "SEER Program / NCCN Guidelines / ACS Cancer Statistics 2023 + clinician-confirmed cases",
    }

    label_maps = {
        "features": features,
        "encoders": encoders,
        "cycle_range": {"min": int(df[TARGET].min()), "max": int(df[TARGET].max())},
    }

    for fname, obj in [
        ("model_rules.json", model_rules),
        ("label_maps.json", label_maps),
        ("feature_importance.json", importances),
        ("dataset_stats.json", dataset_stats),
    ]:
        with open(os.path.join(args.out, fname), "w", encoding="utf-8") as fh:
            json.dump(obj, fh, indent=2)
        log(f"  wrote {fname}")

    duration_ms = int((time.time() - started) * 1000)
    # The Node side parses this last stdout line; everything else goes to stderr.
    print(json.dumps({
        "ok": True,
        "out": args.out,
        "datasetRows": int(len(df)),
        "clinicalRows": int(clinical_rows),
        "accuracy": round(acc, 4),
        "accuracyBucket": round(acc_b, 4),
        "clinicalAccuracyBucket": round(clinical_acc, 4) if clinical_acc is not None else None,
        "cancerTypes": int(df["cancer_type"].nunique()),
        "durationMs": duration_ms,
    }))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — the message is the Node-side error
        print(json.dumps({"ok": False, "error": f"{type(exc).__name__}: {exc}"}))
        sys.exit(1)
