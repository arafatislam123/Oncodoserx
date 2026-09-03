"use client";

// Analyses on this patient's chart that nobody has signed off on yet.
//
// The one-click confirm on the analysis page only helps if the clinician is
// still looking at it. In practice reports get analysed in a batch and reviewed
// later, so without this card those cases would sit unconfirmed forever and
// never reach the training corpus. Here they can be reviewed and approved
// together.
//
// Each row shows exactly what will be recorded, because a batch approval is
// still a clinical sign-off — it must not be a blind "accept all".

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
} from "lucide-react";
import {
  learningApi,
  ApiError,
  type BatchConfirmResult,
  type PendingDecision,
} from "@/lib/api";
import { useClinician } from "@/lib/clinician";
import { useLanguage } from "@/lib/i18n/context";
import { Badge, CardHeading } from "@/components/ui";

export function PendingDecisionsCard({ patientId }: { patientId: string }) {
  const { t } = useLanguage();
  const [pending, setPending] = useState<PendingDecision[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BatchConfirmResult | null>(null);
  const [decidedBy, setDecidedBy] = useClinician();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // No spinner on refresh — the list is already on screen and re-fetching it
    // after a confirm should update it in place, not blank it out.
    learningApi
      .pendingDecisions(patientId)
      .then((r) => {
        if (cancelled) return;
        setPending(r.pending);
        // Pre-select everything that would actually reach the dataset — the
        // common case is "yes, all of these are right".
        setSelected(new Set(r.pending.filter((p) => p.canContribute).map((p) => p.reportId)));
        setErr(null);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof ApiError ? e.message : t("pending.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, refreshKey, t]);

  function toggle(reportId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  }

  function confirmSelected() {
    setSubmitting(true);
    setErr(null);
    learningApi
      .confirmDecisions(
        patientId,
        [...selected].map((reportId) => ({ reportId })),
        decidedBy.trim() || undefined
      )
      .then((r) => {
        setResult(r);
        setRefreshKey((k) => k + 1);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("pending.confirmFailed")))
      .finally(() => setSubmitting(false));
  }

  // Nothing to review and nothing just happened — stay out of the way.
  if (loading) {
    return (
      <div className="card flex items-center gap-2 text-[13px] text-slate-400">
        <Loader2 size={14} className="animate-spin" /> {t("common.loading")}
      </div>
    );
  }
  if (pending.length === 0 && !result && !err) return null;

  return (
    <div className="card border-amber-200 bg-amber-50/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardHeading icon={ClipboardCheck}>
          {t("pending.title")} ({pending.length})
        </CardHeading>
        {pending.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setSelected(
                selected.size === pending.filter((p) => p.canContribute).length
                  ? new Set()
                  : new Set(pending.filter((p) => p.canContribute).map((p) => p.reportId))
              )
            }
            className="text-[12px] font-medium text-brand-700 hover:underline"
          >
            {t("pending.toggleAll")}
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{t("pending.subtitle")}</p>
      )}

      {result && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          <CheckCircle2 size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
          <span>
            {t("pending.confirmedCount", { n: result.confirmed, contributed: result.contributed })}
            {result.retrain.triggered && ` ${t("decision.retrainQueued")}`}
            {result.results.some((r) => !r.ok) && (
              <span className="mt-1 block text-[12px] text-amber-700">
                {result.results
                  .filter((r) => !r.ok)
                  .map((r) => r.error)
                  .join(" · ")}
              </span>
            )}
          </span>
        </div>
      )}

      {err && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] text-red-600">
          <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
          {err}
        </p>
      )}

      {pending.length > 0 && (
        <>
          <div className="mt-3 space-y-2">
            {pending.map((p) => (
              <label
                key={p.reportId}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition ${
                  selected.has(p.reportId)
                    ? "border-brand-300 bg-white"
                    : "border-slate-200 bg-white/60"
                } ${p.canContribute ? "" : "opacity-70"}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-brand-600"
                  checked={selected.has(p.reportId)}
                  onChange={() => toggle(p.reportId)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[13px] font-medium text-slate-900">
                      {p.suggestion.regimen}
                    </span>
                    <span className="text-[12px] text-slate-500">
                      {p.suggestion.cycles > 0
                        ? `${p.suggestion.cycles}×`
                        : t("decision.continuous")}{" "}
                      · {p.suggestion.intent}
                    </span>
                    <Badge color={p.suggestion.source === "ML" ? "purple" : "blue"}>
                      {p.suggestion.source}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-500">
                    {[p.cancerType, p.stage && `Stage ${p.stage}`].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-400">
                    {p.filename} · {new Date(p.createdAt.replace(" ", "T") + "Z").toLocaleDateString()}
                  </div>
                  {!p.canContribute && (
                    <div className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700">
                      <AlertTriangle size={11} strokeWidth={2} className="mt-0.5 shrink-0" />
                      {t("pending.chartOnly")}
                      {p.blockers.length > 0 && ` (${p.blockers.join("; ")})`}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[12px] text-slate-500">
              {t("decision.decidedBy")}
              <input
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                value={decidedBy}
                onChange={(e) => setDecidedBy(e.target.value)}
                placeholder={t("decision.decidedByPlaceholder")}
              />
            </label>
            <button
              type="button"
              onClick={confirmSelected}
              disabled={submitting || selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-700 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-brand-800 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle2 size={14} strokeWidth={2} />
              )}
              {t("pending.confirmSelected", { n: selected.size })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
