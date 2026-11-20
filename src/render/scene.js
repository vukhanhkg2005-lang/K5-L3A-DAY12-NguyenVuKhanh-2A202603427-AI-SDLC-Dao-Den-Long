import * as THREE from 'three';

// Phase 2 Standard Color Palette (exact Hex)
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
  shadeStunned: 0x3a3450,
  mayCloak: 0xe8e2d0,
  mayScarf: 0xc8102e,
  gold: 0xf2c14e,
  drifter: 0x8fa3b8,
};

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

function buildMayMesh() {
  const group = new THREE.Group();

  // Cloak (#E8E2D0)
  const cloak = new THREE.Mesh(
    new THREE.ConeGeometry(0.42, 1.05, 12),
    new THREE.MeshStandardMaterial({ color: PALETTE.mayCloak, roughness: 0.78 })
  );
  cloak.position.y = 0.62;
  cloak.castShadow = true;
  group.add(cloak);

  // Scarf (#C8102E)
  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.068, 8, 16),
    new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.55 })
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.06;
  group.add(scarf);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf6dfc6, roughness: 0.7 })
  );
  head.position.y = 1.24;
  group.add(head);

  // Conical hat (Nón lá - #C9B48A sand straw)
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 0.38, 16),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.85 })
  );
  hat.position.y = 1.52;
  hat.castShadow = true;
  group.add(hat);

  // Mini lantern dangling from front brim
  const miniPivot = new THREE.Group();
  miniPivot.position.set(0, 1.35, 0.52);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6),
    new THREE.MeshBasicMaterial({ color: PALETTE.wood })
  );
  cord.position.y = -0.11;
  miniPivot.add(cord);

  const miniLanternMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternCore,
    emissive: PALETTE.lanternLit,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });
  const miniLantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 1), miniLanternMat);
  miniLantern.position.y = -0.25;
  miniPivot.add(miniLantern);

  const miniLight = new THREE.PointLight(PALETTE.lanternLit, 2.2, 10, 1.6);
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

  return { group, miniPivot, miniLight, miniLanternMat, charmRing };
}

function buildLanternMesh(safeRadius, interactRadius, glowTex) {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 1.0, 0.48, 8),
    new THREE.MeshStandardMaterial({ color: PALETTE.lanternOff, roughness: 0.9 })
  );
  base.position.y = 0.24;
  group.add(base);

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 2.35, 8),
    new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
  );
  pillar.position.y = 1.55;
  pillar.castShadow = true;
  group.add(pillar);

  const coreMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternOff,
    emissive: PALETTE.lanternLit,
    emissiveIntensity: 0.05,
    roughness: 0.35,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.48, 1.05, 8), coreMat);
  core.position.y = 3.15;
  group.add(core);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.02, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.8 })
  );
  roof.position.y = 3.96;
  group.add(roof);

  const light = new THREE.PointLight(PALETTE.lanternLit, 0, safeRadius * 2.6, 1.4);
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
  halo.scale.set(4.5, 4.5, 1);
  group.add(halo);

  const safeRingMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lanternLit,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const safeRing = new THREE.Mesh(new THREE.RingGeometry(safeRadius - 0.14, safeRadius, 48), safeRingMat);
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

  return { group, coreMat, light, haloMat, safeRingMat, interactRing };
}

