"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Upload, X } from "lucide-react";
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
        <span className="section-label">Analysis</span>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <Upload size={20} strokeWidth={2} className="text-brand-700" /> Upload Report
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a single PDF or image of an oncology report — OCR and NLP extract cancer type, stage, regimen and
          dose. For multiple reports (biopsy + imaging + labs), use{" "}
          <Link href="/multi-upload" className="font-medium text-brand-700 hover:underline">
            Multi-Report Intake
          </Link>{" "}
          instead.
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
          className={`relative rounded-lg border-2 border-dashed p-10 text-center transition ${
            drag ? "border-brand-400 bg-brand-50/40" : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <FileText size={28} strokeWidth={1.5} className="mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-600">
            {file ? (
              <span className="font-medium text-slate-800">{file.name}</span>
            ) : (
              "Drag & drop a PDF or image here, or click to browse"
            )}
          </p>
          <p className="mt-1 text-xs text-slate-400">Supported: PDF, PNG, JPG, JPEG, TIFF (max 20 MB)</p>
          <input
            type="file"
            accept=".pdf,.txt,image/*"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
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
            <X size={14} /> Clear
          </button>
          <button disabled={!file || loading} className="btn-primary">
            {loading ? "Analyzing…" : "Analyze Report"}
          </button>
        </div>
      </form>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {result && <AnalysisView result={result} />}
    </div>
  );
}
