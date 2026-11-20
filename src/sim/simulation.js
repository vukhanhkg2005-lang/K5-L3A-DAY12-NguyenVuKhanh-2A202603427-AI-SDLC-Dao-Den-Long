import { createRng } from './prng.js';
import { EPS, round3, roundPos, distXZ, dist3D, transformMoveInput } from './math.js';
import { getNightMap } from './maps.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
const FUEL_SCALE = 60; // Integer 1/60 fuel units to avoid floating-point drift

const GRAVITY = -20.0;
const JUMP_VELOCITY = 7.0;
const CHARM_RUN_SPEED = 7.2;
const CHARM_DURATION_TICKS = 600;
const CHARM_RESPAWN_TICKS = 2700;

const SHADE_DETECT_RADIUS = 12.0;
const SHADE_LEASH_RADIUS = 18.0;
const SHADE_DRAIN_CHASE_RADIUS = 6.0;
const SHADE_DRAIN_RADIUS = 2.0;
const SHADE_WANDER_SPEED = 2.0;
const SHADE_RECOIL_DIST = 2.0;
const SHADE_RECOIL_TICKS = 60;
const SHADE_SPAWN_TELEGRAPH_TICKS = 60;
const SAFE_PUSH_TICKS = 30;

const PULSE_PUSH_TICKS = 15;
const DROPPED_MOTE_TTL_TICKS = 480;
const FALL_Y_THRESHOLD = -10.0;
const FALL_RESPAWN_WAIT_TICKS = 60;

const DRIFTER_IDLE_SPEED = 2.0;
const DRIFTER_CHASE_SPEED = 7.0;
const DRIFTER_FLEE_SPEED = 7.0;
const DRIFTER_DETECT_RADIUS = 15.0;
const DRIFTER_STEAL_RADIUS = 1.2;
const DRIFTER_MIN_CARRIED = 5;
const DRIFTER_FLEE_TICKS = 240;
const DRIFTER_DROP_FLEE_TICKS = 120;

const WIND_CYCLE_TICKS = 1800; // 30s
const WIND_DURATION_TICKS = 300; // 5s
const WIND_WARNING_TICKS = 120; // 2s
const WIND_PUSH_SPEED = 2.0;

const EMPTY_EVENTS = Object.freeze([]);

