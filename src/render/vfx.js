import * as THREE from 'three';

const VFX_COLORS = {
  mist: 0x1b2350,
  lanternWarm: 0xffb347,
  lanternCore: 0xffe9b0,
  sporeGold: 0xffe58a,
  leafTint: 0x7cb096,
  dashWind: 0xfff0c2,
};

function createSoftDotTexture(inner, mid, outer) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createLeafSpriteTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-0.45);
  ctx.fillStyle = '#9BC8AE';
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.quadraticCurveTo(16, -6, 0, 24);
  ctx.quadraticCurveTo(-16, -6, 0, -24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 240, 194, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -18);
  ctx.lineTo(0, 18);
  ctx.stroke();
  ctx.restore();
  return new THREE.CanvasTexture(canvas);
}

function createMistWispTexture() {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const puffs = [
    { x: w * 0.5, y: h * 0.55, rx: w * 0.45, ry: h * 0.36, a: 0.55 },
    { x: w * 0.32, y: h * 0.52, rx: w * 0.28, ry: h * 0.32, a: 0.45 },
    { x: w * 0.7, y: h * 0.58, rx: w * 0.26, ry: h * 0.28, a: 0.42 },
  ];
  for (const p of puffs) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, p.ry / p.rx);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, p.rx);
    g.addColorStop(0, `rgba(60, 82, 148, ${p.a})`);
    g.addColorStop(0.55, `rgba(27, 35, 80, ${p.a * 0.55})`);
    g.addColorStop(1, 'rgba(27, 35, 80, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, p.rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return new THREE.CanvasTexture(canvas);
}

