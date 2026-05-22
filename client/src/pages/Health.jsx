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
  Legend,
  Cell
} from 'recharts';

export default function Health() {
  const navigate = useNavigate();
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());

  // Input states
  const [cycleCount, setCycleCount] = useState(150);
  const [maxCellVoltage, setMaxCellVoltage] = useState(4.18);
  const [minCellVoltage, setMinCellVoltage] = useState(4.15);
  const [internalResistance, setInternalResistance] = useState(12);
  const [operatingTemp, setOperatingTemp] = useState(28);

  const [loading, setLoading] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [results, setResults] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('soh_trend'); // 'soh_trend' or 'deviation_trend'

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

  // Fetch history for the active profile
  async function fetchHistory() {
    if (!activeProfile) return;
    try {
      const res = await api.get(`/health/history/${activeProfile.id}`);
      if (res.data?.ok) {
        setHistory(res.data.history || []);
      }
    } catch (err) {
      console.error('Error fetching health history:', err);
    }
  }

  // Load history on mount or when profile changes
  useEffect(() => {
    fetchHistory();
  }, [activeProfile]);

  // Debounced API assessment query (simulation mode - save_to_db: false)
  useEffect(() => {
    if (!activeProfile) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.post('/health/assess', {
          profile_id: activeProfile.id,
          cycle_count: cycleCount,
          max_cell_voltage: maxCellVoltage,
          min_cell_voltage: minCellVoltage,
          internal_resistance_mohm: internalResistance,
          operating_temp: operatingTemp,
          save_to_db: false
        });

        if (res.data?.ok) {
          setResults(res.data.data);
        } else {
          setError('Failed to compute battery health diagnostics.');
        }
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || 'Error communicating with health diagnostics backend.');
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [activeProfile, cycleCount, maxCellVoltage, minCellVoltage, internalResistance, operatingTemp]);

  // Explicit action to insert a permanent log record
  const logDiagnosticSession = async () => {
    if (!activeProfile) return;
    setLogging(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post('/health/assess', {
        profile_id: activeProfile.id,
        cycle_count: cycleCount,
        max_cell_voltage: maxCellVoltage,
        min_cell_voltage: minCellVoltage,
        internal_resistance_mohm: internalResistance,
        operating_temp: operatingTemp,
        save_to_db: true
      });

      if (res.data?.ok) {
        setSuccessMsg('Diagnostic run successfully logged to database!');
        // Refresh history graph
        fetchHistory();
        // Clear message after 4s
        setTimeout(() => setSuccessMsg(''), 4000);
      } else {
        setError('Failed to log diagnostic session.');
      }
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || 'Error saving diagnostic session to cloud.');
    } finally {
      setLogging(false);
    }
  };

  const handleMinChange = (val) => {
    const num = Number(val);
    if (num > maxCellVoltage) {
      setMinCellVoltage(num);
      setMaxCellVoltage(num);
    } else {
      setMinCellVoltage(num);
    }
  };

  const handleMaxChange = (val) => {
    const num = Number(val);
    if (num < minCellVoltage) {
      setMaxCellVoltage(num);
      setMinCellVoltage(num);
    } else {
      setMaxCellVoltage(num);
    }
  };

  // Compile advice cards based on current diagnostics
  const getHealthAdvice = () => {
    if (!results) return [];
    const tips = [];

    // Cell Voltage Imbalance
    if (results.cellBalanceStatus === 'Severe Imbalance') {
      tips.push({
        title: 'Severe Cell Voltage Imbalance',
        desc: `Cell voltage delta is ${Math.round(results.voltageDeviation * 1000)} mV (exceeds critical 40 mV limit). Severe cell voltage disparity suggests localized cell degradation or weak blocks. Professional cell balancing or module testing is highly recommended.`,
        type: 'danger'
      });
    } else if (results.cellBalanceStatus === 'Slight Imbalance') {
      tips.push({
        title: 'Minor Cell Imbalance Detected',
        desc: `Cell voltage delta is ${Math.round(results.voltageDeviation * 1000)} mV. This can occur naturally under dynamic loads. To recalibrate and balance cells, charge your vehicle to 100% SOC and let it remain connected to an AC charger for several hours to run the BMS cell balance.`,
        type: 'warning'
      });
    }

    // Cell Resistance
    if (results.impedanceStatus === 'High') {
      tips.push({
        title: 'Critical Cell Impedance (Resistance)',
        desc: `Measured internal resistance is ${results.internalResistance} mΩ. High impedance generates severe Joule heating under load, reducing pack efficiency and elevating thermal runaway hazards. Restrict DC fast charging to a minimum.`,
        type: 'danger'
      });
    } else if (results.impedanceStatus === 'Moderate') {
      tips.push({
        title: 'Elevated Cell Impedance',
        desc: `Internal cell resistance is moderately elevated at ${results.internalResistance} mΩ (nominal is <15 mΩ). This is normal as cells accrue cycle throughput. Keep monitoring battery pack operating temperatures.`,
        type: 'warning'
      });
    }

    // Thermal envelope
    if (results.thermalStatus === 'Hot') {
      tips.push({
        title: 'Critical Thermal State',
        desc: `Operating temperature is hot (${results.operatingTemp}°C). Running battery packs above 45°C accelerates SEI layer buildup and electrolyte degradation. Active pack cooling will engage; avoid aggressive acceleration.`,
        type: 'danger'
      });
    } else if (results.thermalStatus === 'Cold') {
      tips.push({
        title: 'Sub-Optimal Operating Temperature',
        desc: `Pack temperature is cold (${results.operatingTemp}°C), which slows down chemical kinetics, limits regenerative braking capabilities, and reduces charging rates. Utilize cabin/pack preconditioning prior to departure.`,
        type: 'info'
      });
    }

    // Cycle wear warnings
    if (results.cycleCount > 1500) {
      tips.push({
        title: 'High Cell Cycle Throughput',
        desc: `Your battery pack has logged ${results.cycleCount.toLocaleString()} full cycles. The degradation is expected. Restricting usage parameters (e.g. keeping SOC between 15% and 85%) will help retain remaining capacity.`,
        type: 'info'
      });
    }

    // Critical SOH status
    if (results.sohStatus === 'Critical') {
      tips.push({
        title: 'Replacement SOH Threshold Reached',
        desc: `Battery State of Health is at ${results.soh}%. Capacity retention below 70% typically signals accelerated cell wear. Check battery warranty status and schedule a certified dealer diagnostics check.`,
        type: 'danger'
      });
    }

    if (tips.length === 0) {
      tips.push({
        title: 'Optimal Pack Equilibrium',
        desc: 'All monitored diagnostic variables (cell balance, resistance, operating temperatures, SOH) are well within ideal manufacturer tolerances.',
        type: 'success'
      });
    }

    return tips;
  };

  const getChartData = () => {
    return history.map((h) => {
      const date = new Date(h.created_at);
      const timeLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + 
                        date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      return {
        time: timeLabel,
        soh: h.result_json?.soh || 0,
        voltageDeviation: (h.result_json?.voltageDeviation || 0) * 1000, // convert to mV
        internalResistance: h.result_json?.internalResistance || 0,
        operatingTemp: h.result_json?.operatingTemp || 0
      };
    });
  };

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="border-b border-slate-800 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">Analysis Modules</p>
        <h1 className="mt-2 text-4xl font-bold text-white tracking-tight">EV Battery Diagnostics & Cell Health</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Run cell-level diagnostics. Analyze cell balance deviation, internal resistance, cycle counts, and thermal health envelopes.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 animate-pulse">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {successMsg}
        </div>
      )}

      {/* No Active Profile state */}
      {!activeProfile ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-880/20 p-12 text-center max-w-3xl mx-auto flex flex-col items-center">
          <div className="rounded-full bg-slate-950 border border-slate-800 p-5 mb-4 shadow-xl">
            <svg className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">No active vehicle profile selected</h2>
          <p className="mt-3 text-slate-400 max-w-md text-sm leading-relaxed">
            Please register your electric vehicle profile to run cell-level diagnostic models and SOH logging histories.
          </p>
          <button
            onClick={() => navigate('/ev-profile')}
            className="mt-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 font-semibold text-slate-950 transition duration-150 shadow-lg shadow-emerald-950/40"
          >
            Manage Profiles
          </button>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white">BMS Diagnostics</h2>
                <p className="text-xs text-slate-400 mt-1">Input measured cell-level OBD-II parameters</p>
              </div>

              {/* Cycle Count */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Total Charge Cycles</span>
                  <span className="font-bold text-blue-400">{cycleCount.toLocaleString()} cycles</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3000"
                  step="50"
                  value={cycleCount}
                  onChange={(e) => setCycleCount(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-blue-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>New Pack (0)</span>
                  <span>High wear (3k)</span>
                </div>
              </div>

              {/* Max Cell Voltage */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Max Cell Voltage</span>
                  <span className="font-bold text-emerald-400">{maxCellVoltage.toFixed(2)} V</span>
                </div>
                <input
                  type="range"
                  min="3.80"
                  max="4.25"
                  step="0.01"
                  value={maxCellVoltage}
                  onChange={(e) => handleMaxChange(e.target.value)}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Discharged (3.8V)</span>
                  <span>Fully Charged (4.25V)</span>
                </div>
              </div>

              {/* Min Cell Voltage */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Min Cell Voltage</span>
                  <span className="font-bold text-indigo-400">{minCellVoltage.toFixed(2)} V</span>
                </div>
                <input
                  type="range"
                  min="3.00"
                  max="4.25"
                  step="0.01"
                  value={minCellVoltage}
                  onChange={(e) => handleMinChange(e.target.value)}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Empty Cell (3.0V)</span>
                  <span>Fully Charged (4.25V)</span>
                </div>
              </div>

              {/* Internal Resistance */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Cell Internal Resistance</span>
                  <span className="font-bold text-amber-400">{internalResistance} mΩ</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="1"
                  value={internalResistance}
                  onChange={(e) => setInternalResistance(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Nominal (5mΩ)</span>
                  <span>High Degradation (60mΩ)</span>
                </div>
              </div>

              {/* Operating Temp */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Battery Operating Temp</span>
                  <span className={`font-bold ${operatingTemp < 10 ? 'text-blue-400' : operatingTemp > 40 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {operatingTemp} °C
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="60"
                  step="1"
                  value={operatingTemp}
                  onChange={(e) => setOperatingTemp(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-red-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Sub-Zero (-10°C)</span>
                  <span>Thermal Throttling (60°C)</span>
                </div>
              </div>

              {/* Log Diagnostic Run Action */}
              <button
                onClick={logDiagnosticSession}
                disabled={logging || !results}
                className="w-full mt-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 px-6 py-3 font-semibold text-slate-950 transition duration-150 shadow-lg shadow-emerald-950/20 flex items-center justify-center gap-2"
              >
                {logging ? (
                  <span>Logging session...</span>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Log Diagnostic Session</span>
                  </>
                )}
              </button>

              {results && (
                <div className="border-t border-slate-700/60 pt-4 text-xs text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-300 block mb-1">Chemistry Profile</span>
                  Detected pack technology: <span className="text-emerald-400 font-medium">{results.chemistry}</span>
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
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">State of Health</p>
                      <p className={`mt-1.5 text-3xl font-extrabold tracking-tight ${
                        results.sohStatus === 'Optimal' ? 'text-emerald-400' :
                        results.sohStatus === 'Good' ? 'text-blue-400' :
                        results.sohStatus === 'Degraded' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {results.soh}%
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">Status: {results.sohStatus}</p>
                    </div>

                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cell Deviation</p>
                      <p className={`mt-1.5 text-3xl font-extrabold tracking-tight ${
                        results.cellBalanceStatus === 'Excellent' ? 'text-emerald-400' :
                        results.cellBalanceStatus === 'Slight Imbalance' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {Math.round(results.voltageDeviation * 1000)} mV
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">Spread: {results.cellBalanceStatus}</p>
                    </div>

                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cell Impedance</p>
                      <p className={`mt-1.5 text-3xl font-extrabold tracking-tight ${
                        results.impedanceStatus === 'Nominal' ? 'text-emerald-400' :
                        results.impedanceStatus === 'Moderate' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {results.internalResistance} mΩ
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">Status: {results.impedanceStatus}</p>
                    </div>

                    <div className="p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Thermal Envelope</p>
                      <p className={`mt-1.5 text-3xl font-extrabold tracking-tight ${
                        results.thermalStatus === 'Optimal' ? 'text-emerald-400' :
                        results.thermalStatus === 'Cold' ? 'text-blue-400' :
                        results.thermalStatus === 'Warm' ? 'text-amber-400' :
                        'text-red-400'
                      }`}>
                        {results.operatingTemp}°C
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">Status: {results.thermalStatus}</p>
                    </div>
                  </div>

                  {/* Impact Rating */}
                  <div className="mt-6 border-t border-slate-700/60 pt-4 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Diagnostic Combined Health Score:</span>
                    <span className={`font-bold px-2.5 py-0.5 rounded-full ${
                      results.healthScore >= 90 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' :
                      results.healthScore >= 75 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' :
                      'bg-red-500/10 text-red-400 border border-red-500/25'
                    }`}>
                      {results.healthScore} / 100
                    </span>
                  </div>
                </div>

                {/* Recharts Graphical Projections */}
                <div className="rounded-2xl border border-slate-700 bg-slate-850/40 p-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white">Diagnostic Run History</h3>
                      <p className="text-xs text-slate-400">Trends compiled from logged diagnostic sessions</p>
                    </div>
                    
                    {/* Graph Tab selector */}
                    <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
                      <button
                        onClick={() => setActiveTab('soh_trend')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'soh_trend' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        SOH Trend
                      </button>
                      <button
                        onClick={() => setActiveTab('deviation_trend')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'deviation_trend' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Cell Imbalance
                      </button>
                    </div>
                  </div>

                  <div className="h-[280px] w-full">
                    {history.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                        No logged diagnostic runs yet. Click the "Log Diagnostic Session" button to start your history.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        {activeTab === 'soh_trend' ? (
                          <LineChart data={getChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                            <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} />
                            <YAxis stroke="#e2e8f0" fontSize={11} tickLine={false} domain={[40, 100]} label={{ value: 'State of Health (%)', angle: -90, position: 'insideLeft', style: { fill: '#cbd5e1', fontSize: 10 } }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                              labelFormatter={(label) => `Log time: ${label}`}
                              formatter={(value) => [`${value}%`, 'State of Health']}
                            />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                            <Line type="monotone" name="Logged SOH" dataKey="soh" stroke="#10b981" strokeWidth={2.5} activeDot={{ r: 6 }} />
                          </LineChart>
                        ) : (
                          <LineChart data={getChartData()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                            <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickLine={false} />
                            <YAxis stroke="#e2e8f0" fontSize={11} tickLine={false} label={{ value: 'Voltage Imbalance (mV)', angle: -90, position: 'insideLeft', style: { fill: '#cbd5e1', fontSize: 10 } }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                              labelFormatter={(label) => `Log time: ${label}`}
                              formatter={(value) => [`${value} mV`, 'Voltage Deviation']}
                            />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                            <Line type="monotone" name="Cell Voltage Spread" dataKey="voltageDeviation" stroke="#f43f5e" strokeWidth={2.5} activeDot={{ r: 6 }} />
                          </LineChart>
                        )}
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Proactive Advisor Tips */}
                <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-4">Diagnostics Advisory Checklist</h3>
                  
                  <div className="space-y-3.5">
                    {getHealthAdvice().map((tip, idx) => (
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