function buildShadeMesh() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: PALETTE.shadeRim,
    emissiveIntensity: 0.45,
    roughness: 0.55,
    transparent: true,
    opacity: 1,
  });
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.68, 1), bodyMat);
  body.scale.set(1, 1.25, 1);
  group.add(body);

  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.74, 0.95, 8), bodyMat);
  skirt.rotation.x = Math.PI;
  skirt.position.y = -0.52;
  group.add(skirt);

  const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
  leftEye.position.set(-0.22, 0.2, 0.56);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
  rightEye.position.set(0.22, 0.2, 0.56);
  group.add(leftEye, rightEye);

  const stunRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.54, 0.04, 6, 16),
    new THREE.MeshBasicMaterial({ color: PALETTE.gold })
  );
  stunRing.rotation.x = Math.PI / 2;
  stunRing.position.y = 1.1;
  stunRing.visible = false;
  group.add(stunRing);

  return { group, bodyMat, eyeMat, stunRing };
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
  // Flowing grey-blue silk ribbon
  const mainRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.45, 1.65), mat);
  const tailRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 1.1), mat);
  tailRibbon.position.z = -1.2;
  group.add(mainRibbon, tailRibbon);

  // Stolen motes glow indicator
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
  // Gold border (#F2C14E)
  const border = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.78, 0.06),
    new THREE.MeshStandardMaterial({
      color: PALETTE.gold,
      emissive: PALETTE.gold,
      emissiveIntensity: 0.45,
    })
  );
  // Crimson talisman (#C8102E)
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
    new THREE.CylinderGeometry(pad.radius, pad.radius * 1.12, 0.16, 20),
    new THREE.MeshStandardMaterial({
      color: PALETTE.gold,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 0.65,
    })
  );
  base.position.y = 0.08;
  g.add(base);

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.7, 4),
    new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.position.y = 0.26;
  arrow.rotation.z = -Math.atan2(pad.vx, pad.vz);
  g.add(arrow);

  g.position.set(pad.pos[0], pad.pos[1], pad.pos[2]);
  return g;
}

function buildIslandDisk(radius, yTop, height, grassMat, sandMat) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, height, 48), grassMat);
  core.position.y = yTop - height / 2;
  core.receiveShadow = true;
  g.add(core);

  const rim = new THREE.Mesh(new THREE.RingGeometry(radius - 2.2, radius, 48), sandMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = yTop + 0.02;
  g.add(rim);
  return g;
}

