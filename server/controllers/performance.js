const { supabase } = require('../db');

// POST /api/performance/analyze
// Body: { profile_id, soc, soh, speed_kmph, load_kg, temperature_c, distance_km }
exports.analyzePerformance = async (req, res) => {
  try {
    const { profile_id, soc, soh, speed_kmph, load_kg, temperature_c, distance_km } = req.body;

    if (!profile_id || soc == null || soh == null || speed_kmph == null || distance_km == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Fetch the vehicle profile so we know battery capacity
    const { data: profile, error: profileError } = await supabase
      .from('ev_profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'EV profile not found' });
    }

    // --- Core calculations (rule-based, matches literature review findings) ---

    // Base efficiency: kWh consumed per km, scaled by speed, load, and temperature
    const baseConsumption = profile.battery_capacity / 300; // naive baseline kWh/km
    const speedFactor = speed_kmph > 90 ? 1.25 : speed_kmph < 40 ? 1.1 : 1.0;
    const loadFactor = 1 + (load_kg / profile.vehicle_weight) * 0.15;
    const tempFactor = temperature_c < 5 || temperature_c > 40 ? 1.2 : 1.0;

    const energyConsumptionKwhPerKm = baseConsumption * speedFactor * loadFactor * tempFactor;
    const estimatedRangeKm = (profile.battery_capacity * (soc / 100)) / energyConsumptionKwhPerKm;

    // Efficiency score out of 100 (lower consumption + higher SOH = better score)
    const efficiencyScore = Math.max(
      0,
      Math.min(100, 100 - (energyConsumptionKwhPerKm * 50) + (soh - 80) * 0.5)
    );

    // Degradation risk flag (from Liu et al. finding: charging above 80% SOC hurts cycle life)
    const degradationRisk = soc > 80 ? 'High (avoid charging above 80% routinely)' : 'Low';

    const result = {
      profile_id,
      energy_consumption_kwh_per_km: Number(energyConsumptionKwhPerKm.toFixed(3)),
      estimated_range_km: Number(estimatedRangeKm.toFixed(1)),
      efficiency_score: Number(efficiencyScore.toFixed(1)),
      degradation_risk: degradationRisk,
      inputs: { soc, soh, speed_kmph, load_kg, temperature_c, distance_km },
    };

    // Store the result for history/dashboard use
    const { error: insertError } = await supabase.from('analysis_results').insert({
      profile_id,
      analysis_type: 'performance',
      result_json: result,
    });

    if (insertError) throw insertError;

    res.status(200).json(result);
  } catch (err) {
    console.error('analyzePerformance error:', err);
    res.status(500).json({ error: 'Performance analysis failed' });
  }
};

// GET /api/performance/history/:profileId
exports.getPerformanceHistory = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('profile_id', profileId)
      .eq('analysis_type', 'performance')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    console.error('getPerformanceHistory error:', err);
    res.status(500).json({ error: 'Could not fetch performance history' });
  }
};