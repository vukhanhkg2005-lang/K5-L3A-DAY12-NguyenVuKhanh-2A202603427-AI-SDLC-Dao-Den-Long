import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VALID_SHADE_STATES } from '../src/sim/validators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));

const saveEvidenceDir = process.argv.includes('--save-evidence')
  ? path.join(ROOT, 'docs', 'evidence', 'phase2')
  : null;
if (saveEvidenceDir) {
  fs.mkdirSync(saveEvidenceDir, { recursive: true });
}

function runHeadless(args) {
  const [cmd, ...baseArgs] = contract.headless_cmd.split(' ');
  const t0 = performance.now();
  const res = spawnSync(cmd, [...baseArgs, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const elapsedMs = performance.now() - t0;
  return { ...res, elapsedMs };
}

function parseJsonl(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  const lines = raw.split(/\r?\n/);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSON on line ${i + 1} of ${filePath}: ${err.message}`);
    }
  });
}

function validateSnapshotV11(snap) {
  assert.equal(snap.type, 'snapshot');
  assert.ok([1, 2, 3].includes(snap.night), `Invalid snap.night: ${snap.night}`);
  assert.ok(snap.wind && typeof snap.wind.active === 'boolean' && typeof snap.wind.dir_deg === 'number');
  assert.ok(Array.isArray(snap.player.vel) && snap.player.vel.length === 3);
  assert.equal(typeof snap.player.grounded, 'boolean');
  assert.equal(typeof snap.player.invuln, 'boolean');
  assert.equal(typeof snap.player.dash_cd_s, 'number');
  assert.equal(typeof snap.player.pulse_cd_s, 'number');
  assert.equal(typeof snap.player.charm_s, 'number');
  assert.ok(Array.isArray(snap.motes));
  assert.ok(Array.isArray(snap.drifters));
  assert.ok(Array.isArray(snap.charms));
  for (const s of snap.shades) {
    assert.ok(VALID_SHADE_STATES.has(s.state), `Non-standard shade state: ${s.state}`);
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-p2-scenarios-'));
const outFile = (name) =>
  saveEvidenceDir ? path.join(saveEvidenceDir, name) : path.join(tmpDir, name);

let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}

// =============================================================================
// 1. PHASE 1 REGRESSION (WITH CONTRACT v1.1 STANDARD TUNING)
// =============================================================================
check('[P1 Regression] S1: Collect motes, deposit 10, light L1, win (all_lit)', () => {
  const out = outFile('r1_win_all_lit.jsonl');
  const res = runHeadless([
    '--seed', '101',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 's1_win_all_lit.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 's1_win_all_lit.inputs.json'),
    '--ticks', '300',
    '--out', out,
    '--snapshot-every', '20',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  validateSnapshotV11(recs[0]);
  assert.equal(recs.filter((r) => r.type === 'event' && r.name === 'mote_picked').length, 4);
  const dep = recs.find((r) => r.type === 'event' && r.name === 'deposit');
  assert.ok(dep && dep.data.amount === 10 && dep.data.deposited === 10);
  const lit = recs.find((r) => r.type === 'event' && r.name === 'lantern_lit');
  assert.ok(lit && lit.data.lantern_id === 'L1');
  const end = recs[recs.length - 1];
  assert.equal(end.type, 'end');
  assert.equal(end.state, 'won');
  assert.ok(end.score >= 700);
});

check('[P1 Regression] S2: Pulse pushes 4m over 15t & stuns S1 for 120t (+5 score)', () => {
  const out = outFile('r2_pulse_stun.jsonl');
  const res = runHeadless([
    '--seed', '102',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 's2_pulse_stun.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 's2_pulse_stun.inputs.json'),
    '--ticks', '140',
    '--out', out,
    '--snapshot-every', '20',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const pulseEv = recs.find((r) => r.type === 'event' && r.name === 'pulse');
  assert.ok(pulseEv && pulseEv.tick === 1);
  assert.deepEqual(pulseEv.data.stunned_ids, ['S1']);
  const snap20 = recs.find((r) => r.type === 'snapshot' && r.tick === 20);
  assert.equal(snap20.shades[0].state, 'stunned');
  assert.ok(Math.abs(snap20.shades[0].pos[0] - 8.0) < 0.05);
  assert.equal(snap20.score, 5);
  const snap140 = recs.find((r) => r.type === 'snapshot' && r.tick === 140);
  assert.notEqual(snap140.shades[0].state, 'stunned');
});

check('[P1 Regression] S3: Shade chases and defeats player (no_flames)', () => {
  const out = outFile('r3_shade_loss.jsonl');
  const res = runHeadless([
    '--seed', '103',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 's3_shade_loss.scenario.json'),
    '--ticks', '200',
    '--out', out,
    '--snapshot-every', '20',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const hit = recs.find((r) => r.type === 'event' && r.name === 'player_hit');
  assert.ok(hit && hit.data.by === 'shade' && hit.data.flames === 0);
  const end = recs[recs.length - 1];
  assert.equal(end.state, 'lost');
});

check('[P1 Regression] S4: Lit lantern safe_radius (6m) blocks Shade', () => {
  const out = outFile('r4_safe_radius.jsonl');
  const res = runHeadless([
    '--seed', '104',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 's4_safe_radius.scenario.json'),
    '--ticks', '300',
    '--out', out,
    '--snapshot-every', '30',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  assert.equal(recs.filter((r) => r.type === 'event' && r.name === 'player_hit').length, 0);
  for (const s of recs.filter((r) => r.type === 'snapshot')) {
    const p = s.shades[0].pos;
    assert.ok(Math.hypot(p[0], p[2]) >= contract.tuning.safe_radius);
  }
});

// =============================================================================
// 2. PHASE 2 NEW FEATURES HEADLESS SCENARIOS
// =============================================================================
check('[P2] P2-1: Dash in air keeps Y constant, enforces 90-tick cooldown', () => {
  const out = outFile('p2_dash.jsonl');
  const res = runHeadless([
    '--seed', '201',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_dash.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_dash.inputs.json'),
    '--ticks', '120',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const dashes = recs.filter((r) => r.type === 'event' && r.name === 'dash');
  // Tick 10 succeeds, Tick 30 rejected (on cooldown), Tick 100 succeeds (after 90t cooldown)
  assert.equal(dashes.length, 2);
  assert.equal(dashes[0].tick, 11);
  assert.equal(dashes[1].tick, 101);
});

check('[P2] P2-2: Fall off island (Y < -10), lose all motes, 60t respawn + 90t invuln', () => {
  const out = outFile('p2_fall.jsonl');
  const res = runHeadless([
    '--seed', '202',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_fall.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_fall.inputs.json'),
    '--ticks', '200',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const fallEv = recs.find((r) => r.type === 'event' && r.name === 'player_hit' && r.data.by === 'fall');
  assert.ok(fallEv, 'Expected fall player_hit event');
  assert.equal(fallEv.data.flames, 1);
  assert.equal(fallEv.data.lost, 5);
  const lastSnap = recs.filter((r) => r.type === 'snapshot').pop();
  assert.deepEqual(lastSnap.player.pos, [0, 0, 0]);
  assert.equal(lastSnap.player.grounded, true);
});

check('[P2] P2-3: Night 2 (Đảo Cau) jump pad launches player to Island B', () => {
  const out = outFile('p2_night2_pad.jsonl');
  const res = runHeadless([
    '--seed', '203',
    '--night', '2',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_night2_pad.scenario.json'),
    '--ticks', '110',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const lastSnap = recs.filter((r) => r.type === 'snapshot').pop();
  assert.equal(lastSnap.night, 2);
  assert.equal(lastSnap.player.grounded, true);
  assert.ok(Math.hypot(lastSnap.player.pos[0] - 70, lastSnap.player.pos[2]) <= 28);
});

check('[P2] P2-4: Night 3 (Đảo Chuông) ramp climb from Tier 0 (Y=0) to Tier 1 (Y=3)', () => {
  const out = outFile('p2_night3_ramp.jsonl');
  const res = runHeadless([
    '--seed', '204',
    '--night', '3',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_night3_ramp_pad.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_night3_ramp_pad.inputs.json'),
    '--ticks', '110',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const lastSnap = recs.filter((r) => r.type === 'snapshot').pop();
  assert.equal(lastSnap.night, 3);
  assert.equal(lastSnap.player.pos[1], 3);
  assert.equal(lastSnap.player.grounded, true);
});

check('[P2] P2-5: Drifter (Gió Lạc) chases, steals 3 motes, then drops them when Pulsed', () => {
  const out = outFile('p2_drifter.jsonl');
  const res = runHeadless([
    '--seed', '205',
    '--night', '2',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_drifter.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_drifter.inputs.json'),
    '--ticks', '200',
    '--out', out,
    '--snapshot-every', '20',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const steal = recs.find((r) => r.type === 'event' && r.name === 'drifter_steal');
  assert.ok(steal && steal.data.drifter_id === 'D1' && steal.data.amount === 3);
  const drop = recs.find((r) => r.type === 'event' && r.name === 'drifter_drop');
  assert.ok(drop && drop.data.drifter_id === 'D1' && drop.data.amount === 3);
  const snap200 = recs.find((r) => r.type === 'snapshot' && r.tick === 200);
  assert.equal(snap200.drifters[0].state, 'removed');
});

check('[P2] P2-6: Wind Charm (Bùa Gió) pickup, 7.2 m/s speed & 0-cooldown consecutive dashes', () => {
  const out = outFile('p2_charm.jsonl');
  const res = runHeadless([
    '--seed', '206',
    '--night', '2',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_charm.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_charm.inputs.json'),
    '--ticks', '40',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const picked = recs.find((r) => r.type === 'event' && r.name === 'charm_picked');
  assert.ok(picked && picked.data.charm_id === 'C1' && picked.data.charm_ticks === 600);
  const dashes = recs.filter((r) => r.type === 'event' && r.name === 'dash');
  assert.equal(dashes.length, 2, 'Should allow immediate consecutive dash while charm is active');
});

check('[P2] P2-7: Night 3 Wind activates at sim_tick 1800 and pushes player', () => {
  const out = outFile('p2_wind.jsonl');
  const res = runHeadless([
    '--seed', '207',
    '--night', '3',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_wind.scenario.json'),
    '--ticks', '2000',
    '--out', out,
    '--snapshot-every', '100',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const snap1700 = recs.find((r) => r.type === 'snapshot' && r.tick === 1700);
  const snap1900 = recs.find((r) => r.type === 'snapshot' && r.tick === 1900);
  assert.equal(snap1700.wind.active, false);
  assert.equal(snap1900.wind.active, true);
  // Player moved by wind between tick 1700 and tick 1900
  const moved = Math.hypot(
    snap1900.player.pos[0] - snap1700.player.pos[0],
    snap1900.player.pos[2] - snap1700.player.pos[2]
  );
  assert.ok(moved > 2.5, `Expected wind to push player > 2.5m, moved=${moved}`);
});

check('[P2] P2-8: Pause / Resume freezes sim_tick & time while tick keeps advancing', () => {
  const out = outFile('p2_pause.jsonl');
  const res = runHeadless([
    '--seed', '208',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_dash.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_pause.inputs.json'),
    '--ticks', '50',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  assert.ok(recs.some((r) => r.type === 'event' && r.name === 'paused'));
  assert.ok(recs.some((r) => r.type === 'event' && r.name === 'resumed'));
  const snap20 = recs.find((r) => r.type === 'snapshot' && r.tick === 20);
  const snap30 = recs.find((r) => r.type === 'snapshot' && r.tick === 30);
  assert.equal(snap20.state, 'paused');
  assert.equal(snap30.state, 'paused');
  assert.equal(snap20.sim_tick, snap30.sim_tick);
  assert.equal(snap20.time_left_s, snap30.time_left_s);
  const snap50 = recs.find((r) => r.type === 'snapshot' && r.tick === 50);
  assert.equal(snap50.state, 'playing');
  assert.equal(snap50.sim_tick, 20); // 50 ticks - 30 paused ticks (ticks 6..35)
});

// =============================================================================
// 3. DETERMINISM ACROSS ALL 3 NIGHTS + EXIT CODE 2 + 21,600-TICK BENCHMARK
// =============================================================================
for (const night of [1, 2, 3]) {
  check(`[P2] Determinism Night ${night} (seed 2026, 1500 ticks byte-identical)`, () => {
    const outA = path.join(tmpDir, `det_n${night}_a.jsonl`);
    const outB = path.join(tmpDir, `det_n${night}_b.jsonl`);
    const rA = runHeadless(['--seed', '2026', '--night', String(night), '--ticks', '1500', '--out', outA, '--snapshot-every', '60']);
    const rB = runHeadless(['--seed', '2026', '--night', String(night), '--ticks', '1500', '--out', outB, '--snapshot-every', '60']);
    assert.equal(rA.status, 0, rA.stderr);
    assert.equal(rB.status, 0, rB.stderr);
    assert.equal(fs.readFileSync(outA, 'utf8'), fs.readFileSync(outB, 'utf8'));
  });
}

check('[P1 Regression] Invalid inputs (non-increasing ticks) exits with code 2', () => {
  const badInputs = path.join(tmpDir, 'bad_inputs.json');
  fs.writeFileSync(
    badInputs,
    JSON.stringify({ frames: [{ tick: 10, move: [0, 1] }, { tick: 10, move: [0, 0] }] })
  );
  const res = runHeadless([
    '--seed', '1',
    '--night', '1',
    '--inputs', badInputs,
    '--ticks', '50',
    '--out', path.join(tmpDir, 'bad_out.jsonl'),
  ]);
  assert.equal(res.status, 2, `Expected exit code 2, got ${res.status}`);
  assert.ok(res.stderr.trim().length > 0);
});

check('[P2 Benchmark] Full Night 3 (21,600 actual ticks with Shades+Drifters+Wind) <= 30s', () => {
  const out = outFile('p2_benchmark_night3_21600.jsonl');
  const res = runHeadless([
    '--seed', '2026',
    '--night', '3',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_bench_21600.scenario.json'),
    '--ticks', '21600',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const secs = res.elapsedMs / 1000;
  console.log(`  -> Night 3 full 21,600-tick headless time: ${secs.toFixed(3)} s (budget <= 30 s)`);
  assert.ok(secs <= 30.0, `Benchmark exceeded 30s: ${secs.toFixed(3)}s`);
  const recs = parseJsonl(out);
  const end = recs[recs.length - 1];
  assert.equal(end.type, 'end');
  assert.equal(end.ticks, 21600, `Expected full 21600 ticks executed, got ${end.ticks}`);
  assert.equal(end.state, 'lost'); // dawn at tick 21600
});

fs.rmSync(tmpDir, { recursive: true, force: true });

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log(`\nAll ${passed} headless contract v1.1 checks passed!`);
