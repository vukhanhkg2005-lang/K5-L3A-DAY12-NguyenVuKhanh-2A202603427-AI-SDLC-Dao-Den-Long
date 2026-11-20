import { round3 } from './math.js';

const DEG2RAD = Math.PI / 180;
const STEP_UP = 0.55;
const _moveRes = { x: 0, z: 0, blocked: false };

function ringPoints(cx, cz, y, radius, startDeg, stepDeg, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const rad = (startDeg + i * stepDeg) * DEG2RAD;
    pts.push([round3(cx + radius * Math.cos(rad)), y, round3(cz + radius * Math.sin(rad))]);
  }
  return pts;
}

// Precompute Night 3 ramp unit vectors (30 deg and 150 deg from +X)
const RAMP_ANGLES = [30, 150].map((deg) => {
  const rad = deg * DEG2RAD;
  const ux = Math.cos(rad);
  const uz = Math.sin(rad);
  return { deg, ux, uz, vx: -uz, vz: ux };
});

function getNight3RampY(x, z) {
  for (const r of RAMP_ANGLES) {
    const s = x * r.ux + z * r.uz;
    const p = x * r.vx + z * r.vz;
    if (Math.abs(p) <= 1.5 && s >= 23.5 && s <= 30.1) {
      const h = (3.0 * (30.0 - s)) / 6.0;
      return Math.max(0, Math.min(3.0, h));
    }
  }
  return null;
}

function isInNight3Tier1(x, z) {
  const r = Math.hypot(x, z);
  return r >= 12.0 && r <= 24.0 && z > 0;
}

function isInNight3Tier2(x, z) {
  return Math.hypot(x, z) <= 8.0;
}

function getNight1Map() {
  const lanterns = [
    { id: 'L1', pos: [0, 0, 25] },
    { id: 'L2', pos: [23.8, 0, 7.7] },
    { id: 'L3', pos: [14.7, 0, -20.2] },
    { id: 'L4', pos: [-14.7, 0, -20.2] },
    { id: 'L5', pos: [-23.8, 0, 7.7] },
  ];
  const moteSpawns = [
    ...ringPoints(0, 0, 0, 12, 0, 45, 8),
    ...ringPoints(0, 0, 0, 33, 0, 22.5, 16),
  ];
  const shadeSpawns = ringPoints(0, 0, 0, 37, 15, 30, 12);

  return {
    night: 1,
    name: 'Đảo Bến',
    spawnPos: [0, 0, 0],
    spawnYaw: 0, // facing +Z
    durationKey: 'night1_duration_s',
    shadeSpeedOverride: null,
    shadeSpawnInterval: 480, // 8s
    maxShades: 6,
    maxDrifters: 0,
    windEnabledDefault: false,
    lanterns,
    moteSpawns,
    shadeSpawns,
    jumpPads: [],
    charms: [],
    getGroundY(x, z, currentY) {
      if (Math.hypot(x, z) <= 40.0 && 0 <= currentY + STEP_UP) {
        return 0;
      }
      return null;
    },
    getTopGroundY(x, z) {
      return Math.hypot(x, z) <= 40.0 ? 0 : null;
    },
    resolveHorizontalMove(_oldX, _oldZ, newX, newZ, _currentY) {
      _moveRes.x = newX;
      _moveRes.z = newZ;
      _moveRes.blocked = false;
      return _moveRes;
    },
    clampShadeToMap(pos) {
      const d = Math.hypot(pos[0], pos[2]);
      if (d > 39.5) {
        pos[0] = (pos[0] / d) * 39.5;
        pos[2] = (pos[2] / d) * 39.5;
      }
    },
  };
}

