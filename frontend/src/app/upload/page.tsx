"use client";

import { useState } from "react";
import { api, ApiError, type AnalysisResult } from "@/lib/api";
import { AnalysisView } from "@/components/AnalysisView";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.analyzeReport(file);
      setResult(r);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">📤 Upload Report</h1>
        <p className="mt-1 text-slate-600">
          Upload a single PDF or image of an oncology report — OCR + AI will extract cancer type, stage, regimen
          and dose. For multiple reports (biopsy + imaging + labs), use{" "}
          <a href="/multi-upload" className="text-blue-600 hover:underline">Multi-Report Intake</a> instead.
        </p>
      </div>

      <form onSubmit={onSubmit} className="card space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition ${
            drag ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400"
          }`}
        >
          <p className="text-4xl">📄</p>
          <p className="mt-2 text-slate-700">
            {file ? `Selected: ${file.name}` : "Drag & drop a PDF or image here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Supported: PDF, PNG, JPG, JPEG, TIFF (max 20 MB)</p>
          <input
            type="file"
            accept=".pdf,.txt,image/*"
            className="mt-4 block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setResult(null);
              setErr(null);
            }}
            className="btn-secondary"
          >
            Clear
          </button>
          <button disabled={!file || loading} className="btn-primary">
            {loading ? "Analyzing…" : "Analyze Report"}
          </button>
        </div>
      </form>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {err}
        </div>
      )}

      {result && <AnalysisView result={result} />}
    </div>
  );
}
