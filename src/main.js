import contract from '../game.contract.json';
import { createSimulation, DT } from './sim/simulation.js';
import { distXZ } from './sim/math.js';
import { createSceneRenderer } from './render/scene.js';
import { createAudioEngine } from './render/audio.js';

const SETTINGS_KEY = 'ddl_settings_v2';

const NIGHT_STORIES = {
  1: {
    name: 'Đảo Bến',
    quote:
      '“Mây ơi, dầu trong Đèn Lồng đang cạn dần theo từng giây. Hãy thắp và châm dầu để giữ sáng ít nhất 3/5 ngọn đèn cho tới bình minh nhé!” — Ông Đăng',
    meta: 'Giữ sáng ≥ 3/5 Đèn tới bình minh · Thời gian 04:00 · Châm dầu trước khi đèn xuống dưới 30%!',
  },
  2: {
    name: 'Đảo Cau',
    quote:
      '“Đảo Cau rộng lắm, lại có bọn Gió Lạc rình cướp đom đóm và Bóng Mực hút dầu đèn yếu. Hãy tận dụng bục nhảy và Bùa Gió trên cầu tre!” — Ông Đăng',
    meta: 'Giữ sáng ≥ 4/6 Đèn tới bình minh · Thời gian 04:30 · Cầu tre, Bục nhảy, Gió Lạc & Bùa Gió',
  },
  3: {
    name: 'Đảo Chuông',
    quote:
      '“Đêm cuối cùng rồi! Gió mạnh sẽ thổi mỗi 30 giây, Bóng Mực cũng nhanh hơn. Giữ sáng ít nhất 5/7 Đèn Lồng tới bình minh để cứu cả quần đảo!” — Ông Đăng',
    meta: 'Giữ sáng ≥ 5/7 Đèn tới bình minh · Thời gian 05:00 · 3 tầng đảo, Dốc gỗ, Bục nhảy & Gió mạnh',
  },
};

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        volume: typeof parsed.volume === 'number' ? parsed.volume : 0.7,
        sensitivity: typeof parsed.sensitivity === 'number' ? parsed.sensitivity : 0.35,
        colorblind: Boolean(parsed.colorblind),
      };
    }
  } catch {
    // Ignore storage restriction
  }
  return { volume: 0.7, sensitivity: 0.35, colorblind: false };
}

function saveSettings(s) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Ignore storage restriction
  }
}

const settings = loadSettings();
const audio = createAudioEngine(settings.volume);

// DOM elements
const canvasRoot = document.getElementById('canvas-root');
const hud = document.getElementById('hud');
const hudNightLabel = document.getElementById('hud-night-label');
const hudFlames = document.getElementById('hud-flames');
const hudFps = document.getElementById('hud-fps');
const hudCharmPill = document.getElementById('hud-charm-pill');
const hudTime = document.getElementById('hud-time');
const hudWindPill = document.getElementById('hud-wind-pill');
const hudLanternGoal = document.getElementById('hud-lantern-goal');
const hudLanterns = document.getElementById('hud-lanterns');
const hudScore = document.getElementById('hud-score');
const hudMotesText = document.getElementById('hud-motes-text');
const hudMoteSlots = document.getElementById('hud-mote-slots');
const contextPrompt = document.getElementById('context-prompt');
const iconDash = document.getElementById('icon-dash');
const cdDash = document.getElementById('cd-dash');
const iconPulse = document.getElementById('icon-pulse');
const cdPulse = document.getElementById('cd-pulse');
const lanternArrow = document.getElementById('lantern-arrow');
const lanternArrowHead = lanternArrow.querySelector('.lantern-arrow-head');
const lanternArrowDist = document.getElementById('lantern-arrow-dist');

const screenMenu = document.getElementById('screen-menu');
const screenIntro = document.getElementById('screen-intro');
const screenPause = document.getElementById('screen-pause');
const screenSettings = document.getElementById('screen-settings');
const screenResult = document.getElementById('screen-result');
const resultCard = document.getElementById('result-card');

const introBadge = document.getElementById('intro-badge');
const introTitle = document.getElementById('intro-title');
const introQuote = document.getElementById('intro-quote');
const introMeta = document.getElementById('intro-meta');

const resultBadge = document.getElementById('result-badge');
const resultTitle = document.getElementById('result-title');
const resultDesc = document.getElementById('result-desc');
const resultStats = document.getElementById('result-stats');
const btnResultPrimary = document.getElementById('btn-result-primary');

