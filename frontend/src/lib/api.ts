// API client for OncoDoseRx.
// In the browser, all "/api/..." requests are same-origin; the rewrite rule
// in next.config.ts proxies them to the Express backend on http://localhost:3000.
// The Express server is a *separate process* that must be running
// (`npm start` / `npm run dev` from the project root) — this frontend has
// no business logic of its own, it only calls that API.

const BASE = "/api";

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: "male" | "female" | "other";
  height_cm?: number | null;
  weight_kg?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface BSAFormulaResult {
  bsa: number;
  calculation: string;
}

export interface BSAResult {
  height_cm: number;
  weight_kg: number;
  bmi: number;
  preferred_formula: string;
  preferred_bsa: number;
  preferred_calculation: string;
  average_bsa: number;
  all_formulas: Record<string, BSAFormulaResult>;
  interpretation: string;
}

export interface DoseCalculationStep {
  step: number;
  description: string;
  formula: string;
  result: string;
  note?: string;
}

export interface DoseResult {
  drug: string;
  bsa: number;
  bsa_formula: string;
  standard_dose_per_m2: number;
  unit: string;
  route: string;
  frequency: string;
  dose_reduction_percent: number;
  raw_dose_mg: number;
  final_dose_mg: number;
  rounded_dose_mg: number;
  calculation_steps: DoseCalculationStep[];
  safety_warnings: string[];
  confidence_score?: number;
}

export interface PatientReport {
  id: string;
  patient_id: string;
  filename: string;
  processing_status: string;
  created_at: string;
  [key: string]: unknown;
}

export interface PatientDoseResult {
  id: string;
  drug_name: string | null;
  bsa_value: number;
  standard_dose: number;
  final_dose_mg: number;
  rounded_dose_mg: number;
  created_at: string;
  [key: string]: unknown;
}

export interface Regimen {
  id: string;
  drug_name: string;
  standard_dose_per_m2: number;
  unit: string;
  route: string;
  frequency: string;
  cycle_length_days: number;
  indications: string;
  created_at?: string;
}

export interface DashboardStats {
  totalPatients: number;
  totalReports: number;
  completedReports: number;
  avgBMI: string | null;
}

export interface LymphNodes {
  lymphNodeStatus?: string | null;
  lymphNodesPositive?: number | null;
  lymphNodesTotal?: number | null;
}

export interface ParsedReport {
  cancerType: string | null;
  stage: string | null;
  tStage?: string | null;
  nStage?: string | null;
  mStage?: string | null;
  grade?: string | null;
  histology?: string | null;
  primarySite?: string | null;
  biomarkers?: Record<string, string | number | undefined>;
  tumorMarkers?: Record<string, string | number | undefined>;
  performanceStatus?: number | null;
  age?: number | null;
  height?: number | null;
  weight?: number | null;
  tumorSize?: number | null;
  lvInvasion?: string | null;
  periNeuralInvasion?: string | null;
  depthOfInvasion?: string | null;
  surgicalMargins?: string | null;
  lymphNodes?: LymphNodes | null;
  confidence?: "high" | "medium" | "low";
  rawText: string;
  [key: string]: unknown;
}

export interface ReportRequirement {
  id: string;
  icon: string;
  name: string;
  reason: string;
}

export interface ClinicalNote {
  field: string;
  note: string;
}

export interface DataCheck {
  completeness?: number;
  dataTier?: "complete" | "partial" | "insufficient";
  canPredict: boolean;
  predictionBlock?: string | null;
  missingRequired?: string[];
  missingImportant?: string[];
  missingReports?: ReportRequirement[];
  satisfiedReports?: ReportRequirement[];
  conditionalReports?: ReportRequirement[];
  missingConditional?: ReportRequirement[];
  clinicalNotes?: ClinicalNote[];
  molecularNeeded?: boolean;
  [key: string]: unknown;
}

export interface PrimaryPrediction {
  source: string;
  datasetCancerType?: string;
  datasetStage?: string;
  predictedCycles: number;
  predictedCycleMean?: number;
  cycleBucket?: string;
  regimen: string;
  similarPatients?: number;
  cancerPrevalence?: number;
  trainingPatients?: number;
  biomarkerNotes?: string[];
  psNote?: string;
  completenessNote?: string;
  featureImportance?: Record<string, number>;
}

export interface RuleRecommendation {
  rank?: number;
  ruleId?: string;
  stage?: string;
  regimen: string;
  drugs?: string[];
  cycles: number;
  interval?: number;
  duration?: string;
  intent?: string;
  notes?: string;
  reference?: string;
  confidence?: "High" | "Moderate" | "Low" | string;
  fitScore?: number;
  [key: string]: unknown;
}

export interface MarkerMismatch {
  marker: string;
  expectedCancer: string;
}

export interface UploadedSlot {
  slotId: string;
  filename: string;
  chars: number;
}

