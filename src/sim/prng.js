/**
 * Deterministic Mulberry32 PRNG.
 * Pure JS, identical results across Node.js and all browsers.
 */
export function createRng(seed) {
  let state = (Number(seed) >>> 0);

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function range(min, max) {
    return min + next() * (max - min);
  }

  function pointInRing(minR, maxR) {
    const angle = next() * Math.PI * 2;
    const r = Math.sqrt(minR * minR + next() * (maxR * maxR - minR * minR));
    return [Math.cos(angle) * r, 0, Math.sin(angle) * r];
  }

  return { next, range, pointInRing };
}
