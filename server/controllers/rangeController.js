const { supabase } = require('../db');

exports.estimateRange = async (req, res) => {
  try {
    const { profile_id, soc = 100, temperature = 25, hvac = false, driving_style = 'Normal', speed = 60 } = req.body;

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

    const currentSOC = Number(soc);
    const temp = Number(temperature);
    const avgSpeed = Number(speed);
    const isHvacOn = hvac === true || hvac === 'true';

    // Calculate baseline consumption (kWh/100km)
    // Same as performance: (weight / 100) * 0.8 + (power / 20)
    const baseConsumption = (profile.vehicle_weight / 100) * 0.8 + (profile.motor_power / 20);

    // Helper to calculate consumption under specific variables
    const calculateConsumption = (s, t, hvacOn, style) => {
      // Speed multiplier (aerodynamic drag curves)
      let speedMultiplier = 1.0;
      if (s > 90) {
        speedMultiplier = 1.0 + Math.pow((s - 90) / 30, 2) * 0.35;
      } else if (s < 40) {
        speedMultiplier = 1.15 - (s - 20) * 0.0075; // high consumption at very low stop-and-go speeds
      } else {
        speedMultiplier = 0.90 + (s - 40) * 0.002; // optimal sweet spot (40-70 km/h)
      }

      // Temp multiplier (battery chemistry efficiency loss in extremes)
      let tempMultiplier = 1.0;
      if (t < 15) {
        tempMultiplier = 1.0 + Math.max(0, (15 - t) * 0.012); // cold weather resistance overhead
      } else if (t > 35) {
        tempMultiplier = 1.0 + Math.max(0, (t - 35) * 0.008); // high thermal cooling load
      }

      // Driving style multiplier
      let styleMultiplier = 1.0;
      if (style === 'Eco') styleMultiplier = 0.85;
      if (style === 'Sport') styleMultiplier = 1.25;

      // HVAC power overhead (kW)
      let hvacPower = 0;
      if (hvacOn) {
        if (t < 15) {
          hvacPower = Math.min(4.0, 1.0 + (15 - t) * 0.12); // Heat pump / resistive heating
        } else if (t > 28) {
          hvacPower = Math.min(2.5, 0.8 + (t - 28) * 0.08); // A/C compressor
        } else {
          hvacPower = 0.5; // Ventilation fan only
        }
      }

      // HVAC consumption in kWh/100km
      // HVAC consumption = (hvacPower / speed) * 100
      const hvacConsumption = hvacPower > 0 ? (hvacPower / s) * 100 : 0;

      const totalConsumption = (baseConsumption * speedMultiplier * tempMultiplier * styleMultiplier) + hvacConsumption;
      return Math.max(5.0, totalConsumption); // minimum safety cap
    };

    // Calculate primary values
    const energyConsumption = calculateConsumption(avgSpeed, temp, isHvacOn, driving_style);
    const estimatedRange = (profile.battery_capacity * (currentSOC / 100)) / energyConsumption * 100;

    // Generate Temperature impact curve data (holding speed, style, hvac constant)
    const temperatures = [-20, -10, 0, 10, 20, 30, 40, 50];
    const temperatureCurve = temperatures.map((t) => {
      const cons = calculateConsumption(avgSpeed, t, isHvacOn, driving_style);
      const rng = (profile.battery_capacity * (currentSOC / 100)) / cons * 100;
      return {
        temp: t,
        range: Math.round(rng),
        consumption: Number(cons.toFixed(2)),
      };
    });

    // Generate Speed impact curve data (holding temperature, style, hvac constant)
    const speeds = [20, 40, 60, 80, 100, 120, 140];
    const speedCurve = speeds.map((s) => {
      const cons = calculateConsumption(s, temp, isHvacOn, driving_style);
      const rng = (profile.battery_capacity * (currentSOC / 100)) / cons * 100;
      return {
        speed: s,
        range: Math.round(rng),
        consumption: Number(cons.toFixed(2)),
      };
    });

    // Calculate comparison delta against standard 25C, no HVAC, Normal driving
    const normalCons = calculateConsumption(avgSpeed, 25, false, 'Normal');
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
      }
    });

  } catch (error) {
    console.error("range estimation error:", error);
    return res.status(500).json({ ok: false, message: 'Server error calculating range estimation.' });
  }
};
