'use strict';

const { supabase } = require('../db');

/**
 * Per-profile "vehicle state": the few values several modules need to agree on
 * (current SOH, ambient temperature, usage, tariffs). Stored in `vehicle_state`
 * (one row per ev_profile).
 *
 * Precedence used everywhere:  request value  >  saved state  >  built-in default
 * A null column means "not set", so behaviour is unchanged until a value is saved.
 */

const SOH_SOURCES = ['health_assessment', 'degradation_forecast', 'manual'];

// Editable fields and their allowed ranges.
const FIELD_RULES = {
  soh_pct: { min: 40, max: 100 },
  ambient_temp_c: { min: -40, max: 70 },
  odometer_km: { min: 0, max: 1000000 },
  annual_mileage_km: { min: 0, max: 200000 },
  fast_charge_ratio_pct: { min: 0, max: 100 },
  charge_limit_pct: { min: 50, max: 100 },
  tariff_peak: { min: 0, max: 100 },
  tariff_mid: { min: 0, max: 100 },
  tariff_offpeak: { min: 0, max: 100 },
};

const EMPTY_STATE = Object.freeze({
  soh_pct: null,
  soh_source: null,
  soh_updated_at: null,
  ambient_temp_c: null,
  odometer_km: null,
  annual_mileage_km: null,
  fast_charge_ratio_pct: null,
  charge_limit_pct: null,
  tariff_peak: null,
  tariff_mid: null,
  tariff_offpeak: null,
  updated_at: null,
});

// First value that is actually set (not undefined / null / '').
function pick(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// Numeric variant of pick(): returns a finite number or the last fallback.
function pickNumber(requestValue, stateValue, fallback) {
  for (const v of [requestValue, stateValue]) {
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

// Time-of-use tariffs -> one blended rate (6h peak, 10h mid, 8h off-peak).
// Returns null unless all three are saved.
function blendedTariff(state) {
  const { tariff_peak: p, tariff_mid: m, tariff_offpeak: o } = state;
  if (p === null || m === null || o === null) return null;
  return (6 * Number(p) + 10 * Number(m) + 8 * Number(o)) / 24;
}

let warnedMissingTable = false;

/**
 * Never throws. If the table is missing or the query fails, modules keep working
 * with defaults (and we log once so the cause is visible).
 */
async function loadState(profileId) {
  try {
    const { data, error } = await supabase
      .from('vehicle_state')
      .select('*')
      .eq('profile_id', Number(profileId))
      .maybeSingle();

    if (error) throw error;
    return { ...EMPTY_STATE, ...(data || {}) };
  } catch (err) {
    if (!warnedMissingTable) {
      warnedMissingTable = true;
      console.warn(
        'vehicle_state unavailable (did you run migrations/001_vehicle_state.sql?). Using defaults:',
        err && err.message ? err.message : err
      );
    }
    return { ...EMPTY_STATE };
  }
}

/** Upsert already-validated fields. Throws on database errors. */
async function saveState(profileId, patch) {
  const row = { ...patch, profile_id: Number(profileId), updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('vehicle_state')
    .upsert(row, { onConflict: 'profile_id' })
    .select()
    .single();
  if (error) throw error;
  return { ...EMPTY_STATE, ...data };
}

/** Validate a user-supplied patch (PUT /api/vehicle-state/:profile_id). */
function validatePatch(body) {
  const patch = {};
  const src = body || {};

  for (const [field, rule] of Object.entries(FIELD_RULES)) {
    if (!(field in src)) continue;
    const raw = src[field];
    if (raw === null) {
      patch[field] = null; // explicit clear
      continue;
    }
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < rule.min || n > rule.max) {
      return { error: `${field} must be a number between ${rule.min} and ${rule.max} (or null to clear).` };
    }
    patch[field] = n;
  }

  // A SOH entered through the API is a manual value; clearing it clears the source too.
  if ('soh_pct' in patch) {
    if (patch.soh_pct === null) {
      patch.soh_source = null;
      patch.soh_updated_at = null;
    } else {
      patch.soh_source = 'manual';
      patch.soh_updated_at = new Date().toISOString();
    }
  }

  if (Object.keys(patch).length === 0) {
    return { error: `No editable fields supplied. Allowed: ${Object.keys(FIELD_RULES).join(', ')}.` };
  }
  return { patch };
}

module.exports = {
  SOH_SOURCES,
  FIELD_RULES,
  EMPTY_STATE,
  pick,
  pickNumber,
  blendedTariff,
  loadState,
  saveState,
  validatePatch,
};
