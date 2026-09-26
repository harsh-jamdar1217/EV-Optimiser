import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { getActiveProfile } from '../utils/activeProfile';

export default function AIAdvisor() {
  const [profile, setProfile] = useState(getActiveProfile());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const handler = () => setProfile(getActiveProfile());
    window.addEventListener('active-profile-change', handler);
    return () => window.removeEventListener('active-profile-change', handler);
  }, []);

  const handleGenerate = async () => {
    if (!profile?.id) {
      setError('Select an active EV profile first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/ai/recommendations', { profile_id: profile.id });
      setResult(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to fetch AI recommendations.');
    } finally {
      setLoading(false);
    }
  };

  const priorityStyles = {
    high: 'border-red-500/30 bg-red-500/10 text-red-300',
    medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-400">FR-08</p>
        <h1 className="mt-2 text-4xl font-bold text-white">AI Advisor</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Get a personalized AI-generated assessment based on your vehicle's latest performance, battery, and degradation data.
        </p>
      </div>

      {!profile?.id && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No active EV profile selected. Choose one from the EV Profile page first.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">
              {profile?.vehicle_model ? `Analyzing: ${profile.vehicle_model}` : 'No vehicle selected'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Uses your most recent performance, battery, range, and degradation results.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || !profile?.id}
            className="rounded-xl bg-blue-500 px-6 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Thinking...' : 'Generate AI Recommendations'}
          </button>
        </div>
      </div>

      {result ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6 shadow-xl">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-300">Summary</h3>
            <p className="mt-2 text-lg text-white leading-relaxed">{result.summary}</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4">Recommendations</h3>
            <div className="space-y-3">
              {result.recommendations.map((rec, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 ${priorityStyles[rec.priority] || priorityStyles.medium}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-white">{rec.title}</h4>
                    <span className="rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
                      {rec.priority}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{rec.detail}</p>
                </div>
              ))}
            </div>
          </div>
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
            Click "Generate AI Recommendations" to get a personalized battery and efficiency assessment.
          </p>
        </div>
      )}
    </div>
  );
}