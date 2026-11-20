import contract from '../game.contract.json';
import { createSimulation, DT } from './sim/simulation.js';
import { distXZ } from './sim/math.js';
import { createSceneRenderer } from './render/scene.js';
import { createAudioEngine } from './render/audio.js';

const canvasRoot = document.getElementById('canvas-root');
const hudFlames = document.getElementById('hud-flames');
const hudMotes = document.getElementById('hud-motes');
const hudLanterns = document.getElementById('hud-lanterns');
const hudTime = document.getElementById('hud-time');
const hudScore = document.getElementById('hud-score');
const hudPulse = document.getElementById('hud-pulse');
const contextPrompt = document.getElementById('context-prompt');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayDesc = document.getElementById('overlay-desc');
const overlayStats = document.getElementById('overlay-stats');
const btnPlay = document.getElementById('btn-play');
const btnAudio = document.getElementById('btn-audio');
const btnRestartHud = document.getElementById('btn-restart-hud');

const audio = createAudioEngine();

let seedCounter = 2026;
let sim = null;
let sceneRenderer = null;
let isRunning = false;
let camYawDeg = 0;

// Input state
const keys = new Set();
let isDragging = false;
let lastPointerX = 0;

function initGame(startPlaying) {
  sim = createSimulation({
    seed: seedCounter++,
    night: 1,
    tuning: contract.tuning,
  });
  camYawDeg = 0;

  if (!sceneRenderer) {
    sceneRenderer = createSceneRenderer(canvasRoot, sim.getRenderState());
  }

  isRunning = startPlaying;
  if (startPlaying) {
    overlay.classList.add('hidden');
  }
  updateHud(sim.getRenderState());
}

function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function updateHud(rs) {
  hudFlames.textContent = rs.player.flames > 0 ? '🔥'.repeat(rs.player.flames) : '💨';
  hudMotes.textContent = `${rs.player.carried} / ${rs.tuning.carry_capacity}`;

  const litCount = rs.lanterns.filter((l) => l.lit).length;
  hudLanterns.textContent = `${litCount} / ${rs.lanterns.length}`;
  hudTime.textContent = formatTime(rs.timeLeftS);
  hudScore.textContent = String(rs.score);

  if (rs.pulseCooldownLeft > 0.05) {
    hudPulse.textContent = `${rs.pulseCooldownLeft.toFixed(1)}s`;
    hudPulse.className = 'stat-value pulse-cool';
  } else if (rs.player.carried < rs.tuning.pulse_cost) {
    hudPulse.textContent = `Cần ${rs.tuning.pulse_cost} đom đóm`;
    hudPulse.className = 'stat-value pulse-cool';
  } else {
    hudPulse.textContent = 'Sẵn sàng';
    hudPulse.className = 'stat-value pulse-ready';
  }

  // Context prompt near unlit lantern
  const nearLantern = rs.lanterns.find(
    (l) => !l.lit && distXZ(rs.player.pos, l.pos) <= rs.tuning.interact_radius
  );
  if (isRunning && nearLantern) {
    const need = rs.tuning.lantern_cost - nearLantern.deposited;
    contextPrompt.textContent =
      rs.player.carried > 0
        ? `Bấm [E] nạp đom đóm vào ${nearLantern.id} (${nearLantern.deposited}/${rs.tuning.lantern_cost})`
        : `${nearLantern.id} cần thêm ${need} đom đóm — hãy đi gom thêm!`;
    contextPrompt.classList.remove('hidden');
  } else {
    contextPrompt.classList.add('hidden');
  }
}

