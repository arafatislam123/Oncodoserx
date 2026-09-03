"use client";

// The clinician's half of the learning loop.
//
// An analysis on its own is only the model's opinion; feeding that opinion back
// into the training data would teach the model nothing. This card captures what
// the doctor ACTUALLY decided.
//
// The default path is ONE CLICK: the primary button confirms the top
// recommendation exactly as shown. Everything else — a different regimen, a
// different cycle count, the demographic fields the model also trains on — is
// behind "adjust details", because a form that demands eight fields before it
// will accept anything is a form clinicians stop filling in.
//
// Clinical VALUES (regimen names, NCCN rule text) come from the backend in
// English and are shown as-is; only the UI chrome is localized. See lib/i18n.

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Database,
  ShieldCheck,
  User,
} from "lucide-react";
import {
  learningApi,
  ApiError,
  type AnalysisResult,
  type NccnConcordance,
  type TreatmentDecisionResult,
} from "@/lib/api";
import { useLanguage } from "@/lib/i18n/context";
import { useClinician } from "@/lib/clinician";
import { Badge, badgeClass, CardHeading } from "@/components/ui";

const CONCORDANCE_COLOR: Record<NccnConcordance, keyof typeof badgeClass> = {
  guideline_match: "green",
  regimen_match: "blue",
  variant: "blue",
  off_guideline: "yellow",
  unverifiable: "grey",
};

