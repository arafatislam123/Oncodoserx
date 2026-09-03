/**
 * OncoDoseRx — Learning Store
 * ===========================
 * Persistence for the continuous-learning loop:
 *
 *   treatment_decisions   what the clinician actually decided for a patient,
 *                         alongside what the model had predicted — the raw
 *                         material of the feedback loop and the clinical audit
 *                         trail (a decision is never deleted or rewritten).
 *
 *   training_contributions which of those decisions became a training row, its
 *                         fingerprint (for de-duplication) and which retraining
 *                         run consumed it. A row stays `pending` until a run
 *                         that included it is promoted.
 *
 *   model_versions        every retraining attempt: dataset size, resulting
 *                         accuracy, and whether it was promoted or rolled back.
 *                         Without this there is no way to tell whether the loop
 *                         is improving the model or quietly degrading it.
 */

"use strict";

const { v4: uuidv4 } = require("uuid");
const db = require("./database");

async function initLearningTables() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS treatment_decisions (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      report_id TEXT,
      cancer_type TEXT,
      stage TEXT,
      -- What the clinician signed off on. This is the training label.
      decided_regimen TEXT NOT NULL,
      decided_cycles INTEGER NOT NULL,
      treatment_intent TEXT,
      prior_treatment TEXT,
      -- What the model had proposed, kept so override rate is measurable.
      model_regimen TEXT,
      model_cycles INTEGER,
      overrode_model INTEGER DEFAULT 0,
      nccn_concordance TEXT,
      nccn_reference TEXT,
      nccn_message TEXT,
      decided_by TEXT,
      clinical_notes TEXT,
      outcome TEXT,
      parsed_snapshot TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS training_contributions (
      id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL,
      dataset_patient_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL UNIQUE,
      sample_weight REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'trained')),
      model_version INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (decision_id) REFERENCES treatment_decisions(id)
    );

    CREATE TABLE IF NOT EXISTS model_versions (
      version INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'promoted', 'rejected', 'failed')),
      trigger TEXT,
      dataset_rows INTEGER,
      clinical_rows INTEGER,
      accuracy REAL,
      accuracy_bucket REAL,
      previous_accuracy_bucket REAL,
      duration_ms INTEGER,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_decisions_patient ON treatment_decisions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_contrib_status ON training_contributions(status);
  `);
}

// ── Treatment decisions ───────────────────────────────────────────────────────

async function createDecision(data) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO treatment_decisions
      (id, patient_id, report_id, cancer_type, stage, decided_regimen, decided_cycles,
       treatment_intent, prior_treatment, model_regimen, model_cycles, overrode_model,
       nccn_concordance, nccn_reference, nccn_message, decided_by, clinical_notes,
       outcome, parsed_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.patient_id || null,
      data.report_id || null,
      data.cancer_type || null,
      data.stage || null,
      data.decided_regimen,
      data.decided_cycles,
      data.treatment_intent || null,
      data.prior_treatment || null,
      data.model_regimen || null,
      data.model_cycles ?? null,
      data.overrode_model ? 1 : 0,
      data.nccn_concordance || null,
      data.nccn_reference || null,
      data.nccn_message || null,
      data.decided_by || null,
      data.clinical_notes || null,
      data.outcome || null,
      data.parsed_snapshot ? JSON.stringify(data.parsed_snapshot) : null,
    ]
  );
  return db.queryOne("SELECT * FROM treatment_decisions WHERE id = ?", [id]);
}

async function getDecisionsByPatient(patientId) {
  return db.query(
    "SELECT * FROM treatment_decisions WHERE patient_id = ? ORDER BY created_at DESC",
    [patientId]
  );
}

async function getRecentDecisions(limit = 20) {
  return db.query(
    `SELECT d.*, c.dataset_patient_id, c.status AS contribution_status
     FROM treatment_decisions d
     LEFT JOIN training_contributions c ON c.decision_id = d.id
     ORDER BY d.created_at DESC LIMIT ?`,
    [limit]
  );
}

// ── Training contributions ────────────────────────────────────────────────────

async function findContributionByFingerprint(fingerprint) {
  return db.queryOne(
    "SELECT * FROM training_contributions WHERE fingerprint = ?",
    [fingerprint]
  );
}

async function createContribution({ decisionId, datasetPatientId, fingerprint, sampleWeight }) {
  const id = uuidv4();
  await db.query(
    `INSERT INTO training_contributions
       (id, decision_id, dataset_patient_id, fingerprint, sample_weight)
     VALUES (?, ?, ?, ?, ?)`,
    [id, decisionId, datasetPatientId, fingerprint, sampleWeight]
  );
  return db.queryOne("SELECT * FROM training_contributions WHERE id = ?", [id]);
}

async function pendingContributionCount() {
  const row = await db.queryOne(
    "SELECT COUNT(*) AS n FROM training_contributions WHERE status = 'pending'"
  );
  return row?.n || 0;
}

async function markContributionsTrained(version) {
  return db.query(
    "UPDATE training_contributions SET status = 'trained', model_version = ? WHERE status = 'pending'",
    [version]
  );
}

// ── Model versions ────────────────────────────────────────────────────────────

async function startModelVersion({ trigger, datasetRows, clinicalRows, previousAccuracyBucket }) {
  const result = await db.query(
    `INSERT INTO model_versions
       (status, trigger, dataset_rows, clinical_rows, previous_accuracy_bucket)
     VALUES ('running', ?, ?, ?, ?)`,
    [trigger || "manual", datasetRows ?? null, clinicalRows ?? null, previousAccuracyBucket ?? null]
  );
  const version = Number(result.lastInsertRowid);
  return db.queryOne("SELECT * FROM model_versions WHERE version = ?", [version]);
}

async function finishModelVersion(version, { status, accuracy, accuracyBucket, durationMs, message }) {
  await db.query(
    `UPDATE model_versions
        SET status = ?, accuracy = ?, accuracy_bucket = ?, duration_ms = ?,
            message = ?, completed_at = CURRENT_TIMESTAMP
      WHERE version = ?`,
    [status, accuracy ?? null, accuracyBucket ?? null, durationMs ?? null, message || null, version]
  );
  return db.queryOne("SELECT * FROM model_versions WHERE version = ?", [version]);
}

async function getLatestPromotedVersion() {
  return db.queryOne(
    "SELECT * FROM model_versions WHERE status = 'promoted' ORDER BY version DESC LIMIT 1"
  );
}

async function getRunningVersion() {
  return db.queryOne(
    "SELECT * FROM model_versions WHERE status = 'running' ORDER BY version DESC LIMIT 1"
  );
}

async function getModelVersions(limit = 10) {
  return db.query("SELECT * FROM model_versions ORDER BY version DESC LIMIT ?", [limit]);
}

// ── Aggregate learning stats ──────────────────────────────────────────────────

async function getLearningStats() {
  const decisions = await db.queryOne("SELECT COUNT(*) AS n FROM treatment_decisions");
  const overrides = await db.queryOne(
    "SELECT COUNT(*) AS n FROM treatment_decisions WHERE overrode_model = 1"
  );
  const contributed = await db.queryOne("SELECT COUNT(*) AS n FROM training_contributions");
  const concordance = await db.query(
    `SELECT nccn_concordance AS level, COUNT(*) AS n
       FROM treatment_decisions
      WHERE nccn_concordance IS NOT NULL
      GROUP BY nccn_concordance`
  );

  const total = decisions?.n || 0;
  return {
    totalDecisions:   total,
    overrides:        overrides?.n || 0,
    overrideRate:     total > 0 ? Number(((overrides?.n || 0) / total).toFixed(3)) : null,
    contributedRows:  contributed?.n || 0,
    pendingRows:      await pendingContributionCount(),
    concordance:      Object.fromEntries(concordance.map((r) => [r.level, r.n])),
  };
}

module.exports = {
  initLearningTables,
  createDecision,
  getDecisionsByPatient,
  getRecentDecisions,
  findContributionByFingerprint,
  createContribution,
  pendingContributionCount,
  markContributionsTrained,
  startModelVersion,
  finishModelVersion,
  getLatestPromotedVersion,
  getRunningVersion,
  getModelVersions,
  getLearningStats,
};
