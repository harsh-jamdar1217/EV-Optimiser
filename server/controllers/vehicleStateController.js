const { supabase } = require('../db');
const { EMPTY_STATE, loadState, saveState, validatePatch } = require('../services/vehicleState');

async function profileExists(id) {
  const { data, error } = await supabase.from('ev_profiles').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  return !!data;
}

function parseId(req) {
  const id = Number(req.params.profile_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/vehicle-state/:profile_id
exports.getVehicleState = async (req, res) => {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ ok: false, message: 'Invalid profile_id.' });
    if (!(await profileExists(id))) return res.status(404).json({ ok: false, message: 'Profile not found.' });

    const state = await loadState(id);
    return res.json({ ok: true, state });
  } catch (err) {
    console.error('getVehicleState error:', err);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
};

// PUT /api/vehicle-state/:profile_id   (partial update; null clears a field)
exports.updateVehicleState = async (req, res) => {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ ok: false, message: 'Invalid profile_id.' });

    const { patch, error } = validatePatch(req.body);
    if (error) return res.status(400).json({ ok: false, message: error });

    if (!(await profileExists(id))) return res.status(404).json({ ok: false, message: 'Profile not found.' });

    const state = await saveState(id, patch);
    return res.json({ ok: true, state });
  } catch (err) {
    console.error('updateVehicleState error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Could not save vehicle state. Has migrations/001_vehicle_state.sql been run?',
    });
  }
};

// DELETE /api/vehicle-state/:profile_id   (reset to "nothing saved")
exports.resetVehicleState = async (req, res) => {
  try {
    const id = parseId(req);
    if (!id) return res.status(400).json({ ok: false, message: 'Invalid profile_id.' });

    const { error } = await supabase.from('vehicle_state').delete().eq('profile_id', id);
    if (error) throw error;
    return res.json({ ok: true, state: { ...EMPTY_STATE } });
  } catch (err) {
    console.error('resetVehicleState error:', err);
    return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
  }
};
