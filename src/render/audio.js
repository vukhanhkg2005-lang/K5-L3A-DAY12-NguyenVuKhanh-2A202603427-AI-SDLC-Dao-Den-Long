/**
 * Procedural Web Audio synthesizer (render-only creativity).
 * Completely unused in headless CLI mode.
 */
export function createAudioEngine() {
  let ctx = null;
  let enabled = true;

  function ensureContext() {
    if (!enabled || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) {
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone({ freq, endFreq, duration = 0.2, type = 'sine', gain = 0.12, delay = 0 }) {
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

  return {
    unlock() {
      ensureContext();
    },
    isEnabled() {
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    playMotePickup(carriedCount = 1) {
      const f = pentatonic[(carriedCount - 1) % pentatonic.length];
      playTone({ freq: f, endFreq: f * 1.15, duration: 0.18, type: 'sine', gain: 0.1 });
    },
    playDeposit() {
      playTone({ freq: 440, endFreq: 554.37, duration: 0.22, type: 'triangle', gain: 0.11 });
    },
    playLanternLit() {
      // Warm fairytale fifth + octave chord
      playTone({ freq: 392.0, duration: 0.55, type: 'triangle', gain: 0.11, delay: 0 });
      playTone({ freq: 587.33, duration: 0.55, type: 'sine', gain: 0.1, delay: 0.06 });
      playTone({ freq: 783.99, duration: 0.7, type: 'sine', gain: 0.09, delay: 0.12 });
    },
    playPulse() {
      playTone({ freq: 260, endFreq: 680, duration: 0.35, type: 'sine', gain: 0.14 });
      playTone({ freq: 520, endFreq: 320, duration: 0.4, type: 'triangle', gain: 0.08, delay: 0.04 });
    },
    playHit() {
      playTone({ freq: 180, endFreq: 75, duration: 0.28, type: 'sawtooth', gain: 0.09 });
    },
    playWin() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
        playTone({ freq: f, duration: 0.5, type: 'triangle', gain: 0.1, delay: idx * 0.11 });
      });
    },
    playLose() {
      [329.63, 293.66, 246.94, 196.0].forEach((f, idx) => {
        playTone({ freq: f, duration: 0.45, type: 'sine', gain: 0.09, delay: idx * 0.14 });
      });
    },
  };
}
