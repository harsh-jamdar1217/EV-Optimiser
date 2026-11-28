'use strict';

/**
 * Shared EV model.
 *
 * Every controller used to carry its own copy of these formulas. They now live
 * here so the same car + same conditions always give the same number on every
 * page. The constants are heuristic (hand-tuned, not fitted to data) -- treat
 * outputs as estimates until they are replaced by dataset-trained models.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// --- Chemistry ------------------------------------------------------------
// String/capacity heuristic (union of the rules previously duplicated in the
// health, degradation and digital-twin controllers). A real `chemistry` column
// on ev_profiles would be better; until then there is exactly one rule.
function isLfp(profile) {
  const model = String(profile.vehicle_model || '').toLowerCase();
  return (
    Number(profile.battery_capacity) <= 30 ||
    model.includes('lfp') ||
    model.includes('standard range') ||
    model.includes('nexon ev max')
  );
}

function chemistryLabel(profile) {
  return isLfp(profile) ? 'LFP (Lithium Iron Phosphate)' : 'NMC (Nickel Manganese Cobalt)';
}

function baseCycleLife(profile) {
  return isLfp(profile) ? 3200 : 1800;
}

// --- Capacity -------------------------------------------------------------
// Usable energy = nameplate capacity x SOH. sohPct null/undefined => new pack.
function effectiveSohPct(sohPct) {
  const n = Number(sohPct);
  return sohPct === null || sohPct === undefined || !Number.isFinite(n) ? 100 : clamp(n, 40, 100);
}

function usableCapacityKwh(profile, sohPct) {
  return Number(profile.battery_capacity) * (effectiveSohPct(sohPct) / 100);
}

// --- Consumption ----------------------------------------------------------
// Reference consumption (kWh/100 km) from vehicle weight and motor power.
function baseConsumptionKwhPer100km(profile) {
  return (Number(profile.vehicle_weight) / 100) * 0.8 + Number(profile.motor_power) / 20;
}

const STYLE_MULTIPLIER = { Eco: 0.85, Normal: 1.0, Sport: 1.25 };

/**
 * Consumption under specific conditions (kWh/100 km). This is the model the
 * Range page used; Performance now calls it too.
 */
function consumptionKwhPer100km({ profile, speedKmh, temperatureC, hvac = false, style = 'Normal' }) {
  const s = Number(speedKmh);
  const t = Number(temperatureC);

  let speedMultiplier;
  if (s > 90) speedMultiplier = 1.0 + Math.pow((s - 90) / 30, 2) * 0.35;
  else if (s < 40) speedMultiplier = 1.15 - (s - 20) * 0.0075;
  else speedMultiplier = 0.9 + (s - 40) * 0.002;

  let tempMultiplier = 1.0;
  if (t < 15) tempMultiplier = 1.0 + Math.max(0, (15 - t) * 0.012);
  else if (t > 35) tempMultiplier = 1.0 + Math.max(0, (t - 35) * 0.008);

  const styleMultiplier = STYLE_MULTIPLIER[style] ?? 1.0;

  let hvacPowerKw = 0;
  if (hvac) {
    if (t < 15) hvacPowerKw = Math.min(4.0, 1.0 + (15 - t) * 0.12);
    else if (t > 28) hvacPowerKw = Math.min(2.5, 0.8 + (t - 28) * 0.08);
    else hvacPowerKw = 0.5;
  }
  const hvacConsumption = hvacPowerKw > 0 ? (hvacPowerKw / Math.max(s, 1)) * 100 : 0;

  const total =
    baseConsumptionKwhPer100km(profile) * speedMultiplier * tempMultiplier * styleMultiplier + hvacConsumption;
  return Math.max(5.0, total);
}

// --- Degradation ----------------------------------------------------------
// Annual SOH loss (percentage points per year), split into calendar + cyclic.
function annualDegradation({ profile, tempC, chargeLimitPct, dcPct, annualDistKm }) {
  const lfp = isLfp(profile);
  const calendarSensitivityToHighSoc = lfp ? 0.25 : 1.0;

  const tempFactor = clamp(Math.exp((tempC - 20) / 12), 0.15, 8.0);
  const socFactor = 1.0 + Math.pow(Math.max(0, chargeLimitPct - 70) / 30, 1.6) * 0.7 * calendarSensitivityToHighSoc;
  const annualCalendarLoss = 1.25 * tempFactor * socFactor;

  const annualKwhThroughput = (annualDistKm / 100) * baseConsumptionKwhPer100km(profile);
  const cyclesPerYear = annualKwhThroughput / Number(profile.battery_capacity);
  const dcMultiplier = 1.0 + (dcPct / 100) * 1.6;
  const annualCyclicLoss = cyclesPerYear * (20.0 / baseCycleLife(profile)) * dcMultiplier;

  return { annualCalendarLoss, annualCyclicLoss, totalAnnualLoss: annualCalendarLoss + annualCyclicLoss, cyclesPerYear };
}

// Model-based estimate of the pack's current SOH from age and mileage.
function estimateCurrentSoh({ profile, odometerKm, tempC, chargeLimitPct, dcPct, annualDistKm }) {
  const ageYears = Math.max(0.5, new Date().getFullYear() - Number(profile.manufacturing_year));
  const pastCycles = ((odometerKm / 100) * baseConsumptionKwhPer100km(profile)) / Number(profile.battery_capacity);
  const rates = annualDegradation({ profile, tempC, chargeLimitPct, dcPct, annualDistKm });

  const pastCalendarWear = ageYears * rates.annualCalendarLoss;
  const pastCyclicWear = pastCycles * (20.0 / baseCycleLife(profile)) * (1.0 + (dcPct / 100) * 1.6);
  const soh = clamp(100 - pastCalendarWear - pastCyclicWear, 50, 100);

  return { soh, ageYears, pastCycles, pastCalendarWear, pastCyclicWear, rates };
}

module.exports = {
  clamp,
  isLfp,
  chemistryLabel,
  baseCycleLife,
  effectiveSohPct,
  usableCapacityKwh,
  baseConsumptionKwhPer100km,
  consumptionKwhPer100km,
  annualDegradation,
  estimateCurrentSoh,
};
