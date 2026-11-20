export class ContractFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractFormatError';
    this.exitCode = 2;
  }
}

export const VALID_SHADE_STATES = new Set([
  'spawning',
  'wander',
  'chase',
  'recoil',
  'stunned',
  'drain',
]);
export const VALID_DRIFTER_STATES = new Set(['idle', 'chase', 'flee', 'removed']);

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isVec3(v) {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

export function validateInputs(data) {
  if (!isPlainObject(data)) {
    throw new ContractFormatError('inputs JSON must be an object');
  }
  if (!Array.isArray(data.frames)) {
    throw new ContractFormatError('inputs.frames must be an array');
  }

  let prevTick = -1;
  for (let i = 0; i < data.frames.length; i++) {
    const frame = data.frames[i];
    if (!isPlainObject(frame)) {
      throw new ContractFormatError(`inputs.frames[${i}] must be an object`);
    }
    if (!isNonNegInt(frame.tick)) {
      throw new ContractFormatError(`inputs.frames[${i}].tick must be a non-negative integer`);
    }
    if (frame.tick <= prevTick) {
      throw new ContractFormatError(
        `inputs.frames[${i}].tick (${frame.tick}) must be strictly greater than previous tick (${prevTick})`
      );
    }
    prevTick = frame.tick;

    if (frame.move !== undefined) {
      if (
        !Array.isArray(frame.move) ||
        frame.move.length !== 2 ||
        !frame.move.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 1)
      ) {
        throw new ContractFormatError(
          `inputs.frames[${i}].move must be [x, z] with finite numbers in [-1, 1]`
        );
      }
    }
    if (frame.cam_yaw_deg !== undefined) {
      if (typeof frame.cam_yaw_deg !== 'number' || !Number.isFinite(frame.cam_yaw_deg)) {
        throw new ContractFormatError(`inputs.frames[${i}].cam_yaw_deg must be a finite number`);
      }
    }
    for (const btn of ['jump', 'interact', 'pulse', 'dash', 'pause']) {
      if (frame[btn] !== undefined && typeof frame[btn] !== 'boolean') {
        throw new ContractFormatError(`inputs.frames[${i}].${btn} must be a boolean`);
      }
    }
  }
  return data;
}

