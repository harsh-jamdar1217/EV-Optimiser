import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { getActiveProfile } from '../utils/activeProfile';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const defaultScenarioA = { temperature: 35, chargingLimit: 100, fastChargingRatio: 60, annualMileage: 18000 };
const defaultScenarioB = { temperature: 22, chargingLimit: 80, fastChargingRatio: 10, annualMileage: 12000 };

function ScenarioControls({ label, accent, values, onChange }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl space-y-5">
      <h3 className={`text-lg font-bold ${accent}`}>{label}</h3>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-slate-200">Avg. Temperature</span>
          <span className="font-bold text-slate-100">{values.temperature}°C</span>
        </div>
        <input
          type="range" min="-10" max="45" value={values.temperature}
          onChange={(e) => onChange({ ...values, temperature: Number(e.target.value) })}
          className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-400"
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-slate-200">Charging Limit</span>
          <span className="font-bold text-slate-100">{values.chargingLimit}%</span>
        </div>
        <input
          type="range" min="50" max="100" value={values.chargingLimit}
          onChange={(e) => onChange({ ...values, chargingLimit: Number(e.target.value) })}
          className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-slate-200">Fast Charging Ratio</span>
          <span className="font-bold text-slate-100">{values.fastChargingRatio}%</span>
        </div>
        <input
          type="range" min="0" max="100" value={values.fastChargingRatio}
          onChange={(e) => onChange({ ...values, fastChargingRatio: Number(e.target.value) })}
          className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
        />
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium text-slate-200">Annual Mileage</span>
          <span className="font-bold text-slate-100">{values.annualMileage.toLocaleString()} km</span>
        </div>
        <input
          type="range" min="2000" max="30000" step="1000" value={values.annualMileage}
          onChange={(e) => onChange({ ...values, annualMileage: Number(e.target.value) })}
          className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-slate-400"
        />
      </div>
    </div>
  );
}

export default function DigitalTwin() {
  const navigate = useNavigate();
  const [activeProfile] = useState(() => getActiveProfile());
  const [scenarioA, setScenarioA] = useState(defaultScenarioA);
  const [scenarioB, setScenarioB] = useState(defaultScenarioB);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSimulate = async () => {
    if (!activeProfile?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/digitalTwin/simulate', {
        profile_id: activeProfile.id,
        scenarioA,
        scenarioB,
      });
      setResult(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to run digital twin simulation.');
    } finally {
      setLoading(false);
    }
  };

  const chartData = result
    ? result.scenarioA.curve.map((point, i) => ({
        year: point.year,
        sohA: point.soh,
        sohB: result.scenarioB.curve[i]?.soh,
      }))
    : [];

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-800 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-400">FR-07</p>
        <h1 className="mt-2 text-4xl font-bold text-white tracking-tight">Digital Twin Simulator</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Compare two future usage scenarios side by side and see how each affects your battery's health over the next 10 years — without any real-world testing.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
      )}

      {!activeProfile ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/20 p-12 text-center max-w-3xl mx-auto flex flex-col items-center">
          <h2 className="text-2xl font-bold text-white">No active vehicle profile selected</h2>
          <p className="mt-3 text-slate-400 max-w-md text-sm">Select a vehicle profile to run digital twin simulations.</p>
          <button
            onClick={() => navigate('/ev-profile')}
            className="mt-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition"
          >
            Create / Manage Profiles
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <ScenarioControls label="Scenario A — Current Habits" accent="text-red-400" values={scenarioA} onChange={setScenarioA} />
            <ScenarioControls label="Scenario B — Optimized Habits" accent="text-emerald-400" values={scenarioB} onChange={setScenarioB} />
          </div>

          <button
            onClick={handleSimulate}
            disabled={loading}
            className="w-full rounded-xl bg-blue-500 px-4 py-3 font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400 disabled:opacity-50"
          >
            {loading ? 'Simulating...' : 'Run 10-Year Simulation'}
          </button>

          {result && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Scenario A: Years to 70% SOH</p>
                  <div className="mt-2 text-4xl font-extrabold text-red-400">{result.scenarioA.yearsTo70}</div>
                </div>
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Scenario B: Years to 70% SOH</p>
                  <div className="mt-2 text-4xl font-extrabold text-emerald-400">{result.scenarioB.yearsTo70}</div>
                </div>
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-6 text-center">
                  <p className="text-xs uppercase tracking-wide text-slate-300">Extra Battery Life</p>
                  <div className="mt-2 text-4xl font-extrabold text-blue-400">+{result.yearsDifference} yrs</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                <h3 className="text-lg font-bold text-white mb-4">SOH Projection — 10 Years</h3>
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                      <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} tickLine={false} unit=" yr" />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} domain={[30, 100]} label={{ value: 'SOH (%)', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 10 } }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                      <Line type="monotone" name="Scenario A (Current)" dataKey="sohA" stroke="#ef4444" strokeWidth={2.5} activeDot={{ r: 6 }} />
                      <Line type="monotone" name="Scenario B (Optimized)" dataKey="sohB" stroke="#10b981" strokeWidth={2.5} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}