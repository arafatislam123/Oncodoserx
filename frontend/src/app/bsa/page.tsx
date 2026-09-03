"use client";

import { useState } from "react";
import { Ruler } from "lucide-react";
import { api, ApiError, type BSAResult } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/context";

const FORMULAS = ["Mosteller", "Du Bois", "Haycock", "Boyd", "Gehan & George"];

export default function BSAPage() {
  const { t } = useLanguage();
  const [height, setHeight] = useState("170");
  const [weight, setWeight] = useState("70");
  const [formula, setFormula] = useState("Mosteller");
  const [result, setResult] = useState<BSAResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.calculateBSA(parseFloat(height), parseFloat(weight), formula);
      setResult(r);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <span className="section-label">{t("bsa.eyebrow")}</span>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Ruler size={20} strokeWidth={2} className="text-brand-700" /> {t("bsa.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("bsa.subtitle")}</p>
      </div>

      <form onSubmit={onSubmit} className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="field-label">{t("bsa.height")}</label>
          <input
            className="field-input"
            type="number"
            min="30"
            max="300"
            step="0.1"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label">{t("bsa.weight")}</label>
          <input
            className="field-input"
            type="number"
            min="1"
            max="500"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label">{t("bsa.formula")}</label>
          <select className="field-input" value={formula} onChange={(e) => setFormula(e.target.value)}>
            {FORMULAS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <button disabled={loading} className="btn-primary">
            {loading ? t("bsa.calculating") : t("bsa.calculate")}
          </button>
        </div>
      </form>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {result && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="card">
            <span className="section-label">{t("bsa.result")}</span>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row k={t("bsa.preferredFormula")} v={result.preferred_formula} />
              <Row k="BSA" v={`${result.preferred_bsa} m²`} />
              <Row k={t("bsa.calculation")} v={result.preferred_calculation} />
              <Row k={t("bsa.averageBsa")} v={`${result.average_bsa} m²`} />
              <Row k={t("bsa.bmi")} v={result.bmi} />
              <Row k={t("bsa.interpretation")} v={result.interpretation} />
            </dl>
          </div>
          <div className="card">
            <span className="section-label">{t("bsa.allFormulas")}</span>
            <ul className="mt-3 divide-y divide-slate-100">
              {Object.entries(result.all_formulas).map(([name, f]) => (
                <li key={name} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-slate-700">{name}</span>
                  <span className="tabular-nums text-slate-500">{f.bsa} m²</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-900">{v}</dd>
    </div>
  );
}
