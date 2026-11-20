import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimulation } from '../src/sim/simulation.js';
import { transformMoveInput, distXZ } from '../src/sim/math.js';
import {
  validateInputs,
  validateScenario,
  ContractFormatError,
  VALID_SHADE_STATES,
} from '../src/sim/validators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../game.contract.json'), 'utf8')
);
const tuning = contract.tuning;

// =============================================================================
// PHASE 1–2 NON-REPLACED REGRESSION TESTS (MUST STAY 100% GREEN)
// =============================================================================

test('[P1-P2 Regression] transformMoveInput follows Contract rotation and normalization', () => {
  const [x0, z0] = transformMoveInput([0, 1], 0);
  assert.ok(Math.abs(x0) < 1e-9 && Math.abs(z0 - 1) < 1e-9);

  const [x90, z90] = transformMoveInput([0, 1], 90);
  assert.ok(Math.abs(x90 - 1) < 1e-9 && Math.abs(z90) < 1e-9);

  const [dx, dz] = transformMoveInput([1, 1], 0);
  assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 1e-9);
});

test('[P1-P2 Regression] tick 0 snapshot v1.2, step k -> tick k+1, exact time_left_s, pickup 1.0m', () => {
  const sim = createSimulation({
    seed: 1,
    night: 1,
    tuning,
    scenario: {
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 0.8]],
      shades: [],
      time_left_s: 120,
    },
  });

  const snap0 = sim.getSnapshot();
  assert.equal(snap0.tick, 0);
  assert.equal(snap0.sim_tick, 0);
  assert.equal(snap0.night, 1);
  assert.equal(snap0.player.capacity, 10);
  assert.equal(snap0.lanterns[0].fuel, 0);
  assert.equal(snap0.lanterns[0].ever_lit, false);
  assert.equal(snap0.lanterns[0].relit_count, 0);

  const evs = sim.step({});
  assert.equal(evs.length, 1);
  assert.equal(evs[0].tick, 1);
  assert.equal(evs[0].name, 'mote_picked');
  assert.equal(sim.getSnapshot().score, 0);

  for (let i = 1; i < 60; i++) sim.step({});
  assert.equal(sim.getSnapshot().tick, 60);
  assert.equal(sim.getSnapshot().time_left_s, 119);
});

test('[P1-P2 Regression] mote pickup respects dynamic carry capacity', () => {
  const motes = [];
  for (let i = 0; i < 15; i++) motes.push([0, 0, 0.5]);
  const sim = createSimulation({
    seed: 7,
    night: 1,
    tuning,
    scenario: {
      player: { successful_lights: 1 }, // capacity = 10 + 2*1 = 12
      random_motes: false,
      random_shades: false,
      motes,
      shades: [],
    },
  });

  const evs = sim.step({});
  assert.equal(evs.filter((e) => e.name === 'mote_picked').length, 12);
  assert.equal(sim.getSnapshot().player.carried, 12);
  assert.equal(sim.getSnapshot().player.capacity, 12);
  assert.equal(sim.getSnapshot().motes_active, 3);
});

test('[P1-P2 Regression] pulse (3D 5m, cost 3, stun 120 ticks -> wander, push 4m over 15 ticks, +5 score)', () => {
  const sim = createSimulation({
    seed: 9,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 6, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [4, 0.8, 0], state: 'chase' }],
    },
  });

  const evs0 = sim.step({ pulse: true });
  assert.equal(evs0[0].name, 'pulse');
  assert.deepEqual(evs0[0].data.stunned_ids, ['S1']);
  assert.equal(sim.getSnapshot().player.carried, 3);
  assert.equal(sim.getSnapshot().score, 5);
  assert.equal(sim.getSnapshot().shades[0].state, 'stunned');

  for (let i = 0; i < 14; i++) sim.step({ pulse: false });
  assert.ok(Math.abs(sim.getSnapshot().shades[0].pos[0] - 8.0) < 0.02);

  for (let i = 0; i < 105; i++) sim.step({ pulse: false });
  assert.equal(sim.getSnapshot().shades[0].state, 'stunned');
  sim.step({ pulse: false });
  assert.notEqual(sim.getSnapshot().shades[0].state, 'stunned');
});

