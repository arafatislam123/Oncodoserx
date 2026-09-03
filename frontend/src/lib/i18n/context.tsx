"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import en from "./en";
import bn from "./bn";
import it from "./it";
import type { DeepDict } from "./types";

export type Lang = "en" | "bn" | "it";
export const LANGS: { code: Lang; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
];

const DICTS: Record<Lang, DeepDict<typeof en>> = { en, bn, it };
const STORAGE_KEY = "oncodoserx-lang";

// A small external store for the current language, synced via
// useSyncExternalStore so reading localStorage on mount never causes a
// hydration mismatch (server always renders "en"; the client re-syncs to
// the stored value right after hydration, the same pattern React recommends
// for theme/locale preferences read from browser storage).
type Listener = () => void;
let currentLang: Lang = "en";
let hydrated = false;
const listeners = new Set<Listener>();

function readStored(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "bn" || saved === "it") return saved;
  } catch {
    // localStorage unavailable — stay on default
  }
  return "en";
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Lang {
  if (!hydrated) {
    currentLang = readStored();
    hydrated = true;
  }
  return currentLang;
}

function getServerSnapshot(): Lang {
  return "en";
}

function setLangGlobal(l: Lang) {
  currentLang = l;
  hydrated = true;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn());
}

type Path<T> = T extends string
  ? never
  : T extends readonly string[]
  ? never
  : { [K in keyof T & string]: T[K] extends string | readonly string[] ? K : `${K}.${Path<T[K]>}` }[keyof T & string];

function getIn(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], obj);
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Path<typeof en>, vars?: Record<string, string | number>) => string;
  tList: (key: Path<typeof en>) => string[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<LanguageContextValue>(() => {
    const dict = DICTS[lang];
    function t(key: Path<typeof en>, vars?: Record<string, string | number>) {
      const raw = getIn(dict, key);
      let str = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : String(key);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
      return str;
    }
    function tList(key: Path<typeof en>) {
      const raw = getIn(dict, key);
      return Array.isArray(raw) ? raw : [];
    }
    return { lang, setLang: setLangGlobal, t, tList };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
