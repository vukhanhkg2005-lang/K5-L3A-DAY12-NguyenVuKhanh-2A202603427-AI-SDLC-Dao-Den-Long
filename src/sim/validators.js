export class ContractFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractFormatError';
    this.exitCode = 2;
  }
}

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
    if (!Number.isInteger(frame.tick) || frame.tick < 0) {
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
    for (const btn of ['jump', 'interact', 'pulse', 'dash']) {
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
    if (
      data.player.carried !== undefined &&
      (!Number.isInteger(data.player.carried) || data.player.carried < 0)
    ) {
      throw new ContractFormatError('scenario.player.carried must be a non-negative integer');
    }
    if (
      data.player.flames !== undefined &&
      (!Number.isInteger(data.player.flames) || data.player.flames < 0)
    ) {
      throw new ContractFormatError('scenario.player.flames must be a non-negative integer');
    }
  }

  if (data.random_motes !== undefined && typeof data.random_motes !== 'boolean') {
    throw new ContractFormatError('scenario.random_motes must be a boolean');
  }
  if (data.random_shades !== undefined && typeof data.random_shades !== 'boolean') {
    throw new ContractFormatError('scenario.random_shades must be a boolean');
  }

  if (data.motes !== undefined) {
    if (!Array.isArray(data.motes)) {
      throw new ContractFormatError('scenario.motes must be an array');
    }
    for (let i = 0; i < data.motes.length; i++) {
      const m = data.motes[i];
      if (isVec3(m)) continue;
      if (isPlainObject(m) && isVec3(m.pos) && (m.id === undefined || typeof m.id === 'string')) {
        continue;
      }
      throw new ContractFormatError(`scenario.motes[${i}] must be [x, y, z] or { id?, pos: [x, y, z] }`);
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
      if (s.state !== undefined && typeof s.state !== 'string') {
        throw new ContractFormatError(`scenario.shades[${i}].state must be a string`);
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
      if (l.deposited !== undefined && (!Number.isInteger(l.deposited) || l.deposited < 0)) {
        throw new ContractFormatError(`scenario.lanterns[${i}].deposited must be a non-negative integer`);
      }
      if (l.lit !== undefined && typeof l.lit !== 'boolean') {
        throw new ContractFormatError(`scenario.lanterns[${i}].lit must be a boolean`);
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