function compareIds(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function round1Fuel(fuelUnits) {
  const r = Math.round((Math.max(0, fuelUnits) / FUEL_SCALE) * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

export function createSimulation({ seed = 1, night = 1, tuning, scenario = null }) {
  if (!tuning) {
    throw new Error('tuning config from game.contract.json is required');
  }

  const map = getNightMap(night);
  const rng = createRng(seed);

  const dashDurationTicks = Math.round((tuning.dash_duration_s ?? 0.2) * TICK_RATE);
  const dashCooldownTicks = Math.round((tuning.dash_cooldown_s ?? 1.5) * TICK_RATE);
  const invulnDurationTicks = Math.round(tuning.invuln_s * TICK_RATE);
  const pulseStunTicks = Math.round(tuning.pulse_stun_s * TICK_RATE);
  const pulseCooldownTicks = Math.round(tuning.pulse_cooldown_s * TICK_RATE);
  const shadeSpeed = map.shadeSpeedOverride ?? tuning.shade_speed;

  // Phase 3 integer fuel constants (units of 1/60)
  const fuelMaxUnits = Math.round((tuning.fuel_max ?? 100) * FUEL_SCALE); // 6000
  const lowFuelUnits = Math.round((tuning.low_fuel_threshold ?? 30) * FUEL_SCALE); // 1800
  const fuelPerMoteUnits = Math.round((tuning.fuel_per_mote ?? 10) * FUEL_SCALE); // 600
  const decayPerTickUnits = Math.round(tuning.fuel_decay_per_s ?? 1.0); // 1
  const drainPerTickUnits = Math.round(tuning.drain_per_s ?? 5); // 5
  const relightCost = tuning.relight_cost ?? 5;
  const capacityMax = tuning.capacity_max ?? 20;
  const winRatio = tuning.win_ratio ?? 0.6;

  const scorePerMote = tuning.score.per_mote ?? 5;
  const scorePerLantern = tuning.score.per_lantern ?? 100;
  const scorePerRelight = tuning.score.per_relight ?? 40;
  const scorePerStun = tuning.score.per_stun ?? 5;
  const scorePerDrainStun = tuning.score.per_drain_stun ?? 15;
  const scorePerLitDawn = tuning.score.per_lit_dawn ?? 50;
  const scorePerFlameLeft = tuning.score.per_flame_left ?? 50;

  const randomMotes = scenario && scenario.random_motes !== undefined ? scenario.random_motes : true;
  const randomShades = scenario && scenario.random_shades !== undefined ? scenario.random_shades : true;
  const randomDrifters =
    scenario && scenario.random_drifters !== undefined
      ? scenario.random_drifters
      : map.maxDrifters > 0;
  const windEnabled =
    scenario && scenario.wind_enabled !== undefined
      ? scenario.wind_enabled
      : map.windEnabledDefault;

  const defaultDuration = tuning[map.durationKey] ?? tuning.night1_duration_s;
  const initialTimeLeftS =
    scenario && scenario.time_left_s !== undefined ? scenario.time_left_s : defaultDuration;
  let timeLeftTicks = Math.round(initialTimeLeftS * TICK_RATE);

  let successfulLights = 0;

  const player = {
    pos: [...map.spawnPos],
    vel: [0, 0, 0],
    grounded: true,
    flames: tuning.flames,
    carried: 0,
    facingYaw: map.spawnYaw,
    invulnTicks: 0,
    dashTicksLeft: 0,
    dashDir: [0, 1],
    dashCdTicks: 0,
    pulseCdTicks: 0,
    charmTicks: 0,
    launchActive: false,
    respawnWaitTicks: 0,
  };

  if (scenario && scenario.player) {
    const sp = scenario.player;
    if (sp.pos) {
      player.pos = [sp.pos[0], sp.pos[1], sp.pos[2]];
      const gy = map.getGroundY(player.pos[0], player.pos[2], player.pos[1]);
      player.grounded = gy !== null && Math.abs(player.pos[1] - gy) <= 0.05;
    }
    if (sp.carried !== undefined) player.carried = sp.carried;
    if (sp.flames !== undefined) player.flames = sp.flames;
    if (sp.invuln_ticks !== undefined) player.invulnTicks = sp.invuln_ticks;
    if (sp.dash_cd_ticks !== undefined) player.dashCdTicks = sp.dash_cd_ticks;
    if (sp.pulse_cd_ticks !== undefined) player.pulseCdTicks = sp.pulse_cd_ticks;
    if (sp.charm_ticks !== undefined) player.charmTicks = sp.charm_ticks;
    if (sp.successful_lights !== undefined) successfulLights = sp.successful_lights;
  }

  function getCarryCapacity() {
    return Math.min(capacityMax, tuning.carry_capacity + 2 * successfulLights);
  }

  // Lanterns (Phase 3: fuelUnits in 1/60 units, everLit, relitCount)
  const lanterns = map.lanterns.map((l) => ({
    id: l.id,
    pos: [...l.pos],
    lit: false,
    deposited: 0,
    fuelUnits: 0,
    everLit: false,
    relitCount: 0,
  }));

  if (scenario && Array.isArray(scenario.lanterns)) {
    for (const ov of scenario.lanterns) {
      const target = lanterns.find((l) => l.id === ov.id);
      if (target) {
        if (ov.pos !== undefined) target.pos = [ov.pos[0], ov.pos[1], ov.pos[2]];
        if (ov.deposited !== undefined) target.deposited = ov.deposited;
        if (ov.ever_lit !== undefined) target.everLit = ov.ever_lit;
        if (ov.relit_count !== undefined) target.relitCount = ov.relit_count;

        if (ov.lit !== undefined) {
          target.lit = ov.lit;
        } else {
          const req = target.everLit ? relightCost : tuning.lantern_cost;
          if (target.deposited >= req) target.lit = true;
        }

        if (target.lit) {
          target.fuelUnits =
            ov.fuel !== undefined ? Math.round(ov.fuel * FUEL_SCALE) : fuelMaxUnits;
          if (ov.ever_lit === undefined) target.everLit = true;
          if (ov.deposited === undefined) target.deposited = tuning.lantern_cost;
        } else {
          target.fuelUnits = 0;
        }
      }
    }
  }

  function hasActiveSafeZone(l) {
    return l.lit && l.fuelUnits >= lowFuelUnits;
  }

  // Motes
  let motes = [];
  let nextMoteId = 1;

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
      const kind = !isArr && m.kind ? m.kind : 'random';
      const ttlTicks =
        !isArr && m.ttl_ticks !== undefined
          ? m.ttl_ticks
          : kind === 'dropped'
          ? DROPPED_MOTE_TTL_TICKS
          : null;
      motes.push({
        id,
        pos: [rawPos[0], rawPos[1], rawPos[2]],
        kind,
        ttlTicks,
      });
    }
  } else if (randomMotes) {
    const pool = map.moteSpawns.map((p) => [...p]);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    const count = Math.min(20, pool.length);
    for (let i = 0; i < count; i++) {
      motes.push({
        id: `M${nextMoteId++}`,
        pos: pool[i],
        kind: 'random',
        ttlTicks: null,
      });
    }
  }

  // Shades
  let shades = [];
  let nextShadeId = 1;

  function makeShade({ id, pos, state, stateTicksLeft, targetLanternId = null }) {
    const wanderAngle = rng.next() * Math.PI * 2;
    return {
      id,
      pos: [pos[0], pos[1], pos[2]],
      state,
      stateTicksLeft,
      targetLanternId,
      drainTickCounter: 0,
      pushTicksLeft: 0,
      pushStepX: 0,
      pushStepZ: 0,
      recoilDirX: 1,
      recoilDirZ: 0,
      safePushTicks: 0,
      safePushLanternId: null,
      wanderDirX: Math.cos(wanderAngle),
      wanderDirZ: Math.sin(wanderAngle),
      wanderTimer: 90,
    };
  }

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
      const distToPlayer = distXZ(s.pos, player.pos);
      const defaultState = distToPlayer <= SHADE_DETECT_RADIUS ? 'chase' : 'wander';
      const st = s.state || defaultState;
      let ticksLeft = s.state_ticks_left ?? 0;
      if (s.state_ticks_left === undefined) {
        if (st === 'stunned') ticksLeft = pulseStunTicks;
        else if (st === 'recoil') ticksLeft = SHADE_RECOIL_TICKS;
        else if (st === 'spawning') ticksLeft = SHADE_SPAWN_TELEGRAPH_TICKS;
      }
      let targetLanternId = s.target_lantern_id ?? null;
      if (st === 'drain' && !targetLanternId) {
        // Auto-bind to closest weak lit lantern within 2m (or closest lit lantern)
        let best = null;
        let bestD = Infinity;
        for (const l of lanterns) {
          if (!l.lit) continue;
          const d = distXZ(s.pos, l.pos);
          if (d < bestD) {
            bestD = d;
            best = l;
          }
        }
        if (best) targetLanternId = best.id;
      }
      shades.push(makeShade({ id, pos: s.pos, state: st, stateTicksLeft: ticksLeft, targetLanternId }));
    }
    shades.sort(compareIds);
  }

  // Drifters (Gió Lạc)
  let drifters = [];
  let nextDrifterId = 1;

  function makeDrifter({ id, pos, state = 'idle', stolen = 0, fleeTicksLeft = 0 }) {
    const ang = rng.next() * Math.PI * 2;
    return {
      id,
      pos: [pos[0], pos[1], pos[2]],
      state,
      stolen,
      hasStolen: stolen > 0 || state === 'flee' || state === 'removed',
      fleeTicksLeft:
        fleeTicksLeft > 0 ? fleeTicksLeft : state === 'flee' ? DRIFTER_FLEE_TICKS : 0,
      wanderDirX: Math.cos(ang),
      wanderDirZ: Math.sin(ang),
      wanderTimer: 90,
    };
  }

  if (scenario && Array.isArray(scenario.drifters)) {
    const usedIds = new Set();
    for (const d of scenario.drifters) {
      if (d.id) usedIds.add(d.id);
    }
    for (const d of scenario.drifters) {
      let id = d.id;
      if (!id) {
        while (usedIds.has(`D${nextDrifterId}`)) nextDrifterId++;
        id = `D${nextDrifterId++}`;
        usedIds.add(id);
      }
      drifters.push(
        makeDrifter({
          id,
          pos: d.pos,
          state: d.state || 'idle',
          stolen: d.stolen || 0,
          fleeTicksLeft: d.flee_ticks_left || 0,
        })
      );
    }
    drifters.sort(compareIds);
  }

  // Charms (Bùa Gió)
  let charms = map.charms.map((c) => ({
    id: c.id,
    pos: [...c.pos],
    available: true,
    respawnTicks: 0,
  }));

  if (scenario && Array.isArray(scenario.charms)) {
    charms = scenario.charms.map((c) => {
      const def = map.charms.find((mc) => mc.id === c.id);
      return {
        id: c.id,
        pos: c.pos ? [...c.pos] : def ? [...def.pos] : [0, 0, 0],
        available: c.available !== undefined ? c.available : true,
        respawnTicks: c.respawn_ticks ?? 0,
      };
    });
  }

  // Wind state (Night 3)
  let windActive = false;
  let windWarning = false;
  let windDirDeg = 0;
  let nextWindCycleIndex = 1;

  let tick = 0;
  let simTick = 0;
  let score = 0;
  let state = 'playing'; // 'playing' | 'paused' | 'won' | 'lost'
  let endReason = null;

  let prevButtons = {
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };

  function pickFreeMoteSpawn() {
    const free = [];
    for (const pt of map.moteSpawns) {
      const occupied = motes.some(
        (m) => distXZ(m.pos, pt) < 0.5 && Math.abs(m.pos[1] - pt[1]) < 0.5
      );
      if (!occupied) free.push(pt);
    }
    if (free.length === 0) return null;
    const idx = Math.floor(rng.next() * free.length);
    return [...free[idx]];
  }

  function pickValidShadeSpawn() {
    const valid = [];
    for (const pt of map.shadeSpawns) {
      if (distXZ(pt, player.pos) < 15.0) continue;
      const inSafe = lanterns.some((l) => hasActiveSafeZone(l) && distXZ(pt, l.pos) < tuning.safe_radius);
      if (inSafe) continue;
      const crowded = shades.some((s) => distXZ(s.pos, pt) < 1.0);
      if (crowded) continue;
      valid.push(pt);
    }
    if (valid.length === 0) return null;
    const idx = Math.floor(rng.next() * valid.length);
    const chosen = valid[idx];
    return [chosen[0], chosen[1] + 1.0, chosen[2]];
  }

  function spawnOneShade(emit) {
    if (shades.length >= map.maxShades) return false;
    const pos = pickValidShadeSpawn();
    if (!pos) return false;
    const id = `S${nextShadeId++}`;
    shades.push(
      makeShade({
        id,
        pos,
        state: 'spawning',
        stateTicksLeft: SHADE_SPAWN_TELEGRAPH_TICKS,
      })
    );
    shades.sort(compareIds);
    emit('shade_spawned', { id });
    return true;
  }

  function spawnOneDrifter() {
    const activeCount = drifters.filter((d) => d.state !== 'removed').length;
    if (activeCount >= map.maxDrifters || map.shadeSpawns.length === 0) return false;
    const idx = Math.floor(rng.next() * map.shadeSpawns.length);
    const pt = map.shadeSpawns[idx];
    const id = `D${nextDrifterId++}`;
    drifters.push(
      makeDrifter({
        id,
        pos: [pt[0], pt[1] + 1.2, pt[2]],
        state: 'idle',
        stolen: 0,
      })
    );
    drifters.sort(compareIds);
    return true;
  }

  function triggerSafeZonePushOut(lantern) {
    for (const s of shades) {
      if (distXZ(s.pos, lantern.pos) < tuning.safe_radius) {
        s.safePushTicks = SAFE_PUSH_TICKS;
        s.safePushLanternId = lantern.id;
        if (s.state === 'drain' && s.targetLanternId === lantern.id) {
          s.state = 'wander';
          s.drainTickCounter = 0;
          s.targetLanternId = null;
        }
      }
    }
  }

  function blockShadeOutsideSafeZones(s) {
    const minSafe = tuning.safe_radius + 0.02;
    for (const l of lanterns) {
      if (!hasActiveSafeZone(l)) continue;
      if (s.safePushTicks > 0 && s.safePushLanternId === l.id) continue;
      const dx = s.pos[0] - l.pos[0];
      const dz = s.pos[2] - l.pos[2];
      const d = Math.hypot(dx, dz);
      if (d < minSafe) {
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        s.pos[0] = l.pos[0] + nx * minSafe;
        s.pos[2] = l.pos[2] + nz * minSafe;
      }
    }
  }

  function findClosestWeakLantern(pos) {
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < lanterns.length; i++) {
      const l = lanterns[i];
      if (!l.lit || l.fuelUnits >= lowFuelUnits) continue;
      const d = distXZ(pos, l.pos);
      if (
        best === null ||
        d < bestDist - EPS ||
        (Math.abs(d - bestDist) <= EPS && l.id < best.id)
      ) {
        bestDist = d;
        best = l;
      }
    }
    return best;
  }

  function findClosestUnlitLantern(pos) {
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < lanterns.length; i++) {
      const l = lanterns[i];
      if (l.lit) continue;
      const d = distXZ(pos, l.pos);
      if (
        best === null ||
        d < bestDist - EPS ||
        (Math.abs(d - bestDist) <= EPS && l.id < best.id)
      ) {
        bestDist = d;
        best = l;
      }
    }
    return best;
  }

  function findClosestLantern(pos, predicate) {
    let best = null;
    let bestDist = Infinity;
    for (const l of lanterns) {
      if (!predicate(l)) continue;
      const d = distXZ(pos, l.pos);
      if (
        best === null ||
        d < bestDist - EPS ||
        (Math.abs(d - bestDist) <= EPS && l.id < best.id)
      ) {
        bestDist = d;
        best = l;
      }
    }
    return best;
  }

  let stepEvents = null;
  function emit(name, data) {
    if (!stepEvents) stepEvents = [];
    stepEvents.push({ type: 'event', tick, name, data });
  }

  function step(rawInput = {}) {
    if (state === 'won' || state === 'lost') {
      return EMPTY_EVENTS;
    }

    stepEvents = null;
    tick += 1;

    // =========================================================================
    // STEP 1: Read input (handle pause first; if just paused, stop step here)
    // =========================================================================
    const currPause = Boolean(rawInput.pause);
    const pausePressed = currPause && !prevButtons.pause;
    prevButtons.pause = currPause;

    if (state === 'playing' && pausePressed) {
      state = 'paused';
      emit('paused', {});
      return stepEvents;
    }

    if (state === 'paused') {
      if (pausePressed) {
        state = 'playing';
        emit('resumed', {});
      } else {
        return EMPTY_EVENTS;
      }
    }

    const move = rawInput.move || [0, 0];
    const camYawDeg = rawInput.cam_yaw_deg || 0;
    const currJump = Boolean(rawInput.jump);
    const currInteract = Boolean(rawInput.interact);
    const currPulse = Boolean(rawInput.pulse);
    const currDash = Boolean(rawInput.dash);

    const jumpPressed = currJump && !prevButtons.jump;
    const interactPressed = currInteract && !prevButtons.interact;
    const pulsePressed = currPulse && !prevButtons.pulse;
    const dashPressed = currDash && !prevButtons.dash;

    prevButtons.jump = currJump;
    prevButtons.interact = currInteract;
    prevButtons.pulse = currPulse;
    prevButtons.dash = currDash;

    simTick += 1;

    // =========================================================================
    // STEP 2: Decrement timers + Subtract lantern fuel (decay + drain)
    //         Immediately after Step 2: extinguish lanterns with fuel <= 0
    // =========================================================================
    if (timeLeftTicks > 0) timeLeftTicks -= 1;
    if (player.invulnTicks > 0) player.invulnTicks -= 1;
    if (player.dashCdTicks > 0) player.dashCdTicks -= 1;
    if (player.pulseCdTicks > 0) player.pulseCdTicks -= 1;
    if (player.charmTicks > 0) player.charmTicks -= 1;

    if (player.respawnWaitTicks > 0) {
      player.respawnWaitTicks -= 1;
      if (player.respawnWaitTicks === 0) {
        player.pos = [...map.spawnPos];
        player.vel = [0, 0, 0];
        player.grounded = true;
        player.launchActive = false;
        player.dashTicksLeft = 0;
        player.invulnTicks = invulnDurationTicks;
      }
    }

    // Keep shades & drifters sorted once at scenario init; avoid per-tick array copies
    if (motes.length > 0) {
      let writeIdx = 0;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        if (m.ttlTicks !== null) {
          m.ttlTicks -= 1;
          if (m.ttlTicks <= 0) continue;
        }
        motes[writeIdx++] = m;
      }
      motes.length = writeIdx;
    }

    for (const c of charms) {
      if (!c.available && c.respawnTicks > 0) {
        c.respawnTicks -= 1;
        if (c.respawnTicks === 0) {
          c.available = true;
        }
      }
    }

    for (const s of shades) {
      if (s.state === 'spawning' || s.state === 'stunned' || s.state === 'recoil') {
        if (s.stateTicksLeft > 0) s.stateTicksLeft -= 1;
        if (s.stateTicksLeft <= 0) {
          const prevState = s.state;
          s.stateTicksLeft = 0;
          s.pushTicksLeft = 0;
          if (prevState === 'stunned') {
            // Phase 3 rule: after stunned -> always wander
            s.state = 'wander';
          } else {
            const d = distXZ(s.pos, player.pos);
            if (prevState === 'recoil' && player.respawnWaitTicks === 0 && d <= SHADE_LEASH_RADIUS) {
              s.state = 'chase';
            } else if (player.respawnWaitTicks === 0 && d <= SHADE_DETECT_RADIUS) {
              s.state = 'chase';
            } else {
              s.state = 'wander';
            }
          }
        }
      }
    }

    for (const d of drifters) {
      if (d.state === 'flee') {
        if (d.fleeTicksLeft > 0) d.fleeTicksLeft -= 1;
        if (d.fleeTicksLeft <= 0) {
          d.state = 'removed';
          d.fleeTicksLeft = 0;
        }
      }
    }

    if (windEnabled) {
      const gustStart = nextWindCycleIndex * WIND_CYCLE_TICKS;
      const warnStart = gustStart - WIND_WARNING_TICKS;
      const gustEnd = gustStart + WIND_DURATION_TICKS;

      if (simTick === warnStart) {
        windDirDeg = round3(rng.next() * 360);
        windWarning = true;
        windActive = false;
      } else if (simTick >= gustStart && simTick < gustEnd) {
        windWarning = false;
        windActive = true;
      } else if (simTick >= gustEnd) {
        windWarning = false;
        windActive = false;
        nextWindCycleIndex += 1;
      }
    } else {
      windActive = false;
      windWarning = false;
    }

    // Lantern fuel decay (1/60 per tick) + Shade drain (5/60 per tick per draining shade)
    for (let li = 0; li < lanterns.length; li++) {
      const l = lanterns[li];
      if (!l.lit) continue;
      l.fuelUnits -= decayPerTickUnits;

      for (let si = 0; si < shades.length; si++) {
        const s = shades[si];
        if (s.state === 'drain' && s.targetLanternId === l.id) {
          l.fuelUnits -= drainPerTickUnits;
          s.drainTickCounter += 1;
          if (s.drainTickCounter % 60 === 0) {
            emit('fuel_drain', {
              lantern_id: l.id,
              shade_id: s.id,
              fuel: round1Fuel(l.fuelUnits),
            });
          }
        }
      }
    }

    // Immediately after Step 2: extinguish any lit lantern with fuel <= 0
    for (let li = 0; li < lanterns.length; li++) {
      const l = lanterns[li];
      if (l.lit && l.fuelUnits <= 0) {
        l.lit = false;
        l.fuelUnits = 0;
        l.deposited = 0;
        l.everLit = true;
        emit('lantern_out', { lantern_id: l.id });
        for (let si = 0; si < shades.length; si++) {
          const s = shades[si];
          if (s.state === 'drain' && s.targetLanternId === l.id) {
            s.state = 'wander';
            s.drainTickCounter = 0;
            s.targetLanternId = null;
          }
        }
      }
    }

    // =========================================================================
    // STEP 3: Move Mây (jump, dash, jump pads, wind) & check fall (Y < -10)
    // =========================================================================
    if (player.respawnWaitTicks === 0) {
      let mxIn = move[0] || 0;
      let mzIn = move[1] || 0;
      const inLen = Math.hypot(mxIn, mzIn);
      if (inLen > 1) {
        mxIn /= inLen;
        mzIn /= inLen;
      }
      const yawRad = (camYawDeg * Math.PI) / 180;
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const wx = mxIn * cosY + mzIn * sinY;
      const wz = -mxIn * sinY + mzIn * cosY;
      const moveLen = Math.hypot(wx, wz);

      if (moveLen > 1e-4) {
        player.facingYaw = Math.atan2(wx, wz);
      }

      const dashReady =
        player.dashTicksLeft === 0 && (player.charmTicks > 0 || player.dashCdTicks === 0);
      if (dashPressed && dashReady) {
        player.dashTicksLeft = dashDurationTicks;
        player.dashCdTicks = player.charmTicks > 0 ? 0 : dashCooldownTicks;
        player.launchActive = false;
        if (moveLen > 1e-4) {
          player.dashDir = [wx / moveLen, wz / moveLen];
        } else {
          player.dashDir = [Math.sin(player.facingYaw), Math.cos(player.facingYaw)];
        }
        player.vel[1] = 0;
        emit('dash', {});
      }

      const runSpeed = player.charmTicks > 0 ? CHARM_RUN_SPEED : tuning.player_speed;
      const isDashingThisTick = player.dashTicksLeft > 0;
      if (isDashingThisTick) {
        player.vel[0] = player.dashDir[0] * tuning.dash_speed;
        player.vel[2] = player.dashDir[1] * tuning.dash_speed;
        player.vel[1] = 0;
        player.dashTicksLeft -= 1;
      } else if (!player.launchActive) {
        player.vel[0] = wx * runSpeed;
        player.vel[2] = wz * runSpeed;
      }

      let windVx = 0;
      let windVz = 0;
      if (windActive) {
        const wRad = (windDirDeg * Math.PI) / 180;
        windVx = Math.cos(wRad) * WIND_PUSH_SPEED;
        windVz = Math.sin(wRad) * WIND_PUSH_SPEED;
      }

      if (jumpPressed && player.grounded && !isDashingThisTick && !player.launchActive) {
        player.vel[1] = JUMP_VELOCITY;
        player.grounded = false;
      }

      const oldX = player.pos[0];
      const oldZ = player.pos[2];
      const targetX = oldX + (player.vel[0] + windVx) * DT;
      const targetZ = oldZ + (player.vel[2] + windVz) * DT;
      const resolved = map.resolveHorizontalMove(oldX, oldZ, targetX, targetZ, player.pos[1]);
      player.pos[0] = resolved.x;
      player.pos[2] = resolved.z;

      if (!isDashingThisTick) {
        const groundY = map.getGroundY(player.pos[0], player.pos[2], player.pos[1]);
        if (player.grounded && player.vel[1] <= 0) {
          if (groundY !== null && player.pos[1] - groundY <= 0.6) {
            player.pos[1] = groundY;
            player.vel[1] = 0;
          } else {
            player.grounded = false;
            player.vel[1] += GRAVITY * DT;
            player.pos[1] += player.vel[1] * DT;
          }
        } else {
          player.vel[1] += GRAVITY * DT;
          const nextY = player.pos[1] + player.vel[1] * DT;
          if (
            player.vel[1] <= 0 &&
            groundY !== null &&
            nextY <= groundY &&
            player.pos[1] >= groundY - 0.6
          ) {
            player.pos[1] = groundY;
            player.vel[1] = 0;
            player.grounded = true;
            player.launchActive = false;
          } else {
            player.pos[1] = nextY;
            player.grounded = false;
          }
        }
      } else {
        const groundY = map.getGroundY(player.pos[0], player.pos[2], player.pos[1]);
        if (groundY !== null && Math.abs(player.pos[1] - groundY) <= 0.15) {
          player.pos[1] = groundY;
          player.grounded = true;
        } else {
          player.grounded = false;
        }
      }

      if (!player.launchActive && map.jumpPads.length > 0) {
        for (const pad of map.jumpPads) {
          if (
            distXZ(player.pos, pad.pos) <= pad.radius + EPS &&
            Math.abs(player.pos[1] - pad.pos[1]) <= 0.5
          ) {
            player.vel[0] = pad.vx;
            player.vel[1] = pad.vy;
            player.vel[2] = pad.vz;
            player.grounded = false;
            player.launchActive = true;
            player.dashTicksLeft = 0;
            break;
          }
        }
      }

      if (tuning.fall_enabled && player.pos[1] < FALL_Y_THRESHOLD) {
        player.flames = Math.max(0, player.flames - 1);
        const lost = player.carried;
        player.carried = 0;
        player.dashTicksLeft = 0;
        player.launchActive = false;
        player.vel = [0, 0, 0];

        emit('player_hit', {
          by: 'fall',
          flames: player.flames,
          dropped: 0,
          lost,
        });

        if (player.flames > 0) {
          player.respawnWaitTicks = FALL_RESPAWN_WAIT_TICKS;
        }
      }
    }

    // =========================================================================
    // STEP 4: Pick up motes (up to dynamic capacity) and charms
    // =========================================================================
    if (player.respawnWaitTicks === 0 && player.flames > 0) {
      const capacity = getCarryCapacity();
      if (motes.length > 0 && player.carried < capacity) {
        let writeIdx = 0;
        for (let i = 0; i < motes.length; i++) {
          const m = motes[i];
          if (
            player.carried < capacity &&
            distXZ(player.pos, m.pos) <= tuning.pickup_radius + EPS &&
            Math.abs(player.pos[1] - m.pos[1]) <= 1.5 + EPS
          ) {
            player.carried += 1;
            emit('mote_picked', { carried: player.carried });
          } else {
            motes[writeIdx++] = m;
          }
        }
        motes.length = writeIdx;
      }

      for (const c of charms) {
        if (
          c.available &&
          distXZ(player.pos, c.pos) <= tuning.pickup_radius + EPS &&
          Math.abs(player.pos[1] - c.pos[1]) <= 1.5 + EPS
        ) {
          c.available = false;
          c.respawnTicks = CHARM_RESPAWN_TICKS;
          player.charmTicks = CHARM_DURATION_TICKS;
          player.dashCdTicks = 0;
          emit('charm_picked', { charm_id: c.id, charm_ticks: CHARM_DURATION_TICKS });
        }
      }
    }

    // =========================================================================
    // STEP 5: Interact with nearest eligible lantern (unlit OR lit non-full)
    // =========================================================================
    if (player.respawnWaitTicks === 0 && player.flames > 0 && interactPressed && player.carried > 0) {
      const bestLantern = findClosestLantern(
        player.pos,
        (l) =>
          distXZ(player.pos, l.pos) <= tuning.interact_radius + EPS &&
          (!l.lit || l.fuelUnits < fuelMaxUnits)
      );

      if (bestLantern) {
        if (!bestLantern.lit) {
          const reqCost = bestLantern.everLit ? relightCost : tuning.lantern_cost;
          const needed = Math.max(0, reqCost - bestLantern.deposited);
          const amount = Math.min(player.carried, needed);
          if (amount > 0) {
            player.carried -= amount;
            bestLantern.deposited += amount;
            score += amount * scorePerMote;
            emit('deposit', {
              lantern_id: bestLantern.id,
              amount,
              deposited: bestLantern.deposited,
            });
            if (bestLantern.deposited >= reqCost) {
              const isRelight = bestLantern.everLit;
              bestLantern.lit = true;
              bestLantern.fuelUnits = fuelMaxUnits;
              bestLantern.everLit = true;
              if (isRelight) {
                bestLantern.relitCount += 1;
                score += scorePerRelight;
              } else {
                score += scorePerLantern;
              }
              successfulLights += 1;
              emit('lantern_lit', { lantern_id: bestLantern.id, relight: isRelight });
              triggerSafeZonePushOut(bestLantern);
            }
          }
        } else {
          // Refuel lit non-full lantern
          const wasBelowSafe = bestLantern.fuelUnits < lowFuelUnits;
          const missingUnits = fuelMaxUnits - bestLantern.fuelUnits;
          const neededMotes = Math.ceil(missingUnits / fuelPerMoteUnits);
          const used = Math.min(player.carried, neededMotes);
          if (used > 0) {
            player.carried -= used;
            bestLantern.fuelUnits = Math.min(
              fuelMaxUnits,
              bestLantern.fuelUnits + used * fuelPerMoteUnits
            );
            score += used * scorePerMote;
            emit('refuel', {
              lantern_id: bestLantern.id,
              amount: used,
              fuel: round1Fuel(bestLantern.fuelUnits),
            });
            if (wasBelowSafe && bestLantern.fuelUnits >= lowFuelUnits) {
              triggerSafeZonePushOut(bestLantern);
            }
          }
        }
      }
    }

    // =========================================================================
    // STEP 6: Update safe zones (ONLY active when lit && fuel >= 30)
    // =========================================================================
    const minSafeEdge = tuning.safe_radius + 0.05;
    for (const s of shades) {
      if (s.safePushTicks > 0) {
        const l = lanterns.find((lt) => lt.id === s.safePushLanternId);
        if (l && hasActiveSafeZone(l)) {
          const dx = s.pos[0] - l.pos[0];
          const dz = s.pos[2] - l.pos[2];
          const d = Math.hypot(dx, dz);
          if (d >= minSafeEdge) {
            s.safePushTicks = 0;
            s.safePushLanternId = null;
          } else {
            const nx = d > 1e-6 ? dx / d : 1;
            const nz = d > 1e-6 ? dz / d : 0;
            const remainingDist = minSafeEdge - d;
            const pushStep = remainingDist / s.safePushTicks;
            s.pos[0] += nx * pushStep;
            s.pos[2] += nz * pushStep;
            s.safePushTicks -= 1;
            if (s.safePushTicks <= 0) {
              s.safePushTicks = 0;
              s.safePushLanternId = null;
            }
          }
        } else {
          s.safePushTicks = 0;
          s.safePushLanternId = null;
        }
      }
      blockShadeOutsideSafeZones(s);
    }

    // =========================================================================
    // STEP 7: Pulse (3D radius 5m from player.pos + (0, 0.8, 0))
    //         Score: +15 if Shade was in drain, else +5
    // =========================================================================
    if (
      player.respawnWaitTicks === 0 &&
      player.flames > 0 &&
      pulsePressed &&
      player.pulseCdTicks === 0 &&
      player.carried >= tuning.pulse_cost
    ) {
      player.carried -= tuning.pulse_cost;
      player.pulseCdTicks = pulseCooldownTicks;

      const pulseCenter = [player.pos[0], player.pos[1] + 0.8, player.pos[2]];
      const stunnedIds = [];

      for (const s of shades) {
        if (dist3D(pulseCenter, s.pos) <= tuning.pulse_radius + EPS) {
          const wasDraining = s.state === 'drain';
          const dx = s.pos[0] - player.pos[0];
          const dz = s.pos[2] - player.pos[2];
          const d = Math.hypot(dx, dz);
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;

          s.state = 'stunned';
          s.stateTicksLeft = pulseStunTicks;
          s.drainTickCounter = 0;
          s.targetLanternId = null;
          s.pushTicksLeft = PULSE_PUSH_TICKS;
          s.pushStepX = (nx * tuning.pulse_push_m) / PULSE_PUSH_TICKS;
          s.pushStepZ = (nz * tuning.pulse_push_m) / PULSE_PUSH_TICKS;
          stunnedIds.push(s.id);
          score += wasDraining ? scorePerDrainStun : scorePerStun;
        }
      }

      emit('pulse', { stunned_ids: stunnedIds });

      for (const d of drifters) {
        if (d.state === 'removed') continue;
        if (dist3D(pulseCenter, d.pos) <= tuning.pulse_radius + EPS) {
          if (d.state === 'chase') {
            d.state = 'flee';
            d.fleeTicksLeft = DRIFTER_FLEE_TICKS;
          } else if (d.state === 'flee' && d.stolen > 0) {
            const amount = d.stolen;
            const dropGroundY = map.getTopGroundY(d.pos[0], d.pos[2]) ?? 0;
            for (let i = 0; i < amount; i++) {
              const ang = (i / amount) * Math.PI * 2;
              const offset = amount > 1 ? 0.4 : 0;
              motes.push({
                id: `M${nextMoteId++}`,
                pos: [
                  round3(d.pos[0] + Math.cos(ang) * offset),
                  dropGroundY,
                  round3(d.pos[2] + Math.sin(ang) * offset),
                ],
                kind: 'dropped',
                ttlTicks: DROPPED_MOTE_TTL_TICKS,
              });
            }
            d.stolen = 0;
            d.fleeTicksLeft = DRIFTER_DROP_FLEE_TICKS;
            emit('drifter_drop', { drifter_id: d.id, amount });
          }
        }
      }
    }

    // =========================================================================
    // STEP 8: Move Shades (6 states incl. drain) and Drifters
    // =========================================================================
    for (const s of shades) {
      if (s.state === 'spawning') {
        continue;
      }

      if (s.state === 'stunned') {
        if (s.pushTicksLeft > 0) {
          const oldX = s.pos[0];
          const oldZ = s.pos[2];
          const res = map.resolveHorizontalMove(
            oldX,
            oldZ,
            oldX + s.pushStepX,
            oldZ + s.pushStepZ,
            s.pos[1]
          );
          if (res.blocked) {
            s.pos[0] = res.x;
            s.pos[2] = res.z;
            s.pushTicksLeft = 0;
          } else {
            s.pos[0] = res.x;
            s.pos[2] = res.z;
            s.pushTicksLeft -= 1;
          }
          blockShadeOutsideSafeZones(s);
          map.clampShadeToMap(s.pos);
        }
        continue;
      }

      if (s.state === 'recoil') {
        const stepDist = SHADE_RECOIL_DIST / SHADE_RECOIL_TICKS;
        const res = map.resolveHorizontalMove(
          s.pos[0],
          s.pos[2],
          s.pos[0] + s.recoilDirX * stepDist,
          s.pos[2] + s.recoilDirZ * stepDist,
          s.pos[1]
        );
        s.pos[0] = res.x;
        s.pos[2] = res.z;
        blockShadeOutsideSafeZones(s);
        map.clampShadeToMap(s.pos);
        continue;
      }

      const dPlayer = distXZ(s.pos, player.pos);

      // Handle drain state transitions
      if (s.state === 'drain') {
        if (player.respawnWaitTicks === 0 && dPlayer <= SHADE_DRAIN_CHASE_RADIUS + EPS) {
          s.state = 'chase';
          s.drainTickCounter = 0;
          s.targetLanternId = null;
        } else {
          const tl = lanterns.find((lt) => lt.id === s.targetLanternId);
          if (
            !tl ||
            !tl.lit ||
            tl.fuelUnits >= lowFuelUnits ||
            distXZ(s.pos, tl.pos) > SHADE_DRAIN_RADIUS + EPS
          ) {
            s.state = 'wander';
            s.drainTickCounter = 0;
            s.targetLanternId = null;
          } else {
            // Stay stationary while draining
            continue;
          }
        }
      }

      // Standard wander <-> chase transitions
      if (s.state === 'wander') {
        if (player.respawnWaitTicks === 0 && dPlayer <= SHADE_DETECT_RADIUS + EPS) {
          s.state = 'chase';
          s.targetLanternId = null;
        }
      } else if (s.state === 'chase') {
        if (player.respawnWaitTicks > 0 || dPlayer > SHADE_LEASH_RADIUS + EPS) {
          s.state = 'wander';
        }
      }

      if (s.state === 'chase') {
        const dx = player.pos[0] - s.pos[0];
        const dz = player.pos[2] - s.pos[2];
        const d = Math.hypot(dx, dz);
        const stepDist = shadeSpeed * DT;
        if (d > 1e-6) {
          const moveDist = Math.min(d, stepDist);
          const nx = s.pos[0] + (dx / d) * moveDist;
          const nz = s.pos[2] + (dz / d) * moveDist;
          const res = map.resolveHorizontalMove(s.pos[0], s.pos[2], nx, nz, s.pos[1]);
          s.pos[0] = res.x;
          s.pos[2] = res.z;
        }
      } else {
        // wander: prioritize closest lit lantern with fuel < 30; else closest unlit lantern
        const weakLantern = findClosestWeakLantern(s.pos);
        if (weakLantern) {
          s.targetLanternId = weakLantern.id;
          const dx = weakLantern.pos[0] - s.pos[0];
          const dz = weakLantern.pos[2] - s.pos[2];
          const d = Math.hypot(dx, dz);
          if (d <= SHADE_DRAIN_RADIUS + EPS) {
            s.state = 'drain';
            s.drainTickCounter = 0;
          } else {
            const stepDist = Math.min(d, shadeSpeed * DT);
            const res = map.resolveHorizontalMove(
              s.pos[0],
              s.pos[2],
              s.pos[0] + (dx / d) * stepDist,
              s.pos[2] + (dz / d) * stepDist,
              s.pos[1]
            );
            s.pos[0] = res.x;
            s.pos[2] = res.z;
            if (distXZ(s.pos, weakLantern.pos) <= SHADE_DRAIN_RADIUS + EPS) {
              s.state = 'drain';
              s.drainTickCounter = 0;
            }
          }
        } else {
          const unlitLantern = findClosestUnlitLantern(s.pos);
          if (unlitLantern && distXZ(s.pos, unlitLantern.pos) > 2.5) {
            s.targetLanternId = unlitLantern.id;
            const dx = unlitLantern.pos[0] - s.pos[0];
            const dz = unlitLantern.pos[2] - s.pos[2];
            const d = Math.hypot(dx, dz);
            const stepDist = Math.min(d, SHADE_WANDER_SPEED * DT);
            const res = map.resolveHorizontalMove(
              s.pos[0],
              s.pos[2],
              s.pos[0] + (dx / d) * stepDist,
              s.pos[2] + (dz / d) * stepDist,
              s.pos[1]
            );
            s.pos[0] = res.x;
            s.pos[2] = res.z;
          } else {
            s.targetLanternId = null;
            s.wanderTimer -= 1;
            if (s.wanderTimer <= 0) {
              const ang = rng.next() * Math.PI * 2;
              s.wanderDirX = Math.cos(ang);
              s.wanderDirZ = Math.sin(ang);
              s.wanderTimer = 90;
            }
            const stepDist = SHADE_WANDER_SPEED * DT;
            const res = map.resolveHorizontalMove(
              s.pos[0],
              s.pos[2],
              s.pos[0] + s.wanderDirX * stepDist,
              s.pos[2] + s.wanderDirZ * stepDist,
              s.pos[1]
            );
            if (res.blocked) {
              s.wanderDirX = -s.wanderDirX;
              s.wanderDirZ = -s.wanderDirZ;
            }
            s.pos[0] = res.x;
            s.pos[2] = res.z;
          }
        }
      }

      blockShadeOutsideSafeZones(s);
      map.clampShadeToMap(s.pos);
    }

    // Move Drifters (Gió Lạc)
    for (const d of drifters) {
      if (d.state === 'removed') continue;

      const dPlayer = distXZ(d.pos, player.pos);
      if (d.state === 'idle') {
        if (
          !d.hasStolen &&
          player.respawnWaitTicks === 0 &&
          player.carried >= DRIFTER_MIN_CARRIED &&
          dPlayer <= DRIFTER_DETECT_RADIUS + EPS
        ) {
          d.state = 'chase';
        }
      } else if (d.state === 'chase') {
        if (
          d.hasStolen ||
          player.respawnWaitTicks > 0 ||
          player.carried < DRIFTER_MIN_CARRIED ||
          dPlayer > DRIFTER_DETECT_RADIUS + EPS
        ) {
          d.state = 'idle';
        }
      }

      if (d.state === 'chase') {
        const dx = player.pos[0] - d.pos[0];
        const dz = player.pos[2] - d.pos[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-6) {
          const stepDist = Math.min(dist, DRIFTER_CHASE_SPEED * DT);
          d.pos[0] += (dx / dist) * stepDist;
          d.pos[2] += (dz / dist) * stepDist;
        }
      } else if (d.state === 'flee') {
        const dx = d.pos[0] - player.pos[0];
        const dz = d.pos[2] - player.pos[2];
        const dist = Math.hypot(dx, dz);
        const nx = dist > 1e-6 ? dx / dist : 1;
        const nz = dist > 1e-6 ? dz / dist : 0;
        d.pos[0] += nx * DRIFTER_FLEE_SPEED * DT;
        d.pos[2] += nz * DRIFTER_FLEE_SPEED * DT;
      } else {
        d.wanderTimer -= 1;
        if (d.wanderTimer <= 0) {
          const ang = rng.next() * Math.PI * 2;
          d.wanderDirX = Math.cos(ang);
          d.wanderDirZ = Math.sin(ang);
          d.wanderTimer = 90;
        }
        d.pos[0] += d.wanderDirX * DRIFTER_IDLE_SPEED * DT;
        d.pos[2] += d.wanderDirZ * DRIFTER_IDLE_SPEED * DT;
        map.clampShadeToMap(d.pos);
      }
    }

    // =========================================================================
    // STEP 9: Collisions — Drifters steal FIRST, then Shades hit (ascending id)
    // =========================================================================
    if (player.respawnWaitTicks === 0 && player.flames > 0) {
      for (const d of drifters) {
        if (d.state === 'removed' || d.state === 'flee' || d.hasStolen) continue;
        if (distXZ(player.pos, d.pos) <= DRIFTER_STEAL_RADIUS + EPS && player.carried > 0) {
          const amount = Math.min(3, player.carried);
          player.carried -= amount;
          d.stolen = amount;
          d.hasStolen = true;
          d.state = 'flee';
          d.fleeTicksLeft = DRIFTER_FLEE_TICKS;
          emit('drifter_steal', { drifter_id: d.id, amount, carried: player.carried });
        }
      }

      if (player.invulnTicks === 0) {
        for (const s of shades) {
          if (
            s.state === 'spawning' ||
            s.state === 'stunned' ||
            s.state === 'recoil' ||
            s.safePushTicks > 0
          ) {
            continue;
          }
          if (
            distXZ(player.pos, s.pos) <= tuning.shade_hit_radius + EPS &&
            Math.abs(player.pos[1] - s.pos[1]) <= 1.5 + EPS
          ) {
            player.flames = Math.max(0, player.flames - 1);
            const dropped =
              tuning.hit_drop_ratio > 0
                ? Math.floor(player.carried * tuning.hit_drop_ratio)
                : 0;
            player.carried -= dropped;
            player.invulnTicks = invulnDurationTicks;

            for (let i = 0; i < dropped; i++) {
              const ang = rng.next() * Math.PI * 2;
              const rad = 1.5 + rng.next() * 1.0;
              const mx = round3(player.pos[0] + Math.cos(ang) * rad);
              const mz = round3(player.pos[2] + Math.sin(ang) * rad);
              const my = map.getTopGroundY(mx, mz) ?? round3(player.pos[1]);
              motes.push({
                id: `M${nextMoteId++}`,
                pos: [mx, my, mz],
                kind: 'dropped',
                ttlTicks: DROPPED_MOTE_TTL_TICKS,
              });
            }

            const rdx = s.pos[0] - player.pos[0];
            const rdz = s.pos[2] - player.pos[2];
            const rd = Math.hypot(rdx, rdz);
            s.recoilDirX = rd > 1e-6 ? rdx / rd : 1;
            s.recoilDirZ = rd > 1e-6 ? rdz / rd : 0;
            s.state = 'recoil';
            s.stateTicksLeft = SHADE_RECOIL_TICKS;
            s.drainTickCounter = 0;
            s.targetLanternId = null;

            emit('player_hit', {
              by: 'shade',
              flames: player.flames,
              dropped,
            });
            break;
          }
        }
      }
    }

    // =========================================================================
    // STEP 10: Scheduled Spawns (interact starting next tick)
    // =========================================================================
    if (randomMotes && simTick > 0 && simTick % 240 === 0 && motes.length < 30) {
      const pt = pickFreeMoteSpawn();
      if (pt) {
        motes.push({
          id: `M${nextMoteId++}`,
          pos: pt,
          kind: 'random',
          ttlTicks: null,
        });
      }
    }

    if (randomShades) {
      if (simTick === 300) {
        spawnOneShade(emit);
        spawnOneShade(emit);
      } else if (simTick > 300 && (simTick - 300) % map.shadeSpawnInterval === 0) {
        spawnOneShade(emit);
      }
    }

    if (randomDrifters && map.maxDrifters > 0 && simTick > 0 && simTick % 1200 === 0) {
      spawnOneDrifter();
    }

    // =========================================================================
    // STEP 11: Win / Loss (Phase 3: NO all_lit! no_flames > dawn_survived > dawn)
    // =========================================================================
    if (player.flames <= 0) {
      state = 'lost';
      endReason = 'no_flames';
      emit('game_over', { result: 'lost', reason: 'no_flames' });
    } else if (timeLeftTicks <= 0) {
      const litLanterns = lanterns.filter((l) => l.lit);
      const requiredLit = Math.ceil(winRatio * lanterns.length);
      if (litLanterns.length >= requiredLit) {
        state = 'won';
        endReason = 'dawn_survived';
        for (const l of litLanterns) {
          score += scorePerLitDawn + Math.floor(l.fuelUnits / FUEL_SCALE);
        }
        score += player.flames * scorePerFlameLeft;
        emit('game_over', { result: 'won', reason: 'dawn_survived' });
      } else {
        state = 'lost';
        endReason = 'dawn';
        emit('game_over', { result: 'lost', reason: 'dawn' });
      }
    }

    return stepEvents || EMPTY_EVENTS;
  }

  function getSnapshot() {
    return {
      type: 'snapshot',
      tick,
      sim_tick: simTick,
      night,
      state,
      time_left_s: round3(timeLeftTicks / TICK_RATE),
      score,
      wind: {
        active: windActive,
        dir_deg: windActive ? round3(windDirDeg) : 0,
      },
      player: {
        pos: roundPos(player.pos),
        vel: roundPos(player.vel),
        grounded: player.grounded,
        flames: player.flames,
        carried: player.carried,
        capacity: getCarryCapacity(),
        invuln: player.invulnTicks > 0,
        dash_cd_s: round3(player.dashCdTicks / TICK_RATE),
        pulse_cd_s: round3(player.pulseCdTicks / TICK_RATE),
        charm_s: round3(player.charmTicks / TICK_RATE),
      },
      lanterns: lanterns.map((l) => ({
        id: l.id,
        pos: roundPos(l.pos),
        lit: l.lit,
        deposited: l.deposited,
        fuel: l.lit ? round1Fuel(l.fuelUnits) : 0,
        ever_lit: l.everLit,
        relit_count: l.relitCount,
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
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / TICK_RATE),
      })),
      drifters: drifters.map((d) => ({
        id: d.id,
        pos: roundPos(d.pos),
        state: d.state,
        stolen: d.stolen,
      })),
      charms: charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE),
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
      simTick,
      night,
      mapName: map.name,
      state,
      endReason,
      timeLeftS: timeLeftTicks / TICK_RATE,
      score,
      requiredLitAtDawn: Math.ceil(winRatio * lanterns.length),
      wind: {
        active: windActive,
        warning: windWarning,
        dirDeg: windDirDeg,
      },
      tuning,
      jumpPads: map.jumpPads,
      player: {
        pos: [...player.pos],
        vel: [...player.vel],
        grounded: player.grounded,
        flames: player.flames,
        carried: player.carried,
        capacity: getCarryCapacity(),
        successfulLights,
        facingYaw: player.facingYaw,
        invulnTimer: player.invulnTicks / TICK_RATE,
        dashCdLeft: player.dashCdTicks / TICK_RATE,
        pulseCdLeft: player.pulseCdTicks / TICK_RATE,
        charmLeft: player.charmTicks / TICK_RATE,
        isDashing: player.dashTicksLeft > 0,
        isRespawning: player.respawnWaitTicks > 0,
      },
      lanterns: lanterns.map((l) => ({
        ...l,
        pos: [...l.pos],
        fuel: l.lit ? l.fuelUnits / FUEL_SCALE : 0,
        fuelMax: fuelMaxUnits / FUEL_SCALE,
        isLowFuel: l.lit && l.fuelUnits < lowFuelUnits,
        isFull: l.lit && l.fuelUnits >= fuelMaxUnits,
        requiredCost: l.everLit ? relightCost : tuning.lantern_cost,
      })),
      shades: shades.map((s) => ({ ...s, pos: [...s.pos] })),
      motes: motes.map((m) => ({ ...m, pos: [...m.pos] })),
      drifters: drifters.map((d) => ({ ...d, pos: [...d.pos] })),
      charms: charms.map((c) => ({ ...c, pos: [...c.pos] })),
    };
  }

  return {
    step,
    getSnapshot,
    getEndRecord,
    getRenderState,
    getState: () => state,
    isFinished: () => state === 'won' || state === 'lost',
    getTick: () => tick,
    getSimTick: () => simTick,
    getScore: () => score,
  };
}
