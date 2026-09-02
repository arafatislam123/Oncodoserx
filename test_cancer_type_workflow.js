/**
 * Test script for cancer-type-specific workflow
 */

const http = require("http");

const BASE = "http://localhost:3000";

function request(path, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { "Content-Type": "application/json" },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log("=== Cancer Type Workflow Tests ===\n");

  // Test 1: Get all cancer types
  console.log("1. Testing /api/cancer-types...");
  const typesRes = await request("/api/cancer-types");
  console.log(`   Status: ${typesRes.status}`);
  console.log(`   Total cancer types: ${typesRes.data.cancerTypes?.length || 0}`);
  console.log(`   Sample types: ${typesRes.data.cancerTypes?.slice(0, 3).map(t => t.id).join(", ")}`);
  console.log();

  // Test 2: Get requirements for Breast Cancer
  console.log("2. Testing /api/cancer-type/Breast Cancer/requirements...");
  const reqRes = await request("/api/cancer-type/Breast%20Cancer/requirements");
  console.log(`   Status: ${reqRes.status}`);
  console.log(`   Cancer Type: ${reqRes.data.cancerType}`);
  console.log(`   Required Reports: ${reqRes.data.requiredReports?.length || 0}`);
  console.log(`   Report IDs: ${reqRes.data.requiredReports?.map(r => r.id).join(", ")}`);
  console.log();

  // Test 3: Get requirements for Brain Cancer
  console.log("3. Testing /api/cancer-type/Brain Cancer/requirements...");
  const brainRes = await request("/api/cancer-type/Brain%20Cancer/requirements");
  console.log(`   Status: ${brainRes.status}`);
  console.log(`   Cancer Type: ${brainRes.data.cancerType}`);
  console.log(`   Required Reports: ${brainRes.data.requiredReports?.length || 0}`);
  console.log(`   Report IDs: ${brainRes.data.requiredReports?.map(r => r.id).join(", ")}`);
  console.log();

  // Test 4: Analyze with cancer type specified
  console.log("4. Testing /api/analyze-text with cancerType...");
  const analyzeRes = await request("/api/analyze-text", "POST", {
    text: "BREAST CANCER REPORT\n\nPatient: 55-year-old female\nDiagnosis: Invasive ductal carcinoma of the breast, ER positive, PR positive, HER2 negative, Grade 2, Stage IIA (T2N0M0).\n\nRecommendation: Adjuvant chemotherapy with dose-dense AC-T (doxorubicin + cyclophosphamide followed by paclitaxel).",
    cancerType: "Breast Cancer",
  });
  console.log(`   Status: ${analyzeRes.status}`);
  console.log(`   Success: ${analyzeRes.data.success}`);
  console.log(`   Parsed Cancer Type: ${analyzeRes.data.parsed?.cancerType}`);
  console.log(`   Has ML Prediction: ${!!analyzeRes.data.primaryPrediction}`);
  console.log(`   Has Rules: ${analyzeRes.data.ruleRecommendations?.length > 0}`);
  console.log(`   Prediction Blocked: ${analyzeRes.data.predictionBlocked}`);
  console.log(`   Data Check Can Predict: ${analyzeRes.data.dataCheck?.canPredict}`);
  console.log();

  // Test 5: Analyze with mismatched cancer type
  console.log("5. Testing /api/analyze-text with mismatched cancerType...");
  const mismatchRes = await request("/api/analyze-text", "POST", {
    text: "Patient has lung adenocarcinoma with EGFR mutation, Stage IV.",
    cancerType: "Breast Cancer",
  });
  console.log(`   Status: ${mismatchRes.status}`);
  console.log(`   Success: ${mismatchRes.data.success}`);
  console.log(`   Has Mismatch Warning: ${!!mismatchRes.data.cancerTypeMismatch}`);
  console.log();

  console.log("=== All tests completed ===");
}

runTests().catch(console.error);