export function validateScenario(data) {
  if (!isPlainObject(data)) {
    throw new ContractFormatError('scenario JSON must be an object');
  }

  if (data.player !== undefined) {
    if (!isPlainObject(data.player)) {
      throw new ContractFormatError('scenario.player must be an object');
    }
    if (data.player.pos !== undefined && !isVec3(data.player.pos)) {
      throw new ContractFormatError('scenario.player.pos must be [x, y, z] of finite numbers');
    }
    for (const k of [
      'carried',
      'flames',
      'invuln_ticks',
      'dash_cd_ticks',
      'pulse_cd_ticks',
      'charm_ticks',
      'successful_lights',
    ]) {
      if (data.player[k] !== undefined && !isNonNegInt(data.player[k])) {
        throw new ContractFormatError(`scenario.player.${k} must be a non-negative integer`);
      }
    }
  }

  for (const flag of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) {
    if (data[flag] !== undefined && typeof data[flag] !== 'boolean') {
      throw new ContractFormatError(`scenario.${flag} must be a boolean`);
    }
  }

  if (data.motes !== undefined) {
    if (!Array.isArray(data.motes)) {
      throw new ContractFormatError('scenario.motes must be an array');
    }
    for (let i = 0; i < data.motes.length; i++) {
      const m = data.motes[i];
      if (isVec3(m)) continue;
      if (
        isPlainObject(m) &&
        isVec3(m.pos) &&
        (m.id === undefined || typeof m.id === 'string') &&
        (m.kind === undefined || m.kind === 'random' || m.kind === 'dropped') &&
        (m.ttl_ticks === undefined || isNonNegInt(m.ttl_ticks))
      ) {
        continue;
      }
      throw new ContractFormatError(
        `scenario.motes[${i}] must be [x, y, z] or { id?, pos: [x, y, z], kind?, ttl_ticks? }`
      );
    }
  }

  if (data.shades !== undefined) {
    if (!Array.isArray(data.shades)) {
      throw new ContractFormatError('scenario.shades must be an array');
    }
    for (let i = 0; i < data.shades.length; i++) {
      const s = data.shades[i];
      if (!isPlainObject(s) || !isVec3(s.pos)) {
        throw new ContractFormatError(`scenario.shades[${i}] must be an object with pos: [x, y, z]`);
      }
      if (s.id !== undefined && typeof s.id !== 'string') {
        throw new ContractFormatError(`scenario.shades[${i}].id must be a string`);
      }
      if (s.state !== undefined && !VALID_SHADE_STATES.has(s.state)) {
        throw new ContractFormatError(
          `scenario.shades[${i}].state must be one of: ${[...VALID_SHADE_STATES].join(', ')}`
        );
      }
      if (s.state_ticks_left !== undefined && !isNonNegInt(s.state_ticks_left)) {
        throw new ContractFormatError(
          `scenario.shades[${i}].state_ticks_left must be a non-negative integer`
        );
      }
      if (
        s.target_lantern_id !== undefined &&
        s.target_lantern_id !== null &&
        typeof s.target_lantern_id !== 'string'
      ) {
        throw new ContractFormatError(
          `scenario.shades[${i}].target_lantern_id must be a string or null`
        );
      }
    }
  }

  if (data.drifters !== undefined) {
    if (!Array.isArray(data.drifters)) {
      throw new ContractFormatError('scenario.drifters must be an array');
    }
    for (let i = 0; i < data.drifters.length; i++) {
      const d = data.drifters[i];
      if (!isPlainObject(d) || !isVec3(d.pos)) {
        throw new ContractFormatError(`scenario.drifters[${i}] must have pos: [x, y, z]`);
      }
      if (d.id !== undefined && typeof d.id !== 'string') {
        throw new ContractFormatError(`scenario.drifters[${i}].id must be a string`);
      }
      if (d.state !== undefined && !VALID_DRIFTER_STATES.has(d.state)) {
        throw new ContractFormatError(
          `scenario.drifters[${i}].state must be one of: ${[...VALID_DRIFTER_STATES].join(', ')}`
        );
      }
      if (d.stolen !== undefined && !isNonNegInt(d.stolen)) {
        throw new ContractFormatError(`scenario.drifters[${i}].stolen must be a non-negative integer`);
      }
      if (d.flee_ticks_left !== undefined && !isNonNegInt(d.flee_ticks_left)) {
        throw new ContractFormatError(
          `scenario.drifters[${i}].flee_ticks_left must be a non-negative integer`
        );
      }
    }
  }

  if (data.charms !== undefined) {
    if (!Array.isArray(data.charms)) {
      throw new ContractFormatError('scenario.charms must be an array');
    }
    for (let i = 0; i < data.charms.length; i++) {
      const c = data.charms[i];
      if (!isPlainObject(c) || typeof c.id !== 'string' || c.id.length === 0) {
        throw new ContractFormatError(`scenario.charms[${i}] must have a string id`);
      }
      if (c.pos !== undefined && !isVec3(c.pos)) {
        throw new ContractFormatError(`scenario.charms[${i}].pos must be [x, y, z]`);
      }
      if (c.available !== undefined && typeof c.available !== 'boolean') {
        throw new ContractFormatError(`scenario.charms[${i}].available must be a boolean`);
      }
      if (c.respawn_ticks !== undefined && !isNonNegInt(c.respawn_ticks)) {
        throw new ContractFormatError(
          `scenario.charms[${i}].respawn_ticks must be a non-negative integer`
        );
      }
    }
  }

  if (data.lanterns !== undefined) {
    if (!Array.isArray(data.lanterns)) {
      throw new ContractFormatError('scenario.lanterns must be an array');
    }
    for (let i = 0; i < data.lanterns.length; i++) {
      const l = data.lanterns[i];
      if (!isPlainObject(l) || typeof l.id !== 'string' || l.id.length === 0) {
        throw new ContractFormatError(`scenario.lanterns[${i}] must have a string id`);
      }
      if (l.pos !== undefined && !isVec3(l.pos)) {
        throw new ContractFormatError(`scenario.lanterns[${i}].pos must be [x, y, z]`);
      }
      if (l.deposited !== undefined && !isNonNegInt(l.deposited)) {
        throw new ContractFormatError(`scenario.lanterns[${i}].deposited must be a non-negative integer`);
      }
      if (l.lit !== undefined && typeof l.lit !== 'boolean') {
        throw new ContractFormatError(`scenario.lanterns[${i}].lit must be a boolean`);
      }
      if (l.ever_lit !== undefined && typeof l.ever_lit !== 'boolean') {
        throw new ContractFormatError(`scenario.lanterns[${i}].ever_lit must be a boolean`);
      }
      if (l.relit_count !== undefined && !isNonNegInt(l.relit_count)) {
        throw new ContractFormatError(`scenario.lanterns[${i}].relit_count must be a non-negative integer`);
      }
      if (
        l.fuel !== undefined &&
        (typeof l.fuel !== 'number' || !Number.isFinite(l.fuel) || l.fuel < 0 || l.fuel > 100)
      ) {
        throw new ContractFormatError(`scenario.lanterns[${i}].fuel must be a number in [0, 100]`);
      }
    }
  }

  if (data.time_left_s !== undefined) {
    if (typeof data.time_left_s !== 'number' || !Number.isFinite(data.time_left_s) || data.time_left_s <= 0) {
      throw new ContractFormatError('scenario.time_left_s must be a positive finite number');
    }
  }

  return data;
}
