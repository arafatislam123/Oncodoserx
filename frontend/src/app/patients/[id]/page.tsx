"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api, ApiError, type Patient, type PatientDoseResult, type PatientReport } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/context";

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useLanguage();
  const { id } = use(params);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [reports, setReports] = useState<PatientReport[]>([]);
  const [doseResults, setDoseResults] = useState<PatientDoseResult[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getPatient(id), api.getPatientReports(id), api.getPatientDoseResults(id)])
      .then(([p, r, d]) => {
        setPatient(p);
        setReports(r);
        setDoseResults(d);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Failed to load patient"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-slate-500">{t("common.loading")}</p>;

  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
    );
  }

  if (!patient) return null;

  const bmi =
    patient.height_cm && patient.weight_kg
      ? (patient.weight_kg / Math.pow(patient.height_cm / 100, 2)).toFixed(1)
      : "-";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/patients" className="flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
          <ArrowLeft size={13} /> {t("patientDetail.back")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {patient.first_name} {patient.last_name}
        </h1>
      </div>

      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field label={t("patientDetail.dob")} value={patient.date_of_birth} />
        <Field label={t("patientDetail.gender")} value={patient.gender} />
        <Field label={t("patientDetail.height")} value={patient.height_cm ? `${patient.height_cm} cm` : "-"} />
        <Field label={t("patientDetail.weight")} value={patient.weight_kg ? `${patient.weight_kg} kg` : "-"} />
        <Field label={t("patientDetail.bmi")} value={bmi} />
      </div>

      <div className="card overflow-x-auto">
        <span className="section-label">{t("patientDetail.reports")} ({reports.length})</span>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{t("patientDetail.noReports")}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-slate-100 text-left">
              <tr>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnFilename")}</th>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnStatus")}</th>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnDate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-slate-700">{r.filename}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`badge ${
                        r.processing_status === "completed"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {r.processing_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto">
        <span className="section-label">{t("patientDetail.doseResults")} ({doseResults.length})</span>
        {doseResults.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">{t("patientDetail.noDoseResults")}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-slate-100 text-left">
              <tr>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnDrug")}</th>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnBsa")}</th>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnStandardDose")}</th>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnFinalDose")}</th>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnRoundedDose")}</th>
                <th className="section-label px-3 py-2 font-semibold">{t("patientDetail.columnDate")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doseResults.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 text-slate-700">{d.drug_name || "Unknown"}</td>
                  <td className="px-3 py-2 text-slate-500">{d.bsa_value} m²</td>
                  <td className="px-3 py-2 text-slate-500">{d.standard_dose} mg/m²</td>
                  <td className="px-3 py-2 text-slate-500">{d.final_dose_mg} mg</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{d.rounded_dose_mg} mg</td>
                  <td className="px-3 py-2 text-slate-400">{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 font-medium capitalize text-slate-900">{value}</dd>
    </div>
  );
}
