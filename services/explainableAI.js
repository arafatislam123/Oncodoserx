/**
 * OncoDoseRx — Explainable AI Service
 * Generates human-readable explanations for dose calculations and predictions
 */

"use strict";

const { calculateBSA } = require("./bsaCalculator");

/**
 * Generate explanation for BSA calculation
 */
function explainBSACalculation(bsaResult) {
  const explanations = [];

  explanations.push({
    title: "Body Surface Area (BSA) Calculation",
    summary: `Patient BSA calculated as ${bsaResult.bsa} m² using the ${bsaResult.formula} formula.`,
    details: {
      height: `${bsaResult.height_cm} cm`,
      weight: `${bsaResult.weight_kg} kg`,
      bmi: bsaResult.bmi,
      formula: bsaResult.formula,
      calculation: bsaResult.calculation,
    },
    confidence: 95,
    evidence: [
      "Height and weight extracted from patient records",
      `BSA formula: ${bsaResult.formula}`,
      "Standard oncology dosing uses BSA for drug calculations",
    ],
  });

  return explanations;
}

/**
 * Generate explanation for dose calculation
 */
function explainDoseCalculation(doseResult) {
  const explanations = [];

  explanations.push({
    title: "Chemotherapy Dose Calculation",
    summary: `Calculated dose of ${doseResult.drug}: ${doseResult.rounded_dose_mg} mg per cycle.`,
    details: {
      drug: doseResult.drug,
      bsa: doseResult.bsa,
      bsa_formula: doseResult.bsa_formula,
      standard_dose: `${doseResult.standard_dose_per_m2} ${doseResult.unit}`,
      raw_dose: `${doseResult.raw_dose_mg} mg`,
      dose_reduction: doseResult.dose_reduction_percent > 0 ? `${doseResult.dose_reduction_percent}%` : "None",
      final_dose: `${doseResult.final_dose_mg} mg`,
      rounded_dose: `${doseResult.rounded_dose_mg} mg`,
      route: doseResult.route,
      frequency: doseResult.frequency,
    },
    confidence: doseResult.confidence_score,
    evidence: [
      `BSA of ${doseResult.bsa} m² calculated from patient measurements`,
      `Standard dose of ${doseResult.standard_dose_per_m2} ${doseResult.unit} from clinical guidelines`,
      doseResult.dose_reduction_percent > 0 ? `Dose reduction of ${doseResult.dose_reduction_percent}% applied` : "No dose reduction applied",
      `Dose rounded to ${doseResult.rounded_dose_mg} mg for clinical administration`,
    ],
    calculation_steps: doseResult.calculation_steps,
    safety_warnings: doseResult.safety_warnings,
  });

  return explanations;
}

/**
 * Generate explanation for ML prediction
 */
function explainMLPrediction(prediction) {
  const explanations = [];

  if (!prediction) return explanations;

  explanations.push({
    title: "ML-Based Treatment Recommendation",
    summary: `Based on analysis of ${prediction.similarPatients || 0} similar patients, ${prediction.predictedCycles || 0} cycles are recommended.`,
    details: {
      source: prediction.source || "ML Model",
      dataset: prediction.datasetCancerType || "Unknown",
      predicted_cycles: prediction.predictedCycles,
      cycle_range: prediction.cycleBucket,
      regimen: prediction.regimen,
      model_accuracy: prediction.modelAccuracy,
      training_patients: prediction.trainingPatients,
    },
    confidence: prediction.modelAccuracy ? parseFloat(prediction.modelAccuracy) : null,
    evidence: [
      `Model trained on ${prediction.trainingPatients || 120000} patients`,
      `Similar patients found: ${prediction.similarPatients || 0}`,
      `Cancer type: ${prediction.datasetCancerType || "Unknown"}`,
      `Stage: ${prediction.datasetStage || "Unknown"}`,
      `Model accuracy: ${prediction.modelAccuracy || "N/A"}`,
    ],
    feature_importance: prediction.featureImportance,
  });

  return explanations;
}

/**
 * Generate explanation for rule-based recommendation
 */
function explainRuleRecommendation(recommendation) {
  const explanations = [];

  if (!recommendation) return explanations;

  explanations.push({
    title: "NCCN Guideline-Based Recommendation",
    summary: `Rule-based recommendation: ${recommendation.regimen} (${recommendation.cycles} cycles).`,
    details: {
      regimen: recommendation.regimen,
      cycles: recommendation.cycles,
      interval: recommendation.interval,
      duration: recommendation.duration,
      intent: recommendation.intent,
      reference: recommendation.reference,
    },
    confidence: 90,
    evidence: [
      `Based on ${recommendation.reference || "NCCN Guidelines"}`,
      `Indication: ${recommendation.cancerType || "Oncology"}`,
      `Stage: ${recommendation.stage || "Various"}`,
      `Intent: ${recommendation.intent || "Curative"}`,
    ],
    notes: recommendation.notes,
  });

  return explanations;
}

