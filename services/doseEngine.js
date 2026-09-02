/**
 * OncoDoseRx — Chemotherapy Dose Engine
 * Calculates chemotherapy drug doses based on BSA and standard protocols
 */

"use strict";

/**
 * Calculate chemotherapy dose
 * @param {Object} params
 * @param {string} params.drug - Drug name
 * @param {number} params.bsa - Body Surface Area in m²
 * @param {number} params.standardDose - Standard dose in mg/m²
 * @param {number} params.doseReduction - Dose reduction percentage (0-100)
 * @param {string} params.formula - BSA formula used
 * @param {string} params.route - Administration route
 * @param {string} params.frequency - Dosing frequency
 */
function calculateDose({ drug, bsa, standardDose, doseReduction = 0, formula = "Mosteller", route = "IV", frequency = "Every 3 weeks" }) {
  if (!bsa || bsa <= 0) {
    throw new Error("Invalid BSA value");
  }
  if (!standardDose || standardDose <= 0) {
    throw new Error("Invalid standard dose");
  }
  if (doseReduction < 0 || doseReduction > 100) {
    throw new Error("Dose reduction must be between 0 and 100%");
  }

  const calculationSteps = [];
  const safetyWarnings = [];

  // Step 1: Calculate raw dose
  const rawDose = bsa * standardDose;
  calculationSteps.push({
    step: 1,
    description: "Calculate raw dose",
    formula: `BSA × Standard Dose = ${bsa.toFixed(2)} m² × ${standardDose} mg/m²`,
    result: `${rawDose.toFixed(2)} mg`,
  });

  // Step 2: Apply dose reduction if specified
  let adjustedDose = rawDose;
  if (doseReduction > 0) {
    const reductionAmount = rawDose * (doseReduction / 100);
    adjustedDose = rawDose - reductionAmount;
    calculationSteps.push({
      step: 2,
      description: "Apply dose reduction",
      formula: `Raw Dose × (1 - Reduction%) = ${rawDose.toFixed(2)} mg × (1 - ${doseReduction}%)`,
      result: `${adjustedDose.toFixed(2)} mg`,
      note: `Reduced by ${doseReduction}% (${reductionAmount.toFixed(2)} mg)`,
    });
    safetyWarnings.push(`Dose reduced by ${doseReduction}% from standard protocol`);
  }

  // Step 3: Round to clinical dose
  const roundedDose = roundToClinicalDose(adjustedDose, drug);
  calculationSteps.push({
    step: 3,
    description: "Round to clinical dose",
    formula: `Adjusted Dose → Rounded Dose`,
    result: `${roundedDose} mg`,
    note: getRoundingNote(drug, roundedDose),
  });

  // Step 4: Calculate per-cycle dose
  const cycleDose = roundedDose;
  calculationSteps.push({
    step: 4,
    description: "Final per-cycle dose",
    formula: `Rounded Dose = Final Dose`,
    result: `${cycleDose} mg per cycle`,
  });

  // Generate safety warnings
  if (bsa < 1.4) {
    safetyWarnings.push("Low BSA (<1.4 m²) - consider additional dose reduction for very small patients");
  }
  if (bsa > 2.5) {
    safetyWarnings.push("High BSA (>2.5 m²) - verify dose cap limits for this drug");
  }
  if (doseReduction >= 25) {
    safetyWarnings.push("Significant dose reduction (≥25%) - monitor for efficacy");
  }
  if (doseReduction >= 50) {
    safetyWarnings.push("Major dose reduction (≥50%) - consider alternative regimen");
  }

  // Drug-specific warnings
  const drugWarnings = getDrugSpecificWarnings(drug);
  safetyWarnings.push(...drugWarnings);

  return {
    drug,
    bsa: Math.round(bsa * 100) / 100,
    bsa_formula: formula,
    standard_dose_per_m2: standardDose,
    unit: "mg/m²",
    route,
    frequency,
    dose_reduction_percent: doseReduction,
    raw_dose_mg: Math.round(rawDose * 100) / 100,
    final_dose_mg: Math.round(adjustedDose * 100) / 100,
    rounded_dose_mg: roundedDose,
    calculation_steps: calculationSteps,
    safety_warnings: safetyWarnings,
    confidence_score: calculateConfidenceScore(bsa, standardDose, doseReduction),
  };
}

/**
 * Round dose to clinically appropriate increments
 */
function roundToClinicalDose(dose, drug) {
  const drugName = drug.toLowerCase();

  // Different rounding rules for different drugs
  if (drugName.includes("doxorubicin") || drugName.includes("adriamycin")) {
    return Math.round(dose / 5) * 5; // Round to nearest 5mg
  }
  if (drugName.includes("cisplatin")) {
    return Math.round(dose / 10) * 10; // Round to nearest 10mg
  }
  if (drugName.includes("paclitaxel")) {
    return Math.round(dose / 10) * 10; // Round to nearest 10mg
  }
  if (drugName.includes("5-fluorouracil") || drugName.includes("5-fu")) {
    return Math.round(dose / 50) * 50; // Round to nearest 50mg
  }
  if (drugName.includes("cyclophosphamide")) {
    return Math.round(dose / 100) * 100; // Round to nearest 100mg
  }
  if (drugName.includes("methotrexate")) {
    return Math.round(dose / 5) * 5; // Round to nearest 5mg
  }
  if (drugName.includes("vincristine")) {
    return Math.round(dose / 0.1) * 0.1; // Round to nearest 0.1mg
  }
  if (drugName.includes("bleomycin")) {
    return Math.round(dose / 5) * 5; // Round to nearest 5mg
  }
  if (drugName.includes("etoposide")) {
    return Math.round(dose / 50) * 50; // Round to nearest 50mg
  }
  if (drugName.includes("ifosfamide")) {
    return Math.round(dose / 250) * 250; // Round to nearest 250mg
  }

  // Default: round to nearest 5mg
  return Math.round(dose / 5) * 5;
}

