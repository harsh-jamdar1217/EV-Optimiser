const { supabase } = require('../db');

const CHARGING_TYPES = ['AC Slow', 'AC Fast', 'DC Fast'];
const CURRENT_YEAR = new Date().getFullYear();

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  return missing;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function chargingTypeToDbValue(value) {
  const map = {
    AC_SLOW: 'AC Slow',
    AC_FAST: 'AC Fast',
    DC_FAST: 'DC Fast',
    'AC Slow': 'AC Slow',
    'AC Fast': 'AC Fast',
    'DC Fast': 'DC Fast',
  };

  return map[value] || null;
}

function validateProfilePayload(body) {
  const required = [
    'vehicle_model',
    'battery_capacity',
    'motor_power',
    'vehicle_weight',
    'charging_type',
    'manufacturing_year',
  ];

  const missing = requireFields(body || {}, required);
  if (missing.length) {
    return {
      error: `Missing required fields: ${missing.join(', ')}`,
    };
  }

  const payload = {
    vehicle_model: String(body.vehicle_model).trim(),
    battery_capacity: toNumberOrNull(body.battery_capacity),
    motor_power: toNumberOrNull(body.motor_power),
    vehicle_weight: toNumberOrNull(body.vehicle_weight),
    charging_type: chargingTypeToDbValue(body.charging_type),
    manufacturing_year: toNumberOrNull(body.manufacturing_year),
  };

  if (!payload.vehicle_model || payload.vehicle_model.length > 100) {
    return { error: 'Vehicle model is required and must be 100 characters or fewer.' };
  }

  if (payload.battery_capacity === null || payload.battery_capacity <= 0 || payload.battery_capacity > 250) {
    return { error: 'Battery capacity must be a positive number up to 250 kWh.' };
  }

  if (payload.motor_power === null || payload.motor_power <= 0 || payload.motor_power > 1500) {
    return { error: 'Motor power must be a positive number up to 1500 kW.' };
  }

  if (payload.vehicle_weight === null || payload.vehicle_weight < 500 || payload.vehicle_weight > 5000) {
    return { error: 'Vehicle weight must be between 500 kg and 5000 kg.' };
  }

  if (!CHARGING_TYPES.includes(payload.charging_type)) {
    return { error: 'Charging type must be AC Slow, AC Fast, or DC Fast.' };
  }

  if (
    payload.manufacturing_year === null ||
    !Number.isInteger(payload.manufacturing_year) ||
    payload.manufacturing_year < 1990 ||
    payload.manufacturing_year > CURRENT_YEAR + 1
  ) {
    return { error: `Manufacturing year must be an integer between 1990 and ${CURRENT_YEAR + 1}.` };
  }

  return { payload };
}

function sendServerError(res, err, label) {
  console.error(`${label}:`, err);
  return res.status(500).json({ ok: false, message: 'Server error. Please try again.' });
}

exports.createProfile = async (req, res) => {
  try {
    const { payload, error } = validateProfilePayload(req.body);
    if (error) return res.status(400).json({ ok: false, message: error });

    const { data, error: sbError } = await supabase
      .from('ev_profiles')
      .insert([payload])
      .select()
      .single();

    if (sbError) throw sbError;

    return res.status(201).json({ ok: true, profile: data });
  } catch (err) {
    return sendServerError(res, err, 'createProfile error');
  }
};

exports.getAllProfiles = async (_req, res) => {
  try {
    const { data, error: sbError } = await supabase
      .from('ev_profiles')
      .select('*')
      .order('id', { ascending: false });

    if (sbError) throw sbError;

    return res.json({ ok: true, profiles: data });
  } catch (err) {
    return sendServerError(res, err, 'getAllProfiles error');
  }
};

exports.getProfileById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, message: 'Invalid id' });
    }

    const { data, error: sbError } = await supabase
      .from('ev_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (sbError) {
      if (sbError.code === 'PGRST116') {
        return res.status(404).json({ ok: false, message: 'Profile not found' });
      }
      throw sbError;
    }

    return res.json({ ok: true, profile: data });
  } catch (err) {
    return sendServerError(res, err, 'getProfileById error');
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, message: 'Invalid id' });
    }

    const { payload, error } = validateProfilePayload(req.body);
    if (error) return res.status(400).json({ ok: false, message: error });

    const { data, error: sbError } = await supabase
      .from('ev_profiles')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (sbError) {
      if (sbError.code === 'PGRST116') {
        return res.status(404).json({ ok: false, message: 'Profile not found' });
      }
      throw sbError;
    }

    return res.json({ ok: true, profile: data });
  } catch (err) {
    return sendServerError(res, err, 'updateProfile error');
  }
};

exports.deleteProfile = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, message: 'Invalid id' });
    }

    const { error: sbError, count } = await supabase
      .from('ev_profiles')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (sbError) throw sbError;
    if (count === 0) {
      return res.status(404).json({ ok: false, message: 'Profile not found' });
    }

    return res.json({ ok: true, deletedId: id });
  } catch (err) {
    return sendServerError(res, err, 'deleteProfile error');
  }
};
