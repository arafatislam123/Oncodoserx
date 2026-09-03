/**
 * OncoDoseRx — Database Service
 * SQLite integration for patient and report storage
 */

"use strict";

const Database = require("better-sqlite3");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const fs = require("fs");

let db = null;

function getDb() {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "oncodoserx.db");
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

function query(sql, params = []) {
  const db = getDb();
  try {
    const stmt = db.prepare(sql);
    if (sql.trim().toLowerCase().startsWith("select") || sql.includes("RETURNING")) {
      return stmt.all(...params);
    }
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

// Multi-statement DDL — `query()` goes through prepare(), which only accepts a
// single statement, so schema blocks (e.g. learningStore's tables) come here.
function exec(sql) {
  getDb().exec(sql);
}

function queryOne(sql, params = []) {
  const db = getDb();
  try {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

// Patient operations
function createPatient(patientData) {
  const { first_name, last_name, date_of_birth, gender, height_cm, weight_kg } = patientData;
  const id = uuidv4();
  const sql = `INSERT INTO patients (id, first_name, last_name, date_of_birth, gender, height_cm, weight_kg)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  query(sql, [id, first_name, last_name, date_of_birth, gender, height_cm || null, weight_kg || null]);
  return getPatient(id);
}

function getPatient(id) {
  return queryOne(
    "SELECT id, first_name, last_name, date_of_birth, gender, height_cm, weight_kg, created_at, updated_at FROM patients WHERE id = ?",
    [id]
  );
}

function getAllPatients(limit = 100, offset = 0) {
  return query(
    "SELECT id, first_name, last_name, date_of_birth, gender, height_cm, weight_kg, created_at FROM patients ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
}

function updatePatient(id, updates) {
  const setClause = [];
  const values = [];

  for (const [key, value] of Object.entries(updates)) {
    setClause.push(`${key} = ?`);
    values.push(value);
  }

  if (setClause.length === 0) return getPatient(id);

  setClause.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  const sql = `UPDATE patients SET ${setClause.join(", ")} WHERE id = ?`;
  query(sql, values);
  return getPatient(id);
}

function deletePatient(id) {
  const sql = "DELETE FROM patients WHERE id = ?";
  const result = query(sql, [id]);
  return result.changes > 0;
}

// Async wrappers for compatibility with existing async/await code
const async = (fn) => (...args) => Promise.resolve(fn(...args));

// Report operations
function createReport(reportData) {
  const { patient_id, filename, file_path, report_type, processing_status, extracted_text } = reportData;
  const id = uuidv4();
  const sql = `INSERT INTO reports (id, patient_id, filename, file_path, report_type, processing_status, extracted_text)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  query(sql, [id, patient_id, filename, file_path, report_type, processing_status, extracted_text || null]);
  return getReport(id);
}

function getReport(id) {
  return queryOne("SELECT * FROM reports WHERE id = ?", [id]);
}

function getReportsByPatient(patientId) {
  return query(
    "SELECT * FROM reports WHERE patient_id = ? ORDER BY created_at DESC",
    [patientId]
  );
}

function updateReportStatus(id, status, extractedText = null) {
  if (extractedText) {
    query(
      "UPDATE reports SET processing_status = ?, extracted_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, extractedText, id]
    );
  } else {
    query(
      "UPDATE reports SET processing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, id]
    );
  }
  return getReport(id);
}

// Extracted entities operations
function createExtractedEntity(entityData) {
  const { report_id, entity_type, entity_value, confidence_score, source_text, page_number } = entityData;
  const id = uuidv4();
  const sql = `INSERT INTO extracted_entities (id, report_id, entity_type, entity_value, confidence_score, source_text, page_number)
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  query(sql, [id, report_id, entity_type, entity_value, confidence_score || null, source_text || null, page_number || null]);
  return getEntitiesByReport(report_id).find(e => e.id === id) || { id, report_id, entity_type, entity_value, confidence_score, source_text, page_number };
}

function getEntitiesByReport(reportId) {
  return query(
    "SELECT * FROM extracted_entities WHERE report_id = ? ORDER BY created_at",
    [reportId]
  );
}

// Dose results operations
function createDoseResult(doseData) {
  const {
    report_id, patient_id, regimen_id, bsa_value, bsa_formula,
    standard_dose, dose_reduction_percent, final_dose_mg, rounded_dose_mg,
    calculation_steps, safety_warnings, explanation, confidence_score
  } = doseData;

  const id = uuidv4();
  const sql = `INSERT INTO dose_results (id, report_id, patient_id, regimen_id, bsa_value, bsa_formula,
               standard_dose, dose_reduction_percent, final_dose_mg, rounded_dose_mg,
               calculation_steps, safety_warnings, explanation, confidence_score)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  query(sql, [
    id, report_id, patient_id, regimen_id || null, bsa_value, bsa_formula,
    standard_dose, dose_reduction_percent || 0, final_dose_mg, rounded_dose_mg,
    JSON.stringify(calculation_steps || []), JSON.stringify(safety_warnings || []), explanation || null, confidence_score || null
  ]);
  return getDoseResultsByPatient(patient_id).find(d => d.id === id);
}

function getDoseResultsByPatient(patientId) {
  return query(
    `SELECT dr.*, cr.drug_name, cr.standard_dose_per_m2, cr.unit, cr.route, cr.frequency
     FROM dose_results dr
     LEFT JOIN chemotherapy_regimens cr ON dr.regimen_id = cr.id
     WHERE dr.patient_id = ?
     ORDER BY dr.created_at DESC`,
    [patientId]
  );
}

// Chemotherapy regimens operations
function getRegimens() {
  return query("SELECT * FROM chemotherapy_regimens ORDER BY drug_name");
}

function getRegimenById(id) {
  return queryOne("SELECT * FROM chemotherapy_regimens WHERE id = ?", [id]);
}

// `regimenName` is often a full protocol description (e.g. "AC-T Dose-Dense
// (Doxorubicin + Cyclophosphamide → Paclitaxel) — HR+/HER2- Stage II adjuvant"),
// while chemotherapy_regimens only stores single generic drug names — so this
// looks for a stored drug name that appears WITHIN the regimen description,
// not the other way around, and returns the first component drug found for
// BSA-based dosing.
function getRegimenByName(regimenName) {
  const haystack = String(regimenName || "").toLowerCase();
  const rows = query("SELECT * FROM chemotherapy_regimens");
  return rows.find((r) => haystack.includes(String(r.drug_name).toLowerCase())) || null;
}

// Patient clinical profile operations (Trial Match)
// Whitelisted columns — unlike updatePatient(), column names are never taken
// from caller input, so a crafted request body cannot reach the SQL text.
const CLINICAL_COLUMNS = ["cancer_type", "stage", "ecog", "prior_lines", "sex", "age", "genomic_json"];

function getPatientClinical(patientId) {
  return queryOne("SELECT * FROM patient_clinical WHERE patient_id = ?", [patientId]) || null;
}

function upsertPatientClinical(patientId, updates = {}) {
  const fields = CLINICAL_COLUMNS.filter((c) => updates[c] !== undefined);
  const existing = getPatientClinical(patientId);

  if (!existing) {
    const cols = ["patient_id", ...fields];
    const placeholders = cols.map(() => "?").join(", ");
    query(
      `INSERT INTO patient_clinical (${cols.join(", ")}) VALUES (${placeholders})`,
      [patientId, ...fields.map((f) => updates[f])]
    );
  } else if (fields.length > 0) {
    const setClause = fields.map((f) => `${f} = ?`).join(", ");
    query(
      `UPDATE patient_clinical SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE patient_id = ?`,
      [...fields.map((f) => updates[f]), patientId]
    );
  }

  return getPatientClinical(patientId);
}

// Dashboard stats
function getDashboardStats() {
  const patientsResult = queryOne("SELECT COUNT(*) as total FROM patients");
  const reportsResult = queryOne("SELECT COUNT(*) as total FROM reports");
  const completedResult = queryOne("SELECT COUNT(*) as total FROM reports WHERE processing_status = 'completed'");
  const avgBsaResult = queryOne("SELECT AVG(weight_kg * 10000.0 / (height_cm * height_cm)) as avg_bsa FROM patients WHERE height_cm IS NOT NULL AND weight_kg IS NOT NULL");

  return {
    totalPatients: patientsResult?.total || 0,
    totalReports: reportsResult?.total || 0,
    completedReports: completedResult?.total || 0,
    avgBMI: avgBsaResult?.avg_bsa ? parseFloat(avgBsaResult.avg_bsa).toFixed(1) : null,
  };
}

// Initialize database tables
function initDatabase() {
  const db = getDb();

  // Create tables if they don't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'other')),
      height_cm REAL,
      weight_kg REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      report_type TEXT DEFAULT 'oncology',
      processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
      extracted_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS extracted_entities (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_value TEXT NOT NULL,
      confidence_score REAL,
      source_text TEXT,
      page_number INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id)
    );

    CREATE TABLE IF NOT EXISTS chemotherapy_regimens (
      id TEXT PRIMARY KEY,
      drug_name TEXT NOT NULL,
      standard_dose_per_m2 REAL NOT NULL,
      unit TEXT DEFAULT 'mg/m²',
      route TEXT DEFAULT 'IV',
      frequency TEXT,
      cycle_length_days INTEGER DEFAULT 21,
      indications TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dose_results (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      regimen_id TEXT,
      bsa_value REAL NOT NULL,
      bsa_formula TEXT NOT NULL,
      standard_dose REAL NOT NULL,
      dose_reduction_percent REAL DEFAULT 0,
      final_dose_mg REAL NOT NULL,
      rounded_dose_mg REAL NOT NULL,
      calculation_steps TEXT,
      safety_warnings TEXT,
      explanation TEXT,
      confidence_score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES reports(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (regimen_id) REFERENCES chemotherapy_regimens(id)
    );

    -- Clinician-supplied clinical data for Trial Match. Kept separate from the
    -- patients table so existing patient CRUD is untouched. Holds only what the
    -- report parser could NOT determine (or what a clinician corrected) --
    -- the rest is re-derived from reports.extracted_text on read.
    CREATE TABLE IF NOT EXISTS patient_clinical (
      patient_id TEXT PRIMARY KEY,
      cancer_type TEXT,
      stage TEXT,
      ecog INTEGER,
      prior_lines INTEGER,
      sex TEXT,
      age INTEGER,
      genomic_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      -- ON DELETE CASCADE so this table never blocks a patient delete that
      -- would otherwise succeed. (The older tables lack it, which is why
      -- deleting a patient that has reports already fails — pre-existing,
      -- untouched here.)
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
  `);

  // Seed chemotherapy regimens
  const existingRegimens = queryOne("SELECT COUNT(*) as count FROM chemotherapy_regimens");
  if (!existingRegimens || existingRegimens.count === 0) {
    const insert = db.prepare(
      "INSERT INTO chemotherapy_regimens (id, drug_name, standard_dose_per_m2, unit, route, frequency, cycle_length_days, indications) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    const regimens = [
      [uuidv4(), 'Doxorubicin', 75, 'mg/m²', 'IV', 'Every 3 weeks', 21, 'Breast Cancer,Lymphoma,Ovarian Cancer'],
      [uuidv4(), 'Cisplatin', 75, 'mg/m²', 'IV', 'Every 3 weeks', 21, 'Lung Cancer,Bladder Cancer,Ovarian Cancer'],
      [uuidv4(), 'Paclitaxel', 175, 'mg/m²', 'IV', 'Every 3 weeks', 21, 'Breast Cancer,Ovarian Cancer,Lung Cancer'],
      [uuidv4(), '5-Fluorouracil', 500, 'mg/m²', 'IV', 'Weekly', 7, 'Colorectal Cancer,Breast Cancer,Head and Neck Cancer'],
      [uuidv4(), 'Cyclophosphamide', 1000, 'mg/m²', 'IV', 'Every 3 weeks', 21, 'Breast Cancer,Lymphoma,Ovarian Cancer'],
      [uuidv4(), 'Methotrexate', 40, 'mg/m²', 'IV', 'Weekly', 7, 'Breast Cancer,Lymphoma,Osteosarcoma'],
      [uuidv4(), 'Vincristine', 1.4, 'mg/m²', 'IV', 'Every 2 weeks', 14, 'Lymphoma,Leukemia,Neuroblastoma'],
      [uuidv4(), 'Bleomycin', 15, 'mg/m²', 'IV', 'Every 3 weeks', 21, 'Testicular Cancer,Lymphoma,Cervical Cancer'],
      [uuidv4(), 'Etoposide', 100, 'mg/m²', 'IV', 'Every 3 weeks', 21, 'Lung Cancer,Testicular Cancer,Lymphoma'],
      [uuidv4(), 'Ifosfamide', 2000, 'mg/m²', 'IV', 'Every 3 weeks', 21, 'Sarcoma,Testicular Cancer,Lymphoma'],
    ];

    const insertMany = db.transaction((regimens) => {
      for (const r of regimens) {
        insert.run(...r);
      }
    });

    insertMany(regimens);
    console.log("Database seeded with chemotherapy regimens");
  }

  console.log("SQLite database initialized successfully");
}

// Wrap all functions with async for compatibility
module.exports = {
  query: async(query),
  queryOne: async(queryOne),
  exec: async(exec),
  createPatient: async(createPatient),
  getPatient: async(getPatient),
  getAllPatients: async(getAllPatients),
  updatePatient: async(updatePatient),
  deletePatient: async(deletePatient),
  createReport: async(createReport),
  getReport: async(getReport),
  getReportsByPatient: async(getReportsByPatient),
  updateReportStatus: async(updateReportStatus),
  createExtractedEntity: async(createExtractedEntity),
  getEntitiesByReport: async(getEntitiesByReport),
  createDoseResult: async(createDoseResult),
  getDoseResultsByPatient: async(getDoseResultsByPatient),
  getRegimens: async(getRegimens),
  getRegimenById: async(getRegimenById),
  getRegimenByName: async(getRegimenByName),
  getPatientClinical: async(getPatientClinical),
  upsertPatientClinical: async(upsertPatientClinical),
  getDashboardStats: async(getDashboardStats),
  initDatabase: async(initDatabase),
};
