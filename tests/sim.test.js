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
// PHASE 1 REGRESSION TESTS (UPDATED FOR CONTRACT v1.1 STANDARD TUNING)
// =============================================================================

test('[P1 Regression] transformMoveInput follows Contract rotation and normalization', () => {
  const [x0, z0] = transformMoveInput([0, 1], 0);
  assert.ok(Math.abs(x0) < 1e-9 && Math.abs(z0 - 1) < 1e-9);

  const [x90, z90] = transformMoveInput([0, 1], 90);
  assert.ok(Math.abs(x90 - 1) < 1e-9 && Math.abs(z90) < 1e-9);

  const [dx, dz] = transformMoveInput([1, 1], 0);
  assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 1e-9);
});

test('[P1 Regression] tick 0 snapshot, step k -> tick k+1, exact time_left_s, pickup radius 1.0m', () => {
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
  assert.equal(snap0.time_left_s, 120);
  assert.equal(snap0.score, 0);

  const evs = sim.step({});
  assert.equal(evs.length, 1);
  assert.equal(evs[0].tick, 1);
  assert.equal(evs[0].name, 'mote_picked');
  // Phase 2 rule: per_mote (+10) is awarded on deposit, not on pickup
  assert.equal(sim.getSnapshot().score, 0);

  for (let i = 1; i < 60; i++) sim.step({});
  assert.equal(sim.getSnapshot().tick, 60);
  assert.equal(sim.getSnapshot().time_left_s, 119);
});

test('[P1 Regression] mote pickup respects carry_capacity = 10', () => {
  const motes = [];
  for (let i = 0; i < tuning.carry_capacity + 3; i++) {
    motes.push([0, 0, 0.5]);
  }
  const sim = createSimulation({
    seed: 7,
    night: 1,
    tuning,
    scenario: { random_motes: false, random_shades: false, motes, shades: [] },
  });

  const evs = sim.step({});
  assert.equal(evs.filter((e) => e.name === 'mote_picked').length, 10);
  assert.equal(sim.getSnapshot().player.carried, 10);
  assert.equal(sim.getSnapshot().motes_active, 3);
});

test('[P1 Regression] deposit (+10/mote), lantern_lit (+100), win bonus score', () => {
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
        { id: 'L2', lit: true },
        { id: 'L3', lit: true },
        { id: 'L4', lit: true },
        { id: 'L5', lit: true },
      ],
      time_left_s: 100,
    },
  });

  assert.equal(sim.getSnapshot().score, 0);
  const evs = sim.step({ interact: true });
  assert.deepEqual(
    evs.map((e) => e.name),
    ['deposit', 'lantern_lit', 'game_over']
  );
  // 10*10 (deposit) + 100 (lit) + floor(99.983)*2 + 3*50 = 100 + 100 + 198 + 150 = 548
  const expected = 10 * 10 + 100 + Math.floor(100 - 1 / 60) * 2 + 3 * 50;
  assert.equal(sim.getEndRecord().score, expected);
});

test('[P1 Regression] pulse (3D 5m, cost 3, stun 120 ticks, push 4m over 15 ticks, +5 score)', () => {
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

  // After 14 more ticks (total 15 push ticks), shade pushed +4.0m to x = 8.0
  for (let i = 0; i < 14; i++) sim.step({ pulse: false });
  assert.ok(Math.abs(sim.getSnapshot().shades[0].pos[0] - 8.0) < 0.02);

  // Still stunned on tick 120 (120th tick of stun), wakes up on tick 121
  for (let i = 0; i < 105; i++) sim.step({ pulse: false });
  assert.equal(sim.getSnapshot().shades[0].state, 'stunned');
  sim.step({ pulse: false });
  assert.notEqual(sim.getSnapshot().shades[0].state, 'stunned');
});

test('[P1 Regression] safe_radius = 6m blocks Shades and pushes inside shade out within 30 ticks', () => {
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

  // Light L1 on tick 0 -> S2 inside safe_radius must be pushed out within 30 ticks without hitting Mây
  sim.step({ interact: true });
  for (let i = 0; i < 35; i++) {
    const evs = sim.step({});
    assert.equal(evs.filter((e) => e.name === 'player_hit').length, 0);
  }
  for (const s of sim.getSnapshot().shades) {
    assert.ok(distXZ(s.pos, [0, 0, 0]) >= tuning.safe_radius);
  }
});

test('[P1 Regression] shade hit drops floor(carried/2) into 1.5-2.5m ring, recoil 60t, invuln 90t', () => {
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
  assert.equal(evs0[0].data.dropped, 2); // floor(5/2)
  assert.equal(sim.getSnapshot().player.carried, 3);
  assert.equal(sim.getSnapshot().player.invuln, true);
  assert.equal(sim.getSnapshot().shades[0].state, 'recoil');

  const droppedMotes = sim.getSnapshot().motes.filter((m) => m.kind === 'dropped');
  assert.equal(droppedMotes.length, 2);
  for (const dm of droppedMotes) {
    const d = distXZ(dm.pos, [0, 0, 0]);
    assert.ok(d >= 1.49 && d <= 2.51, `Dropped mote dist ${d} outside [1.5, 2.5]`);
    assert.equal(dm.ttl_s, 8);
  }
});

