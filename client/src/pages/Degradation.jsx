import { useEffect, useState, useRef } from 'react';
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
  Legend
} from 'recharts';

export default function Degradation() {
  const navigate = useNavigate();
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  const [currentOdometer, setCurrentOdometer] = useState(20000);
  const [annualMileage, setAnnualMileage] = useState(15000);
  const [fastChargingRatio, setFastChargingRatio] = useState(20);
  const [avgChargingLimit, setAvgChargingLimit] = useState(90);
  const [avgTemperature, setAvgTemperature] = useState(25);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('soh'); // 'soh' or 'capacity'
  
  const debounceTimer = useRef(null);

  // Sync profile from other tabs
  useEffect(() => {
    function handleProfileChange() {
      setActiveProfile(getActiveProfile());
    }
    window.addEventListener('active-profile-change', handleProfileChange);
    return () => {
      window.removeEventListener('active-profile-change', handleProfileChange);
    };
  }, []);

  // Fetch degradation simulation with debounce
  useEffect(() => {
    if (!activeProfile) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.post('/degradation/forecast', {
          profile_id: activeProfile.id,
          current_odometer: currentOdometer,
          annual_mileage: annualMileage,
          fast_charging_ratio: fastChargingRatio,
          avg_charging_limit: avgChargingLimit,
          avg_temperature: avgTemperature
        });

        if (res.data?.ok) {
          setResults(res.data.data);
        } else {
          setError('Failed to compute battery degradation forecast.');
        }
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || 'Error communicating with degradation backend.');
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [activeProfile, currentOdometer, annualMileage, fastChargingRatio, avgChargingLimit, avgTemperature]);

  // Combine curves into a single structure for Recharts
  const getMergedCurveData = () => {
    if (!results) return [];
    return results.baselineSohCurve.map((base, idx) => {
      const opt = results.optimizedSohCurve[idx];
      return {
        year: base.year,
        baselineSoh: base.soh,
        baselineCapacity: base.capacity,
        optimizedSoh: opt.soh,
        optimizedCapacity: opt.capacity
      };
    });
  };

  // Generate dynamic, context-specific tips
  const getLifespanAdvice = () => {
    if (!results) return [];
    const tips = [];

    // Critical health warning
    if (results.currentSOH < 80) {
      tips.push({
        title: 'Battery Health Degradation Noticed',
        desc: `Your battery State of Health has reached ${results.currentSOH}%. High mileage or aggressive usage has depleted capacity. We recommend limiting charging to 80% and avoiding DC fast charge stations.`,
        type: 'danger'
      });
    }

    // Tariff/Limit optimization tip
    if (avgChargingLimit > 85) {
      const isLfp = results.chemistry.includes('LFP');
      const wearSavings = isLfp ? 'subtle' : 'significant';
      tips.push({
        title: isLfp ? 'LFP Daily Charge recommendation' : 'High State-of-Charge Stress',
        desc: isLfp
          ? 'Your vehicle has LFP chemistry. LFPs are highly durable, but daily storage at 100% SOC still adds minor thermal stress. Shifting to an 80% daily limit (except for weekly cell balancing) can reduce calendar decay.'
          : 'Your vehicle uses NMC chemistry. Storing batteries at a 90%+ charge limit creates high cell voltage stress. Shifting your daily charge limit to 80% can increase battery calendar life by up to 2.2 years.',
        type: 'warning'
      });
    }

    // DC Fast charging tip
    if (fastChargingRatio > 30) {
      tips.push({
        title: 'High DC Fast Charging Wear',
        desc: 'Over 30% of your charging sessions rely on high-power DC fast charging. This creates local heating and anode mechanical stress. Restricting DC Fast charging for road trips only will reclaim lost cycle longevity.',
        type: 'warning'
      });
    }

    // Climate/Temp tip
    if (avgTemperature > 30) {
      tips.push({
        title: 'High Ambient Climate Wear',
        desc: 'Average ambient temperatures above 30°C accelerate electrochemical aging (Arrhenius effect). Whenever possible, park in shady structures or garages to shield the battery from ambient solar loading.',
        type: 'info'
      });
    }

    // Optimizing message
    if (results.annualSavingsYears > 0) {
      tips.push({
        title: 'Longevity Boost Available',
        desc: `By adopting optimized practices, you can extend your battery's operational life by an estimated ${results.annualSavingsYears} years before hitting the 70% replacement threshold.`,
        type: 'success'
      });
    }

    if (tips.length === 0) {
      tips.push({
        title: 'Excellent Health Management',
        desc: 'Your driving and charging characteristics are perfectly aligned with optimal battery physics. Degradation curves are minimized.',
        type: 'success'
      });
    }

    return tips;
  };

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="border-b border-slate-800 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">Analysis Modules</p>
        <h1 className="mt-2 text-4xl font-bold text-white tracking-tight">Battery Degradation & Capacity Forecast</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Simulate calendar and cyclic aging, project 10-year State of Health (SOH) retention, and evaluate optimization effects.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 animate-pulse">
          {error}
        </div>
      )}

      {/* No Active Profile state */}
      {!activeProfile ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/20 p-12 text-center max-w-3xl mx-auto flex flex-col items-center">
          <div className="rounded-full bg-slate-950 border border-slate-800 p-5 mb-4 shadow-xl">
            <svg className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">No active vehicle profile selected</h2>
          <p className="mt-3 text-slate-400 max-w-md text-sm leading-relaxed">
            Please register your electric vehicle details to unlock battery diagnostics, state of health calculations, and degradation forecasts.
          </p>
          <button
            onClick={() => navigate('/ev-profile')}
            className="mt-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition duration-150 shadow-lg shadow-emerald-950/40"
          >
            Create / Manage Profiles
          </button>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Usage & Habits</h2>
                <p className="text-xs text-slate-400 mt-1">Adjust variables to calculate aging rates</p>
              </div>

              {/* Current Odometer (km) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Current Odometer</span>
                  <span className="font-bold text-emerald-400">{currentOdometer.toLocaleString()} km</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200000"
                  step="5000"
                  value={currentOdometer}
                  onChange={(e) => setCurrentOdometer(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>New (0 km)</span>
                  <span>High Mileage (200k km)</span>
                </div>
              </div>

              {/* Annual Mileage (km) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Annual Driving Mileage</span>
                  <span className="font-bold text-blue-400">{annualMileage.toLocaleString()} km/year</span>
                </div>
                <input
                  type="range"
                  min="2000"
                  max="50000"
                  step="1000"
                  value={annualMileage}
                  onChange={(e) => setAnnualMileage(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Occasional (2k)</span>
                  <span>Commercial (50k)</span>
                </div>
              </div>

              {/* DC Fast Charging Ratio (%) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">DC Fast Charge Usage</span>
                  <span className="font-bold text-indigo-400">{fastChargingRatio}% of sessions</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={fastChargingRatio}
                  onChange={(e) => setFastChargingRatio(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>AC Only (0%)</span>
                  <span>Fast Only (100%)</span>
                </div>
              </div>

              {/* Avg Charge Limit (%) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Average Charge Limit</span>
                  <span className="font-bold text-amber-400">{avgChargingLimit}% target</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="100"
                  step="5"
                  value={avgChargingLimit}
                  onChange={(e) => setAvgChargingLimit(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Storage (60%)</span>
                  <span>Battery stress (100%)</span>
                </div>
              </div>

              {/* Average Temperature */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Average Ambient Temp</span>
                  <span className={`font-bold ${avgTemperature < 10 ? 'text-blue-400' : avgTemperature > 30 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {avgTemperature}°C
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="45"
                  value={avgTemperature}
                  onChange={(e) => setAvgTemperature(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-red-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Cold (-10°C)</span>
                  <span>Hot Climate (45°C)</span>
                </div>
              </div>

              {/* Chemistry profile display */}
              {results && (
                <div className="border-t border-slate-700/60 pt-4 text-xs text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-300 block mb-1">Battery Chemistry Profile</span>
                  Detected pack technology: <span className="text-emerald-400 font-medium">{results.chemistry}</span>.
                </div>
              )}

            </div>
          </div>

          {/* Outputs Column */}
          <div className="lg:col-span-7 space-y-6">
            {results && (
              <>
                {/* Result Hero Header */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-800 to-slate-900 p-6 shadow-2xl">
                  <div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-br from-emerald-500/15 to-transparent rounded-bl-full" />
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Health (SOH)</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-white tracking-tight">
                        {results.currentSOH}%
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">State of Health</p>
                    </div>

                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Available Capacity</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-emerald-400 tracking-tight">
                        {results.remainingCapacityKwh}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">kWh / {activeProfile.battery_capacity} kWh</p>
                    </div>

                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Est. Lifespan</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-white tracking-tight">
                        {results.baselineLifespan.years} yrs
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">before reaching 70% SOH</p>
                    </div>

                    <div className="p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Optimized Boost</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-blue-400 tracking-tight">
                        +{results.annualSavingsYears} yrs
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">added pack operational life</p>
                    </div>
                  </div>

                  {/* Impact Rating */}
                  <div className="mt-6 border-t border-slate-700/60 pt-4 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Degradation Rate (per year):</span>
                    <span className={`font-bold px-2.5 py-0.5 rounded-full ${
                      results.baselineAnnualLoss > 3.0 ? 'bg-red-500/10 text-red-400 border border-red-500/25' :
                      results.baselineAnnualLoss > 1.8 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                    }`}>
                      {results.baselineAnnualLoss}% baseline vs {results.optimizedAnnualLoss}% optimized SOH loss/yr
                    </span>
                  </div>
                </div>

                {/* Recharts Graphical Projections */}
                <div className="rounded-2xl border border-slate-700 bg-slate-850/40 p-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white">10-Year Longevity Forecast</h3>
                      <p className="text-xs text-slate-400">Projections comparing current baseline vs optimized habits</p>
                    </div>
                    
                    {/* Graph Tab selector */}
                    <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
                      <button
                        onClick={() => setActiveTab('soh')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'soh' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        SOH Decay
                      </button>
                      <button
                        onClick={() => setActiveTab('capacity')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'capacity' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Capacity kWh
                      </button>
                    </div>
                  </div>

                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={getMergedCurveData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                        <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(yr) => `Yr ${yr}`} />
                        
                        {activeTab === 'soh' ? (
                          <>
                            <YAxis stroke="#e2e8f0" fontSize={11} tickLine={false} domain={[40, 100]} label={{ value: 'State of Health (%)', angle: -90, position: 'insideLeft', style: { fill: '#cbd5e1', fontSize: 10 } }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                              labelFormatter={(yr) => `Year ${yr} forecast`}
                              labelClassName="text-slate-400 text-xs"
                            />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                            <Line type="monotone" name="Baseline Habits SOH" dataKey="baselineSoh" stroke="#ef4444" strokeWidth={2} activeDot={{ r: 5 }} />
                            <Line type="monotone" name="Optimized Habits SOH" dataKey="optimizedSoh" stroke="#10b981" strokeWidth={2.5} activeDot={{ r: 6 }} />
                          </>
                        ) : (
                          <>
                            <YAxis stroke="#e2e8f0" fontSize={11} tickLine={false} label={{ value: 'Capacity (kWh)', angle: -90, position: 'insideLeft', style: { fill: '#cbd5e1', fontSize: 10 } }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                              labelFormatter={(yr) => `Year ${yr} capacity`}
                              labelClassName="text-slate-400 text-xs"
                            />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                            <Line type="monotone" name="Baseline Capacity" dataKey="baselineCapacity" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" />
                            <Line type="monotone" name="Optimized Capacity" dataKey="optimizedCapacity" stroke="#10b981" strokeWidth={2.5} />
                          </>
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Proactive Advisor Tips */}
                <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-4">Lifespan Preservation Checklist</h3>
                  
                  <div className="space-y-3.5">
                    {getLifespanAdvice().map((tip, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-3.5 p-4 rounded-xl border leading-relaxed text-sm ${
                          tip.type === 'danger' ? 'bg-red-500/10 border-red-500/20 text-red-200' :
                          tip.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-200' :
                          tip.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' :
                          'bg-blue-500/10 border-blue-500/20 text-blue-200'
                        }`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center shrink-0 rounded-full font-extrabold text-xs">
                          {tip.type === 'danger' ? '⚠️' : tip.type === 'warning' ? '💡' : tip.type === 'success' ? '✓' : 'ℹ'}
                        </span>
                        <div>
                          <h4 className="font-semibold text-white">{tip.title}</h4>
                          <p className="mt-1 text-xs opacity-90">{tip.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
