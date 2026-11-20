---
name: verify-phase
description: Run unit tests, Phase 1–3 regression + Phase 4 leaderboard/soak/bench/build checks, saving fresh real evidence to bench.json, soak.json, and docs/evidence/phase4/.
---

# Verify Phase Skill (Phase 4 — Contract v1.3 · v1.0.0)

Use this skill before tagging `phase-4` and publishing Release `v1.0.0`.

## Steps
1. Run full unit & headless scenario suite (`npm test`) — zero skipped tests.
2. Run production build (`npm run build`).
3. Run Soak Test (`node src/soak.js --seed 7 --nights 10 --out soak.json`) and assert `crashes === 0` and `mem_end_mb <= 1.2 * mem_start_mb`.
4. Run 3D Benchmark (`node src/bench.js --seed 42 --duration 30 --out bench.json`) and check `avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`.
5. Verify local leaderboard export (`node src/run.js --export-leaderboard <tmp.json>`).
6. Never hand-edit `bench.json`, `soak.json`, or any proof logs.
