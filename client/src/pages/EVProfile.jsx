import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import { getActiveProfile, saveActiveProfile } from '../utils/activeProfile';

const chargingOptions = [
  { value: 'AC Slow', label: 'AC Slow', meta: 'Home / overnight charging' },
  { value: 'AC Fast', label: 'AC Fast', meta: 'Balanced daily charging' },
  { value: 'DC Fast', label: 'DC Fast', meta: 'Rapid highway top-ups' },
];

const emptyForm = {
  vehicle_model: '',
  battery_capacity: '',
  motor_power: '',
  vehicle_weight: '',
  charging_type: 'AC Slow',
  manufacturing_year: '',
};

function getApiMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function formatNumber(value, suffix = '') {
  if (value === undefined || value === null || value === '') return 'Not set';
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value}${suffix}`;
  return `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`;
}

function formatDate(value) {
  if (!value) return 'Recently';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function chargingMeta(type) {
  return chargingOptions.find((item) => item.value === normalizeChargingType(type))?.meta || 'Custom charging profile';
}

function normalizeChargingType(type) {
  const map = {
    AC_SLOW: 'AC Slow',
    AC_FAST: 'AC Fast',
    DC_FAST: 'DC Fast',
  };

  return map[type] || type;
}

function Toast({ tone = 'success', message, onClose }) {
  if (!message) return null;

  const tones = {
    success: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100',
    error: 'border-red-400/30 bg-red-500/15 text-red-100',
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className={`rounded-xl border px-4 py-3 shadow-2xl shadow-black/30 ${tones[tone]}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-1 h-2.5 w-2.5 rounded-full ${tone === 'error' ? 'bg-red-300' : 'bg-emerald-300'}`} />
          <div className="flex-1 text-sm">{message}</div>
          <button type="button" onClick={onClose} className="text-current/70 hover:text-current" aria-label="Close toast">
            x
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailTile({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function ActiveProfileCard({ profile }) {
  if (!profile) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-600 bg-slate-800/70 p-6 shadow-xl shadow-black/20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Active vehicle</p>
          <h2 className="mt-3 text-3xl font-bold text-white">No active EV profile selected</h2>
          <p className="mt-3 text-slate-300">
            Add a vehicle profile or choose Set Active from your saved profiles. The selected profile will power the
            upcoming performance, range, charging, cost, and report modules.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-400/25 bg-slate-800 shadow-2xl shadow-emerald-950/20">
      <div className="border-b border-slate-700 bg-gradient-to-r from-emerald-500/15 via-blue-500/10 to-slate-800 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Active vehicle</p>
            <h2 className="mt-2 text-3xl font-bold text-white">{profile.vehicle_model}</h2>
            <p className="mt-2 text-slate-300">
              {normalizeChargingType(profile.charging_type)} strategy selected for analysis across all EV Optimizer modules.
            </p>
          </div>
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-emerald-100">
            <div className="text-xs uppercase tracking-wide text-emerald-200/80">Profile ID</div>
            <div className="mt-1 text-2xl font-bold">#{profile.id}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
        <DetailTile label="Battery Capacity" value={formatNumber(profile.battery_capacity, ' kWh')} />
        <DetailTile label="Motor Power" value={formatNumber(profile.motor_power, ' kW')} />
        <DetailTile label="Vehicle Weight" value={formatNumber(profile.vehicle_weight, ' kg')} />
        <DetailTile label="Charging Type" value={normalizeChargingType(profile.charging_type)} />
        <DetailTile label="Manufacturing Year" value={profile.manufacturing_year} />
        <DetailTile label="Created" value={formatDate(profile.created_at)} />
      </div>
    </section>
  );
}

export default function EVProfile() {
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ tone: 'success', message: '' });

  const stats = useMemo(
    () => [
      { label: 'Saved Profiles', value: profiles.length },
      { label: 'Active Profile', value: activeProfile ? activeProfile.vehicle_model : 'None' },
      { label: 'Avg Battery', value: averageBattery(profiles) },
    ],
    [activeProfile, profiles]
  );

  async function fetchProfiles() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/ev-profiles');
      const nextProfiles = res.data?.profiles || [];
      setProfiles(nextProfiles);

      const stored = getActiveProfile();
      const freshActive = stored ? nextProfiles.find((profile) => profile.id === stored.id) : null;
      if (freshActive) {
        setActiveProfile(saveActiveProfile(freshActive));
      } else if (nextProfiles.length === 1) {
        setActiveProfile(saveActiveProfile(nextProfiles[0]));
      } else if (!freshActive && stored) {
        saveActiveProfile(null);
        setActiveProfile(null);
      }
    } catch (err) {
      setError(getApiMessage(err, 'Could not load EV profiles. Check the backend and database connection.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (!toast.message) return undefined;
    const timer = setTimeout(() => setToast({ tone: 'success', message: '' }), 3200);
    return () => clearTimeout(timer);
  }, [toast.message]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function payloadFromForm() {
    return {
      vehicle_model: form.vehicle_model.trim(),
      battery_capacity: Number(form.battery_capacity),
      motor_power: Number(form.motor_power),
      vehicle_weight: Number(form.vehicle_weight),
      charging_type: form.charging_type,
      manufacturing_year: Number(form.manufacturing_year),
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = payloadFromForm();
      const res = editingId
        ? await api.put(`/ev-profiles/${editingId}`, payload)
        : await api.post('/ev-profiles', payload);

      const savedProfile = res.data?.profile;
      if (savedProfile) setActiveProfile(saveActiveProfile(savedProfile));

      setToast({
        tone: 'success',
        message: editingId ? 'EV profile updated and set active.' : 'EV profile saved and set active.',
      });
      resetForm();
      await fetchProfiles();
    } catch (err) {
      const message = getApiMessage(err, 'Could not save this EV profile.');
      setError(message);
      setToast({ tone: 'error', message });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(profile) {
    const confirmed = window.confirm(`Delete ${profile.vehicle_model}? This cannot be undone.`);
    if (!confirmed) return;

    setError('');
    try {
      await api.delete(`/ev-profiles/${profile.id}`);
      if (activeProfile?.id === profile.id) {
        setActiveProfile(saveActiveProfile(null));
      }
      if (editingId === profile.id) resetForm();
      setToast({ tone: 'success', message: 'EV profile deleted.' });
      await fetchProfiles();
    } catch (err) {
      const message = getApiMessage(err, 'Could not delete this EV profile.');
      setError(message);
      setToast({ tone: 'error', message });
    }
  }

  function onEdit(profile) {
    setEditingId(profile.id);
    setForm({
      vehicle_model: profile.vehicle_model ?? '',
      battery_capacity: profile.battery_capacity ?? '',
      motor_power: profile.motor_power ?? '',
      vehicle_weight: profile.vehicle_weight ?? '',
      charging_type: normalizeChargingType(profile.charging_type ?? 'AC Slow'),
      manufacturing_year: profile.manufacturing_year ?? '',
    });
  }

  function onSetActive(profile) {
    setActiveProfile(saveActiveProfile(profile));
    setToast({ tone: 'success', message: `${profile.vehicle_model} is now active.` });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">FR-01</p>
          <h1 className="mt-2 text-4xl font-bold text-white">EV Profile Management</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Create, update, delete, and select the active vehicle profile used by every analysis module.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
              <div className="text-xs text-slate-400">{stat.label}</div>
              <div className="mt-1 truncate text-lg font-semibold text-white">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      <ActiveProfileCard profile={activeProfile} />

      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl shadow-black/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white">{editingId ? 'Edit EV Profile' : 'Create EV Profile'}</h2>
              <p className="mt-1 text-sm text-slate-400">Use realistic values for better downstream analysis.</p>
            </div>
            {editingId ? (
              <button type="button" onClick={resetForm} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
                Cancel
              </button>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Vehicle Model</span>
              <input
                type="text"
                value={form.vehicle_model}
                onChange={(e) => setField('vehicle_model', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/50 px-3 py-3 text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                placeholder="Tata Nexon EV Max"
                maxLength={100}
                required
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Battery Capacity" suffix="kWh" value={form.battery_capacity} onChange={(v) => setField('battery_capacity', v)} min="1" max="250" step="0.1" />
              <NumberField label="Motor Power" suffix="kW" value={form.motor_power} onChange={(v) => setField('motor_power', v)} min="1" max="1500" step="0.1" />
              <NumberField label="Vehicle Weight" suffix="kg" value={form.vehicle_weight} onChange={(v) => setField('vehicle_weight', v)} min="500" max="5000" step="1" />
              <NumberField label="Manufacturing Year" value={form.manufacturing_year} onChange={(v) => setField('manufacturing_year', v)} min="1990" max={String(new Date().getFullYear() + 1)} step="1" />
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Charging Type</span>
              <select
                value={form.charging_type}
                onChange={(e) => setField('charging_type', e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/50 px-3 py-3 text-white outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
              >
                {chargingOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-900">
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs text-slate-400">{chargingMeta(form.charging_type)}</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Saving...' : editingId ? 'Update and Set Active' : 'Save and Set Active'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Saved Profiles</h2>
              <p className="mt-1 text-sm text-slate-400">Edit, delete, or set the active vehicle for analysis.</p>
            </div>
            <button type="button" onClick={fetchProfiles} className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950/40 p-6 text-slate-300">Loading profiles...</div>
          ) : profiles.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-600 bg-slate-950/40 p-8 text-center">
              <h3 className="text-lg font-semibold text-white">No saved profiles yet</h3>
              <p className="mt-2 text-sm text-slate-400">Create your first EV profile to unlock analysis modules.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {profiles.map((profile) => {
                const isActive = activeProfile?.id === profile.id;
                return (
                  <article
                    key={profile.id}
                    className={`rounded-2xl border p-4 transition ${
                      isActive
                        ? 'border-emerald-400/50 bg-emerald-500/10 shadow-lg shadow-emerald-950/20'
                        : 'border-slate-700 bg-slate-950/35 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-white">{profile.vehicle_model}</h3>
                          {isActive ? (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-1 text-xs font-semibold text-emerald-200">
                              Active
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-slate-400">{chargingMeta(profile.charging_type)}</p>
                      </div>
                      <div className="text-right text-xs text-slate-500">{formatDate(profile.created_at)}</div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <MiniMetric label="Battery" value={formatNumber(profile.battery_capacity, ' kWh')} />
                      <MiniMetric label="Power" value={formatNumber(profile.motor_power, ' kW')} />
                      <MiniMetric label="Weight" value={formatNumber(profile.vehicle_weight, ' kg')} />
                      <MiniMetric label="Year" value={profile.manufacturing_year} />
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={() => onSetActive(profile)} disabled={isActive} className="flex-1 rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:bg-slate-700 disabled:text-slate-400">
                        {isActive ? 'Selected' : 'Set Active'}
                      </button>
                      <button type="button" onClick={() => onEdit(profile)} className="flex-1 rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700">
                        Edit
                      </button>
                      <button type="button" onClick={() => onDelete(profile)} className="flex-1 rounded-lg border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10">
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Toast tone={toast.tone} message={toast.message} onClose={() => setToast({ tone: 'success', message: '' })} />
    </div>
  );
}

function NumberField({ label, suffix, value, onChange, min, max, step }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-600 bg-slate-950/50 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/20">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-white outline-none"
          min={min}
          max={max}
          step={step}
          required
        />
        {suffix ? <span className="flex items-center border-l border-slate-700 px-3 text-sm text-slate-400">{suffix}</span> : null}
      </div>
    </label>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function averageBattery(profiles) {
  if (!profiles.length) return '0 kWh';
  const total = profiles.reduce((sum, profile) => sum + Number(profile.battery_capacity || 0), 0);
  return `${(total / profiles.length).toFixed(1)} kWh`;
}
