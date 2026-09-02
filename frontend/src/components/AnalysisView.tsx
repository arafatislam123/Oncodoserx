// Shared rendering for a full analysis result (single-report /upload and
// multi-report /multi-upload both produce the same AnalysisResult shape and
// render it identically).
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Activity,
  BarChart3,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  FolderOpen,
  Info,
  ListChecks,
  Pill,
  StickyNote,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type {
  AnalysisResult,
  DataCheck,
  ParsedReport,
  PrimaryPrediction,
  RuleRecommendation,
  SecondaryAnalysis,
  UploadedSlot,
} from "@/lib/api";
import { generateTreatmentPlan } from "@/lib/treatmentPlan";
import { SlotTypeIcon, REPORT_TYPE_ICONS, SLOT_TYPE_ICONS } from "@/lib/icons";

const badgeClass: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700",
  yellow: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-brand-50 text-brand-700",
  grey: "bg-slate-100 text-slate-600",
  purple: "bg-purple-50 text-purple-700",
};

function Badge({ color, children }: { color: keyof typeof badgeClass; children: React.ReactNode }) {
  return <span className={`badge ${badgeClass[color]}`}>{children}</span>;
}

function CardHeading({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
      <Icon size={16} strokeWidth={2} className="text-slate-400" />
      {children}
    </h2>
  );
}

export function AnalysisView({
  result,
  secondaryAnalyses = [],
}: {
  result: AnalysisResult;
  secondaryAnalyses?: SecondaryAnalysis[];
}) {
  const { parsed, primaryPrediction, ruleRecommendations, dataCheck, reportClassification, agreement, uploadedSlots } = result;

  return (
    <div className="space-y-3">
      {result.cancerTypeMismatch && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            You selected <b>{result.cancerTypeMismatch.selected}</b> but the report text detected{" "}
            <b>{result.cancerTypeMismatch.detected}</b>. The prediction below used your selected type — verify the
            uploaded document matches.
          </span>
        </div>
      )}

      {uploadedSlots && uploadedSlots.length > 0 && <UploadedSlotsCard slots={uploadedSlots} />}

      <ReportTypeCard rc={reportClassification} />
      <DataCheckCard dc={dataCheck} />
      <ExtractedCard parsed={parsed} />

      {result.predictionBlocked ? (
        <BlockedCard reason={result.blockReason} message={result.blockMessage} markerMismatch={reportClassification.markerMismatch} />
      ) : (
        <>
          {primaryPrediction && <AgreementBanner agreement={agreement} ml={primaryPrediction} rules={ruleRecommendations} />}
          <MLPredictionCard ml={primaryPrediction} parsed={parsed} secondaryAnalyses={secondaryAnalyses} />
        </>
      )}

      <RulesCard rules={ruleRecommendations} />
      {primaryPrediction?.featureImportance && <FeatureImportanceCard fi={primaryPrediction.featureImportance} />}

      <div className="card">
        <CardHeading icon={StickyNote}>Extracted Text (preview)</CardHeading>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-600">
          {parsed.rawText || "(no text extracted)"}
        </pre>
      </div>
    </div>
  );
}

