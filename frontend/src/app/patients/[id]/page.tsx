"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
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
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        ⚠️ {err}
      </div>
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
        <Link href="/patients" className="text-sm text-blue-600 hover:underline">
          ← Back to Patients
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">
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
        <h2 className="text-lg font-semibold text-slate-900">Reports ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No reports uploaded for this patient yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Filename</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-slate-800">{r.filename}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.processing_status === "completed"
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {r.processing_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-lg font-semibold text-slate-900">Dose Results ({doseResults.length})</h2>
        {doseResults.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No dose calculations recorded for this patient yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Drug</th>
                <th className="px-3 py-2 font-medium">BSA</th>
                <th className="px-3 py-2 font-medium">Standard Dose</th>
                <th className="px-3 py-2 font-medium">Final Dose</th>
                <th className="px-3 py-2 font-medium">Rounded Dose</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doseResults.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 text-slate-800">{d.drug_name || "Unknown"}</td>
                  <td className="px-3 py-2 text-slate-600">{d.bsa_value} m²</td>
                  <td className="px-3 py-2 text-slate-600">{d.standard_dose} mg/m²</td>
                  <td className="px-3 py-2 text-slate-600">{d.final_dose_mg} mg</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{d.rounded_dose_mg} mg</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(d.created_at).toLocaleDateString()}</td>
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
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium capitalize text-slate-900">{value}</dd>
    </div>
  );
}
