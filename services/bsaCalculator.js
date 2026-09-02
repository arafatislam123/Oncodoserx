/**
 * OncoDoseRx — BSA Calculator Service
 * Calculates Body Surface Area using multiple formulas
 */

"use strict";

/**
 * Calculate BSA using Mosteller formula
 * BSA = sqrt((height_cm * weight_kg) / 3600)
 */
function calculateMosteller(heightCm, weightKg) {
  const bsa = Math.sqrt((heightCm * weightKg) / 3600);
  return {
    formula: "Mosteller",
    bsa: Math.round(bsa * 100) / 100,
    calculation: `√(${heightCm} × ${weightKg}) / 3600 = √${(heightCm * weightKg).toFixed(2)} / 3600 = ${bsa.toFixed(4)} m²`,
  };
}

/**
 * Calculate BSA using Du Bois formula
 * BSA = 0.007184 × height^0.725 × weight^0.425
 */
function calculateDuBois(heightCm, weightKg) {
  const bsa = 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
  return {
    formula: "Du Bois",
    bsa: Math.round(bsa * 100) / 100,
    calculation: `0.007184 × ${heightCm}^0.725 × ${weightKg}^0.425 = ${bsa.toFixed(4)} m²`,
  };
}

/**
 * Calculate BSA using Haycock formula
 * BSA = 0.024265 × height^0.3964 × weight^0.5378
 */
function calculateHaycock(heightCm, weightKg) {
  const bsa = 0.024265 * Math.pow(heightCm, 0.3964) * Math.pow(weightKg, 0.5378);
  return {
    formula: "Haycock",
    bsa: Math.round(bsa * 100) / 100,
    calculation: `0.024265 × ${heightCm}^0.3964 × ${weightKg}^0.5378 = ${bsa.toFixed(4)} m²`,
  };
}

/**
 * Calculate BSA using Boyd formula
 * BSA = 0.0003207 × weight^0.7285 - 0.0188 × log(weight) × height^0.3
 */
function calculateBoyd(heightCm, weightKg) {
  const bsa = 0.0003207 * Math.pow(weightKg, 0.7285) - 0.0188 * Math.log(weightKg) * Math.pow(heightCm, 0.3);
  return {
    formula: "Boyd",
    bsa: Math.round(bsa * 100) / 100,
    calculation: `0.0003207 × ${weightKg}^0.7285 - 0.0188 × ln(${weightKg}) × ${heightCm}^0.3 = ${bsa.toFixed(4)} m²`,
  };
}

/**
 * Calculate BSA using Gehan and George formula
 * BSA = 0.0235 × height^0.42246 × weight^0.51456
 */
function calculateGehanGeorge(heightCm, weightKg) {
  const bsa = 0.0235 * Math.pow(heightCm, 0.42246) * Math.pow(weightKg, 0.51456);
  return {
    formula: "Gehan & George",
    bsa: Math.round(bsa * 100) / 100,
    calculation: `0.0235 × ${heightCm}^0.42246 × ${weightKg}^0.51456 = ${bsa.toFixed(4)} m²`,
  };
}

/**
 * Calculate BSA using all available formulas and return the average
 */
function calculateBSA(heightCm, weightKg, preferredFormula = "Mosteller") {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    throw new Error("Invalid height or weight values");
  }

  const results = {
    Mosteller: calculateMosteller(heightCm, weightKg),
    "Du Bois": calculateDuBois(heightCm, weightKg),
    Haycock: calculateHaycock(heightCm, weightKg),
    Boyd: calculateBoyd(heightCm, weightKg),
    "Gehan & George": calculateGehanGeorge(heightCm, weightKg),
  };

  const preferred = results[preferredFormula] || results["Mosteller"];

  // Calculate average BSA across all formulas
  const values = Object.values(results).map(r => r.bsa);
  const avgBSA = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;

  return {
    height_cm: heightCm,
    weight_kg: weightKg,
    bmi: Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10,
    preferred_formula: preferredFormula,
    preferred_bsa: preferred.bsa,
    preferred_calculation: preferred.calculation,
    average_bsa: avgBSA,
    all_formulas: results,
    interpretation: interpretBSA(preferred.bsa),
  };
}

/**
 * Interpret BSA value
 */
function interpretBSA(bsa) {
  if (bsa < 1.5) return "Low BSA - typical for children or small adults";
  if (bsa < 1.7) return "Below average BSA - typical for smaller adults";
  if (bsa < 2.0) return "Average BSA - typical for average adults";
  if (bsa < 2.3) return "Above average BSA - typical for larger adults";
  return "High BSA - typical for very large or obese adults";
}

/**
 * Validate BSA inputs
 */
function validateBSAInputs(heightCm, weightKg) {
  const errors = [];

  if (!heightCm || isNaN(heightCm)) {
    errors.push("Height is required");
  } else if (heightCm < 30 || heightCm > 300) {
    errors.push("Height must be between 30 and 300 cm");
  }

  if (!weightKg || isNaN(weightKg)) {
    errors.push("Weight is required");
  } else if (weightKg < 1 || weightKg > 500) {
    errors.push("Weight must be between 1 and 500 kg");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  calculateBSA,
  calculateMosteller,
  calculateDuBois,
  calculateHaycock,
  calculateBoyd,
  calculateGehanGeorge,
  validateBSAInputs,
  interpretBSA,
};