function buildMapGeometry(night, jumpPads) {
  const mapGroup = new THREE.Group();
  const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.92 });
  const sandMat = new THREE.MeshStandardMaterial({
    color: PALETTE.sand,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x3b4847, roughness: 0.95 });

  if (night === 1) {
    // Đảo Bến: circular island R = 40m
    mapGroup.add(buildIslandDisk(40, 0, 5.0, grassMat, sandMat));
    const pier = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 0.1, 24), woodMat);
    pier.position.y = 0.01;
    mapGroup.add(pier);
  } else if (night === 2) {
    // Đảo Cau: 2 islands R=28m at A(0,0,0) and B(70,0,0) + bamboo bridge x∈[26,44], z∈[-2,2]
    const islA = buildIslandDisk(28, 0, 5.0, grassMat, sandMat);
    const islB = buildIslandDisk(28, 0, 5.0, grassMat, sandMat);
    islB.position.x = 70;
    mapGroup.add(islA, islB);

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.32, 4.0), woodMat);
    bridge.position.set(35, -0.14, 0);
    bridge.receiveShadow = true;
    mapGroup.add(bridge);

    // Decorative bamboo planks across bridge
    for (let x = 26.5; x <= 43.5; x += 1.2) {
      const plank = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.0, 6), sandMat);
      plank.rotation.x = Math.PI / 2;
      plank.position.set(x, -0.02, 0);
      mapGroup.add(plank);
    }
  } else if (night === 3) {
    // Đảo Chuông: 3 tiers + 2 ramps (30° and 150°) + Bell Tower
    mapGroup.add(buildIslandDisk(45, 0, 5.0, grassMat, sandMat));

    // Tier 1: half-annulus R=12..24m, z > 0, Y=0..3
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 24, 0, Math.PI, false);
    shape.lineTo(-12, 0);
    shape.absarc(0, 0, 12, Math.PI, 0, true);
    shape.closePath();
    const tier1Geo = new THREE.ExtrudeGeometry(shape, { depth: 3.0, bevelEnabled: false, curveSegments: 36 });
    // Rotate shape from XY plane to XZ plane (z > 0 for angle 0..PI -> rotateX(-PI/2) maps +Y to -Z, so rotateX(+PI/2) maps +Y to +Z!)
    tier1Geo.rotateX(Math.PI / 2);
    tier1Geo.translate(0, 3.0, 0);
    const tier1Mesh = new THREE.Mesh(tier1Geo, [grassMat, cliffMat]);
    tier1Mesh.receiveShadow = true;
    mapGroup.add(tier1Mesh);

    // Tier 2: disk R=8m at center, Y=0..6
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6.0, 32), grassMat);
    tier2.position.y = 3.0;
    tier2.receiveShadow = true;
    mapGroup.add(tier2);

    // 2 Ramps: width 3m along angles 30° and 150°, foot R=30 (Y=0) -> top R=24 (Y=3)
    const rampLen = Math.hypot(6.0, 3.0);
    const rampPitch = Math.atan2(3.0, 6.0);
    for (const deg of [30, 150]) {
      const rad = (deg * Math.PI) / 180;
      const midR = 27.0;
      const rampHolder = new THREE.Group();
      rampHolder.position.set(Math.cos(rad) * midR, 1.5, Math.sin(rad) * midR);
      // Local +Z points radially outward (toward R=30, Y=0), -Z points inward (toward R=24, Y=3)
      rampHolder.rotation.y = Math.atan2(Math.cos(rad), Math.sin(rad));
      const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, rampLen + 0.4), woodMat);
      rampMesh.rotation.x = rampPitch;
      rampMesh.receiveShadow = true;
      rampHolder.add(rampMesh);
      mapGroup.add(rampHolder);
    }

    // Bell Tower at center on Tier 2: cylinder R=2m, height 8m (Y=6..14)
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.0, 7.2, 16), woodMat);
    tower.position.y = 6 + 3.6;
    tower.castShadow = true;
    const bell = new THREE.Mesh(
      new THREE.ConeGeometry(0.75, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.55, roughness: 0.35 })
    );
    bell.position.y = 11.4;
    const towerRoof = new THREE.Mesh(
      new THREE.ConeGeometry(2.7, 2.0, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.7 })
    );
    towerRoof.position.y = 13.8;
    mapGroup.add(tower, bell, towerRoof);
  }

  // Jump Pads
  for (const pad of jumpPads || []) {
    mapGroup.add(buildJumpPadMesh(pad));
  }

  return mapGroup;
}

