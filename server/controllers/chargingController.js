const { supabase } = require('../db');

exports.getChargingAdvice = async (req, res) => {
  try {
    const {
      profile_id,
      current_soc = 20,
      target_soc = 80,
      charger_type = 'AC Fast',
      charger_power,
      start_hour = 22,
      temperature = 25,
      peakRate = 0.32,
      offPeakRate = 0.09,
      midPeakRate = 0.16
    } = req.body;

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

    const startSOC = Number(current_soc);
    const endSOC = Number(target_soc);
    const temp = Number(temperature);
    const startHourVal = Number(start_hour);

    if (startSOC < 0 || startSOC > 100 || endSOC < 0 || endSOC > 100) {
      return res.status(400).json({ ok: false, message: 'SOC values must be between 0 and 100.' });
    }

    if (startSOC >= endSOC) {
      return res.status(400).json({ ok: false, message: 'Target SOC must be greater than current SOC.' });
    }

    // Charger power defaults
    let basePower = Number(charger_power);
    if (!basePower || basePower <= 0) {
      if (charger_type === 'AC Slow') basePower = 3.3;
      else if (charger_type === 'AC Fast') basePower = 11;
      else if (charger_type === 'DC Fast') basePower = 50;
      else basePower = 7.4;
    }

    // Time-of-Use Rates Helper
    const getTariffRate = (hour) => {
      const h = hour % 24;
      // Peak Hours: 2:00 PM to 8:00 PM (14 to 20)
      if (h >= 14 && h < 20) {
        return Number(peakRate);
      }
      // Off-Peak Hours: 10:00 PM to 6:00 AM (22 to 24, 0 to 6)
      if (h >= 22 || h < 6) {
        return Number(offPeakRate);
      }
      // Mid-Peak Hours: all other times
      return Number(midPeakRate);
    };

    // Session simulator
    const simulateCharge = (initialSoc, finalSoc, startingHour) => {
      let currentSOC = initialSoc;
      let minutesElapsed = 0;
      let totalCost = 0;
      let totalGridEnergy = 0;
      let totalEnergyStored = 0;
      const simCurve = [];

      const efficiency = charger_type === 'DC Fast' ? 0.95 : 0.90;
      const dt = 1; // 1-minute steps

      // Initial state
      simCurve.push({
        time: 0,
        soc: Math.round(currentSOC),
        power: 0,
        cost: 0
      });

      while (currentSOC < finalSoc) {
        const simHour = (startingHour + (minutesElapsed / 60)) % 24;
        const currentRate = getTariffRate(Math.floor(simHour));

        let powerAtStep = basePower;

        // Apply charging taper curves
        if (charger_type === 'DC Fast') {
          // Cap DC power based on battery capacity (C-rate cap to protect small battery packs)
          const maxVehicleDcAcceptance = Math.min(150, profile.battery_capacity * 1.8);
          powerAtStep = Math.min(powerAtStep, maxVehicleDcAcceptance);

          if (currentSOC > 50 && currentSOC <= 80) {
            // Linear taper from 100% to 40%
            const factor = 1.0 - ((currentSOC - 50) / 30) * 0.6;
            powerAtStep = powerAtStep * factor;
          } else if (currentSOC > 80) {
            // Steep taper from 40% to 12%
            const factor = 0.4 - ((currentSOC - 80) / 20) * 0.28;
            powerAtStep = powerAtStep * factor;
          }
        } else {
          // AC slow/fast chargers taper only at the very end
          if (currentSOC > 95) {
            const factor = 1.0 - ((currentSOC - 95) / 5) * 0.8; // tapers to 20%
            powerAtStep = powerAtStep * factor;
          }
        }

        // Apply ambient temperature throttling
        let tempFactor = 1.0;
        if (temp < 5) {
          // Cold temperature reduces lithium ion mobility
          tempFactor = 1.0 - Math.max(0, (5 - temp) * 0.04);
          tempFactor = Math.max(0.3, tempFactor);
        } else if (temp > 38) {
          // Hot temperature triggers thermal throttling to prevent degradation
          tempFactor = 1.0 - Math.max(0, (temp - 38) * 0.035);
          tempFactor = Math.max(0.5, tempFactor);
        }

        // AC charging is much less sensitive to ambient temperature throttling
        const tempSensitivity = charger_type === 'DC Fast' ? 1.0 : 0.2;
        const adjustedPower = powerAtStep * (1.0 - (1.0 - tempFactor) * tempSensitivity);
        const actualPower = Math.max(0.5, adjustedPower); // Safety floor

        // Calculate energy added this step
        const energyAdded = actualPower * (dt / 60); // kWh
        const socAdded = (energyAdded / profile.battery_capacity) * 100;

        currentSOC = Math.min(finalSoc, currentSOC + socAdded);
        minutesElapsed += dt;

        const gridEnergyStep = energyAdded / efficiency;
        totalGridEnergy += gridEnergyStep;
        totalEnergyStored += energyAdded;

        const costStep = gridEnergyStep * currentRate;
        totalCost += costStep;

        // Sample every 5 minutes or at completion
        if (minutesElapsed % 5 === 0 || currentSOC >= finalSoc) {
          simCurve.push({
            time: minutesElapsed,
            soc: Number(currentSOC.toFixed(1)),
            power: Number(actualPower.toFixed(1)),
            cost: Number(totalCost.toFixed(2))
          });
        }
      }

      const avgPower = minutesElapsed > 0 ? (totalEnergyStored / (minutesElapsed / 60)) : 0;

      return {
        totalChargingTimeMins: minutesElapsed,
        totalCost: Number(totalCost.toFixed(2)),
        gridEnergyKwh: Number(totalGridEnergy.toFixed(2)),
        averagePowerKw: Number(avgPower.toFixed(1)),
        simCurve
      };
    };

    // Calculate primary charging session results
    const results = simulateCharge(startSOC, endSOC, startHourVal);

    // Calculate 24-hour cost optimization curve (start hour vs total cost)
    const costOptimizationCurve = [];
    for (let h = 0; h < 24; h++) {
      const sim = simulateCharge(startSOC, endSOC, h);
      costOptimizationCurve.push({
        startHour: h,
        totalCost: sim.totalCost,
        totalChargingTimeMins: sim.totalChargingTimeMins
      });
    }

    // Identify cheapest start hour
    let cheapestHour = startHourVal;
    let minCost = Infinity;
    costOptimizationCurve.forEach((item) => {
      if (item.totalCost < minCost) {
        minCost = item.totalCost;
        cheapestHour = item.startHour;
      }
    });

    return res.json({
      ok: true,
      data: {
        profile_id,
        current_soc: startSOC,
        target_soc: endSOC,
        charger_type,
        charger_power: basePower,
        start_hour: startHourVal,
        temperature: temp,
        totalChargingTimeMins: results.totalChargingTimeMins,
        totalCost: results.totalCost,
        gridEnergyKwh: results.gridEnergyKwh,
        averagePowerKw: results.averagePowerKw,
        simCurve: results.simCurve,
        costOptimizationCurve,
        cheapestHour,
        minCost
      }
    });

  } catch (error) {
    console.error("charging advice optimization error:", error);
    return res.status(500).json({ ok: false, message: 'Server error computing charging optimization.' });
  }
};