const inputVolume = document.getElementById('input-volume');
const valVolume = document.getElementById('val-volume');
const inputSens = document.getElementById('input-sens');
const valSens = document.getElementById('val-sens');
const inputColorblind = document.getElementById('input-colorblind');
const btnMute = document.getElementById('btn-mute');

// Dynamic mote slot pool (supports 10..20 slots smoothly)
let renderedCapacity = 0;
let moteSlotEls = [];

function ensureMoteSlots(capacity) {
  if (capacity === renderedCapacity) return;
  renderedCapacity = capacity;
  hudMoteSlots.innerHTML = '';
  hudMoteSlots.classList.toggle('compact', capacity > 12);
  moteSlotEls = [];
  for (let i = 0; i < capacity; i++) {
    const el = document.createElement('div');
    el.className = 'mote-slot';
    hudMoteSlots.appendChild(el);
    moteSlotEls.push(el);
  }
}

function applyColorblindUI(enabled) {
  document.body.classList.toggle('colorblind', Boolean(enabled));
  if (sceneRenderer) sceneRenderer.setColorblindMode(Boolean(enabled));
}

// Sync settings UI
inputVolume.value = String(Math.round(settings.volume * 100));
valVolume.textContent = `${Math.round(settings.volume * 100)}%`;
inputSens.value = String(Math.round(settings.sensitivity * 100));
valSens.textContent = settings.sensitivity.toFixed(2);
inputColorblind.checked = settings.colorblind;

// Game Flow State
let currentNight = 1;
let campaignTotalScore = 0;
let seedCounter = 2026;
let mode = 'menu';
let settingsReturnMode = 'menu';
let sim = null;
let sceneRenderer = null;
let camYawDeg = 0;
let pendingPauseToggle = false;
let lastCountdownSec = -1;
let wasWindWarnOrActive = false;

const keys = new Set();
let isDragging = false;
let lastPointerX = 0;

function hideAllOverlays() {
  screenMenu.classList.add('hidden');
  screenIntro.classList.add('hidden');
  screenPause.classList.add('hidden');
  screenSettings.classList.add('hidden');
  screenResult.classList.add('hidden');
}

function showMainMenu() {
  mode = 'menu';
  hideAllOverlays();
  hud.classList.add('hidden');
  lanternArrow.classList.add('hidden');
  screenMenu.classList.remove('hidden');
}

function showNightIntro(night) {
  currentNight = night;
  mode = 'intro';
  const info = NIGHT_STORIES[night];
  introBadge.textContent = `ĐÊM ${night} · ${info.name.toUpperCase()}`;
  introTitle.textContent = `Đêm ${night}: ${info.name}`;
  introQuote.textContent = info.quote;
  introMeta.textContent = info.meta;

  sim = createSimulation({ seed: seedCounter++, night, tuning: contract.tuning });
  camYawDeg = 0;
  if (!sceneRenderer) {
    sceneRenderer = createSceneRenderer(canvasRoot, sim.getRenderState());
  }
  applyColorblindUI(settings.colorblind);

  hideAllOverlays();
  hud.classList.add('hidden');
  lanternArrow.classList.add('hidden');
  screenIntro.classList.remove('hidden');
}

function startNightPlay() {
  audio.unlock();
  mode = 'playing';
  lastCountdownSec = -1;
  wasWindWarnOrActive = false;
  pendingPauseToggle = false;
  hideAllOverlays();
  hud.classList.remove('hidden');
  updateHud(sim.getRenderState());
}

function togglePauseMenu() {
  if (mode === 'playing' || mode === 'paused') {
    pendingPauseToggle = true;
  }
}

function openSettings(fromMode) {
  settingsReturnMode = fromMode;
  hideAllOverlays();
  screenSettings.classList.remove('hidden');
}

