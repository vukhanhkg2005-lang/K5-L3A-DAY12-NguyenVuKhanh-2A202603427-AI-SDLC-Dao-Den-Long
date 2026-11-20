import * as THREE from 'three';

function createSoftGlowTexture(innerHex, outerRgba) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerHex);
  grad.addColorStop(0.45, outerRgba);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function buildMayMesh() {
  const group = new THREE.Group();

  // Body (warm indigo-teal cloak)
  const cloakGeo = new THREE.ConeGeometry(0.42, 1.05, 12);
  const cloakMat = new THREE.MeshStandardMaterial({
    color: 0x32426e,
    roughness: 0.75,
    metalness: 0.05,
  });
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  cloak.position.y = 0.62;
  cloak.castShadow = true;
  group.add(cloak);

  // Warm scarf
  const scarfGeo = new THREE.TorusGeometry(0.24, 0.065, 8, 16);
  const scarfMat = new THREE.MeshStandardMaterial({
    color: 0xe6883e,
    emissive: 0x552205,
    roughness: 0.6,
  });
  const scarf = new THREE.Mesh(scarfGeo, scarfMat);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.06;
  group.add(scarf);

  // Head
  const headGeo = new THREE.SphereGeometry(0.24, 14, 14);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf7dec5, roughness: 0.7 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.24;
  group.add(head);

  // Conical hat (Nón lá)
  const hatGeo = new THREE.ConeGeometry(0.62, 0.38, 18);
  const hatMat = new THREE.MeshStandardMaterial({
    color: 0xe2c37c,
    roughness: 0.85,
  });
  const hat = new THREE.Mesh(hatGeo, hatMat);
  hat.position.y = 1.52;
  hat.castShadow = true;
  group.add(hat);

  // Mini lantern hanging from front brim of nón lá
  const miniPivot = new THREE.Group();
  miniPivot.position.set(0, 1.35, 0.52);

  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6),
    new THREE.MeshBasicMaterial({ color: 0x997040 })
  );
  cord.position.y = -0.11;
  miniPivot.add(cord);

  const miniLanternMat = new THREE.MeshStandardMaterial({
    color: 0xffd27a,
    emissive: 0xff9b28,
    emissiveIntensity: 1.6,
    roughness: 0.3,
  });
  const miniLantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 1), miniLanternMat);
  miniLantern.position.y = -0.25;
  miniPivot.add(miniLantern);

  const miniLight = new THREE.PointLight(0xffb44c, 2.2, 10, 1.6);
  miniLight.position.y = -0.25;
  miniPivot.add(miniLight);
  group.add(miniPivot);

  // Simple feet for subtle walk bob
  const footGeo = new THREE.SphereGeometry(0.1, 8, 8);
  const footMat = new THREE.MeshStandardMaterial({ color: 0x261d29 });
  const leftFoot = new THREE.Mesh(footGeo, footMat);
  leftFoot.position.set(-0.14, 0.1, 0);
  const rightFoot = new THREE.Mesh(footGeo, footMat);
  rightFoot.position.set(0.14, 0.1, 0);
  group.add(leftFoot, rightFoot);

  return { group, miniPivot, miniLight, miniLanternMat, leftFoot, rightFoot, cloakMat };
}

