import Link from "next/link";

const FEATURES = [
  {
    href: "/upload",
    icon: "📤",
    title: "Upload Report",
    description: "Upload a PDF or image of an oncology report — OCR + AI extracts cancer type, stage, regimen and dose.",
  },
  {
    href: "/dashboard",
    icon: "📊",
    title: "Dashboard",
    description: "View platform statistics: total patients, reports processed, and completion rates.",
  },
  {
    href: "/patients",
    icon: "👤",
    title: "Patients",
    description: "Manage patient records, review reports and dose history per patient.",
  },
  {
    href: "/bsa",
    icon: "📐",
    title: "BSA Calculator",
    description: "Calculate Body Surface Area using Mosteller, Du Bois, Haycock, Boyd, or Gehan & George formulas.",
  },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-linear-to-br from-blue-600 to-blue-700 p-10 text-white">
        <h1 className="text-3xl font-bold">OncoDoseRx</h1>
        <p className="mt-2 max-w-2xl text-blue-100">
          AI-powered chemotherapy dose calculation and oncology report extraction
          platform. Upload a report, get an NCCN rule-based and ML-backed regimen
          recommendation, and compute a clinically-rounded dose.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Link key={f.href} href={f.href} className="card transition hover:border-blue-300 hover:shadow-md">
            <div className="text-3xl">{f.icon}</div>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">{f.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{f.description}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠️ Clinical decision-support tool only. All recommendations must be
        reviewed by a licensed oncologist before administration.
      </div>
    </div>
  );
}
