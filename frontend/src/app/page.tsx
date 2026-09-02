import Link from "next/link";
import { AlertTriangle, ArrowRight, FolderOpen, LayoutDashboard, Ruler, Upload, Users } from "lucide-react";

const FEATURES = [
  {
    href: "/upload",
    icon: Upload,
    title: "Upload Report",
    description: "Upload a single PDF or image of an oncology report. OCR and NLP extraction identify cancer type, stage, and biomarkers.",
  },
  {
    href: "/multi-upload",
    icon: FolderOpen,
    title: "Multi-Report Intake",
    description: "Combine histopathology, imaging, and molecular reports into one analysis, with cancer-type-specific document checklists.",
  },
  {
    href: "/patients",
    icon: Users,
    title: "Patients",
    description: "Review patient records, uploaded reports, and dose calculation history.",
  },
  {
    href: "/bsa",
    icon: Ruler,
    title: "BSA Calculator",
    description: "Body Surface Area across five clinical formulas — Mosteller, Du Bois, Haycock, Boyd, and Gehan & George.",
  },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <span className="section-label">Oncology decision support</span>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Report extraction, regimen prediction, and dose calculation
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-slate-500">
          Upload an oncology report to get an NCCN rule-based and ML-backed regimen recommendation, then compute a
          clinically-rounded chemotherapy dose from Body Surface Area.
        </p>
        <div className="mt-1 flex gap-2">
          <Link href="/upload" className="btn-primary">
            Analyze a report <ArrowRight size={14} />
          </Link>
          <Link href="/dashboard" className="btn-secondary">
            <LayoutDashboard size={14} /> View dashboard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <Link
              key={f.href}
              href={f.href}
              className="group card flex flex-col transition hover:border-brand-200 hover:shadow-[0_2px_10px_rgba(15,23,42,0.06)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                <Icon size={17} strokeWidth={2} />
              </span>
              <h2 className="mt-3 text-[15px] font-semibold text-slate-900">{f.title}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{f.description}</p>
              <span className="mt-3 flex items-center gap-1 text-[13px] font-medium text-brand-700 opacity-0 transition group-hover:opacity-100">
                Open <ArrowRight size={13} />
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          Clinical decision-support tool only. All recommendations must be reviewed by a licensed oncologist before
          administration.
        </span>
      </div>
    </div>
  );
}
