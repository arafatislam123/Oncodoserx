"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, FolderOpen, LayoutDashboard, Ruler, Upload, Users } from "lucide-react";
import { useLanguage } from "@/lib/i18n/context";

const FEATURES = [
  { href: "/upload", icon: Upload, key: "upload" as const },
  { href: "/multi-upload", icon: FolderOpen, key: "multiUpload" as const },
  { href: "/patients", icon: Users, key: "patients" as const },
  { href: "/bsa", icon: Ruler, key: "bsa" as const },
];

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <span className="section-label">{t("home.eyebrow")}</span>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("home.title")}</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500">{t("home.subtitle")}</p>
        <div className="mt-1 flex gap-2">
          <Link href="/upload" className="btn-primary">
            {t("home.analyzeReport")} <ArrowRight size={14} />
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            <LayoutDashboard size={14} /> {t("home.viewDashboard")}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <Link
              key={f.href}
              href={f.href}
              className="group card flex flex-col transition hover:border-brand-200 hover:shadow-[0_2px_10px_rgba(15,23,42,0.06)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                <Icon size={17} strokeWidth={2} />
              </span>
              <h2 className="mt-3 text-[15px] font-semibold text-slate-900">
                {t(`home.features.${f.key}.title` as never)}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                {t(`home.features.${f.key}.description` as never)}
              </p>
              <span className="mt-3 flex items-center gap-1 text-[13px] font-medium text-brand-700 opacity-0 transition group-hover:opacity-100">
                {t("home.open")} <ArrowRight size={13} />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>{t("home.disclaimer")}</span>
      </div>
    </div>
  );
}