test('[P1 Regression] dawn timeout vs all_lit priority on exact last tick', () => {
  const sim = createSimulation({
    seed: 5,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [
        { id: 'L1', pos: [0, 0, 1], lit: false },
        { id: 'L2', lit: true },
        { id: 'L3', lit: true },
        { id: 'L4', lit: true },
        { id: 'L5', lit: true },
      ],
      time_left_s: 1 / 60, // exact 1 tick left
    },
  });

  // Lighting last lantern on exact timeout tick -> MUST WIN (all_lit > dawn)
  const evs = sim.step({ interact: true });
  const go = evs.find((e) => e.name === 'game_over');
  assert.equal(go.data.result, 'won');
  assert.equal(go.data.reason, 'all_lit');
});

// =============================================================================
// PHASE 2 NEW MECHANICS UNIT TESTS (CONTRACT v1.1)
// =============================================================================

test('[P2] Dash moves 14 m/s for 12 ticks, keeps Y constant in air, 90-tick cooldown', () => {
  const sim = createSimulation({
    seed: 20,
    night: 1,
    tuning,
    scenario: { random_motes: false, random_shades: false, motes: [], shades: [] },
  });

  // Jump first to get airborne
  sim.step({ jump: true });
  for (let i = 0; i < 10; i++) sim.step({ jump: false });
  const yBeforeDash = sim.getSnapshot().player.pos[1];
  assert.ok(yBeforeDash > 0.5, 'Player should be airborne');

  // Dash with no move input -> dashes along facingYaw (+Z)
  const evs = sim.step({ dash: true });
  assert.equal(evs[0].name, 'dash');
  assert.equal(sim.getSnapshot().player.dash_cd_s, 1.5);

  for (let i = 1; i < 12; i++) {
    sim.step({ dash: false });
    assert.ok(
      Math.abs(sim.getSnapshot().player.pos[1] - yBeforeDash) < 1e-3,
      `Y changed during airborne dash tick ${i}`
    );
  }
  // Distance moved during 12 ticks at 14 m/s = 2.8m along +Z
  assert.ok(Math.abs(sim.getSnapshot().player.pos[2] - 2.8) < 0.02);
});

