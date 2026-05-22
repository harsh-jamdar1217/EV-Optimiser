const { supabase } = require('../db');

exports.getDegradationForecast = async (req, res) => {
  try {
    const {
      profile_id,
      current_odometer = 20000,
      annual_mileage = 12000,
      fast_charging_ratio = 20,
      avg_charging_limit = 90,
      avg_temperature = 25
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

    const odometer = Math.max(0, Number(current_odometer));
    const annualDist = Math.max(0, Number(annual_mileage));
    const dcRatio = Math.max(0, Math.min(100, Number(fast_charging_ratio)));
    const chargeLimit = Math.max(50, Math.min(100, Number(avg_charging_limit)));
    const temp = Number(avg_temperature);

    // Chemistry proxy (LFP vs NMC)
    const modelLower = profile.vehicle_model.toLowerCase();
    const isLFP = modelLower.includes('lfp') || modelLower.includes('nexon ev max') || profile.battery_capacity <= 30;
    const baseCycleLife = isLFP ? 3200 : 1800; // LFP lasts significantly longer
    const calendarSensitivityToHighSoc = isLFP ? 0.25 : 1.0; // LFP is highly resistant to calendar aging at high SOC

    // Average consumption (kWh/100km)
    const consumptionRate = (profile.vehicle_weight / 100) * 0.8 + (profile.motor_power / 20);

    // Helpers for annual degradation calculations
    const calculateAnnualDegradation = (t, limit, dcPct) => {
      // 1. Calendar wear factor (Arrhenius-style temperature wear + high SOC stress)
      const tempFactor = Math.max(0.15, Math.min(8.0, Math.exp((t - 20) / 12)));
      const socFactor = 1.0 + Math.pow(Math.max(0, limit - 70) / 30, 1.6) * 0.7 * calendarSensitivityToHighSoc;
      const annualCalendarLoss = 1.25 * tempFactor * socFactor; // base calendar loss per year

      // 2. Cyclic wear factor (mileage throughput equivalent full cycles + DC fast charge stress)
      const annualKwhThroughput = (annualDist / 100) * consumptionRate;
      const cyclesPerYear = annualKwhThroughput / profile.battery_capacity;
      const dcMultiplier = 1.0 + (dcPct / 100) * 1.6;
      const annualCyclicLoss = cyclesPerYear * (20.0 / baseCycleLife) * dcMultiplier; // base cyclic wear per year

      return {
        annualCalendarLoss,
        annualCyclicLoss,
        totalAnnualLoss: annualCalendarLoss + annualCyclicLoss
      };
    };

    // Calculate current State of Health (SOH) based on past mileage and age
    const currentAgeYears = Math.max(0.5, new Date().getFullYear() - profile.manufacturing_year);
    const pastCycles = ((odometer / 100) * consumptionRate) / profile.battery_capacity;
    
    // Past degradation parameters (based on user inputs)
    const currentRates = calculateAnnualDegradation(temp, chargeLimit, dcRatio);
    const pastCalendarWear = currentAgeYears * currentRates.annualCalendarLoss;
    const pastCyclicWear = pastCycles * (20.0 / baseCycleLife) * (1.0 + (dcRatio / 100) * 1.6);
    
    // Start SOH
    const currentSOH = Math.max(50, Math.min(100, 100 - pastCalendarWear - pastCyclicWear));
    const remainingCapacityKwh = profile.battery_capacity * (currentSOH / 100);

    // Future 10-Year Projections
    const baselineSohCurve = [];
    const optimizedSohCurve = [];

    // Current inputs aging rate
    const baselineAnnualLoss = currentRates.totalAnnualLoss;

    // Optimized aging parameters
    const optTemp = Math.min(22, temp);
    const optLimit = 80;
    const optDcPct = Math.min(10, dcRatio * 0.25);
    const optimizedRates = calculateAnnualDegradation(optTemp, optLimit, optDcPct);
    const optimizedAnnualLoss = optimizedRates.totalAnnualLoss;

    // Build the curves (Year 0 to 10)
    let tempBaselineSoh = currentSOH;
    let tempOptimizedSoh = currentSOH;

    baselineSohCurve.push({
      year: 0,
      soh: Number(tempBaselineSoh.toFixed(1)),
      capacity: Number((profile.battery_capacity * (tempBaselineSoh / 100)).toFixed(1))
    });

    optimizedSohCurve.push({
      year: 0,
      soh: Number(tempOptimizedSoh.toFixed(1)),
      capacity: Number((profile.battery_capacity * (tempOptimizedSoh / 100)).toFixed(1))
    });

    for (let y = 1; y <= 10; y++) {
      tempBaselineSoh = Math.max(40, tempBaselineSoh - baselineAnnualLoss);
      tempOptimizedSoh = Math.max(40, tempOptimizedSoh - optimizedAnnualLoss);

      baselineSohCurve.push({
        year: y,
        soh: Number(tempBaselineSoh.toFixed(1)),
        capacity: Number((profile.battery_capacity * (tempBaselineSoh / 100)).toFixed(1))
      });

      optimizedSohCurve.push({
        year: y,
        soh: Number(tempOptimizedSoh.toFixed(1)),
        capacity: Number((profile.battery_capacity * (tempOptimizedSoh / 100)).toFixed(1))
      });
    }

    // Lifespan estimation (years until SOH hits 70% threshold)
    const sohLossRemaining = Math.max(0, currentSOH - 70);
    
    const yearsRemainingBaseline = baselineAnnualLoss > 0 ? (sohLossRemaining / baselineAnnualLoss) : 100;
    const kmRemainingBaseline = yearsRemainingBaseline * annualDist;

    const yearsRemainingOptimized = optimizedAnnualLoss > 0 ? (sohLossRemaining / optimizedAnnualLoss) : 100;
    const kmRemainingOptimized = yearsRemainingOptimized * annualDist;

    return res.json({
      ok: true,
      data: {
        profile_id,
        chemistry: isLFP ? 'LFP (Lithium Iron Phosphate)' : 'NMC (Nickel Manganese Cobalt)',
        currentSOH: Number(currentSOH.toFixed(1)),
        remainingCapacityKwh: Number(remainingCapacityKwh.toFixed(1)),
        baselineSohCurve,
        optimizedSohCurve,
        baselineLifespan: {
          years: Number(yearsRemainingBaseline.toFixed(1)),
          km: Math.round(kmRemainingBaseline)
        },
        optimizedLifespan: {
          years: Number(yearsRemainingOptimized.toFixed(1)),
          km: Math.round(kmRemainingOptimized)
        },
        annualSavingsYears: Number((yearsRemainingOptimized - yearsRemainingBaseline).toFixed(1)),
        baselineAnnualLoss: Number(baselineAnnualLoss.toFixed(2)),
        optimizedAnnualLoss: Number(optimizedAnnualLoss.toFixed(2))
      }
    });

  } catch (error) {
    console.error("degradation forecast error:", error);
    return res.status(500).json({ ok: false, message: 'Server error computing degradation forecast.' });
  }
};
