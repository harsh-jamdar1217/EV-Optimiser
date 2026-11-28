'use strict';
/**
 * Cross-module linkage tests. No network, no test framework:
 *   node server/test/linkage.test.js
 *
 * Supabase is replaced by a small in-memory fake, so this verifies the
 * calculation/linking logic, not your real database.
 */
const assert = require('assert');
const Module = require('module');
const path = require('path');

// ---------- in-memory fake Supabase ----------
const tables = { ev_profiles: [], analysis_results: [], vehicle_state: [] };
let failTable = null;

function from(name) {
  const q = { filters: [], op: 'select', payload: null, opts: null, single: false, maybe: false };
  const run = () => {
    if (failTable === name) return { data: null, error: { code: 'PGRST205', message: 'relation does not exist' } };
    const rows = tables[name];
    let matched = rows.filter((r) => q.filters.every(([c, v]) => r[c] == v)); // eslint-disable-line eqeqeq
    if (q.op === 'insert') {
      const arr = [].concat(q.payload).map((r) => ({ id: rows.length + 1, created_at: new Date().toISOString(), ...r }));
      rows.push(...arr);
      matched = arr;
    } else if (q.op === 'upsert') {
      const key = (q.opts && q.opts.onConflict) || 'id';
      const i = rows.findIndex((x) => x[key] === q.payload[key]);
      if (i >= 0) rows[i] = { ...rows[i], ...q.payload };
      else rows.push({ ...q.payload });
      matched = [rows[i >= 0 ? i : rows.length - 1]];
    } else if (q.op === 'delete') {
      tables[name] = rows.filter((r) => !matched.includes(r));
    }
    if (q.single) {
      if (!matched.length) return q.maybe ? { data: null, error: null } : { data: null, error: { code: 'PGRST116' } };
      return { data: matched[0], error: null };
    }
    return { data: matched, error: null, count: matched.length };
  };
  const b = {
    select: () => b,
    eq: (c, v) => (q.filters.push([c, v]), b),
    order: () => b,
    limit: () => b,
    insert: (p) => ((q.op = 'insert'), (q.payload = p), b),
    upsert: (p, o) => ((q.op = 'upsert'), (q.payload = p), (q.opts = o), b),
    delete: () => ((q.op = 'delete'), b),
    single: () => ((q.single = true), Promise.resolve(run())),
    maybeSingle: () => ((q.single = true), (q.maybe = true), Promise.resolve(run())),
    then: (res, rej) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}

const origLoad = Module._load;
Module._load = function (request) {
  if (request === '../db') return { supabase: { from } };
  return origLoad.apply(this, arguments);
};

const SERVER = path.join(__dirname, '..');
const ctrl = (f) => require(path.join(SERVER, 'controllers', f));

function call(file, fn, body = {}, params = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, status(s) { this.statusCode = s; return this; }, json(o) { resolve({ status: this.statusCode, ...o }); } };
    ctrl(file)[fn]({ body, params }, res);
  });
}

const NOW_YEAR = new Date().getFullYear();
function resetDb(profileOverrides = {}) {
  tables.ev_profiles = [{ id: 1, vehicle_model: 'Test EV', battery_capacity: 40, motor_power: 100, vehicle_weight: 1500, charging_type: 'DC Fast', manufacturing_year: NOW_YEAR - 4, ...profileOverrides }];
  tables.analysis_results = [];
  tables.vehicle_state = [];
  failTable = null;
}

// ---------- tiny runner ----------
const results = [];
async function test(name, fn) {
  try { resetDb(); await fn(); results.push([true, name]); }
  catch (e) { results.push([false, name, e.message]); }
}
const near = (a, b, tol = 0.51) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