export interface AnalysisResult {
  success: boolean;
  filename: string;
  uploadedSlots?: UploadedSlot[];
  reportClassification: {
    primaryType?: string;
    primaryLabel?: string;
    isTumorMarkerOnly?: boolean;
    markerMismatch?: MarkerMismatch | null;
    detectedMarkers?: string[];
    allTypes?: { type: string; label: string; keywords: string[]; score: number }[];
  };
  dataCheck: DataCheck;
  cancerTypeMismatch: {
    selected: string;
    detected: string;
  } | null;
  predictionBlocked: boolean;
  blockReason: string | null;
  blockMessage: string | null;
  parsed: ParsedReport;
  primaryPrediction: PrimaryPrediction | null;
  ruleRecommendations: RuleRecommendation[];
  agreement: "strong" | "moderate" | "divergent" | null;
  datasetInfo: {
    totalPatients: number;
    source: string;
  };
}

// ── Trial Match ───────────────────────────────────────────────────────────────
export interface BiomarkerCall {
  status: string;
  variant: string | null;
  source?: "report" | "ngs";
}

export interface TmbResult {
  value: number | null;
  unit: string | null;
  category: "high" | "low" | string;
}

export interface GenomicPanel {
  genes: Record<string, BiomarkerCall>;
  tmb: TmbResult | null;
  msi: string | null;
  detected: string[];
}

/** Where each clinical field came from, so the UI can label it. */
export type FieldSource = "report" | "manual" | "missing";

export interface ClinicalProfile {
  cancerType: string | null;
  stage: string | null;
  ecog: number | null;
  age: number | null;
  sex: string | null;
  priorLines: number | null;
  biomarkers: Record<string, BiomarkerCall>;
  tmb: TmbResult | null;
  msi: string | null;
  sources: Record<string, FieldSource>;
}

export interface TrialCriterion {
  key: string;
  label: string;
  detail: string;
}

export interface TrialLocation {
  facility: string | null;
  city: string | null;
  country: string | null;
}

export interface MatchedTrial {
  nctId: string;
  title: string;
  phase: string;
  /** INTERVENTIONAL | OBSERVATIONAL — observational studies are not treatment options. */
  studyType?: string | null;
  status: string;
  conditions: string[];
  sex: string;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  locations: TrialLocation[];
  score: number;
  met: TrialCriterion[];
  notMet: TrialCriterion[];
  unknown: TrialCriterion[];
}

export interface ClinicalProfileResult {
  success: boolean;
  profile: ClinicalProfile;
  genomic: GenomicPanel | null;
  latestReport: { id: string; filename: string; created_at: string } | null;
  disclaimer: string;
}

export interface TrialMatchResult {
  success: boolean;
  profile: ClinicalProfile;
  trials: MatchedTrial[];
  dataSource: "live" | "cache" | "fallback";
  dataSourceError: string | null;
  totalConsidered: number;
  disclaimer: string;
}

