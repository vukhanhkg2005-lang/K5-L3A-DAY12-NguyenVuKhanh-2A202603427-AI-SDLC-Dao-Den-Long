#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimulation } from './sim/simulation.js';
import { validateInputs, validateScenario, ContractFormatError } from './sim/validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTRACT_PATH = path.resolve(__dirname, '../game.contract.json');

function parseArgs(argv) {
  const args = {
    seed: null,
    night: null,
    scenario: null,
    inputs: null,
    ticks: null,
    out: null,
    snapshotEvery: 10,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--seed':
        args.seed = next;
        i++;
        break;
      case '--night':
        args.night = next;
        i++;
        break;
      case '--scenario':
        args.scenario = next;
        i++;
        break;
      case '--inputs':
        args.inputs = next;
        i++;
        break;
      case '--ticks':
        args.ticks = next;
        i++;
        break;
      case '--out':
        args.out = next;
        i++;
        break;
      case '--snapshot-every':
        args.snapshotEvery = next;
        i++;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  const seed = Number(args.seed);
  if (args.seed === null || !Number.isInteger(seed)) {
    throw new Error('--seed must be an integer');
  }
  const night = Number(args.night);
  if (args.night === null || !Number.isInteger(night) || night < 1 || night > 3) {
    throw new Error('--night must be 1, 2, or 3');
  }
  const ticks = Number(args.ticks);
  if (args.ticks === null || !Number.isInteger(ticks) || ticks < 0) {
    throw new Error('--ticks must be a non-negative integer');
  }
  if (!args.out || typeof args.out !== 'string') {
    throw new Error('--out <file.jsonl> is required');
  }
  const snapshotEvery = Number(args.snapshotEvery);
  if (!Number.isInteger(snapshotEvery) || snapshotEvery <= 0) {
    throw new Error('--snapshot-every must be a positive integer');
  }

  return {
    seed,
    night,
    scenarioPath: args.scenario,
    inputsPath: args.inputs,
    ticks,
    outPath: args.out,
    snapshotEvery,
  };
}

function readJsonFile(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read ${label} file "${filePath}": ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ContractFormatError(`Invalid JSON in ${label} file "${filePath}": ${err.message}`);
  }
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));

    let scenario = null;
    if (opts.scenarioPath) {
      const rawScenario = readJsonFile(opts.scenarioPath, 'scenario');
      scenario = validateScenario(rawScenario);
    }

    let frames = [];
    if (opts.inputsPath) {
      const rawInputs = readJsonFile(opts.inputsPath, 'inputs');
      const validated = validateInputs(rawInputs);
      frames = validated.frames;
    }

    const sim = createSimulation({
      seed: opts.seed,
      night: opts.night,
      tuning: contract.tuning,
      scenario,
    });

    const lines = [];
    // Tick 0 snapshot: right after scenario setup, before applying any input
    lines.push(JSON.stringify(sim.getSnapshot()));
    lines.push(
      JSON.stringify({
        type: 'event',
        tick: 0,
        name: 'night_start',
        data: { night: opts.night },
      })
    );

    const currentInput = {
      move: [0, 0],
      cam_yaw_deg: 0,
      jump: false,
      interact: false,
      pulse: false,
      dash: false,
      pause: false,
    };

    let frameIdx = 0;

    for (let k = 0; k < opts.ticks; k++) {
      if (sim.isFinished()) {
        break;
      }

      if (frameIdx < frames.length && frames[frameIdx].tick === k) {
        const f = frames[frameIdx++];
        if (f.move !== undefined) currentInput.move = [f.move[0], f.move[1]];
        if (f.cam_yaw_deg !== undefined) currentInput.cam_yaw_deg = f.cam_yaw_deg;
        if (f.jump !== undefined) currentInput.jump = f.jump;
        if (f.interact !== undefined) currentInput.interact = f.interact;
        if (f.pulse !== undefined) currentInput.pulse = f.pulse;
        if (f.dash !== undefined) currentInput.dash = f.dash;
        if (f.pause !== undefined) currentInput.pause = f.pause;
      }

      const events = sim.step(currentInput);
      for (const ev of events) {
        lines.push(JSON.stringify(ev));
      }

      const currentTick = sim.getTick();
      if (currentTick % opts.snapshotEvery === 0) {
        lines.push(JSON.stringify(sim.getSnapshot()));
      }

      if (sim.isFinished()) {
        break;
      }
    }

    lines.push(JSON.stringify(sim.getEndRecord()));

    const outDir = path.dirname(path.resolve(opts.outPath));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(opts.outPath, lines.join('\n') + '\n', 'utf8');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(err instanceof ContractFormatError ? 2 : 1);
  }
}

main();
