/* ═══════════════════════════════════════════════════════════════════
   OncoDoseRx — Frontend v3  (Multi-Report Intake)
   ═══════════════════════════════════════════════════════════════════ */
"use strict";

const $ = id => document.getElementById(id);

// ── Allowed file types ────────────────────────────────────────────────────────
const ALLOWED_EXTS = new Set([".pdf",".txt",".png",".jpg",".jpeg",".webp"]);
const IMAGE_EXTS   = new Set([".png",".jpg",".jpeg",".webp"]);
const getExt = n  => n.slice(n.lastIndexOf(".")).toLowerCase();
const isImg  = f  => IMAGE_EXTS.has(getExt(f.name));

// ── Report slot definitions ───────────────────────────────────────────────────
const DEFAULT_SLOTS = [
  { id:"histopathology", required:true },
  { id:"colonoscopy",    required:true },
  { id:"cect",           required:true },
  { id:"cea",            required:false },
  { id:"mmr",            required:false },
  { id:"molecular",      required:false },
  { id:"surgical",       required:false },
];

// Dynamic slots based on selected cancer type
let currentSlots = [...DEFAULT_SLOTS];

// ── Breast cancer conditional workflow state ──────────────────────────────────
let breastConditionalState = {
  active: false,
  primaryResults: null,
  conditionalReports: [],
  uploadedConditional: {},
  analysisComplete: false,
};

// Per-slot state:  { file: File|null, isImage: boolean }
const slotState = {};
function resetSlotState() {
  Object.keys(slotState).forEach(k => delete slotState[k]);
  currentSlots.forEach(s => { slotState[s.id] = { file: null, isImage: false }; });
}
resetSlotState();

// ── Cancer type selection state ────────────────────────────────────────────────
let selectedCancerType = null;
let selectedCancerTypeLabel = null;
let allCancerTypes = [];
let cancerTypeRequirements = null;

// ── Bulk upload state ─────────────────────────────────────────────────────────
// Stores files picked via the bulk picker before assignment + analysis
// Array of { file, assignedSlot, icon, sizeStr }
let bulkQueue = [];

// ═════════════════════════════════════════════════════════════════════════════
// BULK UPLOAD — auto-classify multiple files, assign to slots, analyze
// ═════════════════════════════════════════════════════════════════════════════

// Keywords used to auto-detect which slot a file belongs to from its filename
const SLOT_KEYWORDS = {
  histopathology: ["histopath","biopsy","histology","pathology","histo","biopsi","patho","tissue","specimen","h&e"],
  colonoscopy:    ["colonoscopy","endoscopy","colonoscop","scope","colon","endo","polyp","colonoscopic"],
  cect:           ["cect","ct scan","ct chest","ct abdomen","ct pelvis","mri","pet","xray","x-ray","radiology","imaging","scan","computed"],
  cea:            ["cea","carcinoembryonic","tumour marker","tumor marker","serum","blood test","lab report","laboratory"],
  mmr:            ["mmr","msi","mismatch","mlh1","msh2","msh6","pms2","microsatellite","dmmr","pmmr"],
  molecular:      ["molecular","kras","nras","braf","genetic","mutation","ngssio","ngs","genomic","her2","egfr","dna"],
  surgical:       ["surgical","surgery","operation","resection","post op","postop","post-op","specimen","hemicolectomy","colectomy","tnm stage"],
  // Breast cancer conditional reports
  genomic:        ["oncotype","mammaprint","genomic","recurrence score","risk score"],
  brca:           ["brca","brca1","brca2","germline","hereditary","genetic testing"],
  nodal:          ["sentinel","node biopsy","axillary","lymph node","nodal staging","sln"],
};

const SLOT_ICONS = {
  histopathology:"🔬", colonoscopy:"🩺", cect:"🖥️",
  cea:"🧪", mmr:"🧬", molecular:"🔭", surgical:"⚕️",
  genomic:"🧬", brca:"🧬", nodal:"🖥️",
};
const SLOT_NAMES = {
  histopathology:"Histopathology", colonoscopy:"Colonoscopy", cect:"CECT Imaging",
  cea:"CEA", mmr:"MMR/MSI", molecular:"Molecular Panel", surgical:"Surgical Path",
  genomic:"Genomic Risk Score", brca:"BRCA Testing", nodal:"Nodal Staging",
};

// ── Cancer type icons by category ──────────────────────────────────────────────
const CANCER_ICONS = {
  "Breast": "🎀", "Lung": "🫁", "GI": "🫃", "Gynaecological": "🌸",
  "Urological": "💧", "Head & Neck": "🗣️", "Skin": "🩶",
  "Haematological": "🩸", "Endocrine": "🦋", "Brain": "🧠", "Other": "🎯",
};

// ── Cancer type selection ──────────────────────────────────────────────────────
async function loadCancerTypes() {
  try {
    const res = await fetch("/api/cancer-types");
    const data = await res.json();
    if (data.success) {
      allCancerTypes = data.cancerTypes;
    }
  } catch (e) {
    console.error("Failed to load cancer types:", e);
  }
}

