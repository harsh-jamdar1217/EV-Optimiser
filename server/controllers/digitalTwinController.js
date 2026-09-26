const { supabase } = require('../db');

// Reuse the same degradation physics, but let the user directly compare
// TWO custom scenarios (not just "current vs auto-optimized")
exports.simulateScenarios = async (req, res) => {
  try {
    const { profile_id, scenarioA, scenarioB } = req.body;

    if (!profile_id) {
      return res.status(400).json({ ok: false, message: 'Active EV profile ID is required.' });
    }
    if (!scenarioA || !scenarioB) {
      return res.status(400).json({ ok: false, message: 'Both scenarioA and scenarioB are required.' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('ev_profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ ok: false, message: 'EV profile not found in database.' });
    }

    const modelLower = profile.vehicle_model.toLowerCase();
    const isLFP = modelLower.includes('lfp') || modelLower.includes('nexon ev max') || profile.battery_capacity <= 30;
    const baseCycleLife = isLFP ? 3200 : 1800;
    const calendarSensitivityToHighSoc = isLFP ? 0.25 : 1.0;
    const consumptionRate = (profile.vehicle_weight / 100) * 0.8 + (profile.motor_power / 20);

    const calculateAnnualDegradation = (t, limit, dcPct, annualDist) => {
      const tempFactor = Math.max(0.15, Math.min(8.0, Math.exp((t - 20) / 12)));
      const socFactor = 1.0 + Math.pow(Math.max(0, limit - 70) / 30, 1.6) * 0.7 * calendarSensitivityToHighSoc;
      const annualCalendarLoss = 1.25 * tempFactor * socFactor;

      const annualKwhThroughput = (annualDist / 100) * consumptionRate;
      const cyclesPerYear = annualKwhThroughput / profile.battery_capacity;
      const dcMultiplier = 1.0 + (dcPct / 100) * 1.6;
      const annualCyclicLoss = cyclesPerYear * (20.0 / baseCycleLife) * dcMultiplier;

      return annualCalendarLoss + annualCyclicLoss;
    };

    const buildCurve = (scenario) => {
      const temp = Number(scenario.temperature ?? 25);
      const limit = Math.max(50, Math.min(100, Number(scenario.chargingLimit ?? 90)));
      const dcRatio = Math.max(0, Math.min(100, Number(scenario.fastChargingRatio ?? 20)));
      const annualDist = Math.max(0, Number(scenario.annualMileage ?? 12000));

      const annualLoss = calculateAnnualDegradation(temp, limit, dcRatio, annualDist);
      const curve = [];
      let soh = 100;
      for (let y = 0; y <= 10; y++) {
        curve.push({ year: y, soh: Number(soh.toFixed(1)), capacity: Number((profile.battery_capacity * (soh / 100)).toFixed(1)) });
        soh = Math.max(40, soh - annualLoss);
      }

      const sohLossTo70 = Math.max(0, 100 - 70);
      const yearsTo70 = annualLoss > 0 ? sohLossTo70 / annualLoss : 100;

      return { curve, annualLoss: Number(annualLoss.toFixed(2)), yearsTo70: Number(yearsTo70.toFixed(1)), kmTo70: Math.round(yearsTo70 * annualDist) };
    };

    const resultA = buildCurve(scenarioA);
    const resultB = buildCurve(scenarioB);

    const result = {
      profile_id,
      vehicleModel: profile.vehicle_model,
      scenarioA: { inputs: scenarioA, ...resultA },
      scenarioB: { inputs: scenarioB, ...resultB },
      yearsDifference: Number((resultB.yearsTo70 - resultA.yearsTo70).toFixed(1)),
    };

    const { error: insertError } = await supabase.from('analysis_results').insert({
      profile_id,
      analysis_type: 'digital_twin',
      result_json: result,
    });
    if (insertError) console.error('Failed to save digital twin result:', insertError);

    return res.json({ ok: true, data: result });
  } catch (error) {
    console.error('Digital twin simulation error:', error);
    return res.status(500).json({ ok: false, message: 'Server error running digital twin simulation.' });
  }
};