(async () => {
  // -- 1. Regression: with nothing saved, outputs equal the pre-change numbers --
  await test('no saved state: range/consumption unchanged (250 km, 15.98 kWh/100km)', async () => {
    const r = await call('rangeController.js', 'estimateRange', { profile_id: 1 });
    assert.strictEqual(r.data.estimatedRange, 250);
    assert.strictEqual(r.data.energyConsumption, 15.98);
    assert.strictEqual(r.data.sohPct, 100);
  });
  await test('no saved state: charging unchanged (36 min, 2.28)', async () => {
    const r = await call('chargingController.js', 'getChargingAdvice', { profile_id: 1, charger_type: 'DC Fast', charger_power: 50 });
    assert.strictEqual(r.data.totalChargingTimeMins, 36);
    assert.strictEqual(r.data.totalCost, 2.28);
  });
  await test('no saved state: annual cost unchanged (625)', async () => {
    const r = await call('costController.js', 'getCostComparison', { profile_id: 1 });
    assert.strictEqual(r.data.annualEvCost, 625);
  });

  // -- 2. Performance and Range now agree --
  await test('Performance and Range agree for identical inputs', async () => {
    const range = await call('rangeController.js', 'estimateRange', { profile_id: 1, soc: 100, temperature: 25, speed: 60, driving_style: 'Normal' });
    const perf = await call('performanceController.js', 'analyzePerformance', { profile_id: 1, daily_distance: 40, average_speed: 60, driving_style: 'Normal' });
    const p = tables.analysis_results.find((r) => r.analysis_type === 'performance').result_json;
    assert.strictEqual(p.estimatedRange, range.data.estimatedRange);
    assert.strictEqual(p.energyConsumption, range.data.energyConsumption);
    assert.ok(perf.ok);
  });

  // -- 3. Health SOH -> everything else --
  await test('saving a health assessment publishes SOH to shared state', async () => {
    const h = await call('healthController.js', 'assessHealth', { profile_id: 1, cycle_count: 1500, save_to_db: true });
    const st = tables.vehicle_state[0];
    assert.strictEqual(h.data.sharedSohUpdated, true);
    assert.strictEqual(st.soh_source, 'health_assessment');
    assert.strictEqual(st.soh_pct, h.data.soh);
  });
  await test('live (unsaved) health assessment does NOT change shared state', async () => {
    await call('healthController.js', 'assessHealth', { profile_id: 1, cycle_count: 1500, save_to_db: false });
    assert.strictEqual(tables.vehicle_state.length, 0);
  });
  await test('Range shrinks in proportion to saved SOH', async () => {
    const before = (await call('rangeController.js', 'estimateRange', { profile_id: 1 })).data;
    tables.vehicle_state.push({ profile_id: 1, soh_pct: 80, soh_source: 'manual' });
    const after = (await call('rangeController.js', 'estimateRange', { profile_id: 1 })).data;
    near(after.estimatedRange, before.estimatedRange * 0.8, 1);
    assert.strictEqual(after.usableCapacityKwh, 32);
  });
  await test('Charging: degraded pack needs less time/cost for the same SOC swing', async () => {
    const body = { profile_id: 1, charger_type: 'DC Fast', charger_power: 50 };
    const before = (await call('chargingController.js', 'getChargingAdvice', body)).data;
    tables.vehicle_state.push({ profile_id: 1, soh_pct: 80, soh_source: 'manual' });
    const after = (await call('chargingController.js', 'getChargingAdvice', body)).data;
    assert.ok(after.totalChargingTimeMins < before.totalChargingTimeMins);
    assert.ok(after.totalCost < before.totalCost);
  });
  await test('Degradation starts from the saved health SOH', async () => {
    tables.vehicle_state.push({ profile_id: 1, soh_pct: 91.5, soh_source: 'health_assessment' });
    const d = (await call('degradationController.js', 'getDegradationForecast', { profile_id: 1 })).data;
    assert.strictEqual(d.currentSOH, 91.5);
    assert.strictEqual(d.sohBasis, 'health_assessment');
    assert.strictEqual(d.baselineSohCurve[0].soh, 91.5);
  });
  await test('Digital Twin and Degradation share the same starting SOH (saved)', async () => {
    tables.vehicle_state.push({ profile_id: 1, soh_pct: 91.5, soh_source: 'health_assessment' });
    const t = (await call('digitalTwinController.js', 'simulateScenarios', { profile_id: 1, scenarioA: {}, scenarioB: {} })).data;
    assert.strictEqual(t.startSoh, 91.5);
    assert.strictEqual(t.scenarioA.curve[0].soh, 91.5);
  });
  await test('Digital Twin and Degradation share the same starting SOH (model, nothing saved)', async () => {
    const d = (await call('degradationController.js', 'getDegradationForecast', { profile_id: 1 })).data;
    const t = (await call('digitalTwinController.js', 'simulateScenarios', { profile_id: 1, scenarioA: {}, scenarioB: {} })).data;
    assert.strictEqual(t.startSoh, d.currentSOH);
  });

  // -- 4. Degradation's own save, and precedence --
  await test('Degradation save_to_state stores a model SOH when nothing better exists', async () => {
    const d = (await call('degradationController.js', 'getDegradationForecast', { profile_id: 1, save_to_state: true })).data;
    assert.strictEqual(d.sharedSohUpdated, true);
    assert.strictEqual(tables.vehicle_state[0].soh_source, 'degradation_forecast');
  });
  await test('Degradation save_to_state never overwrites a health-assessed SOH', async () => {
    tables.vehicle_state.push({ profile_id: 1, soh_pct: 88, soh_source: 'health_assessment' });
    const d = (await call('degradationController.js', 'getDegradationForecast', { profile_id: 1, save_to_state: true })).data;
    assert.strictEqual(d.sharedSohUpdated, false);
    assert.strictEqual(tables.vehicle_state[0].soh_pct, 88);
  });

  // -- 5. Shared tariff / temperature / usage --
  await test('Saved tariffs feed Charging; request values still win', async () => {
    tables.vehicle_state.push({ profile_id: 1, tariff_peak: 0.64, tariff_mid: 0.32, tariff_offpeak: 0.18 });
    const a = (await call('chargingController.js', 'getChargingAdvice', { profile_id: 1 })).data;
    assert.deepStrictEqual(a.tariffs, { peak: 0.64, mid: 0.32, offPeak: 0.18 });
    const b = (await call('chargingController.js', 'getChargingAdvice', { profile_id: 1, peakRate: 0.5 })).data;
    assert.strictEqual(b.tariffs.peak, 0.5);
  });
  await test('Saved tariffs change annual Cost (blended rate); request value still wins', async () => {
    const base = (await call('costController.js', 'getCostComparison', { profile_id: 1 })).data.annualEvCost;
    tables.vehicle_state.push({ profile_id: 1, tariff_peak: 0.64, tariff_mid: 0.32, tariff_offpeak: 0.18 });
    const saved = (await call('costController.js', 'getCostComparison', { profile_id: 1 })).data.annualEvCost;
    const forced = (await call('costController.js', 'getCostComparison', { profile_id: 1, electricity_rate: 0.15 })).data.annualEvCost;
    assert.ok(saved > base);
    assert.strictEqual(forced, base);
  });
  await test('Saved ambient temperature drives Range, Performance and Charging; request wins', async () => {
    tables.vehicle_state.push({ profile_id: 1, ambient_temp_c: -5 });
    const cold = (await call('rangeController.js', 'estimateRange', { profile_id: 1 })).data;
    const forced = (await call('rangeController.js', 'estimateRange', { profile_id: 1, temperature: 25 })).data;
    assert.strictEqual(cold.temperature, -5);
    assert.ok(cold.estimatedRange < forced.estimatedRange);
    const c = (await call('chargingController.js', 'getChargingAdvice', { profile_id: 1 })).data;
    assert.strictEqual(c.temperature, -5);
  });

  // -- 6. State API validation and resilience --
  await test('vehicle-state API: rejects out-of-range values', async () => {
    const r = await call('vehicleStateController.js', 'updateVehicleState', { soh_pct: 120 }, { profile_id: '1' });
    assert.strictEqual(r.status, 400);
  });
  await test('vehicle-state API: manual SOH is stored with source "manual"', async () => {
    const r = await call('vehicleStateController.js', 'updateVehicleState', { soh_pct: 85 }, { profile_id: '1' });
    assert.strictEqual(r.state.soh_source, 'manual');
    const range = (await call('rangeController.js', 'estimateRange', { profile_id: 1 })).data;
    assert.strictEqual(range.sohPct, 85);
  });
  await test('vehicle-state API: clearing SOH clears its source; reset empties the row', async () => {
    await call('vehicleStateController.js', 'updateVehicleState', { soh_pct: 85 }, { profile_id: '1' });
    const cleared = await call('vehicleStateController.js', 'updateVehicleState', { soh_pct: null }, { profile_id: '1' });
    assert.strictEqual(cleared.state.soh_source, null);
    await call('vehicleStateController.js', 'resetVehicleState', {}, { profile_id: '1' });
    assert.strictEqual(tables.vehicle_state.length, 0);
  });
  await test('vehicle-state API: unknown profile -> 404', async () => {
    const r = await call('vehicleStateController.js', 'updateVehicleState', { soh_pct: 90 }, { profile_id: '99' });
    assert.strictEqual(r.status, 404);
  });
  await test('missing vehicle_state table: modules keep working with defaults', async () => {
    failTable = 'vehicle_state';
    const r = await call('rangeController.js', 'estimateRange', { profile_id: 1 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.data.estimatedRange, 250);
    const h = await call('healthController.js', 'assessHealth', { profile_id: 1, save_to_db: true });
    assert.strictEqual(h.ok, true);
    assert.strictEqual(h.data.sharedSohUpdated, false);
    assert.ok(h.data.warning);
  });
  await test('Health and Degradation use the same chemistry rule', async () => {
    resetDb({ vehicle_model: 'Nexon EV Max', battery_capacity: 40 });
    const h = (await call('healthController.js', 'assessHealth', { profile_id: 1 })).data;
    const d = (await call('degradationController.js', 'getDegradationForecast', { profile_id: 1 })).data;
    assert.strictEqual(h.chemistry, d.chemistry);
  });

  let failed = 0;
  for (const [ok, name, msg] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      -> ${msg}`}`);
    if (!ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
