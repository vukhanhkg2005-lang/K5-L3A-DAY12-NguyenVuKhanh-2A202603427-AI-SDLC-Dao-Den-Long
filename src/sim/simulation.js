import { createRng } from './prng.js';
import { EPS, round3, roundPos, distXZ, transformMoveInput, clampToCircleXZ } from './math.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const DEFAULT_ISLAND_RADIUS = 42;
const GRAVITY = -20.0;
const JUMP_VELOCITY = 7.5;
const SAFE_MARGIN = 0.05;

const DEFAULT_LANTERN_RING_RADIUS = 22;

function createDefaultLanterns(count) {
  const lanterns = [];
  for (let i = 0; i < count; i++) {
    // Start at +Z (0, 0, 22) and go clockwise evenly around the island
    const angle = (i * 2 * Math.PI) / count;
    const x = round3(Math.sin(angle) * DEFAULT_LANTERN_RING_RADIUS);
    const z = round3(Math.cos(angle) * DEFAULT_LANTERN_RING_RADIUS);
    lanterns.push({
      id: `L${i + 1}`,
      pos: [x, 0, z],
      lit: false,
      deposited: 0,
    });
  }
  return lanterns;
}

export function createSimulation({ seed = 1, night = 1, tuning, scenario = null }) {
  if (!tuning) {
    throw new Error('tuning config from game.contract.json is required');
  }
  if (night !== 1) {
    throw new Error(`Unsupported night: ${night}. Phase 1 supports --night 1 only.`);
  }

  const rng = createRng(seed);

  const player = {
    pos: [0, 0, 0],
    vy: 0,
    flames: tuning.flames,
    carried: 0,
    facingYaw: 0,
  };

  const lanterns = createDefaultLanterns(tuning.lantern_count_night1 || 5);
  let motes = [];
  let shades = [];
  let nextMoteId = 1;
  let nextShadeId = 1;

  const randomMotes = scenario && scenario.random_motes !== undefined ? scenario.random_motes : true;
  const randomShades = scenario && scenario.random_shades !== undefined ? scenario.random_shades : true;
  const initialTimeLeftS =
    scenario && scenario.time_left_s !== undefined ? scenario.time_left_s : tuning.night1_duration_s;

  // Apply scenario player overrides
  if (scenario && scenario.player) {
    if (scenario.player.pos) {
      player.pos = [scenario.player.pos[0], scenario.player.pos[1], scenario.player.pos[2]];
    }
    if (scenario.player.carried !== undefined) {
      player.carried = scenario.player.carried;
    }
    if (scenario.player.flames !== undefined) {
      player.flames = scenario.player.flames;
    }
  }

  // Apply scenario lantern overrides (no events, no score)
  if (scenario && Array.isArray(scenario.lanterns)) {
    for (const ov of scenario.lanterns) {
      const target = lanterns.find((l) => l.id === ov.id);
      if (target) {
        if (ov.pos !== undefined) {
          target.pos = [ov.pos[0], ov.pos[1], ov.pos[2]];
        }
        if (ov.deposited !== undefined) {
          target.deposited = ov.deposited;
        }
        if (ov.lit !== undefined) {
          target.lit = ov.lit;
          if (ov.lit && ov.deposited === undefined && target.deposited < tuning.lantern_cost) {
            target.deposited = tuning.lantern_cost;
          }
        } else if (target.deposited >= tuning.lantern_cost) {
          target.lit = true;
        }
      }
    }
  }

  // Compute effective island radius so scenario entities placed far out are never blocked
  let maxEntityDist = 0;
  const considerPos = (p) => {
    const d = Math.hypot(p[0], p[2]);
    if (d > maxEntityDist) maxEntityDist = d;
  };
  considerPos(player.pos);
  for (const l of lanterns) considerPos(l.pos);

  // Initialize motes (scenario overrides default list)
  if (scenario && Array.isArray(scenario.motes)) {
    const usedIds = new Set();
    for (const m of scenario.motes) {
      const isArr = Array.isArray(m);
      const rawPos = isArr ? m : m.pos;
      let id = !isArr && m.id ? m.id : null;
      if (!id) {
        while (usedIds.has(`M${nextMoteId}`)) nextMoteId++;
        id = `M${nextMoteId++}`;
      }
      usedIds.add(id);
      const pos = [rawPos[0], 0, rawPos[2]];
      considerPos(pos);
      motes.push({ id, pos });
    }
  } else if (randomMotes) {
    for (let i = 0; i < 24; i++) {
      spawnRandomMote(true);
    }
  }

  // Initialize shades (scenario overrides default list)
  if (scenario && Array.isArray(scenario.shades)) {
    const usedIds = new Set();
    for (const s of scenario.shades) {
      if (s.id) usedIds.add(s.id);
    }
    for (const s of scenario.shades) {
      let id = s.id;
      if (!id) {
        while (usedIds.has(`S${nextShadeId}`)) nextShadeId++;
        id = `S${nextShadeId++}`;
        usedIds.add(id);
      }
      const pos = [s.pos[0], s.pos[1], s.pos[2]];
      considerPos(pos);
      shades.push({
        id,
        pos,
        state: s.state || 'chase',
        stunTimer: s.state === 'stunned' ? tuning.pulse_stun_s : 0,
        justStunnedThisStep: false,
      });
    }
  } else if (randomShades) {
    for (let i = 0; i < 2; i++) {
      spawnRandomShade(false);
    }
  }

  const effectiveIslandRadius = Math.max(DEFAULT_ISLAND_RADIUS, maxEntityDist + 10);

  let tick = 0;
  let simTick = 0;
  let stepsExecuted = 0;
  let timeLeftS = initialTimeLeftS;
  let score = 0;
  let state = 'playing'; // 'playing' | 'won' | 'lost'
  let endReason = null;

  let invulnTimer = 0;
  let pulseCooldownLeft = 0;
  let moteRespawnTimer = 0;
  let shadeSpawnTimer = 0;

  let prevButtons = {
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
  };

  function isFarFromLitLanterns(pos, extraMargin = 1.0) {
    const minDist = tuning.safe_radius + extraMargin;
    for (const l of lanterns) {
      if (l.lit && distXZ(pos, l.pos) < minDist) {
        return false;
      }
    }
    return true;
  }

  function spawnRandomMote(isInitial) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const pos = rng.pointInRing(4.5, 34.0);
      const nearPlayer = distXZ(pos, player.pos) < (isInitial ? 4.0 : 5.0);
      const nearLantern = lanterns.some((l) => distXZ(pos, l.pos) < 2.2);
      if (!nearPlayer && !nearLantern) {
        const id = `M${nextMoteId++}`;
        motes.push({ id, pos: [round3(pos[0]), 0, round3(pos[2])] });
        return true;
      }
    }
    const fallback = rng.pointInRing(6.0, 30.0);
    const id = `M${nextMoteId++}`;
    motes.push({ id, pos: [round3(fallback[0]), 0, round3(fallback[2])] });
    return true;
  }

  function spawnRandomShade(emitEvent, stepEvents) {
    let chosen = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const pos = rng.pointInRing(26.0, 37.0);
      if (distXZ(pos, player.pos) >= 12.0 && isFarFromLitLanterns(pos, 1.0)) {
        chosen = pos;
        break;
      }
    }
    if (!chosen) {
      chosen = rng.pointInRing(30.0, 38.0);
    }
    const id = `S${nextShadeId++}`;
    const shade = {
      id,
      pos: [round3(chosen[0]), 1.0, round3(chosen[2])],
      state: 'chase',
      stunTimer: 0,
      justStunnedThisStep: false,
    };
    shades.push(shade);
    if (emitEvent && stepEvents) {
      stepEvents.push({
        type: 'event',
        tick,
        name: 'shade_spawned',
        data: { id },
      });
    }
    return shade;
  }

  function enforceShadeSafeZones(shade) {
    const minSafe = tuning.safe_radius + SAFE_MARGIN;
    for (let pass = 0; pass < 2; pass++) {
      for (const l of lanterns) {
        if (!l.lit) continue;
        const dx = shade.pos[0] - l.pos[0];
        const dz = shade.pos[2] - l.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < minSafe) {
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          shade.pos[0] = l.pos[0] + nx * minSafe;
          shade.pos[2] = l.pos[2] + nz * minSafe;
        }
      }
    }
  }

  function step(rawInput = {}) {
    if (state !== 'playing') {
      return [];
    }

    const events = [];
    tick += 1;
    simTick += 1;
    stepsExecuted += 1;
    timeLeftS = Math.max(0, initialTimeLeftS - stepsExecuted / TICK_RATE);

    // Decrement timers at start of step so exact-duration cooldowns expire on the exact tick
    if (invulnTimer > 0) {
      invulnTimer = Math.max(0, invulnTimer - DT);
    }
    if (pulseCooldownLeft > 0) {
      pulseCooldownLeft = Math.max(0, pulseCooldownLeft - DT);
    }

    // Parse input & rising-edge buttons
    const move = rawInput.move || [0, 0];
    const camYawDeg = rawInput.cam_yaw_deg || 0;
    const currJump = Boolean(rawInput.jump);
    const currInteract = Boolean(rawInput.interact);
    const currPulse = Boolean(rawInput.pulse);
    const currDash = Boolean(rawInput.dash);

    const jumpPressed = currJump && !prevButtons.jump;
    const interactPressed = currInteract && !prevButtons.interact;
    const pulsePressed = currPulse && !prevButtons.pulse;

    prevButtons = {
      jump: currJump,
      interact: currInteract,
      pulse: currPulse,
      dash: currDash,
    };

    // 1. Player horizontal movement (Contract v1.0 rotation)
    const [wx, wz] = transformMoveInput(move, camYawDeg);
    player.pos[0] += wx * tuning.player_speed * DT;
    player.pos[2] += wz * tuning.player_speed * DT;
    clampToCircleXZ(player.pos, effectiveIslandRadius);

    if (Math.hypot(wx, wz) > 1e-4) {
      player.facingYaw = Math.atan2(wx, wz);
    }

    // 2. Player jump & gravity
    if (jumpPressed && player.pos[1] <= EPS) {
      player.vy = JUMP_VELOCITY;
    }
    if (player.pos[1] > 0 || player.vy > 0) {
      player.vy += GRAVITY * DT;
      player.pos[1] += player.vy * DT;
      if (player.pos[1] <= 0) {
        player.pos[1] = 0;
        player.vy = 0;
      }
    }

    // 3. Mote pickup (auto within pickup_radius when under carry_capacity)
    if (motes.length > 0 && player.carried < tuning.carry_capacity) {
      const remaining = [];
      for (const m of motes) {
        if (
          player.carried < tuning.carry_capacity &&
          distXZ(player.pos, m.pos) <= tuning.pickup_radius + EPS
        ) {
          player.carried += 1;
          score += tuning.score.per_mote;
          events.push({
            type: 'event',
            tick,
            name: 'mote_picked',
            data: { carried: player.carried },
          });
        } else {
          remaining.push(m);
        }
      }
      motes = remaining;
    }

    // 4. Interact / Deposit into closest unlit lantern within interact_radius
    if (interactPressed && player.carried > 0) {
      let bestLantern = null;
      let bestDist = Infinity;
      for (const l of lanterns) {
        if (l.lit) continue;
        const d = distXZ(player.pos, l.pos);
        if (d <= tuning.interact_radius + EPS && d < bestDist - EPS) {
          bestDist = d;
          bestLantern = l;
        }
      }
      if (bestLantern) {
        const needed = Math.max(0, tuning.lantern_cost - bestLantern.deposited);
        const amount = Math.min(player.carried, needed);
        if (amount > 0) {
          player.carried -= amount;
          bestLantern.deposited += amount;
          events.push({
            type: 'event',
            tick,
            name: 'deposit',
            data: {
              lantern_id: bestLantern.id,
              amount,
              deposited: bestLantern.deposited,
            },
          });
          if (bestLantern.deposited >= tuning.lantern_cost) {
            bestLantern.lit = true;
            score += tuning.score.per_lantern;
            events.push({
              type: 'event',
              tick,
              name: 'lantern_lit',
              data: { lantern_id: bestLantern.id },
            });
          }
        }
      }
    }

    // 5. Pulse action (costs pulse_cost motes, pushes & stuns shades in pulse_radius)
    if (pulsePressed && pulseCooldownLeft <= EPS && player.carried >= tuning.pulse_cost) {
      player.carried -= tuning.pulse_cost;
      pulseCooldownLeft = tuning.pulse_cooldown_s;
      const stunnedIds = [];

      for (const s of shades) {
        if (distXZ(player.pos, s.pos) <= tuning.pulse_radius + EPS) {
          const dx = s.pos[0] - player.pos[0];
          const dz = s.pos[2] - player.pos[2];
          const d = Math.hypot(dx, dz);
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;

          s.pos[0] += nx * tuning.pulse_push_m;
          s.pos[2] += nz * tuning.pulse_push_m;
          enforceShadeSafeZones(s);
          clampToCircleXZ(s.pos, effectiveIslandRadius);

          s.state = 'stunned';
          s.stunTimer = tuning.pulse_stun_s;
          s.justStunnedThisStep = true;
          stunnedIds.push(s.id);
          score += tuning.score.per_stun;
        }
      }

      events.push({
        type: 'event',
        tick,
        name: 'pulse',
        data: { stunned_ids: stunnedIds },
      });
    }

    // 6. Shades AI update + safe_radius enforcement
    for (const s of shades) {
      if (s.justStunnedThisStep) {
        s.justStunnedThisStep = false;
        enforceShadeSafeZones(s);
        continue;
      }

      if (s.state === 'stunned') {
        s.stunTimer = Math.max(0, s.stunTimer - DT);
        if (s.stunTimer <= EPS) {
          s.stunTimer = 0;
          s.state = 'chase';
        }
        enforceShadeSafeZones(s);
        continue;
      }

      // Chase player in XZ
      const dx = player.pos[0] - s.pos[0];
      const dz = player.pos[2] - s.pos[2];
      const d = Math.hypot(dx, dz);
      const stepDist = tuning.shade_speed * DT;
      if (d > 1e-6) {
        const moveDist = Math.min(d, stepDist);
        s.pos[0] += (dx / d) * moveDist;
        s.pos[2] += (dz / d) * moveDist;
      }

      enforceShadeSafeZones(s);
      clampToCircleXZ(s.pos, effectiveIslandRadius);
    }

    // 7. Shade hit detection (if not invulnerable)
    if (invulnTimer <= EPS) {
      for (const s of shades) {
        if (s.state === 'stunned') continue;
        if (distXZ(player.pos, s.pos) <= tuning.shade_hit_radius + EPS) {
          player.flames = Math.max(0, player.flames - 1);
          const dropped =
            tuning.hit_drop_ratio > 0
              ? Math.min(player.carried, Math.round(player.carried * tuning.hit_drop_ratio))
              : 0;
          player.carried -= dropped;
          invulnTimer = tuning.invuln_s;

          events.push({
            type: 'event',
            tick,
            name: 'player_hit',
            data: {
              by: 'shade',
              flames: player.flames,
              dropped,
            },
          });
          break;
        }
      }
    }

    // 8. Periodic random spawns (only if enabled)
    if (randomMotes) {
      moteRespawnTimer += DT;
      if (moteRespawnTimer >= 4.0 - EPS) {
        moteRespawnTimer -= 4.0;
        if (motes.length < 20) {
          spawnRandomMote(false);
        }
      }
    }

    if (randomShades) {
      shadeSpawnTimer += DT;
      if (shadeSpawnTimer >= 45.0 - EPS) {
        shadeSpawnTimer -= 45.0;
        if (shades.length < 5) {
          spawnRandomShade(true, events);
        }
      }
    }

    // 9. Win / Loss evaluation
    const allLit = lanterns.every((l) => l.lit);
    if (allLit) {
      state = 'won';
      endReason = 'all_lit';
      score +=
        Math.floor(timeLeftS) * tuning.score.per_second_left +
        player.flames * tuning.score.per_flame_left;
      events.push({
        type: 'event',
        tick,
        name: 'game_over',
        data: { result: 'won', reason: 'all_lit' },
      });
    } else if (player.flames <= 0) {
      state = 'lost';
      endReason = 'no_flames';
      events.push({
        type: 'event',
        tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'no_flames' },
      });
    } else if (timeLeftS <= EPS) {
      timeLeftS = 0;
      state = 'lost';
      endReason = 'dawn';
      events.push({
        type: 'event',
        tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'dawn' },
      });
    }

    return events;
  }

  function getSnapshot() {
    return {
      type: 'snapshot',
      tick,
      sim_tick: simTick,
      state,
      time_left_s: round3(timeLeftS),
      score,
      player: {
        pos: roundPos(player.pos),
        flames: player.flames,
        carried: player.carried,
      },
      lanterns: lanterns.map((l) => ({
        id: l.id,
        pos: roundPos(l.pos),
        lit: l.lit,
        deposited: l.deposited,
      })),
      shades: shades.map((s) => ({
        id: s.id,
        pos: roundPos(s.pos),
        state: s.state,
      })),
      motes_active: motes.length,
      motes: motes.map((m) => ({
        id: m.id,
        pos: roundPos(m.pos),
      })),
    };
  }

  function getEndRecord() {
    return {
      type: 'end',
      ticks: tick,
      state,
      score,
    };
  }

  function getRenderState() {
    return {
      tick,
      state,
      endReason,
      timeLeftS,
      score,
      islandRadius: DEFAULT_ISLAND_RADIUS,
      invulnTimer,
      pulseCooldownLeft,
      tuning,
      player: {
        pos: [...player.pos],
        vy: player.vy,
        flames: player.flames,
        carried: player.carried,
        facingYaw: player.facingYaw,
      },
      lanterns: lanterns.map((l) => ({ ...l, pos: [...l.pos] })),
      shades: shades.map((s) => ({ ...s, pos: [...s.pos] })),
      motes: motes.map((m) => ({ ...m, pos: [...m.pos] })),
    };
  }

  return {
    step,
    getSnapshot,
    getEndRecord,
    getRenderState,
    getState: () => state,
    getTick: () => tick,
    getScore: () => score,
  };
}
