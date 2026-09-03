"use client";

// Model Learning — the visible side of the continuous-learning loop.
//
// Shows how much real clinical data has entered the training corpus, how the
// model has moved as a result, and every retraining run including the ones the
// accuracy gate rejected. A learning loop nobody can inspect is a loop nobody
// should trust, so rejected and failed runs are shown as prominently as
// successful ones.

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Database,
  History,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import {
  learningApi,
  ApiError,
  type ModelStatus,
  type ModelVersion,
  type NccnConcordance,
  type TreatmentDecisionRecord,
} from "@/lib/api";
import { Badge, badgeClass, CardHeading } from "@/components/ui";
import { useLanguage } from "@/lib/i18n/context";

const STATUS_COLOR: Record<ModelVersion["status"], keyof typeof badgeClass> = {
  promoted: "green",
  running: "blue",
  rejected: "yellow",
  failed: "red",
};

const CONCORDANCE_COLOR: Record<NccnConcordance, keyof typeof badgeClass> = {
  guideline_match: "green",
  regimen_match: "blue",
  variant: "blue",
  off_guideline: "yellow",
  unverifiable: "grey",
};

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{hint}</div>}
    </div>
  );
}

function pct(v: number | null | undefined) {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

export default function ModelPage() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [decisions, setDecisions] = useState<TreatmentDecisionRecord[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Bumping this refetches. Keeping the fetch inside the effect (rather than a
  // callback the effect invokes) is what lets the cleanup cancel a response that
  // arrives after the component has moved on.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([learningApi.modelStatus(), learningApi.recentDecisions(15)])
      .then(([s, d]) => {
        if (cancelled) return;
        setStatus(s);
        setDecisions(d);
        setErr(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof ApiError ? e.message : t("learning.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, t]);

  // While a run is in flight, poll so the page reflects it finishing without
  // the user having to reload.
  const isRunning = status?.isRunning ?? false;
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setRefreshKey((k) => k + 1), 5000);
    return () => clearInterval(id);
  }, [isRunning]);

  function onRetrain() {
    setStarting(true);
    setNotice(null);
    learningApi
      .retrain()
      .then(() => {
        setNotice(t("learning.retrainStarted"));
        setRefreshKey((k) => k + 1);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("learning.loadFailed")))
      .finally(() => setStarting(false));
  }

  if (err && !status) {
    return (
      <div className="card flex items-start gap-2.5 border-red-200 bg-red-50 text-sm text-red-700">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        {err}
      </div>
    );
  }

  if (!status) {
    return <div className="card text-sm text-slate-500">{t("common.loading")}</div>;
  }

  const { dataset, learning } = status;
  const concordanceEntries = Object.entries(learning.concordance) as [NccnConcordance, number][];

  return (
    <div className="space-y-4">
      <div>
        <span className="section-label">{t("learning.eyebrow")}</span>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <BrainCircuit size={20} strokeWidth={2} className="text-brand-700" /> {t("learning.title")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">{t("learning.subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t("learning.datasetRows")}
          value={dataset.totalRows.toLocaleString()}
        />
        <Stat
          label={t("learning.clinicalRows")}
          value={dataset.clinicalRows.toLocaleString()}
          hint={t("learning.weight", { n: status.clinicalSampleWeight })}
        />
        <Stat
          label={t("learning.bucketAccuracy")}
          value={pct(dataset.accuracyBucket)}
          hint={`${t("learning.exactAccuracy")}: ${pct(dataset.accuracy)}`}
        />
        <Stat
          label={t("learning.pendingRows")}
          value={`${learning.pendingRows} / ${status.threshold}`}
          hint={status.autoRetrain ? t("learning.autoOn", { n: status.threshold }) : t("learning.autoOff")}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card">
          <CardHeading icon={Stethoscope}>{t("learning.decisions")}</CardHeading>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label={t("learning.decisions")} value={String(learning.totalDecisions)} />
            <Stat
              label={t("learning.overrideRate")}
              value={learning.overrideRate == null ? "—" : pct(learning.overrideRate)}
              hint={t("learning.overrideHint")}
            />
          </div>
          {concordanceEntries.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <ShieldCheck size={12} strokeWidth={2} />
                {t("learning.concordanceTitle")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {concordanceEntries.map(([level, n]) => (
                  <Badge key={level} color={CONCORDANCE_COLOR[level]}>
                    {t(`decision.concordance.${level}` as never)} · {n}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <CardHeading icon={RefreshCw}>{t("learning.retrainTitle")}</CardHeading>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            {status.autoRetrain
              ? t("learning.autoOn", { n: status.threshold })
              : t("learning.autoOff")}
          </p>
          {status.currentVersion && (
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
              {status.currentVersion.message}
            </p>
          )}
          {dataset.trainedAt && (
            <p className="mt-1 text-[11px] text-slate-400">
              {t("learning.when")}: {new Date(dataset.trainedAt).toLocaleString()}
            </p>
          )}
          {notice && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-emerald-700">
              <CheckCircle2 size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
              {notice}
            </p>
          )}
          {err && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-red-600">
              <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
              {err}
            </p>
          )}
          <button
            type="button"
            onClick={onRetrain}
            disabled={starting || status.isRunning}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand-700 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-brand-800 disabled:opacity-50"
          >
            <RefreshCw size={14} strokeWidth={2} className={status.isRunning ? "animate-spin" : ""} />
            {status.isRunning ? t("learning.retraining") : t("learning.retrainNow")}
          </button>
        </div>
      </div>

      <div className="card">
        <CardHeading icon={History}>{t("learning.historyTitle")}</CardHeading>
        {status.history.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">{t("learning.noRuns")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-medium">{t("learning.version")}</th>
                  <th className="py-2 pr-3 font-medium">{t("learning.status")}</th>
                  <th className="py-2 pr-3 font-medium">{t("learning.rows")}</th>
                  <th className="py-2 pr-3 font-medium">{t("learning.accuracy")}</th>
                  <th className="py-2 pr-3 font-medium">{t("learning.when")}</th>
                </tr>
              </thead>
              <tbody>
                {status.history.map((v) => (
                  <tr key={v.version} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-700">v{v.version}</td>
                    <td className="py-2 pr-3">
                      <Badge color={STATUS_COLOR[v.status]}>{v.status}</Badge>
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">
                      {v.dataset_rows?.toLocaleString() ?? "—"}
                      {v.clinical_rows ? (
                        <span className="text-slate-400"> · {v.clinical_rows} real</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">
                      {pct(v.accuracy_bucket)}
                      {v.previous_accuracy_bucket != null && (
                        <span className="text-slate-400"> ← {pct(v.previous_accuracy_bucket)}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">
                      {new Date(v.created_at.replace(" ", "T") + "Z").toLocaleString()}
                      {v.message && (
                        <div className="mt-0.5 max-w-md text-[11px] leading-snug text-slate-400">
                          {v.message}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <CardHeading icon={Database}>{t("learning.recentTitle")}</CardHeading>
        {decisions.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">{t("learning.noDecisions")}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {decisions.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-[13px] font-medium text-slate-900">
                    {d.decided_regimen}
                    <span className="ml-2 font-normal text-slate-400">
                      {d.decided_cycles > 0 ? `${d.decided_cycles} cycles` : "continuous"}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {d.nccn_concordance && (
                      <Badge color={CONCORDANCE_COLOR[d.nccn_concordance]}>
                        {t(`decision.concordance.${d.nccn_concordance}` as never)}
                      </Badge>
                    )}
                    {d.contribution_status && (
                      <Badge color={d.contribution_status === "trained" ? "green" : "grey"}>
                        {d.contribution_status === "trained" ? t("learning.trained") : t("learning.pending")}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-[12px] text-slate-500">
                  {[d.cancer_type, d.stage && `Stage ${d.stage}`, d.treatment_intent]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {d.overrode_model === 1 && d.model_regimen && (
                  <div className="mt-1 text-[12px] text-amber-700">
                    Model proposed: {d.model_regimen}
                    {d.model_cycles != null ? ` · ${d.model_cycles} cycles` : ""}
                  </div>
                )}
                {d.clinical_notes && (
                  <div className="mt-1 text-[12px] text-slate-500">{d.clinical_notes}</div>
                )}
                <div className="mt-1 text-[11px] text-slate-400">
                  {d.dataset_patient_id ? `${d.dataset_patient_id} · ` : ""}
                  {d.decided_by ? `${d.decided_by} · ` : ""}
                  {new Date(d.created_at.replace(" ", "T") + "Z").toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