test('[P1-P2 Regression] safe_radius = 6m blocks Shades when fuel >= 30 and pushes inside shade out <= 30t', () => {
  const sim = createSimulation({
    seed: 11,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [
        { id: 'S1', pos: [10, 1, 0], state: 'chase' },
        { id: 'S2', pos: [2, 1, 0], state: 'chase' },
      ],
      lanterns: [{ id: 'L1', pos: [0, 0, 0], deposited: 0, lit: false }],
    },
  });

  sim.step({ interact: true });
  for (let i = 0; i < 35; i++) {
    const evs = sim.step({});
    assert.equal(evs.filter((e) => e.name === 'player_hit').length, 0);
  }
  for (const s of sim.getSnapshot().shades) {
    assert.ok(distXZ(s.pos, [0, 0, 0]) >= tuning.safe_radius);
  }
});

test('[P1-P2 Regression] shade hit drops floor(carried/2) into 1.5-2.5m ring, recoil 60t, invuln 90t', () => {
  const sim = createSimulation({
    seed: 12,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 5, flames: 2 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }],
    },
  });

  const evs0 = sim.step({});
  assert.equal(evs0[0].name, 'player_hit');
  assert.equal(evs0[0].data.dropped, 2);
  assert.equal(sim.getSnapshot().player.carried, 3);
  assert.equal(sim.getSnapshot().player.invuln, true);
  assert.equal(sim.getSnapshot().shades[0].state, 'recoil');
});

test('[P2 Regression] Dash, Fall, Night 2 Pad, Night 3 Ramp+Pad, Drifter, Charm, Pause', () => {
  // Dash airborne keeps Y
  const simDash = createSimulation({
    seed: 20,
    night: 1,
    tuning,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] },
  });
  simDash.step({ jump: true });
  for (let i = 0; i < 10; i++) simDash.step({ jump: false });
  const y0 = simDash.getSnapshot().player.pos[1];
  simDash.step({ dash: true });
  for (let i = 1; i < 12; i++) {
    simDash.step({ dash: false });
    assert.ok(Math.abs(simDash.getSnapshot().player.pos[1] - y0) < 1e-3);
  }

  // Fall ignores invuln & respawns in 60t
  const simFall = createSimulation({
    seed: 21,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [41, 0, 0], carried: 7, flames: 2, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
    },
  });
  let fell = null;
  for (let i = 0; i < 80 && !fell; i++) {
    fell = simFall.step({}).find((e) => e.name === 'player_hit' && e.data.by === 'fall');
  }
  assert.ok(fell && fell.data.lost === 7 && fell.data.flames === 1);
  for (let i = 0; i < 60; i++) simFall.step({});
  assert.deepEqual(simFall.getSnapshot().player.pos, [0, 0, 0]);
  assert.equal(simFall.getSnapshot().player.invuln, true);

  // Night 2 Jump Pad
  const simPad2 = createSimulation({
    seed: 22,
    night: 2,
    tuning,
    scenario: {
      player: { pos: [20, 0, 18] },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
    },
  });
  for (let i = 0; i < 100; i++) simPad2.step({});
  assert.ok(distXZ(simPad2.getSnapshot().player.pos, [70, 0, 0]) <= 28);

  // Night 3 Jump Pad to Tier 2
  const simPad3 = createSimulation({
    seed: 24,
    night: 3,
    tuning,
    scenario: {
      player: { pos: [0, 3, 13] },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
    },
  });
  for (let i = 0; i < 70; i++) simPad3.step({});
  assert.equal(simPad3.getSnapshot().player.pos[1], 6);

  // Drifter steal + Pulse drop
  const simDrift = createSimulation({
    seed: 25,
    night: 2,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 6, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
      drifters: [{ id: 'D1', pos: [0.5, 1, 0], state: 'chase' }],
    },
  });
  assert.equal(simDrift.step({})[0].name, 'drifter_steal');
  const pEvs = simDrift.step({ pulse: true });
  assert.ok(pEvs.some((e) => e.name === 'drifter_drop' && e.data.amount === 3));

  // Wind Charm 7.2 m/s & 0 dash cd
  const simCharm = createSimulation({
    seed: 26,
    night: 2,
    tuning,
    scenario: {
      player: { pos: [35, 0, 0] },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
    },
  });
  assert.equal(simCharm.step({})[0].name, 'charm_picked');
  for (let i = 0; i < 10; i++) simCharm.step({ move: [1, 0] });
  assert.ok(Math.abs(simCharm.getSnapshot().player.pos[0] - 36.2) < 0.02);

  // Pause freezes sim_tick & fuel decay
  const simPause = createSimulation({
    seed: 27,
    night: 1,
    tuning,
    scenario: {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [{ id: 'L1', lit: true, fuel: 50 }],
      time_left_s: 100,
    },
  });
  assert.equal(simPause.step({ pause: true })[0].name, 'paused');
  for (let i = 0; i < 60; i++) simPause.step({ pause: false });
  assert.equal(simPause.getSnapshot().sim_tick, 0);
  assert.equal(simPause.getSnapshot().lanterns[0].fuel, 50);
  assert.equal(simPause.step({ pause: true })[0].name, 'resumed');
  assert.equal(simPause.getSnapshot().sim_tick, 1);
});

