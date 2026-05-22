import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import { getActiveProfile } from '../utils/activeProfile';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell
} from 'recharts';

export default function Charging() {
  const navigate = useNavigate();
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  const [currentSoc, setCurrentSoc] = useState(20);
  const [targetSoc, setTargetSoc] = useState(80);
  const [chargerType, setChargerType] = useState('AC Fast');
  const [chargerPower, setChargerPower] = useState(11);
  const [startHour, setStartHour] = useState(22);
  const [temperature, setTemperature] = useState(25);
  
  // ToU Tariff state
  const [peakRate, setPeakRate] = useState(0.32);
  const [midPeakRate, setMidPeakRate] = useState(0.16);
  const [offPeakRate, setOffPeakRate] = useState(0.09);
  const [showTariffSettings, setShowTariffSettings] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'planner'
  
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

  // Update charger power preset when chargerType changes
  useEffect(() => {
    if (chargerType === 'AC Slow') {
      setChargerPower(3.3);
    } else if (chargerType === 'AC Fast') {
      setChargerPower(11);
    } else if (chargerType === 'DC Fast') {
      setChargerPower(50);
    }
  }, [chargerType]);

  // Fetch charging simulation with debounce
  useEffect(() => {
    if (!activeProfile) return;

    if (currentSoc >= targetSoc) {
      setError('Target SOC must be greater than current SOC.');
      setResults(null);
      return;
    } else {
      setError('');
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.post('/charging/optimize', {
          profile_id: activeProfile.id,
          current_soc: currentSoc,
          target_soc: targetSoc,
          charger_type: chargerType,
          charger_power: chargerPower,
          start_hour: startHour,
          temperature,
          peakRate,
          midPeakRate,
          offPeakRate
        });

        if (res.data?.ok) {
          setResults(res.data.data);
        } else {
          setError('Failed to compute charging simulation.');
        }
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || 'Error communicating with charging optimizer backend.');
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [activeProfile, currentSoc, targetSoc, chargerType, chargerPower, startHour, temperature, peakRate, midPeakRate, offPeakRate]);

  // Format time (minutes -> hours & minutes)
  const formatTime = (mins) => {
    const hrs = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return hrs > 0 ? `${hrs}h ${m}m` : `${m}m`;
  };

  // Convert hour number to readable AM/PM format
  const formatHourLabel = (hr) => {
    const h = hr % 24;
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h > 12 ? `${h - 12} PM` : `${h} AM`;
  };

  // Generate actionable schedule tips
  const getOptimizerTips = () => {
    if (!results) return [];
    const tips = [];

    const isCurrentOffPeak = startHour >= 22 || startHour < 6;
    const isCurrentPeak = startHour >= 14 && startHour < 20;

    // ToU scheduling recommendation
    if (results.cheapestHour !== startHour) {
      const savings = (results.totalCost - results.minCost).toFixed(2);
      const savingsPct = Math.round(((results.totalCost - results.minCost) / results.totalCost) * 100);
      if (savings > 0) {
        tips.push({
          title: 'Off-Peak Cost Savings Available',
          desc: `Delaying your start time to ${formatHourLabel(results.cheapestHour)} will leverage off-peak pricing, saving you $${savings} (${savingsPct}% cost reduction).`,
          type: 'success'
        });
      }
    } else if (isCurrentOffPeak) {
      tips.push({
        title: 'Optimal Schedule Selected',
        desc: 'You are charging during off-peak hours (10 PM - 6 AM). This minimizes energy expenses and reduces stress on the electrical grid.',
        type: 'success'
      });
    }

    if (isCurrentPeak) {
      tips.push({
        title: 'Peak Tariff Warning',
        desc: 'You are starting your charge during peak tariff hours (2 PM - 8 PM). Electricity rates are highest now. If possible, reschedule for after 10 PM.',
        type: 'danger'
      });
    }

    // Charger speed taper warning
    if (chargerType === 'DC Fast' && targetSoc > 80) {
      tips.push({
        title: 'DC Fast Charge Speed Taper',
        desc: 'Charging above 80% SOC triggers heavy battery speed tapering to protect cell health. Unplugging at 80% and switching to AC charging is much more cost-effective.',
        type: 'warning'
      });
    }

    // Thermal throttling warning
    if (temperature < 5) {
      tips.push({
        title: 'Cold Weather Charging Throttle',
        desc: 'Sub-zero battery temperatures limit lithium-ion absorption rates. Expect up to 30% slower charging speeds until the battery pack warms up.',
        type: 'warning'
      });
    } else if (temperature > 38) {
      tips.push({
        title: 'Thermal Management Throttle',
        desc: 'High ambient temperature triggers cooling loops and reduces charging power to prevent battery overheating. Park in a shady location.',
        type: 'warning'
      });
    }

    if (tips.length === 0) {
      tips.push({
        title: 'Charging Conditions Nominal',
        desc: 'Your environmental settings, start time, and charger configurations are balanced for solid performance. Happy charging!',
        type: 'info'
      });
    }

    return tips;
  };

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="border-b border-slate-800 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">Analysis Modules</p>
        <h1 className="mt-2 text-4xl font-bold text-white tracking-tight">Charging Optimizer & Schedule Planner</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Optimize charging durations, analyze charger power drop-offs, and map grid pricing schedules to minimize charging expenses.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
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
            Please register your electric vehicle details to unlock optimization analytics, charging calculators, and scheduler plans.
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
                <h2 className="text-xl font-bold text-white">Session Parameters</h2>
                <p className="text-xs text-slate-400 mt-1">Configure your charging hardware and constraints</p>
              </div>

              {/* Charger Type Preset Selector */}
              <div className="space-y-2">
                <span className="text-sm font-medium text-slate-200">Charger Hardware Connection</span>
                <div className="grid grid-cols-3 gap-2">
                  {['AC Slow', 'AC Fast', 'DC Fast'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setChargerType(type)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        chargerType === type
                          ? type === 'AC Slow'
                            ? 'border-blue-400 bg-blue-400/10 text-blue-300'
                            : type === 'AC Fast'
                            ? 'border-indigo-400 bg-indigo-400/10 text-indigo-300'
                            : 'border-emerald-400 bg-emerald-400/10 text-emerald-300'
                          : 'border-slate-700 bg-slate-950/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Charger Power Range (kW) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Charger Maximum Power</span>
                  <span className="font-bold text-emerald-400">{chargerPower} kW</span>
                </div>
                <input
                  type="range"
                  min={chargerType === 'AC Slow' ? 1.0 : chargerType === 'AC Fast' ? 7.0 : 25.0}
                  max={chargerType === 'AC Slow' ? 7.4 : chargerType === 'AC Fast' ? 22.0 : 150.0}
                  step={0.5}
                  value={chargerPower}
                  onChange={(e) => setChargerPower(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>{chargerType === 'AC Slow' ? '1.0 kW' : chargerType === 'AC Fast' ? '7.0 kW' : '25 kW'}</span>
                  <span>{chargerType === 'AC Slow' ? '7.4 kW' : chargerType === 'AC Fast' ? '22.0 kW' : '150 kW'}</span>
                </div>
              </div>

              {/* State of Charge (SOC) Sliders */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-300">Start SOC</span>
                    <span className="font-bold text-blue-300">{currentSoc}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="95"
                    value={currentSoc}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCurrentSoc(val);
                      if (val >= targetSoc) {
                        setTargetSoc(val + 5);
                      }
                    }}
                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-400"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-300">Target SOC</span>
                    <span className="font-bold text-emerald-300">{targetSoc}%</span>
                  </div>
                  <input
                    type="range"
                    min={currentSoc + 5}
                    max="100"
                    value={targetSoc}
                    onChange={(e) => setTargetSoc(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                  />
                </div>
              </div>

              {/* Start Hour */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Start Hour Schedule</span>
                  <span className="font-bold text-indigo-400">{formatHourLabel(startHour)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="23"
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Midnight</span>
                  <span>12 PM</span>
                  <span>11 PM</span>
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
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Freezing (-20°C)</span>
                  <span>Scorching (50°C)</span>
                </div>
              </div>

              {/* Tariff Rates Editor Section */}
              <div className="border-t border-slate-700/60 pt-4">
                <button
                  type="button"
                  onClick={() => setShowTariffSettings(!showTariffSettings)}
                  className="flex w-full items-center justify-between text-sm font-semibold text-slate-300 hover:text-white transition"
                >
                  <span>Custom Grid Tariff Rates</span>
                  <svg className={`h-4 w-4 transform transition-transform ${showTariffSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showTariffSettings && (
                  <div className="mt-4 space-y-4 rounded-xl bg-slate-950/40 p-4 border border-slate-700/60">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Peak Rate (2 PM - 8 PM)</span>
                        <span className="text-amber-400 font-semibold">${peakRate}/kWh</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.60"
                        step="0.01"
                        value={peakRate}
                        onChange={(e) => setPeakRate(Number(e.target.value))}
                        className="w-full h-1 bg-slate-800 accent-amber-400"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Mid-Peak Rate (6 AM - 2 PM, 8 PM - 10 PM)</span>
                        <span className="text-blue-400 font-semibold">${midPeakRate}/kWh</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.60"
                        step="0.01"
                        value={midPeakRate}
                        onChange={(e) => setMidPeakRate(Number(e.target.value))}
                        className="w-full h-1 bg-slate-800 accent-blue-400"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Off-Peak Rate (10 PM - 6 AM)</span>
                        <span className="text-emerald-400 font-semibold">${offPeakRate}/kWh</span>
                      </div>
                      <input
                        type="range"
                        min="0.02"
                        max="0.40"
                        step="0.01"
                        value={offPeakRate}
                        onChange={(e) => setOffPeakRate(Number(e.target.value))}
                        className="w-full h-1 bg-slate-800 accent-emerald-400"
                      />
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Outputs Column */}
          <div className="lg:col-span-7 space-y-6">
            {results && (
              <>
                {/* Result Hero Header */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-800 to-slate-900 p-6 shadow-2xl">
                  <div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-br from-indigo-500/15 to-transparent rounded-bl-full" />
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Charging Duration</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-white tracking-tight">
                        {formatTime(results.totalChargingTimeMins)}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">SOC {currentSoc}% to {targetSoc}%</p>
                    </div>

                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grid Session Cost</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-emerald-400 tracking-tight">
                        ${results.totalCost}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">Based on starting hour</p>
                    </div>

                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Energy Delivered</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-white tracking-tight">
                        {results.gridEnergyKwh}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">kWh (drawn from grid)</p>
                    </div>

                    <div className="p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Power Rate</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-blue-400 tracking-tight">
                        {results.averagePowerKw}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">kW (temperature adjusted)</p>
                    </div>
                  </div>

                  {/* Impact Rating / Tariff advice */}
                  <div className="mt-6 border-t border-slate-700/60 pt-4 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Tariff Optimization Status:</span>
                    {startHour === results.cheapestHour ? (
                      <span className="font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                        Cheapest rate slot active
                      </span>
                    ) : (
                      <span className="font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25">
                        Rescheduling can save up to {Math.round(((results.totalCost - results.minCost) / results.totalCost) * 100)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Recharts Graphs */}
                <div className="rounded-2xl border border-slate-700 bg-slate-850/40 p-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white">Charging Simulations</h3>
                      <p className="text-xs text-slate-400">Session metrics and grid planner metrics</p>
                    </div>
                    
                    {/* Curve Selector tabs */}
                    <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
                      <button
                        onClick={() => setActiveTab('profile')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'profile' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Charging Curve
                      </button>
                      <button
                        onClick={() => setActiveTab('planner')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'planner' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Schedule Planner
                      </button>
                    </div>
                  </div>

                  <div className="h-[280px] w-full">
                    {activeTab === 'profile' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={results.simCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                          <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} unit="m" />
                          <YAxis yAxisId="left" stroke="#10b981" fontSize={11} tickLine={false} label={{ value: 'SOC (%)', angle: -90, position: 'insideLeft', style: { fill: '#10b981', fontSize: 10 } }} />
                          <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" fontSize={11} tickLine={false} label={{ value: 'Power (kW)', angle: 90, position: 'insideRight', style: { fill: '#3b82f6', fontSize: 10 } }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                            labelFormatter={(label) => `Time: ${label} mins`}
                            labelClassName="text-slate-400 text-xs"
                          />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            name="Battery SOC"
                            dataKey="soc"
                            stroke="#10b981"
                            strokeWidth={2.5}
                            activeDot={{ r: 6 }}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            name="Charger Rate"
                            dataKey="power"
                            stroke="#3b82f6"
                            strokeWidth={1.5}
                            strokeDasharray="3 3"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={results.costOptimizationCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                          <XAxis dataKey="startHour" stroke="#94a3b8" fontSize={10} tickLine={false} tickFormatter={(hr) => `${hr}:00`} />
                          <YAxis stroke="#e2e8f0" fontSize={11} tickLine={false} label={{ value: 'Cost ($)', angle: -90, position: 'insideLeft', style: { fill: '#cbd5e1', fontSize: 10 } }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                            labelFormatter={(hr) => `Start charging at ${formatHourLabel(hr)}`}
                            labelClassName="text-slate-400 text-xs"
                          />
                          <Bar dataKey="totalCost" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                            {results.costOptimizationCurve.map((entry, index) => {
                              const isSelected = entry.startHour === startHour;
                              const isCheapest = entry.startHour === results.cheapestHour;
                              let color = '#334155'; // default slate color
                              if (isCheapest) color = '#10b981'; // emerald cheapest
                              else if (isSelected) color = '#6366f1'; // indigo selected
                              
                              return <Cell key={`cell-${index}`} fill={color} />;
                            })}
                          </Bar>
                          <Legend
                            verticalAlign="top"
                            height={36}
                            content={() => (
                              <div className="flex justify-center gap-6 text-[10px] text-slate-400">
                                <div className="flex items-center gap-1.5">
                                  <div className="h-3 w-3 rounded bg-[#6366f1]" />
                                  <span>Selected Start Time</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="h-3 w-3 rounded bg-[#10b981]" />
                                  <span>Cheapest Start Time</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className="h-3 w-3 rounded bg-[#334155]" />
                                  <span>Standard Rates</span>
                                </div>
                              </div>
                            )}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Proactive Advisor Tips */}
                <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-4">Grid & Battery Optimizer Tips</h3>
                  
                  <div className="space-y-3.5">
                    {getOptimizerTips().map((tip, idx) => (
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