function showResultScreen(rs) {
  mode = 'result';
  hideAllOverlays();
  lanternArrow.classList.add('hidden');
  resultCard.classList.remove('dawn-theme');

  const won = rs.state === 'won';
  const litCount = rs.lanterns.filter((l) => l.lit).length;

  if (won) {
    campaignTotalScore += rs.score;
    if (currentNight < 3) {
      resultBadge.textContent = `SỐNG SÓT ĐẾN BÌNH MINH · ĐÊM ${currentNight}`;
      resultTitle.textContent = `${rs.mapName} Đón Bình Minh!`;
      resultDesc.textContent = `Mây đã giữ sáng ${litCount}/${rs.lanterns.length} Đèn Lồng (ngưỡng ≥ ${rs.requiredLitAtDawn}) tới bình minh. Sẵn sàng tiến tới Đêm ${currentNight + 1}!`;
      btnResultPrimary.textContent = `Sang Đêm ${currentNight + 1} →`;
    } else {
      resultCard.classList.add('dawn-theme');
      resultBadge.textContent = 'BÌNH MINH ĐÃ TỚI';
      resultTitle.textContent = 'Chiến thắng cả 3 Hòn Đảo!';
      resultDesc.textContent =
        'Đảo Bến, Đảo Cau và Đảo Chuông đều rực sáng đón ánh bình minh. Biển mây đã bình yên trở lại!';
      btnResultPrimary.textContent = 'Chơi lại từ Đêm 1';
    }
  } else {
    resultBadge.textContent = `THẤT BẠI · ĐÊM ${currentNight}`;
    resultTitle.textContent =
      rs.endReason === 'no_flames' ? 'Ngọn Lửa Đã Tắt...' : 'Đảo Chìm Trong Sương Đen...';
    resultDesc.textContent =
      rs.endReason === 'no_flames'
        ? 'Mây đã mất hết Ngọn Lửa. Hãy thử lại Đêm này nhé!'
        : `Bình minh tới nhưng chỉ có ${litCount}/${rs.lanterns.length} đèn sáng (cần ít nhất ${rs.requiredLitAtDawn} đèn).`;
    btnResultPrimary.textContent = `Chơi lại Đêm ${currentNight}`;
  }

  resultStats.innerHTML = `
    <div><strong>Điểm Đêm ${currentNight}:</strong> ${rs.score}</div>
    <div><strong>Tổng điểm:</strong> ${campaignTotalScore}</div>
    <div><strong>Đèn sáng lúc bình minh:</strong> ${litCount} / ${rs.lanterns.length}</div>
    <div><strong>Ngọn lửa còn:</strong> ${rs.player.flames}</div>
  `;
  screenResult.classList.remove('hidden');
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function updateHud(rs) {
  hudNightLabel.textContent = `ĐÊM ${rs.night} · ${rs.mapName.toUpperCase()}`;
  hudFlames.textContent = rs.player.flames > 0 ? '🔥'.repeat(rs.player.flames) : '💨';

  const isDangerTime = rs.timeLeftS <= 30;
  const timeText = formatTime(rs.timeLeftS);
  hudTime.textContent = isDangerTime && settings.colorblind ? `⚠ ${timeText}` : timeText;
  hudTime.classList.toggle('danger', isDangerTime);

  const secCeil = Math.ceil(rs.timeLeftS);
  if (mode === 'playing' && secCeil <= 10 && secCeil > 0 && secCeil !== lastCountdownSec) {
    lastCountdownSec = secCeil;
    audio.playCountdownTick();
  }

  if (rs.wind.warning) {
    hudWindPill.textContent = `${settings.colorblind ? '⚠ ' : '🍃 '}Gió mạnh sắp thổi (2s)!`;
    hudWindPill.classList.remove('hidden');
  } else if (rs.wind.active) {
    hudWindPill.textContent = `${settings.colorblind ? '⚠ ' : '💨 '}Gió mạnh (${Math.round(rs.wind.dirDeg)}°)`;
    hudWindPill.classList.remove('hidden');
  } else {
    hudWindPill.classList.add('hidden');
  }
  const windAlert = rs.wind.warning || rs.wind.active;
  if (windAlert && !wasWindWarnOrActive && mode === 'playing') {
    audio.playWindWhoosh();
  }
  wasWindWarnOrActive = windAlert;

  if (rs.player.charmLeft > 0.05) {
    hudCharmPill.textContent = `🧧 Bùa Gió: ${rs.player.charmLeft.toFixed(1)}s`;
    hudCharmPill.classList.remove('hidden');
  } else {
    hudCharmPill.classList.add('hidden');
  }

  const litCount = rs.lanterns.filter((l) => l.lit).length;
  const lowCount = rs.lanterns.filter((l) => l.isLowFuel).length;
  hudLanternGoal.textContent =
    lowCount > 0
      ? `${settings.colorblind ? '⚠ ' : ''}ĐÈN YẾU: ${lowCount} (CẦN ≥ ${rs.requiredLitAtDawn})`
      : `ĐÈN LỒNG (CẦN ≥ ${rs.requiredLitAtDawn})`;
  hudLanterns.textContent = `${litCount} / ${rs.lanterns.length}`;
  hudScore.textContent = String(rs.score);

  // Dynamic capacity mote bar (10 -> 20)
  ensureMoteSlots(rs.player.capacity);
  hudMotesText.textContent = `${rs.player.carried}/${rs.player.capacity}`;
  for (let i = 0; i < moteSlotEls.length; i++) {
    moteSlotEls[i].classList.toggle('filled', i < rs.player.carried);
  }

  // Dash cooldown icon
  if (rs.player.charmLeft > 0) {
    iconDash.className = 'ability-card charm-boost';
    cdDash.textContent = 'Không hồi chiêu!';
  } else if (rs.player.dashCdLeft > 0.05) {
    iconDash.className = 'ability-card cooling';
    cdDash.textContent = `${rs.player.dashCdLeft.toFixed(1)}s`;
  } else {
    iconDash.className = 'ability-card ready';
    cdDash.textContent = 'Sẵn sàng';
  }

  // Pulse cooldown icon
  if (rs.player.pulseCdLeft > 0.05) {
    iconPulse.className = 'ability-card cooling';
    cdPulse.textContent = `${rs.player.pulseCdLeft.toFixed(1)}s`;
  } else if (rs.player.carried < rs.tuning.pulse_cost) {
    iconPulse.className = 'ability-card cooling';
    cdPulse.textContent = `Cần ${rs.tuning.pulse_cost} đom đóm`;
  } else {
    iconPulse.className = 'ability-card ready';
    cdPulse.textContent = 'Sẵn sàng';
  }

  // Context prompt: nearest eligible lantern (unlit OR lit non-full)
  let nearLantern = null;
  let bestD = Infinity;
  for (const l of rs.lanterns) {
    if (l.lit && l.isFull) continue;
    const d = distXZ(rs.player.pos, l.pos);
    if (d <= rs.tuning.interact_radius && d < bestD) {
      bestD = d;
      nearLantern = l;
    }
  }
  if (mode === 'playing' && nearLantern) {
    if (!nearLantern.lit) {
      const label = nearLantern.everLit ? 'Thắp lại đèn' : 'Nạp ánh sáng';
      contextPrompt.textContent = `E — ${label} (${nearLantern.deposited}/${nearLantern.requiredCost})`;
    } else {
      contextPrompt.textContent = `E — Châm dầu (${Math.round(nearLantern.fuel)}/100)`;
    }
    contextPrompt.classList.remove('hidden');
  } else {
    contextPrompt.classList.add('hidden');
  }
}

function handleEvents(events, rs) {
  for (const ev of events) {
    if (ev.name === 'mote_picked') audio.playMotePickup(ev.data.carried);
    else if (ev.name === 'charm_picked') audio.playCharmPickup();
    else if (ev.name === 'deposit' || ev.name === 'refuel') audio.playDeposit();
    else if (ev.name === 'lantern_lit') audio.playLanternLit();
    else if (ev.name === 'lantern_out') audio.playHit();
    else if (ev.name === 'pulse') {
      audio.playPulse();
      sceneRenderer.triggerPulseVisual(rs.player.pos);
    } else if (ev.name === 'dash') audio.playDash();
    else if (ev.name === 'player_hit') audio.playHit();
    else if (ev.name === 'shade_spawned') audio.playShadeSpawn();
    else if (ev.name === 'drifter_steal') audio.playDrifterSteal();
    else if (ev.name === 'paused') {
      mode = 'paused';
      hideAllOverlays();
      screenPause.classList.remove('hidden');
    } else if (ev.name === 'resumed') {
      mode = 'playing';
      hideAllOverlays();
    } else if (ev.name === 'game_over') {
      if (ev.data.result === 'won') audio.playWin();
      else audio.playLose();
      showResultScreen(rs);
    }
  }
}

// Button Bindings
document.getElementById('btn-start-campaign').addEventListener('click', () => {
  campaignTotalScore = 0;
  showNightIntro(1);
});

document.querySelectorAll('[data-select-night]').forEach((btn) => {
  btn.addEventListener('click', () => {
    campaignTotalScore = 0;
    showNightIntro(Number(btn.dataset.selectNight));
  });
});

document.getElementById('btn-begin-night').addEventListener('click', startNightPlay);
document.getElementById('btn-menu-settings').addEventListener('click', () => openSettings('menu'));
document.getElementById('btn-pause').addEventListener('click', togglePauseMenu);
document.getElementById('btn-resume').addEventListener('click', togglePauseMenu);
document.getElementById('btn-pause-restart').addEventListener('click', () => showNightIntro(currentNight));
document.getElementById('btn-pause-settings').addEventListener('click', () => openSettings('paused'));
document.getElementById('btn-pause-menu').addEventListener('click', showMainMenu);

document.getElementById('btn-settings-close').addEventListener('click', () => {
  saveSettings(settings);
  hideAllOverlays();
  if (settingsReturnMode === 'paused') screenPause.classList.remove('hidden');
  else screenMenu.classList.remove('hidden');
});

inputVolume.addEventListener('input', () => {
  settings.volume = Number(inputVolume.value) / 100;
  valVolume.textContent = `${inputVolume.value}%`;
  audio.setVolume(settings.volume);
});

inputSens.addEventListener('input', () => {
  settings.sensitivity = Number(inputSens.value) / 100;
  valSens.textContent = settings.sensitivity.toFixed(2);
});

inputColorblind.addEventListener('change', () => {
  settings.colorblind = inputColorblind.checked;
  applyColorblindUI(settings.colorblind);
  saveSettings(settings);
});

btnMute.addEventListener('click', () => {
  const muted = audio.toggleMute();
  btnMute.textContent = muted ? '🔇' : '🔊';
});

btnResultPrimary.addEventListener('click', () => {
  const rs = sim.getRenderState();
  if (rs.state === 'won') {
    if (currentNight < 3) {
      showNightIntro(currentNight + 1);
    } else {
      campaignTotalScore = 0;
      showNightIntro(1);
    }
  } else {
    showNightIntro(currentNight);
  }
});

document.getElementById('btn-result-menu').addEventListener('click', showMainMenu);

// Keyboard & Pointer Controls
let prevJumpKey = false;

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (mode === 'playing' || mode === 'paused') {
      e.preventDefault();
      togglePauseMenu();
    }
  } else if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    btnMute.textContent = muted ? '🔇' : '🔊';
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

