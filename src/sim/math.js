export const EPS = 1e-9;

export function round3(v) {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function roundPos(pos) {
  return [round3(pos[0]), round3(pos[1]), round3(pos[2])];
}

export function distXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function dist3D(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Transform [x, z] move input using Test Contract rotation formula:
 * x' = x*cos(theta) + z*sin(theta)
 * z' = -x*sin(theta) + z*cos(theta)
 * Normalizes vectors with length > 1.
 */
export function transformMoveInput(move, camYawDeg) {
  let x = move[0] || 0;
  let z = move[1] || 0;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  const theta = ((camYawDeg || 0) * Math.PI) / 180;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [x * c + z * s, -x * s + z * c];
}