function getNight2Map() {
  const lanterns = [
    { id: 'L1', pos: [0, 0, 20] },
    { id: 'L2', pos: [17, 0, -10] },
    { id: 'L3', pos: [-17, 0, -10] },
    { id: 'L4', pos: [70, 0, 20] },
    { id: 'L5', pos: [87, 0, -10] },
    { id: 'L6', pos: [53, 0, -10] },
  ];
  const moteSpawns = [
    ...ringPoints(0, 0, 0, 10, 0, 90, 4),
    ...ringPoints(0, 0, 0, 22, 0, 45, 8),
    ...ringPoints(70, 0, 0, 10, 0, 90, 4),
    ...ringPoints(70, 0, 0, 22, 0, 45, 8),
  ];
  const shadeSpawns = [
    ...ringPoints(0, 0, 0, 26, 22.5, 45, 8),
    ...ringPoints(70, 0, 0, 26, 22.5, 45, 8),
  ];

  // Jump pads: (20,0,18) -> Island B (70,0,0), (50,0,-18) -> Island A (0,0,0)
  const makePad = (px, pz, tx, tz) => {
    const dx = tx - px;
    const dz = tz - pz;
    const len = Math.hypot(dx, dz);
    return {
      pos: [px, 0, pz],
      radius: 1.0,
      vy: 14.0,
      vx: (dx / len) * 24.0,
      vz: (dz / len) * 24.0,
    };
  };
  const jumpPads = [
    makePad(20, 18, 70, 0),
    makePad(50, -18, 0, 0),
  ];

  const charms = [{ id: 'C1', pos: [35, 0, 0] }];

  function onNight2Ground(x, z) {
    if (Math.hypot(x, z) <= 28.0) return true;
    if (Math.hypot(x - 70.0, z) <= 28.0) return true;
    if (x >= 26.0 && x <= 44.0 && z >= -2.0 && z <= 2.0) return true;
    return false;
  }

  return {
    night: 2,
    name: 'Đảo Cau',
    spawnPos: [0, 0, 0],
    spawnYaw: 0,
    durationKey: 'night2_duration_s',
    shadeSpeedOverride: null,
    shadeSpawnInterval: 420, // 7s
    maxShades: 8,
    maxDrifters: 2,
    windEnabledDefault: false,
    lanterns,
    moteSpawns,
    shadeSpawns,
    jumpPads,
    charms,
    getGroundY(x, z, currentY) {
      if (onNight2Ground(x, z) && 0 <= currentY + STEP_UP) {
        return 0;
      }
      return null;
    },
    getTopGroundY(x, z) {
      return onNight2Ground(x, z) ? 0 : null;
    },
    resolveHorizontalMove(_oldX, _oldZ, newX, newZ, _currentY) {
      _moveRes.x = newX;
      _moveRes.z = newZ;
      _moveRes.blocked = false;
      return _moveRes;
    },
    clampShadeToMap(pos) {
      // Keep shades within bounding envelope around both islands
      if (pos[0] < -28) pos[0] = -28;
      if (pos[0] > 98) pos[0] = 98;
      if (pos[2] < -28) pos[2] = -28;
      if (pos[2] > 28) pos[2] = 28;
    },
  };
}

