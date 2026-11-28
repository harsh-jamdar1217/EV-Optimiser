const { supabase } = require('../db');
const { saveState } = require('../services/vehicleState');
const { isLfp: isLfpProfile, chemistryLabel } = require('../services/evModel');

exports.assessHealth = async (req, res) => {
  try {
    const {
      profile_id,
      cycle_count = 150,
      max_cell_voltage = 4.18,
      min_cell_voltage = 4.15,
      internal_resistance_mohm = 12,
      operating_temp = 28,
      save_to_db = false
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

    const cycleCount = Math.max(0, Number(cycle_count));
    const maxV = Math.max(2.5, Math.min(4.5, Number(max_cell_voltage)));
    const minV = Math.max(2.0, Math.min(maxV, Number(min_cell_voltage)));
    const resistance = Math.max(0, Number(internal_resistance_mohm));
    const temp = Number(operating_temp);

    // 1. Voltage Deviation (Cell Imbalance)
    const voltageDeviation = maxV - minV;

    // 2. Battery Chemistry Profile
    const isLfp = isLfpProfile(profile);
    const chemistry = chemistryLabel(profile);

    // 3. SOH Calculation
    // Cycle wear deduction: LFP is more durable (0.003% SOH per cycle), NMC is less (0.0065% SOH per cycle)
    const cycleDeduction = cycleCount * (isLfp ? 0.003 : 0.0065);

    // Cell resistance deduction: nominal is < 15 mohm
    const resistanceDeduction = resistance > 15 ? (resistance - 15) * 0.45 : 0;

    // Cell voltage deviation imbalance deduction (voltage delta drops SOH)
    const imbalanceDeduction = voltageDeviation * 25;

    // Thermal degradation deduction: temperatures above 40C cause accelerated wear
    const tempDeduction = temp > 40 ? (temp - 40) * 0.25 : 0;

    // Calculate final State of Health (SOH)
    const soh = Math.max(40, Math.min(100, 100 - cycleDeduction - resistanceDeduction - imbalanceDeduction - tempDeduction));

    // 4. Threshold Statuses
    let sohStatus = 'Optimal';
    if (soh < 70) sohStatus = 'Critical';
    else if (soh < 80) sohStatus = 'Degraded';
    else if (soh < 90) sohStatus = 'Good';

    let cellBalanceStatus = 'Excellent';
    if (voltageDeviation > 0.04) cellBalanceStatus = 'Severe Imbalance';
    else if (voltageDeviation > 0.015) cellBalanceStatus = 'Slight Imbalance';

    let impedanceStatus = 'Nominal';
    if (resistance > 25) impedanceStatus = 'High';
    else if (resistance > 15) impedanceStatus = 'Moderate';

    let thermalStatus = 'Optimal';
    if (temp < 10) thermalStatus = 'Cold';
    else if (temp > 45) thermalStatus = 'Hot';
    else if (temp > 35) thermalStatus = 'Warm';

    // 5. Diagnostic Health Score (0-100)
    let healthScore = (soh * 0.6) + 
                      (100 - Math.min(100, voltageDeviation * 800)) * 0.25 + 
                      (100 - Math.min(100, Math.max(0, resistance - 10) * 2.5)) * 0.15;
    healthScore = Math.round(Math.max(10, Math.min(100, healthScore)));

    const resultData = {
      cycleCount,
      maxCellVoltage: Number(maxV.toFixed(2)),
      minCellVoltage: Number(minV.toFixed(2)),
      voltageDeviation: Number(voltageDeviation.toFixed(3)),
      internalResistance: resistance,
      operatingTemp: temp,
      soh: Number(soh.toFixed(1)),
      sohStatus,
      cellBalanceStatus,
      impedanceStatus,
      thermalStatus,
      healthScore,
      chemistry
    };

    let analysisData = null;
    let stateUpdated = false;
    let stateWarning = null;
    if (save_to_db === true || save_to_db === 'true') {
      const { data, error } = await supabase
        .from('analysis_results')
        .insert([{
          profile_id: profile.id,
          analysis_type: 'health',
          result_json: resultData
        }])
        .select()
        .single();

      if (error) {
        throw error;
      }
      analysisData = data;

      // Publish this SOH as the vehicle's current SOH so Range, Charging,
      // Degradation, Performance and Digital Twin all use the same value.
      try {
        await saveState(profile.id, {
          soh_pct: Number(soh.toFixed(1)),
          soh_source: 'health_assessment',
          soh_updated_at: new Date().toISOString(),
        });
        stateUpdated = true;
      } catch (stateErr) {
        console.error('Could not update vehicle_state from health assessment:', stateErr);
        stateWarning = 'Diagnostic saved, but the shared SOH could not be updated (is vehicle_state migrated?).';
      }
    }

    return res.json({
      ok: true,
      data: {
        profile_id: profile.id,
        vehicleModel: profile.vehicle_model,
        cycleCount,
        maxCellVoltage: Number(maxV.toFixed(2)),
        minCellVoltage: Number(minV.toFixed(2)),
        voltageDeviation: Number(voltageDeviation.toFixed(3)),
        internalResistance: resistance,
        operatingTemp: temp,
        soh: Number(soh.toFixed(1)),
        sohStatus,
        cellBalanceStatus,
        impedanceStatus,
        thermalStatus,
        healthScore,
        chemistry,
        analysis: analysisData,
        sharedSohUpdated: stateUpdated,
        warning: stateWarning
      }
    });

  } catch (error) {
    console.error("battery health diagnosis calculation error:", error);
    return res.status(500).json({ ok: false, message: 'Server error computing health assessment.' });
  }
};

exports.getHealthHistory = async (req, res) => {
  try {
    const profile_id = Number(req.params.profile_id);
    if (!Number.isInteger(profile_id)) {
      return res.status(400).json({ ok: false, message: 'Invalid profile_id parameter.' });
    }

    const { data, error } = await supabase
      .from('analysis_results')
      .select('*')
      .eq('profile_id', profile_id)
      .eq('analysis_type', 'health')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({
      ok: true,
      history: data
    });
  } catch (err) {
    console.error("getHealthHistory error:", err);
    return res.status(500).json({ ok: false, message: 'Server error retrieving diagnostic history.' });
  }
};
