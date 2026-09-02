// Multi-report intake slot definitions — ported from public/app.js.
// The Express server (server.js MULTI_FIELDS) only knows these 7 field
// names directly; anything else must go through `${field}_extra` or
// `extra_N`. Keep FIXED_FIELDS in sync with server.js's MULTI_FIELDS.
export const FIXED_FIELDS = [
  "histopathology",
  "colonoscopy",
  "cect",
  "cea",
  "mmr",
  "molecular",
  "surgical",
] as const;

export type FixedField = (typeof FIXED_FIELDS)[number];

export interface SlotDef {
  id: string;
  title: string;
  desc: string;
  required: boolean;
  reason?: string;
  reportId?: string;
  isConditional?: boolean;
}

export const DEFAULT_SLOTS: SlotDef[] = [
  { id: "histopathology", title: "Histopathology / Biopsy", desc: "Confirms cancer type and grade", required: true, reason: "Essential for diagnosis" },
  { id: "cect", title: "Imaging (CT/MRI)", desc: "Staging and metastasis", required: true, reason: "Essential for staging" },
];

export const ALLOWED_EXTS = new Set([".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp"]);
export const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function getExt(name: string) {
  return name.slice(name.lastIndexOf(".")).toLowerCase();
}
export function isImg(file: File) {
  return IMAGE_EXTS.has(getExt(file.name));
}

export function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Keywords used to auto-detect which slot a bulk-uploaded file belongs to.
export const SLOT_KEYWORDS: Record<string, string[]> = {
  histopathology: ["histopath", "biopsy", "histology", "pathology", "histo", "biopsi", "patho", "tissue", "specimen", "h&e"],
  colonoscopy: ["colonoscopy", "endoscopy", "colonoscop", "scope", "colon", "endo", "polyp", "colonoscopic"],
  cect: ["cect", "ct scan", "ct chest", "ct abdomen", "ct pelvis", "mri", "pet", "xray", "x-ray", "radiology", "imaging", "scan", "computed"],
  cea: ["cea", "carcinoembryonic", "tumour marker", "tumor marker", "serum", "blood test", "lab report", "laboratory"],
  mmr: ["mmr", "msi", "mismatch", "mlh1", "msh2", "msh6", "pms2", "microsatellite", "dmmr", "pmmr"],
  molecular: ["molecular", "kras", "nras", "braf", "genetic", "mutation", "ngssio", "ngs", "genomic", "her2", "egfr", "dna"],
  surgical: ["surgical", "surgery", "operation", "resection", "post op", "postop", "post-op", "specimen", "hemicolectomy", "colectomy", "tnm stage"],
  genomic: ["oncotype", "mammaprint", "genomic", "recurrence score", "risk score"],
  brca: ["brca", "brca1", "brca2", "germline", "hereditary", "genetic testing"],
  nodal: ["sentinel", "node biopsy", "axillary", "lymph node", "nodal staging", "sln"],
};

export const SLOT_NAMES: Record<string, string> = {
  histopathology: "Histopathology", colonoscopy: "Colonoscopy", cect: "CECT Imaging",
  cea: "CEA", mmr: "MMR/MSI", molecular: "Molecular Panel", surgical: "Surgical Path",
  genomic: "Genomic Risk Score", brca: "BRCA Testing", nodal: "Nodal Staging", pasted: "Pasted Text",
};

// Guess the best slot for a bulk-uploaded file from its filename.
export function guessSlot(filename: string): string | null {
  const lower = filename.toLowerCase().replace(/[_\-.]/g, " ");
  let best: string | null = null;
  let bestScore = 0;
  for (const [slotId, keywords] of Object.entries(SLOT_KEYWORDS)) {
    const score = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = slotId;
    }
  }
  return bestScore > 0 ? best : null;
}

