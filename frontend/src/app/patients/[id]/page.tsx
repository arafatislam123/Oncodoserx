"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  Dna,
  FileText,
  FlaskConical,
  MapPin,
  Search,
  ShieldAlert,
  Target,
  X,
  XCircle,
} from "lucide-react";
import {
  api,
  ApiError,
  type ClinicalProfile,
  type ClinicalProfileUpdate,
  type FieldSource,
  type GenomicPanel,
  type MatchedTrial,
  type Patient,
  type PatientDoseResult,
  type PatientReport,
  type TrialCriterion,
  type TrialMatchResult,
} from "@/lib/api";
import { Badge, CardHeading } from "@/components/AnalysisView";
import { PendingDecisionsCard } from "@/components/PendingDecisionsCard";
import { useLanguage } from "@/lib/i18n/context";

type Tab = "overview" | "trials";

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useLanguage();
  const { id } = use(params);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [reports, setReports] = useState<PatientReport[]>([]);
  const [doseResults, setDoseResults] = useState<PatientDoseResult[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    Promise.all([api.getPatient(id), api.getPatientReports(id), api.getPatientDoseResults(id)])
      .then(([p, r, d]) => {
        setPatient(p);
        setReports(r);
        setDoseResults(d);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Failed to load patient"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-slate-500">{t("common.loading")}</p>;

  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
    );
  }

  if (!patient) return null;

  const bmi =
    patient.height_cm && patient.weight_kg
      ? (patient.weight_kg / Math.pow(patient.height_cm / 100, 2)).toFixed(1)
      : "-";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/patients" className="flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
          <ArrowLeft size={13} /> {t("patientDetail.back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {patient.first_name} {patient.last_name}
        </h1>
      </div>

      <div className="flex items-center gap-0.5 border-b border-slate-200 pb-px">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={FileText}>
          {t("trialMatch.tabOverview")}
        </TabButton>
        <TabButton active={tab === "trials"} onClick={() => setTab("trials")} icon={FlaskConical}>
          {t("trialMatch.tabTrials")}
        </TabButton>
      </div>

      {tab === "overview" ? (
        <>
          <div className="card grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Field label={t("patientDetail.dob")} value={patient.date_of_birth} />
            <Field label={t("patientDetail.gender")} value={patient.gender} />
            <Field label={t("patientDetail.height")} value={patient.height_cm ? `${patient.height_cm} cm` : "-"} />
            <Field label={t("patientDetail.weight")} value={patient.weight_kg ? `${patient.weight_kg} kg` : "-"} />
            <Field label={t("patientDetail.bmi")} value={bmi} />
          </div>

          {/* Analyses on this chart that no clinician has signed off on yet.
              Renders nothing when there are none. */}
          <PendingDecisionsCard patientId={id} />

          <div className="card overflow-x-auto">
            <span className="section-label">{t("patientDetail.reports")} ({reports.length})</span>
            {reports.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">{t("patientDetail.noReports")}</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead className="border-b border-slate-100 text-left">
                  <tr>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnFilename")}</th>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnStatus")}</th>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnDate")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reports.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-slate-700">{r.filename}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`badge ${
                            r.processing_status === "completed"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {r.processing_status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card overflow-x-auto">
            <span className="section-label">{t("patientDetail.doseResults")} ({doseResults.length})</span>
            {doseResults.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">{t("patientDetail.noDoseResults")}</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead className="border-b border-slate-100 text-left">
                  <tr>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnDrug")}</th>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnBsa")}</th>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnStandardDose")}</th>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnFinalDose")}</th>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnRoundedDose")}</th>
                    <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnDate")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {doseResults.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 text-slate-700">{d.drug_name || "Unknown"}</td>
                      <td className="px-3 py-2 text-slate-500">{d.bsa_value} m²</td>
                      <td className="px-3 py-2 text-slate-500">{d.standard_dose} mg/m²</td>
                      <td className="px-3 py-2 text-slate-500">{d.final_dose_mg} mg</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{d.rounded_dose_mg} mg</td>
                      <td className="px-3 py-2 text-slate-400">{new Date(d.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <TrialMatchTab patientId={id} />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 font-medium capitalize text-slate-900">{value}</dd>
    </div>
  );
}

// Active-pill styling borrowed from components/Nav.tsx — the app's only
// existing "one-of-N selected" treatment.
function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-[13px] font-medium transition ${
        active
          ? "border-b-2 border-brand-700 bg-brand-50 text-brand-800"
          : "border-b-2 border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <Icon size={15} strokeWidth={2} />
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRIAL MATCH
// ═══════════════════════════════════════════════════════════════════════════

const EDITABLE_FIELDS = ["cancerType", "stage", "ecog", "age", "sex", "priorLines"] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];

function TrialMatchTab({ patientId }: { patientId: string }) {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<ClinicalProfile | null>(null);
  const [genomic, setGenomic] = useState<GenomicPanel | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [result, setResult] = useState<TrialMatchResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .getClinicalProfile(patientId)
      .then((r) => {
        setProfile(r.profile);
        setGenomic(r.genomic);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Failed to load clinical profile"))
      .finally(() => setLoading(false));
  }, [patientId]);

  const saveProfile = useCallback(
    async (extra: ClinicalProfileUpdate = {}) => {
      setSaving(true);
      setErr(null);
      try {
        const payload: ClinicalProfileUpdate = { ...extra };
        for (const field of EDITABLE_FIELDS) {
          const v = draft[field];
          if (v !== undefined) payload[field] = v === "" ? null : v;
        }
        const r = await api.updateClinicalProfile(patientId, payload);
        setProfile(r.profile);
        setGenomic(r.genomic);
        setDraft({});
        return r.profile;
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : "Could not save the clinical profile");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [draft, patientId]
  );

  async function runMatch() {
    setMatching(true);
    setErr(null);
    try {
      // Persist any pending edits first so the match runs on what's on screen.
      if (Object.keys(draft).length > 0) await saveProfile();
      const r = await api.matchTrials(patientId, genomic);
      setResult(r);
      setProfile(r.profile);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Trial search failed");
    } finally {
      setMatching(false);
    }
  }

  if (loading) return <p className="text-slate-500">{t("common.loading")}</p>;

  const effective = (field: EditableField): string => {
    if (draft[field] !== undefined) return draft[field];
    const v = profile?.[field];
    return v === null || v === undefined ? "" : String(v);
  };
  const hasCancerType = effective("cancerType").trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Always visible — never gated behind a condition. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <ShieldAlert size={16} className="mt-0.5 shrink-0" />
        <span>{t("trialMatch.disclaimer")}</span>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      <ProfileCard
        profile={profile}
        draft={draft}
        onDraftChange={(field, value) => setDraft((d) => ({ ...d, [field]: value }))}
        onSave={() => saveProfile()}
        saving={saving}
        effective={effective}
      />

      <GenomicCard
        genomic={genomic}
        onExtracted={(panel) => {
          setGenomic(panel);
          setErr(null);
        }}
        onSave={(panel) => saveProfile({ genomic: panel })}
        saving={saving}
      />

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={matching || !hasCancerType} onClick={runMatch}>
          <Search size={14} /> {matching ? t("trialMatch.searching") : t("trialMatch.findTrials")}
        </button>
        {!hasCancerType && <span className="text-[13px] text-slate-400">{t("trialMatch.needCancerType")}</span>}
      </div>

      {result && <ResultsSection result={result} />}
    </div>
  );
}

// ── Clinical profile ─────────────────────────────────────────────────────────
function ProfileCard({
  profile,
  draft,
  onDraftChange,
  onSave,
  saving,
  effective,
}: {
  profile: ClinicalProfile | null;
  draft: Record<string, string>;
  onDraftChange: (field: EditableField, value: string) => void;
  onSave: () => void;
  saving: boolean;
  effective: (field: EditableField) => string;
}) {
  const { t } = useLanguage();
  if (!profile) return null;

  const labels: Record<EditableField, string> = {
    cancerType: t("trialMatch.cancerType"),
    stage: t("trialMatch.stage"),
    ecog: t("trialMatch.ecog"),
    age: t("trialMatch.age"),
    sex: t("trialMatch.sex"),
    priorLines: t("trialMatch.priorLines"),
  };

  const options: Partial<Record<EditableField, { value: string; label: string }[]>> = {
    stage: ["0", "I", "II", "III", "IV"].map((v) => ({ value: v, label: v })),
    ecog: [0, 1, 2, 3, 4].map((v) => ({ value: String(v), label: `PS ${v}` })),
    sex: [
      { value: "female", label: t("common.female") },
      { value: "male", label: t("common.male") },
      { value: "other", label: t("common.other") },
    ],
  };

  const biomarkers = Object.entries(profile.biomarkers || {});
  const dirty = Object.keys(draft).length > 0;

  return (
    <div className="card">
      <CardHeading icon={Target}>{t("trialMatch.profileTitle")}</CardHeading>
      <p className="mt-1 text-[13px] text-slate-500">{t("trialMatch.profileSubtitle")}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EDITABLE_FIELDS.map((field) => (
          <ProfileField
            key={field}
            label={labels[field]}
            value={effective(field)}
            source={(profile.sources?.[field] as FieldSource) || "missing"}
            options={options[field]}
            numeric={field === "age" || field === "priorLines"}
            onChange={(v) => onDraftChange(field, v)}
          />
        ))}
      </div>

      <p className="section-label mt-5">{t("trialMatch.biomarkers")}</p>
      {biomarkers.length === 0 ? (
        <p className="mt-1 text-sm text-slate-400">{t("trialMatch.noBiomarkers")}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {biomarkers.map(([gene, call]) => {
            const negative = call.status === "wild-type" || call.status === "negative";
            return (
              <span
                key={gene}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] ${
                  negative ? "bg-slate-100 text-slate-500" : "bg-brand-50 text-brand-800"
                }`}
                title={call.source === "ngs" ? "From genomic report" : "From clinical report"}
              >
                {call.source === "ngs" && <Dna size={11} />}
                <b>{gene}</b> {call.variant || call.status}
              </span>
            );
          })}
          {profile.tmb && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] text-brand-800">
              <b>TMB</b> {profile.tmb.value != null ? `${profile.tmb.value} ${profile.tmb.unit}` : profile.tmb.category}
            </span>
          )}
          {profile.msi && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] text-brand-800">
              <b>MSI</b> {profile.msi}
            </span>
          )}
        </div>
      )}

      {dirty && (
        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-primary" disabled={saving} onClick={onSave}>
            {saving ? t("common.saving") : t("trialMatch.saveProfile")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A field the report supplied is read-only with a "from report" chip — the
 * same rule the analysis view uses, so a parsed value is never silently
 * overwritten. Missing values, and values the clinician entered themselves,
 * stay editable.
 */
function ProfileField({
  label,
  value,
  source,
  options,
  numeric,
  onChange,
}: {
  label: string;
  value: string;
  source: FieldSource;
  options?: { value: string; label: string }[];
  numeric?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useLanguage();
  const locked = source === "report";

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">{label}</span>
        {source !== "missing" && (
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            {source === "report" ? t("trialMatch.fromReport") : t("trialMatch.entered")}
          </span>
        )}
      </div>

      {locked ? (
        <div className="mt-0.5 text-[13px] font-medium text-slate-900">{value}</div>
      ) : options ? (
        <select
          className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[12px] text-slate-800"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t("trialMatch.notRecorded")}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={numeric ? "number" : "text"}
          min={numeric ? 0 : undefined}
          className="mt-1 w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[12px] text-slate-800"
          value={value}
          placeholder={t("trialMatch.notRecorded")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ── Optional NGS upload ──────────────────────────────────────────────────────
function GenomicCard({
  genomic,
  onExtracted,
  onSave,
  saving,
}: {
  genomic: GenomicPanel | null;
  onExtracted: (panel: GenomicPanel) => void;
  onSave: (panel: GenomicPanel) => void;
  saving: boolean;
}) {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function extract() {
    if (!file) return;
    setBusy(true);
    setLocalErr(null);
    try {
      const r = await api.extractGenomic(file);
      onExtracted(r.genomic);
      if (r.genomic.detected.length === 0) setLocalErr(t("trialMatch.noMarkersFound"));
    } catch (e) {
      setLocalErr(e instanceof ApiError ? e.message : "Extraction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <CardHeading icon={Dna}>{t("trialMatch.genomicTitle")}</CardHeading>
        <Badge color="grey">{t("trialMatch.genomicOptional")}</Badge>
      </div>
      <p className="mt-1 text-[13px] text-slate-500">{t("trialMatch.genomicSubtitle")}</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
        className={`relative mt-3 rounded-lg border-2 border-dashed p-6 text-center transition ${
          drag ? "border-brand-400 bg-brand-50/40" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <FlaskConical size={24} strokeWidth={1.5} className="mx-auto text-slate-300" />
        <p className="mt-2 text-sm text-slate-600">
          {file ? <span className="font-medium text-slate-800">{file.name}</span> : t("trialMatch.genomicDrop")}
        </p>
        <p className="mt-1 text-xs text-slate-400">{t("trialMatch.genomicSupported")}</p>
        <input
          type="file"
          accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>

      {localErr && <p className="mt-2 text-sm text-red-700">{localErr}</p>}

      {file && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setFile(null)}>
            <X size={14} /> {t("common.clear")}
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={extract}>
            {busy ? t("trialMatch.extracting") : t("trialMatch.extract")}
          </button>
        </div>
      )}

      {genomic && genomic.detected.length > 0 && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="section-label">{t("trialMatch.extractedMarkers")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {genomic.detected.map((d) => (
              <span key={d} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[12px] text-brand-800">
                <Dna size={11} /> {d}
              </span>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => onSave(genomic)}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────
function ResultsSection({ result }: { result: TrialMatchResult }) {
  const { t } = useLanguage();
  const sourceLabel: Record<string, string> = {
    live: t("trialMatch.sourceLive"),
    cache: t("trialMatch.sourceCache"),
    fallback: t("trialMatch.sourceFallback"),
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900">{t("trialMatch.results")}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-slate-400">
            {t("trialMatch.considered", { n: result.totalConsidered })}
          </span>
          <Badge color={result.dataSource === "fallback" ? "yellow" : "green"}>
            {sourceLabel[result.dataSource] || result.dataSource}
          </Badge>
        </div>
      </div>

      {result.dataSource === "fallback" && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{t("trialMatch.fallbackNote")}</span>
        </div>
      )}

      {result.trials.length === 0 ? (
        <div className="card text-sm text-slate-400">{t("trialMatch.noResults")}</div>
      ) : (
        result.trials.map((trial) => <TrialCard key={trial.nctId} trial={trial} />)
      )}
    </div>
  );
}

function TrialCard({ trial }: { trial: MatchedTrial }) {
  const { t } = useLanguage();
  const scoreColor = trial.score >= 80 ? "green" : trial.score >= 60 ? "yellow" : "grey";
  const sites = (trial.locations || [])
    .map((l) => [l.city, l.country].filter(Boolean).join(", "))
    .filter(Boolean);
  const uniqueSites = Array.from(new Set(sites)).slice(0, 4);

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-900">{trial.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <a
              href={`https://clinicaltrials.gov/study/${trial.nctId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              title={t("trialMatch.viewOnRegistry")}
            >
              {trial.nctId}
            </a>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{trial.phase}</span>
            {trial.studyType === "OBSERVATIONAL" && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
                {t("trialMatch.observational")}
              </span>
            )}
          </div>
        </div>
        <Badge color={scoreColor}>
          {trial.score}% {t("trialMatch.match")}
        </Badge>
      </div>

      <div className="mt-2 flex items-start gap-1.5 text-[12px] text-slate-400">
        <MapPin size={12} className="mt-0.5 shrink-0" />
        <span>{uniqueSites.length > 0 ? uniqueSites.join(" · ") : t("trialMatch.noLocations")}</span>
      </div>

      {/* Every trial shows its reasons — a score is never displayed alone. */}
      <div className="mt-3 space-y-2">
        <CriteriaList items={trial.met} kind="met" />
        <CriteriaList items={trial.notMet} kind="notMet" />
        <CriteriaList items={trial.unknown} kind="unknown" />
      </div>
    </div>
  );
}

function CriteriaList({ items, kind }: { items: TrialCriterion[]; kind: "met" | "notMet" | "unknown" }) {
  const { t } = useLanguage();
  if (!items || items.length === 0) return null;

  const cfg = {
    met: { icon: CheckCircle2, cls: "border-emerald-200 bg-emerald-50", text: "text-emerald-800", iconCls: "text-emerald-500", title: t("trialMatch.criteriaMet") },
    notMet: { icon: XCircle, cls: "border-red-200 bg-red-50", text: "text-red-800", iconCls: "text-red-400", title: t("trialMatch.criteriaNotMet") },
    unknown: { icon: CircleHelp, cls: "border-slate-200 bg-slate-50", text: "text-slate-600", iconCls: "text-slate-400", title: t("trialMatch.criteriaUnknown") },
  }[kind];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-lg border px-3 py-2 ${cfg.cls}`}>
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${cfg.text}`}>
        <Icon size={12} className={cfg.iconCls} /> {cfg.title} ({items.length})
      </div>
      <ul className="mt-1.5 space-y-1">
        {items.map((c) => (
          <li key={c.key} className={`text-[13px] ${cfg.text}`}>
            <span className="font-medium">{c.label}:</span> {c.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
