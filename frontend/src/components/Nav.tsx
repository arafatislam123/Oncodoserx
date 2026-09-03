"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BrainCircuit, FolderOpen, LayoutDashboard, Ruler, Upload, Users } from "lucide-react";
import { useLanguage } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const NAV_LINKS = [
  { href: "/", key: "nav.overview" as const, icon: LayoutDashboard, exact: true },
  { href: "/dashboard", key: "nav.dashboard" as const, icon: Activity, exact: true },
  { href: "/patients", key: "nav.patients" as const, icon: Users, exact: false },
  { href: "/bsa", key: "nav.bsa" as const, icon: Ruler, exact: true },
  { href: "/upload", key: "nav.upload" as const, icon: Upload, exact: true },
  { href: "/multi-upload", key: "nav.multiUpload" as const, icon: FolderOpen, exact: true },
  { href: "/model", key: "nav.modelLearning" as const, icon: BrainCircuit, exact: true },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-800 text-white">
            <Activity size={17} strokeWidth={2.25} />
          </span>
          <span className="leading-none">
            <span className="block text-[15px] font-semibold tracking-tight text-slate-900">OncoDoseRx</span>
            <span className="block text-[10.5px] font-medium uppercase tracking-wider text-slate-400">
              {t("nav.tagline")}
            </span>
          </span>
        </Link>
        <nav className="flex items-center gap-0.5">
          {NAV_LINKS.map((link) => {
            const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
                  active ? "bg-brand-50 text-brand-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon size={15} strokeWidth={2} />
                {t(link.key)}
              </Link>
            );
          })}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