/** A one-click source for the regimen + cycles fields. */
interface Suggestion {
  label: string;
  regimen: string;
  cycles: number;
  intent?: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export function TreatmentDecisionCard({ result }: { result: AnalysisResult }) {
  const { t } = useLanguage();
  const { parsed, primaryPrediction, ruleRecommendations, saved } = result;

  // Suggestions: the ML recommendation first, then each NCCN rule option.
  const suggestions: Suggestion[] = [
    ...(primaryPrediction
      ? [{
          label: `ML · ${primaryPrediction.regimen}`,
          regimen: primaryPrediction.regimen,
          cycles: primaryPrediction.predictedCycles,
          intent: ruleRecommendations[0]?.intent,
        }]
      : []),
    ...ruleRecommendations.map((r) => ({
      label: `NCCN · ${r.regimen}`,
      regimen: r.regimen,
      cycles: r.cycles,
      intent: r.intent,
    })),
  ];

  const first = suggestions[0];
  const [regimen, setRegimen] = useState(first?.regimen ?? "");
  const [cycles, setCycles] = useState(first ? String(first.cycles) : "");
  const [intent, setIntent] = useState(first?.intent ? capitalise(first.intent) : "Curative");
  const [priorTreatment, setPriorTreatment] = useState("None");
  const [sex, setSex] = useState("");
  const [age, setAge] = useState(parsed.age != null ? String(parsed.age) : "");
  const [ecog, setEcog] = useState(
    parsed.performanceStatus != null ? String(parsed.performanceStatus) : ""
  );
  const [charlson, setCharlson] = useState("");
  const [decidedBy, setDecidedBy] = useClinician();
  const [notes, setNotes] = useState("");
  const [contribute, setContribute] = useState(true);

  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TreatmentDecisionResult | null>(null);

  // True while the form still says exactly what the top recommendation said —
  // the one-click path. Any edit turns the primary button into a plain "confirm
  // what I typed" so the label never claims agreement that is no longer true.
  const unchanged =
    !!first && regimen === first.regimen && cycles === String(first.cycles);

  function applySuggestion(s: Suggestion) {
    setRegimen(s.regimen);
    setCycles(String(s.cycles));
    if (s.intent) setIntent(capitalise(s.intent));
  }

  function submit() {
    setError(null);
    if (!regimen.trim()) {
      setExpanded(true);
      return setError(t("decision.missingRegimen"));
    }
    const cycleNum = Number(cycles);
    if (!Number.isInteger(cycleNum) || cycleNum < 0) {
      setExpanded(true);
      return setError(t("decision.missingCycles"));
    }

    setSubmitting(true);
    learningApi
      .submitDecision({
        patientId: saved?.patientId ?? null,
        reportId: saved?.reportId ?? null,
        parsed,
        primaryPrediction,
        ruleRecommendations,
        decision: {
          regimen: regimen.trim(),
          cycles: cycleNum,
          intent,
          priorTreatment,
          gender: sex || undefined,
          age: age === "" ? null : Number(age),
          ecog: ecog === "" ? null : Number(ecog),
          charlson: charlson === "" ? null : Number(charlson),
        },
        decidedBy: decidedBy.trim() || undefined,
        clinicalNotes: notes.trim() || undefined,
        contributeToDataset: contribute,
      })
      .then(setOutcome)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("decision.failed")))
      .finally(() => setSubmitting(false));
  }

  if (outcome) {
    return <DecisionOutcome outcome={outcome} onReset={() => setOutcome(null)} />;
  }

  const cyclesLabel = Number(cycles) > 0 ? `${cycles}×` : t("decision.continuous");

  return (
    <div className="card border-brand-200 bg-brand-50/20">
      <CardHeading icon={ClipboardCheck}>{t("decision.title")}</CardHeading>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{t("decision.subtitle")}</p>

      {saved?.saved && saved.patientId ? (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-500">
          <User size={13} strokeWidth={2} className="text-slate-400" />
          {t("decision.savedAs")}{" "}
          <Link
            href={`/patients/${saved.patientId}`}
            className="font-medium text-brand-700 hover:underline"
          >
            {saved.patientName || saved.patientId}
          </Link>
        </p>
      ) : (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-700">
          <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
          {saved?.error || t("decision.notSaved")}
        </p>
      )}

      {/* ── The one-click path ────────────────────────────────────────────── */}
      <div className="mt-3 rounded-lg border border-brand-200 bg-white p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {unchanged ? t("decision.aboutToConfirm") : t("decision.yourDecision")}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[15px] font-semibold text-slate-900">{regimen || "—"}</span>
          <span className="text-[13px] text-slate-500">
            {cyclesLabel} · {intent}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-800 disabled:opacity-50"
          >
            <CheckCircle2 size={14} strokeWidth={2} />
            {submitting ? t("decision.submitting") : t("decision.confirmOneClick")}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300"
          >
            {expanded ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
            {t("decision.adjustDetails")}
          </button>
          {decidedBy && (
            <span className="text-[12px] text-slate-400">
              {t("decision.signingAs", { name: decidedBy })}
            </span>
          )}
        </div>

        {!expanded && (
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            {t("decision.optionalHint")}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-red-600">
          <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {/* ── Everything optional ───────────────────────────────────────────── */}
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
          {suggestions.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                    s.regimen === regimen
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-700"
                  }`}
                >
                  {s.label} · {s.cycles > 0 ? `${s.cycles}×` : t("decision.continuous")}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <Field label={t("decision.regimen")}>
              <input
                className={inputClass}
                value={regimen}
                onChange={(e) => setRegimen(e.target.value)}
                placeholder={t("decision.regimenPlaceholder")}
              />
            </Field>
            <Field label={t("decision.cycles")}>
              <input
                className={inputClass}
                type="number"
                min={0}
                max={60}
                value={cycles}
                onChange={(e) => setCycles(e.target.value)}
              />
            </Field>
            <Field label={t("decision.intent")}>
              <select className={inputClass} value={intent} onChange={(e) => setIntent(e.target.value)}>
                <option value="Curative">{t("common.intentCurative")}</option>
                <option value="Adjuvant">{t("common.intentAdjuvant")}</option>
                <option value="Neoadjuvant">{t("decision.intentNeoadjuvant")}</option>
                <option value="Palliative">{t("common.intentPalliative")}</option>
              </select>
            </Field>
          </div>

          {/* Fields the parser usually cannot read from a report but the model
              trains on. All optional — a blank one is recorded as "not stated"
              rather than guessed. */}
          <div className="grid gap-3 sm:grid-cols-5">
            <Field label={t("decision.sex")}>
              <select className={inputClass} value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">{t("common.select")}</option>
                <option value="male">{t("common.male")}</option>
                <option value="female">{t("common.female")}</option>
              </select>
            </Field>
            <Field label={t("decision.age")}>
              <input className={inputClass} type="number" min={0} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
            </Field>
            <Field label={t("decision.ecog")}>
              <select className={inputClass} value={ecog} onChange={(e) => setEcog(e.target.value)}>
                <option value="">{t("common.select")}</option>
                {[0, 1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </Field>
            <Field label={t("decision.charlson")}>
              <input className={inputClass} type="number" min={0} max={20} value={charlson} onChange={(e) => setCharlson(e.target.value)} />
            </Field>
            <Field label={t("decision.priorTreatment")}>
              <select className={inputClass} value={priorTreatment} onChange={(e) => setPriorTreatment(e.target.value)}>
                <option value="None">{t("decision.priorNone")}</option>
                <option value="Surgery">{t("decision.priorSurgery")}</option>
                <option value="Radiation">{t("decision.priorRadiation")}</option>
                <option value="Surgery+Radiation">{t("decision.priorSurgeryRadiation")}</option>
                <option value="Previous Chemo">{t("decision.priorChemo")}</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <Field label={t("decision.decidedBy")}>
              <input
                className={inputClass}
                value={decidedBy}
                onChange={(e) => setDecidedBy(e.target.value)}
                placeholder={t("decision.decidedByPlaceholder")}
              />
              <span className="mt-1 block text-[11px] text-slate-400">{t("decision.rememberedHint")}</span>
            </Field>
            <Field label={t("decision.notes")}>
              <input
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("decision.notesPlaceholder")}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2 text-[13px] text-slate-600">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-brand-600"
              checked={contribute}
              onChange={(e) => setContribute(e.target.checked)}
            />
            <span>
              {t("decision.contribute")}
              <span className="block text-[11px] text-slate-400">{t("decision.contributeHint")}</span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function DecisionOutcome({
  outcome,
  onReset,
}: {
  outcome: TreatmentDecisionResult;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  const { nccn, contribution, retrain } = outcome;

  return (
    <div className="card border-emerald-200 bg-emerald-50/30">
      <CardHeading icon={CheckCircle2}>{t("decision.submitted")}</CardHeading>

      <div className="mt-3 space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-slate-400">
              <ShieldCheck size={13} strokeWidth={2} />
              {t("decision.nccnTitle")}
            </span>
            <Badge color={CONCORDANCE_COLOR[nccn.concordance]}>
              {t(`decision.concordance.${nccn.concordance}` as never)}
            </Badge>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{nccn.message}</p>
          {nccn.reference && <p className="mt-1 text-[11px] text-slate-400">{nccn.reference}</p>}
          {nccn.warnings.map((w, i) => (
            <p key={i} className="mt-1 flex items-start gap-1.5 text-[12px] text-amber-700">
              <AlertTriangle size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-slate-400">
              <Database size={13} strokeWidth={2} />
              {t("decision.contributionTitle")}
            </span>
            {!contribution.contributed && <Badge color="grey">{t("decision.notContributed")}</Badge>}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">{contribution.message}</p>
          {contribution.errors && contribution.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[12px] text-slate-500">
              {contribution.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {contribution.contributed && contribution.datasetRows != null && (
            <p className="mt-2 text-[12px] text-slate-400">
              {contribution.datasetRows.toLocaleString()} rows · {contribution.clinicalRows} clinician-confirmed
            </p>
          )}
          <p className="mt-2 text-[12px] text-slate-500">
            {retrain.triggered
              ? t("decision.retrainQueued")
              : retrain.pending != null && retrain.threshold != null
              ? t("decision.retrainPending", { n: retrain.pending, threshold: retrain.threshold })
              : null}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Link
            href="/model"
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-slate-300"
          >
            {t("learning.title")}
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 transition hover:border-slate-300"
          >
            {t("decision.another")}
          </button>
        </div>
      </div>
    </div>
  );
}

function capitalise(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