function showEndOverlay(rs) {
  isRunning = false;
  const won = rs.state === 'won';
  overlayTitle.textContent = won ? 'Đảo Đèn Lồng Bừng Sáng!' : 'Sương Đen Đã Nuốt Ánh Đèn...';
  if (won) {
    overlayDesc.innerHTML =
      'Mây đã thắp sáng toàn bộ <strong>5 Đèn Lồng Lớn</strong> trên Đảo Bến và xua tan màn đêm!';
  } else if (rs.endReason === 'no_flames') {
    overlayDesc.innerHTML = 'Ngọn lửa của Mây đã tắt vì bị <strong>Bóng Mực</strong> chạm quá nhiều lần.';
  } else {
    overlayDesc.innerHTML = 'Bình minh đã tới trước khi tất cả Đèn Lồng Lớn kịp thắp sáng.';
  }

  const litCount = rs.lanterns.filter((l) => l.lit).length;
  overlayStats.innerHTML = `
    <div><strong>Điểm số:</strong> ${rs.score}</div>
    <div><strong>Đèn đã thắp:</strong> ${litCount} / ${rs.lanterns.length}</div>
    <div><strong>Ngọn lửa còn lại:</strong> ${rs.player.flames}</div>
    <div><strong>Thời gian còn lại:</strong> ${formatTime(rs.timeLeftS)}</div>
  `;
  overlayStats.classList.remove('hidden');
  btnPlay.textContent = 'Chơi lại Đêm 1';
  overlay.classList.remove('hidden');
}

function handleEvents(events, rs) {
  for (const ev of events) {
    if (ev.name === 'mote_picked') {
      audio.playMotePickup(ev.data.carried);
    } else if (ev.name === 'deposit') {
      audio.playDeposit();
    } else if (ev.name === 'lantern_lit') {
      audio.playLanternLit();
    } else if (ev.name === 'pulse') {
      audio.playPulse();
      sceneRenderer.triggerPulseVisual(rs.player.pos);
    } else if (ev.name === 'player_hit') {
      audio.playHit();
    } else if (ev.name === 'game_over') {
      if (ev.data.result === 'won') audio.playWin();
      else audio.playLose();
      showEndOverlay(rs);
    }
  }
}

// Keyboard & Mouse controls
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyM') {
    const on = audio.toggle();
    btnAudio.textContent = on ? '🔊 Âm thanh (M)' : '🔇 Tắt tiếng (M)';
  }
  if (e.code === 'KeyR' && (isRunning || sim.getState() !== 'playing')) {
    audio.unlock();
    initGame(true);
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
  camYawDeg = (camYawDeg - dx * 0.35) % 360;
});

btnPlay.addEventListener('click', () => {
  audio.unlock();
  initGame(true);
});

btnRestartHud.addEventListener('click', () => {
  audio.unlock();
  initGame(true);
});

btnAudio.addEventListener('click', () => {
  const on = audio.toggle();
  btnAudio.textContent = on ? '🔊 Âm thanh (M)' : '🔇 Tắt tiếng (M)';
});

function buildLiveInput() {
  let mx = 0;
  let mz = 0;
  // W = forward (+Z at yaw=0), S = backward (-Z), A = left (+X at yaw=0), D = right (-X at yaw=0)
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx -= 1;

  return {
    move: [mx, mz],
    cam_yaw_deg: camYawDeg,
    jump: keys.has('Space'),
    interact: keys.has('KeyE') || keys.has('KeyF'),
    pulse: keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyQ'),
  };
}

// Fixed 60 Hz simulation accumulator loop
initGame(false);
let lastFrameMs = performance.now();
let accumulator = 0;

function animate(nowMs) {
  requestAnimationFrame(animate);
  const dtSec = Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;

  if (keys.has('KeyJ')) camYawDeg = (camYawDeg + 110 * dtSec) % 360;
  if (keys.has('KeyL')) camYawDeg = (camYawDeg - 110 * dtSec) % 360;

  if (isRunning && sim.getState() === 'playing') {
    accumulator += dtSec;
    while (accumulator >= DT && sim.getState() === 'playing') {
      const events = sim.step(buildLiveInput());
      accumulator -= DT;
      if (events.length > 0) {
        handleEvents(events, sim.getRenderState());
      }
    }
    updateHud(sim.getRenderState());
  }

  sceneRenderer.syncAndRender(sim.getRenderState(), camYawDeg, dtSec);
}

requestAnimationFrame(animate);
