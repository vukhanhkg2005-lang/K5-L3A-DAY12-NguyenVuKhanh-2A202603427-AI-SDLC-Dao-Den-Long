import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimulation, DT } from '../src/sim/simulation.js';
import { transformMoveInput, distXZ } from '../src/sim/math.js';
import { validateInputs, validateScenario, ContractFormatError } from '../src/sim/validators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../game.contract.json'), 'utf8')
);
const tuning = contract.tuning;

test('transformMoveInput follows Contract v1.0 rotation and normalization', () => {
  const [x0, z0] = transformMoveInput([0, 1], 0);
  assert.ok(Math.abs(x0) < 1e-9 && Math.abs(z0 - 1) < 1e-9);

  // theta = 90 deg: cos=0, sin=1 => x' = z, z' = -x
  const [x90, z90] = transformMoveInput([0, 1], 90);
  assert.ok(Math.abs(x90 - 1) < 1e-9 && Math.abs(z90) < 1e-9);

  const [x90r, z90r] = transformMoveInput([1, 0], 90);
  assert.ok(Math.abs(x90r) < 1e-9 && Math.abs(z90r + 1) < 1e-9);

  // Diagonal [1, 1] has length sqrt(2) > 1 -> must normalize to length 1
  const [dx, dz] = transformMoveInput([1, 1], 0);
  assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 1e-9);
});

test('tick 0 snapshot, step k -> event tick k+1, and exact time_left_s', () => {
  const sim = createSimulation({
    seed: 1,
    night: 1,
    tuning,
    scenario: {
      random_motes: false,
      random_shades: false,
      motes: [[0, 0, 1]],
      shades: [],
      time_left_s: 120,
    },
  });

  const snap0 = sim.getSnapshot();
  assert.equal(snap0.tick, 0);
  assert.equal(snap0.sim_tick, 0);
  assert.equal(snap0.time_left_s, 120);
  assert.equal(snap0.score, 0);
  assert.equal(snap0.motes_active, 1);

  // Mote at (0,0,1) is within pickup_radius (1.6) from (0,0,0), picked on step k=0 -> tick=1
  const evs = sim.step({ move: [0, 0], cam_yaw_deg: 0 });
  assert.equal(evs.length, 1);
  assert.equal(evs[0].tick, 1);
  assert.equal(evs[0].name, 'mote_picked');
  assert.equal(evs[0].data.carried, 1);

  for (let i = 1; i < 60; i++) {
    sim.step({ move: [0, 0], cam_yaw_deg: 0 });
  }
  const snap60 = sim.getSnapshot();
  assert.equal(snap60.tick, 60);
  assert.equal(snap60.time_left_s, 119);
});

test('mote pickup respects carry_capacity', () => {
  const motes = [];
  for (let i = 0; i < tuning.carry_capacity + 3; i++) {
    motes.push([0, 0, 0.5]);
  }
  const sim = createSimulation({
    seed: 7,
    night: 1,
    tuning,
    scenario: {
      random_motes: false,
      random_shades: false,
      motes,
      shades: [],
    },
  });

  const evs = sim.step({});
  assert.equal(evs.filter((e) => e.name === 'mote_picked').length, tuning.carry_capacity);
  assert.equal(sim.getSnapshot().player.carried, tuning.carry_capacity);
  assert.equal(sim.getSnapshot().motes_active, 3);
});

test('deposit rising-edge, lantern lighting, and win bonus score', () => {
  const sim = createSimulation({
    seed: 42,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: tuning.lantern_cost, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      lanterns: [
        { id: 'L1', pos: [0, 0, 1], deposited: 0, lit: false },
        { id: 'L2', lit: true },
        { id: 'L3', lit: true },
        { id: 'L4', lit: true },
        { id: 'L5', lit: true },
      ],
      time_left_s: 100,
    },
  });

  // Scenario setup must NOT award score or win prematurely
  assert.equal(sim.getSnapshot().score, 0);
  assert.equal(sim.getSnapshot().state, 'playing');

  // Press interact on step 0 -> deposit all needed -> lantern_lit -> game_over won
  const evs = sim.step({ interact: true });
  assert.deepEqual(
    evs.map((e) => e.name),
    ['deposit', 'lantern_lit', 'game_over']
  );
  assert.equal(evs[0].data.lantern_id, 'L1');
  assert.equal(evs[0].data.amount, tuning.lantern_cost);
  assert.equal(evs[2].data.result, 'won');
  assert.equal(evs[2].data.reason, 'all_lit');

  const expectedScore =
    tuning.score.per_lantern +
    Math.floor(100 - 1 / 60) * tuning.score.per_second_left +
    3 * tuning.score.per_flame_left;
  assert.equal(sim.getEndRecord().score, expectedScore);
});