export interface ClinicalProfileUpdate {
  cancerType?: string | null;
  stage?: string | null;
  ecog?: number | string | null;
  age?: number | string | null;
  sex?: string | null;
  priorLines?: number | string | null;
  genomic?: GenomicPanel | null;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body && (body.error || body.message)) || `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  // Patients
  listPatients: (limit = 100, offset = 0) =>
    request<{ success: true; patients: Patient[] }>(`/patients?limit=${limit}&offset=${offset}`).then(
      (r) => r.patients
    ),
  getPatient: (id: string) =>
    request<{ success: true; patient: Patient }>(`/patients/${id}`).then((r) => r.patient),
  createPatient: (data: Omit<Patient, "id" | "created_at" | "updated_at">) =>
    request<{ success: true; patient: Patient }>(`/patients`, {
      method: "POST",
      body: JSON.stringify(data),
    }).then((r) => r.patient),
  updatePatient: (id: string, data: Partial<Patient>) =>
    request<{ success: true; patient: Patient }>(`/patients/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }).then((r) => r.patient),
  deletePatient: (id: string) =>
    request<{ success: true; message: string }>(`/patients/${id}`, { method: "DELETE" }),
  getPatientReports: (id: string) =>
    request<{ success: true; reports: PatientReport[] }>(`/patients/${id}/reports`).then((r) => r.reports),
  getPatientDoseResults: (id: string) =>
    request<{ success: true; doseResults: PatientDoseResult[] }>(`/patients/${id}/dose-results`).then(
      (r) => r.doseResults
    ),

  // BSA
  calculateBSA: (height_cm: number, weight_kg: number, formula = "Mosteller") =>
    request<{ success: true } & BSAResult>(`/calculate-bsa`, {
      method: "POST",
      body: JSON.stringify({ height_cm, weight_kg, formula }),
    }),

  // Dose
  calculateDose: (data: {
    drug: string;
    bsa: number;
    standard_dose: number;
    dose_reduction_percent?: number;
    formula?: string;
    route?: string;
    frequency?: string;
  }) =>
    request<{ success: true; dose: DoseResult; explanation: unknown }>(`/calculate-dose`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Regimens
  listRegimens: () =>
    request<{ success: true; regimens: Regimen[] }>(`/regimens`).then((r) => r.regimens),

  // Analysis — field name MUST be "report" to match server.js's multer.single("report")
  analyzeReport: (file: File, cancerType?: string) => {
    const fd = new FormData();
    fd.append("report", file);
    if (cancerType) fd.append("cancerType", cancerType);
    return request<AnalysisResult>(`/analyze`, { method: "POST", body: fd });
  },

  // Multi-report intake — fields MUST match server.js's MULTI_FIELDS
  // (histopathology, colonoscopy, cect, cea, mmr, molecular, surgical) plus
  // `${field}_extra` / `extra_N` for overflow slots (see lib/slots.ts's toFormFieldName).
  analyzeMulti: (fields: Record<string, File>, cancerType?: string, pastedText?: string) => {
    const fd = new FormData();
    for (const [fieldName, file] of Object.entries(fields)) fd.append(fieldName, file);
    if (cancerType) fd.append("cancerType", cancerType);
    if (pastedText) fd.append("pastedText", pastedText);
    return request<AnalysisResult>(`/analyze-multi`, { method: "POST", body: fd });
  },

  // Trial Match — the clinical profile is re-derived server-side from the
  // patient's latest report, then layered with saved clinician corrections.
  getClinicalProfile: (id: string) => request<ClinicalProfileResult>(`/patients/${id}/clinical`),

  updateClinicalProfile: (id: string, data: ClinicalProfileUpdate) =>
    request<{ success: true; profile: ClinicalProfile; genomic: GenomicPanel | null }>(
      `/patients/${id}/clinical`,
      { method: "PUT", body: JSON.stringify(data) }
    ),

  // `genomic` lets a just-extracted panel be used for matching before the
  // clinician commits it to the record.
  matchTrials: (id: string, genomic?: GenomicPanel | null) =>
    request<TrialMatchResult>(`/patients/${id}/trial-match`, {
      method: "POST",
      body: JSON.stringify(genomic ? { genomic } : {}),
    }),

  // Field name MUST be "report" to match server.js's multer.single("report")
  extractGenomic: (file: File) => {
    const fd = new FormData();
    fd.append("report", file);
    return request<{ success: true; filename: string; genomic: GenomicPanel }>(`/genomic-extract`, {
      method: "POST",
      body: fd,
    });
  },

  // Manual field correction — only accepted for a field the parser left blank
  // (e.g. stage missing from a GBM report, or height/weight for dose calc).
  correctField: (data: {
    parsed: ParsedReport;
    reportClassification: AnalysisResult["reportClassification"];
    corrections: Record<string, string | number>;
    filename?: string;
    cancerTypeMismatch?: AnalysisResult["cancerTypeMismatch"];
  }) => request<AnalysisResult>(`/correct-field`, { method: "POST", body: JSON.stringify(data) }),

  // Cancer types
  listCancerTypes: () =>
    request<{ success: true; cancerTypes: CancerType[] }>(`/cancer-types`).then((r) => r.cancerTypes),
  getCancerTypeRequirements: (cancerType: string) =>
    request<CancerTypeRequirements>(`/cancer-type/${encodeURIComponent(cancerType)}/requirements`),

  // Breast cancer conditional secondary reports (genomic / brca / nodal)
  analyzeBreastSecondary: (file: File, reportType: string, primaryResults: AnalysisResult) => {
    const fd = new FormData();
    fd.append("report", file);
    fd.append("reportType", reportType);
    fd.append("primaryResults", JSON.stringify(primaryResults));
    return request<BreastSecondaryResult>(`/analyze-breast-secondary`, { method: "POST", body: fd });
  },

  // Dashboard
  dashboard: () => request<{ success: true } & DashboardStats>(`/dashboard`),

  // Health
  health: () => request<{ status: string }>(`/health`),
};

export interface CancerType {
  id: string;
  label: string;
  category: string;
  hasModelRules: boolean;
  hasPathway: boolean;
}

export interface CancerTypeRequirements {
  success: boolean;
  cancerType: string;
  requiredFields: string[];
  importantFields: string[];
  requiredReports: ReportRequirement[];
  primaryReports: ReportRequirement[];
  conditionalReports: ReportRequirement[];
  molecularNeeded: boolean;
  minimumToPredict: string[];
  noteIfMissing: Record<string, string>;
  totalReportsNeeded: number;
  conditionalTriggers: Record<string, string>;
}

export interface ChemotherapyAdjustment {
  action: "avoid" | "recommend" | "consider" | "parp_eligible" | "standard" | "risk_stratify";
  reason: string;
  alternative: string;
}

export interface SecondaryAnalysis {
  reportType: string;
  findings: string[];
  recommendations: string[];
  chemotherapyAdjustments: ChemotherapyAdjustment | null;
  canAvoidChemo: boolean;
  riskCategory: string | null;
  nodalStatus: string | null;
  brcaResult: string | null;
}

export interface BreastSecondaryResult {
  success: boolean;
  reportType: string;
  parsed: ParsedReport;
  reportClassification: AnalysisResult["reportClassification"];
  secondaryAnalysis: SecondaryAnalysis;
}

export { ApiError };
