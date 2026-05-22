import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { getActiveProfile, saveActiveProfile } from '../utils/activeProfile';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell
} from 'recharts';

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  const [profiles, setProfiles] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch all profiles (for switching) and history of the active profile
  async function loadData() {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch profiles list
      const profilesRes = await api.get('/ev-profiles');
      const fetchedProfiles = profilesRes.data?.profiles || [];
      setProfiles(fetchedProfiles);

      // Sync active profile with fresh list or set default
      const stored = getActiveProfile();
      let currentActive = stored ? fetchedProfiles.find((p) => p.id === stored.id) : null;
      if (!currentActive && fetchedProfiles.length > 0) {
        // Fallback to first profile if active is missing
        currentActive = fetchedProfiles[0];
        saveActiveProfile(currentActive);
      }
      setActiveProfile(currentActive);

      // 2. Fetch analysis history for active profile
      if (currentActive) {
        const historyRes = await api.get(`/performance/history/${currentActive.id}`);
        setHistory(historyRes.data?.history || []);
      } else {
        setHistory([]);
      }
    } catch (err) {
      console.error(err);
      setError('Could not load dashboard data. Please check if server is running.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    // Listen to changes from EVProfile or other tabs
    function handleProfileChange() {
      const stored = getActiveProfile();
      setActiveProfile(stored);
      if (stored) {
        api.get(`/performance/history/${stored.id}`)
          .then((res) => setHistory(res.data?.history || []))
          .catch((err) => console.error('Error fetching history:', err));
      } else {
        setHistory([]);
      }
    }

    window.addEventListener('active-profile-change', handleProfileChange);
    return () => {
      window.removeEventListener('active-profile-change', handleProfileChange);
    };
  }, []);

  function onSetActive(profile) {
    saveActiveProfile(profile);
    setActiveProfile(profile);
    // Fetch history for new active profile
    api.get(`/performance/history/${profile.id}`)
      .then((res) => setHistory(res.data?.history || []))
      .catch((err) => console.error('Error fetching history:', err));
  }

  // Calculate aggregated stats from history
  const totalAnalyses = history.length;
  const avgPerformance = totalAnalyses
    ? Math.round(history.reduce((acc, curr) => acc + (curr.result_json?.performanceScore || 0), 0) / totalAnalyses)
    : null;
  const avgEfficiency = totalAnalyses
    ? Math.round(history.reduce((acc, curr) => acc + (curr.result_json?.efficiencyScore || 0), 0) / totalAnalyses)
    : null;
  const avgConsumption = totalAnalyses
    ? (history.reduce((acc, curr) => acc + (curr.result_json?.energyConsumption || 0), 0) / totalAnalyses).toFixed(1)
    : null;

  // Chart Data Mapper
  const chartData = history.map((item, idx) => {
    let formattedDate = 'Recent';
    if (item.created_at) {
      const d = new Date(item.created_at);
      if (!isNaN(d.getTime())) {
        formattedDate = d.toLocaleDateString('en-IN', { month: 'short', day: '2-digit' });
      }
    }
    return {
      name: `Run ${idx + 1}`,
      date: formattedDate,
      performance: item.result_json?.performanceScore || 0,
      efficiency: item.result_json?.efficiencyScore || 0,
      consumption: item.result_json?.energyConsumption || 0,
      speed: item.result_json?.average_speed || 0,
    };
  });

  // Group by driving style for another chart
  const styleData = (() => {
    const counts = { Eco: { sum: 0, count: 0 }, Normal: { sum: 0, count: 0 }, Sport: { sum: 0, count: 0 } };
    history.forEach((h) => {
      const style = h.result_json?.driving_style || 'Normal';
      const score = h.result_json?.performanceScore || 0;
      if (counts[style]) {
        counts[style].sum += score;
        counts[style].count += 1;
      }
    });
    return Object.keys(counts).map((key) => ({
      styleName: key,
      avgScore: counts[key].count ? Math.round(counts[key].sum / counts[key].count) : 0,
    }));
  })();

  const styleColors = {
    Eco: '#10b981', // emerald
    Normal: '#3b82f6', // blue
    Sport: '#f59e0b', // amber
  };

  return (
    <div className="space-y-8">
      {/* Top Welcome & Switcher Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">Dashboard</p>
          <h1 className="mt-2 text-4xl font-bold text-white tracking-tight">Battery Intelligence Hub</h1>
        </div>
        {profiles.length > 0 && (
          <div className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active Vehicle:</span>
            <select
              value={activeProfile?.id || ''}
              onChange={(e) => {
                const selected = profiles.find((p) => p.id === Number(e.target.value));
                if (selected) onSetActive(selected);
              }}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white font-medium focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/20 outline-none cursor-pointer transition-colors"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.vehicle_model}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 animate-pulse">
          {error}
        </div>
      )}

      {/* NO ACTIVE PROFILE STATE */}
      {!activeProfile ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/20 p-12 text-center max-w-3xl mx-auto flex flex-col items-center">
          <div className="rounded-full bg-slate-950 border border-slate-800 p-5 mb-4 shadow-xl">
            <svg className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">No active vehicle profile selected</h2>
          <p className="mt-3 text-slate-400 max-w-md text-sm leading-relaxed">
            Please register your electric vehicle details to unlock optimization analytics, health diagnostics, and range forecasts.
          </p>
          <button
            onClick={() => navigate('/ev-profile')}
            className="mt-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition duration-150 shadow-lg shadow-emerald-950/40"
          >
            Create / Manage Profiles
          </button>
        </div>
      ) : (
        <>
          {/* STATS OVERVIEW CARDS */}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {/* CARD 1: Active Specs */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800 p-6 shadow-xl transition-all duration-200 hover:border-slate-600">
              <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-full" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Selected Vehicle</p>
              <h3 className="mt-2 text-2xl font-extrabold text-white truncate">{activeProfile.vehicle_model}</h3>
              <div className="mt-4 space-y-1.5 text-sm text-slate-300">
                <div className="flex justify-between">
                  <span>Battery Capacity:</span>
                  <span className="font-semibold text-emerald-400">{activeProfile.battery_capacity} kWh</span>
                </div>
                <div className="flex justify-between">
                  <span>Motor Power:</span>
                  <span className="font-semibold text-blue-400">{activeProfile.motor_power} kW</span>
                </div>
              </div>
            </div>

            {/* CARD 2: Performance Score */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800 p-6 shadow-xl transition-all duration-200 hover:border-slate-600">
              <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-full" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Performance Score</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold text-white">
                  {avgPerformance !== null ? avgPerformance : '--'}
                </span>
                <span className="text-sm font-semibold text-slate-400">/ 100</span>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                {totalAnalyses ? `Based on ${totalAnalyses} analysis runs` : 'No data available. Run analysis first.'}
              </p>
            </div>

            {/* CARD 3: Energy Consumption */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800 p-6 shadow-xl transition-all duration-200 hover:border-slate-600">
              <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Energy Consumption</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold text-white">
                  {avgConsumption !== null ? avgConsumption : '--'}
                </span>
                <span className="text-sm font-semibold text-slate-400">kWh/100km</span>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                {activeProfile.charging_type ? `Primary charging: ${activeProfile.charging_type}` : ''}
              </p>
            </div>

            {/* CARD 4: Efficiency Rating */}
            <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-800 p-6 shadow-xl transition-all duration-200 hover:border-slate-600">
              <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Efficiency Score</p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold text-white">
                  {avgEfficiency !== null ? avgEfficiency : '--'}
                </span>
                <span className="text-sm font-semibold text-slate-400">/ 100</span>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                {avgEfficiency && avgEfficiency >= 80 ? 'Optimal battery discharge curves' : avgEfficiency ? 'Moderate battery discharge curves' : 'Habit diagnostics waiting'}
              </p>
            </div>
          </div>

          {/* CHARTS CONTAINER */}
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Performance History Trend Line Chart */}
            <div className="lg:col-span-8 rounded-2xl border border-slate-700 bg-slate-850/40 p-6 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-white">Performance Score Trends</h3>
                  <p className="text-xs text-slate-400">Chronological summary of energy and efficiency scoring</p>
                </div>
              </div>
              {history.length === 0 ? (
                <div className="flex h-[300px] flex-col items-center justify-center border border-dashed border-slate-700 bg-slate-800/10 rounded-xl p-6 text-center">
                  <p className="text-slate-400 text-sm">No analysis history recorded for this vehicle yet.</p>
                  <button
                    onClick={() => navigate('/performance')}
                    className="mt-4 rounded-lg bg-blue-500 hover:bg-blue-400 px-4 py-2 text-xs font-semibold text-white transition-colors"
                  >
                    Run Performance Analyzer
                  </button>
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPerf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorEff" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                        labelClassName="text-slate-400 text-xs"
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                      <Area
                        type="monotone"
                        name="Performance Score"
                        dataKey="performance"
                        stroke="#10b981"
                        fillOpacity={1}
                        fill="url(#colorPerf)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        name="Efficiency Score"
                        dataKey="efficiency"
                        stroke="#3b82f6"
                        fillOpacity={1}
                        fill="url(#colorEff)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Performance by Driving Style (Bar Chart) */}
            <div className="lg:col-span-4 rounded-2xl border border-slate-700 bg-slate-850/40 p-6 shadow-xl">
              <div>
                <h3 className="text-lg font-bold text-white">Driving Style Impact</h3>
                <p className="text-xs text-slate-400 mb-6">Average Performance Score by profile mode</p>
              </div>
              {history.length === 0 ? (
                <div className="flex h-[300px] flex-col items-center justify-center border border-dashed border-slate-700 bg-slate-800/10 rounded-xl p-6 text-center">
                  <p className="text-slate-400 text-sm">Waiting for profile logs...</p>
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={styleData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.3} />
                      <XAxis dataKey="styleName" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                      />
                      <Bar dataKey="avgScore" name="Avg Score" radius={[8, 8, 0, 0]}>
                        {styleData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={styleColors[entry.styleName] || '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* LOWER SECTION: HISTORY TIMELINE & QUICK ACTIONS */}
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            {/* Timeline log */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
              <h3 className="text-lg font-bold text-white mb-1">Recent Analysis Logs</h3>
              <p className="text-xs text-slate-400 mb-5">History of diagnostic sessions for this profile</p>

              {history.length === 0 ? (
                <p className="text-sm text-slate-400 italic py-4">No recent analysis logs found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="pb-3 font-semibold">Date</th>
                        <th className="pb-3 font-semibold">Driving Style</th>
                        <th className="pb-3 font-semibold">Daily Travel</th>
                        <th className="pb-3 font-semibold">Avg Speed</th>
                        <th className="pb-3 font-semibold text-right">Performance Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {history.slice(-5).reverse().map((run) => (
                        <tr key={run.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="py-3.5 font-medium text-slate-200">
                            {(() => {
                              if (!run.created_at) return 'Recent';
                              const d = new Date(run.created_at);
                              if (isNaN(d.getTime())) return 'Recent';
                              return d.toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              });
                            })()}
                          </td>
                          <td className="py-3.5">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              run.result_json?.driving_style === 'Eco' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' :
                              run.result_json?.driving_style === 'Sport' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
                              'bg-blue-500/10 text-blue-300 border border-blue-500/20'
                            }`}>
                              {run.result_json?.driving_style}
                            </span>
                          </td>
                          <td className="py-3.5">{run.result_json?.daily_distance} km</td>
                          <td className="py-3.5">{run.result_json?.average_speed} km/h</td>
                          <td className="py-3.5 text-right font-bold text-emerald-400">
                            {run.result_json?.performanceScore}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Quick Actions Panel */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Quick Optimization Modules</h3>
                <p className="text-xs text-slate-400 mb-5">Jump to diagnostic simulators and health analyzers</p>

                <div className="space-y-3">
                  <button
                    onClick={() => navigate('/performance')}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-700 bg-slate-950/30 hover:border-blue-400/40 hover:bg-slate-900/60 transition group text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">Performance Analyzer</div>
                      <div className="text-xs text-slate-400 mt-0.5">Test speed and consumption levels</div>
                    </div>
                    <svg className="h-5 w-5 text-slate-500 group-hover:text-blue-300 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  <button
                    onClick={() => navigate('/battery')}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-700 bg-slate-950/30 hover:border-emerald-400/40 hover:bg-slate-900/60 transition group text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">Battery Advisor</div>
                      <div className="text-xs text-slate-400 mt-0.5">Custom battery care suggestions</div>
                    </div>
                    <svg className="h-5 w-5 text-slate-500 group-hover:text-emerald-300 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  <button
                    onClick={() => navigate('/ev-profile')}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-700 bg-slate-950/30 hover:border-purple-400/40 hover:bg-slate-900/60 transition group text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors">Vehicle Specifications</div>
                      <div className="text-xs text-slate-400 mt-0.5">Add or update model details</div>
                    </div>
                    <svg className="h-5 w-5 text-slate-500 group-hover:text-purple-300 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mt-6 border-t border-slate-700/60 pt-4 text-[11px] text-slate-400 text-center leading-relaxed">
                Need details SOH, range simulations or AI-assisted suggestions? Explore the left sidebar navigation items.
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
