import * as THREE from 'three';

// Standard palette anchors (<= 10% RGB deviation from Contract v1.1-v1.3)
const FOREST_COLORS = {
  bark: 0x6b4a2f,
  barkDark: 0x5d4029,
  pine: 0x295246,
  ancient: 0x2f5d50,
  bambooStalk: 0x4e6c50,
  bambooLeaf: 0x396b5a,
  willow: 0x285654,
  fern: 0x356758,
  grass: 0x2f5d50,
  moss: 0x386d5b,
  stone: 0x5b5f6e,
  sand: 0xc9b48a,
  mushStem: 0xe8e2d0,
  mushCapWarm: 0xf0d68a,
  mushCapTeal: 0x5ab5a2,
};

function createLocalRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Merges an array of BufferGeometries into one non-indexed BufferGeometry
 * containing position & normal attributes. Disposes input geometries.
 */
function mergeGeometries(geos) {
  const nonIndexed = geos.map((g) => {
    const out = g.index ? g.toNonIndexed() : g.clone();
    if (!out.attributes.normal) out.computeVertexNormals();
    g.dispose();
    return out;
  });

  let totalVerts = 0;
  for (const g of nonIndexed) {
    totalVerts += g.attributes.position.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  let offset = 0;

  for (const g of nonIndexed) {
    const pos = g.attributes.position.array;
    const norm = g.attributes.normal.array;
    positions.set(pos, offset);
    normals.set(norm, offset);
    offset += pos.length;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Injects world-space wind sway into MeshStandardMaterial via onBeforeCompile.
 * Anchored cleanly at local Y = 0 so trunks stay planted while canopies ripple
 * organically with world wind direction. Zero CPU cost per frame!
 */
export function applyWindSwayMaterial(mat, uniforms, heightScale = 5.0, swayStrength = 1.0) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayTime = uniforms.uSwayTime;
    shader.uniforms.uSwayAmp = uniforms.uSwayAmp;
    shader.uniforms.uSwayDir = uniforms.uSwayDir;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSwayTime;
        uniform float uSwayAmp;
        uniform vec2 uSwayDir;`
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        {
          float hFactor = clamp(transformed.y / ${heightScale.toFixed(2)}, 0.0, 1.6);
          float bend = hFactor * hFactor * uSwayAmp * ${swayStrength.toFixed(2)};
          float phase = uSwayTime * 1.85 + mvPosition.x * 0.24 + mvPosition.z * 0.21 + transformed.y * 0.28;
          float waveX = sin(phase) + 0.35 * sin(phase * 1.7 + 1.1);
          float waveZ = cos(phase * 0.88) + 0.3 * cos(phase * 1.55 + 0.5);
          mvPosition.x += (waveX * 0.55 + uSwayDir.x * 1.25) * bend;
          mvPosition.z += (waveZ * 0.55 + uSwayDir.y * 1.25) * bend;
        }
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`
      );
  };
  mat.customProgramCacheKey = () => `ddl_wind_sway_${heightScale}_${swayStrength}`;
  return mat;
}

// =============================================================================
// 5 PROCEDURAL LOW-POLY SPECIES GEOMETRIES
// =============================================================================

// 1. Cây Tùng / Thông đêm (Night Pine: 4 offset cone tiers, 5–8m)
function createPineGeometries() {
  const rootFlare = new THREE.CylinderGeometry(0.24, 0.38, 0.7, 6);
  rootFlare.translate(0, 0.35, 0);
  const shaft = new THREE.CylinderGeometry(0.11, 0.25, 3.2, 6);
  shaft.translate(0, 2.2, 0);
  const trunkGeo = mergeGeometries([rootFlare, shaft]);

  const tiers = [
    { r: 1.85, h: 2.15, y: 2.85, rot: 0.0, segs: 7 },
    { r: 1.48, h: 1.95, y: 4.1, rot: 0.48, segs: 7 },
    { r: 1.12, h: 1.75, y: 5.2, rot: 0.96, segs: 7 },
    { r: 0.72, h: 1.5, y: 6.15, rot: 1.44, segs: 6 },
  ];
  const crownParts = tiers.map((t) => {
    const c = new THREE.ConeGeometry(t.r, t.h, t.segs);
    c.rotateY(t.rot);
    c.translate(0, t.y, 0);
    return c;
  });
  const canopyGeo = mergeGeometries(crownParts);
  return { trunkGeo, canopyGeo };
}