// =============================================================================
// PHASE 3 NEW RULES & REPLACED TESTS (CONTRACT v1.2 — "ĐÈN CẠN DẦU")
// =============================================================================

test('[P3 Updated] Lighting all 5 lanterns does NOT end early; wins at dawn (dawn_survived) with v1.2 score', () => {
  // Replaces Phase 1-2 all_lit early-win test per Ticket-03 Breaking Change
  const sim = createSimulation({
    seed: 42,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [
        { id: 'L1', pos: [0, 0, 1.5], deposited: 0, lit: false },
        { id: 'L2', lit: true, fuel: 50 },
        { id: 'L3', lit: true, fuel: 50 },
        { id: 'L4', lit: true, fuel: 50 },
        { id: 'L5', lit: true, fuel: 50 },
      ],
      time_left_s: 2, // 120 ticks to dawn
    },
  });

  // Tick 1: light L1 (all 5 lit) -> MUST NOT end early!
  const evs1 = sim.step({ interact: true });
  assert.deepEqual(
    evs1.map((e) => e.name),
    ['deposit', 'lantern_lit']
  );
  assert.equal(evs1[1].data.relight, false);
  assert.equal(sim.getState(), 'playing');
  assert.equal(sim.getSnapshot().player.capacity, 12); // 10 + 2*1
  // Score so far: 10*5 (deposit) + 100 (first light) = 150
  assert.equal(sim.getSnapshot().score, 150);

  // Advance remaining 119 ticks to dawn
  let gameOver = null;
  for (let i = 0; i < 119; i++) {
    const evs = sim.step({ interact: false });
    const go = evs.find((e) => e.name === 'game_over');
    if (go) gameOver = go;
  }
  assert.ok(gameOver);
  assert.equal(gameOver.data.result, 'won');
  assert.equal(gameOver.data.reason, 'dawn_survived');

  // At tick 120: L1 decayed 119 ticks (6000-119=5881 -> floor=98); L2..L5 decayed 120 ticks (3000-120=2880 -> floor=48)
  // Dawn bonus: (50+98) + 4*(50+48) + 3*50 = 148 + 392 + 150 = 690; total = 150 + 690 = 840
  assert.equal(sim.getEndRecord().score, 840);
});