test('pulse spends motes, pushes & stuns shades, enforces cooldown and rising edge', () => {
  const sim = createSimulation({
    seed: 9,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: tuning.pulse_cost * 2, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [4, 1, 0] }],
    },
  });

  // Step 0: pulse triggers
  const evs0 = sim.step({ pulse: true });
  assert.equal(evs0.length, 1);
  assert.equal(evs0[0].name, 'pulse');
  assert.deepEqual(evs0[0].data.stunned_ids, ['S1']);

  const snap1 = sim.getSnapshot();
  assert.equal(snap1.player.carried, tuning.pulse_cost);
  assert.equal(snap1.shades[0].state, 'stunned');
  assert.ok(snap1.shades[0].pos[0] >= 4 + tuning.pulse_push_m - 0.01);
  assert.equal(snap1.score, tuning.score.per_stun);

  // Holding pulse true on step 1 must NOT trigger again (rising edge + cooldown)
  const evs1 = sim.step({ pulse: true });
  assert.equal(evs1.length, 0);

  // Release and press immediately while on cooldown -> must NOT trigger
  sim.step({ pulse: false });
  const evsCool = sim.step({ pulse: true });
  assert.equal(evsCool.length, 0);

  // Advance past pulse_stun_s (3s = 180 ticks) -> shade returns to chase
  for (let i = 0; i < Math.round(tuning.pulse_stun_s * 60); i++) {
    sim.step({ pulse: false });
  }
  assert.equal(sim.getSnapshot().shades[0].state, 'chase');
});

test('shades respect safe_radius around lit lanterns', () => {
  const sim = createSimulation({
    seed: 11,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [12, 1, 0] }],
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
    },
  });

  for (let i = 0; i < 300; i++) {
    const evs = sim.step({});
    assert.equal(evs.filter((e) => e.name === 'player_hit').length, 0);
    const shadePos = sim.getSnapshot().shades[0].pos;
    assert.ok(
      distXZ(shadePos, [0, 0, 0]) >= tuning.safe_radius,
      `Shade entered safe_radius: ${distXZ(shadePos, [0, 0, 0])} < ${tuning.safe_radius}`
    );
  }
});

test('shade hits player, drops motes, triggers invuln_s, and ends game on no_flames', () => {
  const sim = createSimulation({
    seed: 12,
    night: 1,
    tuning,
    scenario: {
      player: { pos: [0, 0, 0], carried: 4, flames: 2 },
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [{ id: 'S1', pos: [0.5, 1, 0] }],
    },
  });

  // Step 0: immediate hit
  const evs0 = sim.step({});
  assert.equal(evs0.length, 1);
  assert.equal(evs0[0].name, 'player_hit');
  assert.equal(evs0[0].data.by, 'shade');
  assert.equal(evs0[0].data.flames, 1);
  assert.equal(evs0[0].data.dropped, 2);

  // During invuln_s (2s = 120 ticks), steps 1..119 must NOT hit again
  for (let k = 1; k < Math.round(tuning.invuln_s * 60); k++) {
    const evs = sim.step({});
    assert.equal(evs.length, 0, `Unexpected hit during invuln at step ${k}`);
  }

  // Exact tick when invuln expires -> second hit -> no_flames -> game_over lost
  const evsFinal = sim.step({});
  assert.deepEqual(
    evsFinal.map((e) => e.name),
    ['player_hit', 'game_over']
  );
  assert.equal(evsFinal[1].data.result, 'lost');
  assert.equal(evsFinal[1].data.reason, 'no_flames');
  assert.equal(sim.getState(), 'lost');
});

test('dawn timeout triggers game_over lost with reason dawn', () => {
  const sim = createSimulation({
    seed: 5,
    night: 1,
    tuning,
    scenario: {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      time_left_s: 1.0,
    },
  });

  let gameOver = null;
  for (let i = 0; i < 65; i++) {
    const evs = sim.step({});
    const go = evs.find((e) => e.name === 'game_over');
    if (go) {
      gameOver = go;
      break;
    }
  }
  assert.ok(gameOver);
  assert.equal(gameOver.tick, 60);
  assert.equal(gameOver.data.result, 'lost');
  assert.equal(gameOver.data.reason, 'dawn');
});

test('validators throw ContractFormatError (exitCode 2) on malformed inputs/scenario', () => {
  assert.throws(
    () => validateInputs({ frames: [{ tick: 5 }, { tick: 5 }] }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
  assert.throws(
    () => validateInputs({ frames: [{ tick: 10 }, { tick: 3 }] }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
  assert.throws(
    () => validateInputs({ frames: [{ tick: 0, move: [2, 0] }] }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
  assert.throws(
    () => validateScenario({ time_left_s: -5 }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
  assert.throws(
    () => validateScenario({ player: { pos: [0, 0] } }),
    (err) => err instanceof ContractFormatError && err.exitCode === 2
  );
});
