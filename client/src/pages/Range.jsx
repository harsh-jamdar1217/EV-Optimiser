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

export default function Range() {
  const navigate = useNavigate();
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  const [soc, setSoc] = useState(100);
  const [temperature, setTemperature] = useState(25);
  const [speed, setSpeed] = useState(60);
  const [drivingStyle, setDrivingStyle] = useState('Normal');
  const [hvac, setHvac] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('temp'); // 'temp' or 'speed'
  
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

  // Fetch range estimation with a small debounce to prevent flooding when dragging sliders
  useEffect(() => {
    if (!activeProfile) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.post('/range/estimate', {
          profile_id: activeProfile.id,
          soc,
          temperature,
          speed,
          driving_style: drivingStyle,
          hvac
        });
        if (res.data?.ok) {
          setResults(res.data.data);
        } else {
          setError('Failed to calculate range estimation.');
        }
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || 'Error communicating with range estimator backend.');
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [activeProfile, soc, temperature, speed, drivingStyle, hvac]);

  // Generate range preservation advice
  const getProactiveAdvice = () => {
    const tips = [];
    if (temperature < 5) {
      tips.push({
        title: "Cold Weather Performance",
        desc: "Sub-zero temperatures reduce battery chemical activity. Preconditioning the cabin while plugged into slow charging can save up to 15% range.",
        type: "warning"
      });
    }
    if (temperature > 38) {
      tips.push({
        title: "Extreme Thermal Loads",
        desc: "High heat triggers active liquid battery cooling. Park in shaded areas and minimize DC fast charging during peak afternoon heat.",
        type: "warning"
      });
    }
    if (speed > 100) {
      tips.push({
        title: "High Aerodynamic Drag",
        desc: "Aerodynamic resistance grows exponentially with speed. Reducing highway speeds from 120 km/h to 100 km/h can save up to 18-20% battery energy.",
        type: "info"
      });
    }
    if (hvac && (temperature < 10 || temperature > 32)) {
      tips.push({
        title: "Climate Control Usage",
        desc: "Cabin HVAC is a major auxiliary consumer. Try using heated seats/steering wheel in cold weather, or crack windows at low speeds to save energy.",
        type: "info"
      });
    }
    if (soc < 20) {
      tips.push({
        title: "Critical Battery State",
        desc: "State of Charge is below 20%. Avoid aggressive acceleration (Sport mode), limit speed to under 80 km/h, and locate a charging station.",
        type: "danger"
      });
    }
    
    if (tips.length === 0) {
      tips.push({
        title: "Optimal Driving Conditions",
        desc: "Your current speed, ambient temperature, and cabin settings are highly efficient. Enjoy optimal range and battery health!",
        type: "success"
      });
    }
    return tips;
  };

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="border-b border-slate-800 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">Analysis Modules</p>
        <h1 className="mt-2 text-4xl font-bold text-white tracking-tight">Range Forecast & Estimator</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Predict vehicle range and energy consumption curves dynamically adjusted for temperature, cabin HVAC, driving style, and speed.
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
        <div className="grid gap-8 lg:grid-cols-12">
          
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">Driving Environment</h2>
                <p className="text-xs text-slate-400 mt-1">Adjust environmental variables to see range impacts</p>
              </div>

              {/* State of Charge (SOC) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">State of Charge (SOC)</span>
                  <span className="font-bold text-emerald-400">{soc}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={soc}
                  onChange={(e) => setSoc(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Empty (5%)</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Ambient Temperature */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Ambient Temperature</span>
                  <span className={`font-bold ${temperature < 0 ? 'text-blue-400' : temperature > 35 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {temperature}°C
                  </span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="50"
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Freezing (-20°C)</span>
                  <span>Scorching (50°C)</span>
                </div>
              </div>

              {/* Average Speed */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Average Driving Speed</span>
                  <span className="font-bold text-blue-400">{speed} km/h</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="150"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>City Crawl (20 km/h)</span>
                  <span>Highway (150 km/h)</span>
                </div>
              </div>

              {/* Driving Style Selector */}
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Driving Profile Mode</span>
                <div className="grid grid-cols-3 gap-2">
                  {['Eco', 'Normal', 'Sport'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setDrivingStyle(mode)}
                      className={`py-2.5 px-4 rounded-xl border text-sm font-semibold transition-all ${
                        drivingStyle === mode
                          ? mode === 'Eco'
                            ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                            : mode === 'Sport'
                            ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                            : 'border-blue-400 bg-blue-400/10 text-blue-300'
                          : 'border-slate-700 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* HVAC Switch */}
              <div className="flex items-center justify-between border-t border-slate-700/60 pt-4">
                <div>
                  <span className="text-sm font-medium text-slate-200 block">Cabin HVAC Climate Control</span>
                  <span className="text-[11px] text-slate-400">Heating / Air Conditioning toggling</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hvac}
                    onChange={(e) => setHvac(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-950 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white"></div>
                </label>
              </div>

            </div>
          </div>

          {/* Outputs Column */}
          <div className="lg:col-span-7 space-y-6">
            {results && (
              <>
                {/* Result Hero Header */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-800 to-slate-900 p-6 shadow-2xl">
                  <div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-br from-emerald-500/15 to-transparent rounded-bl-full" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Estimated Range</p>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span className="text-6xl font-extrabold text-white tracking-tight animate-fade-in">
                          {results.estimatedRange}
                        </span>
                        <span className="text-xl font-semibold text-emerald-400">km</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        Based on {activeProfile.battery_capacity} kWh pack at {soc}% SOC
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-4 min-w-[180px] text-center sm:text-right">
                      <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Energy Consumption</p>
                      <p className="text-3xl font-extrabold text-white mt-1">{results.energyConsumption}</p>
                      <p className="text-[10px] text-slate-400 mt-1">kWh/100km</p>
                    </div>
                  </div>

                  {/* Impact Rating */}
                  <div className="mt-6 border-t border-slate-700/60 pt-4 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Environmental & Style Overhead:</span>
                    <span className={`font-bold px-2.5 py-0.5 rounded-full ${
                      results.tempImpactPct > 20 ? 'bg-red-500/10 text-red-400 border border-red-500/25' :
                      results.tempImpactPct > 0 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                    }`}>
                      {results.tempImpactPct > 0 ? `+${results.tempImpactPct}%` : `${results.tempImpactPct}%`} consumption delta
                    </span>
                  </div>
                </div>

                {/* Recharts Graphical Forecast Curves */}
                <div className="rounded-2xl border border-slate-700 bg-slate-850/40 p-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white">Range Forecast Curves</h3>
                      <p className="text-xs text-slate-400">Projected metrics holding other variables constant</p>
                    </div>
                    
                    {/* Curve Selector tabs */}
                    <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
                      <button
                        onClick={() => setActiveTab('temp')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'temp' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Temp Curve
                      </button>
                      <button
                        onClick={() => setActiveTab('speed')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'speed' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Speed Curve
                      </button>
                    </div>
                  </div>

                  <div className="h-[280px] w-full">
                    {activeTab === 'temp' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={results.temperatureCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                          <XAxis dataKey="temp" stroke="#94a3b8" fontSize={11} tickLine={false} unit="°C" />
                          <YAxis yAxisId="left" stroke="#10b981" fontSize={11} tickLine={false} label={{ value: 'Range (km)', angle: -90, position: 'insideLeft', style: { fill: '#10b981', fontSize: 10 } }} />
                          <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={11} tickLine={false} label={{ value: 'kWh/100km', angle: 90, position: 'insideRight', style: { fill: '#ef4444', fontSize: 10 } }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                            labelClassName="text-slate-400 text-xs"
                          />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            name="Estimated Range"
                            dataKey="range"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            activeDot={{ r: 6 }}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            name="Consumption Rate"
                            dataKey="consumption"
                            stroke="#ef4444"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={results.speedCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                          <XAxis dataKey="speed" stroke="#94a3b8" fontSize={11} tickLine={false} unit=" km/h" />
                          <YAxis yAxisId="left" stroke="#3b82f6" fontSize={11} tickLine={false} label={{ value: 'Range (km)', angle: -90, position: 'insideLeft', style: { fill: '#3b82f6', fontSize: 10 } }} />
                          <YAxis yAxisId="right" orientation="right" stroke="#ef4444" fontSize={11} tickLine={false} label={{ value: 'kWh/100km', angle: 90, position: 'insideRight', style: { fill: '#ef4444', fontSize: 10 } }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                            labelClassName="text-slate-400 text-xs"
                          />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            name="Estimated Range"
                            dataKey="range"
                            stroke="#3b82f6"
                            strokeWidth={2.5}
                            activeDot={{ r: 6 }}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            name="Consumption Rate"
                            dataKey="consumption"
                            stroke="#ef4444"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Proactive Advisor Tips */}
                <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-4">Range Preservation Advice</h3>
                  
                  <div className="space-y-3.5">
                    {getProactiveAdvice().map((tip, idx) => (
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
