import { createRng } from './prng.js';
import { distXZ, round3 } from './math.js';
import { getNightMap } from './maps.js';
import { DT } from './simulation.js';

const BENCH_SHADE_COUNT = 200;
const BENCH_MOTE_COUNT = 100;
const WANDER_SPEED = 2.0;

/**
 * Contract v1.3 Standard Benchmark Scene (Night 1):
 * - 200 Shades in 'wander' state spread evenly across island (seed 42)
 * - 100 Motes spread evenly across island
 * - L1, L2, L3 lit with fuel = 100 (safe_radius = 6m active); L4, L5 unlit
 * - Spawning, damage, pickup, fuel decay, and end conditions disabled
 * - Mây stationary at (0, 0, 0)
 * - Shades move under normal 'wander' rules
 */
export function createBenchSimulation({ seed = 42, tuning }) {
  const map = getNightMap(1);
  const rng = createRng(seed);
  const safeRadius = tuning.safe_radius ?? 6.0;
  const fuelMax = tuning.fuel_max ?? 100;

  const lanterns = map.lanterns.map((l, idx) => ({
    id: l.id,
    pos: [...l.pos],
    lit: idx < 3, // L1, L2, L3 lit with fuel 100
    deposited: idx < 3 ? tuning.lantern_cost : 0,
    fuel: idx < 3 ? fuelMax : 0,
    fuelMax,
    everLit: idx < 3,
    relitCount: 0,
    isLowFuel: false,
    isFull: idx < 3,
    requiredCost: tuning.lantern_cost,
  }));

  const litLanterns = lanterns.filter((l) => l.lit);

  function randomIslandPoint(minR, maxR, avoidSafeZones) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const pt = rng.pointInRing(minR, maxR);
      if (avoidSafeZones) {
        const insideSafe = litLanterns.some((l) => distXZ(pt, l.pos) < safeRadius + 0.5);
        if (insideSafe) continue;
      }
      return [round3(pt[0]), 0, round3(pt[2])];
    }
    const fallback = rng.pointInRing(2, 16);
    return [round3(fallback[0]), 0, round3(fallback[2])];
  }

  // 200 Shades in 'wander' state
  const shades = [];
  for (let i = 0; i < BENCH_SHADE_COUNT; i++) {
    const pt = randomIslandPoint(3, 38.5, true);
    const ang = rng.next() * Math.PI * 2;
    shades.push({
      id: `S${i + 1}`,
      pos: [pt[0], 1.0, pt[2]],
      state: 'wander',
      wanderDirX: Math.cos(ang),
      wanderDirZ: Math.sin(ang),
      wanderTimer: 45 + Math.floor(rng.next() * 90),
    });
  }

  // 100 Motes spread evenly across island
  const motes = [];
  for (let i = 0; i < BENCH_MOTE_COUNT; i++) {
    const pt = randomIslandPoint(2, 37.5, false);
    motes.push({
      id: `M${i + 1}`,
      pos: pt,
      kind: 'random',
    });
  }

  const player = {
    pos: [0, 0, 0],
    vel: [0, 0, 0],
    grounded: true,
    flames: tuning.flames,
    carried: 0,
    capacity: tuning.carry_capacity,
    successfulLights: 0,
    facingYaw: 0,
    invulnTimer: 0,
    dashCdLeft: 0,
    pulseCdLeft: 0,
    charmLeft: 0,
    isDashing: false,
    isRespawning: false,
  };

  let tick = 0;

  function step() {
    tick += 1;
    const minSafe = safeRadius + 0.05;
    const stepDist = WANDER_SPEED * DT;

    for (let i = 0; i < shades.length; i++) {
      const s = shades[i];
      s.wanderTimer -= 1;
      if (s.wanderTimer <= 0) {
        const ang = rng.next() * Math.PI * 2;
        s.wanderDirX = Math.cos(ang);
        s.wanderDirZ = Math.sin(ang);
        s.wanderTimer = 90;
      }

      s.pos[0] += s.wanderDirX * stepDist;
      s.pos[2] += s.wanderDirZ * stepDist;

      // Keep outside L1-L3 safe zones
      for (let j = 0; j < litLanterns.length; j++) {
        const l = litLanterns[j];
        const dx = s.pos[0] - l.pos[0];
        const dz = s.pos[2] - l.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < minSafe) {
          const nx = d > 1e-6 ? dx / d : 1;
          const nz = d > 1e-6 ? dz / d : 0;
          s.pos[0] = l.pos[0] + nx * minSafe;
          s.pos[2] = l.pos[2] + nz * minSafe;
          s.wanderDirX = nx;
          s.wanderDirZ = nz;
        }
      }

      // Keep inside Night 1 island radius (39.5m)
      const r = Math.hypot(s.pos[0], s.pos[2]);
      if (r > 39.5) {
        const inv = 39.5 / r;
        s.pos[0] *= inv;
        s.pos[2] *= inv;
        s.wanderDirX = -s.pos[0] / 39.5;
        s.wanderDirZ = -s.pos[2] / 39.5;
      }
    }
  }

  function getRenderState() {
    return {
      tick,
      simTick: tick,
      night: 1,
      mapName: map.name,
      state: 'playing',
      endReason: null,
      timeLeftS: tuning.night1_duration_s,
      score: 0,
      requiredLitAtDawn: 3,
      wind: { active: false, warning: false, dirDeg: 0 },
      tuning,
      jumpPads: [],
      player,
      lanterns,
      shades,
      motes,
      drifters: [],
      charms: [],
    };
  }

  return { step, getRenderState };
}
