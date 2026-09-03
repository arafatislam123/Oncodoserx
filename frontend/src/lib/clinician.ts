"use client";

// Remembers who is signing off on treatment decisions.
//
// Typing your name into every decision is the kind of friction that makes
// clinicians skip the step entirely, and a decision with no `decided_by` is a
// weaker audit record. It is stored per-browser only — it never leaves the
// device except as the `decidedBy` field on a decision the clinician submits.
//
// Uses the same external-store pattern as lib/i18n/context.tsx: the server
// always renders "", and the client re-syncs to the stored value immediately
// after hydration, so reading localStorage can never cause a mismatch.

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "oncodoserx-clinician";

type Listener = () => void;

let current = "";
let hydrated = false;
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  if (!hydrated) {
    try {
      current = localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      // localStorage unavailable (private mode, blocked site data) — stay empty
    }
    hydrated = true;
  }
  return current;
}

function getServerSnapshot(): string {
  return "";
}

function setClinician(name: string) {
  current = name;
  hydrated = true;
  try {
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — the name still applies for this session
  }
  listeners.forEach((fn) => fn());
}

/** `[name, setName]`, persisted across page loads and shared between components. */
export function useClinician(): [string, (name: string) => void] {
  const name = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [name, setClinician];
}