canvasRoot.addEventListener('pointerdown', (e) => {
  isDragging = true;
  lastPointerX = e.clientX;
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastPointerX;
  lastPointerX = e.clientX;
  camYawDeg = (camYawDeg - dx * settings.sensitivity) % 360;
});

function buildLiveInput() {
  let mx = 0;
  let mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx -= 1;

  const jumpHeld = keys.has('Space');
  if (jumpHeld && !prevJumpKey && sim && sim.getRenderState().player.grounded && mode === 'playing') {
    audio.playJump();
  }
  prevJumpKey = jumpHeld;

  const pauseVal = pendingPauseToggle;
  pendingPauseToggle = false;

  return {
    move: [mx, mz],
    cam_yaw_deg: camYawDeg,
    jump: jumpHeld,
    interact: keys.has('KeyE'),
    pulse: keys.has('KeyQ') || keys.has('KeyF'),
    dash: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    pause: pauseVal,
  };
}

// Initial background preview scene on Menu
sim = createSimulation({ seed: seedCounter++, night: 1, tuning: contract.tuning });
sceneRenderer = createSceneRenderer(canvasRoot, sim.getRenderState());
applyColorblindUI(settings.colorblind);
ensureMoteSlots(contract.tuning.carry_capacity);

let lastFrameMs = performance.now();
let accumulator = 0;
let fpsFrames = 0;
let fpsTimer = 0;

