"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Scale, Users } from "lucide-react";
import { api, ApiError, type DashboardStats } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/context";

export default function DashboardPage() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .dashboard()
      .then(setStats)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <span className="section-label">{t("dashboard.eyebrow")}</span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("dashboard.subtitle")}</p>
      </div>

      {loading && <StatSkeleton />}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("dashboard.totalPatients")} value={stats.totalPatients} icon={Users} />
          <StatCard label={t("dashboard.totalReports")} value={stats.totalReports} icon={FileText} />
          <StatCard label={t("dashboard.completedReports")} value={stats.completedReports} icon={CheckCircle2} />
          <StatCard label={t("dashboard.averageBmi")} value={stats.avgBMI ?? "—"} icon={Scale} />
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <span className="section-label">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-50 text-brand-700">
          <Icon size={14} strokeWidth={2} />
        </span>
      </div>
      <p className="mt-2.5 text-[28px] font-semibold leading-none tracking-tight text-slate-900">{value}</p>
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="h-3 w-20 rounded bg-slate-100" />
          <div className="mt-3 h-7 w-14 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
