"use client";

// Shared presentational primitives.
//
// These live outside AnalysisView so components that AnalysisView renders (such
// as TreatmentDecisionCard) can use them without importing their own parent —
// a cycle that bundlers tolerate but that breaks in confusing ways as soon as
// module evaluation order shifts. AnalysisView re-exports them, so existing
// `from "@/components/AnalysisView"` imports keep working.

import type { LucideIcon } from "lucide-react";

export const badgeClass: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700",
  yellow: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-brand-50 text-brand-700",
  grey: "bg-slate-100 text-slate-600",
  purple: "bg-purple-50 text-purple-700",
};

export function Badge({
  color,
  children,
}: {
  color: keyof typeof badgeClass;
  children: React.ReactNode;
}) {
  return <span className={`badge ${badgeClass[color]}`}>{children}</span>;
}

export function CardHeading({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
      <Icon size={16} strokeWidth={2} className="text-slate-400" />
      {children}
    </h2>
  );
}
