"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type Patient } from "@/lib/api";

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function fetchPatients() {
    return api
      .listPatients()
      .then(setPatients)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Failed to load patients"))
      .finally(() => setLoading(false));
  }

  function load() {
    setLoading(true);
    fetchPatients();
  }

  useEffect(() => {
    fetchPatients();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">👤 Patients</h1>
          <p className="mt-1 text-slate-600">Manage patient records.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New Patient"}
        </button>
      </div>

      {showForm && (
        <NewPatientForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {err}
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : patients.length === 0 ? (
        <p className="text-slate-500">No patients yet.</p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">DOB</th>
                <th className="px-4 py-3 font-medium">Gender</th>
                <th className="px-4 py-3 font-medium">Height / Weight</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/patients/${p.id}`} className="font-medium text-blue-600 hover:underline">
                      {p.first_name} {p.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.date_of_birth}</td>
                  <td className="px-4 py-3 capitalize text-slate-600">{p.gender}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.height_cm ? `${p.height_cm} cm` : "—"} / {p.weight_kg ? `${p.weight_kg} kg` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs font-medium text-red-600 hover:underline"
                      onClick={async () => {
                        if (!confirm("Are you sure you want to delete this patient? This action cannot be undone.")) return;
                        await api.deletePatient(p.id);
                        load();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewPatientForm({ onCreated }: { onCreated: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("female");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api.createPatient({
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob,
        gender,
        height_cm: height ? parseFloat(height) : undefined,
        weight_kg: weight ? parseFloat(weight) : undefined,
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to create patient");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <label className="field-label">First name</label>
        <input className="field-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
      </div>
      <div>
        <label className="field-label">Last name</label>
        <input className="field-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
      </div>
      <div>
        <label className="field-label">Date of birth</label>
        <input
          className="field-input"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="field-label">Gender</label>
        <select
          className="field-input"
          value={gender}
          onChange={(e) => setGender(e.target.value as "male" | "female" | "other")}
        >
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="field-label">Height (cm)</label>
        <input
          className="field-input"
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">Weight (kg)</label>
        <input
          className="field-input"
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </div>
      {err && (
        <div className="sm:col-span-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          ⚠️ {err}
        </div>
      )}
      <div className="sm:col-span-3">
        <button disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Create Patient"}
        </button>
      </div>
    </form>
  );
}
