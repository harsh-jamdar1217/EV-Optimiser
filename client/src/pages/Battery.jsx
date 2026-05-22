import { useState } from 'react';
import { api } from '../api/api';

export default function Battery() {
  const [form, setForm] = useState({
    chargingFrequency: 'every2days',
    fastChargingUsage: 'sometimes',
    chargingRange: '20-80',
    dailyUsagePattern: 'moderate'
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [advice, setAdvice] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await api.post('/battery/advice', form);
      setAdvice(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to fetch battery advice.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-400">FR-03</p>
        <h1 className="mt-2 text-4xl font-bold text-white">Battery Optimization Advisor</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Get actionable recommendations to maximize your battery's lifespan based on your charging habits.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white">Your Habits</h2>
            <p className="mt-1 mb-6 text-sm text-slate-400">Tell us how you charge your vehicle.</p>

            <div className="space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Charging Frequency</span>
                <select
                  value={form.chargingFrequency}
                  onChange={(e) => setForm({...form, chargingFrequency: e.target.value})}
                  className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                >
                  <option value="daily">Daily</option>
                  <option value="every2days">Every 2-3 Days</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">DC Fast Charging Usage</span>
                <select
                  value={form.fastChargingUsage}
                  onChange={(e) => setForm({...form, fastChargingUsage: e.target.value})}
                  className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                >
                  <option value="never">Never (AC Only)</option>
                  <option value="sometimes">Sometimes (Road trips only)</option>
                  <option value="often">Often (Weekly or more)</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Typical Charging Range</span>
                <select
                  value={form.chargingRange}
                  onChange={(e) => setForm({...form, chargingRange: e.target.value})}
                  className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                >
                  <option value="20-80">20% to 80% (Recommended)</option>
                  <option value="20-90">20% to 90%</option>
                  <option value="0-100">Near 0% to 100%</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Daily Usage Pattern</span>
                <select
                  value={form.dailyUsagePattern}
                  onChange={(e) => setForm({...form, dailyUsagePattern: e.target.value})}
                  className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950/50 px-3 py-3 text-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
                >
                  <option value="light">Light (Under 30km)</option>
                  <option value="moderate">Moderate (30-80km)</option>
                  <option value="heavy">Heavy (Over 80km)</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-4 w-full rounded-xl bg-blue-500 px-4 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Analyzing...' : 'Get Advice'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-7">
          {advice ? (
            <div className="space-y-6">
              {/* Highlight Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 shadow-lg shadow-emerald-900/20 text-center">
                  <h3 className="text-sm font-medium uppercase tracking-wide text-slate-300">Expected Life Improvement</h3>
                  <div className="mt-2 text-5xl font-extrabold text-emerald-400">+{advice.expectedLifeImprovement}%</div>
                </div>
                
                <div className={`rounded-2xl border p-6 text-center shadow-lg ${
                  advice.riskLevel === 'High' ? 'border-red-500/30 bg-red-500/10 shadow-red-900/20' : 
                  advice.riskLevel === 'Medium' ? 'border-amber-500/30 bg-amber-500/10 shadow-amber-900/20' : 
                  'border-emerald-500/30 bg-emerald-500/10 shadow-emerald-900/20'
                }`}>
                  <h3 className="text-sm font-medium uppercase tracking-wide text-slate-300">Degradation Risk Level</h3>
                  <div className={`mt-2 text-5xl font-extrabold ${
                    advice.riskLevel === 'High' ? 'text-red-400' : 
                    advice.riskLevel === 'Medium' ? 'text-amber-400' : 
                    'text-emerald-400'
                  }`}>{advice.riskLevel}</div>
                </div>
              </div>

              {/* Practice Comparison */}
              <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                <h3 className="text-lg font-bold text-white">Current vs Recommended</h3>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-slate-900/50 p-4 border border-slate-700">
                    <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">Your Practice</p>
                    <ul className="space-y-2 text-sm text-slate-300">
                      <li>Range: <span className="text-white font-medium">{advice.currentPractice.chargingRange}</span></li>
                      <li>Fast Charging: <span className="text-white font-medium capitalize">{advice.currentPractice.fastChargingUsage}</span></li>
                    </ul>
                  </div>
                  <div className="rounded-xl bg-blue-900/20 p-4 border border-blue-500/30">
                    <p className="text-xs uppercase tracking-wider text-blue-400 font-semibold mb-3">Recommended</p>
                    <ul className="space-y-2 text-sm text-blue-100">
                      <li>Range: <span className="text-white font-medium">20-80%</span></li>
                      <li>Fast Charging: <span className="text-white font-medium">Never/Rarely</span></li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Recommendations Checklist */}
              <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                <h3 className="text-lg font-bold text-white mb-4">Actionable Recommendations</h3>
                <ul className="space-y-3">
                  {advice.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-slate-300 leading-relaxed">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          ) : (
             <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-8 text-center">
              <div className="rounded-full bg-slate-800 p-4">
                <svg className="h-8 w-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-bold text-white">Ready for Advice</h3>
              <p className="mt-2 text-slate-400 max-w-sm">
                Enter your charging habits and get personalized advice to extend your battery's life.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