export function createLightConeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(255, 233, 176, 0.55)');
  g.addColorStop(0.35, 'rgba(255, 179, 71, 0.24)');
  g.addColorStop(0.8, 'rgba(255, 179, 71, 0.06)');
  g.addColorStop(1, 'rgba(255, 179, 71, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Full forest atmospheric & action VFX manager.
 * Completely no-op in Benchmark mode so benchmark numbers remain 100% pure.
 */
export function createForestVfx(scene, isBenchMode) {
  if (isBenchMode) {
    return {
      setNight() {},
      triggerPulseBurst() {},
      triggerLanternSpiral() {},
      update() {},
    };
  }

  const sparkTex = createSoftDotTexture(
    'rgba(255, 250, 224, 1)',
    'rgba(255, 210, 115, 0.65)',
    'rgba(255, 179, 71, 0)'
  );
  const dashTex = createSoftDotTexture(
    'rgba(255, 246, 215, 0.95)',
    'rgba(232, 226, 208, 0.45)',
    'rgba(200, 16, 46, 0)'
  );
  const leafTex = createLeafSpriteTexture();
  const mistTex = createMistWispTexture();

  let activeNight = 1;

  // ===========================================================================
  // 1. GOLDEN FOREST SPORES (180 drifting luminous forest dust particles)
  // ===========================================================================
  const SPORE_COUNT = 180;
  const sporePositions = new Float32Array(SPORE_COUNT * 3);
  const sporeMeta = [];
  for (let i = 0; i < SPORE_COUNT; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const r = Math.sqrt((i + 0.5) / SPORE_COUNT) * 42;
    const x = Math.cos(a) * r;
    const y = 0.5 + ((i * 1.73) % 7.2);
    const z = Math.sin(a) * r;
    sporePositions[i * 3] = x;
    sporePositions[i * 3 + 1] = y;
    sporePositions[i * 3 + 2] = z;
    sporeMeta.push({
      baseX: x,
      baseY: y,
      baseZ: z,
      phase: i * 0.71,
      speed: 0.35 + (i % 5) * 0.12,
      islandSlot: i % 2,
    });
  }
  const sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePositions, 3));
  const sporePoints = new THREE.Points(
    sporeGeo,
    new THREE.PointsMaterial({
      map: sparkTex,
      color: VFX_COLORS.sporeGold,
      size: 0.42,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  sporePoints.frustumCulled = false;
  scene.add(sporePoints);

  // ===========================================================================
  // 2. FALLING FOREST LEAVES (100 drifting leaves; accelerate in Night 3 wind!)
  // ===========================================================================
  const LEAF_COUNT = 100;
  const leafPositions = new Float32Array(LEAF_COUNT * 3);
  const leafMeta = [];
  for (let i = 0; i < LEAF_COUNT; i++) {
    const x = ((i * 19.7) % 86) - 43;
    const y = 1.0 + ((i * 4.3) % 10.5);
    const z = ((i * 29.3) % 86) - 43;
    leafPositions[i * 3] = x;
    leafPositions[i * 3 + 1] = y;
    leafPositions[i * 3 + 2] = z;
    leafMeta.push({
      fallSpeed: 0.48 + (i % 4) * 0.16,
      phase: i * 1.13,
      swirlR: 0.6 + (i % 3) * 0.35,
    });
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPositions, 3));
  const leafMat = new THREE.PointsMaterial({
    map: leafTex,
    color: 0xffffff,
    size: 0.56,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const leafPoints = new THREE.Points(leafGeo, leafMat);
  leafPoints.frustumCulled = false;
  scene.add(leafPoints);

  // ===========================================================================
  // 3. GROUND MIST RIBBONS (Low drifting translucent bands at forest rim)
  // ===========================================================================
  const MIST_COUNT = 26;
  const mistGroup = new THREE.Group();
  const mistGeo = new THREE.PlaneGeometry(15.5, 4.6);
  const mistMat = new THREE.MeshBasicMaterial({
    map: mistTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mistBands = [];
  for (let i = 0; i < MIST_COUNT; i++) {
    const mesh = new THREE.Mesh(mistGeo, mistMat);
    const a = (i / MIST_COUNT) * Math.PI * 2;
    const band = {
      mesh,
      angle: a,
      speed: (i % 2 === 0 ? 1 : -1) * (0.012 + (i % 4) * 0.004),
      radius: 30 + (i % 4) * 3.8,
      baseY: 0.9 + (i % 3) * 0.48,
      islandSlot: i % 2,
      scaleX: 0.85 + (i % 3) * 0.25,
    };
    mesh.scale.set(band.scaleX, 1, 1);
    mistBands.push(band);
    mistGroup.add(mesh);
  }
  scene.add(mistGroup);

  // ===========================================================================
  // 4. DASH TRAIL POOL (Pre-allocated 72 particles, zero GC)
  // ===========================================================================
  const DASH_POOL = 72;
  const dashPos = new Float32Array(DASH_POOL * 3);
  const dashParticles = Array.from({ length: DASH_POOL }, () => ({
    life: 0,
    maxLife: 0.42,
    x: 0,
    y: -999,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
  }));
  for (let i = 0; i < DASH_POOL; i++) dashPos[i * 3 + 1] = -999;
  const dashGeo = new THREE.BufferGeometry();
  dashGeo.setAttribute('position', new THREE.BufferAttribute(dashPos, 3));
  const dashPoints = new THREE.Points(
    dashGeo,
    new THREE.PointsMaterial({
      map: dashTex,
      color: VFX_COLORS.dashWind,
      size: 0.72,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  dashPoints.frustumCulled = false;
  scene.add(dashPoints);
  let dashCursor = 0;
  let dashEmitAccum = 0;

  // ===========================================================================
  // 5. PULSE BURST SPARKS POOL (Pre-allocated 64 radial sparks)
  // ===========================================================================
  const PULSE_POOL = 64;
  const pulsePos = new Float32Array(PULSE_POOL * 3);
  const pulseParticles = Array.from({ length: PULSE_POOL }, () => ({
    life: 0,
    maxLife: 0.55,
    x: 0,
    y: -999,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
  }));
  for (let i = 0; i < PULSE_POOL; i++) pulsePos[i * 3 + 1] = -999;
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
  const pulsePoints = new THREE.Points(
    pulseGeo,
    new THREE.PointsMaterial({
      map: sparkTex,
      color: VFX_COLORS.lanternWarm,
      size: 0.68,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  pulsePoints.frustumCulled = false;
  scene.add(pulsePoints);
  let pulseCursor = 0;

  // ===========================================================================
  // 6. LANTERN DEPOSIT / REFUEL SPIRAL STREAM POOL (Pre-allocated 96 sparks)
  // ===========================================================================
  const SPIRAL_POOL = 96;
  const spiralPos = new Float32Array(SPIRAL_POOL * 3);
  const spiralParticles = Array.from({ length: SPIRAL_POOL }, () => ({
    active: false,
    t: 0,
    dur: 0.65,
    sx: 0,
    sy: 0,
    sz: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    turns: 2.2,
    radius: 0.75,
    phase: 0,
  }));
  for (let i = 0; i < SPIRAL_POOL; i++) spiralPos[i * 3 + 1] = -999;
  const spiralGeo = new THREE.BufferGeometry();
  spiralGeo.setAttribute('position', new THREE.BufferAttribute(spiralPos, 3));
  const spiralPoints = new THREE.Points(
    spiralGeo,
    new THREE.PointsMaterial({
      map: sparkTex,
      color: VFX_COLORS.lanternCore,
      size: 0.62,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  spiralPoints.frustumCulled = false;
  scene.add(spiralPoints);
  let spiralCursor = 0;

  function setNight(night) {
    activeNight = night;
    // Reposition mist bands cleanly for the new island layout
    for (let i = 0; i < MIST_COUNT; i++) {
      const b = mistBands[i];
      if (night === 2) {
        b.radius = 20.5 + (i % 3) * 3.2;
      } else if (night === 3) {
        b.radius = 33.5 + (i % 4) * 3.4;
      } else {
        b.radius = 29.5 + (i % 4) * 3.2;
      }
    }
    // Reposition spores across single or twin islands
    for (let i = 0; i < SPORE_COUNT; i++) {
      const m = sporeMeta[i];
      const a = (i * 2.399963) % (Math.PI * 2);
      if (night === 2) {
        const cx = m.islandSlot === 0 ? 0 : 70;
        const r = Math.sqrt(((i % 90) + 0.5) / 90) * 28;
        m.baseX = cx + Math.cos(a) * r;
        m.baseZ = Math.sin(a) * r;
      } else {
        const maxR = night === 3 ? 44 : 39;
        const r = Math.sqrt((i + 0.5) / SPORE_COUNT) * maxR;
        m.baseX = Math.cos(a) * r;
        m.baseZ = Math.sin(a) * r;
      }
    }
  }

  function triggerPulseBurst(originPos, reduceMotion) {
    if (reduceMotion) return;
    const count = 36;
    for (let i = 0; i < count; i++) {
      const p = pulseParticles[pulseCursor];
      pulseCursor = (pulseCursor + 1) % PULSE_POOL;
      const a = (i / count) * Math.PI * 2 + (i % 3) * 0.08;
      const speed = 7.5 + (i % 5) * 1.45;
      p.life = 0.48 + (i % 3) * 0.07;
      p.maxLife = p.life;
      p.x = originPos[0] + Math.cos(a) * 0.35;
      p.y = originPos[1] + 0.45 + (i % 3) * 0.14;
      p.z = originPos[2] + Math.sin(a) * 0.35;
      p.vx = Math.cos(a) * speed;
      p.vy = 1.6 + (i % 4) * 0.55;
      p.vz = Math.sin(a) * speed;
    }
  }

  function triggerLanternSpiral(playerPos, lanternPos, isFullLit, reduceMotion) {
    if (reduceMotion) return;
    const count = isFullLit ? 26 : 14;
    for (let i = 0; i < count; i++) {
      const sp = spiralParticles[spiralCursor];
      spiralCursor = (spiralCursor + 1) % SPIRAL_POOL;
      sp.active = true;
      sp.t = -(i * 0.022); // Staggered launch for ribbon-like spiral column
      sp.dur = isFullLit ? 0.72 + (i % 4) * 0.05 : 0.54 + (i % 3) * 0.05;
      sp.sx = playerPos[0];
      sp.sy = playerPos[1] + 1.15;
      sp.sz = playerPos[2];
      sp.tx = lanternPos[0];
      sp.ty = lanternPos[1] + 3.25;
      sp.tz = lanternPos[2];
      sp.turns = isFullLit ? 2.8 : 2.1;
      sp.radius = isFullLit ? 1.15 : 0.78;
      sp.phase = (i / count) * Math.PI * 2;
    }
  }

  const dawnTintColor = new THREE.Color(0xffc99e);
  const nightMistColor = new THREE.Color(0xffffff);

  function update(rs, visualTime, dtSec, reduceMotion, camera, dawnProgress = 0) {
    // 1. Golden forest spores
    const spAttr = sporeGeo.attributes.position;
    const spRate = reduceMotion ? 0 : 1;
    for (let i = 0; i < SPORE_COUNT; i++) {
      const m = sporeMeta[i];
      const ph = visualTime * m.speed * spRate + m.phase;
      spAttr.setXYZ(
        i,
        m.baseX + Math.sin(ph) * 0.9,
        m.baseY + Math.cos(ph * 1.3) * 0.55,
        m.baseZ + Math.cos(ph * 0.85) * 0.9
      );
    }
    spAttr.needsUpdate = true;

    // 2. Falling leaves (gentle flutter normally; fast directional stream in Night 3 Wind!)
    const windWarn = rs.wind && rs.wind.warning;
    const windAct = rs.wind && rs.wind.active;
    const windRad = rs.wind ? (rs.wind.dirDeg * Math.PI) / 180 : 0.4;
    const windSpd = windAct ? 22.0 : windWarn ? 9.0 : 0.9;
    const windVx = Math.cos(windRad) * windSpd;
    const windVz = Math.sin(windRad) * windSpd;
    leafMat.opacity = windAct ? 0.92 : windWarn ? 0.84 : 0.62;

    if (!reduceMotion) {
      const lfAttr = leafGeo.attributes.position;
      const centerX = activeNight === 2 ? 35 : 0;
      const halfSpan = activeNight === 2 ? 68 : 44;
      for (let i = 0; i < LEAF_COUNT; i++) {
        const lm = leafMeta[i];
        let lx = lfAttr.getX(i) + (windVx + Math.sin(visualTime * 1.7 + lm.phase) * lm.swirlR) * dtSec;
        let ly = lfAttr.getY(i) - lm.fallSpeed * (windAct ? 0.55 : 1.0) * dtSec;
        let lz = lfAttr.getZ(i) + (windVz + Math.cos(visualTime * 1.4 + lm.phase) * lm.swirlR) * dtSec;

        if (ly < 0.25) ly = 9.5 + (i % 4) * 0.8;
        if (lx > centerX + halfSpan) lx -= halfSpan * 2;
        if (lx < centerX - halfSpan) lx += halfSpan * 2;
        if (lz > 44) lz -= 88;
        if (lz < -44) lz += 88;
        lfAttr.setXYZ(i, lx, ly, lz);
      }
      lfAttr.needsUpdate = true;
    }

    // 3. Drifting ground mist bands (face camera horizontally; warm & thin at dawn)
    mistMat.color.copy(nightMistColor).lerp(dawnTintColor, dawnProgress);
    mistMat.opacity = 0.34 - dawnProgress * 0.14;
    for (let i = 0; i < MIST_COUNT; i++) {
      const b = mistBands[i];
      if (!reduceMotion) {
        b.angle += b.speed * dtSec;
      }
      const cx = activeNight === 2 ? (b.islandSlot === 0 ? 0 : 70) : 0;
      const mx = cx + Math.cos(b.angle) * b.radius;
      const mz = Math.sin(b.angle) * b.radius;
      const my = b.baseY + (reduceMotion ? 0 : Math.sin(visualTime * 0.55 + i) * 0.18);
      b.mesh.position.set(mx, my, mz);
      b.mesh.lookAt(camera.position.x, my, camera.position.z);
    }

    // 4. Dash Trail emission & simulation
    const p = rs.player;
    if (p.isDashing && !p.isRespawning && !reduceMotion) {
      dashEmitAccum += dtSec * 85;
      while (dashEmitAccum >= 1) {
        dashEmitAccum -= 1;
        const dp = dashParticles[dashCursor];
        dashCursor = (dashCursor + 1) % DASH_POOL;
        dp.life = 0.36;
        dp.maxLife = 0.36;
        const spread = ((dashCursor % 5) - 2) * 0.13;
        dp.x = p.pos[0] + spread;
        dp.y = p.pos[1] + 0.68 + ((dashCursor % 3) - 1) * 0.16;
        dp.z = p.pos[2] - spread * 0.8;
        dp.vx = -p.vel[0] * 0.16 + spread * 1.2;
        dp.vy = 0.5 + (dashCursor % 3) * 0.25;
        dp.vz = -p.vel[2] * 0.16 - spread * 1.2;
      }
    } else {
      dashEmitAccum = 0;
    }

    const dAttr = dashGeo.attributes.position;
    let dashDirty = false;
    for (let i = 0; i < DASH_POOL; i++) {
      const dp = dashParticles[i];
      if (dp.life > 0) {
        dp.life -= dtSec;
        if (dp.life <= 0) {
          dAttr.setXYZ(i, 0, -999, 0);
        } else {
          dp.x += dp.vx * dtSec;
          dp.y += dp.vy * dtSec;
          dp.z += dp.vz * dtSec;
          dAttr.setXYZ(i, dp.x, dp.y, dp.z);
        }
        dashDirty = true;
      }
    }
    if (dashDirty) dAttr.needsUpdate = true;

    // 5. Pulse burst sparks
    const pAttr = pulseGeo.attributes.position;
    let pulseDirty = false;
    for (let i = 0; i < PULSE_POOL; i++) {
      const pp = pulseParticles[i];
      if (pp.life > 0) {
        pp.life -= dtSec;
        if (pp.life <= 0) {
          pAttr.setXYZ(i, 0, -999, 0);
        } else {
          pp.x += pp.vx * dtSec;
          pp.y += pp.vy * dtSec;
          pp.z += pp.vz * dtSec;
          pp.vx *= Math.max(0, 1 - 3.2 * dtSec);
          pp.vz *= Math.max(0, 1 - 3.2 * dtSec);
          pp.vy -= 2.2 * dtSec;
          pAttr.setXYZ(i, pp.x, Math.max(0.1, pp.y), pp.z);
        }
        pulseDirty = true;
      }
    }
    if (pulseDirty) pAttr.needsUpdate = true;

    // 6. Lantern spiral light stream particles
    const sAttr = spiralGeo.attributes.position;
    let spiralDirty = false;
    for (let i = 0; i < SPIRAL_POOL; i++) {
      const sp = spiralParticles[i];
      if (!sp.active) continue;
      sp.t += dtSec;
      if (sp.t < 0) {
        sAttr.setXYZ(i, 0, -999, 0);
        spiralDirty = true;
        continue;
      }
      const u = sp.t / sp.dur;
      if (u >= 1) {
        sp.active = false;
        sAttr.setXYZ(i, 0, -999, 0);
      } else {
        const ease = 1 - Math.pow(1 - u, 2);
        const cx = sp.sx + (sp.tx - sp.sx) * ease;
        const cy = sp.sy + (sp.ty - sp.sy) * u + Math.sin(u * Math.PI) * 0.65;
        const cz = sp.sz + (sp.tz - sp.sz) * ease;
        const swirlR = sp.radius * Math.sin(u * Math.PI);
        const ang = sp.phase + u * Math.PI * 2 * sp.turns;
        sAttr.setXYZ(i, cx + Math.cos(ang) * swirlR, cy, cz + Math.sin(ang) * swirlR);
      }
      spiralDirty = true;
    }
    if (spiralDirty) sAttr.needsUpdate = true;
  }

  return {
    setNight,
    triggerPulseBurst,
    triggerLanternSpiral,
    update,
  };
}
