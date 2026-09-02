"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type DashboardStats } from "@/lib/api";

export default function DashboardPage() {
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
        <h1 className="text-3xl font-bold text-slate-900">📊 Dashboard</h1>
        <p className="mt-1 text-slate-600">Platform statistics and recent activity.</p>
      </div>

      {loading && <p className="text-slate-500">Loading…</p>}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {err}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Patients" value={stats.totalPatients} icon="👤" />
          <StatCard label="Total Reports" value={stats.totalReports} icon="📄" />
          <StatCard label="Completed Reports" value={stats.completedReports} icon="✅" />
          <StatCard label="Avg. BMI" value={stats.avgBMI ?? "—"} icon="⚖️" />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
