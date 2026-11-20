# AGENTS.md — Đảo Đèn Lồng (AI SDLC Lab)

## Commands
- Install & build: `npm ci && npm run build`
- Run GUI (after build): `npm start` (or `npm run dev` during development)
- Run headless CLI: `node src/headless.js --seed <int> --night 1 --ticks <int> --out <file.jsonl>`
- Run all checks: `npm test` (`test:unit` + `test:scenarios`)

## Architecture Rules
1. **Strict Sim/Render Split:** `src/sim/` MUST remain pure JavaScript with zero browser/DOM/Three.js/Node-fs dependencies.
2. **Single Source of Truth:** All gameplay constants come from `game.contract.json` (`tuning`). Never hardcode duplicate tuning constants in `src/sim/`.
3. **100% Determinism:** All simulation randomness MUST use the seeded PRNG (`src/sim/prng.js`). Never call `Math.random()` or `Date.now()` inside `src/sim/`.
4. **Headless Purity:** Visual/audio creativity lives exclusively in `src/render/` and MUST NOT affect simulation state or headless JSONL output.

## Test Contract v1.0 Invariants
- Fixed 60 Hz tick (`DT = 1 / 60`). Tick 0 snapshot is taken after scenario setup, before any input.
- Step `k` (`0..N-1`) reads input for tick `k` and produces state `k+1`; events record `tick = k+1`.
- Distances are measured in horizontal XZ plane (`distXZ <= r`), ground is `Y = 0`.
- `inputs.frames` ticks must be strictly increasing; invalid `inputs` or `scenario` MUST exit with code `2`.
- Scenario setup emits zero events and grants zero score.
- Coordinates and `time_left_s` in JSONL are rounded to 3 decimal places.

## Verification Rule
- Never claim done without running `npm test` and verifying real command outputs.
- Never fake tests or hand-edit proof outputs. Update `docs/proof/` from real runs before tagging.
