const { supabase } = require('../db');
const { loadState, pickNumber } = require('../services/vehicleState');
const { consumptionKwhPer100km, usableCapacityKwh, effectiveSohPct } = require('../services/evModel');

exports.estimateRange = async (req, res) => {
  try {
    const { profile_id, soc = 100, hvac = false, driving_style = 'Normal', speed = 60 } = req.body;

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
    const temp = pickNumber(req.body.temperature, state.ambient_temp_c, 25);
    const usableKwh = usableCapacityKwh(profile, state.soh_pct);

    const currentSOC = Number(soc);
    const avgSpeed = Number(speed);
    const isHvacOn = hvac === true || hvac === 'true';

    const consumption = (s, t, hvacOn, style) =>
      consumptionKwhPer100km({ profile, speedKmh: s, temperatureC: t, hvac: hvacOn, style });
    const rangeFor = (cons) => (usableKwh * (currentSOC / 100)) / cons * 100;

    const energyConsumption = consumption(avgSpeed, temp, isHvacOn, driving_style);
    const estimatedRange = rangeFor(energyConsumption);

    // Temperature impact curve (speed, style, hvac held constant)
    const temperatureCurve = [-20, -10, 0, 10, 20, 30, 40, 50].map((t) => {
      const cons = consumption(avgSpeed, t, isHvacOn, driving_style);
      return { temp: t, range: Math.round(rangeFor(cons)), consumption: Number(cons.toFixed(2)) };
    });

    // Speed impact curve (temperature, style, hvac held constant)
    const speedCurve = [20, 40, 60, 80, 100, 120, 140].map((s) => {
      const cons = consumption(s, temp, isHvacOn, driving_style);
      return { speed: s, range: Math.round(rangeFor(cons)), consumption: Number(cons.toFixed(2)) };
    });

    // Delta against a standard 25C, no HVAC, Normal driving
    const normalCons = consumption(avgSpeed, 25, false, 'Normal');
    const tempImpactPct = Math.round(((energyConsumption - normalCons) / normalCons) * 100);

    return res.json({
      ok: true,
      data: {
        profile_id,
        soc: currentSOC,
        temperature: temp,
        hvac: isHvacOn,
        driving_style,
        speed: avgSpeed,
        estimatedRange: Math.round(estimatedRange),
        energyConsumption: Number(energyConsumption.toFixed(2)),
        tempImpactPct,
        temperatureCurve,
        speedCurve,
        // Which shared values were applied (new, additive fields)
        sohPct: Number(effectiveSohPct(state.soh_pct).toFixed(1)),
        sohSource: state.soh_source,
        usableCapacityKwh: Number(usableKwh.toFixed(1)),
      },
    });
  } catch (error) {
    console.error('range estimation error:', error);
    return res.status(500).json({ ok: false, message: 'Server error calculating range estimation.' });
  }
};