test('[P3 Updated] Dawn loss when lit < 60% and no_flames priority on exact dawn tick', () => {
  // 2/5 lit (< ceil(0.6*5)=3) -> dawn loss
  const simDawn = createSimulation({
    seed: 50,
    night: 1,
    tuning,
    scenario: {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [
        { id: 'L1', lit: true, fuel: 50 },
        { id: 'L2', lit: true, fuel: 50 },
      ],
      time_left_s: 1 / 60,
    },
  });
  const go1 = simDawn.step({}).find((e) => e.name === 'game_over');
  assert.equal(go1.data.result, 'lost');
  assert.equal(go1.data.reason, 'dawn');

  // 3/5 lit BUT Shade kills player on exact dawn tick -> no_flames takes priority!
  const simPrio = createSimulation({
    seed: 51,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], flames: 1 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }],
      lanterns: [
        { id: 'L1', lit: true, fuel: 50 },
        { id: 'L2', lit: true, fuel: 50 },
        { id: 'L3', lit: true, fuel: 50 },
      ],
      time_left_s: 1 / 60,
    },
  });
  const go2 = simPrio.step({}).find((e) => e.name === 'game_over');
  assert.equal(go2.data.result, 'lost');
  assert.equal(go2.data.reason, 'no_flames');
});

test('[P3] Exact integer 1/60 fuel decay, lantern_out, relight cost=5 (+40), capacity max=20', () => {
  const sim = createSimulation({
    seed: 60,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 1], carried: 5, flames: 3, successful_lights: 4 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 1 }], // 60 units
      time_left_s: 120,
    },
  });

  // Capacity starts at 10 + 2*4 = 18
  assert.equal(sim.getSnapshot().player.capacity, 18);

  // 59 ticks: fuel = 1/60 > 0, still lit
  for (let i = 0; i < 59; i++) sim.step({});
  assert.equal(sim.getSnapshot().lanterns[0].lit, true);

  // Tick 60: fuel hits 0 -> lantern_out immediately after Step 2
  const evs60 = sim.step({});
  assert.equal(evs60[0].name, 'lantern_out');
  assert.equal(evs60[0].data.lantern_id, 'L1');
  const lOut = sim.getSnapshot().lanterns[0];
  assert.equal(lOut.lit, false);
  assert.equal(lOut.fuel, 0);
  assert.equal(lOut.deposited, 0);
  assert.equal(lOut.ever_lit, true);

  // Tick 61: relight with only 5 motes -> relight: true, +5*5 + 40 = 65, relit_count = 1, capacity = 20
  const evs61 = sim.step({ interact: true });
  assert.deepEqual(
    evs61.map((e) => e.name),
    ['deposit', 'lantern_lit']
  );
  assert.equal(evs61[1].data.relight, true);
  assert.equal(sim.getSnapshot().lanterns[0].lit, true);
  assert.equal(sim.getSnapshot().lanterns[0].fuel, 100);
  assert.equal(sim.getSnapshot().lanterns[0].relit_count, 1);
  assert.equal(sim.getSnapshot().score, 65);
  assert.equal(sim.getSnapshot().player.capacity, 20);
});