// 2. Cây Cổ thụ tán tròn (Ancient Oak: gnarled leaning trunk + branches + multi-lobe crown, 4.5–7m)
function createAncientTreeGeometries() {
  const lower = new THREE.CylinderGeometry(0.28, 0.44, 1.9, 7);
  lower.rotateZ(0.06);
  lower.translate(-0.04, 0.95, 0);

  const upper = new THREE.CylinderGeometry(0.2, 0.29, 1.7, 7);
  upper.rotateZ(-0.08);
  upper.translate(-0.02, 2.55, 0.04);

  const branchA = new THREE.CylinderGeometry(0.09, 0.16, 1.55, 5);
  branchA.rotateZ(0.68);
  branchA.rotateY(0.4);
  branchA.translate(-0.62, 2.95, 0.25);

  const branchB = new THREE.CylinderGeometry(0.08, 0.15, 1.45, 5);
  branchB.rotateZ(-0.62);
  branchB.rotateY(-0.5);
  branchB.translate(0.58, 3.1, -0.22);

  const trunkGeo = mergeGeometries([lower, upper, branchA, branchB]);

  const lobes = [
    { r: 1.55, x: 0.0, y: 4.55, z: 0.0, sx: 1.15, sy: 0.88, sz: 1.1 },
    { r: 1.25, x: -1.1, y: 3.95, z: 0.45, sx: 1.05, sy: 0.82, sz: 1.0 },
    { r: 1.2, x: 1.05, y: 4.1, z: -0.35, sx: 1.0, sy: 0.85, sz: 1.05 },
    { r: 1.05, x: 0.15, y: 4.05, z: 1.02, sx: 0.98, sy: 0.82, sz: 0.95 },
    { r: 0.95, x: -0.1, y: 5.35, z: -0.15, sx: 1.08, sy: 0.78, sz: 1.02 },
  ];
  const crownParts = lobes.map((lb) => {
    const g = new THREE.IcosahedronGeometry(lb.r, 1);
    g.scale(lb.sx, lb.sy, lb.sz);
    g.translate(lb.x, lb.y, lb.z);
    return g;
  });
  const canopyGeo = mergeGeometries(crownParts);
  return { trunkGeo, canopyGeo };
}

// 3. Khóm Tre / Trúc cổ tích (Fairytale Bamboo Clump: 5 curved jointed stalks + delicate leaf fans)
function createBambooGeometries() {
  const stalkParts = [];
  const leafParts = [];
  const culms = [
    { x: 0.0, z: 0.0, h: 6.4, leanX: 0.06, leanZ: 0.04, r: 0.085 },
    { x: 0.34, z: 0.22, h: 5.5, leanX: 0.14, leanZ: 0.09, r: 0.075 },
    { x: -0.32, z: 0.25, h: 5.9, leanX: -0.13, leanZ: 0.1, r: 0.08 },
    { x: 0.26, z: -0.34, h: 5.0, leanX: 0.11, leanZ: -0.14, r: 0.07 },
    { x: -0.28, z: -0.26, h: 5.3, leanX: -0.12, leanZ: -0.11, r: 0.072 },
  ];

  for (const c of culms) {
    const segs = 3;
    const segH = c.h / segs;
    let curX = c.x;
    let curZ = c.z;
    let curY = 0;

    for (let s = 0; s < segs; s++) {
      const tilt = (s + 1) * 0.65;
      const dx = c.leanX * tilt * segH * 0.4;
      const dz = c.leanZ * tilt * segH * 0.4;
      const rBot = c.r * (1 - s * 0.16);
      const rTop = c.r * (1 - (s + 1) * 0.16);

      const seg = new THREE.CylinderGeometry(rTop, rBot, segH, 5);
      seg.rotateZ(-c.leanX * tilt * 0.45);
      seg.rotateX(c.leanZ * tilt * 0.45);
      seg.translate(curX + dx * 0.5, curY + segH * 0.5, curZ + dz * 0.5);
      stalkParts.push(seg);

      // Joint ring collar
      const nodeRing = new THREE.CylinderGeometry(rTop * 1.32, rTop * 1.32, 0.07, 5);
      nodeRing.translate(curX + dx, curY + segH, curZ + dz);
      stalkParts.push(nodeRing);

      curX += dx;
      curZ += dz;
      curY += segH;

      // Delicate leaf fans on upper joints
      if (s >= 1) {
        const fanCount = s === 2 ? 4 : 2;
        for (let f = 0; f < fanCount; f++) {
          const ang = (f / fanCount) * Math.PI * 2 + c.x * 3.1 + s;
          const blade = new THREE.ConeGeometry(0.32, 1.05, 4);
          blade.scale(1.0, 1.0, 0.22);
          blade.rotateZ(1.05);
          blade.rotateY(ang);
          blade.translate(
            curX + Math.cos(ang) * 0.38,
            curY - 0.08 + (s === 2 ? 0.18 : 0),
            curZ + Math.sin(ang) * 0.38
          );
          leafParts.push(blade);
        }
      }
    }
  }

  return {
    stalkGeo: mergeGeometries(stalkParts),
    leafGeo: mergeGeometries(leafParts),
  };
}

// 4. Cây Liễu / Cây rủ sương đêm (Misty Weeping Willow: arched trunk + drooping frond curtains)
function createWillowGeometries() {
  const trunkLow = new THREE.CylinderGeometry(0.28, 0.42, 2.0, 7);
  trunkLow.rotateZ(0.14);
  trunkLow.translate(-0.1, 0.98, 0);

  const trunkUp = new THREE.CylinderGeometry(0.2, 0.28, 1.7, 7);
  trunkUp.rotateZ(0.22);
  trunkUp.translate(-0.32, 2.65, 0);

  const limb1 = new THREE.CylinderGeometry(0.08, 0.15, 1.6, 5);
  limb1.rotateZ(0.85);
  limb1.translate(-0.95, 3.65, 0.35);

  const limb2 = new THREE.CylinderGeometry(0.08, 0.14, 1.5, 5);
  limb2.rotateZ(-0.72);
  limb2.translate(0.28, 3.7, -0.45);

  const trunkGeo = mergeGeometries([trunkLow, trunkUp, limb1, limb2]);

  const canopyParts = [];
  // Soft arched dome top
  const dome = new THREE.IcosahedronGeometry(1.7, 1);
  dome.scale(1.25, 0.65, 1.15);
  dome.translate(-0.35, 4.35, 0);
  canopyParts.push(dome);

  // 10 drooping willow frond curtains around the crown rim
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rad = 1.35 + (i % 2) * 0.35;
    const len = 2.4 + (i % 3) * 0.45;
    const drape = new THREE.ConeGeometry(0.42, len, 5);
    drape.rotateX(Math.PI); // Point downward
    drape.scale(0.85, 1.0, 0.52);
    drape.rotateY(a);
    drape.translate(-0.35 + Math.cos(a) * rad, 4.15 - len * 0.48, Math.sin(a) * rad);
    canopyParts.push(drape);
  }

  return {
    trunkGeo,
    canopyGeo: mergeGeometries(canopyParts),
  };
}

