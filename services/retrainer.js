/**
 * OncoDoseRx — Retrainer
 * ======================
 * Drives `ml/retrain_from_dataset.py` and decides whether its output replaces
 * the live model.
 *
 * The safety properties that matter here:
 *
 *  - **Single flight.** Only one training run at a time. Two concurrent runs
 *    would race to write the same four JSON files and could leave the live
 *    model half-updated.
 *
 *  - **Staged, then promoted.** Python writes into `data/models/v<N>/` and
 *    never touches the live artefacts. Node copies them into `data/` only after
 *    checking the accuracy, and backs up the outgoing model first, so a bad run
 *    can be rolled back.
 *
 *  - **Accuracy gate.** A run whose bucket accuracy drops more than
 *    ACCURACY_TOLERANCE below the current model is rejected, not promoted. A
 *    learning loop with no gate can only degrade — one batch of mistyped
 *    decisions would permanently move the model and nothing would notice.
 *
 *  - **Hot reload.** After promotion the in-process artefact cache is dropped,
 *    so the next prediction already uses the new model.
 */

"use strict";

const { spawn } = require("child_process");
const fs   = require("fs");
const path = require("path");

const { reloadArtefacts } = require("../engine/ml_predictor");
const learningStore = require("./learningStore");
const datasetWriter = require("./datasetWriter");

const ROOT       = path.join(__dirname, "..");
const DATA_DIR   = process.env.DATA_DIR || path.join(ROOT, "data");
const MODELS_DIR = path.join(DATA_DIR, "models");
const SCRIPT     = path.join(ROOT, "ml", "retrain_from_dataset.py");

const ARTEFACTS = [
  "model_rules.json",
  "label_maps.json",
  "feature_importance.json",
  "dataset_stats.json",
];

// New clinical cases needed before a run kicks off on its own. Kept low so the
// loop visibly moves early on — the accuracy gate, not the batch size, is what
// stops a bad run being promoted, so frequent small runs cost little.
const RETRAIN_THRESHOLD = Number(process.env.RETRAIN_THRESHOLD) || 10;

// How far bucket accuracy may fall before a run is rejected. Small runs move
// the number by fractions of a percent in either direction from resampling
// alone, so a strict "must not decrease" rule would reject good models.
const ACCURACY_TOLERANCE = Number(process.env.RETRAIN_ACCURACY_TOLERANCE) || 0.01;

const AUTO_RETRAIN = process.env.AUTO_RETRAIN !== "false";

let running = null;      // Promise of the in-flight run, or null
let lastResult = null;   // summary of the most recent finished run

/**
 * Python interpreter to use. A project venv wins over whatever `python` happens
 * to be on PATH, so the training deps stay isolated from the system install.
 */
function pythonBin() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const candidates = [
    path.join(ROOT, "ml", "venv", "Scripts", "python.exe"),
    path.join(ROOT, "ml", "venv", "bin", "python"),
    path.join(ROOT, "venv", "Scripts", "python.exe"),
    path.join(ROOT, "venv", "bin", "python"),
  ];
  return candidates.find((c) => fs.existsSync(c))
    || (process.platform === "win32" ? "python" : "python3");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function currentAccuracyBucket() {
  const stats = readJson(path.join(DATA_DIR, "dataset_stats.json"));
  return stats && typeof stats.accuracy_bucket === "number" ? stats.accuracy_bucket : null;
}

/** Runs the Python script, resolving with its JSON summary line. */
function runPython(outDir) {
  return new Promise((resolve, reject) => {
    const bin  = pythonBin();
    const args = [
      SCRIPT,
      "--out", outDir,
      "--csv", datasetWriter.DATASET_CSV,
      "--clinical-weight", String(datasetWriter.DEFAULT_SAMPLE_WEIGHT),
    ];
    if (process.env.RETRAIN_TREES) args.push("--trees", String(process.env.RETRAIN_TREES));

    console.log(`  [retrain] ${bin} ${args.join(" ")}`);
    const child = spawn(bin, args, { cwd: ROOT });

    let stdout = "";
    let stderrTail = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => {
      const text = d.toString();
      // Keep only the tail — a full training log is thousands of lines.
      stderrTail = (stderrTail + text).slice(-4000);
      text.split("\n").filter(Boolean).forEach((l) => console.log(`  [retrain] ${l}`));
    });

    child.on("error", (err) =>
      reject(new Error(
        `Could not start Python ("${bin}"): ${err.message}. ` +
        "Set PYTHON_BIN to an interpreter with pandas, numpy and scikit-learn installed."
      ))
    );

    child.on("close", (code) => {
      const lastLine = stdout.trim().split("\n").filter(Boolean).pop() || "";
      let summary = null;
      try { summary = JSON.parse(lastLine); } catch { /* not JSON */ }

      if (summary && summary.ok === false) return reject(new Error(summary.error));
      if (code !== 0) {
        return reject(new Error(
          `Retraining exited with code ${code}. Last output:\n${stderrTail.slice(-800)}`
        ));
      }
      if (!summary) return reject(new Error("Retraining produced no result summary."));
      resolve(summary);
    });
  });
}

