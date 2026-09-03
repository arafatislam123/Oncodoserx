"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Dna,
  FileImage,
  FileText,
  FolderOpen,
  Package,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import {
  api,
  ApiError,
  type AnalysisResult,
  type CancerType,
  type CancerTypeRequirements,
  type ReportRequirement,
  type SecondaryAnalysis,
} from "@/lib/api";
import { AnalysisView, Badge, CardHeading } from "@/components/AnalysisView";
import { SlotTypeIcon } from "@/lib/icons";
import { useLanguage } from "@/lib/i18n/context";
import {
  ALLOWED_EXTS,
  DEFAULT_SLOTS,
  SLOT_NAMES,
  buildDynamicSlots,
  fmtBytes,
  getExt,
  guessSlot,
  isBreastCancer,
  isImg,
  toFormFieldNames,
  type SlotDef,
} from "@/lib/slots";

interface BulkItem {
  file: File;
  assignedSlot: string | null;
}

export default function MultiUploadPage() {
  const { t } = useLanguage();
  const [cancerTypes, setCancerTypes] = useState<CancerType[]>([]);
  const [ctSearch, setCtSearch] = useState("");
  const [ctOpen, setCtOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<CancerTypeRequirements | null>(null);

  const [slotFiles, setSlotFiles] = useState<Record<string, File>>({});
  const [bulkQueue, setBulkQueue] = useState<BulkItem[]>([]);
  const [pastedText, setPastedText] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const [secondaryAnalyses, setSecondaryAnalyses] = useState<SecondaryAnalysis[]>([]);

  useEffect(() => {
    api.listCancerTypes().then(setCancerTypes).catch(() => {});
  }, []);

  const slots: SlotDef[] = useMemo(
    () => (requirements ? buildDynamicSlots(requirements, selectedType) : DEFAULT_SLOTS),
    [requirements, selectedType]
  );

  async function selectCancerType(ct: CancerType) {
    setSelectedType(ct.id);
    setSelectedLabel(ct.label);
    setCtOpen(false);
    setSlotFiles({});
    setBulkQueue([]);
    setResult(null);
    setSecondaryAnalyses([]);
    try {
      const req = await api.getCancerTypeRequirements(ct.id);
      setRequirements(req);
    } catch {
      setRequirements(null);
    }
  }

  function setSlotFile(slotId: string, file: File | null) {
    setSlotFiles((prev) => {
      const next = { ...prev };
      if (file) next[slotId] = file;
      else delete next[slotId];
      return next;
    });
  }

  function addBulkFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    let rejected = 0;
    setBulkQueue((prev) => {
      const next = [...prev];
      for (const file of arr) {
        if (!ALLOWED_EXTS.has(getExt(file.name))) {
          rejected++;
          continue;
        }
        if (file.size > 20 * 1024 * 1024) continue;
        if (next.some((q) => q.file.name === file.name && q.file.size === file.size)) continue;
        next.push({ file, assignedSlot: guessSlot(file.name) });
      }
      return next;
    });
    if (rejected) setErr(`${rejected} ${t("multiUpload.filesSkipped")}`);
  }

  const filledCount = Object.keys(slotFiles).length;
  const canAnalyze = !!selectedType && (filledCount > 0 || bulkQueue.some((q) => q.assignedSlot));

  async function onAnalyze() {
    if (!selectedType) {
      setErr(t("multiUpload.selectCancerTypeFirst"));
      return;
    }
    const items: { slotId: string; file: File }[] = [];
    for (const [slotId, file] of Object.entries(slotFiles)) items.push({ slotId, file });
    for (const item of bulkQueue) {
      items.push({ slotId: item.assignedSlot || "__unassigned__", file: item.file });
    }
    if (items.length === 0 && !pastedText.trim()) {
      setErr(t("multiUpload.uploadAtLeastOne"));
      return;
    }

    setLoading(true);
    setErr(null);
    setResult(null);
    setSecondaryAnalyses([]);
    try {
      const fields = toFormFieldNames(items);
      const r = await api.analyzeMulti(fields, selectedType, pastedText.trim() || undefined);
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
        <span className="section-label">{t("multiUpload.eyebrow")}</span>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <FolderOpen size={20} strokeWidth={2} className="text-brand-700" /> {t("multiUpload.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("multiUpload.subtitle")}</p>
      </div>

      <CancerTypeSelector
        cancerTypes={cancerTypes}
        search={ctSearch}
        setSearch={setCtSearch}
        open={ctOpen}
        setOpen={setCtOpen}
        selectedLabel={selectedLabel}
        onSelect={selectCancerType}
        onClear={() => {
          setSelectedType(null);
          setSelectedLabel(null);
          setRequirements(null);
        }}
      />

      {selectedType && (
        <>
          <div className="card">
            <CardHeading icon={FileText}>{t("multiUpload.reportSlots")}</CardHeading>
            <p className="mt-1 text-sm text-slate-500">
              {filledCount} / {slots.length} {t("multiUpload.filledVia")}
              {bulkQueue.length > 0 ? ` · ${bulkQueue.length} ${t("multiUpload.inBulkQueue")}` : ""}
            </p>
            <div className="mt-4 space-y-3">
              {slots.map((slot) => (
                <SlotUpload
                  key={slot.id}
                  slot={slot}
                  file={slotFiles[slot.id] ?? null}
                  onFile={(f) => setSlotFile(slot.id, f)}
                />
              ))}
            </div>
          </div>

          <BulkUpload queue={bulkQueue} setQueue={setBulkQueue} slots={slots} onAddFiles={addBulkFiles} />

          <div className="card">
            <CardHeading icon={FileText}>{t("multiUpload.pasteText")}</CardHeading>
            <textarea
              className="field-input mt-2 h-24 resize-y"
              placeholder={t("multiUpload.pasteTextPlaceholder")}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" disabled={!canAnalyze || loading} onClick={onAnalyze}>
              {loading ? t("multiUpload.analyzing") : t("multiUpload.analyzeAll")}
            </button>
          </div>
        </>
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {result && (
        <>
          <AnalysisView result={result} secondaryAnalyses={secondaryAnalyses} onResultChange={setResult} />

          {isBreastCancer(selectedType) && !result.predictionBlocked && (result.dataCheck.conditionalReports?.length ?? 0) > 0 && (
            <BreastConditionalWorkflow
              primaryResult={result}
              conditionalReports={result.dataCheck.conditionalReports!}
              onResults={setSecondaryAnalyses}
            />
          )}
        </>
      )}
    </div>
  );
}

function CancerTypeSelector({
  cancerTypes,
  search,
  setSearch,
  open,
  setOpen,
  selectedLabel,
  onSelect,
  onClear,
}: {
  cancerTypes: CancerType[];
  search: string;
  setSearch: (s: string) => void;
  open: boolean;
  setOpen: (b: boolean) => void;
  selectedLabel: string | null;
  onSelect: (ct: CancerType) => void;
  onClear: () => void;
}) {
  const { t } = useLanguage();
  const filtered = cancerTypes.filter(
    (ct) => ct.label.toLowerCase().includes(search.toLowerCase()) || ct.category.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedLabel) {
    return (
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            <Target size={16} strokeWidth={2} />
          </span>
          <div>
            <div className="section-label">{t("multiUpload.analyzingFor")}</div>
            <div className="text-[15px] font-medium text-slate-900">{selectedLabel}</div>
          </div>
        </div>
        <button className="btn-secondary" onClick={onClear}>{t("multiUpload.change")}</button>
      </div>
    );
  }

  return (
    <div className="card relative">
      <label className="field-label">{t("multiUpload.cancerType")}</label>
      <div className="relative mt-1.5">
        <input
          className="field-input mt-0 pr-8"
          placeholder={t("multiUpload.searchCancerType")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      {open && (
        <div className="absolute left-5 right-5 z-10 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{t("multiUpload.noCancerTypesFound")}</div>
          ) : (
            filtered.map((ct) => (
              <button
                key={ct.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onSelect(ct);
                  setSearch("");
                }}
              >
                <span className="text-slate-800">{ct.label}</span>
                <span className="text-xs text-slate-400">{ct.category}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SlotUpload({ slot, file, onFile }: { slot: SlotDef; file: File | null; onFile: (f: File | null) => void }) {
  const { t } = useLanguage();
  const [drag, setDrag] = useState(false);
  const badge = slot.isConditional
    ? { text: t("multiUpload.conditional"), cls: "bg-brand-50 text-brand-700" }
    : slot.required
    ? { text: t("multiUpload.required"), cls: "bg-red-50 text-red-700" }
    : slot.reason
    ? { text: t("multiUpload.important"), cls: "bg-amber-50 text-amber-700" }
    : { text: t("multiUpload.optional"), cls: "bg-slate-100 text-slate-500" };

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
          <SlotTypeIcon slotId={slot.id} size={15} strokeWidth={2} />
        </span>
        <div className="flex-1">
          <div className="text-[13px] font-medium text-slate-900">{slot.title}</div>
          <div className="text-[12px] text-slate-400">{slot.desc}</div>
        </div>
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
      </div>
      <div className="px-4 pb-4">
        {file ? (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            {isImg(file) ? <FileImage size={15} className="shrink-0 text-slate-400" /> : <FileText size={15} className="shrink-0 text-slate-400" />}
            <div className="flex-1">
              <div className="font-medium text-slate-800">{file.name}</div>
              <div className="text-[12px] text-slate-400">{fmtBytes(file.size)}{isImg(file) ? " · OCR" : ""}</div>
            </div>
            <button className="text-slate-300 hover:text-red-600" onClick={() => onFile(null)}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed py-4 text-center ${
              drag ? "border-brand-400 bg-brand-50/40" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <FileText size={17} strokeWidth={1.5} className="text-slate-300" />
            <span className="mt-1 text-[12px] text-slate-500">{t("multiUpload.dropOrClick")}</span>
            <span className="text-[11px] text-slate-400">{t("multiUpload.supportedShort")}</span>
            <input
              type="file"
              accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = ""; }}
            />
          </label>
        )}
      </div>
    </div>
  );
}

function BulkUpload({
  queue,
  setQueue,
  slots,
  onAddFiles,
}: {
  queue: BulkItem[];
  setQueue: React.Dispatch<React.SetStateAction<BulkItem[]>>;
  slots: SlotDef[];
  onAddFiles: (files: FileList | File[]) => void;
}) {
  const { t } = useLanguage();
  const [drag, setDrag] = useState(false);

  return (
    <div className="card">
      <CardHeading icon={Package}>{t("multiUpload.bulkUpload")}</CardHeading>
      <p className="mt-1 text-sm text-slate-500">{t("multiUpload.bulkUploadDesc")}</p>
      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) onAddFiles(e.dataTransfer.files);
        }}
        className={`mt-3 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed p-6 text-center ${
          drag ? "border-brand-400 bg-brand-50/40" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <Package size={24} strokeWidth={1.5} className="text-slate-300" />
        <span className="mt-1.5 text-[13px] text-slate-500">{t("multiUpload.bulkDropText")}</span>
        <input
          type="file"
          multiple
          accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) onAddFiles(e.target.files); e.target.value = ""; }}
        />
      </label>

      {queue.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-slate-600">{queue.length} {t("multiUpload.filesQueued")}</span>
            <button className="text-[12px] text-slate-400 hover:text-red-600" onClick={() => setQueue([])}>{t("multiUpload.clearAll")}</button>
          </div>
          {queue.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              {isImg(item.file) ? <FileImage size={15} className="shrink-0 text-slate-400" /> : <FileText size={15} className="shrink-0 text-slate-400" />}
              <div className="flex-1">
                <div className="font-medium text-slate-800">{item.file.name}</div>
                <div className="text-[12px] text-slate-400">{fmtBytes(item.file.size)}</div>
              </div>
              <span className={`flex items-center gap-1 text-[12px] ${item.assignedSlot ? "text-emerald-700" : "text-amber-700"}`}>
                {item.assignedSlot ? <Check size={12} /> : <AlertTriangle size={12} />}
                {item.assignedSlot ? SLOT_NAMES[item.assignedSlot] || item.assignedSlot : t("multiUpload.unrecognised")}
              </span>
              <select
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                value={item.assignedSlot ?? ""}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setQueue((prev) => prev.map((q, i) => (i === idx ? { ...q, assignedSlot: v } : q)));
                }}
              >
                <option value="">{t("multiUpload.assignToSlot")}</option>
                {slots.map((s) => (
                  <option key={s.id} value={s.id}>{SLOT_NAMES[s.id] || s.title}</option>
                ))}
              </select>
              <button
                className="text-slate-300 hover:text-red-600"
                onClick={() => setQueue((prev) => prev.filter((_, i) => i !== idx))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function recommendConditionalReports(
  result: AnalysisResult,
  conditionalReports: ReportRequirement[],
  t: (key: "multiUpload.reasonGenomic" | "multiUpload.reasonBrca" | "multiUpload.reasonNodal") => string
): (ReportRequirement & { reasonOverride: string })[] {
  const parsed = result.parsed;
  const bm = parsed.biomarkers || {};
  const isERPosHER2Neg = (bm.er === "positive" || bm.pr === "positive") && bm.her2 !== "positive";
  const isEarlyStage = ["I", "II", "IIA", "IIB", "IIC"].includes(parsed.stage || "");
  const isYoungPatient = !!(parsed.age && parsed.age <= 50);

  const find = (id: string) => conditionalReports.find((r) => r.id === id);
  const recommended: (ReportRequirement & { reasonOverride: string })[] = [];

  if (isERPosHER2Neg && isEarlyStage) {
    const r = find("genomic");
    if (r) recommended.push({ ...r, reasonOverride: t("multiUpload.reasonGenomic") });
  }
  if (isYoungPatient) {
    const r = find("brca");
    if (r) recommended.push({ ...r, reasonOverride: t("multiUpload.reasonBrca") });
  }
  const nodal = find("nodal");
  if (nodal) recommended.push({ ...nodal, reasonOverride: t("multiUpload.reasonNodal") });

  return recommended;
}

function BreastConditionalWorkflow({
  primaryResult,
  conditionalReports,
  onResults,
}: {
  primaryResult: AnalysisResult;
  conditionalReports: ReportRequirement[];
  onResults: (results: SecondaryAnalysis[]) => void;
}) {
  const { t } = useLanguage();
  const recommended = useMemo(
    () => recommendConditionalReports(primaryResult, conditionalReports, t),
    [primaryResult, conditionalReports, t]
  );
  const [files, setFiles] = useState<Record<string, File>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<SecondaryAnalysis[] | null>(null);

  async function analyze() {
    setLoading(true);
    setErr(null);
    try {
      const out: SecondaryAnalysis[] = [];
      for (const [reportType, file] of Object.entries(files)) {
        const r = await api.analyzeBreastSecondary(file, reportType, primaryResult);
        out.push(r.secondaryAnalysis);
      }
      setResults(out);
      onResults(out);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Conditional analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card border-2 border-brand-200 bg-brand-50/20">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
          <Target size={16} className="text-brand-700" /> {t("multiUpload.breastAdditional")}
        </h2>
        <Badge color="blue">{recommended.length} {t("multiUpload.needed")}</Badge>
      </div>
      <p className="mt-2 text-sm text-slate-500">{t("multiUpload.breastAdditionalDesc")}</p>

      <div className="mt-4 space-y-3">
        {recommended.map((r, i) => (
          <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 text-slate-400">
                <SlotTypeIcon slotId={r.id} size={15} strokeWidth={2} />
              </span>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-slate-900">{r.name}</div>
                <div className="text-[12px] text-slate-400">{r.reasonOverride}</div>
              </div>
              <span className={`badge ${i === 0 ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                {i === 0 ? t("multiUpload.primary") : t("multiUpload.recommended")}
              </span>
            </div>
            <div className="mt-2">
              {files[r.id] ? (
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  {isImg(files[r.id]) ? <FileImage size={15} className="shrink-0 text-slate-400" /> : <FileText size={15} className="shrink-0 text-slate-400" />}
                  <div className="flex-1">
                    <div className="font-medium text-slate-800">{files[r.id].name}</div>
                    <div className="text-[12px] text-slate-400">{fmtBytes(files[r.id].size)}</div>
                  </div>
                  <button
                    className="text-slate-300 hover:text-red-600"
                    onClick={() => setFiles((prev) => { const n = { ...prev }; delete n[r.id]; return n; })}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-slate-200 py-3 text-center hover:border-slate-300">
                  <span className="text-[12px] text-slate-500">{t("multiUpload.dropOrClick")}</span>
                  <span className="text-[11px] text-slate-400">{t("multiUpload.supportedShort")}</span>
                  <input
                    type="file"
                    accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setFiles((prev) => ({ ...prev, [r.id]: e.target.files![0] }));
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        ))}
      </div>

      <button className="btn-primary mt-4" disabled={Object.keys(files).length === 0 || loading} onClick={analyze}>
        {loading ? t("multiUpload.analyzingConditional") : t("multiUpload.analyzeConditional")}
      </button>

      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}

      {results && <ConditionalResultsView results={results} />}
    </div>
  );
}

function ConditionalResultsView({ results }: { results: SecondaryAnalysis[] }) {
  const { t } = useLanguage();
  return (
    <div className="mt-4 rounded-lg border-2 border-emerald-200 bg-emerald-50/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-slate-900">
          <Sparkles size={15} className="text-emerald-600" /> {t("multiUpload.conditionalAnalysis")}
        </h3>
        <Badge color="green">{results.length} {t("multiUpload.analyzed")}</Badge>
      </div>
      <div className="mt-3 space-y-3">
        {results.map((a, i) => (
          <div key={i} className="rounded-lg bg-white p-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-slate-900">
              <SlotTypeIcon slotId={a.reportType} size={14} className="text-slate-400" />
              <span>{SLOT_NAMES[a.reportType] || a.reportType}</span>
            </div>
            {a.findings.length > 0 && (
              <div className="mt-2 space-y-0.5 text-[13px] text-slate-600">
                {a.findings.map((f, fi) => <div key={fi}>{f}</div>)}
              </div>
            )}
            {a.recommendations.length > 0 && (
              <div className="mt-2 space-y-0.5 text-[13px] text-slate-500">
                {a.recommendations.map((r, ri) => <div key={ri}>→ {r}</div>)}
              </div>
            )}
            {a.reportType === "genomic" && a.chemotherapyAdjustments && (
              <ChemoAdjustmentBanner adj={a.chemotherapyAdjustments} />
            )}
            {a.reportType === "brca" && a.brcaResult && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
                <Dna size={14} /> <b>{t("multiUpload.brcaResult")}</b> {a.brcaResult}
              </div>
            )}
            {a.reportType === "nodal" && a.nodalStatus && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
                <Target size={14} /> <b>{t("multiUpload.nodalStatus")}</b> {a.nodalStatus}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChemoAdjustmentBanner({ adj }: { adj: NonNullable<SecondaryAnalysis["chemotherapyAdjustments"]> }) {
  const { t } = useLanguage();
  const cfg: Record<string, { title: string; cls: string; icon: typeof CheckCircle2 }> = {
    avoid: { title: t("multiUpload.chemoAvoid"), cls: "border-emerald-300 bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
    recommend: { title: t("multiUpload.chemoRecommend"), cls: "border-amber-300 bg-amber-50 text-amber-800", icon: AlertTriangle },
    parp_eligible: { title: t("multiUpload.parpEligible"), cls: "border-purple-300 bg-purple-50 text-purple-800", icon: Dna },
  };
  const c = cfg[adj.action];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <div className={`mt-2 rounded-md border px-3 py-2 text-sm ${c.cls}`}>
      <b className="flex items-center gap-1.5"><Icon size={14} /> {c.title}</b>
      <div className="mt-1 text-xs">{adj.reason}</div>
      <div className="mt-1 text-xs"><b>{t("multiUpload.plan")}</b> {adj.alternative}</div>
    </div>
  );
}
