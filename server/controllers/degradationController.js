const { supabase } = require('../db');
const { loadState, saveState, pickNumber } = require('../services/vehicleState');
const {
  clamp,
  chemistryLabel,
  annualDegradation,
  estimateCurrentSoh,
} = require('../services/evModel');

exports.getDegradationForecast = async (req, res) => {
  try {
    const { profile_id } = req.body;

    if (!profile_id) {
      return res.status(400).json({ ok: false, message: 'Active EV profile ID is required.' });
    }

    // Fetch EV Profile from database
    const { data: profile, error: profileError } = await supabase
      .from('ev_profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ ok: false, message: 'EV profile not found in database.' });
    }

    // Shared vehicle state: request value > saved state > default
    const state = await loadState(profile_id);
    const odometer = Math.max(0, pickNumber(req.body.current_odometer, state.odometer_km, 20000));
    const annualDist = Math.max(0, pickNumber(req.body.annual_mileage, state.annual_mileage_km, 12000));
    const dcRatio = clamp(pickNumber(req.body.fast_charging_ratio, state.fast_charge_ratio_pct, 20), 0, 100);
    const chargeLimit = clamp(pickNumber(req.body.avg_charging_limit, state.charge_limit_pct, 90), 50, 100);
    const temp = pickNumber(req.body.avg_temperature, state.ambient_temp_c, 25);

    const currentRates = annualDegradation({
      profile, tempC: temp, chargeLimitPct: chargeLimit, dcPct: dcRatio, annualDistKm: annualDist,
    });

    // Starting SOH, in order of trust:
    //  1) explicit value in the request
    //  2) a SOH saved from a health assessment (or entered manually)
    //  3) the age + mileage model (also what Digital Twin uses)
    let currentSOH;
    let sohBasis;
    if (req.body.current_soh !== undefined && req.body.current_soh !== null && req.body.current_soh !== '') {
      currentSOH = clamp(Number(req.body.current_soh), 40, 100);
      sohBasis = 'request';
    } else if (state.soh_pct !== null && state.soh_source !== 'degradation_forecast') {
      currentSOH = Number(state.soh_pct);
      sohBasis = state.soh_source; // 'health_assessment' | 'manual'
    } else {
      currentSOH = estimateCurrentSoh({
        profile, odometerKm: odometer, tempC: temp, chargeLimitPct: chargeLimit, dcPct: dcRatio, annualDistKm: annualDist,
      }).soh;
      sohBasis = 'age_and_odometer_model';
    }
    const remainingCapacityKwh = profile.battery_capacity * (currentSOH / 100);

    // Optimized aging parameters
    const optTemp = Math.min(22, temp);
    const optLimit = 80;
    const optDcPct = Math.min(10, dcRatio * 0.25);
    const optimizedRates = annualDegradation({
      profile, tempC: optTemp, chargeLimitPct: optLimit, dcPct: optDcPct, annualDistKm: annualDist,
    });

    const baselineAnnualLoss = currentRates.totalAnnualLoss;
    const optimizedAnnualLoss = optimizedRates.totalAnnualLoss;

    // Build the curves (Year 0 to 10)
    const point = (year, soh) => ({
      year,
      soh: Number(soh.toFixed(1)),
      capacity: Number((profile.battery_capacity * (soh / 100)).toFixed(1)),
    });
    const baselineSohCurve = [point(0, currentSOH)];
    const optimizedSohCurve = [point(0, currentSOH)];
    let baseSoh = currentSOH;
    let optSoh = currentSOH;
    for (let y = 1; y <= 10; y++) {
      baseSoh = Math.max(40, baseSoh - baselineAnnualLoss);
      optSoh = Math.max(40, optSoh - optimizedAnnualLoss);
      baselineSohCurve.push(point(y, baseSoh));
      optimizedSohCurve.push(point(y, optSoh));
    }

    // Lifespan estimation (years until SOH hits 70% threshold)
    const sohLossRemaining = Math.max(0, currentSOH - 70);
    const yearsRemainingBaseline = baselineAnnualLoss > 0 ? sohLossRemaining / baselineAnnualLoss : 100;
    const yearsRemainingOptimized = optimizedAnnualLoss > 0 ? sohLossRemaining / optimizedAnnualLoss : 100;

    // Optional: publish the model estimate as the shared SOH. Never overwrites a
    // SOH that came from a health assessment or was entered manually.
    let sharedSohUpdated = false;
    let sharedSohNote = null;
    if (req.body.save_to_state === true || req.body.save_to_state === 'true') {
      if (sohBasis !== 'age_and_odometer_model') {
        sharedSohNote = 'Shared SOH left unchanged: forecast started from a measured/entered SOH.';
      } else {
        try {
          await saveState(profile.id, {
            soh_pct: Number(currentSOH.toFixed(1)),
            soh_source: 'degradation_forecast',
            soh_updated_at: new Date().toISOString(),
          });
          sharedSohUpdated = true;
        } catch (stateErr) {
          console.error('Could not update vehicle_state from degradation forecast:', stateErr);
          sharedSohNote = 'Could not save shared SOH (is vehicle_state migrated?).';
        }
      }
    }

    return res.json({
      ok: true,
      data: {
        profile_id,
        chemistry: chemistryLabel(profile),
        currentSOH: Number(currentSOH.toFixed(1)),
        sohBasis,
        remainingCapacityKwh: Number(remainingCapacityKwh.toFixed(1)),
        baselineSohCurve,
        optimizedSohCurve,
        baselineLifespan: {
          years: Number(yearsRemainingBaseline.toFixed(1)),
          km: Math.round(yearsRemainingBaseline * annualDist),
        },
        optimizedLifespan: {
          years: Number(yearsRemainingOptimized.toFixed(1)),
          km: Math.round(yearsRemainingOptimized * annualDist),
        },
        annualSavingsYears: Number((yearsRemainingOptimized - yearsRemainingBaseline).toFixed(1)),
        baselineAnnualLoss: Number(baselineAnnualLoss.toFixed(2)),
        optimizedAnnualLoss: Number(optimizedAnnualLoss.toFixed(2)),
        sharedSohUpdated,
        sharedSohNote,
      },
    });
  } catch (error) {
    console.error('degradation forecast error:', error);
    return res.status(500).json({ ok: false, message: 'Server error computing degradation forecast.' });
  }
};
