"use client";

import { useState } from "react";
import { api, ApiError, type BSAResult } from "@/lib/api";

const FORMULAS = ["Mosteller", "Du Bois", "Haycock", "Boyd", "Gehan & George"];

export default function BSAPage() {
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
        <h1 className="text-3xl font-bold text-slate-900">📐 BSA Calculator</h1>
        <p className="mt-1 text-slate-600">
          Calculate Body Surface Area using multiple clinical formulas.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="field-label">Height (cm)</label>
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
          <label className="field-label">Weight (kg)</label>
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
          <label className="field-label">Preferred Formula</label>
          <select
            className="field-input"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
          >
            {FORMULAS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <button disabled={loading} className="btn-primary">
            {loading ? "Calculating…" : "Calculate BSA"}
          </button>
        </div>
      </form>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {err}
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900">Result</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row k="Preferred Formula" v={result.preferred_formula} />
              <Row k="BSA" v={`${result.preferred_bsa} m²`} />
              <Row k="Calculation" v={result.preferred_calculation} />
              <Row k="Average BSA (all formulas)" v={`${result.average_bsa} m²`} />
              <Row k="BMI" v={result.bmi} />
              <Row k="Interpretation" v={result.interpretation} />
            </dl>
          </div>
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900">All Formulas</h2>
            <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {Object.entries(result.all_formulas).map(([name, f]) => (
                <li key={name} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{name}</span>
                  <span className="text-slate-600">{f.bsa} m²</span>
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
    <div className="flex justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-slate-600">{k}</dt>
      <dd className="text-right font-medium text-slate-900">{v}</dd>
    </div>
  );
}
