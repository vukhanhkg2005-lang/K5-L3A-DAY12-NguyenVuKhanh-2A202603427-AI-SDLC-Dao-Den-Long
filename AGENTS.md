# AGENTS.md — Đảo Đèn Lồng (AI SDLC Lab)

## Commands
- Install & build: `npm ci && npm run build`
- Run GUI (after build, with local-disk leaderboard): `node src/run.js` (or `npm start`)
- Export local leaderboard: `node src/run.js --export-leaderboard out.json`
- Run headless CLI: `node src/headless.js --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`
- Run 3D Benchmark (1280x720, 200 Shades + 100 Motes): `node src/bench.js --seed 42 --duration 30 --out bench.json`
- Run Headless Soak Test (10 nights): `node --expose-gc src/soak.js --seed 7 --nights 10 --out soak.json`
- Run all automated checks: `npm test` (`test:unit` + `test:scenarios`)

## Architecture Rules
1. **Strict Sim/Render Split:** `src/sim/` MUST remain pure JavaScript with zero browser/DOM/Three.js/Node-fs dependencies.
2. **Single Source of Truth:** All gameplay constants come from `game.contract.json` (`contract_version: "1.3"`, `tuning`). Never hardcode duplicate tuning constants in `src/sim/`.
3. **100% Determinism:** All simulation randomness MUST use the seeded PRNG (`src/sim/prng.js`). Never call `Math.random()` or `Date.now()` inside `src/sim/`.
4. **Headless & Benchmark Purity:** Visual/audio creativity (clouds, starfield, Web Audio, colorblind palette) lives exclusively in `src/render/`, MUST NOT affect headless JSONL output, and MUST be disabled in benchmark/soak scenes so every submission is measured on the exact standard scene.

## Test Contract v1.3 Invariants (Phase 4 — "Bình minh: phát hành v1.0.0")
- Preserves 100% of v1.0–v1.2 invariants: 60 Hz fixed tick, integer `1/60` fuel units, 12-step tick order, 6 Shade states (`spawning`, `wander`, `chase`, `recoil`, `stunned`, `drain`), `dawn_survived`/`dawn`/`no_flames`, exit code `2` on invalid `inputs`/`scenario`.
- **Benchmark (`bench_cmd`):** Window `1280x720` non-fullscreen, Night 1, 200 Shades (`wander`, seed 42), 100 Motes, `L1..L3` lit (`fuel = 100`), spawning/damage/pickup/decay/end disabled, Mây stationary at `(0,0,0)`, camera orbiting `(0,0,0)` at `R = 30m, Y = 15m` starting `(30,15,0)` CCW from above (`15s/rev`), `3s` warmup + `--duration` s measure. Target thresholds: `avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`.
- **Soak Test (`soak_cmd`):** Runs `--nights` consecutive headless nights cycling `1 -> 2 -> 3` in one process (night `i` uses `seed + i`, seeded random inputs). Target thresholds: `crashes == 0`, `mem_end_mb <= 1.2 * mem_start_mb`.
- **Leaderboard (`--export-leaderboard`):** Persisted on local disk (`~/.dao-den-long/leaderboard.json`), Top 10 sorted by `score` desc then earliest `achieved_at`, exported as `{"entries": [...]}` via `<run_cmd> --export-leaderboard <out.json>`.
- **Accessibility:** Rebindable controls (all 9 actions + conflict detection + reset defaults), visual cues/subtitles (Shade spawn + edge arrow, wind warning, last 10s, lantern `< 30` fuel), Reduce Motion mode, minimum `18px` UI font at `1280x720` with `1.25x` Large Text toggle.

## Verification & Change Request Rule (STRICT)
- NEVER silently `.skip()` or delete tests. Run all Phase 1–4 checks (`npm test`, `bench_cmd`, `soak_cmd`, `--export-leaderboard`, `npm run build`) and save real proof before releasing.
