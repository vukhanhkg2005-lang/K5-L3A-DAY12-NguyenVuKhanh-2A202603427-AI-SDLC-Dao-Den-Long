import contract from '../game.contract.json';
import { createSimulation, DT } from './sim/simulation.js';
import { createBenchSimulation } from './sim/benchMode.js';
import { distXZ } from './sim/math.js';
import { createSceneRenderer } from './render/scene.js';
import { createAudioEngine } from './render/audio.js';

const SETTINGS_KEY = 'ddl_settings_v4';
const LB_FALLBACK_KEY = 'ddl_leaderboard_fallback';
const NAME_REGEX = /^[\p{L}\p{N}_]{3,12}$/u;

const DEFAULT_KEYBINDS = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'Escape',
};

const KEYBIND_LABELS = {
  moveForward: 'Đi tới',
  moveBackward: 'Đi lùi',
  moveLeft: 'Sang trái',
  moveRight: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt',
  interact: 'Tương tác',
  pulse: 'Tỏa Sáng',
  pause: 'Tạm dừng',
};

function formatKeyCode(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  return code;
}

function formatIsoWithTz(date = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const tzOffsetMin = -date.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(tzOffsetMin / 60)}:${pad(tzOffsetMin % 60)}`
  );
}

// =============================================================================
// CONTRACT v1.3 BENCHMARK MODE (?bench=1&seed=42&duration=30)
// =============================================================================
const params = new URLSearchParams(window.location.search);
if (params.get('bench') === '1') {
  runBenchmarkMode({
    seed: Number(params.get('seed')) || 42,
    durationSec: Number(params.get('duration')) || 30,
  });
} else {
  runInteractiveGame();
}

function runBenchmarkMode({ seed, durationSec }) {
  // Hide all menus/HUD during benchmark so standard 3D scene runs cleanly
  for (const id of [
    'hud',
    'screen-menu',
    'screen-leaderboard',
    'screen-intro',
    'screen-pause',
    'screen-settings',
    'screen-result',
    'lantern-arrow',
    'shade-arrow',
    'hit-flash',
  ]) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  const canvasRoot = document.getElementById('canvas-root');
  const benchSim = createBenchSimulation({ seed, tuning: contract.tuning });
  const renderer = createSceneRenderer(canvasRoot, benchSim.getRenderState(), {
    isBenchMode: true,
  });

  // Render first frame & report load complete
  renderer.syncAndRender(benchSim.getRenderState(), 0, 0);
  fetch('/__bench_loaded', { method: 'POST' }).catch(() => {});

  const WARMUP_MS = 3000;
  const MEASURE_MS = durationSec * 1000;
  const startMs = performance.now();
  let lastMs = startMs;
  let accumulator = 0;
  let measuring = false;
  let measureStartMs = 0;
  const frameDts = [];

  function benchLoop(nowMs) {
    const dtMs = Math.max(0.01, nowMs - lastMs);
    lastMs = nowMs;
    const dtSec = Math.min(0.1, dtMs / 1000);

    accumulator += dtSec;
    while (accumulator >= DT) {
      benchSim.step();
      accumulator -= DT;
    }

    renderer.syncAndRender(benchSim.getRenderState(), 0, dtSec);

    if (!measuring) {
      if (nowMs - startMs >= WARMUP_MS) {
        measuring = true;
        measureStartMs = nowMs;
      }
    } else {
      frameDts.push(dtMs);
      if (nowMs - measureStartMs >= MEASURE_MS) {
        const n = frameDts.length;
        const totalMs = frameDts.reduce((a, b) => a + b, 0);
        const avgFps = Math.round(((1000 * n) / Math.max(1, totalMs)) * 10) / 10;

        const sortedDesc = [...frameDts].sort((a, b) => b - a);
        const k = Math.max(1, Math.ceil(0.01 * n));
        const topKAvg = sortedDesc.slice(0, k).reduce((a, b) => a + b, 0) / k;
        const p1LowFps = Math.round((1000 / Math.max(0.01, topKAvg)) * 10) / 10;

        const sortedAsc = [...frameDts].sort((a, b) => a - b);
        const p95Idx = Math.min(n - 1, Math.ceil(0.95 * n) - 1);
        const frameMsP95 = Math.round(sortedAsc[p95Idx] * 100) / 100;

        fetch('/__bench_done', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frames: n,
            avg_fps: avgFps,
            p1_low_fps: p1LowFps,
            frame_ms_p95: frameMsP95,
            renderer: renderer.getRendererInfo(),
          }),
        }).catch(() => {});
        return;
      }
    }

    requestAnimationFrame(benchLoop);
  }

  requestAnimationFrame(benchLoop);
}

// =============================================================================
// INTERACTIVE 3D GAME MODE
// =============================================================================
function runInteractiveGame() {
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
          reduceMotion: Boolean(parsed.reduceMotion),
          largeText: Boolean(parsed.largeText),
          keybinds: { ...DEFAULT_KEYBINDS, ...(parsed.keybinds || {}) },
        };
      }
    } catch {
      // Ignore storage error
    }
    return {
      volume: 0.7,
      sensitivity: 0.35,
      colorblind: false,
      reduceMotion: false,
      largeText: false,
      keybinds: { ...DEFAULT_KEYBINDS },
    };
  }

  function saveSettings(s) {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      // Ignore
    }
  }

  async function fetchLeaderboard() {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data.entries) ? data.entries : [];
      }
    } catch {
      // Fallback to localStorage when opened via vite preview
    }
    try {
      const raw = window.localStorage.getItem(LB_FALLBACK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async function submitLeaderboardEntry(entry) {
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Không thể lưu điểm');
    } catch (err) {
      if (err.message && !err.message.includes('fetch')) throw err;
      // Static preview fallback
      const list = await fetchLeaderboard();
      list.push(entry);
      list.sort((a, b) => b.score - a.score || Date.parse(a.achieved_at) - Date.parse(b.achieved_at));
      const trimmed = list.slice(0, 10);
      try {
        window.localStorage.setItem(LB_FALLBACK_KEY, JSON.stringify(trimmed));
      } catch {
        // ignore
      }
      return { entries: trimmed };
    }
  }

  const settings = loadSettings();
  const audio = createAudioEngine(settings.volume);

  // DOM refs
  const canvasRoot = document.getElementById('canvas-root');
  const hitFlash = document.getElementById('hit-flash');
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
  const hudControlsMini = document.getElementById('hud-controls-mini');
  const visualSubtitles = document.getElementById('visual-subtitles');
  const contextPrompt = document.getElementById('context-prompt');
  const iconDash = document.getElementById('icon-dash');
  const cdDash = document.getElementById('cd-dash');
  const keyLabelDash = document.getElementById('key-label-dash');
  const iconPulse = document.getElementById('icon-pulse');
  const cdPulse = document.getElementById('cd-pulse');
  const keyLabelPulse = document.getElementById('key-label-pulse');

  const lanternArrow = document.getElementById('lantern-arrow');
  const lanternArrowHead = lanternArrow.querySelector('.edge-arrow-head');
  const lanternArrowDist = document.getElementById('lantern-arrow-dist');
  const shadeArrow = document.getElementById('shade-arrow');
  const shadeArrowHead = shadeArrow.querySelector('.edge-arrow-head');
  const shadeArrowDist = document.getElementById('shade-arrow-dist');

  const screenMenu = document.getElementById('screen-menu');
  const screenLeaderboard = document.getElementById('screen-leaderboard');
  const leaderboardTableWrap = document.getElementById('leaderboard-table-wrap');
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
  const scoreSubmitBox = document.getElementById('score-submit-box');
  const inputPlayerName = document.getElementById('input-player-name');
  const btnSaveScore = document.getElementById('btn-save-score');
  const scoreSubmitMsg = document.getElementById('score-submit-msg');
  const btnResultPrimary = document.getElementById('btn-result-primary');

  const inputVolume = document.getElementById('input-volume');
  const valVolume = document.getElementById('val-volume');
  const inputSens = document.getElementById('input-sens');
  const valSens = document.getElementById('val-sens');
  const inputColorblind = document.getElementById('input-colorblind');
  const inputReduceMotion = document.getElementById('input-reduce-motion');
  const inputLargeText = document.getElementById('input-large-text');
  const keybindsGrid = document.getElementById('keybinds-grid');
  const keybindWarning = document.getElementById('keybind-warning');
  const btnMute = document.getElementById('btn-mute');

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

  // Visual Subtitles queue (Accessibility)
  const activeSubtitles = [];
  function pushSubtitle(text, kind = 'info', ttlSec = 3.0) {
    const existing = activeSubtitles.find((s) => s.text === text);
    if (existing) {
      existing.ttl = ttlSec;
      return;
    }
    activeSubtitles.push({ text, kind, ttl: ttlSec });
    if (activeSubtitles.length > 3) activeSubtitles.shift();
    renderSubtitles();
  }

  function renderSubtitles() {
    visualSubtitles.innerHTML = '';
    for (const s of activeSubtitles) {
      const div = document.createElement('div');
      div.className = `subtitle-item ${s.kind}`;
      div.textContent = settings.colorblind && s.kind === 'danger' ? `⚠ ${s.text}` : s.text;
      visualSubtitles.appendChild(div);
    }
  }

  // Key Rebinding UI + Conflict Detection
  let listeningAction = null;

  function refreshControlLabels() {
    const kb = settings.keybinds;
    keyLabelDash.textContent = formatKeyCode(kb.dash);
    keyLabelPulse.textContent = formatKeyCode(kb.pulse);
    hudControlsMini.innerHTML = `
      <span><kbd>${formatKeyCode(kb.moveForward)}${formatKeyCode(kb.moveLeft)}${formatKeyCode(kb.moveBackward)}${formatKeyCode(kb.moveRight)}</kbd> Đi</span>
      <span><kbd>${formatKeyCode(kb.jump)}</kbd> Nhảy</span>
      <span><kbd>${formatKeyCode(kb.dash)}</kbd> Lướt</span>
      <span><kbd>${formatKeyCode(kb.interact)}</kbd> Nạp</span>
      <span><kbd>${formatKeyCode(kb.pulse)}</kbd> Tỏa Sáng</span>
      <span><kbd>${formatKeyCode(kb.pause)}</kbd> Dừng</span>
    `;
  }

  function findKeyConflicts() {
    const byCode = new Map();
    const conflicted = new Set();
    for (const [act, code] of Object.entries(settings.keybinds)) {
      if (byCode.has(code)) {
        conflicted.add(act);
        conflicted.add(byCode.get(code));
      } else {
        byCode.set(code, act);
      }
    }
    return conflicted;
  }

  function renderKeybindsUI() {
    keybindsGrid.innerHTML = '';
    const conflicts = findKeyConflicts();
    for (const action of Object.keys(DEFAULT_KEYBINDS)) {
      const item = document.createElement('div');
      item.className = `keybind-item${conflicts.has(action) ? ' conflict' : ''}`;
      const label = document.createElement('div');
      label.className = 'keybind-label';
      label.textContent = KEYBIND_LABELS[action];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `keybind-btn${listeningAction === action ? ' listening' : ''}`;
      btn.textContent =
        listeningAction === action ? 'Nhấn phím...' : formatKeyCode(settings.keybinds[action]);
      btn.addEventListener('click', () => {
        listeningAction = action;
        keybindWarning.classList.add('hidden');
        renderKeybindsUI();
      });
      item.append(label, btn);
      keybindsGrid.appendChild(item);
    }
    refreshControlLabels();
  }

  function applyAccessibilityUI() {
    document.body.classList.toggle('colorblind', settings.colorblind);
    document.body.classList.toggle('reduce-motion', settings.reduceMotion);
    document.body.classList.toggle('large-text', settings.largeText);
    if (sceneRenderer) {
      sceneRenderer.setColorblindMode(settings.colorblind);
      sceneRenderer.setReduceMotion(settings.reduceMotion);
    }
  }

  // Sync settings controls
  inputVolume.value = String(Math.round(settings.volume * 100));
  valVolume.textContent = `${Math.round(settings.volume * 100)}%`;
  inputSens.value = String(Math.round(settings.sensitivity * 100));
  valSens.textContent = settings.sensitivity.toFixed(2);
  inputColorblind.checked = settings.colorblind;
  inputReduceMotion.checked = settings.reduceMotion;
  inputLargeText.checked = settings.largeText;

  // Game Flow State
  let currentNight = 1;
  let campaignTotalScore = 0;
  let campaignNightsWon = 0;
  let campaignSeed = 2026;
  let seedCounter = 2026;
  let mode = 'menu';
  let settingsReturnMode = 'menu';
  let sim = null;
  let sceneRenderer = null;
  let camYawDeg = 0;
  let pendingPauseToggle = false;
  let lastCountdownSec = -1;
  let wasWindWarnOrActive = false;
  let warnedLowLanterns = new Set();
  let shadeAlertPos = null;
  let shadeAlertTimer = 0;
  let hitFlashTimer = 0;
  let scoreSavedForRun = false;

  const keys = new Set();
  let isDragging = false;
  let lastPointerX = 0;

  function hideAllOverlays() {
    screenMenu.classList.add('hidden');
    screenLeaderboard.classList.add('hidden');
    screenIntro.classList.add('hidden');
    screenPause.classList.add('hidden');
    screenSettings.classList.add('hidden');
    screenResult.classList.add('hidden');
    screenResult.classList.remove('dawn-overlay');
  }

  function showMainMenu() {
    mode = 'menu';
    listeningAction = null;
    hideAllOverlays();
    hud.classList.add('hidden');
    lanternArrow.classList.add('hidden');
    shadeArrow.classList.add('hidden');
    // Reset background showcase to serene illuminated Night 1 diorama
    sim = createSimulation({ seed: seedCounter++, night: 1, tuning: contract.tuning });
    camYawDeg = 18;
    screenMenu.classList.remove('hidden');
  }

  async function showLeaderboardScreen() {
    hideAllOverlays();
    screenLeaderboard.classList.remove('hidden');
    leaderboardTableWrap.innerHTML = '<p>Đang tải bảng xếp hạng...</p>';
    const entries = await fetchLeaderboard();
    if (entries.length === 0) {
      leaderboardTableWrap.innerHTML = '<p>Chưa có kỷ lục nào. Hãy chơi để lưu điểm đầu tiên!</p>';
      return;
    }
    const rows = entries
      .map(
        (e, i) => `
      <tr>
        <td>#${i + 1}</td>
        <td><strong>${e.name}</strong></td>
        <td class="gold"><strong>${e.score}</strong></td>
        <td>${e.nights_won}/3</td>
        <td>${(e.achieved_at || '').slice(0, 10)}</td>
      </tr>`
      )
      .join('');
    leaderboardTableWrap.innerHTML = `
      <table class="lb-table">
        <thead>
          <tr><th>Hạng</th><th>Tên</th><th>Điểm</th><th>Đêm thắng</th><th>Ngày</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function showNightIntro(night) {
    currentNight = night;
    mode = 'intro';
    const info = NIGHT_STORIES[night];
    introBadge.textContent = `ĐÊM ${night} · ${info.name.toUpperCase()}`;
    introTitle.textContent = `Đêm ${night}: ${info.name}`;
    introQuote.textContent = info.quote;
    introMeta.textContent = info.meta;

    const runSeed = seedCounter++;
    if (night === 1 && campaignNightsWon === 0) campaignSeed = runSeed;
    sim = createSimulation({ seed: runSeed, night, tuning: contract.tuning });
    camYawDeg = 0;
    if (!sceneRenderer) {
      sceneRenderer = createSceneRenderer(canvasRoot, sim.getRenderState());
    }
    applyAccessibilityUI();

    hideAllOverlays();
    hud.classList.add('hidden');
    lanternArrow.classList.add('hidden');
    shadeArrow.classList.add('hidden');
    screenIntro.classList.remove('hidden');
  }

  function startNightPlay() {
    audio.unlock();
    mode = 'playing';
    lastCountdownSec = -1;
    wasWindWarnOrActive = false;
    warnedLowLanterns.clear();
    activeSubtitles.length = 0;
    renderSubtitles();
    shadeAlertPos = null;
    shadeAlertTimer = 0;
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
    listeningAction = null;
    keybindWarning.classList.add('hidden');
    renderKeybindsUI();
    hideAllOverlays();
    screenSettings.classList.remove('hidden');
  }

  function showResultScreen(rs) {
    mode = 'result';
    hideAllOverlays();
    lanternArrow.classList.add('hidden');
    shadeArrow.classList.add('hidden');
    resultCard.classList.remove('dawn-theme');

    const won = rs.state === 'won';
    const litCount = rs.lanterns.filter((l) => l.lit).length;
    scoreSavedForRun = false;
    inputPlayerName.value = '';
    scoreSubmitMsg.textContent = '';
    scoreSubmitMsg.className = 'score-submit-msg';
    btnSaveScore.disabled = false;

    if (won) {
      campaignTotalScore += rs.score;
      campaignNightsWon = Math.min(3, campaignNightsWon + 1);
      // Light up warm 3D Dawn Sky & translucent golden overlay whenever a stage is won!
      resultCard.classList.add('dawn-theme');
      screenResult.classList.add('dawn-overlay');
      if (currentNight < 3) {
        resultBadge.textContent = `SỐNG SÓT ĐẾN BÌNH MINH · ĐÊM ${currentNight}`;
        resultTitle.textContent = `${rs.mapName} Đón Bình Minh!`;
        resultDesc.textContent = `Mây đã giữ sáng ${litCount}/${rs.lanterns.length} Đèn Lồng (ngưỡng ≥ ${rs.requiredLitAtDawn}) tới bình minh.`;
        btnResultPrimary.textContent = `Sang Đêm ${currentNight + 1} →`;
        scoreSubmitBox.classList.add('hidden');
      } else {
        resultBadge.textContent = 'BÌNH MINH ĐÃ TỚI';
        resultTitle.textContent = 'Chiến thắng cả 3 Hòn Đảo!';
        resultDesc.textContent =
          'Đảo Bến, Đảo Cau và Đảo Chuông đều rực sáng đón bình minh mới!';
        btnResultPrimary.textContent = 'Chơi lại từ Đêm 1';
        scoreSubmitBox.classList.remove('hidden');
      }
    } else {
      resultBadge.textContent = `THẤT BẠI · ĐÊM ${currentNight}`;
      resultTitle.textContent =
        rs.endReason === 'no_flames' ? 'Ngọn Lửa Đã Tắt...' : 'Đảo Chìm Trong Sương Đen...';
      resultDesc.textContent =
        rs.endReason === 'no_flames'
          ? 'Mây đã mất hết Ngọn Lửa. Hãy thử lại Đêm này nhé!'
          : `Bình minh tới nhưng chỉ có ${litCount}/${rs.lanterns.length} đèn sáng (cần ≥ ${rs.requiredLitAtDawn}).`;
      btnResultPrimary.textContent = `Chơi lại Đêm ${currentNight}`;
      // Allow saving leaderboard entry on any loss as well (Contract v1.3)
      scoreSubmitBox.classList.remove('hidden');
    }

    resultStats.innerHTML = `
      <div><strong>Điểm Đêm ${currentNight}:</strong> ${rs.score}</div>
      <div><strong>Tổng điểm:</strong> ${campaignTotalScore}</div>
      <div><strong>Đèn sáng lúc bình minh:</strong> ${litCount} / ${rs.lanterns.length}</div>
      <div><strong>Đêm đã thắng:</strong> ${campaignNightsWon} / 3</div>
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
      pushSubtitle(`Còn ${secCeil} giây tới bình minh!`, 'danger', 1.2);
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
      pushSubtitle('Gió mạnh sắp thổi!', 'info', 3.0);
    }
    wasWindWarnOrActive = windAlert;

    if (rs.player.charmLeft > 0.05) {
      hudCharmPill.textContent = `🧧 Bùa Gió: ${rs.player.charmLeft.toFixed(1)}s`;
      hudCharmPill.classList.remove('hidden');
    } else {
      hudCharmPill.classList.add('hidden');
    }

    // Visual alert when any lantern drops below fuel < 30
    const litCount = rs.lanterns.filter((l) => l.lit).length;
    let lowCount = 0;
    for (const l of rs.lanterns) {
      if (l.isLowFuel) {
        lowCount++;
        if (mode === 'playing' && !warnedLowLanterns.has(l.id)) {
          warnedLowLanterns.add(l.id);
          pushSubtitle(`Đèn ${l.id} sắp cạn dầu (< 30%)!`, 'danger', 3.2);
        }
      } else {
        warnedLowLanterns.delete(l.id);
      }
    }

    hudLanternGoal.textContent =
      lowCount > 0
        ? `${settings.colorblind ? '⚠ ' : ''}ĐÈN YẾU: ${lowCount} (CẦN ≥ ${rs.requiredLitAtDawn})`
        : `ĐÈN LỒNG (CẦN ≥ ${rs.requiredLitAtDawn})`;
    hudLanterns.textContent = `${litCount} / ${rs.lanterns.length}`;
    hudScore.textContent = String(rs.score);

    ensureMoteSlots(rs.player.capacity);
    hudMotesText.textContent = `${rs.player.carried}/${rs.player.capacity}`;
    for (let i = 0; i < moteSlotEls.length; i++) {
      moteSlotEls[i].classList.toggle('filled', i < rs.player.carried);
    }

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

    if (rs.player.pulseCdLeft > 0.05) {
      iconPulse.className = 'ability-card cooling';
      cdPulse.textContent = `${rs.player.pulseCdLeft.toFixed(1)}s`;
    } else if (rs.player.carried < rs.tuning.pulse_cost) {
      iconPulse.className = 'ability-card cooling';
      cdPulse.textContent = `Cần ${rs.tuning.pulse_cost}`;
    } else {
      iconPulse.className = 'ability-card ready';
      cdPulse.textContent = 'Sẵn sàng';
    }

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
      const k = formatKeyCode(settings.keybinds.interact);
      if (!nearLantern.lit) {
        const label = nearLantern.everLit ? 'Thắp lại đèn' : 'Nạp ánh sáng';
        contextPrompt.textContent = `${k} — ${label} (${nearLantern.deposited}/${nearLantern.requiredCost})`;
      } else {
        contextPrompt.textContent = `${k} — Châm dầu (${Math.round(nearLantern.fuel)}/100)`;
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
      else if (ev.name === 'lantern_out') {
        audio.playHit();
        pushSubtitle(`Đèn ${ev.data.lantern_id} đã cạn dầu và tắt!`, 'danger', 3.5);
      } else if (ev.name === 'pulse') {
        audio.playPulse();
        sceneRenderer.triggerPulseVisual(rs.player.pos);
      } else if (ev.name === 'dash') audio.playDash();
      else if (ev.name === 'player_hit') {
        audio.playHit();
        sceneRenderer.triggerHitShake();
        if (!settings.reduceMotion) {
          hitFlash.classList.remove('hidden');
          hitFlashTimer = 0.22;
        }
      } else if (ev.name === 'shade_spawned') {
        audio.playShadeSpawn();
        const spawned = rs.shades.find((s) => s.id === ev.data.id);
        if (spawned) {
          shadeAlertPos = [...spawned.pos];
          shadeAlertTimer = 3.5;
        }
        pushSubtitle(`Bóng Mực ${ev.data.id} xuất hiện!`, 'shade', 3.5);
      } else if (ev.name === 'drifter_steal') {
        audio.playDrifterSteal();
        pushSubtitle(`Gió Lạc đã cướp ${ev.data.amount} đom đóm!`, 'info', 2.8);
      } else if (ev.name === 'paused') {
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
    campaignNightsWon = 0;
    showNightIntro(1);
  });

  document.querySelectorAll('[data-select-night]').forEach((btn) => {
    btn.addEventListener('click', () => {
      campaignTotalScore = 0;
      campaignNightsWon = 0;
      showNightIntro(Number(btn.dataset.selectNight));
    });
  });

  document.getElementById('btn-menu-leaderboard').addEventListener('click', showLeaderboardScreen);
  document.getElementById('btn-leaderboard-close').addEventListener('click', showMainMenu);
  document.getElementById('btn-begin-night').addEventListener('click', startNightPlay);
  document.getElementById('btn-menu-settings').addEventListener('click', () => openSettings('menu'));
  document.getElementById('btn-pause').addEventListener('click', togglePauseMenu);
  document.getElementById('btn-resume').addEventListener('click', togglePauseMenu);
  document.getElementById('btn-pause-restart').addEventListener('click', () => showNightIntro(currentNight));
  document.getElementById('btn-pause-settings').addEventListener('click', () => openSettings('paused'));
  document.getElementById('btn-pause-menu').addEventListener('click', showMainMenu);

  document.getElementById('btn-reset-keys').addEventListener('click', () => {
    settings.keybinds = { ...DEFAULT_KEYBINDS };
    listeningAction = null;
    keybindWarning.classList.add('hidden');
    saveSettings(settings);
    renderKeybindsUI();
  });

  document.getElementById('btn-settings-close').addEventListener('click', () => {
    listeningAction = null;
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
    applyAccessibilityUI();
    saveSettings(settings);
  });

  inputReduceMotion.addEventListener('change', () => {
    settings.reduceMotion = inputReduceMotion.checked;
    applyAccessibilityUI();
    saveSettings(settings);
  });

  inputLargeText.addEventListener('change', () => {
    settings.largeText = inputLargeText.checked;
    applyAccessibilityUI();
    saveSettings(settings);
  });

  btnMute.addEventListener('click', () => {
    const muted = audio.toggleMute();
    btnMute.textContent = muted ? '🔇' : '🔊';
  });

  btnSaveScore.addEventListener('click', async () => {
    if (scoreSavedForRun) return;
    const name = inputPlayerName.value.trim();
    if (!NAME_REGEX.test(name)) {
      scoreSubmitMsg.textContent = 'Tên phải dài 3–12 ký tự (chữ cái, số hoặc dấu _).';
      scoreSubmitMsg.className = 'score-submit-msg error';
      return;
    }
    try {
      await submitLeaderboardEntry({
        name,
        score: campaignTotalScore,
        nights_won: campaignNightsWon,
        achieved_at: formatIsoWithTz(new Date()),
        seed: campaignSeed,
      });
      scoreSavedForRun = true;
      btnSaveScore.disabled = true;
      scoreSubmitMsg.textContent = `Đã lưu điểm (${campaignTotalScore}) cho "${name}" vào Bảng xếp hạng!`;
      scoreSubmitMsg.className = 'score-submit-msg';
    } catch (err) {
      scoreSubmitMsg.textContent = err.message || 'Lỗi khi lưu bảng xếp hạng.';
      scoreSubmitMsg.className = 'score-submit-msg error';
    }
  });

  btnResultPrimary.addEventListener('click', () => {
    const rs = sim.getRenderState();
    if (rs.state === 'won') {
      if (currentNight < 3) {
        showNightIntro(currentNight + 1);
      } else {
        campaignTotalScore = 0;
        campaignNightsWon = 0;
        showNightIntro(1);
      }
    } else {
      showNightIntro(currentNight);
    }
  });

  document.getElementById('btn-result-menu').addEventListener('click', showMainMenu);

  // Keyboard & Pointer Controls (supports custom keybinds + conflict warnings)
  let prevJumpKey = false;

  window.addEventListener('keydown', (e) => {
    // Capture key rebinding when listening
    if (listeningAction) {
      e.preventDefault();
      const newCode = e.code;
      const duplicateAct = Object.entries(settings.keybinds).find(
        ([act, code]) => act !== listeningAction && code === newCode
      );
      settings.keybinds[listeningAction] = newCode;
      if (duplicateAct) {
        keybindWarning.textContent = `⚠ Trùng phím [${formatKeyCode(newCode)}] giữa "${KEYBIND_LABELS[listeningAction]}" và "${KEYBIND_LABELS[duplicateAct[0]]}"!`;
        keybindWarning.classList.remove('hidden');
      } else {
        keybindWarning.classList.add('hidden');
      }
      listeningAction = null;
      saveSettings(settings);
      renderKeybindsUI();
      return;
    }

    // Do not intercept typing in player name input
    if (document.activeElement === inputPlayerName) return;

    keys.add(e.code);
    if (e.code === settings.keybinds.pause || e.code === 'KeyP') {
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

  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.overlay-card, button, input, select, label')) return;
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
    const kb = settings.keybinds;
    let mx = 0;
    let mz = 0;
    if (keys.has(kb.moveForward) || keys.has('ArrowUp')) mz += 1;
    if (keys.has(kb.moveBackward) || keys.has('ArrowDown')) mz -= 1;
    if (keys.has(kb.moveLeft) || keys.has('ArrowLeft')) mx += 1;
    if (keys.has(kb.moveRight) || keys.has('ArrowRight')) mx -= 1;

    const jumpHeld = keys.has(kb.jump);
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
      interact: keys.has(kb.interact),
      pulse: keys.has(kb.pulse) || keys.has('KeyF'),
      dash: keys.has(kb.dash) || keys.has('ShiftRight'),
      pause: pauseVal,
    };
  }

  // Initial background preview scene on Menu
  sim = createSimulation({ seed: seedCounter++, night: 1, tuning: contract.tuning });
  camYawDeg = 18;
  sceneRenderer = createSceneRenderer(canvasRoot, sim.getRenderState());
  applyAccessibilityUI();
  ensureMoteSlots(contract.tuning.carry_capacity);
  refreshControlLabels();

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

    if (hitFlashTimer > 0) {
      hitFlashTimer -= dtSec;
      if (hitFlashTimer <= 0) hitFlash.classList.add('hidden');
    }

    if (shadeAlertTimer > 0) {
      shadeAlertTimer -= dtSec;
      if (shadeAlertTimer <= 0) shadeAlertPos = null;
    }

    if (activeSubtitles.length > 0) {
      let changed = false;
      for (let i = activeSubtitles.length - 1; i >= 0; i--) {
        activeSubtitles[i].ttl -= dtSec;
        if (activeSubtitles[i].ttl <= 0) {
          activeSubtitles.splice(i, 1);
          changed = true;
        }
      }
      if (changed) renderSubtitles();
    }

    if (mode === 'playing') {
      if (keys.has('KeyJ')) camYawDeg = (camYawDeg + 110 * dtSec) % 360;
      if (keys.has('KeyL')) camYawDeg = (camYawDeg - 110 * dtSec) % 360;
    } else if (mode === 'menu' && !isDragging && !settings.reduceMotion) {
      // Gentle scenic orbit of the 3D fairytale island background on Main Menu
      camYawDeg = (camYawDeg + 5.5 * dtSec) % 360;
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
    // Gently turn toward eastern sunrise horizon (+Z,+X) when winning a night
    if (mode === 'result' && rs.state === 'won' && !isDragging && !settings.reduceMotion) {
      const targetYaw = 14;
      const diff = ((((targetYaw - camYawDeg) % 360) + 540) % 360) - 180;
      camYawDeg += diff * Math.min(1, dtSec * 1.4);
    }

    const { offscreenIndicator, shadeIndicator } = sceneRenderer.syncAndRender(rs, camYawDeg, dtSec, {
      shadeAlertPos,
      isMenuShowcase: mode === 'menu',
    });

    if (mode === 'playing' && offscreenIndicator) {
      lanternArrow.classList.remove('hidden');
      lanternArrow.style.left = `${offscreenIndicator.x}px`;
      lanternArrow.style.top = `${offscreenIndicator.y}px`;
      lanternArrowHead.style.transform = `rotate(${offscreenIndicator.deg}deg)`;
      lanternArrowDist.textContent = `${offscreenIndicator.distM}m`;
    } else {
      lanternArrow.classList.add('hidden');
    }

    if (mode === 'playing' && shadeIndicator && shadeAlertTimer > 0) {
      shadeArrow.classList.remove('hidden');
      shadeArrow.style.left = `${shadeIndicator.x}px`;
      shadeArrow.style.top = `${shadeIndicator.y}px`;
      shadeArrowHead.style.transform = `rotate(${shadeIndicator.deg}deg)`;
      shadeArrowDist.textContent = `Bóng ${shadeIndicator.distM}m`;
    } else {
      shadeArrow.classList.add('hidden');
    }
  }

  requestAnimationFrame(animate);
}
