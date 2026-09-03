// Client-side treatment plan generator — ported from public/app.js
// (generateTreatmentPlan). This is a presentational heuristic layer on top
// of the ML prediction; it does not call the API. The supportive-care /
// monitoring / notes text is authored content (see lib/i18n/treatmentPlan.*)
// so it's localized; `intent` stays a semantic key ("curative" etc.) for the
// UI to translate via common.intent*.
import type { ParsedReport, PrimaryPrediction, SecondaryAnalysis } from "./api";
import type { Lang } from "./i18n/context";
import { getTreatmentPlanContent } from "./i18n/treatmentPlanDict";

export interface TreatmentPlan {
  drugs: string[];
  interval: string;
  duration: string;
  intent: "curative" | "palliative" | "adjuvant" | "continuous";
  supportiveCare: string[];
  monitoring: string[];
  notes: string[];
}

export function generateTreatmentPlan(
  ml: PrimaryPrediction,
  parsed: ParsedReport,
  secondaryAnalyses: SecondaryAnalysis[] = [],
  lang: Lang = "en"
): TreatmentPlan {
  const c = getTreatmentPlanContent(lang);
  const cancerType = ml.datasetCancerType || "";
  const stage = ml.datasetStage || "";
  const cycles = ml.predictedCycles || 0;
  const regimen = ml.regimen || "";

  const plan: TreatmentPlan = {
    drugs: [],
    interval: c.interval,
    duration: "",
    intent: "curative",
    supportiveCare: [],
    monitoring: [],
    notes: [],
  };

  if (regimen.includes("+")) {
    plan.drugs = regimen.split("+").map((d) => d.trim()).filter(Boolean);
  } else if (regimen) {
    plan.drugs = [regimen];
  }

  if (cancerType.includes("Breast Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : "adjuvant";
    plan.supportiveCare = [...c.breast.supportiveCare];
    plan.monitoring = [...c.breast.monitoring];

    for (const sa of secondaryAnalyses) {
      const n = c.breast.secondaryNotes;
      if (sa.canAvoidChemo) {
        plan.notes.push(n.canAvoidChemo1, n.canAvoidChemo2);
      }
      if (sa.brcaResult === "Pathogenic mutation detected") {
        plan.notes.push(n.brcaPositive1, n.brcaPositive2);
      }
      if (sa.nodalStatus === "Node-negative") {
        plan.notes.push(n.nodeNegative1, n.nodeNegative2);
      } else if (sa.nodalStatus === "Node-positive") {
        plan.notes.push(n.nodePositive1, n.nodePositive2);
      }
    }
  } else if (cancerType.includes("Lung Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : stage === "I" ? "adjuvant" : "curative";
    plan.supportiveCare = [...c.lung.supportiveCare];
    plan.monitoring = [...c.lung.monitoring];
  } else if (cancerType.includes("Colorectal Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : "adjuvant";
    plan.supportiveCare = [...c.colorectal.supportiveCare];
    plan.monitoring = [...c.colorectal.monitoring];
  } else if (
    cancerType.includes("Brain") ||
    cancerType.includes("Glioblastoma") ||
    cancerType.includes("Glioma")
  ) {
    plan.intent = "curative";
    plan.supportiveCare = [...c.brain.supportiveCare];
    plan.monitoring = [...c.brain.monitoring];
    plan.notes.push(c.brain.stuppNote);
    if (cancerType.includes("Glioblastoma")) {
      plan.notes.push(c.brain.optuneNote);
    }
  } else if (cancerType.includes("Lymphoma")) {
    plan.intent = "curative";
    plan.supportiveCare = [...c.lymphoma.supportiveCare];
    plan.monitoring = [...c.lymphoma.monitoring];
  } else if (cancerType.includes("Leukemia")) {
    plan.intent = "curative";
    plan.supportiveCare = [...c.leukemia.supportiveCare];
    plan.monitoring = [...c.leukemia.monitoring];
  } else if (cancerType.includes("Ovarian")) {
    plan.intent = "curative";
    plan.supportiveCare = [...c.ovarian.supportiveCare];
    plan.monitoring = [...c.ovarian.monitoring];
  } else if (cancerType.includes("Pancreatic")) {
    plan.intent = stage === "IV" ? "palliative" : "curative";
    plan.supportiveCare = [...c.pancreatic.supportiveCare];
    plan.monitoring = [...c.pancreatic.monitoring];
  } else if (cancerType.includes("Prostate")) {
    plan.intent = stage === "IV" ? "palliative" : "curative";
    plan.supportiveCare = [...c.prostate.supportiveCare];
    plan.monitoring = [...c.prostate.monitoring];
  }

  if (cycles > 0) {
    plan.duration = c.durationTemplate.replace("{weeks}", String(cycles * 3)).replace("{cycles}", String(cycles));
  } else if (cycles === 0) {
    plan.duration = c.durationContinuous;
  }

  const ps = parsed.performanceStatus;
  if (ps != null && ps >= 2) {
    plan.notes.push(c.generalNotes.ecogPs2);
  }
  const age = parsed.age;
  if (age != null && age > 70) {
    plan.notes.push(c.generalNotes.ageOver70);
  }

  return plan;
}
