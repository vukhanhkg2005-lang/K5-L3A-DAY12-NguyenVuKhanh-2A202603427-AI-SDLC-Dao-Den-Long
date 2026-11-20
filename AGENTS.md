# AGENTS.md — Đảo Đèn Lồng (AI SDLC Lab)

## Commands
- Install & build: `npm ci && npm run build`
- Run GUI (after build): `npm start` (or `npm run dev` during development)
- Run headless CLI: `node src/headless.js --seed <int> --night <1|2|3> --ticks <int> --out <file.jsonl>`
- Run all checks: `npm test` (`test:unit` + `test:scenarios`)

## Architecture Rules
1. **Strict Sim/Render Split:** `src/sim/` MUST remain pure JavaScript with zero browser/DOM/Three.js/Node-fs dependencies.
2. **Single Source of Truth:** All gameplay constants come from `game.contract.json` (`contract_version: "1.2"`, `tuning`). Never hardcode duplicate tuning constants in `src/sim/`.
3. **100% Determinism:** All simulation randomness MUST use the seeded PRNG (`src/sim/prng.js`). Never call `Math.random()` or `Date.now()` inside `src/sim/`.
4. **Headless Purity:** Visual/audio creativity (clouds, starfield, Web Audio, colorblind palette) lives exclusively in `src/render/` and MUST NOT affect simulation state or headless JSONL output.

## Test Contract v1.2 Invariants (Phase 3 — "Đèn cạn dầu")
- Fixed 60 Hz tick (`DT = 1 / 60`), supporting `--night 1|2|3` (Đảo Bến `240s`, Đảo Cau `270s`, Đảo Chuông `300s`).
- **Integer Fuel Units:** Lantern fuel MUST be stored internally as exact integers in `1/60` units (`fuel_max = 100` -> `6000` units; `low_fuel_threshold = 30` -> `1800` units; natural decay `1` unit/tick; Shade `drain` `5` units/tick). Only divide by `60` and round to **1 decimal place** when emitting JSONL snapshots/events.
- **Lantern Lifecycle & Refuel:**
  - First light costs `10`, relight (`ever_lit == true`) costs `5`; both set `fuel = 100` (`6000` units), increment `successful_lights`, and emit `lantern_lit { lantern_id, relight }`.
  - Refueling a lit non-full lantern uses `used = min(carried, ceil((6000 - fuelUnits) / 600))`, emits `refuel { lantern_id, amount, fuel }`, and skips already-full lanterns.
  - Fuel `<= 0` immediately extinguishes the lantern after Step 2 (`lit = false`, `deposited = 0`, `ever_lit = true`, emits `lantern_out`).
- **Mandatory 12-step tick order:**
  1. Read input (`pause` rising-edge first; if just paused, stop step here).
  2. Decrement timers AND subtract fuel from lit lanterns (`1` unit/tick + `5` units/tick per `drain` Shade, emitting `fuel_drain` every 60 drain ticks); **immediately after Step 2**, extinguish lanterns with `fuelUnits <= 0` (`lantern_out`).
  3. Move Mây (jump, dash, jump pads, wind, cliffs/ramps) then check island fall (`Y < -10`).
  4. Pick up motes (up to dynamic `capacity = min(20, 10 + 2 * successful_lights)`) and charms (`XZ <= 1.0m` & `|ΔY| <= 1.5m`).
  5. Interact with nearest eligible lantern (unlit OR lit non-full, `XZ <= 2.0m`, tie-break lowest `id`).
  6. Update safe zones (`safe_radius = 6.0m` ONLY when `lit && fuelUnits >= 1800`; push-out `<= 30` ticks without damage on lighting or refueling from `< 30` to `>= 30`).
  7. Pulse (`center = player.pos + (0,0.8,0)`, 3D radius `<= 5.0m`, cost `3`, stun `120` ticks, push `4m` in first `15` ticks; `+15` score if Shade was in `drain`, else `+5`).
  8. Move Shades (`spawning`, `wander`, `chase`, `recoil`, `stunned`, `drain`) and Drifters (Gió Lạc).
  9. Collisions: **Drifter steal first**, then **Shade hit** (ascending `id` order).
  10. Scheduled spawns (motes, shades, drifters — interact from next tick only).
  11. Win/Loss check (NO early win on all lit! `no_flames` first even on dawn tick; else at dawn `lit >= ceil(0.6 * total)` -> `dawn_survived`, else `dawn`).
  12. Emit snapshot if due.
- **Standard Shade states ONLY (6 states):** `spawning`, `wander`, `chase`, `recoil`, `stunned`, `drain`.
- **Standard Scoring (v1.2):** `+5` per mote deposited/refueled, `+100` first light, `+40` relight, `+5` Pulse hit (`+15` if Shade was `drain`), at dawn on win ONLY: `+(50 + floor(fuel))` per lit lantern + `+50 * flames`. No time-left bonus.
- **Invalid `inputs` or `scenario`** MUST exit with code `2`.

## Verification & Change Request Rule (STRICT)
- **NEVER silently `.skip()` or delete tests without explicit documentation.** When a Change Request replaces an old rule (e.g., `all_lit` -> `dawn_survived`, scoring, night durations), update or remove affected tests explicitly and document every change in `CHANGELOG.md` and `docs/phase3-report.md`.
- Always run all Phase 1–2 non-replaced regression tests alongside Phase 3 tests (`npm test`) and save fresh real proof to `docs/evidence/phase3/`.
