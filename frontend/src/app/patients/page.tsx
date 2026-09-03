"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Users } from "lucide-react";
import { api, ApiError, type Patient } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/context";

export default function PatientsPage() {
  const { t } = useLanguage();
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
          <span className="section-label">{t("patients.eyebrow")}</span>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
            <Users size={20} strokeWidth={2} className="text-brand-700" /> {t("patients.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("patients.subtitle")}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
          <Plus size={14} /> {showForm ? t("common.cancel") : t("patients.newPatient")}
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">{t("common.loading")}</p>
      ) : patients.length === 0 ? (
        <div className="card text-center text-sm text-slate-400">{t("patients.noPatients")}</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-left">
              <tr>
                <th className="section-label px-4 py-2.5 font-semibold">{t("patients.columnName")}</th>
                <th className="section-label px-4 py-2.5 font-semibold">{t("patients.columnDob")}</th>
                <th className="section-label px-4 py-2.5 font-semibold">{t("patients.columnGender")}</th>
                <th className="section-label px-4 py-2.5 font-semibold">{t("patients.columnHeightWeight")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map((p) => (
                <tr key={p.id} className="group hover:bg-slate-50/80">
                  <td className="px-4 py-2.5">
                    <Link href={`/patients/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.first_name} {p.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{p.date_of_birth}</td>
                  <td className="px-4 py-2.5 capitalize text-slate-500">{p.gender}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {p.height_cm ? `${p.height_cm} cm` : "—"} / {p.weight_kg ? `${p.weight_kg} kg` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      className="rounded-md p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                      title={t("common.delete")}
                      onClick={async () => {
                        if (!confirm(t("patients.deleteConfirm"))) return;
                        await api.deletePatient(p.id);
                        load();
                      }}
                    >
                      <Trash2 size={14} />
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
  const { t } = useLanguage();
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
        <label className="field-label">{t("patients.form.firstName")}</label>
        <input className="field-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
      </div>
      <div>
        <label className="field-label">{t("patients.form.lastName")}</label>
        <input className="field-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
      </div>
      <div>
        <label className="field-label">{t("patients.form.dob")}</label>
        <input
          className="field-input"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="field-label">{t("patients.form.gender")}</label>
        <select
          className="field-input"
          value={gender}
          onChange={(e) => setGender(e.target.value as "male" | "female" | "other")}
        >
          <option value="female">{t("common.female")}</option>
          <option value="male">{t("common.male")}</option>
          <option value="other">{t("common.other")}</option>
        </select>
      </div>
      <div>
        <label className="field-label">{t("patients.form.height")}</label>
        <input
          className="field-input"
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">{t("patients.form.weight")}</label>
        <input
          className="field-input"
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </div>
      {err && (
        <div className="sm:col-span-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}
      <div className="sm:col-span-3">
        <button disabled={saving} className="btn-primary">
          {saving ? t("common.saving") : t("patients.form.submit")}
        </button>
      </div>
    </form>
  );
}
