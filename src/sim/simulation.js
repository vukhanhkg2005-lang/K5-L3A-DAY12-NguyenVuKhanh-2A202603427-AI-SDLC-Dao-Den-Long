import { createRng } from './prng.js';
import { EPS, round3, roundPos, distXZ, dist3D, transformMoveInput } from './math.js';
import { getNightMap } from './maps.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

const GRAVITY = -20.0;
const JUMP_VELOCITY = 7.0;
const CHARM_RUN_SPEED = 7.2;
const CHARM_DURATION_TICKS = 600;
const CHARM_RESPAWN_TICKS = 2700;

const SHADE_DETECT_RADIUS = 12.0;
const SHADE_LEASH_RADIUS = 18.0;
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

function compareIds(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
  }

  // Lanterns
  const lanterns = map.lanterns.map((l) => ({
    id: l.id,
    pos: [...l.pos],
    lit: false,
    deposited: 0,
  }));

  if (scenario && Array.isArray(scenario.lanterns)) {
    for (const ov of scenario.lanterns) {
      const target = lanterns.find((l) => l.id === ov.id);
      if (target) {
        if (ov.pos !== undefined) target.pos = [ov.pos[0], ov.pos[1], ov.pos[2]];
        if (ov.deposited !== undefined) target.deposited = ov.deposited;
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
    // 20 initial motes at 20 distinct spawn points
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

  function makeShade({ id, pos, state, stateTicksLeft }) {
    const wanderAngle = rng.next() * Math.PI * 2;
    return {
      id,
      pos: [pos[0], pos[1], pos[2]],
      state,
      stateTicksLeft,
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
      shades.push(makeShade({ id, pos: s.pos, state: st, stateTicksLeft: ticksLeft }));
    }
  }
  // Note: When scenario.shades is NOT provided, Night starts with 0 shades;
  // 2 shades spawn at sim_tick = 300 per Contract v1.1!

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
  let nextWindCycleIndex = 1; // First gust starts at sim_tick = 1800

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
      const inSafe = lanterns.some((l) => l.lit && distXZ(pt, l.pos) < tuning.safe_radius);
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

  function spawnOneShade(events) {
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
    events.push({
      type: 'event',
      tick,
      name: 'shade_spawned',
      data: { id },
    });
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
    return true;
  }

  function blockShadeOutsideSafeZones(s) {
    const minSafe = tuning.safe_radius + 0.02;
    for (const l of lanterns) {
      if (!l.lit) continue;
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

  function step(rawInput = {}) {
    if (state === 'won' || state === 'lost') {
      return [];
    }

    const events = [];
    tick += 1;

    // =========================================================================
    // STEP 1: Read input (handle pause first; if just paused, stop step here)
    // =========================================================================
    const currPause = Boolean(rawInput.pause);
    const pausePressed = currPause && !prevButtons.pause;
    prevButtons.pause = currPause;

    if (state === 'playing' && pausePressed) {
      state = 'paused';
      events.push({ type: 'event', tick, name: 'paused', data: {} });
      return events;
    }

    if (state === 'paused') {
      if (pausePressed) {
        state = 'playing';
        events.push({ type: 'event', tick, name: 'resumed', data: {} });
        // Continue steps 2..12 for this tick!
      } else {
        // Still paused: tick incremented, sim_tick and everything else frozen
        return events;
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

    // Advance gameplay sim_tick
    simTick += 1;

    // =========================================================================
    // STEP 2: Decrement timers (time, cooldowns, invuln, stun, charm, TTL, respawn)
    // =========================================================================
    if (timeLeftTicks > 0) timeLeftTicks -= 1;
    if (player.invulnTicks > 0) player.invulnTicks -= 1;
    if (player.dashCdTicks > 0) player.dashCdTicks -= 1;
    if (player.pulseCdTicks > 0) player.pulseCdTicks -= 1;
    if (player.charmTicks > 0) player.charmTicks -= 1;

    // Respawn wait timer after falling
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

    // Dropped mote TTL
    if (motes.length > 0) {
      const survivingMotes = [];
      for (const m of motes) {
        if (m.ttlTicks !== null) {
          m.ttlTicks -= 1;
          if (m.ttlTicks <= 0) continue;
        }
        survivingMotes.push(m);
      }
      motes = survivingMotes;
    }

    // Charm respawn timers
    for (const c of charms) {
      if (!c.available && c.respawnTicks > 0) {
        c.respawnTicks -= 1;
        if (c.respawnTicks === 0) {
          c.available = true;
        }
      }
    }

    // Shade state timers (spawning, stunned, recoil)
    for (const s of shades) {
      if (s.state === 'spawning' || s.state === 'stunned' || s.state === 'recoil') {
        if (s.stateTicksLeft > 0) {
          s.stateTicksLeft -= 1;
        }
        if (s.stateTicksLeft <= 0) {
          s.stateTicksLeft = 0;
          s.pushTicksLeft = 0;
          const d = distXZ(s.pos, player.pos);
          if (s.state === 'recoil' && player.respawnWaitTicks === 0 && d <= SHADE_LEASH_RADIUS) {
            s.state = 'chase';
          } else if (player.respawnWaitTicks === 0 && d <= SHADE_DETECT_RADIUS) {
            s.state = 'chase';
          } else {
            s.state = 'wander';
          }
        }
      }
    }

    // Drifter flee timers
    for (const d of drifters) {
      if (d.state === 'flee') {
        if (d.fleeTicksLeft > 0) d.fleeTicksLeft -= 1;
        if (d.fleeTicksLeft <= 0) {
          d.state = 'removed';
          d.fleeTicksLeft = 0;
        }
      }
    }

    // Wind cycle update (Night 3)
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

    // =========================================================================
    // STEP 3: Move Mây (jump, dash, jump pads, wind) & check fall (Y < -10)
    // =========================================================================
    if (player.respawnWaitTicks === 0) {
      const [wx, wz] = transformMoveInput(move, camYawDeg);
      const moveLen = Math.hypot(wx, wz);

      if (moveLen > 1e-4) {
        player.facingYaw = Math.atan2(wx, wz);
      }

      // Check dash activation (rising edge; ignored if already dashing; no cooldown if charm active)
      const dashReady = player.dashTicksLeft === 0 && (player.charmTicks > 0 || player.dashCdTicks === 0);
      if (dashPressed && dashReady) {
        player.dashTicksLeft = dashDurationTicks;
        player.dashCdTicks = player.charmTicks > 0 ? 0 : dashCooldownTicks;
        player.launchActive = false;
        if (moveLen > 1e-4) {
          player.dashDir = [wx / moveLen, wz / moveLen];
        } else {
          player.dashDir = [Math.sin(player.facingYaw), Math.cos(player.facingYaw)];
        }
        player.vel[1] = 0; // Dash keeps Y constant
        events.push({ type: 'event', tick, name: 'dash', data: {} });
      }

      // Horizontal velocity calculation
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
      // If launchActive && not dashing, keep launch vel[0], vel[2] unchanged!

      // Apply wind push (2 m/s along windDirDeg)
      let windVx = 0;
      let windVz = 0;
      if (windActive) {
        const wRad = (windDirDeg * Math.PI) / 180;
        windVx = Math.cos(wRad) * WIND_PUSH_SPEED;
        windVz = Math.sin(wRad) * WIND_PUSH_SPEED;
      }

      // Jump (only when grounded and not dashing)
      if (jumpPressed && player.grounded && !isDashingThisTick && !player.launchActive) {
        player.vel[1] = JUMP_VELOCITY;
        player.grounded = false;
      }

      // Apply horizontal move with cliff/tower collision
      const oldX = player.pos[0];
      const oldZ = player.pos[2];
      const targetX = oldX + (player.vel[0] + windVx) * DT;
      const targetZ = oldZ + (player.vel[2] + windVz) * DT;
      const resolved = map.resolveHorizontalMove(oldX, oldZ, targetX, targetZ, player.pos[1]);
      player.pos[0] = resolved.x;
      player.pos[2] = resolved.z;

      // Vertical physics (gravity unless currently mid-dash)
      if (!isDashingThisTick) {
        const groundY = map.getGroundY(player.pos[0], player.pos[2], player.pos[1]);
        if (player.grounded && player.vel[1] <= 0) {
          if (groundY !== null && player.pos[1] - groundY <= 0.6) {
            // Smoothly follow ramp/flat surface
            player.pos[1] = groundY;
            player.vel[1] = 0;
          } else {
            // Walked off edge! Start falling
            player.grounded = false;
            player.vel[1] += GRAVITY * DT;
            player.pos[1] += player.vel[1] * DT;
          }
        } else {
          player.vel[1] += GRAVITY * DT;
          const nextY = player.pos[1] + player.vel[1] * DT;
          if (player.vel[1] <= 0 && groundY !== null && nextY <= groundY && player.pos[1] >= groundY - 0.6) {
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
        // Check if grounded while dashing on flat surface
        const groundY = map.getGroundY(player.pos[0], player.pos[2], player.pos[1]);
        if (groundY !== null && Math.abs(player.pos[1] - groundY) <= 0.15) {
          player.pos[1] = groundY;
          player.grounded = true;
        } else {
          player.grounded = false;
        }
      }

      // Jump pads check (Night 2 & Night 3)
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

      // Check fall off island (Y < -10)
      if (tuning.fall_enabled && player.pos[1] < FALL_Y_THRESHOLD) {
        player.flames = Math.max(0, player.flames - 1);
        const lost = player.carried;
        player.carried = 0;
        player.dashTicksLeft = 0;
        player.launchActive = false;
        player.vel = [0, 0, 0];

        events.push({
          type: 'event',
          tick,
          name: 'player_hit',
          data: {
            by: 'fall',
            flames: player.flames,
            dropped: 0,
            lost,
          },
        });

        if (player.flames > 0) {
          player.respawnWaitTicks = FALL_RESPAWN_WAIT_TICKS;
        }
      }
    }

    // =========================================================================
    // STEP 4: Pick up motes and charms (XZ <= 1.0m & |ΔY| <= 1.5m)
    // =========================================================================
    if (player.respawnWaitTicks === 0 && player.flames > 0) {
      if (motes.length > 0 && player.carried < tuning.carry_capacity) {
        const remaining = [];
        for (const m of motes) {
          if (
            player.carried < tuning.carry_capacity &&
            distXZ(player.pos, m.pos) <= tuning.pickup_radius + EPS &&
            Math.abs(player.pos[1] - m.pos[1]) <= 1.5 + EPS
          ) {
            player.carried += 1;
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
          events.push({
            type: 'event',
            tick,
            name: 'charm_picked',
            data: { charm_id: c.id, charm_ticks: CHARM_DURATION_TICKS },
          });
        }
      }
    }

    // =========================================================================
    // STEP 5: Interact with nearest unlit lantern (XZ <= 2.0m, tie lowest id)
    // =========================================================================
    if (player.respawnWaitTicks === 0 && player.flames > 0 && interactPressed && player.carried > 0) {
      let bestLantern = null;
      let bestDist = Infinity;
      for (const l of lanterns) {
        if (l.lit) continue;
        const d = distXZ(player.pos, l.pos);
        if (d <= tuning.interact_radius + EPS) {
          if (
            bestLantern === null ||
            d < bestDist - EPS ||
            (Math.abs(d - bestDist) <= EPS && l.id < bestLantern.id)
          ) {
            bestDist = d;
            bestLantern = l;
          }
        }
      }
      if (bestLantern) {
        const needed = Math.max(0, tuning.lantern_cost - bestLantern.deposited);
        const amount = Math.min(player.carried, needed);
        if (amount > 0) {
          player.carried -= amount;
          bestLantern.deposited += amount;
          score += amount * tuning.score.per_mote;
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
            // Mark any shade currently inside safe_radius for smooth push-out (<= 30 ticks)
            for (const s of shades) {
              if (distXZ(s.pos, bestLantern.pos) < tuning.safe_radius) {
                s.safePushTicks = SAFE_PUSH_TICKS;
                s.safePushLanternId = bestLantern.id;
              }
            }
          }
        }
      }
    }

    // =========================================================================
    // STEP 6: Update safe zones around lit lanterns
    // =========================================================================
    const minSafeEdge = tuning.safe_radius + 0.05;
    for (const s of shades) {
      if (s.safePushTicks > 0) {
        const l = lanterns.find((lt) => lt.id === s.safePushLanternId);
        if (l && l.lit) {
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
    // STEP 7: Pulse (Tỏa Sáng) — 3D radius 5m from player.pos + (0, 0.8, 0)
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

      // Lock Shade targets immediately
      const sortedShades = [...shades].sort(compareIds);
      for (const s of sortedShades) {
        if (dist3D(pulseCenter, s.pos) <= tuning.pulse_radius + EPS) {
          const dx = s.pos[0] - player.pos[0];
          const dz = s.pos[2] - player.pos[2];
          const d = Math.hypot(dx, dz);
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;

          s.state = 'stunned';
          s.stateTicksLeft = pulseStunTicks;
          s.pushTicksLeft = PULSE_PUSH_TICKS;
          s.pushStepX = (nx * tuning.pulse_push_m) / PULSE_PUSH_TICKS;
          s.pushStepZ = (nz * tuning.pulse_push_m) / PULSE_PUSH_TICKS;
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

      // Lock Drifter targets immediately
      const sortedDrifters = [...drifters].sort(compareIds);
      for (const d of sortedDrifters) {
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
            events.push({
              type: 'event',
              tick,
              name: 'drifter_drop',
              data: { drifter_id: d.id, amount },
            });
          }
        }
      }
    }

    // =========================================================================
    // STEP 8: Move Shades and Drifters (Gió Lạc)
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

      // Detection / Leash transitions for wander <-> chase
      const dPlayer = distXZ(s.pos, player.pos);
      if (s.state === 'wander') {
        if (player.respawnWaitTicks === 0 && dPlayer <= SHADE_DETECT_RADIUS + EPS) {
          s.state = 'chase';
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
        // wander
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
        // idle wander at 2 m/s
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
      // 9a. Drifter steal (ignores safe_radius and invuln; max once per drifter)
      const sortedDrifters = [...drifters].sort(compareIds);
      for (const d of sortedDrifters) {
        if (d.state === 'removed' || d.state === 'flee' || d.hasStolen) continue;
        if (distXZ(player.pos, d.pos) <= DRIFTER_STEAL_RADIUS + EPS && player.carried > 0) {
          const amount = Math.min(3, player.carried);
          player.carried -= amount;
          d.stolen = amount;
          d.hasStolen = true;
          d.state = 'flee';
          d.fleeTicksLeft = DRIFTER_FLEE_TICKS;
          events.push({
            type: 'event',
            tick,
            name: 'drifter_steal',
            data: { drifter_id: d.id, amount, carried: player.carried },
          });
        }
      }

      // 9b. Shade hit (max 1 flame loss per tick; skipped if invuln)
      if (player.invulnTicks === 0) {
        const sortedShades = [...shades].sort(compareIds);
        for (const s of sortedShades) {
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

            // Scatter dropped motes in 1.5 - 2.5m ring around Mây (TTL 480 ticks)
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

            // Shade enters recoil (2m over 60 ticks away from player)
            const rdx = s.pos[0] - player.pos[0];
            const rdz = s.pos[2] - player.pos[2];
            const rd = Math.hypot(rdx, rdz);
            s.recoilDirX = rd > 1e-6 ? rdx / rd : 1;
            s.recoilDirZ = rd > 1e-6 ? rdz / rd : 0;
            s.state = 'recoil';
            s.stateTicksLeft = SHADE_RECOIL_TICKS;

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
    }

    // =========================================================================
    // STEP 10: Scheduled Spawns (only interact starting next tick)
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
        spawnOneShade(events);
        spawnOneShade(events);
      } else if (
        simTick > 300 &&
        (simTick - 300) % map.shadeSpawnInterval === 0
      ) {
        spawnOneShade(events);
      }
    }

    if (randomDrifters && map.maxDrifters > 0 && simTick > 0 && simTick % 1200 === 0) {
      spawnOneDrifter();
    }

    // =========================================================================
    // STEP 11: Win / Loss evaluation (Priority: no_flames > all_lit > dawn)
    // =========================================================================
    const allLit = lanterns.every((l) => l.lit);
    if (player.flames <= 0) {
      state = 'lost';
      endReason = 'no_flames';
      events.push({
        type: 'event',
        tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'no_flames' },
      });
    } else if (allLit) {
      state = 'won';
      endReason = 'all_lit';
      const timeLeftS = timeLeftTicks / TICK_RATE;
      score +=
        Math.floor(timeLeftS) * tuning.score.per_second_left +
        player.flames * tuning.score.per_flame_left;
      events.push({
        type: 'event',
        tick,
        name: 'game_over',
        data: { result: 'won', reason: 'all_lit' },
      });
    } else if (timeLeftTicks <= 0) {
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
        facingYaw: player.facingYaw,
        invulnTimer: player.invulnTicks / TICK_RATE,
        dashCdLeft: player.dashCdTicks / TICK_RATE,
        pulseCdLeft: player.pulseCdTicks / TICK_RATE,
        charmLeft: player.charmTicks / TICK_RATE,
        isDashing: player.dashTicksLeft > 0,
        isRespawning: player.respawnWaitTicks > 0,
      },
      lanterns: lanterns.map((l) => ({ ...l, pos: [...l.pos] })),
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