// 5. Understory geometries: Ferns, Tall Grass Clumps, Mossy Stumps, Glowing Mushroom Clusters
function createFernGeometry() {
  const parts = [];
  const frondCount = 6;
  for (let i = 0; i < frondCount; i++) {
    const a = (i / frondCount) * Math.PI * 2 + (i % 2) * 0.18;
    const f = new THREE.ConeGeometry(0.24, 0.95, 4);
    f.scale(1.0, 1.0, 0.2);
    f.translate(0, 0.45, 0);
    f.rotateZ(0.88 + (i % 2) * 0.18);
    f.rotateY(a);
    parts.push(f);
  }
  return mergeGeometries(parts);
}

function createTallGrassGeometry() {
  const parts = [];
  const blades = [
    { x: 0, z: 0, h: 0.78, r: 0.12, tiltZ: 0.12, rotY: 0.2 },
    { x: 0.15, z: 0.08, h: 0.65, r: 0.11, tiltZ: -0.18, rotY: 1.5 },
    { x: -0.14, z: 0.11, h: 0.72, r: 0.11, tiltZ: 0.22, rotY: 2.8 },
    { x: 0.04, z: -0.15, h: 0.58, r: 0.1, tiltZ: -0.15, rotY: 4.3 },
  ];
  for (const b of blades) {
    const g = new THREE.ConeGeometry(b.r, b.h, 4);
    g.translate(0, b.h * 0.5, 0);
    g.rotateZ(b.tiltZ);
    g.rotateY(b.rotY);
    g.translate(b.x, 0, b.z);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

function createMossyStumpGeometries() {
  const base = new THREE.CylinderGeometry(0.36, 0.52, 0.62, 7);
  base.translate(0, 0.3, 0);
  const root1 = new THREE.ConeGeometry(0.18, 0.6, 5);
  root1.rotateZ(1.1);
  root1.translate(-0.36, 0.12, 0.1);
  const root2 = new THREE.ConeGeometry(0.16, 0.55, 5);
  root2.rotateZ(-1.1);
  root2.rotateY(0.8);
  root2.translate(0.32, 0.1, -0.18);
  const woodGeo = mergeGeometries([base, root1, root2]);

  const moss1 = new THREE.DodecahedronGeometry(0.34, 0);
  moss1.scale(1.15, 0.42, 1.0);
  moss1.translate(0.08, 0.58, 0.05);
  const moss2 = new THREE.DodecahedronGeometry(0.24, 0);
  moss2.scale(1.1, 0.55, 0.9);
  moss2.translate(-0.24, 0.28, 0.22);
  const mossGeo = mergeGeometries([moss1, moss2]);
  return { woodGeo, mossGeo };
}

function createMushroomClusterGeometries() {
  const stemParts = [];
  const capParts = [];
  const items = [
    { x: 0, z: 0, h: 0.28, capR: 0.15, capH: 0.11, tilt: 0.08 },
    { x: 0.17, z: 0.09, h: 0.21, capR: 0.115, capH: 0.085, tilt: -0.14 },
    { x: -0.14, z: 0.12, h: 0.16, capR: 0.095, capH: 0.075, tilt: 0.18 },
  ];
  for (const m of items) {
    const stem = new THREE.CylinderGeometry(0.025, 0.038, m.h, 5);
    stem.rotateZ(m.tilt);
    stem.translate(m.x, m.h * 0.5, m.z);
    stemParts.push(stem);

    const cap = new THREE.ConeGeometry(m.capR, m.capH, 7);
    cap.rotateZ(m.tilt);
    cap.translate(m.x - Math.sin(m.tilt) * m.h * 0.5, m.h + m.capH * 0.32, m.z);
    capParts.push(cap);
  }
  return {
    stemGeo: mergeGeometries(stemParts),
    capGeo: mergeGeometries(capParts),
  };
}

// =============================================================================
// POINT-TO-SEGMENT DISTANCE FOR KEEPING LANTERN FOOTPATHS CLEAR
// =============================================================================
function distToSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  return Math.hypot(px - (ax + t * abx), pz - (az + t * abz));
}

function fillInstancedMesh(mesh, list, dummy, colorHelper, baseHex, jitter = 0.08) {
  const base = new THREE.Color(baseHex);
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    dummy.position.set(it.x, it.y || 0, it.z);
    dummy.rotation.set(it.rx || 0, it.rot || 0, it.rz || 0);
    dummy.scale.set(it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colorHelper) {
      const shade = 1 + ((it.tint || 0) * 2 - 1) * jitter;
      colorHelper.setRGB(
        Math.min(1, base.r * shade),
        Math.min(1, base.g * shade),
        Math.min(1, base.b * shade)
      );
      mesh.setColorAt(i, colorHelper);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// =============================================================================
// MAIN FOREST BUILDER (PURELY DECORATIVE — ZERO HITBOXES, SKIPPED IN BENCH)
// =============================================================================
export function buildFairytaleForest(night, lanterns, jumpPads, charms, windUniforms, isBenchMode) {
  const forestGroup = new THREE.Group();
  if (isBenchMode) {
    return { forestGroup, landmarkActors: [] };
  }

  const rng = createLocalRng(night * 7919 + 2026);
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const landmarkActors = [];

  // Precompute island centers and footpath segments from center -> lanterns
  const islands =
    night === 1
      ? [{ cx: 0, cz: 0, maxR: 39.2 }]
      : night === 2
        ? [
            { cx: 0, cz: 0, maxR: 27.2 },
            { cx: 70, cz: 0, maxR: 27.2 },
          ]
        : [{ cx: 0, cz: 0, maxR: 44.2 }];

  const trails = [];
  for (const l of lanterns || []) {
    if ((l.pos[1] || 0) > 0.5) continue;
    let owner = islands[0];
    if (night === 2 && l.pos[0] > 35) owner = islands[1];
    trails.push([owner.cx, owner.cz, l.pos[0], l.pos[2]]);
  }

  function isBlocked(x, z, y, kind) {
    const isTree = kind === 'tree';
    const lanternClear = isTree ? 4.65 : kind === 'stump' ? 3.2 : 2.35;
    const spawnClear = isTree ? 4.8 : 3.2;

    // 1. Spawn point(s)
    if (Math.hypot(x, z) < spawnClear) return true;
    if (night === 3 && y < 1 && Math.hypot(x, z + 14) < spawnClear) return true;
    if (night === 2 && Math.hypot(x - 70, z) < (isTree ? 4.4 : 2.8)) return true;

    // 2. Great Lantern clearings (strict >= 4.5m for all trees)
    for (const l of lanterns || []) {
      if (Math.hypot(x - l.pos[0], z - l.pos[2]) < lanternClear) return true;
    }

    // 3. Jump Pads & Charms
    for (const p of jumpPads || []) {
      if (Math.hypot(x - p.pos[0], z - p.pos[2]) < (isTree ? 4.2 : 2.6)) return true;
    }
    for (const c of charms || []) {
      if (Math.hypot(x - c.pos[0], z - c.pos[2]) < (isTree ? 3.4 : 2.1)) return true;
    }

    // 4. Footpaths to lanterns (keep sightline trails unobstructed by trees)
    if (isTree && y < 0.5) {
      for (const seg of trails) {
        if (distToSegment2D(x, z, seg[0], seg[1], seg[2], seg[3]) < 2.5) return true;
      }
    }

    // 5. Island-specific architecture clearings
    if (night === 1) {
      // Keep harbor dock & boat view open at south shore (z < -33.5, |x| < 6.5)
      if (z < -33.0 && Math.abs(x) < (isTree ? 6.5 : 4.5)) return true;
    } else if (night === 2) {
      // Bamboo bridge & both bridge heads
      if (x >= 22.5 && x <= 47.5 && Math.abs(z) <= (isTree ? 5.2 : 3.4)) return true;
      if (Math.hypot(x - 26, z) < (isTree ? 4.6 : 2.8)) return true;
      if (Math.hypot(x - 44, z) < (isTree ? 4.6 : 2.8)) return true;
    } else if (night === 3) {
      const r = Math.hypot(x, z);
      // Keep Tier 2 summit & Bell Tower open
      if (r < (isTree ? 9.8 : 8.6)) return true;
      // Keep both ramps (30 deg & 150 deg) and their top/bottom aprons completely open
      for (const deg of [30, 150]) {
        const rad = (deg * Math.PI) / 180;
        const s = x * Math.cos(rad) + z * Math.sin(rad);
        const p = -x * Math.sin(rad) + z * Math.cos(rad);
        if (s >= 21.0 && s <= 33.5 && Math.abs(p) <= (isTree ? 3.8 : 2.6)) return true;
      }
      if (y < 1.0) {
        // Tier 0: avoid clipping into Tier 1 vertical cliff walls (r=12..24, z>0)
        const margin = isTree ? 1.8 : 0.9;
        if (r >= 12.0 - margin && r <= 24.0 + margin && z > -margin) return true;
      } else {
        // Tier 1 (Y=3): stay safely inside the half-annulus (13.6..22.4, z > 2.2)
        if (r < 13.6 || r > 22.4 || z < 2.2) return true;
      }
    }
    return false;
  }

  // ===========================================================================
  // TREE PLACEMENT: OUTER ENCHANTED FOREST RING + INTERIOR WOODLAND CLUSTERS
  // ===========================================================================
  const pines = [];
  const ancients = [];
  const bamboos = [];
  const willows = [];
  const allPlacedTrees = []; // For minimum trunk spacing & root mushroom/fern clustering

  function canFitTree(x, z, y, minDist) {
    if (isBlocked(x, z, y, 'tree')) return false;
    for (let i = 0; i < allPlacedTrees.length; i++) {
      const t = allPlacedTrees[i];
      if (Math.abs((t.y || 0) - y) > 1.5) continue;
      if (Math.hypot(x - t.x, z - t.z) < minDist) return false;
    }
    return true;
  }

  function pushTree(type, x, z, y, s, rot) {
    const rec = { x, z, y, s, rot, tint: rng(), type };
    allPlacedTrees.push(rec);
    if (type === 'pine') pines.push(rec);
    else if (type === 'ancient') ancients.push(rec);
    else if (type === 'bamboo') bamboos.push(rec);
    else if (type === 'willow') willows.push(rec);
  }

  // Pick species naturally by island identity & zone ('rim' vs 'interior')
  function pickSpecies(zone) {
    const r = rng();
    if (night === 2) {
      // Đảo Cau: rich bamboo groves + weeping willows on rim
      if (zone === 'rim') {
        if (r < 0.34) return 'bamboo';
        if (r < 0.58) return 'willow';
        if (r < 0.82) return 'pine';
        return 'ancient';
      }
      if (r < 0.48) return 'bamboo';
      if (r < 0.8) return 'ancient';
      return 'pine';
    }
    if (night === 3) {
      // Đảo Chuông: deep alpine night pine & gnarled ancient forest
      if (zone === 'rim') {
        if (r < 0.44) return 'pine';
        if (r < 0.68) return 'willow';
        if (r < 0.88) return 'ancient';
        return 'bamboo';
      }
      if (r < 0.46) return 'pine';
      if (r < 0.82) return 'ancient';
      return 'bamboo';
    }
    // Night 1 — Đảo Bến: balanced fairytale coastal night forest
    if (zone === 'rim') {
      if (r < 0.36) return 'pine';
      if (r < 0.62) return 'willow';
      if (r < 0.84) return 'ancient';
      return 'bamboo';
    }
    if (r < 0.36) return 'ancient';
    if (r < 0.68) return 'pine';
    if (r < 0.88) return 'bamboo';
    return 'willow';
  }

  for (const isl of islands) {
    // Pass A: Dense outer rim forest framing the island (2 staggered rings!)
    const outerSlots = night === 2 ? 32 : night === 3 ? 52 : 46;
    for (let i = 0; i < outerSlots; i++) {
      const a = (i / outerSlots) * Math.PI * 2 + (rng() - 0.5) * 0.1;
      const bandOffset = i % 2 === 0 ? 1.4 + rng() * 1.4 : 3.8 + rng() * 2.2;
      const rad = isl.maxR - bandOffset;
      const x = isl.cx + Math.cos(a) * rad;
      const z = isl.cz + Math.sin(a) * rad;
      if (!canFitTree(x, z, 0, 2.55)) continue;
      const sp = pickSpecies('rim');
      const sc = sp === 'willow' ? 0.92 + rng() * 0.28 : 0.88 + rng() * 0.34;
      // Willows lean gently outward over the sea of clouds
      const rot = sp === 'willow' ? Math.atan2(-Math.cos(a), -Math.sin(a)) : rng() * Math.PI * 2;
      pushTree(sp, x, z, 0, sc, rot);
    }

    // Pass B: Natural interior woodland groves (clustered pockets between lantern trails!)
    const clusterCount = night === 2 ? 7 : night === 3 ? 11 : 9;
    const clusters = [];
    for (let c = 0; c < clusterCount; c++) {
      const ca = (c / clusterCount) * Math.PI * 2 + 0.32 + (rng() - 0.5) * 0.25;
      const cr = isl.maxR * (0.42 + rng() * 0.3);
      clusters.push({
        x: isl.cx + Math.cos(ca) * cr,
        z: isl.cz + Math.sin(ca) * cr,
        sp: pickSpecies('interior'),
      });
    }

    const perClusterAttempts = night === 2 ? 12 : 15;
    for (const cl of clusters) {
      for (let k = 0; k < perClusterAttempts; k++) {
        const ang = rng() * Math.PI * 2;
        const dist = Math.sqrt(rng()) * 6.8;
        const x = cl.x + Math.cos(ang) * dist;
        const z = cl.z + Math.sin(ang) * dist;
        if (Math.hypot(x - isl.cx, z - isl.cz) > isl.maxR - 2.2) continue;
        if (!canFitTree(x, z, 0, 2.75)) continue;
        const sp = rng() < 0.65 ? cl.sp : pickSpecies('interior');
        // Keep interior trees graceful with open lower sightline
        const sc = 0.8 + rng() * 0.26;
        pushTree(sp, x, z, 0, sc, rng() * Math.PI * 2);
      }
    }

    // Pass C: Fill gaps in mid-outer woods so the forest feels truly rich & cohesive
    const fillerAttempts = night === 2 ? 55 : 85;
    for (let i = 0; i < fillerAttempts; i++) {
      const a = rng() * Math.PI * 2;
      const rad = isl.maxR * (0.58 + rng() * 0.34);
      const x = isl.cx + Math.cos(a) * rad;
      const z = isl.cz + Math.sin(a) * rad;
      if (!canFitTree(x, z, 0, 2.85)) continue;
      const sp = pickSpecies('rim');
      const sc = 0.84 + rng() * 0.32;
      pushTree(sp, x, z, 0, sc, rng() * Math.PI * 2);
    }
  }

  // Night 3 Tier 1 (Y = 3.0) framing trees away from L2/L3/JumpPad
  if (night === 3) {
    for (let i = 0; i < 36; i++) {
      const a = 0.18 + rng() * (Math.PI - 0.36);
      const rad = 14.2 + rng() * 7.8;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (!canFitTree(x, z, 3.0, 2.9)) continue;
      const sp = rng() < 0.6 ? 'pine' : 'ancient';
      pushTree(sp, x, z, 3.0, 0.72 + rng() * 0.22, rng() * Math.PI * 2);
    }
  }

  // ===========================================================================
  // UNDERSTORY PLACEMENT: FERNS, TALL GRASS, MOSSY STUMPS, GLOWING MUSHROOMS, ROCKS
  // ===========================================================================
  const ferns = [];
  const grasses = [];
  const stumps = [];
  const mushroomsWarm = [];
  const mushroomsTeal = [];
  const rocks = [];

  // Cluster ferns, mossy stumps & glowing mushrooms lovingly around tree roots!
  for (let i = 0; i < allPlacedTrees.length; i++) {
    const t = allPlacedTrees[i];
    const fernNum = 1 + (i % 2);
    for (let f = 0; f < fernNum; f++) {
      const a = rng() * Math.PI * 2;
      const d = 0.95 + rng() * 1.45;
      const fx = t.x + Math.cos(a) * d;
      const fz = t.z + Math.sin(a) * d;
      if (!isBlocked(fx, fz, t.y, 'understory')) {
        ferns.push({ x: fx, y: t.y, z: fz, s: 0.72 + rng() * 0.55, rot: rng() * Math.PI * 2, tint: rng() });
      }
    }

    // Soft glowing mushroom clusters tucked at base of ~48% of trees
    if (rng() < 0.48) {
      const a = rng() * Math.PI * 2;
      const d = 0.75 + rng() * 0.85;
      const mx = t.x + Math.cos(a) * d;
      const mz = t.z + Math.sin(a) * d;
      if (!isBlocked(mx, mz, t.y, 'understory')) {
        const target = rng() < 0.58 ? mushroomsWarm : mushroomsTeal;
        target.push({ x: mx, y: t.y, z: mz, s: 0.78 + rng() * 0.45, rot: rng() * Math.PI * 2, tint: rng() });
      }
    }
  }

  // Mossy rotting tree stumps + nearby glowing mushrooms
  const stumpAttempts = night === 2 ? 42 : 46;
  for (let i = 0; i < stumpAttempts; i++) {
    const isl = islands[i % islands.length];
    const a = rng() * Math.PI * 2;
    const rad = isl.maxR * (0.24 + rng() * 0.66);
    const x = isl.cx + Math.cos(a) * rad;
    const z = isl.cz + Math.sin(a) * rad;
    if (isBlocked(x, z, 0, 'stump')) continue;
    const s = 0.78 + rng() * 0.42;
    stumps.push({ x, y: 0, z, s, rot: rng() * Math.PI * 2, tint: rng() });
    if (rng() < 0.72) {
      const ma = rng() * Math.PI * 2;
      const target = rng() < 0.5 ? mushroomsWarm : mushroomsTeal;
      target.push({
        x: x + Math.cos(ma) * 0.65,
        y: 0,
        z: z + Math.sin(ma) * 0.65,
        s: 0.85 + rng() * 0.35,
        rot: rng() * Math.PI * 2,
        tint: rng(),
      });
    }
  }

  // Lush tall grass clumps & extra ferns across open woodland floors
  const grassTarget = night === 2 ? 360 : night === 3 ? 380 : 320;
  for (let i = 0; i < grassTarget; i++) {
    const isl = islands[i % islands.length];
    const a = (i * 2.399963) % (Math.PI * 2);
    const rad = Math.sqrt(0.08 + rng() * 0.85) * (isl.maxR - 1.2);
    const x = isl.cx + Math.cos(a) * rad;
    const z = isl.cz + Math.sin(a) * rad;
    if (isBlocked(x, z, 0, 'understory')) continue;
    grasses.push({
      x,
      y: 0,
      z,
      s: 0.75 + rng() * 0.65,
      rot: rng() * Math.PI * 2,
      tint: rng(),
    });
    if (i % 4 === 0) {
      ferns.push({
        x: x + (rng() - 0.5) * 0.9,
        y: 0,
        z: z + (rng() - 0.5) * 0.9,
        s: 0.65 + rng() * 0.45,
        rot: rng() * Math.PI * 2,
        tint: rng(),
      });
    }
  }

  // Night 3 Tier 1 understory grass & mushrooms
  if (night === 3) {
    for (let i = 0; i < 60; i++) {
      const a = 0.14 + rng() * (Math.PI - 0.28);
      const rad = 13.5 + rng() * 9.0;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      if (isBlocked(x, z, 3.0, 'understory')) continue;
      grasses.push({ x, y: 3.0, z, s: 0.72 + rng() * 0.5, rot: rng() * Math.PI * 2, tint: rng() });
      if (i % 6 === 0) {
        mushroomsTeal.push({ x: x + 0.35, y: 3.0, z, s: 0.85, rot: rng() * Math.PI * 2, tint: rng() });
      }
    }
  }

  // Shoreline rocks & woodland pebbles
  const rockCount = night === 2 ? 110 : 100;
  for (let i = 0; i < rockCount; i++) {
    const isl = islands[i % islands.length];
    const a = (i / rockCount) * Math.PI * 2 + (rng() - 0.5) * 0.18;
    const rad =
      night === 3 && i < 20
        ? 8.5 + rng() * 0.7
        : isl.maxR - 0.6 - rng() * 4.5;
    const x = isl.cx + Math.cos(a) * rad;
    const z = isl.cz + Math.sin(a) * rad;
    if (night === 2 && x >= 23.5 && x <= 46.5 && Math.abs(z) <= 3.6) continue;
    const sy = 0.24 + rng() * 0.34;
    rocks.push({
      x,
      y: sy * 0.32,
      z,
      sx: 0.38 + rng() * 0.52,
      sy,
      sz: 0.36 + rng() * 0.48,
      rx: rng() * 0.4,
      rot: rng() * Math.PI * 2,
      rz: rng() * 0.3,
      tint: rng(),
    });
  }

  // ===========================================================================
  // SHARED MATERIALS (WITH GPU WIND SWAY FOR ALL FOLIAGE & BAMBOO!)
  // ===========================================================================
  const barkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    flatShading: true,
  });
  const pineCanopyMat = applyWindSwayMaterial(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, flatShading: true }),
    windUniforms,
    6.5,
    0.72
  );
  const ancientCanopyMat = applyWindSwayMaterial(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }),
    windUniforms,
    5.5,
    0.88
  );
  const bambooStalkMat = applyWindSwayMaterial(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, flatShading: true }),
    windUniforms,
    6.0,
    1.22
  );
  const bambooLeafMat = applyWindSwayMaterial(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, flatShading: true }),
    windUniforms,
    6.0,
    1.22
  );
  const willowCanopyMat = applyWindSwayMaterial(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, flatShading: true }),
    windUniforms,
    5.2,
    0.88
  );
  const understoryFoliageMat = applyWindSwayMaterial(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, flatShading: true }),
    windUniforms,
    1.0,
    0.38
  );
  const mossMat = new THREE.MeshStandardMaterial({
    color: FOREST_COLORS.moss,
    roughness: 0.92,
    flatShading: true,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.93,
    flatShading: true,
  });
  const mushStemMat = new THREE.MeshStandardMaterial({
    color: FOREST_COLORS.mushStem,
    roughness: 0.8,
    flatShading: true,
  });
  // Soft subtle emissive glow on mushrooms (distinct from floating bright Motes!)
  const mushCapWarmMat = new THREE.MeshStandardMaterial({
    color: FOREST_COLORS.mushCapWarm,
    emissive: FOREST_COLORS.mushCapWarm,
    emissiveIntensity: 0.58,
    roughness: 0.45,
    flatShading: true,
  });
  const mushCapTealMat = new THREE.MeshStandardMaterial({
    color: FOREST_COLORS.mushCapTeal,
    emissive: FOREST_COLORS.mushCapTeal,
    emissiveIntensity: 0.62,
    roughness: 0.45,
    flatShading: true,
  });

  // ===========================================================================
  // BUILD INSTANCED MESHES (~16 DRAW CALLS FOR 900+ OBJECTS!)
  // ===========================================================================
  if (pines.length > 0) {
    const { trunkGeo, canopyGeo } = createPineGeometries();
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, pines.length);
    const crowns = new THREE.InstancedMesh(canopyGeo, pineCanopyMat, pines.length);
    fillInstancedMesh(trunks, pines, dummy, tmpColor, FOREST_COLORS.bark, 0.08);
    fillInstancedMesh(crowns, pines, dummy, tmpColor, FOREST_COLORS.pine, 0.08);
    crowns.castShadow = true;
    forestGroup.add(trunks, crowns);
  }

  if (ancients.length > 0) {
    const { trunkGeo, canopyGeo } = createAncientTreeGeometries();
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, ancients.length);
    const crowns = new THREE.InstancedMesh(canopyGeo, ancientCanopyMat, ancients.length);
    fillInstancedMesh(trunks, ancients, dummy, tmpColor, FOREST_COLORS.barkDark, 0.08);
    fillInstancedMesh(crowns, ancients, dummy, tmpColor, FOREST_COLORS.ancient, 0.08);
    crowns.castShadow = true;
    forestGroup.add(trunks, crowns);
  }

  if (bamboos.length > 0) {
    const { stalkGeo, leafGeo } = createBambooGeometries();
    const stalks = new THREE.InstancedMesh(stalkGeo, bambooStalkMat, bamboos.length);
    const leaves = new THREE.InstancedMesh(leafGeo, bambooLeafMat, bamboos.length);
    fillInstancedMesh(stalks, bamboos, dummy, tmpColor, FOREST_COLORS.bambooStalk, 0.07);
    fillInstancedMesh(leaves, bamboos, dummy, tmpColor, FOREST_COLORS.bambooLeaf, 0.08);
    forestGroup.add(stalks, leaves);
  }

  if (willows.length > 0) {
    const { trunkGeo, canopyGeo } = createWillowGeometries();
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, willows.length);
    const crowns = new THREE.InstancedMesh(canopyGeo, willowCanopyMat, willows.length);
    fillInstancedMesh(trunks, willows, dummy, tmpColor, FOREST_COLORS.barkDark, 0.08);
    fillInstancedMesh(crowns, willows, dummy, tmpColor, FOREST_COLORS.willow, 0.08);
    forestGroup.add(trunks, crowns);
  }

  if (ferns.length > 0) {
    const fernInst = new THREE.InstancedMesh(createFernGeometry(), understoryFoliageMat, ferns.length);
    fillInstancedMesh(fernInst, ferns, dummy, tmpColor, FOREST_COLORS.fern, 0.09);
    forestGroup.add(fernInst);
  }

  if (grasses.length > 0) {
    const grassInst = new THREE.InstancedMesh(
      createTallGrassGeometry(),
      understoryFoliageMat,
      grasses.length
    );
    fillInstancedMesh(grassInst, grasses, dummy, tmpColor, FOREST_COLORS.grass, 0.09);
    forestGroup.add(grassInst);
  }

  if (stumps.length > 0) {
    const { woodGeo, mossGeo } = createMossyStumpGeometries();
    const stumpWood = new THREE.InstancedMesh(woodGeo, barkMat, stumps.length);
    const stumpMoss = new THREE.InstancedMesh(mossGeo, mossMat, stumps.length);
    fillInstancedMesh(stumpWood, stumps, dummy, tmpColor, FOREST_COLORS.barkDark, 0.08);
    fillInstancedMesh(stumpMoss, stumps, dummy, null, FOREST_COLORS.moss, 0);
    forestGroup.add(stumpWood, stumpMoss);
  }

  if (mushroomsWarm.length > 0 || mushroomsTeal.length > 0) {
    const { stemGeo, capGeo } = createMushroomClusterGeometries();
    const allMush = [...mushroomsWarm, ...mushroomsTeal];
    const stems = new THREE.InstancedMesh(stemGeo, mushStemMat, allMush.length);
    fillInstancedMesh(stems, allMush, dummy, null, FOREST_COLORS.mushStem, 0);
    forestGroup.add(stems);

    if (mushroomsWarm.length > 0) {
      const capsW = new THREE.InstancedMesh(capGeo, mushCapWarmMat, mushroomsWarm.length);
      fillInstancedMesh(capsW, mushroomsWarm, dummy, null, FOREST_COLORS.mushCapWarm, 0);
      forestGroup.add(capsW);
    }
    if (mushroomsTeal.length > 0) {
      const capsT = new THREE.InstancedMesh(capGeo, mushCapTealMat, mushroomsTeal.length);
      fillInstancedMesh(capsT, mushroomsTeal, dummy, null, FOREST_COLORS.mushCapTeal, 0);
      forestGroup.add(capsT);
    }
  }

  if (rocks.length > 0) {
    const rockInst = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.6, 0),
      stoneMat,
      rocks.length
    );
    fillInstancedMesh(rockInst, rocks, dummy, tmpColor, FOREST_COLORS.stone, 0.1);
    forestGroup.add(rockInst);
  }

  // ===========================================================================
  // ISLAND-SPECIFIC ARCHITECTURAL LANDMARKS
  // ===========================================================================
  const woodLandmarkMat = new THREE.MeshStandardMaterial({
    color: FOREST_COLORS.bark,
    roughness: 0.85,
    flatShading: true,
  });
  const sandLandmarkMat = new THREE.MeshStandardMaterial({
    color: FOREST_COLORS.sand,
    roughness: 0.88,
    flatShading: true,
  });

  if (night === 1) {
    // Đảo Bến: Harbor wooden dock + hanging storm lantern + gently bobbing wooden boat
    const dock = new THREE.Group();
    for (const px of [-2.2, 2.2]) {
      for (const pz of [-37.6, -40.3]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 1.8, 8), woodLandmarkMat);
        post.position.set(px, 0.45, pz);
        dock.add(post);
      }
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.18, 3.8), woodLandmarkMat);
    deck.position.set(0, 0.12, -39.0);
    dock.add(deck);

    // Small decorative pier lantern post
    const lampArm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), woodLandmarkMat);
    lampArm.position.set(-1.85, 1.32, -40.3);
    const tinyBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd782 })
    );
    tinyBulb.position.set(-1.45, 1.16, -40.3);
    dock.add(lampArm, tinyBulb);

    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.95, 3.6, 5), woodLandmarkMat);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(0.58, 1, 0.48);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.72), sandLandmarkMat);
    seat.position.y = 0.08;
    boat.add(hull, seat);
    boat.position.set(4.1, -0.08, -39.8);
    dock.add(boat);
    forestGroup.add(dock);
    landmarkActors.push({ type: 'boat', obj: boat, baseY: -0.08 });
  } else if (night === 2) {
    // Đảo Cau: 4 ornate bamboo entry posts at bridge heads
    for (const bx of [26.2, 43.8]) {
      for (const bz of [-2.18, 2.18]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 1.65, 8), woodLandmarkMat);
        post.position.set(bx, 0.82, bz);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), sandLandmarkMat);
        cap.position.set(bx, 1.7, bz);
        forestGroup.add(post, cap);
      }
    }
  }

  return { forestGroup, landmarkActors };
}
