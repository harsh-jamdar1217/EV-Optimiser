const { supabase } = require('../db');
const { loadState, pickNumber } = require('../services/vehicleState');
const { clamp, annualDegradation, estimateCurrentSoh } = require('../services/evModel');

// Compare TWO custom scenarios. Both start from the vehicle's CURRENT SOH (the
// same value the Degradation page uses), then age forward under their own settings.
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

    const state = await loadState(profile_id);

    // Starting SOH: saved (health assessment / manual) > age + mileage model.
    // The model uses the vehicle's saved/default usage, not either scenario's settings.
    let startSoh;
    let sohBasis;
    if (state.soh_pct !== null && state.soh_source !== 'degradation_forecast') {
      startSoh = Number(state.soh_pct);
      sohBasis = state.soh_source;
    } else {
      startSoh = estimateCurrentSoh({
        profile,
        odometerKm: Math.max(0, pickNumber(undefined, state.odometer_km, 20000)),
        tempC: pickNumber(undefined, state.ambient_temp_c, 25),
        chargeLimitPct: clamp(pickNumber(undefined, state.charge_limit_pct, 90), 50, 100),
        dcPct: clamp(pickNumber(undefined, state.fast_charge_ratio_pct, 20), 0, 100),
        annualDistKm: Math.max(0, pickNumber(undefined, state.annual_mileage_km, 12000)),
      }).soh;
      sohBasis = 'age_and_odometer_model';
    }

    const buildCurve = (scenario) => {
      const temp = pickNumber(scenario.temperature, state.ambient_temp_c, 25);
      const limit = clamp(pickNumber(scenario.chargingLimit, state.charge_limit_pct, 90), 50, 100);
      const dcRatio = clamp(pickNumber(scenario.fastChargingRatio, state.fast_charge_ratio_pct, 20), 0, 100);
      const annualDist = Math.max(0, pickNumber(scenario.annualMileage, state.annual_mileage_km, 12000));

      const annualLoss = annualDegradation({
        profile, tempC: temp, chargeLimitPct: limit, dcPct: dcRatio, annualDistKm: annualDist,
      }).totalAnnualLoss;

      const curve = [];
      let soh = startSoh;
      for (let y = 0; y <= 10; y++) {
        curve.push({
          year: y,
          soh: Number(soh.toFixed(1)),
          capacity: Number((profile.battery_capacity * (soh / 100)).toFixed(1)),
        });
        soh = Math.max(40, soh - annualLoss);
      }

      const yearsTo70 = annualLoss > 0 ? Math.max(0, startSoh - 70) / annualLoss : 100;
      return {
        curve,
        annualLoss: Number(annualLoss.toFixed(2)),
        yearsTo70: Number(yearsTo70.toFixed(1)),
        kmTo70: Math.round(yearsTo70 * annualDist),
      };
    };

    const resultA = buildCurve(scenarioA);
    const resultB = buildCurve(scenarioB);

    const result = {
      profile_id,
      vehicleModel: profile.vehicle_model,
      startSoh: Number(startSoh.toFixed(1)),
      sohBasis,
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
