"use client";

import { useState } from "react";
import { Check, Globe } from "lucide-react";
import { LANGS, useLanguage } from "@/lib/i18n/context";

export function LanguageSwitcher() {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === lang)!;

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("nav.language")}
      >
        <Globe size={15} strokeWidth={2} />
        {current.nativeLabel}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-slate-50"
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
              >
                <span className="text-slate-700">{l.nativeLabel}</span>
                {l.code === lang && <Check size={14} className="text-brand-700" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
