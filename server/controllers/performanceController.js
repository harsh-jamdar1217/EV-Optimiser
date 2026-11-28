const { supabase } = require('../db');
const { loadState, pickNumber } = require('../services/vehicleState');
const { consumptionKwhPer100km, usableCapacityKwh, effectiveSohPct } = require('../services/evModel');

exports.analyzePerformance = async (req, res) => {
  try {
    const { profile_id, daily_distance, average_speed, driving_style } = req.body;

    if (!profile_id) {
      return res.status(400).json({ ok: false, message: 'Active EV profile is required.' });
    }

    // Fetch the EV profile to get baseline specs
    const { data: profile, error: profileError } = await supabase
      .from('ev_profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ ok: false, message: 'EV profile not found in database. Make sure your active profile is synced to the cloud.' });
    }

    const distance = Number(daily_distance) || 0;
    const speed = Number(average_speed) || 0;

    // Shared vehicle state: ambient temperature and SOH come from saved state
    const state = await loadState(profile_id);
    const ambientTemp = pickNumber(req.body.temperature, state.ambient_temp_c, 25);
    const usableKwh = usableCapacityKwh(profile, state.soh_pct);

    // 1. Energy consumption (kWh/100km) -- same model as the Range page
    const energyConsumption = consumptionKwhPer100km({
      profile,
      speedKmh: speed,
      temperatureC: ambientTemp,
      hvac: false,
      style: driving_style,
    });

    // 2. Efficiency Score (0-100)
    // Assuming 12 kWh/100km is fantastic (score 100) and 30 kWh/100km is poor (score 20)
    let efficiencyScore = 100 - ((energyConsumption - 12) * (80 / 18));
    efficiencyScore = Math.max(10, Math.min(100, efficiencyScore));

    // 3. Estimated Real-World Range
    const estimatedRange = (usableKwh / energyConsumption) * 100;

    // 4. Range Utilization (%)
    const rangeUtilization = distance > 0 ? (distance / estimatedRange) * 100 : 0;

    // 5. Overall Performance Score
    // Balances efficiency and healthy range utilization (e.g. keeping utilization under 80% is good)
    let utilizationScore = 100;
    if (rangeUtilization > 80) utilizationScore = 100 - ((rangeUtilization - 80) * 2);
    if (rangeUtilization > 100) utilizationScore = 10;
    
    const performanceScore = (efficiencyScore * 0.6) + (utilizationScore * 0.4);

    const resultData = {
      energyConsumption: Number(energyConsumption.toFixed(2)),
      efficiencyScore: Math.round(efficiencyScore),
      estimatedRange: Math.round(estimatedRange),
      rangeUtilization: Number(rangeUtilization.toFixed(1)),
      performanceScore: Math.round(performanceScore),
      driving_style,
      daily_distance: distance,
      average_speed: speed,
      ambientTemp,
      sohPct: Number(effectiveSohPct(state.soh_pct).toFixed(1)),
      usableCapacityKwh: Number(usableKwh.toFixed(1))
    };

    // Save to Supabase
    const { data: analysisData, error: analysisError } = await supabase
      .from('analysis_results')
      .insert([{
        profile_id: profile.id,
        analysis_type: 'performance',
        result_json: resultData
      }])
      .select()
      .single();

    if (analysisError) throw analysisError;

    return res.json({
      ok: true,
      analysis: analysisData
    });

  } catch (error) {
    console.error("performance analysis error:", error);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
};

exports.getPerformanceHistory = async (req, res) => {
  try {
    const profile_id = Number(req.params.profile_id);
    if (!Number.isInteger(profile_id)) {
      return res.status(400).json({ ok: false, message: 'Invalid profile_id parameter.' });
    }

    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('profile_id', profile_id)
      .eq('analysis_type', 'performance')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({
      ok: true,
      history: data
    });
  } catch (err) {
    console.error("getPerformanceHistory error:", err);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
};