function UploadedSlotsCard({ slots }: { slots: UploadedSlot[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <CardHeading icon={FolderOpen}>Reports Analyzed ({slots.length})</CardHeading>
        <Badge color="green">{slots.length} combined</Badge>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {slots.map((s, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <SlotTypeIcon slotId={s.slotId} size={15} strokeWidth={2} className="shrink-0 text-slate-400" />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-slate-800">
                {SLOT_TYPE_ICONS[s.slotId] ? s.slotId.replace(/_/g, " ") : s.slotId}
              </div>
              <div className="truncate text-[12px] text-slate-400">{s.filename} · {s.chars.toLocaleString()} chars</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TYPE_COLOR: Record<string, keyof typeof badgeClass> = {
  HISTOPATHOLOGY: "green", COLONOSCOPY: "blue", IMAGING: "blue", MOLECULAR: "purple",
  TUMOR_MARKER: "yellow", BLOOD: "grey", SURGICAL_PATH: "green", CLINICAL_NOTES: "grey", UNKNOWN: "red",
};

function ReportTypeCard({ rc }: { rc: AnalysisResult["reportClassification"] }) {
  if (!rc.primaryType) return null;
  const Icon = REPORT_TYPE_ICONS[rc.primaryType] || REPORT_TYPE_ICONS.UNKNOWN;
  const color = TYPE_COLOR[rc.primaryType] || "grey";
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <CardHeading icon={ListChecks}>Report Type Analysis</CardHeading>
        <Badge color={color}>
          <Icon size={11} /> {rc.primaryLabel}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(rc.allTypes || []).slice(0, 4).map((t, i) => {
          const TIcon = REPORT_TYPE_ICONS[t.type] || REPORT_TYPE_ICONS.UNKNOWN;
          return (
            <span key={i} className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[12px] text-slate-500">
              <TIcon size={11} /> {t.label}
            </span>
          );
        })}
      </div>
      {rc.markerMismatch && (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>{rc.markerMismatch.marker.toUpperCase()}</b> is a tumour marker for <b>{rc.markerMismatch.expectedCancer}</b>. Do
            not use this marker alone to classify a different cancer type.
          </span>
        </div>
      )}
      {rc.isTumorMarkerOnly && (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertOctagon size={15} className="mt-0.5 shrink-0" />
          <span>
            This is a standalone tumour marker report. Tumour markers alone cannot determine cancer type, stage, or
            treatment. A histopathology/biopsy report is required.
          </span>
        </div>
      )}
    </div>
  );
}

function DataCheckCard({ dc }: { dc: DataCheck }) {
  if (dc.completeness == null) return null;
  const tierColor: Record<string, keyof typeof badgeClass> = { complete: "green", partial: "yellow", insufficient: "red" };
  const color = tierColor[dc.dataTier || ""] || "grey";
  const barColor: Record<string, string> = { green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500", grey: "bg-slate-400" };

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <CardHeading icon={ListChecks}>Data Completeness</CardHeading>
        <Badge color={color}>{dc.completeness}% · {cap(dc.dataTier)}</Badge>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${barColor[color]}`} style={{ width: `${dc.completeness}%` }} />
      </div>

      {dc.molecularNeeded && (
        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm text-purple-800">
          <Zap size={15} className="mt-0.5 shrink-0" />
          Molecular / genetic testing recommended for this cancer type.
        </div>
      )}

      {dc.missingReports && dc.missingReports.length > 0 && (
        <>
          <p className="section-label mt-4">Reports Still Needed ({dc.missingReports.length})</p>
          <div className="mt-2 space-y-1">
            {dc.missingReports.map((r) => (
              <RequirementRow key={r.id} req={r} status="missing" />
            ))}
          </div>
        </>
      )}

      {dc.satisfiedReports && dc.satisfiedReports.length > 0 && (
        <>
          <p className="section-label mt-4">Reports Detected ({dc.satisfiedReports.length})</p>
          <div className="mt-2 space-y-1">
            {dc.satisfiedReports.map((r) => (
              <RequirementRow key={r.id} req={r} status="ok" />
            ))}
          </div>
        </>
      )}

      {dc.conditionalReports && dc.conditionalReports.length > 0 && (
        <>
          <p className="section-label mt-4 text-brand-600">Conditional Reports (Breast Cancer)</p>
          <p className="mb-2 text-[12px] text-slate-400">
            Recommended after primary analysis to refine the chemotherapy plan.
          </p>
          <div className="mt-2 space-y-1">
            {dc.conditionalReports.map((r) => {
              const missing = dc.missingConditional?.some((m) => m.id === r.id);
              return <RequirementRow key={r.id} req={r} status={missing ? "missing" : "ok"} />;
            })}
          </div>
        </>
      )}

      {dc.clinicalNotes && dc.clinicalNotes.length > 0 && (
        <div className="mt-4 space-y-1 rounded-lg bg-slate-50 p-3">
          <p className="section-label">Clinical Notes</p>
          {dc.clinicalNotes.map((n, i) => (
            <p key={i} className="text-[13px] text-slate-600">
              <span className="font-semibold text-slate-700">{n.field.toUpperCase()}</span>: {n.note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function RequirementRow({ req, status }: { req: { icon: string; name: string; reason?: string }; status: "ok" | "missing" }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-[13px] ${
        status === "ok" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
      }`}
    >
      {status === "ok" ? (
        <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
      ) : (
        <AlertCircle size={15} className="shrink-0 text-red-400" />
      )}
      <div className="flex-1">
        <div className="font-medium text-slate-800">{req.name}</div>
        {req.reason && <div className="text-[12px] text-slate-400">{req.reason}</div>}
      </div>
      <span className={`text-[11px] font-semibold ${status === "ok" ? "text-emerald-700" : "text-red-600"}`}>
        {status === "ok" ? "Present" : "Needed"}
      </span>
    </div>
  );
}

const BM_FIELDS: [string, string][] = [
  ["HER2", "her2"], ["ER", "er"], ["PR", "pr"], ["EGFR", "egfr"], ["ALK", "alk"],
  ["PD-L1", "pdl1"], ["KRAS", "kras"], ["NRAS", "nras"], ["BRAF", "braf"],
  ["MMR", "mmr"], ["MSI", "msi"], ["BRCA", "brca"], ["ROS1", "ros1"],
  ["MLH1", "mlh1"], ["MSH2", "msh2"], ["MSH6", "msh6"], ["PMS2", "pms2"],
  ["FLT3", "flt3"], ["NPM1", "npm1"],
];

function bmColor(v: string): string {
  const s = String(v).toLowerCase();
  if (["positive", ">=50%", "intact", "proficient"].includes(s)) return "text-emerald-700";
  if (["negative", "lost"].includes(s)) return "text-red-700";
  if (["mutated", "deficient (dmmr)", "itd-positive"].includes(s)) return "text-orange-700";
  if (s === "wild-type") return "text-slate-400";
  return "text-slate-900";
}

function ExtractedCard({ parsed }: { parsed: ParsedReport }) {
  const items: { l: string; v: string; c: string }[] = [];
  const add = (l: string, v: string | number | null | undefined, c = "") => {
    if (v != null && v !== "N/A" && v !== "") items.push({ l, v: String(v), c });
  };

  add("Cancer Type", parsed.cancerType || "Not detected", parsed.cancerType ? "" : "text-slate-300");
  add("Stage", parsed.stage || "Not detected", parsed.stage ? "" : "text-slate-300");
  if (parsed.tStage) add("T Stage", "T" + parsed.tStage);
  if (parsed.nStage) add("N Stage", "N" + parsed.nStage);
  if (parsed.mStage) add("M Stage", "M" + parsed.mStage);
  add("Grade", parsed.grade ? cap(parsed.grade) + " Grade" : null);
  add("Histology", parsed.histology);
  add("Primary Site", parsed.primarySite);
  add("Age", parsed.age ? parsed.age + " years" : null);
  add("ECOG PS", parsed.performanceStatus != null ? "PS " + parsed.performanceStatus : null);
  add("Tumour Size", parsed.tumorSize ? parsed.tumorSize + " cm" : null);
  if (parsed.lvInvasion) add("LVI", cap(parsed.lvInvasion), parsed.lvInvasion === "present" ? "text-red-700" : "");
  if (parsed.periNeuralInvasion)
    add("PNI", cap(parsed.periNeuralInvasion), parsed.periNeuralInvasion === "present" ? "text-red-700" : "");
  if (parsed.depthOfInvasion) add("Depth", parsed.depthOfInvasion);
  if (parsed.surgicalMargins)
    add("Margins", cap(parsed.surgicalMargins), parsed.surgicalMargins === "clear" ? "text-emerald-700" : "text-red-700");
  if (parsed.lymphNodes?.lymphNodeStatus) {
    const ln = parsed.lymphNodes;
    add(
      "Lymph Nodes",
      cap(ln.lymphNodeStatus!) + (ln.lymphNodesPositive != null ? ` (${ln.lymphNodesPositive}/${ln.lymphNodesTotal ?? "?"})` : ""),
      ln.lymphNodeStatus === "negative" ? "text-emerald-700" : "text-red-700"
    );
  }

  const bm = parsed.biomarkers || {};
  BM_FIELDS.forEach(([l, k]) => {
    if (bm[k]) add(l, cap(String(bm[k])), bmColor(String(bm[k])));
  });

  const tm = parsed.tumorMarkers || {};
  const withUnit = (v: string | number | undefined, unit: string) =>
    typeof v === "number" ? `${v} ${unit}` : v != null ? cap(String(v)) : null;
  add("CEA", withUnit(tm.cea, "ng/mL"));
  add("CA 15-3", withUnit(tm.ca153, "U/mL"));
  add("CA 19-9", withUnit(tm.ca199, "U/mL"));
  add("CA-125", withUnit(tm.ca125, "U/mL"));
  add("AFP", withUnit(tm.afp, "ng/mL"));
  add("PSA", withUnit(tm.psa, "ng/mL"));
  if (bm.ki67 != null) add("Ki67", `${bm.ki67}%`, Number(bm.ki67) > 20 ? "text-red-700" : "");

  const confBadge: Record<string, { color: keyof typeof badgeClass; label: string }> = {
    high: { color: "green", label: "High confidence" },
    medium: { color: "yellow", label: "Medium confidence" },
    low: { color: "red", label: "Low confidence" },
  };
  const conf = confBadge[parsed.confidence || "low"];

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <CardHeading icon={ClipboardList}>Extracted Clinical Data</CardHeading>
        <Badge color={conf.color}>{conf.label}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No clinical data could be extracted from the provided reports.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((i, idx) => (
            <div key={idx} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-[11px] text-slate-400">{i.l}</div>
              <div className={`text-[13px] font-medium ${i.c || "text-slate-900"}`}>{i.v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BLOCK_TITLES: Record<string, string> = {
  TUMOR_MARKER_ONLY_NO_CANCER: "Prediction Blocked — Tumour Marker Only",
  MARKER_CANCER_MISMATCH: "Prediction Blocked — Marker / Cancer Mismatch",
  NO_CANCER_TYPE: "Prediction Blocked — Cancer Type Not Confirmed",
};

function BlockedCard({
  reason,
  message,
  markerMismatch,
}: {
  reason: string | null;
  message: string | null;
  markerMismatch?: { marker: string; expectedCancer: string } | null;
}) {
  return (
    <div className="card border-red-200 bg-red-50/60">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-red-800">
        <AlertOctagon size={17} /> {BLOCK_TITLES[reason || ""] || "Prediction Blocked"}
      </h2>
      <p className="mt-2 text-sm text-red-700">{message}</p>
      {markerMismatch && (
        <dl className="mt-3 space-y-1 text-sm text-red-700">
          <div className="flex justify-between"><dt>Marker</dt><dd className="font-medium">{markerMismatch.marker.toUpperCase()}</dd></div>
          <div className="flex justify-between"><dt>Associated cancer</dt><dd className="font-medium">{markerMismatch.expectedCancer}</dd></div>
        </dl>
      )}
      <div className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-700">
        <b>What to do:</b>
        <ul className="mt-1 list-disc pl-5 space-y-0.5">
          <li>Upload the Histopathology / Biopsy Report confirming cancer type</li>
          <li>Add CECT staging results (T/N/M stage)</li>
          <li>Include KRAS / NRAS / BRAF / MMR molecular results</li>
        </ul>
      </div>
    </div>
  );
}

function AgreementBanner({
  agreement,
  ml,
  rules,
}: {
  agreement: AnalysisResult["agreement"];
  ml: PrimaryPrediction;
  rules: RuleRecommendation[];
}) {
  if (!agreement || !rules.length) return null;
  const mlC = ml.predictedCycles;
  const rC = rules[0]?.cycles;
  const cfg: Record<string, { cls: string; icon: LucideIcon; text: React.ReactNode }> = {
    strong: { cls: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, text: <>ML and NCCN agree: <b>{mlC} cycles</b>. High confidence.</> },
    moderate: { cls: "border-brand-200 bg-brand-50 text-brand-800", icon: Info, text: <>ML ({mlC} cycles) and NCCN ({rC} cycles) closely aligned.</> },
    divergent: { cls: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle, text: <>ML predicts {mlC} cycles; NCCN references {rC} cycles. Review both.</> },
  };
  const c = cfg[agreement];
  if (!c) return null;
  const Icon = c.icon;
  return (
    <div className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm ${c.cls}`}>
      <Icon size={16} className="shrink-0" /> {c.text}
    </div>
  );
}

function MLPredictionCard({
  ml,
  parsed,
  secondaryAnalyses,
}: {
  ml: PrimaryPrediction | null;
  parsed: ParsedReport;
  secondaryAnalyses: SecondaryAnalysis[];
}) {
  if (!ml) {
    return (
      <div className="card">
        <CardHeading icon={BrainCircuit}>ML Prediction</CardHeading>
        <p className="mt-2 text-sm text-slate-400">
          Add more report data (histopathology, staging) to enable ML prediction.
        </p>
      </div>
    );
  }

  const isCont = ml.predictedCycles === 0;
  const plan = generateTreatmentPlan(ml, parsed, secondaryAnalyses);

  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between">
        <CardHeading icon={BrainCircuit}>ML Prediction</CardHeading>
        <Badge color="blue">{ml.datasetCancerType || "Matched"}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-brand-50 py-4">
          <div className="text-2xl font-semibold tracking-tight text-brand-800">{isCont ? "Cont." : ml.predictedCycles}</div>
          <div className="text-[12px] text-slate-500">{isCont ? "Continuous / Targeted" : "Chemotherapy Cycles"}</div>
        </div>
        <div className="rounded-lg bg-slate-50 py-4">
          <div className="text-lg font-semibold text-slate-700">{ml.cycleBucket}</div>
          <div className="text-[12px] text-slate-500">Cycle Range (ML)</div>
        </div>
        <div className="rounded-lg bg-emerald-50 py-4">
          <div className="text-2xl font-semibold tracking-tight text-emerald-700">{ml.modelAccuracy}</div>
          <div className="text-[12px] text-slate-500">Model Accuracy</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-slate-400" />
          <span className="text-[13px] font-semibold text-slate-900">Detailed Treatment Plan</span>
        </div>

        <div className="mt-3">
          <div className="section-label flex items-center gap-1.5"><Target size={11} /> Recommended Regimen</div>
          <div className="mt-1 text-[13px] font-medium text-slate-900">{ml.regimen}</div>
          {plan.drugs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plan.drugs.map((d, i) => (
                <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-600">{d}</span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ScheduleItem label="Total Cycles" value={isCont ? "Continuous" : String(ml.predictedCycles)} />
          <ScheduleItem label="Cycle Interval" value={plan.interval} />
          <ScheduleItem label="Duration" value={plan.duration} />
          <ScheduleItem label="Intent" value={cap(plan.intent)} />
        </div>

        {plan.supportiveCare.length > 0 && <PlanList icon={Pill} title="Supportive Care" items={plan.supportiveCare} />}
        {plan.monitoring.length > 0 && <PlanList icon={Activity} title="Monitoring & Follow-up" items={plan.monitoring} />}
        {plan.notes.length > 0 && <PlanList icon={StickyNote} title="Clinical Notes" items={plan.notes} />}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge color="blue">{ml.datasetCancerType || "Matched"}</Badge>
        <Badge color="grey">Stage {ml.datasetStage}</Badge>
        {ml.similarPatients ? <Badge color="grey">~{ml.similarPatients.toLocaleString()} similar patients</Badge> : null}
        <Badge color="green">{ml.trainingPatients?.toLocaleString()} training patients</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScheduleItem label="Mean Cycles" value={String(ml.predictedCycleMean ?? "-")} />
        <ScheduleItem label="Model" value="Random Forest (300 trees)" />
        <ScheduleItem label="Data Sources" value="SEER · NCCN · ACS 2023" />
        <ScheduleItem label="CRC Features" value="T/N/M · CEA · LVI · MMR · KRAS" />
      </div>

      {ml.biomarkerNotes && ml.biomarkerNotes.length > 0 && (
        <div>
          <p className="section-label flex items-center gap-1.5"><Zap size={11} /> Biomarker Adjustments Applied</p>
          <div className="mt-1.5 space-y-1">
            {ml.biomarkerNotes.map((n, i) => (
              <p key={i} className="text-[13px] text-slate-600">{n}</p>
            ))}
          </div>
        </div>
      )}
      {ml.psNote && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {ml.psNote}
        </div>
      )}
      {ml.completenessNote && (
        <div className="flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <Info size={15} className="mt-0.5 shrink-0" /> {ml.completenessNote}
        </div>
      )}
    </div>
  );
}

function ScheduleItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-[13px] font-medium text-slate-900">{value}</div>
    </div>
  );
}

function PlanList({ icon: Icon, title, items }: { icon: LucideIcon; title: string; items: string[] }) {
  return (
    <div className="mt-4">
      <div className="section-label flex items-center gap-1.5"><Icon size={11} /> {title}</div>
      <div className="mt-1.5 space-y-1">
        {items.map((s, i) => (
          <div key={i} className="rounded-lg bg-slate-50 px-3 py-1.5 text-[13px] text-slate-600">{s}</div>
        ))}
      </div>
    </div>
  );
}

function RulesCard({ rules }: { rules: RuleRecommendation[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <CardHeading icon={BookOpen}>NCCN Rule-Based Recommendations</CardHeading>
        <Badge color={rules.length ? "blue" : "grey"}>
          {rules.length ? `${rules.length} matched` : "0 matched"}
        </Badge>
      </div>
      {rules.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">
          No NCCN protocol matched. Provide complete histopathology and staging data.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {rules.map((r, i) => {
            const confColor: Record<string, keyof typeof badgeClass> = { High: "green", Moderate: "yellow", Low: "grey" };
            return (
              <div key={i} className={`rounded-lg border p-4 ${i === 0 ? "border-brand-200 bg-brand-50/30" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[13px] font-medium text-slate-900">{r.regimen}</div>
                  <div className="flex shrink-0 gap-1.5">
                    {r.intent && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-600">{r.intent}</span>}
                    {r.confidence && <Badge color={confColor[r.confidence] || "grey"}>{r.confidence}</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-semibold tracking-tight text-slate-900">{r.cycles > 0 ? r.cycles : "—"}</span>
                  <span className="text-[12px] text-slate-400">
                    {r.cycles > 0 ? `cycles · every ${r.interval} days` : "Continuous therapy"}
                  </span>
                </div>
                {r.drugs && r.drugs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.drugs.map((d, di) => (
                      <span key={di} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-600">{d}</span>
                    ))}
                  </div>
                )}
                {r.cycles > 0 && r.interval && (
                  <p className="mt-1 text-[12px] text-slate-400">
                    Total: {r.cycles} cycles × {r.interval} days = {r.cycles * r.interval} days treatment
                  </p>
                )}
                {r.duration && <p className="mt-2 text-[13px] text-slate-600"><b className="text-slate-800">Duration:</b> {r.duration}</p>}
                {r.notes && <p className="mt-1 text-[13px] text-slate-500">{r.notes}</p>}
                {r.reference && <p className="mt-1 text-[11px] text-slate-400">Reference: {r.reference}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const FI_LABELS: Record<string, string> = {
  cancer_type: "Cancer Type", age: "Patient Age", stage: "Disease Stage",
  ecog_ps: "ECOG PS", kras_status: "KRAS Status", mmr_status: "MMR/MSI",
  t_stage: "T Stage (Depth)", n_stage: "N Stage (Nodes)",
  lvi: "Lymphovascular Inv.", depth_of_invasion: "Depth of Invasion",
  pni: "Perineural Invasion", braf_status: "BRAF Status",
  nras_status: "NRAS Status", her2_status: "HER2 Status",
  egfr_status: "EGFR Status", pdl1_status: "PD-L1",
  treatment_intent: "Treatment Intent", prior_treatment: "Prior Treatment",
  charlson_score: "Charlson Score", grade: "Tumour Grade",
  primary_site: "Primary Site", gender: "Gender", hr_status: "HR Status",
};

function FeatureImportanceCard({ fi }: { fi: Record<string, number> }) {
  const entries = Object.entries(fi).slice(0, 12);
  if (entries.length === 0) return null;
  const max = entries[0][1];
  return (
    <div className="card">
      <CardHeading icon={BarChart3}>Feature Importance</CardHeading>
      <div className="mt-3 space-y-2">
        {entries.map(([k, v]) => {
          const pct = ((v / max) * 100).toFixed(0);
          const label = FI_LABELS[k] || k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          return (
            <div key={k} className="grid grid-cols-[140px_1fr_44px] items-center gap-2 text-[13px]">
              <div className="truncate text-slate-500">{label}</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-right text-[11px] tabular-nums text-slate-400">{(v * 100).toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cap(s?: string | null) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export { Badge, badgeClass, CardHeading };