/**
 * Get rounding note for specific drug
 */
function getRoundingNote(drug, roundedDose) {
  const drugName = drug.toLowerCase();

  if (drugName.includes("doxorubicin")) return "Rounded to nearest 5mg (standard for anthracyclines)";
  if (drugName.includes("cisplatin")) return "Rounded to nearest 10mg (standard for platinum compounds)";
  if (drugName.includes("paclitaxel")) return "Rounded to nearest 10mg (standard for taxanes)";
  if (drugName.includes("5-fluorouracil")) return "Rounded to nearest 50mg (standard for 5-FU)";
  if (drugName.includes("cyclophosphamide")) return "Rounded to nearest 100mg (standard for alkylating agents)";
  if (drugName.includes("methotrexate")) return "Rounded to nearest 5mg (standard for antifolates)";
  if (drugName.includes("vincristine")) return "Rounded to nearest 0.1mg (standard for vinca alkaloids)";
  if (drugName.includes("bleomycin")) return "Rounded to nearest 5mg (standard for bleomycin)";
  if (drugName.includes("etoposide")) return "Rounded to nearest 50mg (standard for topoisomerase inhibitors)";
  if (drugName.includes("ifosfamide")) return "Rounded to nearest 250mg (standard for ifosfamide)";

  return "Rounded to nearest 5mg (standard clinical practice)";
}

/**
 * Get drug-specific safety warnings
 */
function getDrugSpecificWarnings(drug) {
  const drugName = drug.toLowerCase();
  const warnings = [];

  if (drugName.includes("doxorubicin")) {
    warnings.push("Monitor cardiac function - cumulative dose limit 450-550 mg/m²");
    warnings.push("Administer via central line - vesicant");
  }
  if (drugName.includes("cisplatin")) {
    warnings.push("Ensure adequate hydration - nephrotoxic");
    warnings.push("Monitor electrolytes - magnesium, potassium");
    warnings.push("Anti-emetic prophylaxis required");
  }
  if (drugName.includes("paclitaxel")) {
    warnings.push("Pre-medication with steroids and antihistamines required");
    warnings.push("Monitor for hypersensitivity reactions");
  }
  if (drugName.includes("5-fluorouracil")) {
    warnings.push("Monitor for hand-foot syndrome");
    warnings.push("Dose adjust for DPD deficiency if known");
  }
  if (drugName.includes("cyclophosphamide")) {
    warnings.push("Ensure adequate hydration - hemorrhagic cystitis risk");
    warnings.push("MESNA may be required for high doses");
  }
  if (drugName.includes("methotrexate")) {
    warnings.push("Leucovorin rescue required for high doses");
    warnings.push("Monitor renal function and liver enzymes");
  }
  if (drugName.includes("vincristine")) {
    warnings.push("Neurotoxicity monitoring required");
    warnings.push("Constipation prophylaxis recommended");
  }
  if (drugName.includes("bleomycin")) {
    warnings.push("Monitor pulmonary function - pulmonary toxicity risk");
    warnings.push("Oxygen therapy caution - enhanced pulmonary toxicity");
  }
  if (drugName.includes("etoposide")) {
    warnings.push("Monitor blood counts - myelosuppression");
    warnings.push("Secondary leukemia risk with prolonged use");
  }
  if (drugName.includes("ifosfamide")) {
    warnings.push("MESNA required for hemorrhagic cystitis prevention");
    warnings.push("Monitor renal function and CNS toxicity");
  }

  return warnings;
}

/**
 * Calculate confidence score for dose calculation
 */
function calculateConfidenceScore(bsa, standardDose, doseReduction) {
  let score = 100;

  // BSA confidence
  if (bsa < 1.3 || bsa > 2.4) score -= 10; // Extreme BSA values

  // Dose reduction confidence
  if (doseReduction > 0) score -= 5;
  if (doseReduction > 25) score -= 10;
  if (doseReduction > 50) score -= 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate explanation for dose calculation
 */
function generateExplanation(doseResult) {
  const explanations = [];

  explanations.push(`The calculated dose of ${doseResult.drug} is based on the patient's Body Surface Area (BSA) of ${doseResult.bsa} m², calculated using the ${doseResult.bsa_formula} formula.`);

  explanations.push(`Standard dose: ${doseResult.standard_dose_per_m2} mg/m²`);

  if (doseResult.dose_reduction_percent > 0) {
    explanations.push(`A dose reduction of ${doseResult.dose_reduction_percent}% was applied due to patient-specific factors.`);
  }

  explanations.push(`Final calculated dose: ${doseResult.final_dose_mg} mg, rounded to ${doseResult.rounded_dose_mg} mg for clinical administration.`);

  explanations.push(`This dose is to be administered ${doseResult.frequency} via ${doseResult.route} route.`);

  return explanations.join(" ");
}

module.exports = {
  calculateDose,
  roundToClinicalDose,
  getDrugSpecificWarnings,
  calculateConfidenceScore,
  generateExplanation,
};
