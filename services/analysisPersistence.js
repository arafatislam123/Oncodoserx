/**
 * OncoDoseRx — Analysis Persistence
 * =================================
 * Saves an analysis result as patient data: a patient record (created or
 * matched), the report, and the entities the parser extracted from it.
 *
 * Factored out of the /api/upload-and-analyze handler so that every intake
 * route — single upload, multi-report intake, pasted text — persists the same
 * way. Analyses used to vanish once the response was rendered; a case can only
 * feed the learning loop later if it is on record now.
 */

"use strict";

const db = require("./database");

/**
 * Derives a patient record from the parsed report.
 *
 * The parser does not extract names or gender (reports are usually
 * de-identified before upload), so a new record gets placeholder identity
 * fields the clinician can edit on the patient page. Height and weight are
 * used when present because they drive BSA.
 */
function patientFromParsed(parsed = {}, overrides = {}) {
  const name = parsed.patientName || overrides.patientName || "";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const age = Number(parsed.age);

  // date_of_birth is NOT NULL in the schema, so an age-derived 1 Jan stands in
  // when only an age is known, and a fixed placeholder when nothing is.
  const dob = Number.isFinite(age) && age > 0 && age < 120
    ? `${new Date().getFullYear() - Math.round(age)}-01-01`
    : "2000-01-01";

  const gender = String(overrides.gender || parsed.gender || "").toLowerCase();

  return {
    first_name: parts[0] || "Unknown",
    last_name:  parts.slice(1).join(" ") || "Patient",
    date_of_birth: dob,
    gender: ["male", "female", "other"].includes(gender) ? gender : "other",
    height_cm: Number.isFinite(Number(parsed.height)) ? Number(parsed.height) : null,
    weight_kg: Number.isFinite(Number(parsed.weight)) ? Number(parsed.weight) : null,
  };
}

/** The parsed fields worth storing as searchable entities. */
function entitiesFromParsed(parsed = {}) {
  const bm = parsed.biomarkers || {};
  const candidates = [
    ["cancer_type", parsed.cancerType,          0.9],
    ["stage",       parsed.stage,               0.85],
    ["grade",       parsed.grade,               0.8],
    ["t_stage",     parsed.tStage,              0.85],
    ["n_stage",     parsed.nStage,              0.85],
    ["m_stage",     parsed.mStage,              0.85],
    ["histology",   parsed.histology,           0.8],
    ["primary_site", parsed.primarySite,        0.8],
    ["age",         parsed.age,                 0.95],
    ["height",      parsed.height,              0.9],
    ["weight",      parsed.weight,              0.9],
    ["ecog",        parsed.performanceStatus,   0.8],
    ["tumour_size", parsed.tumorSize,           0.8],
  ];

  for (const [key, value] of Object.entries(bm)) {
    candidates.push([`biomarker_${key}`, value, 0.85]);
  }

  return candidates
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([entity_type, value, confidence_score]) => ({
      entity_type,
      entity_value: String(value),
      confidence_score,
    }));
}

/**
 * Persists an analysis. Never throws into the caller's response path — an
 * intake route should still return the analysis if the save fails, so the
 * clinician does not lose the result over a database problem.
 *
 * @returns {{saved: boolean, patient?: object, report?: object, error?: string}}
 */
async function persistAnalysis({
  analysisResult,
  rawText,
  filename,
  filePath = null,
  patientId = null,
  reportType = "oncology",
  patientOverrides = {},
}) {
  try {
    const parsed = analysisResult?.parsed || {};

    let patient;
    if (patientId) {
      patient = await db.getPatient(patientId);
      if (!patient) return { saved: false, error: `Patient ${patientId} not found.` };
    } else {
      patient = await db.createPatient(patientFromParsed(parsed, patientOverrides));
    }

    const report = await db.createReport({
      patient_id: patient.id,
      filename: filename || "report",
      // The uploaded file is deleted after analysis; the path is kept only as a
      // record of where it arrived.
      file_path: filePath || "",
      report_type: reportType,
      processing_status: "completed",
      extracted_text: rawText || null,
    });

    for (const entity of entitiesFromParsed(parsed)) {
      await db.createExtractedEntity({
        report_id: report.id,
        ...entity,
        source_text: (rawText || "").substring(0, 200),
      });
    }

    // Mirror what the parser found into the clinical profile used by Trial
    // Match, so a saved analysis immediately powers trial matching too.
    await db.upsertPatientClinical(patient.id, {
      cancer_type: parsed.cancerType || null,
      stage: parsed.stage || null,
      ecog: Number.isFinite(Number(parsed.performanceStatus))
        ? Number(parsed.performanceStatus) : null,
      age: Number.isFinite(Number(parsed.age)) ? Number(parsed.age) : null,
    });

    return { saved: true, patient, report };
  } catch (err) {
    console.error("  [persist] Could not save analysis:", err.message);
    return { saved: false, error: err.message };
  }
}

module.exports = { persistAnalysis, patientFromParsed, entitiesFromParsed };