function buildLanternMesh(safeRadius, interactRadius, glowTex) {
  const group = new THREE.Group();

  // Stone base pedestal
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.05, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x454058, roughness: 0.9 })
  );
  base.position.y = 0.25;
  base.receiveShadow = true;
  group.add(base);

  // Wooden pillar
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 2.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.85 })
  );
  pillar.position.y = 1.6;
  pillar.castShadow = true;
  group.add(pillar);

  // Lantern chamber
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x4a455d,
    emissive: 0xff9224,
    emissiveIntensity: 0.08,
    roughness: 0.35,
  });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.48, 1.05, 8), coreMat);
  core.position.y = 3.2;
  group.add(core);

  // Curved fairytale roof
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.05, 0.72, 8),
    new THREE.MeshStandardMaterial({ color: 0x3b2636, roughness: 0.75 })
  );
  roof.position.y = 4.02;
  group.add(roof);

  // Warm point light (off until lit)
  const light = new THREE.PointLight(0xffa73d, 0, safeRadius * 2.5, 1.4);
  light.position.y = 3.3;
  group.add(light);

  // Additive glow halo sprite
  const haloMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffb84d,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.y = 3.25;
  halo.scale.set(4.5, 4.5, 1);
  group.add(halo);

  // Safe radius ring (visible when lit)
  const safeRingGeo = new THREE.RingGeometry(safeRadius - 0.14, safeRadius, 48);
  const safeRingMat = new THREE.MeshBasicMaterial({
    color: 0xffc668,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const safeRing = new THREE.Mesh(safeRingGeo, safeRingMat);
  safeRing.rotation.x = -Math.PI / 2;
  safeRing.position.y = 0.04;
  group.add(safeRing);

  // Subtle interact ring (visible when unlit)
  const interactRing = new THREE.Mesh(
    new THREE.RingGeometry(interactRadius - 0.08, interactRadius, 36),
    new THREE.MeshBasicMaterial({
      color: 0xffd27d,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
    })
  );
  interactRing.rotation.x = -Math.PI / 2;
  interactRing.position.y = 0.03;
  group.add(interactRing);

  // Progress orbs orbiting lantern while depositing
  const orbGroup = new THREE.Group();
  orbGroup.position.y = 2.0;
  const orbs = [];
  for (let i = 0; i < 6; i++) {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd46b })
    );
    orb.visible = false;
    orbGroup.add(orb);
    orbs.push(orb);
  }
  group.add(orbGroup);

  return { group, coreMat, light, haloMat, safeRingMat, interactRing, orbGroup, orbs };
}

function buildShadeMesh() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x160a24,
    emissive: 0x3b1261,
    emissiveIntensity: 0.55,
    roughness: 0.5,
  });
  const body = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 1), bodyMat);
  body.scale.set(1, 1.25, 1);
  group.add(body);

  // Shadowy skirt tendrils
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.0, 9), bodyMat);
  skirt.rotation.x = Math.PI;
  skirt.position.y = -0.55;
  group.add(skirt);

  // Glowing violet eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe38aff });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
  leftEye.position.set(-0.22, 0.2, 0.58);
  const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
  rightEye.position.set(0.22, 0.2, 0.58);
  group.add(leftEye, rightEye);

  // Stun indicator ring (visible only when stunned)
  const stunRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.04, 6, 18),
    new THREE.MeshBasicMaterial({ color: 0xffe28a })
  );
  stunRing.rotation.x = Math.PI / 2;
  stunRing.position.y = 1.15;
  stunRing.visible = false;
  group.add(stunRing);

  return { group, bodyMat, eyeMat, stunRing };
}