export function createSceneRenderer(container, initialState) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.014);

  const camera = new THREE.PerspectiveCamera(
    56,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.2,
    280
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Ambient Light strictly follows Phase 2 formula: 0.15 + 0.55 * (lit / total)
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

  // Sea of Clouds (#12384A) + Starfield (render-only creativity)
  const seaPlane = new THREE.Mesh(
    new THREE.CircleGeometry(220, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.seaCloud })
  );
  seaPlane.rotation.x = -Math.PI / 2;
  seaPlane.position.y = -11.5;
  scene.add(seaPlane);

  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: PALETTE.seaCloud,
    emissive: 0x0b2433,
    roughness: 1,
    transparent: true,
    opacity: 0.72,
  });
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r = 56 + (i % 4) * 14;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(6.5 + (i % 3) * 2.5, 8, 6), cloudMat);
    puff.scale.set(1.9, 0.42, 1.4);
    puff.position.set(Math.cos(a) * r, -6.5 - (i % 3) * 1.4, Math.sin(a) * r);
    cloudGroup.add(puff);
  }
  scene.add(cloudGroup);

  const starCount = 450;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = (i * 2.399963) % (Math.PI * 2);
    const phi = Math.acos(0.14 + ((i * 0.618034) % 0.85));
    const rad = 160;
    starPositions[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = rad * Math.cos(phi);
    starPositions[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starField = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xf5f1e6, size: 0.8, transparent: true, opacity: 0.75 })
  );
  scene.add(starField);

  // Night 3 Wind Leaves visual stream
  const leafCount = 80;
  const leafPositions = new Float32Array(leafCount * 3);
  for (let i = 0; i < leafCount; i++) {
    leafPositions[i * 3] = (Math.random() - 0.5) * 70;
    leafPositions[i * 3 + 1] = 1 + Math.random() * 9;
    leafPositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPositions, 3));
  const windLeaves = new THREE.Points(
    leafGeo,
    new THREE.PointsMaterial({ color: PALETTE.moteHalo, size: 0.45, transparent: true, opacity: 0.85 })
  );
  windLeaves.visible = false;
  scene.add(windLeaves);

  // Player Mây
  const may = buildMayMesh();
  scene.add(may.group);

  // Pulse Wave Ring
  const pulseWaveMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lanternLit,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const pulseWave = new THREE.Mesh(new THREE.RingGeometry(0.72, 1.0, 40), pulseWaveMat);
  pulseWave.rotation.x = -Math.PI / 2;
  pulseWave.visible = false;
  scene.add(pulseWave);
  let pulseWaveTime = 0;

  let currentMapGroup = null;
  let currentNight = null;
  const lanternMeshes = new Map();
  const moteMeshes = new Map();
  const shadeMeshes = new Map();
  const drifterMeshes = new Map();
  const charmMeshes = new Map();

  const moteCoreGeo = new THREE.SphereGeometry(0.18, 8, 8);
  const moteCoreMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteCore });

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
    clearMap(moteMeshes);
    clearMap(shadeMeshes);
    clearMap(drifterMeshes);
    clearMap(charmMeshes);

    currentMapGroup = buildMapGeometry(rs.night, rs.jumpPads);
    scene.add(currentMapGroup);

    for (const l of rs.lanterns) {
      const lm = buildLanternMesh(rs.tuning.safe_radius, rs.tuning.interact_radius, glowTex);
      lm.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      scene.add(lm.group);
      lanternMeshes.set(l.id, lm);
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
  const smoothCamPos = new THREE.Vector3(0, 7, -12);
  const smoothLookAt = new THREE.Vector3(0, 1.2, 0);
  const projVec = new THREE.Vector3();

  function triggerPulseVisual(pos) {
    pulseWave.position.set(pos[0], pos[1] + 0.25, pos[2]);
    pulseWave.scale.set(0.5, 0.5, 1);
    pulseWave.visible = true;
    pulseWaveTime = 0.4;
  }

  function syncAndRender(rs, camYawDeg, dtSec) {
    if (rs.night !== currentNight) {
      loadNightVisuals(rs);
    }
    visualTime += dtSec;

    // 1. Ambient light intensity = 0.15 + 0.55 * (lit / total)
    const litCount = rs.lanterns.filter((l) => l.lit).length;
    const litRatio = litCount / Math.max(1, rs.lanterns.length);
    ambientLight.intensity = 0.15 + 0.55 * litRatio;
    moonLight.intensity = 0.45 + 0.45 * litRatio;
    scene.fog.density = 0.015 - litRatio * 0.006;
    cloudGroup.rotation.y += dtSec * 0.01;
    starField.rotation.y += dtSec * 0.003;

    // 2. Wind leaves visual on Night 3
    if (rs.wind && (rs.wind.warning || rs.wind.active)) {
      windLeaves.visible = true;
      const rad = (rs.wind.dirDeg * Math.PI) / 180;
      const spd = rs.wind.active ? 22 : 9;
      const posAttr = leafGeo.attributes.position;
      for (let i = 0; i < leafCount; i++) {
        let lx = posAttr.getX(i) + Math.cos(rad) * spd * dtSec;
        let lz = posAttr.getZ(i) + Math.sin(rad) * spd * dtSec;
        if (lx > 40) lx -= 80;
        if (lx < -40) lx += 80;
        if (lz > 40) lz -= 80;
        if (lz < -40) lz += 80;
        posAttr.setX(i, lx);
        posAttr.setZ(i, lz);
      }
      posAttr.needsUpdate = true;
    } else {
      windLeaves.visible = false;
    }

    // 3. Player Mây
    const p = rs.player;
    may.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
    may.group.rotation.y = p.facingYaw;
    may.miniPivot.rotation.x = Math.sin(visualTime * 6.5) * 0.14;
    may.miniLight.intensity = 2.0 + p.carried * 0.25;
    may.charmRing.visible = p.charmLeft > 0;
    if (p.charmLeft > 0) may.charmRing.rotation.z = visualTime * 4;

    if (p.isRespawning) {
      may.group.visible = false;
    } else if (p.invulnTimer > 0) {
      may.group.visible = Math.floor(visualTime * 16) % 2 === 0;
    } else {
      may.group.visible = true;
    }

    // 4. Pulse Wave
    if (pulseWaveTime > 0) {
      pulseWaveTime = Math.max(0, pulseWaveTime - dtSec);
      const prog = 1 - pulseWaveTime / 0.4;
      const r = 0.5 + prog * rs.tuning.pulse_radius;
      pulseWave.scale.set(r, r, 1);
      pulseWaveMat.opacity = (1 - prog) * 0.8;
      if (pulseWaveTime <= 0) pulseWave.visible = false;
    }

    // 5. Lanterns
    for (const l of rs.lanterns) {
      const lm = lanternMeshes.get(l.id);
      if (!lm) continue;
      const ratio = Math.min(1, l.deposited / Math.max(1, rs.tuning.lantern_cost));
      if (l.lit) {
        const flicker = 1 + Math.sin(visualTime * 5 + l.pos[0]) * 0.06;
        lm.coreMat.color.setHex(PALETTE.lanternCore);
        lm.coreMat.emissiveIntensity = 2.1 * flicker;
        lm.light.intensity = 15 * flicker;
        lm.haloMat.opacity = 0.72 * flicker;
        lm.safeRingMat.opacity = 0.22;
        lm.interactRing.visible = false;
      } else {
        lm.coreMat.color.setHex(PALETTE.lanternOff);
        lm.coreMat.emissiveIntensity = 0.06 + ratio * 0.9;
        lm.light.intensity = ratio * 4.5;
        lm.haloMat.opacity = ratio * 0.28;
        lm.safeRingMat.opacity = 0;
        lm.interactRing.visible = true;
      }
    }

    // 6. Motes
    const activeMotes = new Set();
    for (const m of rs.motes) {
      activeMotes.add(m.id);
      let mm = moteMeshes.get(m.id);
      if (!mm) {
        const g = new THREE.Group();
        const core = new THREE.Mesh(moteCoreGeo, moteCoreMat);
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTex,
            color: PALETTE.moteHalo,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        halo.scale.set(1.3, 1.3, 1);
        g.add(core, halo);
        scene.add(g);
        mm = { group: g, halo, phase: (moteMeshes.size * 1.4) % (Math.PI * 2) };
        moteMeshes.set(m.id, mm);
      }
      const bob = m.pos[1] + 0.75 + Math.sin(visualTime * 3.4 + mm.phase) * 0.2;
      mm.group.position.set(m.pos[0], bob, m.pos[2]);
    }
    for (const [id, mm] of moteMeshes.entries()) {
      if (!activeMotes.has(id)) {
        scene.remove(mm.group);
        moteMeshes.delete(id);
      }
    }

    // 7. Shades (5 standard states)
    const activeShades = new Set();
    for (const s of rs.shades) {
      activeShades.add(s.id);
      let sm = shadeMeshes.get(s.id);
      if (!sm) {
        sm = buildShadeMesh();
        scene.add(sm.group);
        shadeMeshes.set(s.id, sm);
      }
      const hover = s.pos[1] + Math.sin(visualTime * 4 + s.pos[0]) * 0.14;
      sm.group.position.set(s.pos[0], hover, s.pos[2]);
      sm.group.rotation.y = Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]);

      const stunned = s.state === 'stunned';
      sm.stunRing.visible = stunned;
      sm.bodyMat.opacity = s.state === 'spawning' ? 0.45 : 1.0;
      if (stunned) {
        sm.stunRing.rotation.z = visualTime * 5;
        sm.bodyMat.color.setHex(PALETTE.shadeStunned);
        sm.bodyMat.emissive.setHex(PALETTE.shadeStunned);
        sm.eyeMat.color.setHex(PALETTE.gold);
      } else {
        sm.bodyMat.color.setHex(PALETTE.shadeBody);
        sm.bodyMat.emissive.setHex(PALETTE.shadeRim);
        sm.bodyMat.emissiveIntensity = s.state === 'chase' ? 0.75 : 0.35;
        sm.eyeMat.color.setHex(PALETTE.shadeRim);
      }
    }
    for (const [id, sm] of shadeMeshes.entries()) {
      if (!activeShades.has(id)) {
        scene.remove(sm.group);
        shadeMeshes.delete(id);
      }
    }

    // 8. Drifters (Gió Lạc)
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
      dm.group.rotation.y = Math.atan2(p.pos[0] - d.pos[0], p.pos[2] - d.pos[2]) + (d.state === 'flee' ? Math.PI : 0);
      dm.tailRibbon.rotation.y = Math.sin(visualTime * 11) * 0.35;
      dm.stolenOrb.visible = d.stolen > 0;
    }
    for (const [id, dm] of drifterMeshes.entries()) {
      if (!activeDrifters.has(id)) {
        scene.remove(dm.group);
        drifterMeshes.delete(id);
      }
    }

    // 9. Charms (Bùa Gió)
    for (const c of rs.charms) {
      const cm = charmMeshes.get(c.id);
      if (!cm) continue;
      cm.visible = c.available;
      if (c.available) {
        cm.position.y = c.pos[1] + 0.95 + Math.sin(visualTime * 3.5) * 0.16;
        cm.rotation.y = visualTime * 2.2;
      }
    }

    // 10. Third-person camera behind Mây
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 11.5;
    const camHeight = 6.2;
    const desiredCam = new THREE.Vector3(
      p.pos[0] - Math.sin(theta) * camDist,
      Math.max(-2, p.pos[1]) + camHeight,
      p.pos[2] - Math.cos(theta) * camDist
    );
    const desiredTarget = new THREE.Vector3(p.pos[0], Math.max(-2, p.pos[1]) + 1.3, p.pos[2]);
    const lerpFactor = 1 - Math.exp(-9 * dtSec);
    smoothCamPos.lerp(desiredCam, lerpFactor);
    smoothLookAt.lerp(desiredTarget, lerpFactor);
    camera.position.copy(smoothCamPos);
    camera.lookAt(smoothLookAt);

    renderer.render(scene, camera);

    // 11. Compute off-screen pointer to nearest unlit lantern
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
    let offscreenIndicator = null;
    if (nearest) {
      projVec.set(nearest.pos[0], nearest.pos[1] + 3.0, nearest.pos[2]);
      projVec.project(camera);
      const behind = projVec.z > 1.0;
      const nx = behind ? -projVec.x : projVec.x;
      const ny = behind ? -projVec.y : projVec.y;
      if (behind || Math.abs(nx) > 0.92 || Math.abs(ny) > 0.88) {
        const angleRad = Math.atan2(ny, nx);
        const cx = container.clientWidth / 2;
        const cy = container.clientHeight / 2;
        const rx = cx - 44;
        const ry = cy - 48;
        const sx = cx + Math.cos(angleRad) * rx;
        const sy = cy - Math.sin(angleRad) * ry;
        const cssDeg = 90 - (angleRad * 180) / Math.PI;
        offscreenIndicator = {
          x: Math.max(36, Math.min(container.clientWidth - 36, sx)),
          y: Math.max(42, Math.min(container.clientHeight - 42, sy)),
          deg: cssDeg,
          distM: Math.round(bestDist),
        };
      }
    }
    return { offscreenIndicator };
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
    dispose() {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    },
  };
}