function renderCancerTypeDropdown(filter = "") {
  const dropdown = $("cancerTypeDropdown");
  const filtered = allCancerTypes.filter(ct =>
    ct.label.toLowerCase().includes(filter.toLowerCase()) ||
    ct.category.toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="cts-option" style="color:var(--tx3);cursor:default">No cancer types found</div>`;
  } else {
    dropdown.innerHTML = filtered.map(ct => `
      <div class="cts-option" data-id="${esc(ct.id)}" data-label="${esc(ct.label)}">
        <span class="cts-option-icon">${CANCER_ICONS[ct.category] || "🎯"}</span>
        <span class="cts-option-label">${esc(ct.label)}</span>
        <span class="cts-option-cat">${esc(ct.category)}</span>
      </div>
    `).join("");

    dropdown.querySelectorAll(".cts-option").forEach(opt => {
      opt.addEventListener("click", () => {
        selectCancerType(opt.dataset.id, opt.dataset.label);
        dropdown.classList.add("hidden");
      });
    });
  }
}

async function selectCancerType(cancerTypeId, cancerTypeLabel) {
  console.log("[DEBUG] selectCancerType called:", cancerTypeId, cancerTypeLabel);
  selectedCancerType = cancerTypeId;
  selectedCancerTypeLabel = cancerTypeLabel;

  // Update UI
  $("cancerTypeSearch").classList.add("hidden");
  $("cancerTypeSelected").classList.remove("hidden");
  $("cancerTypeSelectedLabel").textContent = cancerTypeLabel;

  // Fetch requirements for this cancer type
  try {
    const res = await fetch(`/api/cancer-type/${encodeURIComponent(cancerTypeId)}/requirements`);
    const data = await res.json();
    console.log("[DEBUG] Requirements fetched:", data);
    if (data.success) {
      cancerTypeRequirements = data;
      buildDynamicSlots(data);
    }
  } catch (e) {
    console.error("Failed to load cancer type requirements:", e);
  }
}

function buildDynamicSlots(requirements) {
  console.log("[DEBUG] buildDynamicSlots called with:", requirements);
  const container = $("dynamicReportSlots");
  container.innerHTML = "";

  // Map pathway report IDs to slot definitions
  const reportSlotMap = {
    histo:     { id: "histopathology", icon: "🔬", title: "Histopathology / Biopsy", desc: "Tumour type, grade, differentiation" },
    imaging:   { id: "cect",           icon: "🖥️", title: "Imaging (CT/MRI/PET)", desc: "Staging, metastasis assessment" },
    cect:      { id: "cect",           icon: "🖥️", title: "CECT Chest + Abdomen + Pelvis", desc: "Distant staging" },
    mri:       { id: "cect",           icon: "🖥️", title: "MRI", desc: "Local staging" },
    mri_brain: { id: "cect",           icon: "🖥️", title: "MRI Brain", desc: "Brain staging" },
    cea:       { id: "cea",            icon: "🧪", title: "CEA", desc: "Tumour marker" },
    mmr:       { id: "mmr",            icon: "🧬", title: "MMR / MSI Testing", desc: "MLH1, MSH2, MSH6, PMS2" },
    ras:       { id: "molecular",      icon: "🧬", title: "KRAS / NRAS / BRAF", desc: "Molecular panel" },
    pdl1:      { id: "molecular",      icon: "🧬", title: "PD-L1 Testing", desc: "Immunotherapy eligibility" },
    receptor:  { id: "molecular",      icon: "🧬", title: "Receptor Testing (ER/PR/HER2)", desc: "Breast cancer subtyping" },
    brca:      { id: "molecular",      icon: "🧬", title: "BRCA1/BRCA2 Testing", desc: "Genetic testing" },
    molecular: { id: "molecular",      icon: "🔭", title: "Molecular / Genetic Panel", desc: "Comprehensive genomic profiling" },
    scope:     { id: "colonoscopy",    icon: "🩺", title: "Colonoscopy / Endoscopy", desc: "Tumour location, size" },
    surg:      { id: "surgical",       icon: "⚕️", title: "Surgical Histopathology", desc: "pTNM stage, margins" },
    cytogen:   { id: "molecular",      icon: "🧬", title: "Cytogenetics", desc: "Karyotype, FISH" },
    ihc:       { id: "molecular",      icon: "🧬", title: "Immunophenotyping (IHC)", desc: "CD20, BCL2, BCL6, MYC" },
    pet_ct:    { id: "cect",           icon: "🖥️", title: "PET-CT", desc: "FDG-PET staging" },
    bm:        { id: "histopathology", icon: "🔬", title: "Bone Marrow Biopsy", desc: "Blast percentage, cytochemistry" },
    cbc:       { id: "cea",            icon: "🧪", title: "CBC + Blood Film", desc: "Haematology" },
    ldh_b2m:   { id: "cea",            icon: "🧪", title: "LDH + Beta-2 Microglobulin", desc: "ISS staging" },
    afp:       { id: "cea",            icon: "🧪", title: "AFP", desc: "Tumour marker" },
    psa:       { id: "cea",            icon: "🧪", title: "PSA", desc: "Tumour marker" },
    ca125:     { id: "cea",            icon: "🧪", title: "CA-125", desc: "Tumour marker" },
    ca199:     { id: "cea",            icon: "🧪", title: "CA 19-9", desc: "Tumour marker" },
    hrd:       { id: "molecular",      icon: "🧬", title: "HRD Testing", desc: "Homologous Recombination Deficiency" },
    liver_fn:  { id: "cea",            icon: "🧪", title: "Liver Function Tests", desc: "Child-Pugh score" },
    hbv_hcv:   { id: "cea",            icon: "🧪", title: "HBV / HCV Serology", desc: "Aetiology testing" },
    spep:      { id: "cea",            icon: "🧪", title: "SPEP / UPEP + Free Light Chains", desc: "M-protein quantification" },
    neuro:     { id: "histopathology", icon: "🧪", title: "Neurological Assessment", desc: "KPS/ECOG baseline" },
    bone_scan: { id: "cect",           icon: "🖥️", title: "Bone Scan / PSMA PET-CT", desc: "Bone metastasis staging" },
    // Breast cancer conditional reports
    genomic:   { id: "genomic",        icon: "🧬", title: "Genomic Risk Score (Oncotype DX / MammaPrint)", desc: "Recurrence risk assessment for ER+/HER2- early breast cancer" },
    nodal:     { id: "nodal",          icon: "🖥️", title: "Sentinel Node Biopsy / Axillary Evaluation", desc: "Nodal staging if imaging is indeterminate" },
  };

  // Build unique slots from required reports
  const seenSlots = new Set();
  const slots = [];
  for (const report of requirements.requiredReports) {
    const mapped = reportSlotMap[report.id];
    if (!mapped) continue;
    if (seenSlots.has(mapped.id)) continue;
    seenSlots.add(mapped.id);
    slots.push({
      ...mapped,
      required: requirements.requiredFields.length <= 2 ? true : false,
      reason: report.reason,
      reportId: report.id,
    });
  }

  // Add conditional reports for breast cancer (shown as "Recommended" not "Required")
  if (requirements.conditionalReports?.length > 0 && isBreastCancer()) {
    for (const report of requirements.conditionalReports) {
      const mapped = reportSlotMap[report.id];
      if (!mapped) continue;
      if (seenSlots.has(mapped.id)) continue;
      seenSlots.add(mapped.id);
      slots.push({
        ...mapped,
        required: false,
        reason: report.reason,
        reportId: report.id,
        isConditional: true,
        condition: report.condition,
      });
    }
  }

  // If no specific slots mapped, use defaults
  if (slots.length === 0) {
    slots.push(
      { id: "histopathology", icon: "🔬", title: "Histopathology / Biopsy", desc: "Confirms cancer type and grade", required: true, reason: "Essential for diagnosis" },
      { id: "cect", icon: "🖥️", title: "Imaging (CT/MRI)", desc: "Staging and metastasis", required: true, reason: "Essential for staging" }
    );
  }

  currentSlots = slots;
  resetSlotState();

  // Render slots
  for (const slot of slots) {
    const slotEl = document.createElement("div");
    slotEl.className = "dynamic-slot";
    slotEl.id = `slot-${slot.id}`;
    slotEl.dataset.slot = slot.id;
    slotEl.dataset.required = slot.required;

    let badgeClass, badgeText;
    if (slot.isConditional) {
      badgeClass = "conditional";
      badgeText = "Conditional";
    } else if (slot.required) {
      badgeClass = "required";
      badgeText = "Required";
    } else if (slot.reason) {
      badgeClass = "important";
      badgeText = "Important";
    } else {
      badgeClass = "optional";
      badgeText = "Optional";
    }

    slotEl.innerHTML = `
      <div class="dynamic-slot-header" data-slot="${slot.id}">
        <span class="dynamic-slot-icon">${slot.icon}</span>
        <div class="dynamic-slot-info">
          <div class="dynamic-slot-title">${esc(slot.title)}</div>
          <div class="dynamic-slot-desc">${esc(slot.desc)}</div>
        </div>
        <span class="dynamic-slot-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="dynamic-slot-body" id="body-${slot.id}">
        <div class="dynamic-slot-fields">
          <div class="dynamic-field-chip">${esc(slot.reason || "Upload report")}</div>
        </div>
        <div class="dynamic-slot-upload" id="sua-${slot.id}" data-slot="${slot.id}">
          <div class="dynamic-slot-upload-icon">📄</div>
          <div class="dynamic-slot-upload-text">Drop file or click to upload</div>
          <div class="dynamic-slot-upload-fmt">PDF · TXT · PNG · JPG · WEBP</div>
        </div>
        <div class="dynamic-slot-chip hidden" id="chip-${slot.id}"></div>
      </div>
    `;
    container.appendChild(slotEl);
  }

  // Show bulk upload and divider
  $("bulkUploadBox").style.display = "";
  $("bulkDivider").style.display = "";

  // Re-attach event listeners for dynamic slots
  attachDynamicSlotListeners();
  updateIntakeProgress();

  // Open first slot by default
  const firstSlot = container.querySelector(".dynamic-slot");
  if (firstSlot) firstSlot.classList.add("open");
}

function attachDynamicSlotListeners() {
  console.log("[DEBUG] attachDynamicSlotListeners called");
  // Header click to expand/collapse
  document.querySelectorAll(".dynamic-slot-header").forEach(header => {
    header.addEventListener("click", e => {
      if (e.target.closest(".dynamic-slot-upload") || e.target.closest(".dynamic-slot-chip")) return;
      const slot = header.closest(".dynamic-slot");
      const isOpen = slot.classList.contains("open");
      // Close all
      document.querySelectorAll(".dynamic-slot").forEach(s => s.classList.remove("open"));
      // Open this one
      if (!isOpen) {
        slot.classList.add("open");
      }
    });
  });

  // Upload area click and drag/drop
  document.querySelectorAll(".dynamic-slot-upload").forEach(area => {
    const slotId = area.dataset.slot;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.txt,.png,.jpg,.jpeg,.webp";
    input.hidden = true;
    input.id = `file-${slotId}`;
    area.appendChild(input);

    area.addEventListener("click", () => input.click());
    area.addEventListener("dragover", e => { e.preventDefault(); area.style.borderColor = "var(--blue)"; });
    area.addEventListener("dragleave", () => { area.style.borderColor = ""; });
    area.addEventListener("drop", e => {
      e.preventDefault();
      area.style.borderColor = "";
      if (e.dataTransfer.files[0]) handleDynamicFile(slotId, e.dataTransfer.files[0]);
    });
    input.addEventListener("change", () => {
      if (input.files[0]) handleDynamicFile(slotId, input.files[0]);
      input.value = "";
    });
  });
}

function handleDynamicFile(slotId, file) {
  console.log("[DEBUG] handleDynamicFile called:", slotId, file.name);
  if (!ALLOWED_EXTS.has(getExt(file.name))) {
    console.log("[DEBUG] File extension not allowed:", getExt(file.name));
    return showToast(`${file.name}: unsupported format. Use PDF, TXT, PNG, JPG, or WEBP.`);
  }
  if (file.size > 20 * 1024 * 1024) {
    console.log("[DEBUG] File too large:", file.size);
    return showToast(`${file.name} exceeds 20 MB limit.`);
  }

  slotState[slotId].file = file;
  slotState[slotId].isImage = isImg(file);

  const sua = $(`sua-${slotId}`);
  const icon = isImg(file) ? "🖼️" : "📄";
  sua.classList.add("done");
  sua.innerHTML = `
    <div class="dynamic-slot-upload-icon">${icon}</div>
    <div class="dynamic-slot-upload-text done">${esc(file.name)}</div>
    <div class="dynamic-slot-upload-fmt">${fmtBytes(file.size)}${isImg(file) ? " · OCR" : ""}</div>
  `;

  const chip = $(`chip-${slotId}`);
  chip.classList.remove("hidden");
  chip.innerHTML = `
    <span>${icon}</span>
    <div class="dynamic-slot-chip-name">${esc(file.name)}</div>
    <div class="dynamic-slot-chip-size">${fmtBytes(file.size)}${isImg(file) ? " · OCR" : ""}</div>
    <button class="dynamic-slot-chip-x" data-slot="${slotId}">✕</button>
  `;
  chip.querySelector(".dynamic-slot-chip-x").addEventListener("click", () => {
    removeDynamicSlotFile(slotId);
  });

  updateIntakeProgress();
}

function removeDynamicSlotFile(slotId) {
  slotState[slotId].file = null;
  slotState[slotId].isImage = false;

  const sua = $(`sua-${slotId}`);
  sua.classList.remove("done");
  sua.innerHTML = `
    <div class="dynamic-slot-upload-icon">📄</div>
    <div class="dynamic-slot-upload-text">Drop file or click to upload</div>
    <div class="dynamic-slot-upload-fmt">PDF · TXT · PNG · JPG · WEBP</div>
  `;

  const chip = $(`chip-${slotId}`);
  chip.classList.add("hidden");
  chip.innerHTML = "";

  updateIntakeProgress();
}

// ── Breast Cancer Conditional Report Workflow ──────────────────────────────────

function isBreastCancer() {
  return selectedCancerType === "Breast Cancer" ||
         selectedCancerTypeLabel?.toLowerCase().includes("breast");
}

function showConditionalReportsSection(data, conditionalReports) {
  breastConditionalState.active = true;
  breastConditionalState.primaryResults = data;
  breastConditionalState.conditionalReports = conditionalReports;
  breastConditionalState.uploadedConditional = {};
  breastConditionalState.analysisComplete = false;

  const container = $("conditionalReportsSection");
  if (!container) return;

  const parsed = data.parsed || {};
  const bm = parsed.biomarkers || {};
  const isERPosHER2Neg = (bm.er === "positive" || bm.pr === "positive") && bm.her2 !== "positive";
  const isEarlyStage = ["I", "II", "IIA", "IIB", "IIC"].includes(parsed.stage);
  const isYoungPatient = parsed.age && parsed.age <= 50;
  const hasFamilyHistory = parsed.familyHistory === true;

  // Determine which conditional reports are recommended
  const recommended = [];
  if (isERPosHER2Neg && isEarlyStage) {
    recommended.push({
      id: "genomic",
      ...conditionalReports.find(r => r.id === "genomic"),
      reason: "ER+/HER2- early-stage cancer — Genomic Risk Score recommended to assess chemotherapy benefit",
    });
  }
  if (isYoungPatient || hasFamilyHistory) {
    recommended.push({
      id: "brca",
      ...conditionalReports.find(r => r.id === "brca"),
      reason: isYoungPatient
        ? "Patient age ≤50 — BRCA1/BRCA2 testing recommended"
        : "Strong family history of breast/ovarian cancer — BRCA testing recommended",
    });
  }
  // Always recommend nodal staging if not clearly defined
  recommended.push({
    id: "nodal",
    ...conditionalReports.find(r => r.id === "nodal"),
    reason: "Sentinel Node Biopsy / Axillary Evaluation recommended for accurate nodal staging",
  });

  breastConditionalState.recommendedReports = recommended;

  container.classList.remove("hidden");
  container.innerHTML = `
    <div class="card" style="margin-top:20px;border:2px solid var(--blue);background:var(--blue-s)">
      <div class="card-head">
        <span class="card-title">🎯 Breast Cancer — Additional Reports Recommended</span>
        <span class="badge badge-blue">${recommended.length} report${recommended.length>1?"s":""} needed</span>
      </div>
      <p style="color:var(--tx2);margin-bottom:15px">
        Based on the primary analysis, the following additional reports are recommended to refine the chemotherapy plan:
      </p>
      <div class="conditional-reports-list">
        ${recommended.map((r, i) => `
          <div class="conditional-report-item" id="cond-item-${r.id}">
            <div class="cond-report-header">
              <span class="cond-icon">${r.icon}</span>
              <div class="cond-report-info">
                <div class="cond-report-title">${esc(r.name)}</div>
                <div class="cond-report-reason">${esc(r.reason)}</div>
              </div>
              <span class="cond-badge cond-badge-${i === 0 ? "primary" : "secondary"}">${i === 0 ? "Primary" : "Recommended"}</span>
            </div>
            <div class="cond-report-upload" id="cond-upload-${r.id}">
              <div class="cond-upload-area" data-cond-type="${r.id}">
                <div class="cond-upload-icon">📄</div>
                <div class="cond-upload-text">Drop file or click to upload</div>
                <div class="cond-upload-fmt">PDF · TXT · PNG · JPG · WEBP</div>
                <input type="file" class="cond-file-input" id="cond-file-${r.id}"
                       accept=".pdf,.txt,.png,.jpg,.jpeg,.webp" hidden />
              </div>
              <div class="cond-file-chip hidden" id="cond-chip-${r.id}"></div>
            </div>
          </div>
        `).join("")}
      </div>
      <button class="btn btn-primary" id="analyzeConditionalBtn" disabled style="margin-top:15px">
        <span class="btn-label">Analyze Conditional Reports</span>
        <span class="spin hidden" id="conditionalSpinner"></span>
      </button>
    </div>
  `;

  // Attach event listeners for conditional report uploads
  attachConditionalReportListeners(recommended);
}

function attachConditionalReportListeners(recommended) {
  recommended.forEach(r => {
    const uploadArea = document.querySelector(`.cond-upload-area[data-cond-type="${r.id}"]`);
    if (!uploadArea) return;

    const input = $(`cond-file-${r.id}`);
    if (!input) return;

    uploadArea.addEventListener("click", () => input.click());
    uploadArea.addEventListener("dragover", e => { e.preventDefault(); uploadArea.style.borderColor = "var(--blue)"; });
    uploadArea.addEventListener("dragleave", () => { uploadArea.style.borderColor = ""; });
    uploadArea.addEventListener("drop", e => {
      e.preventDefault();
      uploadArea.style.borderColor = "";
      if (e.dataTransfer.files[0]) handleConditionalFile(r.id, e.dataTransfer.files[0]);
    });
    input.addEventListener("change", () => {
      if (input.files[0]) handleConditionalFile(r.id, input.files[0]);
      input.value = "";
    });
  });

  // Analyze button
  const analyzeBtn = $("analyzeConditionalBtn");
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", analyzeConditionalReports);
  }
}

function handleConditionalFile(reportType, file) {
  if (!ALLOWED_EXTS.has(getExt(file.name))) {
    return showToast(`${file.name}: unsupported format. Use PDF, TXT, PNG, JPG, or WEBP.`);
  }
  if (file.size > 20 * 1024 * 1024) {
    return showToast(`${file.name} exceeds 20 MB limit.`);
  }

  breastConditionalState.uploadedConditional[reportType] = file;

  const uploadArea = document.querySelector(`.cond-upload-area[data-cond-type="${reportType}"]`);
  const chip = $(`cond-chip-${reportType}`);
  const icon = isImg(file) ? "🖼️" : "📄";

  if (uploadArea) {
    uploadArea.innerHTML = `
      <div class="cond-upload-icon">${icon}</div>
      <div class="cond-upload-text done">${esc(file.name)}</div>
      <div class="cond-upload-fmt">${fmtBytes(file.size)}${isImg(file) ? " · OCR" : ""}</div>
    `;
  }

  if (chip) {
    chip.classList.remove("hidden");
    chip.innerHTML = `
      <span>${icon}</span>
      <div class="cond-chip-info">
        <div class="cond-chip-name">${esc(file.name)}</div>
        <div class="cond-chip-size">${fmtBytes(file.size)}${isImg(file) ? " · OCR" : ""}</div>
      </div>
      <button class="cond-chip-x" data-cond-type="${reportType}">✕</button>
    `;
    chip.querySelector(".cond-chip-x").addEventListener("click", () => {
      removeConditionalFile(reportType);
    });
  }

  updateConditionalAnalyzeButton();
}

function removeConditionalFile(reportType) {
  delete breastConditionalState.uploadedConditional[reportType];

  const uploadArea = document.querySelector(`.cond-upload-area[data-cond-type="${reportType}"]`);
  const chip = $(`cond-chip-${reportType}`);

  if (uploadArea) {
    uploadArea.innerHTML = `
      <div class="cond-upload-icon">📄</div>
      <div class="cond-upload-text">Drop file or click to upload</div>
      <div class="cond-upload-fmt">PDF · TXT · PNG · JPG · WEBP</div>
    `;
  }

  if (chip) {
    chip.classList.add("hidden");
    chip.innerHTML = "";
  }

  updateConditionalAnalyzeButton();
}

function updateConditionalAnalyzeButton() {
  const analyzeBtn = $("analyzeConditionalBtn");
  if (!analyzeBtn) return;

  const uploadedCount = Object.keys(breastConditionalState.uploadedConditional).length;
  const requiredCount = breastConditionalState.recommendedReports?.length || 0;
  analyzeBtn.disabled = uploadedCount === 0;
}

async function analyzeConditionalReports() {
  const btn = $("analyzeConditionalBtn");
  const spinner = $("conditionalSpinner");
  if (!btn) return;

  setBusy(btn, spinner, true, "Analyzing conditional reports…");

  try {
    const uploadedFiles = breastConditionalState.uploadedConditional;
    const results = [];

    // Analyze each uploaded conditional report
    for (const [reportType, file] of Object.entries(uploadedFiles)) {
      const fd = new FormData();
      fd.append("report", file);
      fd.append("reportType", reportType);
      fd.append("primaryResults", JSON.stringify(breastConditionalState.primaryResults));

      const data = await postForm("/api/analyze-breast-secondary", fd);
      results.push(data);
    }

    // Render conditional analysis results
    renderConditionalResults(results);
    breastConditionalState.analysisComplete = true;
  } catch (e) {
    showToast(e.message);
  } finally {
    setBusy(btn, spinner, false);
  }
}

function renderConditionalResults(results) {
  const container = $("conditionalResultsSection");
  if (!container) return;

  container.classList.remove("hidden");

  let html = `
    <div class="card" style="margin-top:20px;border:2px solid var(--green);background:var(--green-s)">
      <div class="card-head">
        <span class="card-title">📋 Conditional Reports Analysis</span>
        <span class="badge badge-green">${results.length} report${results.length>1?"s":""} analyzed</span>
      </div>
  `;

  results.forEach(result => {
    const analysis = result.secondaryAnalysis;
    if (!analysis) return;

    html += `
      <div class="cond-analysis-item" style="margin-top:15px;padding:15px;background:white;border-radius:8px">
        <div class="cond-analysis-header">
          <span class="cond-icon">${SLOT_ICONS[analysis.reportType] || "📄"}</span>
          <span class="cond-analysis-title">${esc(SLOT_NAMES[analysis.reportType] || analysis.reportType)}</span>
        </div>
        <div class="cond-findings" style="margin-top:10px">
          ${analysis.findings?.map(f => `<div class="cond-finding">• ${esc(f)}</div>`).join("") || ""}
        </div>
        <div class="cond-recommendations" style="margin-top:10px">
          ${analysis.recommendations?.map(r => `<div class="cond-recommendation">→ ${esc(r)}</div>`).join("") || ""}
        </div>
    `;

    // Special handling for genomic risk score
    if (analysis.reportType === "genomic" && analysis.chemotherapyAdjustments) {
      const adj = analysis.chemotherapyAdjustments;
      if (adj.action === "avoid") {
        html += `
          <div class="cond-highlight cond-avoid" style="margin-top:10px;padding:12px;background:var(--green-s);border:1px solid var(--green);border-radius:6px">
            <strong>✅ Chemotherapy Can Be Safely Avoided</strong><br>
            <small>${esc(adj.reason)}</small><br>
            <small><strong>Alternative:</strong> ${esc(adj.alternative)}</small>
          </div>
        `;
      } else if (adj.action === "recommend") {
        html += `
          <div class="cond-highlight cond-recommend" style="margin-top:10px;padding:12px;background:var(--yellow-s);border:1px solid var(--yellow);border-radius:6px">
            <strong>⚠️ Chemotherapy Recommended</strong><br>
            <small>${esc(adj.reason)}</small><br>
            <small><strong>Plan:</strong> ${esc(adj.alternative)}</small>
          </div>
        `;
      } else if (adj.action === "parp_eligible") {
        html += `
          <div class="cond-highlight cond-parp" style="margin-top:10px;padding:12px;background:var(--purple-s);border:1px solid var(--purple);border-radius:6px">
            <strong>🧬 PARP Inhibitor Eligible</strong><br>
            <small>${esc(adj.reason)}</small><br>
            <small><strong>Plan:</strong> ${esc(adj.alternative)}</small>
          </div>
        `;
      }
    }

    // Special handling for BRCA
    if (analysis.reportType === "brca" && analysis.brcaResult) {
      html += `
        <div class="cond-highlight" style="margin-top:10px;padding:12px;background:var(--blue-s);border:1px solid var(--blue);border-radius:6px">
          <strong>🧬 BRCA Result:</strong> ${esc(analysis.brcaResult)}
        </div>
      `;
    }

    // Special handling for nodal staging
    if (analysis.reportType === "nodal" && analysis.nodalStatus) {
      const statusColor = analysis.nodalStatus === "Node-negative" ? "var(--green)" :
                          analysis.nodalStatus === "Node-positive" ? "var(--red)" : "var(--yellow)";
      html += `
        <div class="cond-highlight" style="margin-top:10px;padding:12px;background:var(--blue-s);border:1px solid ${statusColor};border-radius:6px">
          <strong>🖥️ Nodal Status:</strong> ${esc(analysis.nodalStatus)}
        </div>
      `;
    }

    html += `</div>`;
  });

  html += `</div>`;
  container.innerHTML = html;

  // Scroll to results
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateIntakeProgress() {
  const total = currentSlots.length;
  const filled = currentSlots.filter(s => slotState[s.id]?.file).length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const bar = $("intakeBar");
  const label = $("intakeLabel");
  if (bar) bar.style.width = pct + "%";
  if (label) label.textContent = `${filled} / ${total} reports`;

  const analyzeBtn = $("analyzeBtn");
  if (analyzeBtn) {
    // For breast cancer, require at least one primary (non-conditional) report
    const primaryFilled = currentSlots.filter(s => !s.isConditional && slotState[s.id]?.file).length;
    const canAnalyze = isBreastCancer() ? (primaryFilled > 0 && selectedCancerType) : (filled > 0 && selectedCancerType);
    analyzeBtn.disabled = !canAnalyze;
  }

  const analyzeMultiBtn = $("analyzeMultiBtn");
  if (analyzeMultiBtn) {
    const hasRequired = currentSlots.filter(s => s.required && !s.isConditional).some(s => slotState[s.id].file);
    analyzeMultiBtn.disabled = !hasRequired;
  }
}

/**
 * Guess the best slot for a file based on its name.
 * Returns a slot id or null (unrecognised).
 */
function guessSlot(filename) {
  const lower = filename.toLowerCase().replace(/[_\-\.]/g, " ");
  let best = null, bestScore = 0;
  for (const [slotId, keywords] of Object.entries(SLOT_KEYWORDS)) {
    const score = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = slotId; }
  }
  return bestScore > 0 ? best : null;
}

// ── DOM refs for bulk upload ──────────────────────────────────────────────────
const bulkFileInput  = $("bulkFileInput");
const bulkDropZone   = $("bulkDropZone");
const bulkBrowseBtn  = $("bulkBrowseBtn");
const bulkQueueEl    = $("bulkQueue");
const bqTitle        = $("bqTitle");
const bqList         = $("bqList");
const bulkClearBtn   = $("bulkClearBtn");
const bulkAnalyzeBtn = $("bulkAnalyzeBtn");
const bulkSpinner    = $("bulkSpinner");

// ── Event: browse button ──────────────────────────────────────────────────────
bulkBrowseBtn.addEventListener("click", e => { e.stopPropagation(); bulkFileInput.click(); });
bulkDropZone.addEventListener("click",  ()  => bulkFileInput.click());

bulkFileInput.addEventListener("change", () => {
  addBulkFiles(Array.from(bulkFileInput.files));
  bulkFileInput.value = "";
});

// ── Drag & drop on the bulk zone ──────────────────────────────────────────────
bulkDropZone.addEventListener("dragover",  e => { e.preventDefault(); bulkDropZone.classList.add("bulk-over"); });
bulkDropZone.addEventListener("dragleave", ()  => bulkDropZone.classList.remove("bulk-over"));
bulkDropZone.addEventListener("drop", e => {
  e.preventDefault();
  bulkDropZone.classList.remove("bulk-over");
  addBulkFiles(Array.from(e.dataTransfer.files));
});

// ── Also accept drops on the whole left panel ─────────────────────────────────
document.querySelector(".left-panel")?.addEventListener("dragover", e => {
  // Only handle if not over a specific slot upload area
  if (!e.target.closest(".slot-upload-area")) {
    e.preventDefault();
    bulkDropZone.classList.add("bulk-over");
  }
});
document.querySelector(".left-panel")?.addEventListener("dragleave", e => {
  if (!e.relatedTarget?.closest(".left-panel")) {
    bulkDropZone.classList.remove("bulk-over");
  }
});
document.querySelector(".left-panel")?.addEventListener("drop", e => {
  if (!e.target.closest(".slot-upload-area")) {
    e.preventDefault();
    bulkDropZone.classList.remove("bulk-over");
    addBulkFiles(Array.from(e.dataTransfer.files));
  }
});

// ── Add files to bulk queue ───────────────────────────────────────────────────
function addBulkFiles(files) {
  let rejected = 0;
  for (const file of files) {
    const ext = getExt(file.name);
    if (!ALLOWED_EXTS.has(ext)) { rejected++; continue; }
    if (file.size > 20 * 1024 * 1024) { showToast(`${file.name}: exceeds 20 MB limit.`); continue; }
    // Avoid exact duplicates
    if (bulkQueue.some(q => q.file.name === file.name && q.file.size === file.size)) continue;
    bulkQueue.push({
      file,
      assignedSlot: guessSlot(file.name),
      icon:         isImg(file) ? "🖼️" : "📄",
      sizeStr:      fmtBytes(file.size),
    });
  }
  if (rejected) showToast(`${rejected} file(s) skipped — unsupported format.`);
  renderBulkQueue();
}

// ── Render the bulk queue UI ──────────────────────────────────────────────────
function renderBulkQueue() {
  if (bulkQueue.length === 0) {
    bulkQueueEl.classList.add("hidden");
    return;
  }
  bulkQueueEl.classList.remove("hidden");
  bqTitle.textContent = `${bulkQueue.length} file${bulkQueue.length > 1 ? "s" : ""} selected`;

  bqList.innerHTML = bulkQueue.map((item, idx) => {
    const slotOpts = currentSlots.map(s =>
      `<option value="${s.id}" ${item.assignedSlot === s.id ? "selected" : ""}>${SLOT_ICONS[s.id]} ${SLOT_NAMES[s.id]}</option>`
    ).join("");

    const slotColor = item.assignedSlot ? "bq-slot-assigned" : "bq-slot-unknown";
    const slotLabel = item.assignedSlot
      ? `${SLOT_ICONS[item.assignedSlot]} Auto-assigned: ${SLOT_NAMES[item.assignedSlot]}`
      : "❓ Unrecognised — select slot";

    return `
      <div class="bq-item" id="bq-item-${idx}">
        <div class="bqi-left">
          <span class="bqi-icon">${item.icon}</span>
          <div class="bqi-info">
            <div class="bqi-name">${esc(item.file.name)}</div>
            <div class="bqi-size">${item.sizeStr}${isImg(item.file) ? " · OCR" : ""}</div>
          </div>
        </div>
        <div class="bqi-right">
          <div class="bq-slot-tag ${slotColor}" id="bq-tag-${idx}">${slotLabel}</div>
          <select class="bq-slot-select" data-idx="${idx}" title="Assign to slot">
            <option value="">— assign to slot —</option>
            ${slotOpts}
          </select>
          <button class="bq-remove" data-idx="${idx}" title="Remove">✕</button>
        </div>
      </div>`;
  }).join("");

  // Slot select change handler
  bqList.querySelectorAll(".bq-slot-select").forEach(sel => {
    sel.addEventListener("change", e => {
      const idx = parseInt(e.target.dataset.idx);
      bulkQueue[idx].assignedSlot = e.target.value || null;
      // Update tag label
      const tag  = $(`bq-tag-${idx}`);
      if (bulkQueue[idx].assignedSlot) {
        const sid = bulkQueue[idx].assignedSlot;
        tag.textContent  = `${SLOT_ICONS[sid]} Assigned: ${SLOT_NAMES[sid]}`;
        tag.className    = "bq-slot-tag bq-slot-assigned";
      } else {
        tag.textContent  = "❓ Unrecognised — select slot";
        tag.className    = "bq-slot-tag bq-slot-unknown";
      }
    });
  });

  // Remove button
  bqList.querySelectorAll(".bq-remove").forEach(btn => {
    btn.addEventListener("click", e => {
      const idx = parseInt(e.currentTarget.dataset.idx);
      bulkQueue.splice(idx, 1);
      renderBulkQueue();
    });
  });
}

// ── Clear bulk queue ──────────────────────────────────────────────────────────
bulkClearBtn.addEventListener("click", () => {
  bulkQueue = [];
  renderBulkQueue();
});

// ── Analyze bulk queue ────────────────────────────────────────────────────────
bulkAnalyzeBtn.addEventListener("click", async () => {
  if (bulkQueue.length === 0) return showToast("No files in queue.");

  // Validate: at least one required slot covered
  const assignedSlots = new Set(bulkQueue.map(q => q.assignedSlot).filter(Boolean));
  const requiredCovered = currentSlots.filter(s => s.required).some(s => assignedSlots.has(s.id));
  if (!requiredCovered) {
    return showToast("Assign at least one file to Histopathology, Colonoscopy, or CECT before analyzing.");
  }

  setBusy(bulkAnalyzeBtn, bulkSpinner, true, "Analyzing reports…");

  try {
    const fd = new FormData();
    // For each file that has an assigned slot, append it under that slot name
    // If multiple files share the same slot, append each (server takes the last one per slot)
    const seen = new Set();
    for (const item of bulkQueue) {
      if (!item.assignedSlot) continue;
      // If same slot appears twice, combine filename hint
      const fieldName = seen.has(item.assignedSlot)
        ? `${item.assignedSlot}_extra`  // server will still merge via combined text
        : item.assignedSlot;
      seen.add(item.assignedSlot);
      fd.append(fieldName, item.file);
    }

    // Also append unassigned files under a generic "extra" field
    const unassigned = bulkQueue.filter(q => !q.assignedSlot);
    unassigned.forEach((item, i) => fd.append(`extra_${i}`, item.file));

    const data = await postForm("/api/analyze-multi", fd);
    renderResults(data);

    // Sync filled slots to the individual slot UI
    for (const item of bulkQueue) {
      if (item.assignedSlot && currentSlots.find(s => s.id === item.assignedSlot)) {
        handleFile(item.assignedSlot, item.file);
      }
    }
  } catch (e) {
    showToast(e.message);
  } finally {
    setBusy(bulkAnalyzeBtn, bulkSpinner, false);
  }
});

// ── DOM refs ──────────────────────────────────────────────────────────────────
const welcome        = $("welcome");
const results        = $("results");
const resetBtn       = $("resetBtn");
const toast          = $("toast");
const intakeBar      = $("intakeBar");
const intakeLabel    = $("intakeLabel");
const analyzeMultiBtn= $("analyzeMultiBtn");
const multiSpinner   = $("multiSpinner");
const pasteInput     = $("pasteInput");
const analyzeTextBtn = $("analyzeTextBtn");
const textSpinner    = $("textSpinner");

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
    tab.classList.add("active");
    $(`tab-${tab.dataset.tab}`).classList.remove("hidden");
  });
});

// ── Slot toggle (expand/collapse) ─────────────────────────────────────────────
document.querySelectorAll(".slot-header").forEach(header => {
  header.addEventListener("click", e => {
    if (e.target.closest(".slot-upload-area") || e.target.closest(".slot-file-chip")) return;
    const slot   = header.closest(".slot");
    const slotId = slot.dataset.slot;
    const body   = $(`body-${slotId}`);
    const isOpen = !body.classList.contains("hidden");
    // Close all
    document.querySelectorAll(".slot-body").forEach(b => b.classList.add("hidden"));
    document.querySelectorAll(".slot").forEach(s => s.classList.remove("open"));
    // Open this one if it was closed
    if (!isOpen) {
      body.classList.remove("hidden");
      slot.classList.add("open");
    }
  });
});

// ── Upload area per slot ──────────────────────────────────────────────────────
document.querySelectorAll(".slot-upload-area").forEach(area => {
  const slotId = area.dataset.slot;
  const input  = $(`file-${slotId}`);

  // Click to browse
  area.addEventListener("click", () => input.click());

  // Drag & drop
  area.addEventListener("dragover",  e => { e.preventDefault(); area.classList.add("over"); });
  area.addEventListener("dragleave", ()  => area.classList.remove("over"));
  area.addEventListener("drop", e => {
    e.preventDefault();
    area.classList.remove("over");
    if (e.dataTransfer.files[0]) handleFile(slotId, e.dataTransfer.files[0]);
  });

  // Input change
  input.addEventListener("change", () => {
    if (input.files[0]) handleFile(slotId, input.files[0]);
    input.value = "";
  });
});

function handleFile(slotId, file) {
  if (!ALLOWED_EXTS.has(getExt(file.name)))
    return showToast(`${file.name}: unsupported format. Use PDF, TXT, PNG, JPG, or WEBP.`);
  if (file.size > 20 * 1024 * 1024)
    return showToast(`${file.name} exceeds 20 MB limit.`);

  slotState[slotId].file    = file;
  slotState[slotId].isImage = isImg(file);

  // Update upload-area UI
  const sua  = $(`sua-${slotId}`);
  const icon = isImg(file) ? "🖼️" : "📄";
  sua.innerHTML = `
    <span class="sua-icon">${icon}</span>
    <span class="sua-text sua-done">${esc(file.name)}</span>
    <span class="sua-fmt">${fmtBytes(file.size)}${isImg(file) ? " · OCR" : ""}</span>`;

  // File chip with remove
  const chip = $(`chip-${slotId}`);
  chip.classList.remove("hidden");
  chip.innerHTML = `
    <span>${icon}</span>
    <div class="fc-info">
      <span class="fc-name">${esc(file.name)}</span>
      <span class="fc-size">${fmtBytes(file.size)}${isImg(file) ? " · OCR" : ""}</span>
    </div>
    <button class="chip-x" onclick="removeSlotFile('${slotId}')">✕</button>`;

  // Show image preview
  if (isImg(file)) {
    const reader = new FileReader();
    reader.onload = ev => {
      let prev = $(`prev-${slotId}`);
      if (!prev) {
        prev = document.createElement("div");
        prev.id = `prev-${slotId}`;
        prev.className = "slot-img-preview";
        prev.innerHTML = `<img src="" alt="preview"/><div class="ocr-note">🔍 OCR will extract text</div>`;
        chip.after(prev);
      }
      prev.querySelector("img").src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Slot status tick
  updateSlotStatus(slotId, "done");
  updateIntakeProgress();
}

window.removeSlotFile = function(slotId) {
  slotState[slotId].file    = null;
  slotState[slotId].isImage = false;

  const sua = $(`sua-${slotId}`);
  sua.innerHTML = `
    <span class="sua-icon">📄</span>
    <span class="sua-text">Drop file or click to upload</span>
    <span class="sua-fmt">PDF · TXT · PNG · JPG · WEBP</span>`;

  const chip = $(`chip-${slotId}`);
  chip.classList.add("hidden");
  chip.innerHTML = "";

  const prev = $(`prev-${slotId}`);
  if (prev) prev.remove();

  updateSlotStatus(slotId, "empty");
  updateIntakeProgress();
};

function updateSlotStatus(slotId, state) {
  const el = $(`status-${slotId}`);
  if (state === "done")
    el.innerHTML = `<span class="status-done">✓</span>`;
  else
    el.innerHTML = `<span class="status-empty">○</span>`;
}

// ── Analyze all reports (legacy — redirects to new analyzeBtn) ─────────────────
analyzeMultiBtn.addEventListener("click", async () => {
  if (analyzeBtn && !analyzeBtn.disabled) {
    analyzeBtn.click();
  } else {
    showToast("Please select a cancer type and upload reports first.");
  }
});

// ── Paste text analyze ────────────────────────────────────────────────────────
analyzeTextBtn.addEventListener("click", async () => {
  const txt = pasteInput.value.trim();
  if (txt.length < 30) return showToast("Please enter at least 30 characters of report text.");
  if (!selectedCancerType) {
    return showToast("Please select a cancer type first.");
  }
  setBusy(analyzeTextBtn, textSpinner, true, "Analyzing…");
  try {
    const data = await postJSON("/api/analyze-text", { text: txt, cancerType: selectedCancerType });
    renderResults(data);
  } catch (e) {
    showToast(e.message);
  } finally {
    setBusy(analyzeTextBtn, textSpinner, false);
  }
});

resetBtn.addEventListener("click", () => {
  results.classList.add("hidden");
  welcome.classList.remove("hidden");
  pasteInput.value = "";
  // Clear all dynamic slots
  currentSlots.forEach(s => { if (slotState[s.id]?.file) removeDynamicSlotFile(s.id); });
  // Clear bulk queue
  bulkQueue = [];
  renderBulkQueue();
  // Clear breast conditional state
  breastConditionalState = {
    active: false,
    primaryResults: null,
    conditionalReports: [],
    uploadedConditional: {},
    analysisComplete: false,
  };
  const condSection = $("conditionalReportsSection");
  const condResults = $("conditionalResultsSection");
  if (condSection) { condSection.classList.add("hidden"); condSection.innerHTML = ""; }
  if (condResults) { condResults.classList.add("hidden"); condResults.innerHTML = ""; }
  window.scrollTo(0, 0);
});

// ── API helpers ───────────────────────────────────────────────────────────────
async function postForm(url, formData) {
  const res  = await fetch(url, { method:"POST", body: formData });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || "Analysis failed.");
  return data;
}
async function postJSON(url, body) {
  const res  = await fetch(url, { method:"POST",
    headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || "Analysis failed.");
  return data;
}

// ═════════════════════════════════════════════════════════════════════════════
// RENDER RESULTS
// ═════════════════════════════════════════════════════════════════════════════
function renderResults(data) {
  welcome.classList.add("hidden");
  results.classList.remove("hidden");

  // Show cancer type mismatch warning if applicable
  if (data.cancerTypeMismatch && selectedCancerType) {
    renderCancerTypeMismatch(data.cancerTypeMismatch);
  }

  renderUploadedSlots(data.uploadedSlots);
  renderReportType(data.reportClassification);
  renderDataCheck(data.dataCheck, data.reportClassification);
  renderExtracted(data.parsed);

  if (data.predictionBlocked) {
    renderBlockedWarning(data.blockReason, data.blockMessage, data.reportClassification);
  } else {
    renderMLPrediction(data.primaryPrediction, data.parsed);
    renderAgreement(data.agreement, data.primaryPrediction, data.ruleRecommendations);
  }

  renderRules(data.ruleRecommendations);
  renderFeatureImportance(data.primaryPrediction?.featureImportance);

  // Show conditional reports section for breast cancer
  if (isBreastCancer() && !data.predictionBlocked && data.dataCheck?.conditionalReports?.length > 0) {
    showConditionalReportsSection(data, data.dataCheck.conditionalReports);
  }

  results.scrollIntoView({ behavior: "smooth" });
}

function renderCancerTypeMismatch(mismatch) {
  const card = $("reportTypeCard");
  if (!card) return;
  card.classList.remove("hidden");

  const warningHtml = `
    <div class="rt-warning" style="background:var(--yellow-s);border:1px solid rgba(245,158,11,.3);border-radius:var(--r2);padding:12px;margin-top:10px">
      <span style="font-size:16px">⚠️</span>
      <span>
        <strong>Cancer Type Mismatch Detected</strong><br>
        You selected: <strong>${esc(mismatch.selected)}</strong><br>
        Report detected: <strong>${esc(mismatch.detected || "Unknown")}</strong><br><br>
        <small style="color:var(--tx3)">The ML prediction has been performed using your selected cancer type (${esc(mismatch.selected)}).
        Please verify that the uploaded documents correctly correspond to this cancer type.</small>
      </span>
    </div>
  `;

  const existingContent = card.innerHTML;
  card.innerHTML = existingContent + warningHtml;
}

// ── Uploaded slots summary ────────────────────────────────────────────────────
function renderUploadedSlots(slots) {
  const card = $("uploadedSlotsCard");
  if (!card) return;
  if (!slots || !slots.length) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");

  const ICONS = { histopathology:"🔬", colonoscopy:"🩺", cect:"🖥️",
                   cea:"🧪", mmr:"🧬", molecular:"🔭", surgical:"⚕️", pasted:"📝" };
  const NAMES = { histopathology:"Histopathology", colonoscopy:"Colonoscopy",
                   cect:"CECT Imaging", cea:"CEA", mmr:"MMR/MSI",
                   molecular:"Molecular Panel", surgical:"Surgical Path", pasted:"Pasted Text" };

  card.innerHTML = `
    <div class="card-head">
      <span class="card-title">📂 Reports Analyzed (${slots.length})</span>
      <span class="badge badge-green">${slots.length} report${slots.length>1?"s":""} combined</span>
    </div>
    <div class="uploaded-slots-grid">
      ${slots.map(s => `
        <div class="us-chip">
          <span>${ICONS[s.slotId] || "📄"}</span>
          <div>
            <div class="us-name">${esc(NAMES[s.slotId] || s.slotId)}</div>
            <div class="us-file">${esc(s.filename)} · ${s.chars.toLocaleString()} chars</div>
          </div>
        </div>`).join("")}
    </div>`;
}

// ── Report type ───────────────────────────────────────────────────────────────
function renderReportType(rc) {
  const card = $("reportTypeCard");
  if (!card || !rc) return;
  card.classList.remove("hidden");

  const TYPE_ICON  = { HISTOPATHOLOGY:"🔬", COLONOSCOPY:"🩺", IMAGING:"🖥️",
                        MOLECULAR:"🧬", TUMOR_MARKER:"🧪", BLOOD:"🩸",
                        SURGICAL_PATH:"⚕️", CLINICAL_NOTES:"📋", UNKNOWN:"❓" };
  const TYPE_COLOR = { HISTOPATHOLOGY:"green", COLONOSCOPY:"blue", IMAGING:"blue",
                        MOLECULAR:"purple", TUMOR_MARKER:"yellow", BLOOD:"grey",
                        SURGICAL_PATH:"green", CLINICAL_NOTES:"grey", UNKNOWN:"red" };
  const icon  = TYPE_ICON[rc.primaryType]  || "📄";
  const color = TYPE_COLOR[rc.primaryType] || "grey";

  let extra = "";
  if (rc.markerMismatch)
    extra += `<div class="rt-warning"><span>⚠️</span><span>
      <strong>${rc.markerMismatch.marker.toUpperCase()}</strong> is a tumour marker for
      <strong>${rc.markerMismatch.expectedCancer}</strong>.
      Do not use this marker alone to classify a different cancer type.</span></div>`;
  if (rc.isTumorMarkerOnly)
    extra += `<div class="rt-warning rt-warning-red"><span>🚫</span><span>
      This is a <strong>standalone tumour marker report</strong>.
      Tumour markers alone cannot determine cancer type, stage, or treatment.
      A histopathology/biopsy report is required.</span></div>`;

  card.innerHTML = `
    <div class="card-head">
      <span class="card-title">📊 Report Type Analysis</span>
      <span class="badge badge-${color}">${icon} ${esc(rc.primaryLabel)}</span>
    </div>
    <div class="rt-tags">${(rc.allTypes||[]).slice(0,4).map(t =>
      `<span class="rt-tag">${TYPE_ICON[t.type]||"📄"} ${esc(t.label)}</span>`).join("")}</div>
    ${extra}`;
}

// ── Data completeness ─────────────────────────────────────────────────────────
function renderDataCheck(dc, rc) {
  const card = $("dataCheckCard");
  if (!card || !dc) return;
  card.classList.remove("hidden");

  const tierColor = { complete:"green", partial:"yellow", insufficient:"red" };
  const color = tierColor[dc.dataTier] || "grey";
  const pct   = dc.completeness;

  const missingHtml = dc.missingReports?.length
    ? dc.missingReports.map(r => `
        <div class="req-row missing">
          <span class="req-icon">${r.icon}</span>
          <div class="req-info">
            <div class="req-name">${esc(r.name)}</div>
            <div class="req-reason">${esc(r.reason)}</div>
          </div>
          <span class="req-status req-missing">Needed</span>
        </div>`).join("")
    : `<div class="req-row ok"><span>✅</span><div class="req-info"><div class="req-name">All required reports present</div></div></div>`;

  const satisfiedHtml = dc.satisfiedReports?.length
    ? `<div class="req-section-title" style="margin-top:10px">✅ Reports Detected (${dc.satisfiedReports.length})</div>` +
      dc.satisfiedReports.map(r => `
        <div class="req-row ok">
          <span class="req-icon">${r.icon}</span>
          <div class="req-info"><div class="req-name">${esc(r.name)}</div></div>
          <span class="req-status req-ok">✓ Present</span>
        </div>`).join("")
    : "";

  const notesHtml = dc.clinicalNotes?.length
    ? `<div class="cn-section"><div class="cn-title">⚕️ Clinical Notes</div>` +
      dc.clinicalNotes.map(n =>
        `<div class="cn-note"><span class="cn-field">${esc(n.field.toUpperCase())}</span><span>${esc(n.note)}</span></div>`
      ).join("") + `</div>` : "";

  const molHtml = dc.molecularNeeded && !rc?.allTypes?.find(t => t.type==="MOLECULAR")
    ? `<div class="mol-banner"><span>🧬</span><span>Molecular / genetic testing recommended for this cancer type.</span></div>` : "";

  // Conditional reports section for breast cancer
  let conditionalHtml = "";
  if (dc.conditionalReports?.length > 0 && isBreastCancer()) {
    const missingCond = dc.missingConditional?.length || 0;
    conditionalHtml = `
      <div class="req-section-title" style="margin-top:15px;color:var(--blue)">🎯 Conditional Reports (Breast Cancer)</div>
      <div style="font-size:11px;color:var(--tx3);margin-bottom:8px">
        These reports are recommended after primary analysis to refine the chemotherapy plan
      </div>
      ${dc.conditionalReports.map(r => {
        const isMissing = dc.missingConditional?.some(m => m.id === r.id);
        return `
          <div class="req-row ${isMissing ? "missing" : "ok"}">
            <span class="req-icon">${r.icon}</span>
            <div class="req-info">
              <div class="req-name">${esc(r.name)}</div>
              <div class="req-reason">${esc(r.reason)}</div>
            </div>
            <span class="req-status ${isMissing ? "req-missing" : "req-ok"}">${isMissing ? "Pending" : "✓ Uploaded"}</span>
          </div>
        `;
      }).join("")}
    `;
  }

  // Cancer type specific header
  const cancerTypeHeader = selectedCancerType
    ? `<div style="margin-bottom:10px;padding:8px 12px;background:var(--blue-s);border-radius:var(--r2);border:1px solid rgba(79,142,247,.2)">
        <span style="font-size:12px;color:var(--blue)">🎯 Analyzing for: <strong>${esc(selectedCancerTypeLabel || selectedCancerType)}</strong></span>
      </div>`
    : "";

  card.innerHTML = `
    <div class="card-head">
      <span class="card-title">📋 Data Completeness</span>
      <span class="badge badge-${color}">${pct}% Complete · ${cap(dc.dataTier)}</span>
    </div>
    ${cancerTypeHeader}
    <div class="completeness-bar-wrap">
      <div class="completeness-bar" style="width:${pct}%;background:var(--${color==="green"?"green":color==="yellow"?"yellow":"red"})"></div>
    </div>
    ${molHtml}
    ${dc.missingReports?.length ? `<div class="req-section-title">📥 Reports Still Needed (${dc.missingReports.length})</div>` : ""}
    ${missingHtml}${satisfiedHtml}${conditionalHtml}${notesHtml}`;
}

// ── Extracted data ─────────────────────────────────────────────────────────────
function renderExtracted(parsed) {
  const grid  = $("extGrid");
  const badge = $("confBadge");
  badge.className = "badge";
  if (parsed.confidence === "high")        { badge.classList.add("badge-green");  badge.textContent = "✓ High Confidence"; }
  else if (parsed.confidence === "medium") { badge.classList.add("badge-yellow"); badge.textContent = "~ Medium Confidence"; }
  else                                     { badge.classList.add("badge-red");    badge.textContent = "! Low Confidence"; }

  const items = [];
  const add = (l, v, c="") => { if (v && v !== "N/A" && v !== "null") items.push({l,v:String(v),c}); };

  add("Cancer Type",    parsed.cancerType || "Not detected", parsed.cancerType ? "" : "c-na");
  add("Stage",          parsed.stage || "Not detected", parsed.stage ? "" : "c-na");
  if (parsed.tStage)    add("T Stage", "T" + parsed.tStage);
  if (parsed.nStage)    add("N Stage", "N" + parsed.nStage);
  if (parsed.mStage)    add("M Stage", "M" + parsed.mStage);
  add("Grade",          parsed.grade ? cap(parsed.grade) + " Grade" : null);
  add("Histology",      parsed.histology);
  add("Primary Site",   parsed.primarySite);
  add("Age",            parsed.age ? parsed.age + " years" : null);
  add("ECOG PS",        parsed.performanceStatus != null ? "PS " + parsed.performanceStatus : null);
  add("Tumour Size",    parsed.tumorSize ? parsed.tumorSize + " cm" : null);
  if (parsed.lvInvasion)         add("LVI",      cap(parsed.lvInvasion), parsed.lvInvasion==="present"?"c-neg":"c-pos");
  if (parsed.periNeuralInvasion) add("PNI",      cap(parsed.periNeuralInvasion), parsed.periNeuralInvasion==="present"?"c-neg":"c-pos");
  if (parsed.depthOfInvasion)    add("Depth",    parsed.depthOfInvasion);
  if (parsed.surgicalMargins)    add("Margins",  cap(parsed.surgicalMargins), parsed.surgicalMargins==="clear"?"c-pos":"c-neg");
  if (parsed.lymphNodes?.lymphNodeStatus)
    add("Lymph Nodes", cap(parsed.lymphNodes.lymphNodeStatus) +
      (parsed.lymphNodes.lymphNodesPositive!=null ? ` (${parsed.lymphNodes.lymphNodesPositive}/${parsed.lymphNodes.lymphNodesTotal||"?"})` : ""),
      parsed.lymphNodes.lymphNodeStatus==="negative"?"c-pos":"c-neg");

  const bm = parsed.biomarkers || {};
  const BM_FIELDS = [
    ["HER2","her2"],["ER","er"],["PR","pr"],["EGFR","egfr"],["ALK","alk"],
    ["PD-L1","pdl1"],["KRAS","kras"],["NRAS","nras"],["BRAF","braf"],
    ["MMR","mmr"],["MSI","msi"],["BRCA","brca"],["ROS1","ros1"],
    ["MLH1","mlh1"],["MSH2","msh2"],["MSH6","msh6"],["PMS2","pms2"],
    ["FLT3","flt3"],["NPM1","npm1"],
  ];
  BM_FIELDS.forEach(([l,k]) => { if (bm[k]) add(l, cap(String(bm[k])), bmClass(bm[k])); });

  const tm = parsed.tumorMarkers || {};
  if (tm.cea   != null) add("CEA",    typeof tm.cea   ==="number" ? tm.cea   + " ng/mL" : cap(String(tm.cea)));
  if (tm.ca153 != null) add("CA 15-3",typeof tm.ca153 ==="number" ? tm.ca153 + " U/mL"  : cap(String(tm.ca153)));
  if (tm.ca199 != null) add("CA 19-9",typeof tm.ca199 ==="number" ? tm.ca199 + " U/mL"  : cap(String(tm.ca199)));
  if (tm.ca125 != null) add("CA-125", typeof tm.ca125 ==="number" ? tm.ca125 + " U/mL"  : cap(String(tm.ca125)));
  if (tm.afp   != null) add("AFP",    typeof tm.afp   ==="number" ? tm.afp   + " ng/mL" : cap(String(tm.afp)));
  if (tm.psa   != null) add("PSA",    typeof tm.psa   ==="number" ? tm.psa   + " ng/mL" : cap(String(tm.psa)));
  if (bm.ki67  != null) add("Ki67",   bm.ki67 + "%", bm.ki67 > 20 ? "c-neg" : "");

  grid.innerHTML = items.map(i =>
    `<div class="ext-item"><div class="ext-lbl">${i.l}</div><div class="ext-val ${i.c}">${esc(i.v)}</div></div>`
  ).join("") || `<div style="color:var(--tx3);font-size:13px;padding:8px">No clinical data could be extracted from the provided reports.</div>`;
}

function bmClass(v) {
  v = String(v).toLowerCase();
  if (["positive",">=50%","intact","proficient"].includes(v)) return "c-pos";
  if (["negative","lost"].includes(v))                        return "c-neg";
  if (["mutated","deficient (dmmr)","itd-positive"].includes(v)) return "c-mut";
  if (v === "wild-type")                                      return "c-wt";
  return "";
}

// ── Prediction blocked ────────────────────────────────────────────────────────
function renderBlockedWarning(reason, message, rc) {
  const mlCard = $("mlCard");
  if (!mlCard) return;
  const TITLES = {
    TUMOR_MARKER_ONLY_NO_CANCER: "🚫 Prediction Blocked — Tumour Marker Only",
    MARKER_CANCER_MISMATCH:      "⚠️ Prediction Blocked — Marker / Cancer Mismatch",
    NO_CANCER_TYPE:              "❓ Prediction Blocked — Cancer Type Not Confirmed",
  };
  const markerHtml = rc?.markerMismatch ? `
    <div class="block-detail">
      <div class="block-detail-row"><span class="bd-label">Marker</span><span class="bd-val">${esc(rc.markerMismatch.marker.toUpperCase())}</span></div>
      <div class="block-detail-row"><span class="bd-label">Associated cancer</span><span class="bd-val">${esc(rc.markerMismatch.expectedCancer)}</span></div>
    </div>` : "";
  mlCard.querySelector("#mlBody, [id=mlBody]") // find mlBody inside card
  $("mlBody").innerHTML = `
    <div class="block-panel">
      <div class="block-title">${TITLES[reason] || "⚠️ Prediction Blocked"}</div>
      <div class="block-msg">${esc(message)}</div>
      ${markerHtml}
      <div class="block-hint">
        <strong>What to do:</strong>
        <ul>
          <li>Upload the <strong>Histopathology / Biopsy Report</strong> confirming cancer type</li>
          <li>Add <strong>CECT staging</strong> results (T/N/M stage)</li>
          <li>Include <strong>KRAS / NRAS / BRAF / MMR</strong> molecular results</li>
        </ul>
      </div>
    </div>`;
}

// ── ML prediction ─────────────────────────────────────────────────────────────
function renderMLPrediction(ml, parsed) {
  const body = $("mlBody");
  if (!ml) {
    body.innerHTML = `<div class="bm-note"><span class="bm-bullet">⚠</span>
      Add more report data (histopathology, staging) to enable ML prediction.</div>`;
    return;
  }
  const isCont = ml.predictedCycles === 0;

  // Generate detailed treatment plan
  const secondaryAnalysis = breastConditionalState.analysisComplete ? breastConditionalState.primaryResults?.secondaryAnalysis : null;
  const treatmentPlan = generateTreatmentPlan(ml, parsed, secondaryAnalysis);

  body.innerHTML = `
    <div class="ml-hero">
      <div class="cycle-box primary">
        <div class="cb-val ${isCont?"continuous":""}">${isCont?"Cont.":ml.predictedCycles}</div>
        <div class="cb-sub">${isCont?"Continuous / Targeted":"Chemotherapy Cycles"}</div>
      </div>
      <div class="cycle-box">
        <div class="cb-val" style="font-size:20px;color:var(--tx2)">${esc(ml.cycleBucket)}</div>
        <div class="cb-sub">Cycle Range (ML)</div>
      </div>
      <div class="cycle-box">
        <div class="cb-val" style="font-size:24px;color:var(--green)">${ml.modelAccuracy}</div>
        <div class="cb-sub">Model Accuracy</div>
      </div>
    </div>

    <!-- Detailed Treatment Plan -->
    <div class="treatment-plan">
      <div class="tp-header">
        <span class="tp-icon">📋</span>
        <span class="tp-title">Detailed Treatment Plan</span>
        <span class="tp-badge badge-blue">${esc(ml.datasetCancerType||"Matched")}</span>
      </div>

      <div class="tp-section">
        <div class="tp-section-title">🎯 Recommended Regimen</div>
        <div class="tp-regimen-name">${esc(ml.regimen)}</div>
        ${treatmentPlan.drugs?.length ? `
          <div class="tp-drugs">
            ${treatmentPlan.drugs.map(d => `<div class="drug-chip">${esc(d)}</div>`).join("")}
          </div>
        ` : ""}
      </div>

      <div class="tp-section">
        <div class="tp-section-title">📅 Treatment Schedule</div>
        <div class="tp-schedule-grid">
          <div class="tp-sched-item">
            <div class="tp-sched-label">Total Cycles</div>
            <div class="tp-sched-val">${isCont ? "Continuous" : ml.predictedCycles}</div>
          </div>
          <div class="tp-sched-item">
            <div class="tp-sched-label">Cycle Interval</div>
            <div class="tp-sched-val">${treatmentPlan.interval || "Per protocol"}</div>
          </div>
          <div class="tp-sched-item">
            <div class="tp-sched-label">Duration</div>
            <div class="tp-sched-val">${treatmentPlan.duration || "Per protocol"}</div>
          </div>
          <div class="tp-sched-item">
            <div class="tp-sched-label">Intent</div>
            <div class="tp-sched-val">${cap(treatmentPlan.intent || "Curative")}</div>
          </div>
        </div>
      </div>

      ${treatmentPlan.supportiveCare?.length ? `
        <div class="tp-section">
          <div class="tp-section-title">💊 Supportive Care</div>
          <div class="tp-support-list">
            ${treatmentPlan.supportiveCare.map(s => `<div class="tp-support-item">${esc(s)}</div>`).join("")}
          </div>
        </div>
      ` : ""}

      ${treatmentPlan.monitoring?.length ? `
        <div class="tp-section">
          <div class="tp-section-title">🔬 Monitoring & Follow-up</div>
          <div class="tp-support-list">
            ${treatmentPlan.monitoring.map(m => `<div class="tp-support-item">${esc(m)}</div>`).join("")}
          </div>
        </div>
      ` : ""}

      ${treatmentPlan.notes?.length ? `
        <div class="tp-section">
          <div class="tp-section-title">📝 Clinical Notes</div>
          <div class="tp-notes-list">
            ${treatmentPlan.notes.map(n => `<div class="tp-note-item">${esc(n)}</div>`).join("")}
          </div>
        </div>
      ` : ""}
    </div>

    <div class="ml-meta">
      <span class="ml-tag badge-blue">${esc(ml.datasetCancerType||"Matched")}</span>
      <span class="ml-tag badge-grey">Stage ${esc(ml.datasetStage)}</span>
      ${ml.similarPatients?`<span class="ml-tag badge-grey">~${ml.similarPatients.toLocaleString()} similar patients</span>`:""}
      <span class="ml-tag badge-green">${ml.trainingPatients.toLocaleString()} training patients</span>
    </div>
    <div class="ml-stats">
      <div class="ml-stat"><div class="ml-stat-lbl">Mean Cycles</div><div class="ml-stat-val">${ml.predictedCycleMean??"-"}</div></div>
      <div class="ml-stat"><div class="ml-stat-lbl">Model</div><div class="ml-stat-val">Random Forest (300 trees)</div></div>
      <div class="ml-stat"><div class="ml-stat-lbl">Data Sources</div><div class="ml-stat-val">SEER · NCCN · ACS 2023</div></div>
      <div class="ml-stat"><div class="ml-stat-lbl">CRC Features</div><div class="ml-stat-val">T/N/M · CEA · LVI · MMR · KRAS</div></div>
    </div>
    ${ml.biomarkerNotes?.length?`
      <div class="bm-notes">
        <div class="ext-lbl" style="margin-bottom:8px">Biomarker Adjustments Applied</div>
        ${ml.biomarkerNotes.map(n=>`<div class="bm-note"><span class="bm-bullet">⚡</span>${esc(n)}</div>`).join("")}
      </div>`:""}
    ${ml.psNote?`<div class="ps-note"><span>⚠️</span>${esc(ml.psNote)}</div>`:""}
    ${ml.completenessNote?`<div class="ps-note" style="background:var(--blue-s);border-color:rgba(79,142,247,.25);color:var(--blue)"><span>ℹ️</span>${esc(ml.completenessNote)}</div>`:""}`;
}

// ── Treatment plan generator ───────────────────────────────────────────────────
function generateTreatmentPlan(ml, parsed, secondaryAnalysis = null) {
  const cancerType = ml.datasetCancerType || "";
  const stage = ml.datasetStage || "";
  const cycles = ml.predictedCycles || 0;
  const regimen = ml.regimen || "";

  const plan = {
    drugs: [],
    interval: "21 days",
    duration: "",
    intent: "curative",
    supportiveCare: [],
    monitoring: [],
    notes: [],
  };

  // Parse regimen to extract drugs
  if (regimen.includes("+")) {
    plan.drugs = regimen.split("+").map(d => d.trim()).filter(Boolean);
  } else if (regimen) {
    plan.drugs = [regimen];
  }

  // Cancer-type-specific treatment details
  if (cancerType.includes("Breast Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : "adjuvant";
    plan.supportiveCare = [
      "G-CSF (Filgrastim) support with dose-dense schedule",
      "Antiemetic prophylaxis: 5-HT3 antagonist + NK1 antagonist + Dexamethasone",
      "Cardiac monitoring (LVEF) with anthracycline-containing regimens",
      "Herceptin (Trastuzumab) cardiac monitoring if HER2+",
    ];
    plan.monitoring = [
      "CBC before each cycle",
      "Liver function tests",
      "Cardiac echo every 3 months (if anthracycline)",
      "HER2/ER/PR reassessment if progression",
    ];

    // Add conditional report notes if available
    if (secondaryAnalysis) {
      if (secondaryAnalysis.canAvoidChemo) {
        plan.notes.push("Genomic Risk Score: Low risk — chemotherapy safely avoided per Oncotype DX/MammaPrint");
        plan.notes.push("Endocrine therapy alone is sufficient for this patient");
      }
      if (secondaryAnalysis.brcaResult === "Pathogenic mutation detected") {
        plan.notes.push("BRCA1/BRCA2 mutation detected — PARP inhibitor (olaparib/talazoparib) eligible for metastatic disease");
        plan.notes.push("Consider risk-reducing bilateral mastectomy and salpingo-oophorectomy");
      }
      if (secondaryAnalysis.nodalStatus === "Node-negative") {
        plan.notes.push("Sentinel node biopsy: Node-negative — excellent prognosis");
        plan.notes.push("Chemotherapy decision guided by genomic risk score and tumor size");
      } else if (secondaryAnalysis.nodalStatus === "Node-positive") {
        plan.notes.push("Sentinel node biopsy: Node-positive — chemotherapy recommended");
        plan.notes.push("Consider dose-dense regimen and extended nodal irradiation");
      }
    }
  } else if (cancerType.includes("Lung Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : (stage === "I" ? "adjuvant" : "curative");
    plan.supportiveCare = [
      "Pneumocystis prophylaxis (if high-dose steroids)",
      "Antiemetic prophylaxis",
      "Pulmonary function monitoring",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "CT chest every 2-3 cycles",
      "EGFR/ALK reassessment if progression",
      "PD-L1 reassessment if considering immunotherapy",
    ];
  } else if (cancerType.includes("Colorectal Cancer")) {
    plan.intent = stage === "IV" ? "palliative" : "adjuvant";
    plan.supportiveCare = [
      "Antiemetic prophylaxis",
      "Peripheral neuropathy monitoring (oxaliplatin)",
      "Diarrhea management (loperamide PRN)",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "CEA every 2-3 cycles",
      "CT chest/abdomen/pelvis every 8-12 weeks",
      "KRAS/NRAS/BRAF reassessment if progression",
    ];
  } else if (cancerType.includes("Brain") || cancerType.includes("Glioblastoma") || cancerType.includes("Glioma")) {
    plan.intent = "curative";
    plan.supportiveCare = [
      "Dexamethasone for cerebral edema",
      "Antiepileptic prophylaxis (levetiracetam)",
      "G-CSF support if concurrent RT",
      "PJP prophylaxis if on prolonged steroids",
    ];
    plan.monitoring = [
      "MRI brain every 2-3 months during treatment",
      "Neurological assessment before each RT fraction",
      "MGMT methylation status review",
      "KPS/ECOG assessment before each cycle",
    ];
    plan.notes.push("Stupp Protocol: RT with concomitant temozolomide followed by adjuvant temozolomide");
    if (cancerType.includes("Glioblastoma")) {
      plan.notes.push("Consider tumour treating fields (Optune) for eligible patients");
    }
  } else if (cancerType.includes("Lymphoma")) {
    plan.intent = "curative";
    plan.supportiveCare = [
      "Antiemetic prophylaxis",
      "Tumor lysis syndrome prophylaxis (allopurinol/hydration)",
      "HBV prophylaxis if HBsAg+ (rituximab-containing regimens)",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "PET-CT after cycle 2 (interim response assessment)",
      "LDH monitoring",
      "CD20 levels if rituximab-based regimen",
    ];
  } else if (cancerType.includes("Leukemia")) {
    plan.intent = "curative";
    plan.supportiveCare = [
      "Tumor lysis syndrome prophylaxis (aggressive hydration + allopurinol)",
      "Antiemetic prophylaxis",
      "Antifungal prophylaxis (posaconazole during neutropenia)",
      "Antiviral prophylaxis (acyclovir)",
    ];
    plan.monitoring = [
      "CBC daily during induction",
      "Bone marrow biopsy at day 14 and day 28",
      "Cytogenetics/FISH monitoring",
      "MRD (minimal residual disease) assessment post-consolidation",
    ];
  } else if (cancerType.includes("Ovarian")) {
    plan.intent = "curative";
    plan.supportiveCare = [
      "Antiemetic prophylaxis",
      "Peripheral neuropathy monitoring",
      "Hypersensitivity reaction monitoring (carboplatin)",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "CA-125 every 3 cycles",
      "CT chest/abdomen/pelvis post-completion",
      "BRCA/HRD status review for maintenance therapy",
    ];
  } else if (cancerType.includes("Pancreatic")) {
    plan.intent = stage === "IV" ? "palliative" : "curative";
    plan.supportiveCare = [
      "Antiemetic prophylaxis",
      "Nutritional support (pancreatic enzyme replacement)",
      "Diabetes management if new-onset",
    ];
    plan.monitoring = [
      "CBC, CMP before each cycle",
      "CA 19-9 every 2-3 cycles",
      "CT pancreas protocol every 8-12 weeks",
      "BRCA/PALB2 status review for olaparib eligibility",
    ];
  } else if (cancerType.includes("Prostate")) {
    plan.intent = stage === "IV" ? "palliative" : "curative";
    plan.supportiveCare = [
      "Androgen deprivation therapy (ADT) coordination",
      "Bone health management (zoledronic acid/denosumab)",
      "Hot flash management",
    ];
    plan.monitoring = [
      "PSA every 3 months",
      "Bone scan if symptomatic progression",
      "PSMA PET-CT for restaging",
      "Testosterone levels (if on ADT)",
    ];
  }

  // Set duration based on cycles
  if (cycles > 0 && cycles <= 6) {
    plan.duration = `${cycles * 3} weeks (${cycles} cycles × 21 days)`;
  } else if (cycles > 6) {
    plan.duration = `${cycles * 3} weeks (${cycles} cycles × 21 days)`;
  } else if (cycles === 0) {
    plan.duration = "Continuous / targeted therapy (no fixed cycles)";
  }

  // Add general notes
  if (parsed.performanceStatus >= 2) {
    plan.notes.push("ECOG PS 2 — consider dose reduction (75-80% standard dose)");
  }
  if (parsed.age > 70) {
    plan.notes.push("Age >70 — consider geriatric assessment and dose adjustments");
  }

  return plan;
}

// ── Agreement banner ──────────────────────────────────────────────────────────
function renderAgreement(agreement, ml, rules) {
  const banner = $("agreeBanner");
  if (!agreement||!ml||!rules?.length){banner.classList.add("hidden");return;}
  const mlC = ml.predictedCycles, rC = rules[0]?.cycles;
  const cfg = {
    strong:   {cls:"agree-strong",   icon:"✅",text:`ML and NCCN agree: <strong>${mlC} cycles</strong>. High confidence.`},
    moderate: {cls:"agree-moderate", icon:"ℹ️",text:`ML (${mlC} cycles) and NCCN (${rC} cycles) closely aligned.`},
    divergent:{cls:"agree-divergent",icon:"⚠️",text:`ML predicts ${mlC} cycles; NCCN references ${rC} cycles. Review both.`},
  }[agreement];
  if(!cfg){banner.classList.add("hidden");return;}
  banner.className=`agree-banner ${cfg.cls}`;
  banner.innerHTML=`<span>${cfg.icon}</span><span>${cfg.text}</span>`;
  banner.classList.remove("hidden");
}

// ── Rule-based cards ──────────────────────────────────────────────────────────
function renderRules(rules) {
  const list = $("ruleList"), count = $("ruleCount");
  if(!rules?.length){
    count.textContent="0 matched";
    list.innerHTML=`<div class="bm-note"><span class="bm-bullet">—</span>No NCCN protocol matched. Provide complete histopathology and staging data.</div>`;
    return;
  }
  count.className="badge badge-blue";
  count.textContent=`${rules.length} protocol${rules.length>1?"s":""} matched`;
  list.innerHTML=rules.map((r,i)=>`
    <div class="rule-item ${i===0?"rank1":""}">
      <div class="rule-header">
        <div class="rule-name">${esc(r.regimen)}</div>
        <div class="rule-tags">
          <span class="tag-${r.intent}">${cap(r.intent)}</span>
          <span class="badge badge-${r.confidence==="High"?"green":r.confidence==="Moderate"?"yellow":"grey"}">${esc(r.confidence)}</span>
        </div>
      </div>
      <div class="rule-cycles">
        <span class="rc-num">${r.cycles>0?r.cycles:"—"}</span>
        <span class="rc-unit">${r.cycles>0?"cycles · every "+r.interval+" days":"Continuous therapy"}</span>
      </div>
      <div class="rule-drugs">
        ${(r.drugs||[]).map(d=>`<span class="drug-chip">${esc(d)}</span>`).join("")}
        ${r.cycles > 0 ? `<div style="margin-top:6px;font-size:11px;color:var(--tx3)">Total: ${r.cycles} cycles × ${r.interval} days = ${r.cycles * r.interval} days treatment</div>` : ""}
      </div>
      <div class="rule-duration"><strong>Duration:</strong> ${esc(r.duration)}</div>
      <div class="rule-note">${esc(r.notes)}</div>
      <div class="rule-ref">Reference: <span>${esc(r.reference)}</span></div>
    </div>`).join("");
}

// ── Feature importance ────────────────────────────────────────────────────────
function renderFeatureImportance(fi) {
  const chart = $("fiChart");
  if(!fi){$("fiCard").classList.add("hidden");return;}
  $("fiCard").classList.remove("hidden");
  const entries = Object.entries(fi).slice(0,12);
  const max = entries[0][1];
  const LABELS = {
    cancer_type:"Cancer Type",age:"Patient Age",stage:"Disease Stage",
    ecog_ps:"ECOG PS",kras_status:"KRAS Status",mmr_status:"MMR/MSI",
    t_stage:"T Stage (Depth)",n_stage:"N Stage (Nodes)",
    lvi:"Lymphovascular Inv.",depth_of_invasion:"Depth of Invasion",
    pni:"Perineural Invasion",braf_status:"BRAF Status",
    nras_status:"NRAS Status",her2_status:"HER2 Status",
    egfr_status:"EGFR Status",pdl1_status:"PD-L1",
    treatment_intent:"Treatment Intent",prior_treatment:"Prior Treatment",
    charlson_score:"Charlson Score",grade:"Tumour Grade",
    primary_site:"Primary Site",gender:"Gender",hr_status:"HR Status",
  };
  chart.innerHTML = entries.map(([k,v])=>{
    const pct = ((v/max)*100).toFixed(0);
    const lbl = LABELS[k] || k.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());
    return `<div class="fi-row">
      <div class="fi-label">${esc(lbl)}</div>
      <div class="fi-bar-wrap"><div class="fi-bar" style="width:${pct}%"></div></div>
      <div class="fi-pct">${(v*100).toFixed(1)}%</div>
    </div>`;
  }).join("");
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function setBusy(btn, spinner, busy, label) {
  btn.disabled = busy;
  spinner.classList.toggle("hidden", !busy);
  const lbl = btn.querySelector(".btn-label");
  if (lbl && busy && label) lbl.textContent = label;
  if (lbl && !busy) lbl.textContent = btn.id==="analyzeMultiBtn" ? "Analyze All Reports" : "Analyze Text";
}
function showToast(msg) {
  toast.textContent = "⚠ " + msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 4500);
}
function cap(s)  { return s ? s.charAt(0).toUpperCase()+s.slice(1) : ""; }
function esc(s)  { return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function fmtBytes(b) {
  if (b<1024)    return b+" B";
  if (b<1048576) return (b/1024).toFixed(1)+" KB";
  return (b/1048576).toFixed(1)+" MB";
}

// Wrap button text nodes in .btn-label spans
document.querySelectorAll(".btn-primary, .btn-analyze").forEach(b => {
  const sp = b.querySelector(".spin");
  if (!sp) return;
  const tn = [...b.childNodes].find(n => n.nodeType===3 && n.textContent.trim());
  if (tn) {
    const span = document.createElement("span");
    span.className = "btn-label";
    span.textContent = tn.textContent.trim();
    b.replaceChild(span, tn);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CANCER TYPE SELECTOR — Event Listeners & Init
// ═════════════════════════════════════════════════════════════════════════════

// Search input
const cancerTypeSearch = $("cancerTypeSearch");
const cancerTypeDropdown = $("cancerTypeDropdown");
const cancerTypeSelected = $("cancerTypeSelected");
const cancerTypeChangeBtn = $("cancerTypeChangeBtn");

cancerTypeSearch.addEventListener("focus", () => {
  if (allCancerTypes.length === 0) loadCancerTypes();
  renderCancerTypeDropdown(cancerTypeSearch.value);
  cancerTypeDropdown.classList.remove("hidden");
});

cancerTypeSearch.addEventListener("input", () => {
  renderCancerTypeDropdown(cancerTypeSearch.value);
  cancerTypeDropdown.classList.remove("hidden");
});

document.addEventListener("click", e => {
  if (!e.target.closest(".cancer-type-selector")) {
    cancerTypeDropdown.classList.add("hidden");
  }
});

cancerTypeChangeBtn.addEventListener("click", () => {
  selectedCancerType = null;
  selectedCancerTypeLabel = null;
  cancerTypeRequirements = null;
  cancerTypeSearch.classList.remove("hidden");
  cancerTypeSearch.value = "";
  cancerTypeSelected.classList.add("hidden");
  $("dynamicReportSlots").innerHTML = "";
  $("bulkUploadBox").style.display = "none";
  $("bulkDivider").style.display = "none";
  $("intakeNote").textContent = "Select a cancer type first to see required documents.";
  $("intakeNote").style.display = "";
  currentSlots = [...DEFAULT_SLOTS];
  resetSlotState();
  updateIntakeProgress();
});

// ── Analyze button (dynamic slots) ────────────────────────────────────────────
const analyzeBtn = $("analyzeBtn");
const analyzeSpinner = $("analyzeSpinner");
if (analyzeBtn) {
  analyzeBtn.addEventListener("click", async () => {
    console.log("[DEBUG] Analyze button clicked");
    if (!selectedCancerType) {
      console.log("[DEBUG] No cancer type selected");
      return showToast("Please select a cancer type first.");
    }

    const filledSlots = currentSlots.filter(s => slotState[s.id]?.file);
    console.log("[DEBUG] Filled slots:", filledSlots.length, filledSlots.map(s => s.id));
    if (filledSlots.length === 0) {
      return showToast("Please upload at least one report.");
    }

    setBusy(analyzeBtn, analyzeSpinner, true, "Analyzing reports…");

    try {
      const fd = new FormData();
      for (const s of currentSlots) {
        if (slotState[s.id].file) {
          fd.append(s.id, slotState[s.id].file);
        }
      }
      if (selectedCancerType) {
        fd.append("cancerType", selectedCancerType);
      }

      const data = await postForm("/api/analyze-multi", fd);
      renderResults(data);
    } catch (e) {
      showToast(e.message);
    } finally {
      setBusy(analyzeBtn, analyzeSpinner, false);
    }
  });
}

// ── Init ───────────────────────────────────────────────────────────────────────
(async function init() {
  await loadCancerTypes();
  // Pre-render default slots
  buildDynamicSlots({
    requiredReports: [
      { id: "histo", icon: "🔬", name: "Histopathology / Biopsy", reason: "Confirms cancer type, grade, differentiation" },
      { id: "imaging", icon: "🖥️", name: "Imaging (CT/MRI)", reason: "Staging and metastasis assessment" },
      { id: "molecular", icon: "🧬", name: "Molecular Panel", reason: "Genetic markers for treatment selection" },
    ],
    requiredFields: ["cancerType", "stage"],
    importantFields: ["grade"],
    minimumToPredict: ["cancerType"],
    molecularNeeded: false,
    noteIfMissing: {},
    totalReportsNeeded: 3,
  });

  // Initialize navigation
  initNavigation();
  // Initialize BSA calculator
  initBSACalculator();
  // Initialize patient management
  initPatientManagement();
})();

// ═══════════════════════════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════════════════════════

function initNavigation() {
  const navBtns = document.querySelectorAll(".nav-btn");
  const pages = {
    analyze: document.querySelector("main.layout"),
    dashboard: $("dashboardPage"),
    patients: $("patientsPage"),
    bsa: $("bsaPage"),
  };

  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;

      // Update active nav button
      navBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Show/hide pages
      Object.entries(pages).forEach(([key, el]) => {
        if (key === page) {
          el.classList.remove("hidden");
        } else {
          el.classList.add("hidden");
        }
      });

      // Load page data
      if (page === "dashboard") loadDashboard();
      if (page === "patients") loadPatients();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

async function loadDashboard() {
  try {
    const res = await fetch("/api/dashboard");
    const data = await res.json();

    if (data.success) {
      $("dashPatients").textContent = data.totalPatients || 0;
      $("dashReports").textContent = data.totalReports || 0;
      $("dashCompleted").textContent = data.completedReports || 0;
      $("dashAvgBMI").textContent = data.avgBMI || "N/A";
    }

    // Load recent reports
    const patientsRes = await fetch("/api/patients?limit=10");
    const patientsData = await patientsRes.json();

    if (patientsData.success && patientsData.patients.length > 0) {
      const tbody = $("recentReportsTable");
      tbody.innerHTML = patientsData.patients.slice(0, 10).map(p => `
        <tr>
          <td>${esc(p.first_name)} ${esc(p.last_name)}</td>
          <td>${p.date_of_birth}</td>
          <td>${p.gender}</td>
          <td>${p.height_cm || "-"} cm</td>
          <td>${p.weight_kg || "-"} kg</td>
          <td>
            <button class="btn-sm" onclick="viewPatient('${p.id}')">View</button>
          </td>
        </tr>
      `).join("");
    }
  } catch (e) {
    console.error("Failed to load dashboard:", e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Patients Management
// ═══════════════════════════════════════════════════════════════════════════════

async function loadPatients() {
  try {
    const res = await fetch("/api/patients");
    const data = await res.json();

    const tbody = $("patientsTable");
    if (data.success && data.patients.length > 0) {
      tbody.innerHTML = data.patients.map(p => `
        <tr>
          <td><strong>${esc(p.first_name)} ${esc(p.last_name)}</strong></td>
          <td>${p.date_of_birth}</td>
          <td>${p.gender}</td>
          <td>${p.height_cm || "-"} cm</td>
          <td>${p.weight_kg || "-"} kg</td>
          <td class="actions">
            <button class="btn-sm" onclick="viewPatient('${p.id}')">View</button>
            <button class="btn-sm danger" onclick="deletePatient('${p.id}')">Delete</button>
          </td>
        </tr>
      `).join("");
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center">No patients found. Add a patient to get started.</td></tr>`;
    }
  } catch (e) {
    console.error("Failed to load patients:", e);
  }
}