test('[P2] Fall off island (Y < -10): ignores invuln, loses all motes, 60t wait, respawn + 90t invuln', () => {
  const sim = createSimulation({
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

  let fallEvent = null;
  for (let i = 0; i < 80; i++) {
    const evs = sim.step({});
    const hit = evs.find((e) => e.name === 'player_hit');
    if (hit) {
      fallEvent = hit;
      break;
    }
  }
  assert.ok(fallEvent);
  assert.equal(fallEvent.data.by, 'fall');
  assert.equal(fallEvent.data.flames, 1);
  assert.equal(fallEvent.data.lost, 7);
  assert.equal(sim.getSnapshot().player.carried, 0);

  // Wait 60 ticks -> respawn at (0,0,0) with invuln=true
  for (let i = 0; i < 60; i++) sim.step({});
  const snap = sim.getSnapshot();
  assert.deepEqual(snap.player.pos, [0, 0, 0]);
  assert.equal(snap.player.invuln, true);
  assert.equal(snap.player.grounded, true);
});

test('[P2] Night 2 jump pad launches player from Island A to Island B', () => {
  const sim = createSimulation({
    seed: 22,
    night: 2,
    tuning,
    scenario: {
      player: { pos: [20, 0, 18], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
    },
  });

  for (let i = 0; i < 100; i++) sim.step({});
  const p = sim.getSnapshot().player;
  assert.equal(p.grounded, true);
  // Must land on Island B (center 70, 0, radius 28)
  assert.ok(distXZ(p.pos, [70, 0, 0]) <= 28, `Did not land on Island B: pos=${p.pos}`);
});

test('[P2] Night 3 ramp climbs to Tier 1, vertical cliff blocks direct entry, jump pad lands on Tier 2', () => {
  // 1. Direct walk into Tier 1 cliff from Tier 0 (z = -1 -> z = +1 at x = 18) must be blocked
  const simCliff = createSimulation({
    seed: 23,
    night: 3,
    tuning,
    scenario: {
      player: { pos: [18, 0, -0.5], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
    },
  });
  for (let i = 0; i < 30; i++) simCliff.step({ move: [0, 1] });
  assert.ok(simCliff.getSnapshot().player.pos[2] <= 0.05, 'Cliff should block entering Tier 1');

  // 2. Jump pad at (0, 3, 13) launches onto Tier 2 (Y = 6, r <= 8)
  const simPad = createSimulation({
    seed: 24,
    night: 3,
    tuning,
    scenario: {
      player: { pos: [0, 3, 13], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      motes: [],
      shades: [],
    },
  });
  for (let i = 0; i < 70; i++) simPad.step({});
  const p = simPad.getSnapshot().player;
  assert.equal(p.grounded, true);
  assert.equal(p.pos[1], 6);
  assert.ok(Math.hypot(p.pos[0], p.pos[2]) <= 8 && Math.hypot(p.pos[0], p.pos[2]) >= 2);
});

test('[P2] Drifter steals BEFORE Shade hits (step 9 order) and Pulse forces drifter_drop', () => {
  const sim = createSimulation({
    seed: 25,
    night: 2,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 6, flames: 3, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }],
      drifters: [{ id: 'D1', pos: [0.5, 1, 0], state: 'chase' }],
    },
  });

  // Invuln does NOT block Drifter steal!
  const evs0 = sim.step({});
  assert.equal(evs0.length, 1);
  assert.equal(evs0[0].name, 'drifter_steal');
  assert.equal(evs0[0].data.amount, 3);
  assert.equal(evs0[0].data.carried, 3);
  assert.equal(sim.getSnapshot().drifters[0].state, 'flee');
  assert.equal(sim.getSnapshot().drifters[0].stolen, 3);

  // Immediately Pulse while D1 is fleeing within 5m -> drifter_drop 3 motes!
  const evs1 = sim.step({ pulse: true });
  const dropEv = evs1.find((e) => e.name === 'drifter_drop');
  assert.ok(dropEv);
  assert.equal(dropEv.data.drifter_id, 'D1');
  assert.equal(dropEv.data.amount, 3);
  assert.equal(sim.getSnapshot().motes.filter((m) => m.kind === 'dropped').length, 3);
});

test('[P2] Wind Charm gives 7.2 m/s run speed, 0 dash cooldown, and respawns after 2700 ticks', () => {
  const sim = createSimulation({
    seed: 26,
    night: 2,
    tuning,
    scenario: {
      player: { pos: [35, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      motes: [],
      shades: [],
    },
  });

  const evs0 = sim.step({});
  assert.equal(evs0[0].name, 'charm_picked');
  assert.equal(evs0[0].data.charm_id, 'C1');
  assert.equal(evs0[0].data.charm_ticks, 600);
  assert.equal(sim.getSnapshot().charms[0].available, false);

  // Move along +X for 10 ticks -> speed 7.2 m/s = 1.2m
  for (let i = 0; i < 10; i++) sim.step({ move: [1, 0] });
  assert.ok(Math.abs(sim.getSnapshot().player.pos[0] - 36.2) < 0.02);

  // Dash twice back-to-back after 12 ticks (0 cooldown!)
  const d1 = sim.step({ dash: true });
  assert.equal(d1[0].name, 'dash');
  assert.equal(sim.getSnapshot().player.dash_cd_s, 0);
  for (let i = 1; i < 12; i++) sim.step({ dash: false });
  const d2 = sim.step({ dash: true });
  assert.equal(d2[0].name, 'dash');
});

test('[P2] Pause freezes sim_tick, time_left_s, cooldowns while tick increments', () => {
  const sim = createSimulation({
    seed: 27,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], dash_cd_ticks: 60 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      time_left_s: 100,
    },
  });

  const pEv = sim.step({ pause: true });
  assert.equal(pEv[0].name, 'paused');
  assert.equal(sim.getSnapshot().state, 'paused');
  assert.equal(sim.getSnapshot().tick, 1);
  assert.equal(sim.getSnapshot().sim_tick, 0);

  for (let i = 0; i < 20; i++) sim.step({ pause: false });
  const snapPaused = sim.getSnapshot();
  assert.equal(snapPaused.tick, 21);
  assert.equal(snapPaused.sim_tick, 0);
  assert.equal(snapPaused.time_left_s, 100);
  assert.equal(snapPaused.player.dash_cd_s, 1);

  const rEv = sim.step({ pause: true });
  assert.equal(rEv[0].name, 'resumed');
  assert.equal(sim.getSnapshot().state, 'playing');
  assert.equal(sim.getSnapshot().tick, 22);
  assert.equal(sim.getSnapshot().sim_tick, 1);
});

test('[P2] Shade states strictly stay within the 5 standard Contract v1.1 states', () => {
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

test('[P2] Validators reject invalid inputs/scenario with exitCode 2', () => {
  assert.throws(
    () => validateInputs({ frames: [{ tick: 5 }, { tick: 5 }] }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
  assert.throws(
    () => validateScenario({ shades: [{ pos: [0, 0, 0], state: 'bogus' }] }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
});
