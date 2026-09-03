/**
 * OncoDoseRx — Clinical Trials Client
 * ===================================
 * Fetches recruiting studies from the ClinicalTrials.gov v2 API and normalises
 * them into a flat internal shape that engine/trial_matcher.js can score.
 *
 * Three sources, in priority order — every response reports which one was used
 * via `dataSource`, so the UI can be honest about where the data came from:
 *   "live"     — fresh call to ClinicalTrials.gov
 *   "cache"    — in-process result younger than CACHE_TTL_MS
 *   "fallback" — bundled data/seed_trials.json (offline / API failure)
 *
 * No external HTTP dependency: Node 18+ global fetch + AbortSignal.timeout.
 */

"use strict";

const path = require("path");
const fs = require("fs");

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const DATA_DIR = path.join(__dirname, "..", "data");
const SEED_PATH = path.join(DATA_DIR, "seed_trials.json");

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_PAGE_SIZE = 50;

// Module-level TTL cache — mirrors the load-once singleton idiom in
// engine/ml_predictor.js, extended with timestamps so live data refreshes.
const CACHE = new Map(); // conditionKey -> { trials, ts }

// ── Seed dataset (offline fallback) ───────────────────────────────────────────
let SEED_TRIALS = null;

function loadSeedTrials() {
  if (SEED_TRIALS) return SEED_TRIALS;
  try {
    const raw = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
    SEED_TRIALS = Array.isArray(raw) ? raw : raw.trials || [];
  } catch (err) {
    // Missing/corrupt seed file must never crash a request — the caller still
    // gets an empty list and an honest dataSource.
    console.warn("[trials] Seed dataset unavailable:", err.message);
    SEED_TRIALS = [];
  }
  return SEED_TRIALS;
}

// ── Normalisation ─────────────────────────────────────────────────────────────
// CT.gov reports ages as strings: "18 Years", "6 Months", "N/A".
function parseAgeYears(value) {
  if (!value || typeof value !== "string") return null;
  const m = value.match(/(\d+(?:\.\d+)?)\s*(year|month|week|day)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch (m[2].toLowerCase()) {
    case "year":  return n;
    case "month": return n / 12;
    case "week":  return n / 52;
    default:      return n / 365;
  }
}

// designModule.phases is e.g. ["PHASE3"], ["PHASE1","PHASE2"], ["NA"].
function formatPhases(phases) {
  if (!Array.isArray(phases) || phases.length === 0) return "N/A";
  const nums = phases
    .map((p) => String(p).toUpperCase().replace("PHASE", "").trim())
    .filter((p) => p && p !== "NA");
  if (nums.length === 0) return "N/A";
  return `Phase ${nums.join("/")}`;
}

/**
 * Map one CT.gov v2 study to the internal shape. Written defensively — every
 * module is optional so a schema change degrades a field rather than throwing.
 * Returns null for a study with no NCT id (unusable for display or matching).
 */
function normalizeStudy(study) {
  const p = study?.protocolSection || {};
  const ident = p.identificationModule || {};
  const elig = p.eligibilityModule || {};
  const nctId = ident.nctId;
  if (!nctId) return null;

  const locations = (p.contactsLocationsModule?.locations || [])
    .slice(0, 8)
    .map((l) => ({
      facility: l?.facility || null,
      city: l?.city || null,
      country: l?.country || null,
    }));

  return {
    nctId,
    title: ident.briefTitle || ident.officialTitle || "Untitled study",
    phase: formatPhases(p.designModule?.phases),
    // INTERVENTIONAL vs OBSERVATIONAL — a registry or natural-history study is
    // not a treatment option, so the UI labels it rather than blending it in.
    studyType: p.designModule?.studyType || null,
    status: p.statusModule?.overallStatus || "UNKNOWN",
    conditions: Array.isArray(p.conditionsModule?.conditions) ? p.conditionsModule.conditions : [],
    sex: elig.sex || "ALL",
    minAgeYears: parseAgeYears(elig.minimumAge),
    maxAgeYears: parseAgeYears(elig.maximumAge),
    eligibilityText: elig.eligibilityCriteria || "",
    locations,
  };
}

// ── Fallback selection ────────────────────────────────────────────────────────
// Words that appear in almost every oncology condition string and therefore
// carry no filtering signal — without excluding these, "Non-Small Cell Lung
// Cancer" matches every trial in the bundle via the word "cancer".
const GENERIC_TERMS = new Set([
  "cancer", "cancers", "tumor", "tumour", "tumors", "tumours", "carcinoma",
  "neoplasm", "neoplasms", "malignant", "malignancy", "advanced", "metastatic",
  "recurrent", "refractory", "disease", "solid", "cell", "small", "adenocarcinoma",
  "stage", "with", "and", "the",
]);

// Prefer seed trials whose conditions overlap the query, so an NSCLC patient
// isn't shown breast trials. If nothing overlaps, return everything and let the
// matcher's condition criterion sort it out (it hard-fails mismatches anyway).
function fallbackFor(condition) {
  const seed = loadSeedTrials();
  if (!condition) return seed;

  const needle = String(condition).toLowerCase();
  const words = needle
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !GENERIC_TERMS.has(w));

  const relevant = seed.filter((t) => {
    const hay = (t.conditions || []).join(" ").toLowerCase();
    return hay.includes(needle) || words.some((w) => hay.includes(w));
  });

  return relevant.length > 0 ? relevant : seed;
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Fetch recruiting trials for a condition.
 * Always resolves — never throws — so a route can rely on getting a usable list.
 * @returns {Promise<{ trials: object[], dataSource: "live"|"cache"|"fallback", error: string|null }>}
 */
async function fetchTrials({ condition, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  if (!condition || !String(condition).trim()) {
    return { trials: fallbackFor(null), dataSource: "fallback", error: "No condition supplied" };
  }

  const key = String(condition).toLowerCase().trim();
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { trials: hit.trials, dataSource: "cache", error: null };
  }

  const url =
    `${API_BASE}?query.cond=${encodeURIComponent(condition)}` +
    `&filter.overallStatus=RECRUITING&pageSize=${pageSize}&format=json`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ClinicalTrials.gov responded ${res.status}`);

    const body = await res.json();
    const studies = Array.isArray(body?.studies) ? body.studies : [];
    const trials = studies.map(normalizeStudy).filter(Boolean);

    // An empty live result is treated as a failure: better to show curated
    // fallback trials with an honest badge than an unexplained empty screen.
    if (trials.length === 0) throw new Error("No usable studies in API response");

    CACHE.set(key, { trials, ts: Date.now() });
    return { trials, dataSource: "live", error: null };
  } catch (err) {
    console.warn(`[trials] Live fetch failed for "${condition}" — using seed data:`, err.message);
    return { trials: fallbackFor(condition), dataSource: "fallback", error: err.message };
  }
}

function clearCache() {
  CACHE.clear();
}

module.exports = {
  fetchTrials,
  normalizeStudy,
  parseAgeYears,
  formatPhases,
  loadSeedTrials,
  clearCache,
};
