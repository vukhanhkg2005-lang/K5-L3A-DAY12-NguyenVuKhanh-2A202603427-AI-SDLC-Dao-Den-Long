/**
 * Procedural Web Audio Engine (Phase 2 — render-only, disabled in headless).
 * Includes:
 * - Warm pentatonic night BGM loop
 * - All 10 required SFX: mote pickup, lantern lit, pulse, hit, jump, dash,
 *   win, lose, shade spawned, last-10s countdown + wind warning & drifter steal.
 */
export function createAudioEngine(initialVolume = 0.7) {
  let ctx = null;
  let masterGain = null;
  let volume = initialVolume;
  let muted = false;
  let bgmTimer = null;
  let bgmStep = 0;

  function ensureContext() {
    if (muted || volume <= 0.001 || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) {
      ctx = new AudioCtx();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone({ freq, endFreq, duration = 0.2, type = 'sine', gain = 0.15, delay = 0 }) {
    const audio = ensureContext();
    if (!audio || !masterGain) return;
    const now = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  function playNoiseBurst(duration = 0.45, gain = 0.09, filterFreq = 650) {
    const audio = ensureContext();
    if (!audio || !masterGain) return;
    const sampleCount = Math.floor(audio.sampleRate * duration);
    const buf = audio.createBuffer(1, sampleCount, audio.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    const src = audio.createBufferSource();
    src.buffer = buf;

    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.6;

    const amp = audio.createGain();
    const now = audio.currentTime;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + duration * 0.25);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(amp);
    amp.connect(masterGain);
    src.start(now);
  }

  const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  const bgmMelody = [261.63, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66, 220.0];

  function startBgm() {
    if (bgmTimer) return;
    bgmTimer = window.setInterval(() => {
      if (muted || volume <= 0.001 || !ctx || ctx.state !== 'running') return;
      const note = bgmMelody[bgmStep % bgmMelody.length];
      bgmStep++;
      playTone({ freq: note, duration: 0.85, type: 'sine', gain: 0.038 });
      if (bgmStep % 4 === 1) {
        playTone({ freq: note * 0.5, duration: 1.4, type: 'triangle', gain: 0.025 });
      }
    }, 850);
  }

  function stopBgm() {
    if (bgmTimer) {
      window.clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  return {
    unlock() {
      ensureContext();
      startBgm();
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (masterGain && ctx) {
        masterGain.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime);
      }
    },
    getVolume() {
      return volume;
    },
    isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (masterGain && ctx) {
        masterGain.gain.setValueAtTime(muted ? 0 : volume, ctx.currentTime);
      }
      return muted;
    },
    startBgm,
    stopBgm,
    // 1. Mote pickup
    playMotePickup(carriedCount = 1) {
      const f = pentatonic[(Math.max(1, carriedCount) - 1) % pentatonic.length];
      playTone({ freq: f, endFreq: f * 1.12, duration: 0.16, type: 'sine', gain: 0.13 });
    },
    // Charm pickup
    playCharmPickup() {
      playTone({ freq: 587.33, duration: 0.18, type: 'triangle', gain: 0.14 });
      playTone({ freq: 880.0, duration: 0.28, type: 'sine', gain: 0.13, delay: 0.07 });
    },
    // Deposit
    playDeposit() {
      playTone({ freq: 440, endFreq: 554.37, duration: 0.18, type: 'triangle', gain: 0.12 });
    },
    // 2. Lantern lit
    playLanternLit() {
      playTone({ freq: 392.0, duration: 0.55, type: 'triangle', gain: 0.14, delay: 0 });
      playTone({ freq: 587.33, duration: 0.55, type: 'sine', gain: 0.13, delay: 0.06 });
      playTone({ freq: 783.99, duration: 0.72, type: 'sine', gain: 0.12, delay: 0.12 });
    },
    // 3. Pulse
    playPulse() {
      playTone({ freq: 260, endFreq: 720, duration: 0.34, type: 'sine', gain: 0.16 });
      playTone({ freq: 520, endFreq: 310, duration: 0.4, type: 'triangle', gain: 0.1, delay: 0.04 });
    },
    // 4. Hit / Fall
    playHit() {
      playTone({ freq: 185, endFreq: 70, duration: 0.3, type: 'sawtooth', gain: 0.12 });
    },
    // 5. Jump
    playJump() {
      playTone({ freq: 240, endFreq: 420, duration: 0.14, type: 'sine', gain: 0.1 });
    },
    // 6. Dash
    playDash() {
      playNoiseBurst(0.18, 0.11, 1100);
      playTone({ freq: 480, endFreq: 260, duration: 0.14, type: 'triangle', gain: 0.08 });
    },
    // 7. Win
    playWin() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
        playTone({ freq: f, duration: 0.52, type: 'triangle', gain: 0.13, delay: idx * 0.1 });
      });
    },
    // 8. Lose
    playLose() {
      [329.63, 293.66, 246.94, 196.0].forEach((f, idx) => {
        playTone({ freq: f, duration: 0.46, type: 'sine', gain: 0.12, delay: idx * 0.13 });
      });
    },
    // 9. Shade spawned
    playShadeSpawn() {
      playTone({ freq: 130, endFreq: 95, duration: 0.4, type: 'sawtooth', gain: 0.07 });
    },
    // 10. Countdown last 10s
    playCountdownTick() {
      playTone({ freq: 880, duration: 0.08, type: 'square', gain: 0.07 });
    },
    // Wind warning / gust
    playWindWhoosh() {
      playNoiseBurst(0.75, 0.12, 480);
    },
    // Drifter steal
    playDrifterSteal() {
      playTone({ freq: 620, endFreq: 310, duration: 0.24, type: 'sine', gain: 0.12 });
    },
  };
}