function initPatientManagement() {
  // Add patient button
  $("addPatientBtn")?.addEventListener("click", () => {
    $("addPatientModal").classList.remove("hidden");
  });

  // Close add patient modal
  $("closeAddPatientModal")?.addEventListener("click", () => {
    $("addPatientModal").classList.add("hidden");
  });

  // Add patient form
  $("addPatientForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const patientData = {
      first_name: $("patientFirstName").value,
      last_name: $("patientLastName").value,
      date_of_birth: $("patientDOB").value,
      gender: $("patientGender").value,
      height_cm: $("patientHeight").value ? parseFloat($("patientHeight").value) : null,
      weight_kg: $("patientWeight").value ? parseFloat($("patientWeight").value) : null,
    };

    try {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientData),
      });

      const data = await res.json();
      if (data.success) {
        showToast("Patient added successfully!");
        $("addPatientModal").classList.add("hidden");
        $("addPatientForm").reset();
        loadPatients();
      } else {
        showToast(data.error || "Failed to add patient");
      }
    } catch (e) {
      showToast(e.message);
    }
  });

  // Search patients
  $("patientSearch")?.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    const rows = document.querySelectorAll("#patientsTable tr");
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(query) ? "" : "none";
    });
  });
}

async function viewPatient(patientId) {
  try {
    const res = await fetch(`/api/patients/${patientId}`);
    const data = await res.json();

    if (data.success) {
      const patient = data.patient;

      // Get patient reports
      const reportsRes = await fetch(`/api/patients/${patientId}/reports`);
      const reportsData = await reportsRes.json();

      // Get dose results
      const doseRes = await fetch(`/api/patients/${patientId}/dose-results`);
      const doseData = await doseRes.json();

      const modalBody = $("patientModalBody");
      modalBody.innerHTML = `
        <div class="patient-detail-section">
          <h3>Patient Information</h3>
          <div class="patient-info-grid">
            <div class="patient-info-item">
              <span class="patient-info-label">Name</span>
              <span class="patient-info-value">${esc(patient.first_name)} ${esc(patient.last_name)}</span>
            </div>
            <div class="patient-info-item">
              <span class="patient-info-label">Date of Birth</span>
              <span class="patient-info-value">${patient.date_of_birth}</span>
            </div>
            <div class="patient-info-item">
              <span class="patient-info-label">Gender</span>
              <span class="patient-info-value">${patient.gender}</span>
            </div>
            <div class="patient-info-item">
              <span class="patient-info-label">Height</span>
              <span class="patient-info-value">${patient.height_cm || "-"} cm</span>
            </div>
            <div class="patient-info-item">
              <span class="patient-info-label">Weight</span>
              <span class="patient-info-value">${patient.weight_kg || "-"} kg</span>
            </div>
            <div class="patient-info-item">
              <span class="patient-info-label">BMI</span>
              <span class="patient-info-value">${patient.height_cm && patient.weight_kg ? (patient.weight_kg / Math.pow(patient.height_cm / 100, 2)).toFixed(1) : "-"}</span>
            </div>
          </div>
        </div>

        <div class="patient-detail-section">
          <h3>Reports (${reportsData.reports?.length || 0})</h3>
          ${reportsData.reports?.length > 0 ? `
            <table class="dose-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${reportsData.reports.map(r => `
                  <tr>
                    <td>${esc(r.filename)}</td>
                    <td><span class="badge ${r.processing_status === 'completed' ? 'badge-green' : 'badge-yellow'}">${r.processing_status}</span></td>
                    <td>${new Date(r.created_at).toLocaleDateString()}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : "<p style='color:var(--tx3)'>No reports uploaded yet.</p>"}
        </div>

        <div class="patient-detail-section">
          <h3>Dose Results (${doseData.doseResults?.length || 0})</h3>
          ${doseData.doseResults?.length > 0 ? `
            <table class="dose-table">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>BSA</th>
                  <th>Standard Dose</th>
                  <th>Final Dose</th>
                  <th>Rounded Dose</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${doseData.doseResults.map(d => `
                  <tr>
                    <td>${esc(d.drug_name || 'Unknown')}</td>
                    <td>${d.bsa_value} m²</td>
                    <td>${d.standard_dose} mg/m²</td>
                    <td>${d.final_dose_mg} mg</td>
                    <td><strong>${d.rounded_dose_mg} mg</strong></td>
                    <td>${new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          ` : "<p style='color:var(--tx3)'>No dose calculations yet.</p>"}
        </div>
      `;

      $("patientModalTitle").textContent = `${patient.first_name} ${patient.last_name}`;
      $("patientModal").classList.remove("hidden");
    }
  } catch (e) {
    showToast(e.message);
  }
}

async function deletePatient(patientId) {
  if (!confirm("Are you sure you want to delete this patient? This action cannot be undone.")) {
    return;
  }

  try {
    const res = await fetch(`/api/patients/${patientId}`, {
      method: "DELETE",
    });

    const data = await res.json();
    if (data.success) {
      showToast("Patient deleted successfully");
      loadPatients();
    } else {
      showToast(data.error || "Failed to delete patient");
    }
  } catch (e) {
    showToast(e.message);
  }
}

// Close patient modal
$("closePatientModal")?.addEventListener("click", () => {
  $("patientModal").classList.add("hidden");
});

// Close modals on backdrop click
document.querySelectorAll(".modal").forEach(modal => {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BSA Calculator
// ═══════════════════════════════════════════════════════════════════════════════

function initBSACalculator() {
  $("calculateBSABtn")?.addEventListener("click", async () => {
    const height = parseFloat($("bsaHeight").value);
    const weight = parseFloat($("bsaWeight").value);
    const formula = $("bsaFormula").value;

    if (!height || !weight) {
      showToast("Please enter both height and weight");
      return;
    }

    try {
      const res = await fetch("/api/calculate-bsa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ height_cm: height, weight_kg: weight, formula }),
      });

      const data = await res.json();
      if (data.success) {
        $("bsaBMI").textContent = data.bmi;
        $("bsaValue").textContent = data.preferred_bsa + " m²";
        $("bsaFormulaUsed").textContent = data.preferred_formula;
        $("bsaInterpretation").textContent = data.interpretation;
        $("bsaResults").classList.remove("hidden");

        // Show all formulas comparison
        const formulasList = $("bsaFormulasList");
        formulasList.innerHTML = Object.entries(data.all_formulas).map(([name, result]) => `
          <div class="bsa-formula-item">
            <div class="bsa-formula-name">${esc(name)}</div>
            <div class="bsa-formula-value">${result.bsa} m²</div>
          </div>
        `).join("");
        $("bsaAllFormulas").classList.remove("hidden");
      } else {
        showToast(data.error || "Failed to calculate BSA");
      }
    } catch (e) {
      showToast(e.message);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
  return (b / (1024 * 1024)).toFixed(1) + " MB";
}

function showToast(msg, duration = 3000) {
  const toast = $("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add("hidden"), duration);
}

function setBusy(btn, spin, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  if (spin) spin.classList.toggle("hidden", !busy);
  const lbl = btn.querySelector(".btn-label");
  if (lbl && label) lbl.textContent = label;
}

async function postForm(url, fd) {
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// Make viewPatient and deletePatient globally accessible
window.viewPatient = viewPatient;
window.deletePatient = deletePatient;
