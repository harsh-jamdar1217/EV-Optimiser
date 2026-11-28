const { supabase } = require('../db');
const { loadState, pickNumber, blendedTariff } = require('../services/vehicleState');
const { baseConsumptionKwhPer100km } = require('../services/evModel');

exports.getCostComparison = async (req, res) => {
  try {
    const {
      profile_id,
      gasoline_price = 1.20,
      ice_fuel_economy = 7.5,
      charging_efficiency = 90,
      ev_purchase_premium = 6000,
      grid_co2_factor = 0.38
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

    // Shared vehicle state: request value > saved state > default.
    // Saved time-of-use tariffs are blended into one flat rate for the annual view.
    const state = await loadState(profile_id);
    const annual_mileage = pickNumber(req.body.annual_mileage, state.annual_mileage_km, 15000);
    const electricity_rate = pickNumber(req.body.electricity_rate, blendedTariff(state), 0.15);

    const mileage = Math.max(0, Number(annual_mileage));
    const elecRate = Math.max(0, Number(electricity_rate));
    const gasPrice = Math.max(0, Number(gasoline_price));
    const iceEconomy = Math.max(0, Number(ice_fuel_economy));
    const efficiency = Math.max(50, Math.min(100, Number(charging_efficiency)));
    const evPremium = Math.max(0, Number(ev_purchase_premium));
    const co2Factor = Math.max(0, Number(grid_co2_factor));

    // 1. Calculate EV Energy & Cost
    const evConsumptionRate = baseConsumptionKwhPer100km(profile); // kWh/100km
    const annualEvKwh = (mileage / 100) * evConsumptionRate;
    const gridKwhDrawn = annualEvKwh / (efficiency / 100);
    const annualEvFuelCost = gridKwhDrawn * elecRate;
    const annualEvMaintenance = 200; // EV standard maintenance is low
    const annualEvTotalCost = annualEvFuelCost + annualEvMaintenance;

    // 2. Calculate ICE Fuel & Cost
    const annualIceLiters = (mileage / 100) * iceEconomy;
    const annualIceFuelCost = annualIceLiters * gasPrice;
    const annualIceMaintenance = 600; // ICE standard maintenance (fluids, spark plugs, brakes, etc.)
    const annualIceTotalCost = annualIceFuelCost + annualIceMaintenance;

    // 3. Calculate Savings & Per-Km metrics
    const annualSavings = annualIceTotalCost - annualEvTotalCost;
    const monthlySavings = annualSavings / 12;
    const perKmEvCost = mileage > 0 ? (annualEvTotalCost / mileage) : 0;
    const perKmIceCost = mileage > 0 ? (annualIceTotalCost / mileage) : 0;

    // 4. Calculate Amortization/Payback period
    let breakEvenYears = 0;
    let breakEvenMonths = 0;
    if (annualSavings > 0) {
      const totalMonths = Math.round((evPremium / annualSavings) * 12);
      breakEvenYears = Math.floor(totalMonths / 12);
      breakEvenMonths = totalMonths % 12;
    } else {
      breakEvenYears = 99; // Never breaks even
      breakEvenMonths = 0;
    }

    // 5. Environmental CO2 Impact
    const iceCo2Kg = annualIceLiters * 2.31; // 2.31 kg CO2 per liter of gasoline
    const evCo2Kg = gridKwhDrawn * co2Factor;
    const netCo2SavedKg = Math.max(0, iceCo2Kg - evCo2Kg);
    const equivalentTrees = netCo2SavedKg / 22; // 1 tree absorbs ~22 kg CO2 per year

    // 6. Generate 10-Year Cumulative Cost Projection
    const cumulativeCostCurve = [];
    cumulativeCostCurve.push({
      year: 0,
      evCumulativeCost: evPremium,
      iceCumulativeCost: 0
    });

    for (let y = 1; y <= 10; y++) {
      cumulativeCostCurve.push({
        year: y,
        evCumulativeCost: Math.round(evPremium + y * annualEvTotalCost),
        iceCumulativeCost: Math.round(y * annualIceTotalCost)
      });
    }

    return res.json({
      ok: true,
      data: {
        profile_id,
        vehicleModel: profile.vehicle_model,
        evConsumptionRate: Number(evConsumptionRate.toFixed(1)),
        annualEvKwh: Math.round(annualEvKwh),
        gridKwhDrawn: Math.round(gridKwhDrawn),
        annualEvCost: Math.round(annualEvTotalCost),
        annualIceCost: Math.round(annualIceTotalCost),
        annualSavings: Math.round(annualSavings),
        monthlySavings: Math.round(monthlySavings),
        perKmEvCost: Number(perKmEvCost.toFixed(3)),
        perKmIceCost: Number(perKmIceCost.toFixed(3)),
        breakEvenYears,
        breakEvenMonths,
        iceCo2Kg: Math.round(iceCo2Kg),
        evCo2Kg: Math.round(evCo2Kg),
        netCo2SavedKg: Math.round(netCo2SavedKg),
        equivalentTrees: Math.round(equivalentTrees),
        cumulativeCostCurve
      }
    });

  } catch (error) {
    console.error("cost comparison calculation error:", error);
    return res.status(500).json({ ok: false, message: 'Server error computing cost comparison.' });
  }
};
