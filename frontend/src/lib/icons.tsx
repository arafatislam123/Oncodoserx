// Shared icon mappings for report/slot types, used by both the analysis
// result view and the multi-report intake page.
import {
  Dna,
  FileQuestion,
  FileText,
  FlaskConical,
  Microscope,
  Scan,
  Scissors,
  Stethoscope,
  Droplet,
  type LucideIcon,
} from "lucide-react";

export const REPORT_TYPE_ICONS: Record<string, LucideIcon> = {
  HISTOPATHOLOGY: Microscope,
  COLONOSCOPY: Stethoscope,
  IMAGING: Scan,
  MOLECULAR: Dna,
  TUMOR_MARKER: FlaskConical,
  BLOOD: Droplet,
  SURGICAL_PATH: Scissors,
  CLINICAL_NOTES: FileText,
  UNKNOWN: FileQuestion,
};

export const SLOT_TYPE_ICONS: Record<string, LucideIcon> = {
  histopathology: Microscope,
  colonoscopy: Stethoscope,
  cect: Scan,
  cea: FlaskConical,
  mmr: Dna,
  molecular: Dna,
  surgical: Scissors,
  genomic: Dna,
  brca: Dna,
  nodal: Scan,
  pasted: FileText,
};

export function ReportTypeIcon({ type, ...props }: { type: string; size?: number; strokeWidth?: number; className?: string }) {
  const Icon = REPORT_TYPE_ICONS[type] || FileQuestion;
  return <Icon {...props} />;
}

export function SlotTypeIcon({ slotId, ...props }: { slotId: string; size?: number; strokeWidth?: number; className?: string }) {
  const Icon = SLOT_TYPE_ICONS[slotId] || FileText;
  return <Icon {...props} />;
}