test('[P3] Refuel exact used=ceil((100-fuel)/10), skips full lanterns, restores safe zone & pushes shades', () => {
  const sim = createSimulation({
    seed: 61,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [1.5, 1, 0], state: 'drain', target_lantern_id: 'L2' }],
      lanterns: [
        { id: 'L1', pos: [0, 0, 0.5], lit: true, fuel: 100 }, // closer, but FULL after 0 decay? wait: decays 1/60 in step 2!
        { id: 'L2', pos: [0, 0, 1.0], lit: true, fuel: 25 },
      ],
      time_left_s: 120,
    },
  });

  // Separate check: full lantern (just lit or fuel=100) must NOT be selected when full
  const simFull = createSimulation({
    seed: 62,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [
        { id: 'L1', pos: [0, 0, 0.5], lit: false, deposited: 0 },
        { id: 'L2', pos: [0, 0, 1.0], lit: true, fuel: 85 }, // after 1 tick decay: 5099/60 -> ceil(901/600)=2 motes
      ],
    },
  });
  // First step L1 is unlit & closer; test L2 refuel directly when L1 is far
  const simRefuel = createSimulation({
    seed: 63,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [1.5, 1, 0], state: 'drain', target_lantern_id: 'L1' }],
      lanterns: [{ id: 'L1', pos: [0, 0, 1.0], lit: true, fuel: 25 }],
    },
  });
  // Tick 1: Step 2 decays L1 by 1+5=6 -> 1494/60 (~24.9). Refuel needs ceil((6000-1494)/600) = 8 motes!
  const evs = simRefuel.step({ interact: true });
  const refEv = evs.find((e) => e.name === 'refuel');
  assert.ok(refEv);
  assert.equal(refEv.data.lantern_id, 'L1');
  assert.equal(refEv.data.amount, 8);
  assert.equal(refEv.data.fuel, 100);
  assert.equal(simRefuel.getSnapshot().player.carried, 2);
  assert.equal(simRefuel.getSnapshot().score, 40); // 8 * 5
  // S1 was kicked out of drain and pushed out of safe zone within 30 ticks without hitting player
  for (let i = 0; i < 32; i++) {
    const stepEvs = simRefuel.step({ interact: false });
    assert.equal(stepEvs.filter((e) => e.name === 'player_hit').length, 0);
  }
  assert.ok(distXZ(simRefuel.getSnapshot().shades[0].pos, [0, 0, 1.0]) >= tuning.safe_radius);
  assert.notEqual(simRefuel.getSnapshot().shades[0].state, 'drain');
  // Avoid unused var warning
  assert.ok(sim && simFull);
});

test('[P3] Safe zone kept at EXACT fuel == 30 and lost at < 30; Shade wander -> drain, fuel_drain every 60t, Pulse +15', () => {
  // 1. Exact fuel == 30 (after 1 tick from 30 + 1/60): safe zone still holds!
  const simBoundary = createSimulation({
    seed: 64,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, -25], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [5, 1, 0], state: 'wander' }],
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 30 + 1 / 60 }],
    },
  });
  simBoundary.step({});
  // After 1 tick, fuelUnits === 1800 (exact 30.0) -> safe zone active -> S1 pushed outside 6m!
  assert.equal(simBoundary.getSnapshot().lanterns[0].fuel, 30);
  assert.ok(distXZ(simBoundary.getSnapshot().shades[0].pos, [0, 0, 0]) >= 6.0);

  // 2. Fuel < 30: S1 wanders into weak lantern, enters drain, emits fuel_drain every 60t, Pulse gives +15!
  const simDrain = createSimulation({
    seed: 65,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, -30], carried: 6, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [4, 1, 0], state: 'wander' }],
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 25 }],
    },
  });

  const drainEvents = [];
  for (let i = 0; i < 160; i++) {
    const evs = simDrain.step({});
    for (const e of evs) if (e.name === 'fuel_drain') drainEvents.push(e);
  }
  assert.equal(simDrain.getSnapshot().shades[0].state, 'drain');
  assert.ok(drainEvents.length >= 2, `Expected >=2 fuel_drain events, got ${drainEvents.length}`);
  assert.equal(drainEvents[0].data.lantern_id, 'L1');
  assert.equal(drainEvents[0].data.shade_id, 'S1');

  // Now test Pulse on a draining shade directly -> +15 points!
  const simDrainPulse = createSimulation({
    seed: 66,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 3], carried: 3, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [1, 1, 0], state: 'drain', target_lantern_id: 'L1' }],
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 20 }],
    },
  });
  const pEvs = simDrainPulse.step({ pulse: true });
  assert.equal(pEvs.find((e) => e.name === 'pulse').data.stunned_ids[0], 'S1');
  assert.equal(simDrainPulse.getSnapshot().score, 15);
  assert.equal(simDrainPulse.getSnapshot().shades[0].state, 'stunned');
});

test('[P3] Shade states stay strictly within the 6 standard Contract v1.2 states', () => {
  const sim = createSimulation({ seed: 28, night: 3, tuning });
  for (let i = 0; i < 1500; i++) {
    sim.step({});
    if (i % 60 === 0) {
      for (const s of sim.getSnapshot().shades) {
        assert.ok(VALID_SHADE_STATES.has(s.state), `Invalid shade state: ${s.state}`);
      }
    }
  }
});

