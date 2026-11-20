import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));

function runHeadless(args) {
  const [cmd, ...baseArgs] = contract.headless_cmd.split(' ');
  return spawnSync(cmd, [...baseArgs, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-scenarios-'));
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

// 1. Scenario 1: Collect 4 motes -> deposit -> light L1 -> Win (all_lit)
check('S1: Collect motes, light final lantern, win (all_lit)', () => {
  const out = path.join(tmpDir, 's1.jsonl');
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
  assert.equal(recs[0].type, 'snapshot');
  assert.equal(recs[0].tick, 0);
  const picked = recs.filter((r) => r.type === 'event' && r.name === 'mote_picked');
  assert.equal(picked.length, 4);
  const lit = recs.find((r) => r.type === 'event' && r.name === 'lantern_lit');
  assert.ok(lit && lit.data.lantern_id === 'L1');
  const go = recs.find((r) => r.type === 'event' && r.name === 'game_over');
  assert.ok(go && go.data.result === 'won' && go.data.reason === 'all_lit');
  const end = recs[recs.length - 1];
  assert.equal(end.type, 'end');
  assert.equal(end.state, 'won');
  assert.ok(end.score > 400);
});

// 2. Scenario 2: Pulse stuns and pushes shade S1
check('S2: Pulse pushes & stuns Shade S1', () => {
  const out = path.join(tmpDir, 's2.jsonl');
  const res = runHeadless([
    '--seed', '102',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 's2_pulse_stun.scenario.json'),
    '--inputs', path.join(SCENARIOS_DIR, 's2_pulse_stun.inputs.json'),
    '--ticks', '200',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const pulseEv = recs.find((r) => r.type === 'event' && r.name === 'pulse');
  assert.ok(pulseEv && pulseEv.tick === 1);
  assert.deepEqual(pulseEv.data.stunned_ids, ['S1']);
  const snap10 = recs.find((r) => r.type === 'snapshot' && r.tick === 10);
  assert.equal(snap10.shades[0].state, 'stunned');
  assert.ok(snap10.shades[0].pos[0] >= 5 + contract.tuning.pulse_push_m - 0.01);
  const snap190 = recs.find((r) => r.type === 'snapshot' && r.tick === 190);
  assert.equal(snap190.shades[0].state, 'chase');
});

// 3. Scenario 3: Shade catches player -> player_hit -> no_flames loss
check('S3: Shade chases and defeats player (no_flames)', () => {
  const out = path.join(tmpDir, 's3.jsonl');
  const res = runHeadless([
    '--seed', '103',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 's3_shade_loss.scenario.json'),
    '--ticks', '200',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const hit = recs.find((r) => r.type === 'event' && r.name === 'player_hit');
  assert.ok(hit && hit.data.by === 'shade' && hit.data.flames === 0);
  const end = recs[recs.length - 1];
  assert.equal(end.type, 'end');
  assert.equal(end.state, 'lost');
});

// 4. Scenario 4: Safe radius keeps shade outside lit lantern
check('S4: Lit lantern safe_radius blocks Shade', () => {
  const out = path.join(tmpDir, 's4.jsonl');
  const res = runHeadless([
    '--seed', '104',
    '--night', '1',
    '--scenario', path.join(SCENARIOS_DIR, 's4_safe_radius.scenario.json'),
    '--ticks', '300',
    '--out', out,
    '--snapshot-every', '10',
  ]);
  assert.equal(res.status, 0, res.stderr);
  const recs = parseJsonl(out);
  const hits = recs.filter((r) => r.type === 'event' && r.name === 'player_hit');
  assert.equal(hits.length, 0);
  const snaps = recs.filter((r) => r.type === 'snapshot');
  for (const s of snaps) {
    const p = s.shades[0].pos;
    const d = Math.hypot(p[0], p[2]);
    assert.ok(d >= contract.tuning.safe_radius, `Tick ${s.tick}: shade dist ${d} < safe_radius`);
  }
});

// 5. Determinism: Same seed + default Night 1 run twice -> byte-for-byte identical
check('S5: Determinism (two default Night 1 runs with seed 2026 are byte-identical)', () => {
  const outA = path.join(tmpDir, 'detA.jsonl');
  const outB = path.join(tmpDir, 'detB.jsonl');
  const resA = runHeadless(['--seed', '2026', '--night', '1', '--ticks', '600', '--out', outA]);
  const resB = runHeadless(['--seed', '2026', '--night', '1', '--ticks', '600', '--out', outB]);
  assert.equal(resA.status, 0, resA.stderr);
  assert.equal(resB.status, 0, resB.stderr);
  const rawA = fs.readFileSync(outA, 'utf8');
  const rawB = fs.readFileSync(outB, 'utf8');
  assert.equal(rawA, rawB, 'Determinism mismatch between identical runs!');
});

// 6. Contract error handling: invalid inputs -> exit code 2 + stderr message
check('S6: Invalid inputs (non-increasing ticks) exits with code 2', () => {
  const badInputs = path.join(tmpDir, 'bad_inputs.json');
  fs.writeFileSync(
    badInputs,
    JSON.stringify({ frames: [{ tick: 10, move: [0, 1] }, { tick: 10, move: [0, 0] }] })
  );
  const out = path.join(tmpDir, 'bad_out.jsonl');
  const res = runHeadless([
    '--seed', '1',
    '--night', '1',
    '--inputs', badInputs,
    '--ticks', '50',
    '--out', out,
  ]);
  assert.equal(res.status, 2, `Expected exit code 2, got ${res.status}`);
  assert.ok(res.stderr.trim().length > 0, 'Expected error message on stderr');
});

// Cleanup temp directory
fs.rmSync(tmpDir, { recursive: true, force: true });

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log(`\nAll ${passed} headless contract scenario checks passed!`);
