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

export default function Cost() {
  const navigate = useNavigate();
  const [activeProfile, setActiveProfile] = useState(() => getActiveProfile());
  
  // Slider states
  const [annualMileage, setAnnualMileage] = useState(15000);
  const [electricityRate, setElectricityRate] = useState(0.15);
  const [gasolinePrice, setGasolinePrice] = useState(1.20);
  const [iceFuelEconomy, setIceFuelEconomy] = useState(7.5);
  const [evPurchasePremium, setEvPurchasePremium] = useState(6000);
  
  // Advanced parameters states
  const [chargingEfficiency, setChargingEfficiency] = useState(90);
  const [gridCo2Factor, setGridCo2Factor] = useState(0.38);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('amortization'); // 'amortization' or 'co2'
  
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

  // Fetch cost comparison simulation with debounce
  useEffect(() => {
    if (!activeProfile) return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.post('/cost/compare', {
          profile_id: activeProfile.id,
          annual_mileage: annualMileage,
          electricity_rate: electricityRate,
          gasoline_price: gasolinePrice,
          ice_fuel_economy: iceFuelEconomy,
          charging_efficiency: chargingEfficiency,
          ev_purchase_premium: evPurchasePremium,
          grid_co2_factor: gridCo2Factor
        });

        if (res.data?.ok) {
          setResults(res.data.data);
        } else {
          setError('Failed to compute cost comparison analysis.');
        }
      } catch (err) {
        console.error(err);
        setError(err?.response?.data?.message || 'Error communicating with cost optimizer backend.');
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [
    activeProfile,
    annualMileage,
    electricityRate,
    gasolinePrice,
    iceFuelEconomy,
    chargingEfficiency,
    evPurchasePremium,
    gridCo2Factor
  ]);

  // Generate dynamic tips based on cost model calculations
  const getCostAdvice = () => {
    if (!results) return [];
    const tips = [];

    // Break-even and premium payback advice
    if (results.breakEvenYears === 99) {
      tips.push({
        title: 'Negative Financial Amortization',
        desc: `With current settings, the running costs of the EV are higher than or match the ICE, meaning the $${evPurchasePremium.toLocaleString()} purchase premium will never be paid off. Try adjusting fuel economy, gasoline price, or mileage parameters to see when it flips.`,
        type: 'danger'
      });
    } else if (results.breakEvenYears > 7) {
      tips.push({
        title: 'Extended Payback Period',
        desc: `It takes ${results.breakEvenYears} years and ${results.breakEvenMonths} months to amortize your $${evPurchasePremium.toLocaleString()} EV purchase premium. Driving more kilometers per year or charging during lower-tariff hours (e.g. overnight) will speed up your return on investment.`,
        type: 'warning'
      });
    } else if (results.breakEvenYears <= 3) {
      tips.push({
        title: 'Rapid Investment Payback',
        desc: `Fantastic payback speed! Your initial EV purchase premium of $${evPurchasePremium.toLocaleString()} will break even in just ${results.breakEvenYears} yrs ${results.breakEvenMonths} mos. After this point, you accrue pure running-cost savings.`,
        type: 'success'
      });
    }

    // Grid carbon intensity advice
    if (gridCo2Factor > 0.6) {
      tips.push({
        title: 'Carbon-Intensive Regional Power Grid',
        desc: `At ${gridCo2Factor} kg CO2/kWh, the local power grid is highly carbon-dense. Charging from off-grid rooftop solar or enrolling in a certified renewable utility tariff can maximize your carbon savings.`,
        type: 'warning'
      });
    } else if (results.netCo2SavedKg > 1500) {
      tips.push({
        title: 'Significant Environmental Reduction',
        desc: `Your EV operation prevents ${results.netCo2SavedKg.toLocaleString()} kg of CO2 from entering the atmosphere annually compared to an equivalent ICE. This offsets carbon equivalent to planting ${results.equivalentTrees} trees per year!`,
        type: 'success'
      });
    }

    // Maintenance offset advice
    tips.push({
      title: 'Structural Maintenance Advantage',
      desc: 'EV standard maintenance ($200/year) is significantly lower than ICE servicing ($600/year) due to the lack of spark plugs, oil filters, timing belts, and friction-brake wear. This generates a stable $4,000 benefit over 10 years.',
      type: 'info'
    });

    return tips;
  };

  const getCo2ChartData = () => {
    if (!results) return [];
    return [
      { name: 'Gasoline ICE', co2: results.iceCo2Kg, fill: '#f43f5e' },
      { name: 'Your EV', co2: results.evCo2Kg, fill: '#10b981' }
    ];
  };

  return (
    <div className="space-y-8">
      {/* Title Header */}
      <div className="border-b border-slate-800 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">Analysis Modules</p>
        <h1 className="mt-2 text-4xl font-bold text-white tracking-tight">EV Operational Cost Comparison</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Model ownership amortization curves and environmental impact, comparing electric vehicles against internal combustion engines.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 animate-pulse">
          {error}
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
            Please select or configure your active electric vehicle profile to run financial comparative models and break-even calculations.
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
                <h2 className="text-xl font-bold text-white">Economic Inputs</h2>
                <p className="text-xs text-slate-400 mt-1">Adjust driving and market variables</p>
              </div>

              {/* Annual Mileage (km) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Annual Driving Mileage</span>
                  <span className="font-bold text-blue-400">{annualMileage.toLocaleString()} km</span>
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

              {/* Electricity Rate ($/kWh) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Electricity Tariff Rate</span>
                  <span className="font-bold text-emerald-400">${electricityRate.toFixed(2)} / kWh</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.80"
                  step="0.01"
                  value={electricityRate}
                  onChange={(e) => setElectricityRate(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Cheap ($0.05)</span>
                  <span>Super-Peak ($0.80)</span>
                </div>
              </div>

              {/* Petrol Price ($/liter) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Petrol/Gasoline Price</span>
                  <span className="font-bold text-amber-400">${gasolinePrice.toFixed(2)} / Liter</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="3.00"
                  step="0.05"
                  value={gasolinePrice}
                  onChange={(e) => setGasolinePrice(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Low ($0.50)</span>
                  <span>Premium Fuel ($3.00)</span>
                </div>
              </div>

              {/* ICE Fuel Economy (L/100km) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">Gasoline ICE Fuel Economy</span>
                  <span className="font-bold text-indigo-400">{iceFuelEconomy.toFixed(1)} L/100km</span>
                </div>
                <input
                  type="range"
                  min="4.0"
                  max="18.0"
                  step="0.1"
                  value={iceFuelEconomy}
                  onChange={(e) => setIceFuelEconomy(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Hybrid (4.0L)</span>
                  <span>SUV / Truck (18.0L)</span>
                </div>
              </div>

              {/* EV Purchase Premium ($) */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-200">EV Upfront Price Premium</span>
                  <span className="font-bold text-rose-400">${evPurchasePremium.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25000"
                  step="500"
                  value={evPurchasePremium}
                  onChange={(e) => setEvPurchasePremium(Number(e.target.value))}
                  className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-rose-400"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Direct Parity ($0)</span>
                  <span>Luxury Cap ($25k)</span>
                </div>
              </div>

              {/* Advanced Param Collapsible */}
              <div className="pt-2 border-t border-slate-700/60">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition animate-none"
                >
                  <span>{showAdvanced ? '▼' : '►'} Advanced Parameters</span>
                </button>

                {showAdvanced && (
                  <div className="mt-4 space-y-4">
                    {/* Charging Efficiency */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-300">Charging Grid Efficiency</span>
                        <span className="font-bold text-slate-400">{chargingEfficiency}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="100"
                        step="1"
                        value={chargingEfficiency}
                        onChange={(e) => setChargingEfficiency(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-slate-400"
                      />
                    </div>

                    {/* Grid Carbon Coefficient */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-300">Regional Grid Carbon Intensity</span>
                        <span className="font-bold text-emerald-400">{gridCo2Factor.toFixed(2)} kg/kWh</span>
                      </div>
                      <input
                        type="range"
                        min="0.00"
                        max="1.20"
                        step="0.01"
                        value={gridCo2Factor}
                        onChange={(e) => setGridCo2Factor(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {results && (
                <div className="border-t border-slate-700/60 pt-4 text-xs text-slate-400 leading-relaxed space-y-1">
                  <div>
                    <span className="font-semibold text-slate-300">Vehicle Baseline: </span>
                    <span className="text-emerald-400">{results.vehicleModel}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-300">Calculated Energy Consumption: </span>
                    <span>{results.evConsumptionRate} kWh/100km</span>
                  </div>
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
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 col-span-2">
                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Annual Savings</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-white tracking-tight">
                        ${results.annualSavings.toLocaleString()}
                      </p>
                      <p className="text-[9px] text-emerald-400 mt-1">/ year saved</p>
                    </div>

                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monthly Savings</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-emerald-400 tracking-tight">
                        ${results.monthlySavings.toLocaleString()}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">/ month saved</p>
                    </div>

                    <div className="p-2 border-r border-slate-700/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payback Period</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-white tracking-tight">
                        {results.breakEvenYears === 99
                          ? 'Never'
                          : `${results.breakEvenYears}y ${results.breakEvenMonths}m`}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">to break-even</p>
                    </div>

                    <div className="p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net CO2 Offset</p>
                      <p className="mt-1.5 text-3xl font-extrabold text-blue-400 tracking-tight">
                        {results.netCo2SavedKg.toLocaleString()}
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">kg/yr ({results.equivalentTrees} trees)</p>
                    </div>
                  </div>

                  {/* Impact Rating */}
                  <div className="mt-6 border-t border-slate-700/60 pt-4 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Operational cost per km:</span>
                    <span className="font-bold text-slate-200">
                      EV: ${results.perKmEvCost.toFixed(3)}/km vs ICE: ${results.perKmIceCost.toFixed(3)}/km
                    </span>
                  </div>
                </div>

                {/* Recharts Graphical Projections */}
                <div className="rounded-2xl border border-slate-700 bg-slate-850/40 p-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white">Financial & Environmental Impact</h3>
                      <p className="text-xs text-slate-400">Comparing electric vs internal combustion engine metrics</p>
                    </div>
                    
                    {/* Graph Tab selector */}
                    <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 self-start">
                      <button
                        onClick={() => setActiveTab('amortization')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'amortization' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Amortization
                      </button>
                      <button
                        onClick={() => setActiveTab('co2')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                          activeTab === 'co2' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Carbon Footprint
                      </button>
                    </div>
                  </div>

                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {activeTab === 'amortization' ? (
                        <LineChart data={results.cumulativeCostCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                          <XAxis dataKey="year" stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(yr) => `Year ${yr}`} />
                          <YAxis stroke="#e2e8f0" fontSize={11} tickLine={false} label={{ value: 'Cumulative Cost ($)', angle: -90, position: 'insideLeft', style: { fill: '#cbd5e1', fontSize: 10 } }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                            labelFormatter={(yr) => `Year ${yr} projection`}
                            formatter={(value) => [`$${value.toLocaleString()}`, '']}
                          />
                          <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '11px' }} />
                          <Line type="monotone" name="EV Cumulative Cost (Inc. Premium)" dataKey="evCumulativeCost" stroke="#10b981" strokeWidth={2.5} activeDot={{ r: 6 }} />
                          <Line type="monotone" name="ICE Cumulative Cost" dataKey="iceCumulativeCost" stroke="#f43f5e" strokeWidth={2} strokeDasharray="4 4" />
                        </LineChart>
                      ) : (
                        <BarChart data={getCo2ChartData()} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" strokeOpacity={0.25} />
                          <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                          <YAxis stroke="#e2e8f0" fontSize={11} tickLine={false} label={{ value: 'Annual CO2 Emissions (kg)', angle: -90, position: 'insideLeft', style: { fill: '#cbd5e1', fontSize: 10 } }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                            formatter={(value) => [`${value.toLocaleString()} kg CO2`, 'Emissions']}
                          />
                          <Bar dataKey="co2" radius={[8, 8, 0, 0]}>
                            {getCo2ChartData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Proactive Advisor Tips */}
                <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
                  <h3 className="text-lg font-bold text-white mb-4">Financial & Carbon Optimization Advice</h3>
                  
                  <div className="space-y-3.5">
                    {getCostAdvice().map((tip, idx) => (
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
