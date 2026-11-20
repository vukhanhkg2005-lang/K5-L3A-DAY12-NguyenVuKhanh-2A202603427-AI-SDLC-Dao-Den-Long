import * as THREE from 'three';
import { buildFairytaleForest } from './forest.js';
import { createForestVfx, createLightConeTexture } from './vfx.js';

// Standard Color Palette (Contract v1.1 - v1.3, <= 10% RGB tolerance)
const PALETTE = {
  sky: 0x0e1430,
  fog: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  seaCloud: 0x12384a,
  lanternLit: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternOff: 0x5b5f6e,
  moteCore: 0xfff6c2,
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeRim: 0x7a3cff,
  shadeRimColorblind: 0x00b3ff,
  shadeStunned: 0x3a3450,
  mayCloak: 0xe8e2d0,
  mayScarf: 0xc8102e,
  gold: 0xf2c14e,
  drifter: 0x8fa3b8,
  danger: 0xff5a5f,
  dangerColorblind: 0xffffff,
};

const MAX_SHADE_INSTANCES = 256;
const MAX_MOTE_INSTANCES = 128;

function createSoftGlowTexture(innerRgba, outerRgba) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.45, outerRgba);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createCrescentMoonTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Outer soft moon halo
  const halo = ctx.createRadialGradient(size / 2, size / 2, 16, size / 2, size / 2, size / 2);
  halo.addColorStop(0, 'rgba(255, 238, 190, 0.35)');
  halo.addColorStop(0.55, 'rgba(255, 229, 138, 0.12)');
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // Draw crescent moon offscreen then composite onto halo
  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = size;
  moonCanvas.height = size;
  const mctx = moonCanvas.getContext('2d');
  mctx.fillStyle = '#FFF6C2';
  mctx.beginPath();
  mctx.arc(size / 2, size / 2, 52, 0, Math.PI * 2);
  mctx.fill();
  mctx.globalCompositeOperation = 'destination-out';
  mctx.beginPath();
  mctx.arc(size / 2 + 22, size / 2 - 14, 46, 0, Math.PI * 2);
  mctx.fill();

  ctx.drawImage(moonCanvas, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function createDawnSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDawn: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.28, 0.24, 0.92).normalize() },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uDawn;
      uniform vec3 uSunDir;
      varying vec3 vWorldDir;
      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);

        // Midnight sky palette (#070B1C -> #0E1430 -> #1B2350)
        vec3 nHorizon = vec3(0.106, 0.137, 0.314);
        vec3 nMid     = vec3(0.055, 0.078, 0.188);
        vec3 nZenith  = vec3(0.027, 0.043, 0.110);
        vec3 nightCol = mix(nHorizon, nMid, smoothstep(0.0, 0.36, h));
        nightCol = mix(nightCol, nZenith, smoothstep(0.32, 0.88, h));

        // Dawn sky palette (#FFD285 -> #DA836D -> #4275B3)
        vec3 dHorizon = vec3(1.00, 0.82, 0.52);
        vec3 dMid     = vec3(0.84, 0.51, 0.44);
        vec3 dZenith  = vec3(0.24, 0.46, 0.72);
        vec3 dawnCol  = mix(dHorizon, dMid, smoothstep(0.0, 0.30, h));
        dawnCol  = mix(dawnCol, dZenith, smoothstep(0.26, 0.82, h));

        // Directional eastern solar glow across horizon
        float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
        vec3 sunBloom = vec3(1.0, 0.90, 0.64) * pow(sunDot, 5.0) * 0.65
                      + vec3(1.0, 0.68, 0.38) * pow(sunDot, 2.0) * 0.32;
        dawnCol += sunBloom * (1.0 - smoothstep(0.35, 0.9, h));

        vec3 col = mix(nightCol, dawnCol, uDawn);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

function createIslandGroundTexture(radius, lanterns, centerOffset = [0, 0]) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const half = size / 2;

  // Base grass (#2F5D50)
  ctx.fillStyle = '#2F5D50';
  ctx.fillRect(0, 0, size, size);

  // Subtle organic grass patches (within <= 7% RGB of #2F5D50)
  for (let i = 0; i < 90; i++) {
    const a = i * 2.39996;
    const r = Math.sqrt((i + 0.5) / 90) * (half * 0.85);
    const px = half + Math.cos(a) * r;
    const py = half + Math.sin(a) * r;
    const rad = 14 + (i % 5) * 7;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(54, 104, 90, 0.35)' : 'rgba(40, 82, 70, 0.32)';
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft sandy paths (#C9B48A) radiating from island center to lanterns on this island
  ctx.strokeStyle = 'rgba(201, 180, 138, 0.36)';
  ctx.lineCap = 'round';
  for (const l of lanterns || []) {
    const lx = l.pos[0] - centerOffset[0];
    const lz = l.pos[2] - centerOffset[1];
    const dist = Math.hypot(lx, lz);
    if (dist > radius + 1) continue;
    const tx = half + (lx / radius) * half;
    const ty = half + (lz / radius) * half;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(half, half);
    ctx.quadraticCurveTo(
      (half + tx) * 0.5 + (lz / radius) * 14,
      (half + ty) * 0.5 - (lx / radius) * 14,
      tx,
      ty
    );
    ctx.stroke();

    // Stepping stones along path
    const steps = Math.max(4, Math.floor(dist / 2.6));
    ctx.fillStyle = 'rgba(201, 180, 138, 0.52)';
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      const sx = half + (tx - half) * t;
      const sy = half + (ty - half) * t;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Outer sandy shore transition (#C9B48A)
  const rimGrad = ctx.createRadialGradient(half, half, half * 0.84, half, half, half);
  rimGrad.addColorStop(0, 'rgba(201, 180, 138, 0)');
  rimGrad.addColorStop(0.7, 'rgba(201, 180, 138, 0.55)');
  rimGrad.addColorStop(1, '#C9B48A');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function createTornPaperTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5B5F6E';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(20, 22, 32, 0.45)';
  ctx.lineWidth = 2;
  for (let y = 16; y < size; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#181A24';
  const tears = [
    [[24, 18], [46, 36], [30, 56], [52, 74], [26, 98], [18, 72], [32, 50], [16, 32]],
    [[82, 22], [108, 44], [90, 68], [112, 92], [86, 108], [76, 80], [92, 56], [74, 34]],
  ];
  for (const pts of tears) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function buildMayMesh(glowTex) {
  const group = new THREE.Group();

  // Soft contact shadow disc under Mây's feet
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 18),
    new THREE.MeshBasicMaterial({
      color: 0x060814,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  group.add(contactShadow);

  // Cloak (#E8E2D0) + golden hem ring (#F2C14E)
  const cloak = new THREE.Mesh(
    new THREE.ConeGeometry(0.43, 1.05, 14),
    new THREE.MeshStandardMaterial({ color: PALETTE.mayCloak, roughness: 0.76 })
  );
  cloak.position.y = 0.62;
  cloak.castShadow = true;
  group.add(cloak);

  const hem = new THREE.Mesh(
    new THREE.TorusGeometry(0.41, 0.025, 6, 18),
    new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.5 })
  );
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.12;
  group.add(hem);

  // Scarf collar (#C8102E) + fluttering tails
  const scarfMat = new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.55 });
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.068, 8, 16), scarfMat);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.06;
  group.add(scarf);

  const scarfTailPivot = new THREE.Group();
  scarfTailPivot.position.set(0, 1.02, -0.22);
  const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.52), scarfMat);
  tailL.position.set(-0.08, -0.06, -0.24);
  tailL.rotation.x = -0.35;
  const tailR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.44), scarfMat);
  tailR.position.set(0.08, -0.08, -0.2);
  tailR.rotation.x = -0.42;
  scarfTailPivot.add(tailL, tailR);
  group.add(scarfTailPivot);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf6dfc6, roughness: 0.7 })
  );
  head.position.y = 1.24;
  group.add(head);

  // Conical hat (Nón lá - #C9B48A sand straw) + bamboo rim ring
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.64, 0.4, 18),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.84 })
  );
  hat.position.y = 1.53;
  hat.castShadow = true;
  group.add(hat);

  const hatRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.63, 0.018, 6, 20),
    new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.8 })
  );
  hatRim.rotation.x = Math.PI / 2;
  hatRim.position.y = 1.34;
  group.add(hatRim);

  // Mini lantern dangling from front brim of nón lá
  const miniPivot = new THREE.Group();
  miniPivot.position.set(0, 1.35, 0.56);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6),
    new THREE.MeshBasicMaterial({ color: PALETTE.wood })
  );
  cord.position.y = -0.11;
  miniPivot.add(cord);

  const miniCap = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.07, 6),
    new THREE.MeshStandardMaterial({ color: PALETTE.wood })
  );
  miniCap.position.y = -0.16;
  miniPivot.add(miniCap);

  const miniLanternMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternCore,
    emissive: PALETTE.lanternLit,
    emissiveIntensity: 1.8,
    roughness: 0.25,
  });
  const miniLantern = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.15, 6), miniLanternMat);
  miniLantern.position.y = -0.25;
  miniPivot.add(miniLantern);

  const miniHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: PALETTE.lanternLit,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  miniHalo.position.y = -0.25;
  miniHalo.scale.set(0.75, 0.75, 1);
  miniPivot.add(miniHalo);

  const miniLight = new THREE.PointLight(PALETTE.lanternLit, 2.4, 11, 1.6);
  miniLight.position.y = -0.25;
  miniPivot.add(miniLight);
  group.add(miniPivot);

  // Charm aura ring (visible while Bùa Gió active)
  const charmRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.72, 24),
    new THREE.MeshBasicMaterial({
      color: PALETTE.mayScarf,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    })
  );
  charmRing.rotation.x = -Math.PI / 2;
  charmRing.position.y = 0.06;
  charmRing.visible = false;
  group.add(charmRing);

  return { group, miniPivot, miniLight, miniLanternMat, charmRing, scarfTailPivot };
}

