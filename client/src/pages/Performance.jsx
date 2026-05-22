import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { getActiveProfile } from '../utils/activeProfile';

function MetricCard({ title, value, unit, description, tone = 'default' }) {
  const tones = {
    default: 'border-slate-700 bg-slate-800/80',
    success: 'border-emerald-500/30 bg-emerald-500/10 shadow-lg shadow-emerald-900/20',
    warning: 'border-amber-500/30 bg-amber-500/10 shadow-lg shadow-amber-900/20',
    danger: 'border-red-500/30 bg-red-500/10 shadow-lg shadow-red-900/20',
  };

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <h3 className="text-sm font-medium uppercase tracking-wide text-slate-400">{title}</h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-bold text-white">{value}</span>
        {unit && <span className="text-lg font-semibold text-slate-400">{unit}</span>}
      </div>
      {description && <p className="mt-2 text-sm text-slate-400">{description}</p>}
    </div>
  );
}

export default function Performance() {
  const [activeProfile, setActiveProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [form, setForm] = useState({
    daily_distance: 40,
    average_speed: 60,
    driving_style: 'Normal'
  });

  const [result, setResult] = useState(null);

  useEffect(() => {
    setActiveProfile(getActiveProfile());
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeProfile) {
      setError("Please select an active EV profile from the EV Profile tab first.");
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        profile_id: activeProfile.id,
        daily_distance: Number(form.daily_distance),
        average_speed: Number(form.average_speed),
        driving_style: form.driving_style
      };

      const res = await api.post('/performance/analyze', payload);
      setResult(res.data.analysis.result_json);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to analyze performance. Please ensure your backend and database are running.");
    } finally {
      setLoading(false);
    }
  };

  function getScoreTone(score) {
    if (score >= 80) return 'success';
    if (score >= 50) return 'warning';
    return 'danger';
  }

  function getUtilizationTone(percent) {
    if (percent <= 80) return 'success';
    if (percent <= 95) return 'warning';
    return 'danger';
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-400">FR-02</p>
        <h1 className="mt-2 text-4xl font-bold text-white">EV Performance Analyzer</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Analyze energy consumption, efficiency, and real-world range utilization based on your driving habits.
        </p>
      </div>

      {!activeProfile && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-5 text-red-100">
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <div className="font-semibold">No active EV profile selected</div>
          </div>
          <p className="mt-2 text-sm text-red-200/80">
            Please go to the EV Profile Management tab and select or create an active profile before running the analysis.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white">Analysis Parameters</h2>
            <p className="mt-1 mb-6 text-sm text-slate-400">Input your typical daily driving habits.</p>

            <div className="space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Daily Distance</span>
                <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-600 bg-slate-950/50 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={form.daily_distance}
                    onChange={(e) => setForm({...form, daily_distance: e.target.value})}
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-white outline-none"
                    required
                  />
                  <span className="flex items-center border-l border-slate-700 px-4 text-sm text-slate-400 bg-slate-900/50">km</span>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Average Speed</span>
                <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-600 bg-slate-950/50 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20">
                  <input
                    type="number"
                    min="10"
                    max="150"
                    value={form.average_speed}
                    onChange={(e) => setForm({...form, average_speed: e.target.value})}
                    className="min-w-0 flex-1 bg-transparent px-3 py-3 text-white outline-none"
                    required
                  />
                  <span className="flex items-center border-l border-slate-700 px-4 text-sm text-slate-400 bg-slate-900/50">km/h</span>
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Driving Style</span>
                <select
                  value={form.driving_style}
                  onChange={(e) => setForm({...form, driving_style: e.target.value})}
                  className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/50 px-3 py-3 text-white outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                >
                  <option value="Eco" className="bg-slate-900">Eco (Gradual acceleration)</option>
                  <option value="Normal" className="bg-slate-900">Normal (Balanced)</option>
                  <option value="Sport" className="bg-slate-900">Sport (Aggressive, high acceleration)</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={loading || !activeProfile}
                className="mt-4 w-full rounded-xl bg-blue-500 px-4 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Analyzing...' : 'Run Analysis'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-8">
          {result ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard 
                title="Overall Performance" 
                value={result.performanceScore} 
                unit="/ 100"
                tone={getScoreTone(result.performanceScore)}
                description="Aggregated score reflecting your driving efficiency and range utilization."
              />
              <MetricCard 
                title="Efficiency Score" 
                value={result.efficiencyScore} 
                unit="/ 100"
                tone={getScoreTone(result.efficiencyScore)}
                description="How well you maximize your energy based on speed and driving style."
              />
              <MetricCard 
                title="Energy Consumption" 
                value={result.energyConsumption} 
                unit="kWh/100km"
                tone="default"
                description={`Estimated consumption for ${activeProfile.vehicle_model}.`}
              />
              <MetricCard 
                title="Range Utilization" 
                value={result.rangeUtilization} 
                unit="%"
                tone={getUtilizationTone(result.rangeUtilization)}
                description={`${result.daily_distance} km used out of ${result.estimatedRange} km estimated real-world range.`}
              />
            </div>
          ) : (
             <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-8 text-center">
              <div className="rounded-full bg-slate-800 p-4">
                <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-bold text-white">Ready to Analyze</h3>
              <p className="mt-2 text-slate-400 max-w-sm">
                Enter your daily driving parameters and hit "Run Analysis" to see your real-world performance metrics.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