export function createSceneRenderer(container, initialState) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a1c);
  scene.fog = new THREE.FogExp2(0x110d26, 0.017);

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.2,
    240
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  // Lighting (dynamically warms & brightens as lanterns are lit)
  const hemiLight = new THREE.HemisphereLight(0x524b8a, 0x161229, 0.55);
  scene.add(hemiLight);

  const moonLight = new THREE.DirectionalLight(0x9ca7e8, 0.7);
  moonLight.position.set(-24, 42, -18);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.near = 5;
  moonLight.shadow.camera.far = 120;
  const d = 46;
  moonLight.shadow.camera.left = -d;
  moonLight.shadow.camera.right = d;
  moonLight.shadow.camera.top = d;
  moonLight.shadow.camera.bottom = -d;
  scene.add(moonLight);

  const glowTex = createSoftGlowTexture('rgba(255, 240, 175, 1)', 'rgba(255, 165, 50, 0.45)');

  // Circular Island (Y = 0 top surface)
  const islandR = initialState.islandRadius;
  const islandGeo = new THREE.CylinderGeometry(islandR, islandR * 0.9, 4.5, 48);
  const islandMat = new THREE.MeshStandardMaterial({
    color: 0x252d3c,
    roughness: 0.92,
    metalness: 0.04,
  });
  const island = new THREE.Mesh(islandGeo, islandMat);
  island.position.y = -2.25;
  island.receiveShadow = true;
  scene.add(island);

  // Central stone pier circle at (0,0,0)
  const centerPlinth = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.5, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: 0x3b3850, roughness: 0.85 })
  );
  centerPlinth.position.y = 0.01;
  centerPlinth.receiveShadow = true;
  scene.add(centerPlinth);

  // Decorative rim pines & rocks (purely visual at outer rim r=38..41)
  const decorGroup = new THREE.Group();
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x1b2c36, roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x402d25, roughness: 0.95 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x343146, roughness: 0.95 });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.14;
    const r = islandR - 2.6 - (i % 3) * 0.9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (i % 2 === 0) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.3, 6), trunkMat);
      trunk.position.y = 0.65;
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.9, 7), treeMat);
      foliage.position.y = 2.4;
      tree.add(trunk, foliage);
      tree.position.set(x, 0, z);
      decorGroup.add(tree);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85 + (i % 3) * 0.25, 0), rockMat);
      rock.position.set(x, 0.35, z);
      rock.scale.y = 0.65;
      decorGroup.add(rock);
    }
  }
  scene.add(decorGroup);

  // Creative Touch: Starfield dome + Drifting Sea of Clouds below the island
  const starCount = 500;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = (i * 2.399963) % (Math.PI * 2);
    const phi = Math.acos(0.15 + ((i * 0.618034) % 0.85));
    const rad = 130;
    starPositions[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = rad * Math.cos(phi);
    starPositions[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starField = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffeacc, size: 0.75, transparent: true, opacity: 0.75 })
  );
  scene.add(starField);

  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0x2a2548,
    emissive: 0x171230,
    roughness: 1,
    transparent: true,
    opacity: 0.68,
  });
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    const r = islandR + 10 + (i % 4) * 7;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(5.5 + (i % 3) * 2.2, 10, 8), cloudMat);
    puff.scale.set(1.8, 0.45, 1.4);
    puff.position.set(Math.cos(a) * r, -3.5 - (i % 3) * 1.4, Math.sin(a) * r);
    cloudGroup.add(puff);
  }
  scene.add(cloudGroup);

  // Player Mây
  const may = buildMayMesh();
  scene.add(may.group);

  // Pulse visual wave ring
  const pulseWaveMat = new THREE.MeshBasicMaterial({
    color: 0xffcc66,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const pulseWave = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 48), pulseWaveMat);
  pulseWave.rotation.x = -Math.PI / 2;
  pulseWave.position.y = 0.15;
  pulseWave.visible = false;
  scene.add(pulseWave);
  let pulseWaveTime = 0;

  // Lantern meshes keyed by ID
  const lanternMeshes = new Map();
  for (const l of initialState.lanterns) {
    const lm = buildLanternMesh(
      initialState.tuning.safe_radius,
      initialState.tuning.interact_radius,
      glowTex
    );
    lm.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
    scene.add(lm.group);
    lanternMeshes.set(l.id, lm);
  }

  // Dynamic maps for Motes and Shades
  const moteMeshes = new Map();
  const shadeMeshes = new Map();
  const moteCoreGeo = new THREE.SphereGeometry(0.18, 10, 10);
  const moteCoreMat = new THREE.MeshBasicMaterial({ color: 0xffe488 });

  function getOrCreateMote(id) {
    if (moteMeshes.has(id)) return moteMeshes.get(id);
    const g = new THREE.Group();
    const core = new THREE.Mesh(moteCoreGeo, moteCoreMat);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffb946,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.scale.set(1.4, 1.4, 1);
    g.add(core, halo);
    scene.add(g);
    const obj = { group: g, halo, phase: (moteMeshes.size * 1.3) % (Math.PI * 2) };
    moteMeshes.set(id, obj);
    return obj;
  }

  function getOrCreateShade(id) {
    if (shadeMeshes.has(id)) return shadeMeshes.get(id);
    const sm = buildShadeMesh();
    scene.add(sm.group);
    shadeMeshes.set(id, sm);
    return sm;
  }

  let visualTime = 0;
  const smoothCamPos = new THREE.Vector3(0, 7, -12);
  const smoothLookAt = new THREE.Vector3(0, 1.2, 0);

  function triggerPulseVisual(pos) {
    pulseWave.position.set(pos[0], 0.16, pos[2]);
    pulseWave.scale.set(0.5, 0.5, 1);
    pulseWave.visible = true;
    pulseWaveTime = 0.45;
  }

  function syncAndRender(renderState, camYawDeg, dtSec) {
    visualTime += dtSec;

    // 1. Dynamic island brightness from lit lanterns
    const litCount = renderState.lanterns.filter((l) => l.lit).length;
    const litRatio = litCount / Math.max(1, renderState.lanterns.length);

    hemiLight.intensity = 0.55 + litRatio * 0.75;
    hemiLight.color.setRGB(0.32 + litRatio * 0.45, 0.3 + litRatio * 0.38, 0.54 - litRatio * 0.08);
    moonLight.intensity = 0.65 + litRatio * 0.55;
    scene.fog.density = 0.018 - litRatio * 0.008;
    scene.background.setRGB(
      0.045 + litRatio * 0.07,
      0.04 + litRatio * 0.055,
      0.11 + litRatio * 0.05
    );
    cloudGroup.rotation.y += dtSec * 0.015;
    starField.rotation.y += dtSec * 0.004;

    // 2. Player Mây
    const p = renderState.player;
    may.group.position.set(p.pos[0], p.pos[1], p.pos[2]);
    may.group.rotation.y = p.facingYaw;

    // Subtle swing on mini lantern & walk bob
    const swing = Math.sin(visualTime * 6.0) * 0.14;
    may.miniPivot.rotation.x = swing;
    may.miniLight.intensity = 2.0 + p.carried * 0.35;
    may.miniLanternMat.emissiveIntensity = 1.4 + p.carried * 0.25;

    // Invulnerability blink
    if (renderState.invulnTimer > 0) {
      may.group.visible = Math.floor(visualTime * 16) % 2 === 0;
    } else {
      may.group.visible = true;
    }

    // 3. Pulse wave visual
    if (pulseWaveTime > 0) {
      pulseWaveTime = Math.max(0, pulseWaveTime - dtSec);
      const progress = 1 - pulseWaveTime / 0.45;
      const radius = 0.6 + progress * renderState.tuning.pulse_radius;
      pulseWave.scale.set(radius, radius, 1);
      pulseWaveMat.opacity = (1 - progress) * 0.78;
      if (pulseWaveTime <= 0) pulseWave.visible = false;
    }

    // 4. Lanterns
    for (const l of renderState.lanterns) {
      const lm = lanternMeshes.get(l.id);
      if (!lm) continue;
      lm.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      const ratio = Math.min(1, l.deposited / Math.max(1, renderState.tuning.lantern_cost));
      if (l.lit) {
        const flicker = 1 + Math.sin(visualTime * 5.2 + l.pos[0]) * 0.08;
        lm.coreMat.color.setHex(0xffd782);
        lm.coreMat.emissiveIntensity = 2.2 * flicker;
        lm.light.intensity = 16 * flicker;
        lm.haloMat.opacity = 0.72 * flicker;
        lm.safeRingMat.opacity = 0.24;
        lm.interactRing.visible = false;
      } else {
        lm.coreMat.color.setHex(0x4a455d);
        lm.coreMat.emissiveIntensity = 0.08 + ratio * 0.85;
        lm.light.intensity = ratio * 4.5;
        lm.haloMat.opacity = ratio * 0.28;
        lm.safeRingMat.opacity = 0;
        lm.interactRing.visible = true;
      }
      // Show deposited motes orbiting unlit lantern
      lm.orbGroup.rotation.y = visualTime * 1.4;
      for (let i = 0; i < lm.orbs.length; i++) {
        const orb = lm.orbs[i];
        orb.visible = !l.lit && i < l.deposited;
        if (orb.visible) {
          const a = (i / Math.max(1, l.deposited)) * Math.PI * 2;
          orb.position.set(Math.cos(a) * 1.05, Math.sin(visualTime * 3 + i) * 0.16, Math.sin(a) * 1.05);
        }
      }
    }

    // 5. Motes (fireflies with breathing hover animation — display only)
    const activeMoteIds = new Set();
    for (const m of renderState.motes) {
      activeMoteIds.add(m.id);
      const mm = getOrCreateMote(m.id);
      const bob = 0.85 + Math.sin(visualTime * 3.2 + mm.phase) * 0.24;
      mm.group.position.set(m.pos[0], bob, m.pos[2]);
      const breath = 1.25 + Math.sin(visualTime * 4.5 + mm.phase) * 0.25;
      mm.halo.scale.set(breath, breath, 1);
    }
    for (const [id, mm] of moteMeshes.entries()) {
      if (!activeMoteIds.has(id)) {
        scene.remove(mm.group);
        moteMeshes.delete(id);
      }
    }

    // 6. Shades
    const activeShadeIds = new Set();
    for (const s of renderState.shades) {
      activeShadeIds.add(s.id);
      const sm = getOrCreateShade(s.id);
      const hoverY = Math.max(1.0, s.pos[1]) + Math.sin(visualTime * 4.0 + s.pos[0]) * 0.16;
      sm.group.position.set(s.pos[0], hoverY, s.pos[2]);
      // Face player
      sm.group.rotation.y = Math.atan2(p.pos[0] - s.pos[0], p.pos[2] - s.pos[2]);
      const stunned = s.state === 'stunned';
      sm.stunRing.visible = stunned;
      if (stunned) {
        sm.stunRing.rotation.z = visualTime * 5.0;
        sm.bodyMat.emissive.setHex(0x8864b8);
        sm.eyeMat.color.setHex(0xffe08a);
      } else {
        sm.bodyMat.emissive.setHex(0x3b1261);
        sm.eyeMat.color.setHex(0xe38aff);
      }
    }
    for (const [id, sm] of shadeMeshes.entries()) {
      if (!activeShadeIds.has(id)) {
        scene.remove(sm.group);
        shadeMeshes.delete(id);
      }
    }

    // 7. Smooth 3rd-person camera behind Mây aligned with camYawDeg
    // Forward direction at camYawDeg is (+sin(theta), +cos(theta)), so camera sits at (-sin, -cos)
    const theta = (camYawDeg * Math.PI) / 180;
    const camDist = 11.5;
    const camHeight = 6.2;
    const desiredCam = new THREE.Vector3(
      p.pos[0] - Math.sin(theta) * camDist,
      p.pos[1] + camHeight,
      p.pos[2] - Math.cos(theta) * camDist
    );
    const desiredTarget = new THREE.Vector3(p.pos[0], p.pos[1] + 1.35, p.pos[2]);

    const lerpFactor = 1 - Math.exp(-9 * dtSec);
    smoothCamPos.lerp(desiredCam, lerpFactor);
    smoothLookAt.lerp(desiredTarget, lerpFactor);
    camera.position.copy(smoothCamPos);
    camera.lookAt(smoothLookAt);

    renderer.render(scene, camera);
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