function buildLanternMesh(safeRadius, interactRadius, glowTex, tornTex, lightConeTex, isBenchMode) {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: PALETTE.lanternOff, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.82 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: PALETTE.gold,
    metalness: 0.4,
    roughness: 0.4,
  });

  // Stepped stone pedestal
  const baseBottom = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.28, 8), stoneMat);
  baseBottom.position.y = 0.14;
  const baseTop = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.95, 0.34, 8), stoneMat);
  baseTop.position.y = 0.45;
  group.add(baseBottom, baseTop);

  // Carved wooden pillar + cross brace
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.25, 8), woodMat);
  pillar.position.y = 1.62;
  pillar.castShadow = true;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.35, 0.18, 8), woodMat);
  collar.position.y = 2.6;
  group.add(pillar, collar);

  // Paper head sub-group (squashed 20% in Y when unlit: scale.y = 0.8)
  const headGroup = new THREE.Group();
  headGroup.position.y = 2.65;

  const coreMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternOff,
    map: tornTex,
    emissive: PALETTE.lanternLit,
    emissiveIntensity: 0.05,
    roughness: 0.32,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.48, 1.05, 8), coreMat);
  core.position.y = 0.52;
  headGroup.add(core);

  // 4 wooden corner ribs around lantern chamber
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.08, 6), woodMat);
    rib.position.set(Math.cos(a) * 0.53, 0.52, Math.sin(a) * 0.53);
    headGroup.add(rib);
  }

  // Two-tier fairytale roof + gold finial
  const roofLower = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.46, 8), woodMat);
  roofLower.position.y = 1.22;
  const roofUpper = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.42, 8), woodMat);
  roofUpper.position.y = 1.52;
  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), goldMat);
  finial.position.y = 1.82;
  headGroup.add(roofLower, roofUpper, finial);
  group.add(headGroup);

  // 3D Billboarding Fuel Bar above lit lantern
  const fuelBarGroup = new THREE.Group();
  fuelBarGroup.position.y = 4.9;
  const fuelBg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.72, 0.22),
    new THREE.MeshBasicMaterial({ color: 0x0e1430, side: THREE.DoubleSide })
  );
  const fuelFillMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lanternLit,
    side: THREE.DoubleSide,
  });
  const fuelFill = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.14), fuelFillMat);
  fuelFill.position.z = 0.01;
  fuelBarGroup.add(fuelBg, fuelFill);
  fuelBarGroup.visible = false;
  group.add(fuelBarGroup);

  const light = new THREE.PointLight(PALETTE.lanternLit, 0, safeRadius * 2.8, 1.35);
  light.position.y = 3.25;
  group.add(light);

  const haloMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: PALETTE.lanternCore,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.y = 3.2;
  halo.scale.set(5.4, 5.4, 1);
  group.add(halo);

  // Soft volumetric Light Cone shining down into the night forest mist (disabled in bench mode)
  let lightConeMat = null;
  let lightCone = null;
  if (!isBenchMode && lightConeTex) {
    lightConeMat = new THREE.MeshBasicMaterial({
      map: lightConeTex,
      color: PALETTE.lanternLit,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    lightCone = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 3.6, 3.55, 18, 1, true), lightConeMat);
    lightCone.position.y = 1.82;
    group.add(lightCone);
  }

  // Warm ground glow puddle when lit
  const groundGlowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: PALETTE.lanternLit,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 9.2), groundGlowMat);
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = 0.03;
  group.add(groundGlow);

  const safeRingMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lanternLit,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const safeRing = new THREE.Mesh(
    new THREE.RingGeometry(safeRadius - 0.14, safeRadius, 48),
    safeRingMat
  );
  safeRing.rotation.x = -Math.PI / 2;
  safeRing.position.y = 0.05;
  group.add(safeRing);

  const interactRing = new THREE.Mesh(
    new THREE.RingGeometry(interactRadius - 0.07, interactRadius, 32),
    new THREE.MeshBasicMaterial({
      color: PALETTE.gold,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    })
  );
  interactRing.rotation.x = -Math.PI / 2;
  interactRing.position.y = 0.04;
  group.add(interactRing);

  return {
    group,
    headGroup,
    coreMat,
    light,
    halo,
    haloMat,
    lightCone,
    lightConeMat,
    groundGlow,
    groundGlowMat,
    safeRingMat,
    interactRing,
    fuelBarGroup,
    fuelFill,
    fuelFillMat,
    tornTex,
  };
}

function buildDrifterMesh() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.drifter,
    emissive: 0x3b5870,
    emissiveIntensity: 0.65,
    side: THREE.DoubleSide,
    roughness: 0.4,
    transparent: true,
    opacity: 0.88,
  });
  const mainRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.45, 1.65), mat);
  const tailRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 1.1), mat);
  tailRibbon.position.z = -1.2;
  group.add(mainRibbon, tailRibbon);

  const stolenOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.moteCore })
  );
  stolenOrb.position.set(0, 0.45, 0.3);
  stolenOrb.visible = false;
  group.add(stolenOrb);

  return { group, mainRibbon, tailRibbon, stolenOrb };
}

function buildCharmMesh() {
  const group = new THREE.Group();
  const border = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.78, 0.06),
    new THREE.MeshStandardMaterial({
      color: PALETTE.gold,
      emissive: PALETTE.gold,
      emissiveIntensity: 0.45,
    })
  );
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.66, 0.08),
    new THREE.MeshStandardMaterial({
      color: PALETTE.mayScarf,
      emissive: PALETTE.mayScarf,
      emissiveIntensity: 0.5,
    })
  );
  group.add(border, body);
  return group;
}