/**
 * Generate comprehensive explanation for a complete analysis
 */
function generateComprehensiveExplanation(analysisResult) {
  const allExplanations = [];

  // BSA explanation
  if (analysisResult.parsed?.height && analysisResult.parsed?.weight) {
    const bsaCalc = calculateBSA(analysisResult.parsed.height, analysisResult.parsed.weight, analysisResult.parsed.bsaFormula || "Mosteller");
    const bsaResult = {
      height_cm: bsaCalc.height_cm,
      weight_kg: bsaCalc.weight_kg,
      bsa: bsaCalc.preferred_bsa,
      formula: bsaCalc.preferred_formula,
      bmi: bsaCalc.bmi,
      calculation: bsaCalc.preferred_calculation,
    };
    allExplanations.push(...explainBSACalculation(bsaResult));
  }

  // Dose calculation explanation
  if (analysisResult.doseResults && analysisResult.doseResults.length > 0) {
    analysisResult.doseResults.forEach(dose => {
      allExplanations.push(...explainDoseCalculation(dose));
    });
  }

  // ML prediction explanation
  if (analysisResult.primaryPrediction) {
    allExplanations.push(...explainMLPrediction(analysisResult.primaryPrediction));
  }

  // Rule-based recommendations
  if (analysisResult.ruleRecommendations && analysisResult.ruleRecommendations.length > 0) {
    analysisResult.ruleRecommendations.forEach(rec => {
      allExplanations.push(...explainRuleRecommendation(rec));
    });
  }

  // Data completeness explanation
  if (analysisResult.dataCheck) {
    allExplanations.push({
      title: "Data Completeness Assessment",
      summary: `Data completeness: ${analysisResult.dataCheck.completeness}% (${analysisResult.dataCheck.dataTier} tier)`,
      details: {
        completeness: analysisResult.dataCheck.completeness,
        data_tier: analysisResult.dataCheck.dataTier,
        can_predict: analysisResult.dataCheck.canPredict,
        missing_required: analysisResult.dataCheck.missingRequired,
        missing_important: analysisResult.dataCheck.missingImportant,
      },
      confidence: analysisResult.dataCheck.completeness,
      evidence: [
        `Data tier: ${analysisResult.dataCheck.dataTier}`,
        `Can predict: ${analysisResult.dataCheck.canPredict ? "Yes" : "No"}`,
        analysisResult.dataCheck.missingRequired?.length > 0
          ? `Missing required: ${analysisResult.dataCheck.missingRequired.join(", ")}`
          : "All required data present",
        analysisResult.dataCheck.clinicalNotes?.length > 0
          ? `Clinical notes: ${analysisResult.dataCheck.clinicalNotes.join("; ")}`
          : "",
      ].filter(Boolean),
    });
  }

  return {
    success: true,
    explanations: allExplanations,
    overall_confidence: calculateOverallConfidence(allExplanations),
    summary: generateSummary(allExplanations),
  };
}

/**
 * Calculate BMI
 */
function calculateBMI(heightCm, weightKg) {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

/**
 * Calculate overall confidence score
 */
function calculateOverallConfidence(explanations) {
  if (explanations.length === 0) return 0;

  const confidences = explanations
    .filter(e => e.confidence !== null && e.confidence !== undefined)
    .map(e => e.confidence);

  if (confidences.length === 0) return 50;

  return Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
}

/**
 * Generate summary text
 */
function generateSummary(explanations) {
  if (explanations.length === 0) {
    return "No explanations available for this analysis.";
  }

  const parts = [];
  explanations.forEach(ex => {
    parts.push(ex.summary);
  });

  return parts.join(" ");
}

/**
 * Generate confidence score for extracted entities
 */
function calculateExtractionConfidence(entities) {
  if (!entities || entities.length === 0) return 0;

  const scores = entities
    .filter(e => e.confidence_score !== null && e.confidence_score !== undefined)
    .map(e => parseFloat(e.confidence_score));

  if (scores.length === 0) return 50;

  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
}

module.exports = {
  explainBSACalculation,
  explainDoseCalculation,
  explainMLPrediction,
  explainRuleRecommendation,
  generateComprehensiveExplanation,
  calculateBMI,
  calculateOverallConfidence,
  calculateExtractionConfidence,
};
