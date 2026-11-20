# AGENTS.md — Đảo Đèn Lồng (AI SDLC Lab)

## Commands
- Install & build: `npm ci && npm run build`
- Run GUI (after build): `npm start` (or `npm run dev` during development)
- Run headless CLI: `node src/headless.js --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`
- Run all checks: `npm test` (`test:unit` + `test:scenarios`)

## Architecture Rules
1. **Strict Sim/Render Split:** `src/sim/` MUST remain pure JavaScript with zero browser/DOM/Three.js/Node-fs dependencies.
2. **Single Source of Truth:** All gameplay constants come from `game.contract.json` (`contract_version: "1.1"`, `tuning`). Never hardcode duplicate tuning constants in `src/sim/`.
3. **100% Determinism:** All simulation randomness MUST use the seeded PRNG (`src/sim/prng.js`). Never call `Math.random()` or `Date.now()` inside `src/sim/`.
4. **Headless Purity:** Visual/audio creativity (clouds, starfield, Web Audio, particles) lives exclusively in `src/render/` and MUST NOT affect simulation state or headless JSONL output.

## Test Contract v1.1 Invariants (Phase 2)
- Fixed 60 Hz tick (`DT = 1 / 60`), supporting `--night 1|2|3` (Đảo Bến, Đảo Cau, Đảo Chuông).
- **Mandatory 12-step tick order:**
  1. Read input (`pause` rising-edge first; if just paused, stop step here).
  2. Decrement timers (time, cooldowns, invuln, stun/recoil, charm, dropped-mote TTL, charm respawn, wind).
  3. Move Mây (jump, dash, jump pads, wind, cliffs/ramps) then check island fall (`Y < -10`).
  4. Pick up motes and charms (`XZ <= 1.0m` & `|ΔY| <= 1.5m`).
  5. Interact with nearest unlit lantern (`XZ <= 2.0m`, tie-break lowest `id`).
  6. Update lit-lantern safe zones (`safe_radius = 6.0m`, push-out `<= 30` ticks without damage).
  7. Pulse (`center = player.pos + (0,0.8,0)`, 3D radius `<= 5.0m`, cost `3`, stun `120` ticks, push `4m` in first `15` ticks).
  8. Move Shades and Drifters (Gió Lạc).
  9. Collisions: **Drifter steal first**, then **Shade hit** (ascending `id` order).
  10. Scheduled spawns (motes, shades, drifters — newly spawned entities interact from next tick only).
  11. Win/Loss check (`no_flames` > `all_lit` even on exact timeout tick > `dawn`).
  12. Emit snapshot if due.
- **Pause behavior:** When `paused`, `tick` increments while `sim_tick`, time, cooldowns, spawns, and TTL freeze; snapshot records `state: "paused"`.
- **Standard Shade states ONLY:** `spawning`, `wander`, `chase`, `recoil`, `stunned`.
- **Standard Scoring:** `+10` per deposited mote (not on pickup), `+100` per lit lantern, `+5` per Shade hit by Pulse (including already stunned), `+floor(time_left_s)*2 + 50*flames` on win.
- **Invalid `inputs` or `scenario`** MUST exit with code `2`. Coordinates and floats in JSONL rounded to 3 decimal places.
- **Performance:** Full 21,600-tick Night 3 headless run MUST finish in `<= 30 s`.

## Verification & Regression Rule
- Always run Phase 1 regression tests with standardized v1.1 tuning alongside Phase 2 tests (`npm test`).
- If a Phase 2 rule replaces a Phase 1 assumption (e.g., `per_mote` scored on deposit, `fall_enabled: true`), update affected tests explicitly with a documented reason — never silently skip tests.
- Never claim done without running real commands and saving fresh proof to `docs/evidence/phase2/`.