function buildJumpPadMesh(pad) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(pad.radius, pad.radius * 1.15, 0.16, 24),
    new THREE.MeshStandardMaterial({
      color: PALETTE.gold,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.75,
    })
  );
  base.position.y = 0.08;
  g.add(base);

  const glowRing = new THREE.Mesh(
    new THREE.RingGeometry(pad.radius * 1.18, pad.radius * 1.38, 24),
    new THREE.MeshBasicMaterial({
      color: PALETTE.lanternCore,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    })
  );
  glowRing.rotation.x = -Math.PI / 2;
  glowRing.position.y = 0.04;
  g.add(glowRing);

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.74, 4),
    new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.position.y = 0.28;
  arrow.rotation.z = -Math.atan2(pad.vx, pad.vz);
  g.add(arrow);

  g.position.set(pad.pos[0], pad.pos[1], pad.pos[2]);
  return g;
}

function buildIslandDisk(radius, yTop, height, topMat, bodyMat, sandMat) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.9, height, 48),
    [bodyMat, topMat, bodyMat]
  );
  core.position.y = yTop - height / 2;
  core.receiveShadow = true;
  g.add(core);

  const rim = new THREE.Mesh(new THREE.RingGeometry(radius - 1.6, radius + 0.05, 48), sandMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = yTop + 0.015;
  g.add(rim);
  return g;
}

function buildMapGeometry(night, lanterns, jumpPads, charms, windUniforms, isBenchMode) {
  const mapGroup = new THREE.Group();
  const grassBodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.92 });
  const sandMat = new THREE.MeshStandardMaterial({
    color: PALETTE.sand,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x374745, roughness: 0.95 });

  if (night === 1) {
    const topMat = isBenchMode
      ? grassBodyMat
      : new THREE.MeshStandardMaterial({
          map: createIslandGroundTexture(40, lanterns, [0, 0]),
          roughness: 0.9,
        });
    mapGroup.add(buildIslandDisk(40, 0, 5.0, topMat, grassBodyMat, sandMat));
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 0.1, 24), woodMat);
    pier.position.y = 0.01;
    mapGroup.add(pier);
  } else if (night === 2) {
    const topTexA = createIslandGroundTexture(28, lanterns, [0, 0]);
    const topTexB = createIslandGroundTexture(28, lanterns, [70, 0]);
    const topMatA = new THREE.MeshStandardMaterial({ map: topTexA, roughness: 0.9 });
    const topMatB = new THREE.MeshStandardMaterial({ map: topTexB, roughness: 0.9 });

    const islA = buildIslandDisk(28, 0, 5.0, topMatA, grassBodyMat, sandMat);
    const islB = buildIslandDisk(28, 0, 5.0, topMatB, grassBodyMat, sandMat);
    islB.position.x = 70;
    mapGroup.add(islA, islB);

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.32, 4.0), woodMat);
    bridge.position.set(35, -0.14, 0);
    bridge.receiveShadow = true;
    mapGroup.add(bridge);

    // Side bamboo rails (flush with bridge deck so no railing blocks falling) & planks
    for (const bz of [-1.92, 1.92]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 18.4, 8), woodMat);
      beam.rotation.z = Math.PI / 2;
      beam.position.set(35, 0.04, bz);
      mapGroup.add(beam);
    }
    for (let x = 26.5; x <= 43.5; x += 1.1) {
      const plank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.85, 6), sandMat);
      plank.rotation.x = Math.PI / 2;
      plank.position.set(x, -0.01, 0);
      mapGroup.add(plank);
    }
  } else if (night === 3) {
    const topTex = createIslandGroundTexture(45, lanterns, [0, 0]);
    const topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.9 });
    mapGroup.add(buildIslandDisk(45, 0, 5.0, topMat, grassBodyMat, sandMat));

    // Tier 1: half-annulus R=12..24m, z > 0, Y=0..3
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 24, 0, Math.PI, false);
    shape.lineTo(-12, 0);
    shape.absarc(0, 0, 12, Math.PI, 0, true);
    shape.closePath();
    const tier1Geo = new THREE.ExtrudeGeometry(shape, {
      depth: 3.0,
      bevelEnabled: false,
      curveSegments: 36,
    });
    tier1Geo.rotateX(Math.PI / 2);
    tier1Geo.translate(0, 3.0, 0);
    const tier1Mesh = new THREE.Mesh(tier1Geo, [grassBodyMat, cliffMat]);
    tier1Mesh.receiveShadow = true;
    mapGroup.add(tier1Mesh);

    // Tier 2: disk R=8m at center, Y=0..6 + sandy stone rim
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.2, 6.0, 36), [
      cliffMat,
      grassBodyMat,
      cliffMat,
    ]);
    tier2.position.y = 3.0;
    tier2.receiveShadow = true;
    const tier2Rim = new THREE.Mesh(new THREE.RingGeometry(7.2, 8.05, 36), sandMat);
    tier2Rim.rotation.x = -Math.PI / 2;
    tier2Rim.position.y = 6.02;
    mapGroup.add(tier2, tier2Rim);

    // 2 Ramps: width 3m along angles 30° and 150°, foot R=30 (Y=0) -> top R=24 (Y=3) + wooden side curbs
    const rampLen = Math.hypot(6.0, 3.0);
    const rampPitch = Math.atan2(3.0, 6.0);
    for (const deg of [30, 150]) {
      const rad = (deg * Math.PI) / 180;
      const midR = 27.0;
      const rampHolder = new THREE.Group();
      rampHolder.position.set(Math.cos(rad) * midR, 1.5, Math.sin(rad) * midR);
      rampHolder.rotation.y = Math.atan2(Math.cos(rad), Math.sin(rad));

      const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.26, rampLen + 0.4), woodMat);
      rampMesh.rotation.x = rampPitch;
      rampMesh.receiveShadow = true;
      rampHolder.add(rampMesh);

      for (const sideX of [-1.44, 1.44]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, rampLen + 0.3), sandMat);
        curb.position.x = sideX;
        curb.rotation.x = rampPitch;
        rampHolder.add(curb);
      }
      mapGroup.add(rampHolder);
    }

    // Ornate Bell Tower at center on Tier 2: cylinder R=2m, height 8m (Y=6..14)
    const towerBase = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.2, 1.2, 12), cliffMat);
    towerBase.position.y = 6 + 0.6;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.98, 6.2, 12), woodMat);
    tower.position.y = 6 + 3.8;
    tower.castShadow = true;

    const roofMat = new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.68 });
    const goldMat = new THREE.MeshStandardMaterial({
      color: PALETTE.gold,
      metalness: 0.55,
      roughness: 0.35,
    });
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.15, 14), goldMat);
    bell.position.y = 11.4;
    const eaveLower = new THREE.Mesh(new THREE.ConeGeometry(2.85, 1.35, 12), roofMat);
    eaveLower.position.y = 12.6;
    const eaveUpper = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.45, 12), roofMat);
    eaveUpper.position.y = 13.75;
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 1.1, 8), goldMat);
    spire.position.y = 14.8;
    mapGroup.add(towerBase, tower, bell, eaveLower, eaveUpper, spire);
  }

  for (const pad of jumpPads || []) {
    mapGroup.add(buildJumpPadMesh(pad));
  }

  const { forestGroup, landmarkActors } = buildFairytaleForest(
    night,
    lanterns,
    jumpPads,
    charms,
    windUniforms,
    isBenchMode
  );
  mapGroup.add(forestGroup);

  return { mapGroup, landmarkActors };
}

