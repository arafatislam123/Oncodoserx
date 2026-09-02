"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api, ApiError, type Patient, type PatientDoseResult, type PatientReport } from "@/lib/api";

export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

  if (loading) return <p className="text-slate-500">Loading…</p>;

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
          <ArrowLeft size={13} /> Back to Patients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {patient.first_name} {patient.last_name}
        </h1>
      </div>

      <div className="card grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Date of Birth" value={patient.date_of_birth} />
        <Field label="Gender" value={patient.gender} />
        <Field label="Height" value={patient.height_cm ? `${patient.height_cm} cm` : "-"} />
        <Field label="Weight" value={patient.weight_kg ? `${patient.weight_kg} kg` : "-"} />
        <Field label="BMI" value={bmi} />
      </div>

      <div className="card overflow-x-auto">
        <span className="section-label">Reports ({reports.length})</span>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No reports uploaded for this patient yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-slate-100 text-left">
              <tr>
                <th className="section-label px-3 py-2 font-semibold">Filename</th>
                <th className="section-label px-3 py-2 font-semibold">Status</th>
                <th className="section-label px-3 py-2 font-semibold">Date</th>
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
        <span className="section-label">Dose Results ({doseResults.length})</span>
        {doseResults.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No dose calculations recorded for this patient yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-slate-100 text-left">
              <tr>
                <th className="section-label px-3 py-2 font-semibold">Drug</th>
                <th className="section-label px-3 py-2 font-semibold">BSA</th>
                <th className="section-label px-3 py-2 font-semibold">Standard Dose</th>
                <th className="section-label px-3 py-2 font-semibold">Final Dose</th>
                <th className="section-label px-3 py-2 font-semibold">Rounded Dose</th>
                <th className="section-label px-3 py-2 font-semibold">Date</th>
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