function getNight3Map() {
  const lanterns = [
    { id: 'L1', pos: [0, 6, 6] },
    { id: 'L2', pos: [18, 3, 10] },
    { id: 'L3', pos: [-18, 3, 10] },
    { id: 'L4', pos: [35, 0, -10] },
    { id: 'L5', pos: [-35, 0, -10] },
    { id: 'L6', pos: [20, 0, -35] },
    { id: 'L7', pos: [-20, 0, -35] },
  ];
  const moteSpawns = [
    ...ringPoints(0, 0, 0, 34, 0, 20, 18), // Tier 0: 18 points
    ...ringPoints(0, 0, 3, 18, 20, 20, 8), // Tier 1: 8 points (20..160)
    ...ringPoints(0, 0, 6, 5, 45, 90, 4), // Tier 2: 4 points (45, 135, 225, 315)
  ];
  const shadeSpawns = ringPoints(0, 0, 0, 43, 0, 22.5, 16);
  const jumpPads = [
    {
      pos: [0, 3, 13],
      radius: 1.0,
      vy: 12.0,
      vx: 0,
      vz: -8.0, // toward -Z onto Tier 2
    },
  ];
  const charms = [
    { id: 'C1', pos: [30, 0, 25] },
    { id: 'C2', pos: [-30, 0, 25] },
  ];

  function getTopGroundY(x, z) {
    const r = Math.hypot(x, z);
    if (r > 45.0) return null;
    if (r <= 8.0) return 6.0;
    const rampY = getNight3RampY(x, z);
    if (isInNight3Tier1(x, z)) {
      return 3.0;
    }
    if (rampY !== null) return rampY;
    return 0.0;
  }

  function getGroundY(x, z, currentY) {
    const r = Math.hypot(x, z);
    if (r > 45.0) return null;
    let best = null;
    const consider = (h) => {
      if (h <= currentY + STEP_UP && (best === null || h > best)) {
        best = h;
      }
    };
    consider(0.0);
    if (isInNight3Tier1(x, z)) consider(3.0);
    if (isInNight3Tier2(x, z)) consider(6.0);
    const rampY = getNight3RampY(x, z);
    if (rampY !== null) consider(rampY);
    return best;
  }

  function resolveHorizontalMove(oldX, oldZ, newX, newZ, currentY) {
    let x = newX;
    let z = newZ;
    let blocked = false;

    // 1. Bell tower cylinder at center: r <= 2.0, non-climbable (Y < 14)
    const rBell = Math.hypot(x, z);
    if (rBell < 2.0 && currentY < 14.0) {
      blocked = true;
      if (rBell > 1e-6) {
        x = (x / rBell) * 2.02;
        z = (z / rBell) * 2.02;
      } else {
        x = 2.02;
        z = 0;
      }
    }

    // 2. Tier 2 solid vertical cliff: r <= 8.0 when currentY < 6 - STEP_UP
    const rT2 = Math.hypot(x, z);
    if (rT2 < 8.0 && currentY < 6.0 - STEP_UP) {
      blocked = true;
      if (rT2 > 1e-6) {
        x = (x / rT2) * 8.02;
        z = (z / rT2) * 8.02;
      } else {
        x = 8.02;
        z = 0;
      }
    }

    // 3. Tier 1 solid vertical cliff: 12 <= r <= 24 && z > 0 when currentY < 3 - STEP_UP
    const rampYNew = getNight3RampY(x, z);
    const onWalkableRamp = rampYNew !== null && rampYNew <= currentY + STEP_UP;

    if (!onWalkableRamp && isInNight3Tier1(x, z) && currentY < 3.0 - STEP_UP) {
      blocked = true;
      const oldR = Math.hypot(oldX, oldZ);
      if (oldZ <= 0) {
        // Crossed flat z = 0 wall
        z = -0.02;
      } else if (oldR >= 24.0) {
        const curR = Math.hypot(x, z);
        x = (x / curR) * 24.02;
        z = (z / curR) * 24.02;
      } else if (oldR <= 12.0) {
        const curR = Math.hypot(x, z);
        x = (x / curR) * 11.98;
        z = (z / curR) * 11.98;
      } else {
        x = oldX;
        z = oldZ;
      }
    }

    // 4. Ramp side walls: cannot walk sideways into high part of ramp from Tier 0
    if (rampYNew !== null && rampYNew > currentY + STEP_UP) {
      blocked = true;
      x = oldX;
      z = oldZ;
    }

    _moveRes.x = x;
    _moveRes.z = z;
    _moveRes.blocked = blocked;
    return _moveRes;
  }

  return {
    night: 3,
    name: 'Đảo Chuông',
    spawnPos: [0, 0, -14], // Tier 0 south of Tier 2 (r=8), facing +Z
    spawnYaw: 0,
    durationKey: 'night3_duration_s',
    shadeSpeedOverride: 4.5,
    shadeSpawnInterval: 360, // 6s
    maxShades: 10,
    maxDrifters: 2,
    windEnabledDefault: true,
    lanterns,
    moteSpawns,
    shadeSpawns,
    jumpPads,
    charms,
    getGroundY,
    getTopGroundY,
    resolveHorizontalMove,
    clampShadeToMap(pos) {
      const d = Math.hypot(pos[0], pos[2]);
      if (d > 44.5) {
        pos[0] = (pos[0] / d) * 44.5;
        pos[2] = (pos[2] / d) * 44.5;
      }
      if (d < 2.02) {
        if (d > 1e-6) {
          pos[0] = (pos[0] / d) * 2.02;
          pos[2] = (pos[2] / d) * 2.02;
        } else {
          pos[0] = 2.02;
        }
      }
    },
  };
}

export function getNightMap(night) {
  if (night === 1) return getNight1Map();
  if (night === 2) return getNight2Map();
  if (night === 3) return getNight3Map();
  throw new Error(`Unsupported night: ${night}. Expected 1, 2, or 3.`);
}