/** Copies the staged artefacts over the live ones, backing the live set up first. */
function promote(stageDir, version) {
  const backupDir = path.join(MODELS_DIR, `backup-before-v${version}`);
  fs.mkdirSync(backupDir, { recursive: true });

  for (const name of ARTEFACTS) {
    const live = path.join(DATA_DIR, name);
    if (fs.existsSync(live)) fs.copyFileSync(live, path.join(backupDir, name));
  }
  // Copy in only after every backup succeeded, so a mid-loop failure cannot
  // leave the live model as a mix of two versions.
  for (const name of ARTEFACTS) {
    const staged = path.join(stageDir, name);
    if (fs.existsSync(staged)) fs.copyFileSync(staged, path.join(DATA_DIR, name));
  }
  return backupDir;
}

/**
 * Runs one retraining cycle end to end.
 * @param {string} trigger  "auto" | "manual" | "startup"
 */
async function retrain(trigger = "manual") {
  if (running) {
    return { started: false, alreadyRunning: true, message: "A retraining run is already in progress." };
  }

  const task = (async () => {
    const previousAccuracyBucket = currentAccuracyBucket();
    const pending = await learningStore.pendingContributionCount();

    const versionRow = await learningStore.startModelVersion({
      trigger,
      datasetRows: datasetWriter.datasetRowCount(),
      clinicalRows: datasetWriter.contributionCount(),
      previousAccuracyBucket,
    });
    const version = versionRow.version;
    const stageDir = path.join(MODELS_DIR, `v${version}`);

    try {
      const summary = await runPython(stageDir);

      const regression = previousAccuracyBucket !== null
        && summary.accuracyBucket < previousAccuracyBucket - ACCURACY_TOLERANCE;

      if (regression) {
        const message =
          `Rejected: bucket accuracy fell from ${(previousAccuracyBucket * 100).toFixed(2)}% ` +
          `to ${(summary.accuracyBucket * 100).toFixed(2)}%, beyond the ` +
          `${(ACCURACY_TOLERANCE * 100).toFixed(1)}% tolerance. The live model was left unchanged ` +
          `and the candidate is kept at ${path.relative(ROOT, stageDir)} for inspection.`;
        await learningStore.finishModelVersion(version, {
          status: "rejected",
          accuracy: summary.accuracy,
          accuracyBucket: summary.accuracyBucket,
          durationMs: summary.durationMs,
          message,
        });
        console.warn(`  [retrain] ${message}`);
        return { version, promoted: false, ...summary, message };
      }

      promote(stageDir, version);
      const reloaded = reloadArtefacts();
      await learningStore.markContributionsTrained(version);

      const message =
        `Promoted model v${version} — ${summary.datasetRows.toLocaleString()} rows ` +
        `(${summary.clinicalRows} clinician-confirmed), bucket accuracy ` +
        `${(summary.accuracyBucket * 100).toFixed(2)}%.`;
      await learningStore.finishModelVersion(version, {
        status: "promoted",
        accuracy: summary.accuracy,
        accuracyBucket: summary.accuracyBucket,
        durationMs: summary.durationMs,
        message,
      });
      console.log(`  [retrain] ${message}`);

      return { version, promoted: true, pendingConsumed: pending, reloaded, ...summary, message };
    } catch (err) {
      await learningStore.finishModelVersion(version, {
        status: "failed",
        message: err.message,
      });
      console.error(`  [retrain] failed: ${err.message}`);
      throw err;
    }
  })();

  running = task;
  try {
    lastResult = await task;
    return { started: true, ...lastResult };
  } finally {
    running = null;
  }
}

/**
 * Called after each contribution. Starts a run in the background once enough
 * new cases have accumulated; the HTTP request that triggered it does not wait.
 */
async function maybeRetrain() {
  if (!AUTO_RETRAIN || running) return { triggered: false };
  const pending = await learningStore.pendingContributionCount();
  if (pending < RETRAIN_THRESHOLD) {
    return { triggered: false, pending, threshold: RETRAIN_THRESHOLD };
  }
  retrain("auto").catch((err) => console.error("  [retrain] auto run failed:", err.message));
  return { triggered: true, pending, threshold: RETRAIN_THRESHOLD };
}

async function status() {
  const [stats, latest, versions] = await Promise.all([
    learningStore.getLearningStats(),
    learningStore.getLatestPromotedVersion(),
    learningStore.getModelVersions(10),
  ]);
  const datasetStats = readJson(path.join(DATA_DIR, "dataset_stats.json")) || {};

  return {
    autoRetrain: AUTO_RETRAIN,
    isRunning: running !== null,
    threshold: RETRAIN_THRESHOLD,
    accuracyTolerance: ACCURACY_TOLERANCE,
    clinicalSampleWeight: datasetWriter.DEFAULT_SAMPLE_WEIGHT,
    dataset: {
      totalRows: datasetWriter.datasetRowCount(),
      clinicalRows: datasetWriter.contributionCount(),
      trainedRows: datasetStats.total_patients ?? null,
      cancerTypes: datasetStats.cancer_types ?? null,
      accuracy: datasetStats.accuracy ?? null,
      accuracyBucket: datasetStats.accuracy_bucket ?? null,
      clinicalAccuracyBucket: datasetStats.clinical_accuracy_bucket ?? null,
      trainedAt: datasetStats.trained_at ?? null,
    },
    learning: stats,
    currentVersion: latest || null,
    lastRun: lastResult,
    history: versions,
  };
}

module.exports = {
  retrain,
  maybeRetrain,
  status,
  pythonBin,
  RETRAIN_THRESHOLD,
  ACCURACY_TOLERANCE,
};