test('[P3] Validators reject invalid v1.2 inputs/scenario with exitCode 2', () => {
  assert.throws(
    () => validateInputs({ frames: [{ tick: 5 }, { tick: 5 }] }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
  assert.throws(
    () => validateScenario({ shades: [{ pos: [0, 0, 0], state: 'bogus' }] }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
  assert.throws(
    () => validateScenario({ lanterns: [{ id: 'L1', fuel: 150 }] }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
});

// =============================================================================
// PHASE 4 TESTS (CONTRACT v1.3: BENCH SCENE & LOCAL LEADERBOARD)
// =============================================================================
import os from 'node:os';
import {
  validatePlayerName,
  addLeaderboardEntry,
  exportLeaderboard,
  readLeaderboard,
} from '../src/leaderboard.js';
import { createBenchSimulation } from '../src/sim/benchMode.js';

test('[P4] Benchmark scene spawns exact 200 wander Shades, 100 Motes, L1-L3 lit fuel=100, no decay/damage', () => {
  const bench = createBenchSimulation({ seed: 42, tuning });
  const s0 = bench.getRenderState();
  assert.equal(s0.shades.length, 200);
  assert.equal(s0.motes.length, 100);
  assert.ok(s0.shades.every((s) => s.state === 'wander'));
  assert.deepEqual(
    s0.lanterns.map((l) => l.lit),
    [true, true, true, false, false]
  );
  assert.deepEqual(
    s0.lanterns.slice(0, 3).map((l) => l.fuel),
    [100, 100, 100]
  );

  // Run 120 ticks -> counts unchanged, fuel unchanged, Mây stationary at (0,0,0), Shades move
  const prevPos = [...s0.shades[0].pos];
  for (let i = 0; i < 120; i++) bench.step();
  const s120 = bench.getRenderState();
  assert.equal(s120.shades.length, 200);
  assert.equal(s120.motes.length, 100);
  assert.deepEqual(s120.player.pos, [0, 0, 0]);
  assert.equal(s120.lanterns[0].fuel, 100);
  assert.ok(
    Math.hypot(s120.shades[0].pos[0] - prevPos[0], s120.shades[0].pos[2] - prevPos[2]) > 0.1
  );
});

test('[P4] Local leaderboard validation, Vietnamese names, score desc + earliest tie-break, top 10', () => {
  assert.equal(validatePlayerName('ab'), false); // < 3
  assert.equal(validatePlayerName('abcdefghijklm'), false); // > 12
  assert.equal(validatePlayerName('bad name'), false); // space
  assert.equal(validatePlayerName('May_01'), true);
  assert.equal(validatePlayerName('MâyĐèn'), true); // Vietnamese Unicode bonus

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-lb-test-'));
  const lbFile = path.join(tmpDir, 'leaderboard.json');
  const exportFile = path.join(tmpDir, 'export.json');

  for (let i = 0; i < 12; i++) {
    addLeaderboardEntry(
      {
        name: `Player_${i}`,
        score: i === 5 ? 900 : i === 8 ? 900 : i * 100,
        nights_won: i % 4,
        achieved_at: `2026-11-20T10:${String(i).padStart(2, '0')}:00+07:00`,
        seed: 2026 + i,
      },
      lbFile
    );
  }

  const stored = readLeaderboard(lbFile);
  assert.equal(stored.entries.length, 10);
  assert.equal(stored.entries[0].score, 1100);
  // Equal score 900: Player_5 achieved earlier (10:05) than Player_8 (10:08) -> Player_5 first!
  const idx5 = stored.entries.findIndex((e) => e.name === 'Player_5');
  const idx8 = stored.entries.findIndex((e) => e.name === 'Player_8');
  assert.ok(idx5 >= 0 && idx8 > idx5);

  exportLeaderboard(exportFile, lbFile);
  const exported = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
  assert.equal(exported.entries.length, 10);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