export function createSceneRenderer(container, initialState, { isBenchMode = false } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0135);

  const camera = new THREE.PerspectiveCamera(
    56,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.2,
    280
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(isBenchMode ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Ambient Light strictly follows formula: 0.15 + 0.55 * (lit / total)
  const ambientLight = new THREE.AmbientLight(0xdce6ff, 0.15);
  scene.add(ambientLight);

  const moonLight = new THREE.DirectionalLight(0xa4b8f0, 0.55);
  moonLight.position.set(-28, 46, -20);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  const sd = 52;
  moonLight.shadow.camera.left = -sd;
  moonLight.shadow.camera.right = sd;
  moonLight.shadow.camera.top = sd;
  moonLight.shadow.camera.bottom = -sd;
  scene.add(moonLight);

  const glowTex = createSoftGlowTexture('rgba(255, 246, 194, 1)', 'rgba(255, 229, 138, 0.45)');
  const tornTex = createTornPaperTexture();
  const lightConeTex = isBenchMode ? null : createLightConeTexture();
  let colorblindMode = false;
  let reduceMotion = false;
  let shakeTime = 0;

  // Shared GPU wind uniforms for all instanced trees, bamboo, willows, ferns & grass
  const windUniforms = {
    uSwayTime: { value: 0 },
    uSwayAmp: { value: 0.22 },
    uSwayDir: { value: new THREE.Vector2(0.35, 0.2) },
  };

  // Base sea of clouds plane (#12384A)
  const seaPlaneMat = new THREE.MeshBasicMaterial({ color: PALETTE.seaCloud });
  const seaPlane = new THREE.Mesh(new THREE.CircleGeometry(240, 48), seaPlaneMat);
  seaPlane.rotation.x = -Math.PI / 2;
  seaPlane.position.y = -11.5;
  scene.add(seaPlane);

  // Background depth: Dawn-reactive Sky Dome, Rising Sun, Crescent Moon, 2-layer Clouds & Starfield
  // (All disabled in Benchmark mode per Contract v1.3!)
  let cloudLayerUpper = null;
  let cloudLayerLower = null;
  let upperCloudMat = null;
  let lowerCloudMat = null;
  let starField = null;
  let starMat = null;
  let skyDome = null;
  let skyMat = null;
  let moonSprite = null;
  let moonMat = null;
  let sunGroup = null;
  let sunOrbMat = null;
  let sunInnerHaloMat = null;
  let sunOuterHaloMat = null;

  if (!isBenchMode) {
    // Dynamic Night -> Sunrise Sky Dome shader
    skyMat = createDawnSkyMaterial();
    skyDome = new THREE.Mesh(new THREE.SphereGeometry(220, 28, 18), skyMat);
    scene.add(skyDome);

    // Crescent Moon Sprite in upper night sky (fades out at dawn)
    moonMat = new THREE.SpriteMaterial({
      map: createCrescentMoonTexture(),
      transparent: true,
      opacity: 1,
      fog: false,
    });
    moonSprite = new THREE.Sprite(moonMat);
    moonSprite.position.set(-72, 88, -110);
    moonSprite.scale.set(28, 28, 1);
    scene.add(moonSprite);

    // Rising Dawn Sun Orb + Dual Additive Halos (rises over horizon when stage won!)
    sunGroup = new THREE.Group();
    sunOrbMat = new THREE.MeshBasicMaterial({
      color: 0xfff6d2,
      transparent: true,
      opacity: 0,
      fog: false,
    });
    const sunOrb = new THREE.Mesh(new THREE.SphereGeometry(10.5, 24, 16), sunOrbMat);
    sunInnerHaloMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffe58a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const sunInnerHalo = new THREE.Sprite(sunInnerHaloMat);
    sunInnerHalo.scale.set(66, 66, 1);

    sunOuterHaloMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffa64d,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const sunOuterHalo = new THREE.Sprite(sunOuterHaloMat);
    sunOuterHalo.scale.set(125, 125, 1);

    sunGroup.add(sunOuterHalo, sunInnerHalo, sunOrb);
    sunGroup.position.set(42, -20, 140);
    sunGroup.visible = false;
    scene.add(sunGroup);

    // 2-Layer Low-Poly Sea of Clouds (InstancedMesh: 2 draw calls total!)
    const cloudGeo = new THREE.DodecahedronGeometry(6.5, 1);
    upperCloudMat = new THREE.MeshStandardMaterial({
      color: PALETTE.seaCloud,
      emissive: 0x102238,
      roughness: 0.95,
      transparent: true,
      opacity: 0.82,
      flatShading: true,
    });
    lowerCloudMat = new THREE.MeshStandardMaterial({
      color: PALETTE.fog,
      emissive: 0x0c172b,
      roughness: 1.0,
      transparent: true,
      opacity: 0.65,
      flatShading: true,
    });

    const upperCount = 48;
    const lowerCount = 40;
    cloudLayerUpper = new THREE.InstancedMesh(cloudGeo, upperCloudMat, upperCount);
    cloudLayerLower = new THREE.InstancedMesh(cloudGeo, lowerCloudMat, lowerCount);
    const cDummy = new THREE.Object3D();

    for (let i = 0; i < upperCount; i++) {
      const a = (i / upperCount) * Math.PI * 2;
      const r = 48 + (i % 4) * 14;
      cDummy.position.set(Math.cos(a) * r, -4.2 - (i % 3) * 0.9, Math.sin(a) * r);
      cDummy.rotation.set(0, a, 0);
      cDummy.scale.set(2.1 + (i % 3) * 0.4, 0.42, 1.5 + (i % 2) * 0.35);
      cDummy.updateMatrix();
      cloudLayerUpper.setMatrixAt(i, cDummy.matrix);
    }
    for (let i = 0; i < lowerCount; i++) {
      const a = (i / lowerCount) * Math.PI * 2 + 0.3;
      const r = 34 + (i % 5) * 18;
      cDummy.position.set(Math.cos(a) * r, -7.5 - (i % 3) * 1.1, Math.sin(a) * r);
      cDummy.rotation.set(0, -a, 0);
      cDummy.scale.set(2.6 + (i % 2) * 0.5, 0.45, 1.9);
      cDummy.updateMatrix();
      cloudLayerLower.setMatrixAt(i, cDummy.matrix);
    }
    scene.add(cloudLayerUpper, cloudLayerLower);

    // Twinkling Starfield
    const starCount = 520;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = (i * 2.399963) % (Math.PI * 2);
      const phi = Math.acos(0.14 + ((i * 0.618034) % 0.84));
      const rad = 175;
      starPositions[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = rad * Math.cos(phi);
      starPositions[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starMat = new THREE.PointsMaterial({
      color: 0xf5f1e6,
      size: 0.9,
      transparent: true,
      opacity: 0.82,
      fog: false,
    });
    starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);
  }

  // Atmospheric & Action Forest VFX (spores, falling leaves, mist, dash/pulse/spiral pools)
  const forestVfx = createForestVfx(scene, isBenchMode);

  // Player Mây
  const may = buildMayMesh(glowTex);
  scene.add(may.group);

  // Pulse Wave Shockwave (Outer golden-orange ring + Inner bright ring + Floor glow)
  const pulseWaveGroup = new THREE.Group();
  const pulseWaveMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lanternLit,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pulseOuterRing = new THREE.Mesh(new THREE.RingGeometry(0.76, 1.0, 44), pulseWaveMat);
  pulseOuterRing.rotation.x = -Math.PI / 2;

  const pulseInnerMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lanternCore,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pulseInnerRing = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.6, 36), pulseInnerMat);
  pulseInnerRing.rotation.x = -Math.PI / 2;

  const pulseDiscMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: PALETTE.lanternLit,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pulseDisc = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), pulseDiscMat);
  pulseDisc.rotation.x = -Math.PI / 2;

  pulseWaveGroup.add(pulseOuterRing, pulseInnerRing, pulseDisc);
  pulseWaveGroup.visible = false;
  scene.add(pulseWaveGroup);
  let pulseWaveTime = 0;

  // ===========================================================================
  // INSTANCED MESH BATCHING FOR SHADES (up to 256) & MOTES (up to 128)
  // ===========================================================================
  const shadeBodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: PALETTE.shadeRim,
    emissiveIntensity: 0.45,
    roughness: 0.5,
  });
  const shadeBodies = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.68, 1),
    shadeBodyMat,
    MAX_SHADE_INSTANCES
  );
  shadeBodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadeBodies.frustumCulled = false;

  const shadeSkirts = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.76, 1.0, 8),
    shadeBodyMat,
    MAX_SHADE_INSTANCES
  );
  shadeSkirts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadeSkirts.frustumCulled = false;

  const shadeEyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const shadeEyes = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.125, 6, 6),
    shadeEyeMat,
    MAX_SHADE_INSTANCES * 2
  );
  shadeEyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadeEyes.frustumCulled = false;

  const shadeStunRings = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.54, 0.04, 6, 14),
    new THREE.MeshBasicMaterial({ color: PALETTE.gold }),
    MAX_SHADE_INSTANCES
  );
  shadeStunRings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadeStunRings.frustumCulled = false;

  scene.add(shadeBodies, shadeSkirts, shadeEyes, shadeStunRings);

  const moteCores = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.18, 6, 6),
    new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
    MAX_MOTE_INSTANCES
  );
  moteCores.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  moteCores.frustumCulled = false;

  const moteHalos = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.35, 1.35),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      color: PALETTE.moteHalo,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    MAX_MOTE_INSTANCES
  );
  moteHalos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  moteHalos.frustumCulled = false;

  scene.add(moteCores, moteHalos);

  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  const eyeColorNormal = new THREE.Color();
  const eyeColorGold = new THREE.Color(PALETTE.gold);
  const bodyColorNormal = new THREE.Color(PALETTE.shadeBody);
  const bodyColorStunned = new THREE.Color(PALETTE.shadeStunned);

  let currentMapGroup = null;
  let currentLandmarks = [];
  let currentNight = null;
  const lanternMeshes = new Map();
  const prevLanternState = new Map();
  const drifterMeshes = new Map();
  const charmMeshes = new Map();

  function clearMap(mapObj) {
    for (const entry of mapObj.values()) {
      scene.remove(entry.group || entry);
    }
    mapObj.clear();
  }

  function loadNightVisuals(rs) {
    currentNight = rs.night;
    if (currentMapGroup) scene.remove(currentMapGroup);
    clearMap(lanternMeshes);
    clearMap(drifterMeshes);
    clearMap(charmMeshes);
    prevLanternState.clear();

    const built = buildMapGeometry(
      rs.night,
      rs.lanterns,
      rs.jumpPads,
      rs.charms,
      windUniforms,
      isBenchMode
    );
    currentMapGroup = built.mapGroup;
    currentLandmarks = built.landmarkActors;
    scene.add(currentMapGroup);
    forestVfx.setNight(rs.night);

    for (const l of rs.lanterns) {
      const lm = buildLanternMesh(
        rs.tuning.safe_radius,
        rs.tuning.interact_radius,
        glowTex,
        tornTex,
        lightConeTex,
        isBenchMode
      );
      lm.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      scene.add(lm.group);
      lanternMeshes.set(l.id, lm);
      prevLanternState.set(l.id, { lit: l.lit, deposited: l.deposited, fuel: l.fuel });
    }

    for (const c of rs.charms) {
      const cm = buildCharmMesh();
      cm.position.set(c.pos[0], c.pos[1] + 0.9, c.pos[2]);
      scene.add(cm);
      charmMeshes.set(c.id, cm);
    }
  }

  loadNightVisuals(initialState);

  let visualTime = 0;
  let benchElapsedSec = 0;
  let dawnProgress = 0;
  const smoothCamPos = new THREE.Vector3(0, 8, -17);
  const smoothLookAt = new THREE.Vector3(0, 1.6, 0);
  const projVec = new THREE.Vector3();

  // Color anchors for Dawn Sunrise transition (when a stage is won)
  const colNightSky = new THREE.Color(PALETTE.sky);
  const colDawnSky = new THREE.Color(0x9a8ca3);
  const colNightFog = new THREE.Color(PALETTE.fog);
  const colDawnFog = new THREE.Color(0xc49582);
  const colNightAmb = new THREE.Color(0xdce6ff);
  const colDawnAmb = new THREE.Color(0xfff1d6);
  const colNightMoon = new THREE.Color(0xa4b8f0);
  const colDawnSun = new THREE.Color(0xffd088);
  const colNightSea = new THREE.Color(PALETTE.seaCloud);
  const colDawnSea = new THREE.Color(0x3a647a);
  const colCloudEmissiveNight = new THREE.Color(0x102238);
  const colCloudEmissiveDawn = new THREE.Color(0x724942);
  const colCloudLowerEmissiveNight = new THREE.Color(0x0c172b);
  const colCloudLowerEmissiveDawn = new THREE.Color(0x523945);

  function triggerPulseVisual(pos) {
    pulseWaveGroup.position.set(pos[0], pos[1] + 0.16, pos[2]);
    pulseWaveGroup.scale.set(0.45, 1, 0.45);
    pulseWaveGroup.visible = true;
    pulseWaveTime = 0.48;
    forestVfx.triggerPulseBurst(pos, reduceMotion);
  }

  function triggerHitShake() {
    if (!reduceMotion) {
      shakeTime = 0.25;
    }
  }

  function projectWorldToEdge(worldPos, refPlayerPos) {
    projVec.set(worldPos[0], worldPos[1] + 2.0, worldPos[2]);
    projVec.project(camera);
    const behind = projVec.z > 1.0;
    const nx = behind ? -projVec.x : projVec.x;
    const ny = behind ? -projVec.y : projVec.y;
    if (!behind && Math.abs(nx) <= 0.92 && Math.abs(ny) <= 0.88) {
      return null;
    }
    const angleRad = Math.atan2(ny, nx);
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;
    const rx = cx - 44;
    const ry = cy - 48;
    const sx = cx + Math.cos(angleRad) * rx;
    const sy = cy - Math.sin(angleRad) * ry;
    const cssDeg = 90 - (angleRad * 180) / Math.PI;
    return {
      x: Math.max(36, Math.min(container.clientWidth - 36, sx)),
      y: Math.max(42, Math.min(container.clientHeight - 42, sy)),
      deg: cssDeg,
      distM: Math.round(Math.hypot(worldPos[0] - refPlayerPos[0], worldPos[2] - refPlayerPos[2])),
    };
  }

  function syncAndRender(
    rs,
    camYawDeg,
    dtSec,
    { shadeAlertPos = null, isMenuShowcase = false } = {}
  ) {
    if (rs.night !== currentNight) {
      dawnProgress = 0;
      loadNightVisuals(rs);
    }
    visualTime += dtSec;
    if (isBenchMode) benchElapsedSec += dtSec;

    // Dawn / Sunrise progression when completing any night (`state === 'won'`)
    const isDawnActive = !isBenchMode && !isMenuShowcase && rs.state === 'won';
    if (isDawnActive) {
      if (reduceMotion) {
        dawnProgress = 1;
      } else {
        dawnProgress = Math.min(1, dawnProgress + dtSec * 0.42);
      }
    } else {
      dawnProgress = 0;
    }

    // 1. Camera positioning (gameplay vs elevated menu diorama vs sunrise victory panorama)
    const p = rs.player;
    if (isBenchMode) {
      const angle = (benchElapsedSec / 15.0) * Math.PI * 2;
      camera.position.set(Math.cos(angle) * 30.0, 15.0, -Math.sin(angle) * 30.0);
      camera.lookAt(0, 0, 0);
    } else {
      const theta = (camYawDeg * Math.PI) / 180;
      let camDist = 11.5;
      let camHeight = 6.2;
      let targetX = p.pos[0];
      let targetY = Math.max(-2, p.pos[1]) + 1.3;
      let targetZ = p.pos[2];
      let sideOffset = 0;

      if (isMenuShowcase) {
        // Elevated scenic orbit; shift look target camera-left so island frames cleanly on right half of Main Menu
        camDist = 17.5;
        camHeight = 7.6;
        targetX = 0;
        targetY = 1.6;
        targetZ = 0;
        sideOffset = container.clientWidth >= 980 ? 3.2 : 0;
      } else if (dawnProgress > 0) {
        // Pull back for sunrise panorama; shift subject toward open right side on wide screens
        const dEase = 1 - Math.pow(1 - dawnProgress, 2);
        camDist = 11.5 + dEase * 7.0;
        camHeight = 6.2 - dEase * 0.9;
        targetY = Math.max(-2, p.pos[1]) + 1.3 + dEase * 1.4;
        sideOffset = (container.clientWidth >= 980 ? 3.1 : 0) * dEase;
      }

      // Camera-left unit vector = (cos(theta), 0, -sin(theta)) shifts scene to right of viewport
      const shiftX = Math.cos(theta) * sideOffset;
      const shiftZ = -Math.sin(theta) * sideOffset;

      const desiredCam = new THREE.Vector3(
        targetX + shiftX - Math.sin(theta) * camDist,
        Math.max(-2, isMenuShowcase ? 0 : p.pos[1]) + camHeight,
        targetZ + shiftZ - Math.cos(theta) * camDist
      );
      const desiredTarget = new THREE.Vector3(targetX + shiftX, targetY, targetZ + shiftZ);
      const lerpFactor = 1 - Math.exp(-(isMenuShowcase ? 4.5 : 9) * dtSec);
      smoothCamPos.lerp(desiredCam, lerpFactor);
      smoothLookAt.lerp(desiredTarget, lerpFactor);

      camera.position.copy(smoothCamPos);
      if (shakeTime > 0 && !reduceMotion) {
        shakeTime = Math.max(0, shakeTime - dtSec);
        const amp = shakeTime * 1.1;
        camera.position.x += Math.sin(visualTime * 55) * amp;
        camera.position.y += Math.cos(visualTime * 62) * amp * 0.7;
      }
      camera.lookAt(smoothLookAt);
    }

    // 2. Ambient light strictly follows 0.15 + 0.55 * (lit / total) during play; warms smoothly on Dawn win
    const realLitCount = rs.lanterns.filter((l) => l.lit).length;
    const effectiveLitRatio = isMenuShowcase ? 1.0 : realLitCount / Math.max(1, rs.lanterns.length);
    const baseAmbient = 0.15 + 0.55 * effectiveLitRatio;
    const baseMoon = 0.45 + 0.45 * effectiveLitRatio;

    if (dawnProgress > 0) {
      const dawnEase = dawnProgress * dawnProgress * (3 - 2 * dawnProgress);
      ambientLight.intensity = baseAmbient + (1.18 - baseAmbient) * dawnEase;
      ambientLight.color.copy(colNightAmb).lerp(colDawnAmb, dawnEase);

      moonLight.intensity = baseMoon + (1.92 - baseMoon) * dawnEase;
      moonLight.color.copy(colNightMoon).lerp(colDawnSun, dawnEase);
      moonLight.position.set(
        -28 + (38 + 28) * dawnEase,
        46 - 18 * dawnEase,
        -20 + (96 + 20) * dawnEase
      );

      scene.background.copy(colNightSky).lerp(colDawnSky, dawnEase);
      scene.fog.color.copy(colNightFog).lerp(colDawnFog, dawnEase);
      scene.fog.density = 0.011 - dawnEase * 0.0066;

      seaPlaneMat.color.copy(colNightSea).lerp(colDawnSea, dawnEase);
      if (skyDome) skyDome.position.set(smoothLookAt.x, 0, smoothLookAt.z);
      if (skyMat) {
        skyMat.uniforms.uDawn.value = dawnEase;
        skyMat.uniforms.uSunDir.value.set(0.28, 0.08 + dawnEase * 0.22, 0.92).normalize();
      }
      if (sunGroup) {
        sunGroup.visible = true;
        sunGroup.position.set(smoothLookAt.x + 42, -16 + dawnEase * 52, smoothLookAt.z + 138);
        sunOrbMat.opacity = Math.min(1, dawnEase * 1.25);
        sunInnerHaloMat.opacity = dawnEase * 0.92;
        sunOuterHaloMat.opacity = dawnEase * 0.68;
      }
      if (moonSprite && moonMat) {
        moonMat.opacity = Math.max(0, 1 - dawnEase * 1.45);
        moonSprite.visible = moonMat.opacity > 0.02;
        moonSprite.position.set(smoothLookAt.x - 72, 88 - dawnEase * 44, smoothLookAt.z - 110);
      }
      if (starMat) {
        starField.position.set(smoothLookAt.x, 0, smoothLookAt.z);
        starMat.opacity = Math.max(0, 0.82 * (1 - dawnEase * 1.3));
        starField.visible = starMat.opacity > 0.02;
      }
      if (upperCloudMat && lowerCloudMat) {
        upperCloudMat.color.copy(colNightSea).lerp(colDawnSea, dawnEase);
        upperCloudMat.emissive.copy(colCloudEmissiveNight).lerp(colCloudEmissiveDawn, dawnEase);
        lowerCloudMat.color.copy(colNightFog).lerp(colDawnFog, dawnEase * 0.55);
        lowerCloudMat.emissive
          .copy(colCloudLowerEmissiveNight)
          .lerp(colCloudLowerEmissiveDawn, dawnEase);
      }
    } else {
      ambientLight.intensity = baseAmbient;
      ambientLight.color.copy(colNightAmb);

      moonLight.intensity = baseMoon;
      moonLight.color.copy(colNightMoon);
      moonLight.position.set(-28, 46, -20);

      scene.background.copy(colNightSky);
      scene.fog.color.copy(colNightFog);
      scene.fog.density = 0.0145 - effectiveLitRatio * 0.0055;

      seaPlaneMat.color.copy(colNightSea);
      if (skyDome) skyDome.position.set(smoothLookAt.x, 0, smoothLookAt.z);
      if (skyMat) skyMat.uniforms.uDawn.value = 0;
      if (sunGroup) sunGroup.visible = false;
      if (moonSprite && moonMat) {
        moonSprite.visible = true;
        moonMat.opacity = 1;
        moonSprite.position.set(smoothLookAt.x - 72, 88, smoothLookAt.z - 110);
      }
      if (starField && starMat) {
        starField.visible = true;
        starField.position.set(smoothLookAt.x, 0, smoothLookAt.z);
        starMat.opacity = 0.82;
      }
      if (upperCloudMat && lowerCloudMat) {
        upperCloudMat.color.copy(colNightSea);
        upperCloudMat.emissive.copy(colCloudEmissiveNight);
        lowerCloudMat.color.copy(colNightFog);
        lowerCloudMat.emissive.copy(colCloudLowerEmissiveNight);
      }
    }

    if (!reduceMotion) {
      if (cloudLayerUpper) cloudLayerUpper.rotation.y += dtSec * 0.011;
      if (cloudLayerLower) cloudLayerLower.rotation.y -= dtSec * 0.007;
      if (starField) starField.rotation.y += dtSec * 0.003;
      for (const act of currentLandmarks) {
        if (act.type === 'boat') {
          act.obj.position.y = act.baseY + Math.sin(visualTime * 1.6) * 0.1;
          act.obj.rotation.x = Math.sin(visualTime * 1.3) * 0.045;
        }
      }
    }

    // Smooth GPU canopy/grass wind sway uniforms (amplified during Night 3 gusts, zero in Reduce Motion)
    if (!isBenchMode) {
      if (reduceMotion) {
        windUniforms.uSwayAmp.value = 0;
      } else {
        windUniforms.uSwayTime.value = visualTime;
        const targetAmp =
          rs.wind && rs.wind.active ? 0.82 : rs.wind && rs.wind.warning ? 0.46 : 0.2;
        const windBlend = Math.min(1, dtSec * 3.5);
        windUniforms.uSwayAmp.value += (targetAmp - windUniforms.uSwayAmp.value) * windBlend;
        if (rs.wind && (rs.wind.active || rs.wind.warning)) {
          const rad = (rs.wind.dirDeg * Math.PI) / 180;
          windUniforms.uSwayDir.value.x += (Math.cos(rad) - windUniforms.uSwayDir.value.x) * windBlend;
          windUniforms.uSwayDir.value.y += (Math.sin(rad) - windUniforms.uSwayDir.value.y) * windBlend;
        } else {
          windUniforms.uSwayDir.value.x += (0.35 - windUniforms.uSwayDir.value.x) * windBlend;
          windUniforms.uSwayDir.value.y += (0.2 - windUniforms.uSwayDir.value.y) * windBlend;
        }
      }

      // 3. Atmospheric & Action VFX (golden spores, drifting leaves, ground mist, dash/pulse/spiral pools)
      forestVfx.update(rs, visualTime, dtSec, reduceMotion, camera, dawnProgress);
    }

    // 4. Player Mây (with fluttering scarf tails & swinging mini-lantern)
    may.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
    may.group.rotation.y = p.facingYaw;
    const speedH = Math.hypot(p.vel[0], p.vel[2]);
    if (reduceMotion) {
      may.miniPivot.rotation.x = 0;
      may.scarfTailPivot.rotation.x = 0;
    } else {
      may.miniPivot.rotation.x = Math.sin(visualTime * 6.5) * (0.08 + Math.min(0.16, speedH * 0.018));
      may.scarfTailPivot.rotation.x =
        Math.min(0.65, speedH * 0.055) + Math.sin(visualTime * 11.0) * 0.08;
    }
    may.miniLight.intensity = 2.2 + p.carried * 0.25;
    may.charmRing.visible = p.charmLeft > 0;
    if (p.charmLeft > 0 && !reduceMotion) may.charmRing.rotation.z = visualTime * 4;

    if (p.isRespawning) {
      may.group.visible = false;
    } else if (p.invulnTimer > 0 && !reduceMotion) {
      may.group.visible = Math.floor(visualTime * 16) % 2 === 0;
    } else {
      may.group.visible = true;
    }

    // 5. Pulse Shockwave
    if (pulseWaveTime > 0) {
      pulseWaveTime = Math.max(0, pulseWaveTime - dtSec);
      const prog = 1 - pulseWaveTime / 0.48;
      const easeOut = 1 - Math.pow(1 - prog, 2);
      const r = 0.45 + easeOut * rs.tuning.pulse_radius;
      pulseWaveGroup.scale.set(r, 1, r);
      const fade = 1 - prog;
      pulseWaveMat.opacity = fade * (reduceMotion ? 0.48 : 0.86);
      pulseInnerMat.opacity = fade * fade * (reduceMotion ? 0.35 : 0.75);
      pulseDiscMat.opacity = fade * fade * (reduceMotion ? 0.16 : 0.36);
      if (pulseWaveTime <= 0) pulseWaveGroup.visible = false;
    }

    // 6. Lanterns (3D fuel bar, soft light cone, breathing halo, 1 Hz low-fuel blink, unlit squashed 20% + torn paper)
    const blink1Hz = reduceMotion
      ? 0.78
      : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(visualTime * Math.PI * 2));
    const dangerHex = colorblindMode ? PALETTE.dangerColorblind : PALETTE.danger;
    for (const l of rs.lanterns) {
      const lm = lanternMeshes.get(l.id);
      if (!lm) continue;

      // Detect deposit / refuel / full lantern lighting directly from sim state for Spiral Light VFX!
      const prev = prevLanternState.get(l.id);
      if (prev && !isBenchMode) {
        if (l.lit && !prev.lit) {
          forestVfx.triggerLanternSpiral(p.pos, l.pos, true, reduceMotion);
        } else if (
          l.deposited > prev.deposited ||
          (l.lit && prev.lit && l.fuel > prev.fuel + 1.0)
        ) {
          forestVfx.triggerLanternSpiral(p.pos, l.pos, false, reduceMotion);
        }
        prev.lit = l.lit;
        prev.deposited = l.deposited;
        prev.fuel = l.fuel;
      }

      // Render-only showcase state lights up lanterns warmly on Main Menu without altering sim
      const showAsLit = l.lit || isMenuShowcase;
      const reqCost = l.requiredCost || rs.tuning.lantern_cost;
      const depRatio = Math.min(1, l.deposited / Math.max(1, reqCost));
      const fuelRatio = isMenuShowcase
        ? 1.0
        : Math.max(0, Math.min(1, l.fuel / Math.max(1, l.fuelMax || 100)));

      if (showAsLit) {
        lm.headGroup.scale.set(1, 1.0, 1);
        if (lm.coreMat.map !== null) {
          lm.coreMat.map = null;
          lm.coreMat.needsUpdate = true;
        }
        const lowBlink = !isMenuShowcase && l.isLowFuel ? blink1Hz : 1.0;
        const breathe = reduceMotion ? 0 : Math.sin(visualTime * 2.4 + l.pos[0] * 0.7) * 0.07;
        const flicker =
          (1 + (reduceMotion ? 0 : Math.sin(visualTime * 5 + l.pos[0]) * 0.045)) * lowBlink;
        lm.coreMat.color.setHex(PALETTE.lanternCore);
        lm.coreMat.emissiveIntensity = 2.15 * flicker;
        lm.light.intensity = 16.5 * flicker;
        lm.haloMat.opacity = 0.78 * flicker;
        const haloScale = 5.4 * (1 + breathe);
        lm.halo.scale.set(haloScale, haloScale, 1);
        lm.groundGlowMat.opacity = 0.4 * flicker;
        const poolScale = 1 + breathe * 0.8;
        lm.groundGlow.scale.set(poolScale, poolScale, 1);
        if (lm.lightConeMat) {
          lm.lightConeMat.opacity = 0.36 * flicker;
        }
        lm.safeRingMat.opacity = isMenuShowcase || l.isLowFuel ? 0 : 0.24;
        lm.interactRing.visible = !isBenchMode && !isMenuShowcase && !l.isFull;

        lm.fuelBarGroup.visible =
          !isBenchMode &&
          !isMenuShowcase &&
          (!l.isLowFuel || reduceMotion || Math.sin(visualTime * Math.PI * 2) > -0.35);
        if (lm.fuelBarGroup.visible) {
          lm.fuelBarGroup.quaternion.copy(camera.quaternion);
          lm.fuelFill.scale.x = Math.max(0.01, fuelRatio);
          lm.fuelFill.position.x = -(1 - Math.max(0.01, fuelRatio)) * 0.8;
          lm.fuelFillMat.color.setHex(l.isLowFuel ? dangerHex : PALETTE.lanternLit);
        }
      } else {
        lm.headGroup.scale.set(1, 0.8, 1);
        if (lm.coreMat.map !== lm.tornTex) {
          lm.coreMat.map = lm.tornTex;
          lm.coreMat.needsUpdate = true;
        }
        lm.coreMat.color.setHex(0xffffff);
        lm.coreMat.emissiveIntensity = 0.06 + depRatio * 0.75;
        lm.light.intensity = depRatio * 3.5;
        lm.haloMat.opacity = depRatio * 0.24;
        lm.groundGlowMat.opacity = depRatio * 0.12;
        if (lm.lightConeMat) {
          lm.lightConeMat.opacity = depRatio * 0.09;
        }
        lm.safeRingMat.opacity = 0;
        lm.interactRing.visible = !isBenchMode;
        lm.fuelBarGroup.visible = false;
      }
    }

    // 7. Instanced Motes
    const moteCount = Math.min(rs.motes.length, MAX_MOTE_INSTANCES);
    moteCores.count = moteCount;
    moteHalos.count = moteCount;
    for (let i = 0; i < moteCount; i++) {
      const m = rs.motes[i];
      const bob = m.pos[1] + 0.75 + Math.sin(visualTime * 3.4 + i * 1.4) * 0.2;
      dummy.position.set(m.pos[0], bob, m.pos[2]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      moteCores.setMatrixAt(i, dummy.matrix);

      dummy.quaternion.copy(camera.quaternion);
      const breath = 0.92 + Math.sin(visualTime * 4.5 + i) * 0.14;
      dummy.scale.set(breath, breath, 1);
      dummy.updateMatrix();
      moteHalos.setMatrixAt(i, dummy.matrix);
    }
    moteCores.instanceMatrix.needsUpdate = true;
    moteHalos.instanceMatrix.needsUpdate = true;

    // 8. Instanced Shades (up to 256 in 4 draw calls!)
    const rimHex = colorblindMode ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
    shadeBodyMat.emissive.setHex(rimHex);
    eyeColorNormal.setHex(rimHex);

    const shadeCount = Math.min(rs.shades.length, MAX_SHADE_INSTANCES);
    shadeBodies.count = shadeCount;
    shadeSkirts.count = shadeCount;
    shadeEyes.count = shadeCount * 2;
    let stunIdx = 0;

    for (let i = 0; i < shadeCount; i++) {
      const s = rs.shades[i];
      const hover = s.pos[1] + Math.sin(visualTime * 4 + s.pos[0]) * 0.16;
      const yaw = Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]);
      const stunned = s.state === 'stunned';
      const draining = s.state === 'drain';
      const sc = draining && !reduceMotion ? 1.08 + Math.sin(visualTime * 10) * 0.08 : 1.0;

      // Body
      dummy.position.set(s.pos[0], hover, s.pos[2]);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(sc, 1.25 * sc, sc);
      dummy.updateMatrix();
      shadeBodies.setMatrixAt(i, dummy.matrix);
      tmpColor.copy(stunned ? bodyColorStunned : bodyColorNormal);
      shadeBodies.setColorAt(i, tmpColor);

      // Billowing Ink Skirt
      const skirtSway = reduceMotion ? 0 : Math.sin(visualTime * 5.5 + i) * 0.1;
      dummy.position.set(s.pos[0], hover - 0.52 * sc, s.pos[2]);
      dummy.rotation.set(Math.PI + skirtSway, yaw + visualTime * 0.8, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      shadeSkirts.setMatrixAt(i, dummy.matrix);
      shadeSkirts.setColorAt(i, tmpColor);

      // Glowing Eyes
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const eCol = stunned ? eyeColorGold : eyeColorNormal;

      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.position.set(
        s.pos[0] + (-0.22 * cosY + 0.56 * sinY) * sc,
        hover + 0.2 * sc,
        s.pos[2] + (0.22 * sinY + 0.56 * cosY) * sc
      );
      dummy.updateMatrix();
      shadeEyes.setMatrixAt(i * 2, dummy.matrix);
      shadeEyes.setColorAt(i * 2, eCol);

      dummy.position.set(
        s.pos[0] + (0.22 * cosY + 0.56 * sinY) * sc,
        hover + 0.2 * sc,
        s.pos[2] + (-0.22 * sinY + 0.56 * cosY) * sc
      );
      dummy.updateMatrix();
      shadeEyes.setMatrixAt(i * 2 + 1, dummy.matrix);
      shadeEyes.setColorAt(i * 2 + 1, eCol);

      if (stunned) {
        dummy.position.set(s.pos[0], hover + 1.1, s.pos[2]);
        dummy.rotation.set(Math.PI / 2, 0, visualTime * 5);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        shadeStunRings.setMatrixAt(stunIdx++, dummy.matrix);
      }
    }
    shadeStunRings.count = stunIdx;
    shadeBodies.instanceMatrix.needsUpdate = true;
    shadeSkirts.instanceMatrix.needsUpdate = true;
    shadeEyes.instanceMatrix.needsUpdate = true;
    shadeStunRings.instanceMatrix.needsUpdate = true;
    if (shadeBodies.instanceColor) shadeBodies.instanceColor.needsUpdate = true;
    if (shadeSkirts.instanceColor) shadeSkirts.instanceColor.needsUpdate = true;
    if (shadeEyes.instanceColor) shadeEyes.instanceColor.needsUpdate = true;

    // 9. Drifters (Gió Lạc)
    const activeDrifters = new Set();
    for (const d of rs.drifters) {
      if (d.state === 'removed') continue;
      activeDrifters.add(d.id);
      let dm = drifterMeshes.get(d.id);
      if (!dm) {
        dm = buildDrifterMesh();
        scene.add(dm.group);
        drifterMeshes.set(d.id, dm);
      }
      dm.group.position.set(d.pos[0], d.pos[1] + Math.sin(visualTime * 5) * 0.22, d.pos[2]);
      dm.group.rotation.y =
        Math.atan2(p.pos[0] - d.pos[0], p.pos[2] - d.pos[2]) + (d.state === 'flee' ? Math.PI : 0);
      dm.tailRibbon.rotation.y = Math.sin(visualTime * 11) * 0.35;
      dm.stolenOrb.visible = d.stolen > 0;
    }
    for (const [id, dm] of drifterMeshes.entries()) {
      if (!activeDrifters.has(id)) {
        scene.remove(dm.group);
        drifterMeshes.delete(id);
      }
    }

    // 10. Charms (Bùa Gió)
    for (const c of rs.charms) {
      const cm = charmMeshes.get(c.id);
      if (!cm) continue;
      cm.visible = c.available;
      if (c.available) {
        cm.position.y = c.pos[1] + 0.95 + Math.sin(visualTime * 3.5) * 0.16;
        cm.rotation.y = visualTime * 2.2;
      }
    }

    renderer.render(scene, camera);

    if (isBenchMode) {
      return { offscreenIndicator: null, shadeIndicator: null };
    }

    let nearest = null;
    let bestDist = Infinity;
    for (const l of rs.lanterns) {
      if (l.lit) continue;
      const dist = Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = l;
      }
    }
    const offscreenIndicator = nearest ? projectWorldToEdge(nearest.pos, p.pos) : null;
    const shadeIndicator = shadeAlertPos ? projectWorldToEdge(shadeAlertPos, p.pos) : null;

    return { offscreenIndicator, shadeIndicator };
  }

  function getRendererInfo() {
    let gpu = 'WebGL2';
    try {
      const gl = renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || gpu;
      } else {
        gpu = gl.getParameter(gl.RENDERER) || gpu;
      }
    } catch {
      // ignore
    }
    return `Three.js r${THREE.REVISION} / ${gpu}`;
  }

  function handleResize() {
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', handleResize);

  return {
    syncAndRender,
    triggerPulseVisual,
    triggerHitShake,
    getRendererInfo,
    setColorblindMode(enabled) {
      colorblindMode = Boolean(enabled);
    },
    setReduceMotion(enabled) {
      reduceMotion = Boolean(enabled);
    },
    dispose() {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    },
  };
}
