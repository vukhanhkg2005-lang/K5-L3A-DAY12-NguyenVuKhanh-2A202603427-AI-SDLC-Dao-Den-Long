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
  ? path.join(ROOT, 'docs', 'evidence', 'phase3')
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

function validateSnapshotV12(snap) {
  assert.equal(snap.type, 'snapshot');
  assert.ok([1, 2, 3].includes(snap.night), `Invalid snap.night: ${snap.night}`);
  assert.ok(snap.wind && typeof snap.wind.active === 'boolean' && typeof snap.wind.dir_deg === 'number');
  assert.ok(Array.isArray(snap.player.vel) && snap.player.vel.length === 3);
  assert.equal(typeof snap.player.grounded, 'boolean');
  assert.equal(typeof snap.player.capacity, 'number');
  assert.equal(typeof snap.player.invuln, 'boolean');
  assert.equal(typeof snap.player.dash_cd_s, 'number');
  assert.equal(typeof snap.player.pulse_cd_s, 'number');
  assert.equal(typeof snap.player.charm_s, 'number');
  for (const l of snap.lanterns) {
    assert.equal(typeof l.fuel, 'number');
    assert.equal(typeof l.ever_lit, 'boolean');
    assert.equal(typeof l.relit_count, 'number');
  }
  for (const s of snap.shades) {
    assert.ok(VALID_SHADE_STATES.has(s.state), `Non-standard shade state: ${s.state}`);
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-p3-scenarios-'));
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
// 1. PHASE 1–2 REGRESSION (UPDATED FOR CONTRACT v1.2 WHERE REPLACED)
// =============================================================================
check('[P1-P3 Updated] S1: Light final lantern (no early win) -> survive to dawn -> dawn_survived', () => {
  const out = outFile('r1_dawn_survived.jsonl');
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
  validateSnapshotV12(recs[0]);
  assert.equal(recs.filter((r) => r.type === 'event' && r.name === 'mote_picked').length, 4);
  const lit = recs.find((r) => r.type === 'event' && r.name === 'lantern_lit');
  assert.ok(lit && lit.data.lantern_id === 'L1' && lit.data.relight === false);
  // Must NOT end at tick 111 when L1 is lit; must run to dawn (tick 180)
  const go = recs.find((r) => r.type === 'event' && r.name === 'game_over');
  assert.ok(go && go.tick === 180 && go.data.result === 'won' && go.data.reason === 'dawn_survived');
  const end = recs[recs.length - 1];
  assert.equal(end.state, 'won');
  assert.equal(end.ticks, 180);
});

check('[P1-P2 Regression] S2: Pulse pushes 4m over 15t & stuns S1 for 120t (+5 score)', () => {
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
  assert.equal(snap20.score, 5);
});

check('[P1-P2 Regression] S3: Shade chases and defeats player (no_flames)', () => {
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
  assert.equal(recs[recs.length - 1].state, 'lost');
});

check('[P1-P2 Regression] S4: Lit lantern safe_radius (6m) blocks Shade while fuel >= 30', () => {
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

check('[P2 Regression] P2-1..P2-8: Dash, Fall, Night 2 Pad, Night 3 Ramp, Drifter, Charm, Wind, Pause', () => {
  // Dash
  const rDash = runHeadless([
    '--seed', '201', '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_dash.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_dash.inputs.json'),
    '--ticks', '120', '--out', path.join(tmpDir, 'p2_dash.jsonl'), '--snapshot-every', '20',
  ]);
  assert.equal(rDash.status, 0, rDash.stderr);
  assert.equal(parseJsonl(path.join(tmpDir, 'p2_dash.jsonl')).filter((r) => r.name === 'dash').length, 2);

  // Fall
  const rFall = runHeadless([
    '--seed', '202', '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_fall.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_fall.inputs.json'),
    '--ticks', '200', '--out', path.join(tmpDir, 'p2_fall.jsonl'), '--snapshot-every', '20',
  ]);
  assert.equal(rFall.status, 0, rFall.stderr);
  assert.ok(parseJsonl(path.join(tmpDir, 'p2_fall.jsonl')).some((r) => r.name === 'player_hit' && r.data.by === 'fall'));

  // Night 2 Jump Pad
  const rPad2 = runHeadless([
    '--seed', '203', '--night', '2',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_night2_pad.scenario.json'),
    '--ticks', '110', '--out', path.join(tmpDir, 'p2_pad2.jsonl'), '--snapshot-every', '20',
  ]);
  assert.equal(rPad2.status, 0, rPad2.stderr);
  const pad2Last = parseJsonl(path.join(tmpDir, 'p2_pad2.jsonl')).filter((r) => r.type === 'snapshot').pop();
  assert.ok(Math.hypot(pad2Last.player.pos[0] - 70, pad2Last.player.pos[2]) <= 28);

  // Night 3 Ramp
  const rRamp3 = runHeadless([
    '--seed', '204', '--night', '3',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_night3_ramp_pad.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_night3_ramp_pad.inputs.json'),
    '--ticks', '110', '--out', path.join(tmpDir, 'p2_ramp3.jsonl'), '--snapshot-every', '20',
  ]);
  assert.equal(rRamp3.status, 0, rRamp3.stderr);
  assert.equal(parseJsonl(path.join(tmpDir, 'p2_ramp3.jsonl')).filter((r) => r.type === 'snapshot').pop().player.pos[1], 3);

  // Drifter steal + Pulse drop
  const rDrift = runHeadless([
    '--seed', '205', '--night', '2',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_drifter.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_drifter.inputs.json'),
    '--ticks', '200', '--out', path.join(tmpDir, 'p2_drift.jsonl'), '--snapshot-every', '20',
  ]);
  assert.equal(rDrift.status, 0, rDrift.stderr);
  const driftRecs = parseJsonl(path.join(tmpDir, 'p2_drift.jsonl'));
  assert.ok(driftRecs.some((r) => r.name === 'drifter_steal'));
  assert.ok(driftRecs.some((r) => r.name === 'drifter_drop'));

  // Charm
  const rCharm = runHeadless([
    '--seed', '206', '--night', '2',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_charm.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_charm.inputs.json'),
    '--ticks', '40', '--out', path.join(tmpDir, 'p2_charm.jsonl'), '--snapshot-every', '10',
  ]);
  assert.equal(rCharm.status, 0, rCharm.stderr);
  assert.equal(parseJsonl(path.join(tmpDir, 'p2_charm.jsonl')).filter((r) => r.name === 'dash').length, 2);

  // Wind
  const rWind = runHeadless([
    '--seed', '207', '--night', '3',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_wind.scenario.json'),
    '--ticks', '2000', '--out', path.join(tmpDir, 'p2_wind.jsonl'), '--snapshot-every', '100',
  ]);
  assert.equal(rWind.status, 0, rWind.stderr);
  assert.equal(parseJsonl(path.join(tmpDir, 'p2_wind.jsonl')).find((r) => r.tick === 1900 && r.type === 'snapshot').wind.active, true);

  // Pause
  const rPause = runHeadless([
    '--seed', '208', '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_dash.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p2_pause.inputs.json'),
    '--ticks', '50', '--out', path.join(tmpDir, 'p2_pause.jsonl'), '--snapshot-every', '10',
  ]);
  assert.equal(rPause.status, 0, rPause.stderr);
  assert.equal(parseJsonl(path.join(tmpDir, 'p2_pause.jsonl')).find((r) => r.tick === 50 && r.type === 'snapshot').sim_tick, 20);
});

// =============================================================================
// 2. PHASE 3 NEW MECHANICS HEADLESS SCENARIOS (CONTRACT v1.2)
// =============================================================================
check('[P3] P3-1: Lantern fuel decay (1/60), lantern_out, relight cost=5 (+40), capacity 10->12', () => {
  const out = outFile('p3_fuel_relight.jsonl');
  const res = runHeadless([
    '--seed', '301',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p3_fuel_relight.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p3_fuel_relight.inputs.json'),
    '--ticks', '90',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const outEv = recs.find((r) => r.type === 'event' && r.name === 'lantern_out');
  assert.ok(outEv && outEv.tick === 60 && outEv.data.lantern_id === 'L1');
  const litEv = recs.find((r) => r.type === 'event' && r.name === 'lantern_lit');
  assert.ok(litEv && litEv.tick === 66 && litEv.data.relight === true);
  const snap70 = recs.find((r) => r.type === 'snapshot' && r.tick === 70);
  assert.equal(snap70.lanterns[0].lit, true);
  assert.equal(snap70.lanterns[0].relit_count, 1);
  assert.equal(snap70.player.capacity, 12);
  assert.equal(snap70.score, 65); // 5*5 + 40
});

check('[P3] P3-2: Refuel low lantern from <30 to 100 (+5/mote) & push draining Shade out of safe zone', () => {
  const out = outFile('p3_refuel_pushout.jsonl');
  const res = runHeadless([
    '--seed', '302',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p3_refuel_pushout.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p3_refuel_pushout.inputs.json'),
    '--ticks', '50',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const refEv = recs.find((r) => r.type === 'event' && r.name === 'refuel');
  assert.ok(refEv && refEv.data.lantern_id === 'L1' && refEv.data.amount === 8 && refEv.data.fuel === 100);
  assert.equal(recs.filter((r) => r.type === 'event' && r.name === 'player_hit').length, 0);
  const snap40 = recs.find((r) => r.type === 'snapshot' && r.tick === 40);
  const sPos = snap40.shades[0].pos;
  assert.ok(Math.hypot(sPos[0], sPos[2] - 1) >= contract.tuning.safe_radius);
});

check('[P3] P3-3a: Shade wanders to weak lantern (<30), enters drain, emits fuel_drain every 60t', () => {
  const out = outFile('p3_shade_drain.jsonl');
  const res = runHeadless([
    '--seed', '303',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p3_shade_drain_pulse.scenario.json'),
    '--ticks', '160',
    '--out', out,
    '--snapshot-every', '20',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const fds = recs.filter((r) => r.type === 'event' && r.name === 'fuel_drain');
  assert.ok(fds.length >= 2 && fds[0].data.lantern_id === 'L1' && fds[0].data.shade_id === 'S1');
  const snap100 = recs.find((r) => r.type === 'snapshot' && r.tick === 100);
  assert.equal(snap100.shades[0].state, 'drain');
});

check('[P3] P3-3b: Pulse hitting a draining Shade awards +15 score', () => {
  const out = outFile('p3_drain_pulse_bonus.jsonl');
  const res = runHeadless([
    '--seed', '305',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p3_drain_pulse_bonus.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 'p3_shade_drain_pulse.inputs.json'),
    '--ticks', '30',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const pulseEv = recs.find((r) => r.type === 'event' && r.name === 'pulse');
  assert.ok(pulseEv && pulseEv.tick === 1 && pulseEv.data.stunned_ids[0] === 'S1');
  const snap10 = recs.find((r) => r.type === 'snapshot' && r.tick === 10);
  assert.equal(snap10.score, 15);
  assert.equal(snap10.shades[0].state, 'stunned');
});

check('[P3] P3-4: Dawn loss when lit lanterns < 60% (2/5 on Night 1)', () => {
  const out = outFile('p3_dawn_loss.jsonl');
  const res = runHeadless([
    '--seed', '304',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 'p3_dawn_loss.scenario.json'),
    '--ticks', '180',
    '--out', out,
    '--snapshot-every', '30',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const go = recs.find((r) => r.type === 'event' && r.name === 'game_over');
  assert.ok(go && go.data.result === 'lost' && go.data.reason === 'dawn');
});

// =============================================================================
// 3. DETERMINISM (ALL 3 NIGHTS), EXIT CODE 2 & FULL NIGHT 3 BENCHMARK
// =============================================================================
for (const night of [1, 2, 3]) {
  check(`[P3] Determinism Night ${night} (seed 2026, 1500 ticks byte-identical)`, () => {
    const outA = path.join(tmpDir, `det_n${night}_a.jsonl`);
    const outB = path.join(tmpDir, `det_n${night}_b.jsonl`);
    const rA = runHeadless(['--seed', '2026', '--night', String(night), '--ticks', '1500', '--out', outA, '--snapshot-every', '60']);
    const rB = runHeadless(['--seed', '2026', '--night', String(night), '--ticks', '1500', '--out', outB, '--snapshot-every', '60']);
    assert.equal(rA.status, 0, rA.stderr);
    assert.equal(rB.status, 0, rB.stderr);
    assert.equal(fs.readFileSync(outA, 'utf8'), fs.readFileSync(outB, 'utf8'));
  });
}

check('[P1-P3 Regression] Invalid inputs (non-increasing ticks) exits with code 2', () => {
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

check('[P3 Benchmark] Full Night 3 (18,000 ticks = 300s v1.2 with Shades+Drifters+Wind) <= 30s', () => {
  const out = outFile('p3_benchmark_night3_18000.jsonl');
  const res = runHeadless([
    '--seed', '2026',
    '--night', '3',
    '--scenario', path.join(SCENARIOS_DIR, 'p2_bench_21600.scenario.json'),
    '--ticks', '18000',
    '--out', out,
    '--snapshot-every', '60',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const secs = res.elapsedMs / 1000;
  console.log(`  -> Night 3 full 18,000-tick headless time: ${secs.toFixed(3)} s (budget <= 30 s)`);
  assert.ok(secs <= 30.0, `Benchmark exceeded 30s: ${secs.toFixed(3)}s`);
  const recs = parseJsonl(out);
  const end = recs[recs.length - 1];
  assert.equal(end.ticks, 18000);
});

fs.rmSync(tmpDir, { recursive: true, force: true });

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log(`\nAll ${passed} headless contract v1.2 checks passed!`);