// Maps a pathway's required-report id (e.g. "histo", "ras", "mri_brain") to a
// concrete upload slot. Several report ids can map to the same slot id
// (e.g. "mri", "mri_brain", "cect", "pet_ct" all map to "cect").
const REPORT_SLOT_MAP: Record<string, Omit<SlotDef, "required" | "reason" | "reportId" | "isConditional">> = {
  histo: { id: "histopathology", title: "Histopathology / Biopsy", desc: "Tumour type, grade, differentiation" },
  imaging: { id: "cect", title: "Imaging (CT/MRI/PET)", desc: "Staging, metastasis assessment" },
  cect: { id: "cect", title: "CECT Chest + Abdomen + Pelvis", desc: "Distant staging" },
  mri: { id: "cect", title: "MRI", desc: "Local staging" },
  mri_brain: { id: "cect", title: "MRI Brain", desc: "Brain staging" },
  cea: { id: "cea", title: "CEA", desc: "Tumour marker" },
  mmr: { id: "mmr", title: "MMR / MSI Testing", desc: "MLH1, MSH2, MSH6, PMS2" },
  ras: { id: "molecular", title: "KRAS / NRAS / BRAF", desc: "Molecular panel" },
  pdl1: { id: "molecular", title: "PD-L1 Testing", desc: "Immunotherapy eligibility" },
  receptor: { id: "molecular", title: "Receptor Testing (ER/PR/HER2)", desc: "Breast cancer subtyping" },
  brca: { id: "molecular", title: "BRCA1/BRCA2 Testing", desc: "Genetic testing" },
  molecular: { id: "molecular", title: "Molecular / Genetic Panel", desc: "Comprehensive genomic profiling" },
  scope: { id: "colonoscopy", title: "Colonoscopy / Endoscopy", desc: "Tumour location, size" },
  surg: { id: "surgical", title: "Surgical Histopathology", desc: "pTNM stage, margins" },
  cytogen: { id: "molecular", title: "Cytogenetics", desc: "Karyotype, FISH" },
  ihc: { id: "molecular", title: "Immunophenotyping (IHC)", desc: "CD20, BCL2, BCL6, MYC" },
  pet_ct: { id: "cect", title: "PET-CT", desc: "FDG-PET staging" },
  bm: { id: "histopathology", title: "Bone Marrow Biopsy", desc: "Blast percentage, cytochemistry" },
  cbc: { id: "cea", title: "CBC + Blood Film", desc: "Haematology" },
  ldh_b2m: { id: "cea", title: "LDH + Beta-2 Microglobulin", desc: "ISS staging" },
  afp: { id: "cea", title: "AFP", desc: "Tumour marker" },
  psa: { id: "cea", title: "PSA", desc: "Tumour marker" },
  ca125: { id: "cea", title: "CA-125", desc: "Tumour marker" },
  ca199: { id: "cea", title: "CA 19-9", desc: "Tumour marker" },
  hrd: { id: "molecular", title: "HRD Testing", desc: "Homologous Recombination Deficiency" },
  liver_fn: { id: "cea", title: "Liver Function Tests", desc: "Child-Pugh score" },
  hbv_hcv: { id: "cea", title: "HBV / HCV Serology", desc: "Aetiology testing" },
  spep: { id: "cea", title: "SPEP / UPEP + Free Light Chains", desc: "M-protein quantification" },
  neuro: { id: "histopathology", title: "Neurological Assessment", desc: "KPS/ECOG baseline" },
  bone_scan: { id: "cect", title: "Bone Scan / PSMA PET-CT", desc: "Bone metastasis staging" },
  genomic: { id: "genomic", title: "Genomic Risk Score (Oncotype DX / MammaPrint)", desc: "Recurrence risk assessment for ER+/HER2- early breast cancer" },
  nodal: { id: "nodal", title: "Sentinel Node Biopsy / Axillary Evaluation", desc: "Nodal staging if imaging is indeterminate" },
};

export function isBreastCancer(cancerType: string | null) {
  return cancerType === "Breast Cancer" || (cancerType?.toLowerCase().includes("breast") ?? false);
}

// Build the list of upload slots to show for a selected cancer type's
// pathway requirements, mirroring public/app.js's buildDynamicSlots.
export function buildDynamicSlots(
  requirements: { requiredReports: { id: string; reason?: string }[]; requiredFields: string[]; conditionalReports?: { id: string; reason?: string }[] },
  cancerType: string | null
): SlotDef[] {
  const seenSlots = new Set<string>();
  const slots: SlotDef[] = [];

  for (const report of requirements.requiredReports) {
    const mapped = REPORT_SLOT_MAP[report.id];
    if (!mapped || seenSlots.has(mapped.id)) continue;
    seenSlots.add(mapped.id);
    slots.push({
      ...mapped,
      required: requirements.requiredFields.length <= 2,
      reason: report.reason,
      reportId: report.id,
    });
  }

  if (requirements.conditionalReports?.length && isBreastCancer(cancerType)) {
    for (const report of requirements.conditionalReports) {
      const mapped = REPORT_SLOT_MAP[report.id];
      if (!mapped || seenSlots.has(mapped.id)) continue;
      seenSlots.add(mapped.id);
      slots.push({
        ...mapped,
        required: false,
        reason: report.reason,
        reportId: report.id,
        isConditional: true,
      });
    }
  }

  if (slots.length === 0) return DEFAULT_SLOTS;
  return slots;
}

// Map slot-assigned files to the multipart field names server.js's multer
// config will actually accept. The 7 fixed ids go through as-is; a second
// file assigned to an already-used fixed slot rides in `${slot}_extra`; any
// non-fixed slot id (e.g. the breast-conditional "genomic"/"nodal" slots,
// which server.js does not know by name) rides in `extra_N` — appending
// those under their raw id would trigger a Multer "Unexpected field" error.
export function toFormFieldNames(items: { slotId: string; file: File }[]): Record<string, File> {
  const fields: Record<string, File> = {};
  let extraIdx = 0;
  const usedFixed = new Set<string>();
  for (const { slotId, file } of items) {
    if ((FIXED_FIELDS as readonly string[]).includes(slotId)) {
      if (!usedFixed.has(slotId)) {
        fields[slotId] = file;
        usedFixed.add(slotId);
      } else {
        fields[`${slotId}_extra`] = file;
      }
    } else {
      fields[`extra_${extraIdx++}`] = file;
    }
  }
  return fields;
}