function animate(nowMs) {
  requestAnimationFrame(animate);
  const dtSec = Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;

  fpsFrames++;
  fpsTimer += dtSec;
  if (fpsTimer >= 0.5) {
    hudFps.textContent = `${Math.round(fpsFrames / fpsTimer)} FPS`;
    fpsFrames = 0;
    fpsTimer = 0;
  }

  if (mode === 'playing') {
    if (keys.has('KeyJ')) camYawDeg = (camYawDeg + 110 * dtSec) % 360;
    if (keys.has('KeyL')) camYawDeg = (camYawDeg - 110 * dtSec) % 360;
  }

  if ((mode === 'playing' || mode === 'paused') && !sim.isFinished()) {
    accumulator += dtSec;
    while (accumulator >= DT && !sim.isFinished()) {
      const events = sim.step(buildLiveInput());
      accumulator -= DT;
      if (events.length > 0) {
        handleEvents(events, sim.getRenderState());
      }
      if (mode === 'paused') {
        accumulator = 0;
        break;
      }
    }
    updateHud(sim.getRenderState());
  }

  const rs = sim.getRenderState();
  const { offscreenIndicator } = sceneRenderer.syncAndRender(rs, camYawDeg, dtSec);
  if (mode === 'playing' && offscreenIndicator) {
    lanternArrow.classList.remove('hidden');
    lanternArrow.style.left = `${offscreenIndicator.x}px`;
    lanternArrow.style.top = `${offscreenIndicator.y}px`;
    lanternArrowHead.style.transform = `rotate(${offscreenIndicator.deg}deg)`;
    lanternArrowDist.textContent = `${offscreenIndicator.distM}m`;
  } else {
    lanternArrow.classList.add('hidden');
  }
}

requestAnimationFrame(animate);
