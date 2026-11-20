#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSimulation, TICK_RATE } from './sim/simulation.js';
import { createRng } from './sim/prng.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTRACT_PATH = path.resolve(__dirname, '../game.contract.json');

function parseArgs(argv) {
  const opts = { seed: 7, nights: 10, out: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--seed') opts.seed = Number(argv[++i]);
    else if (flag === '--nights') opts.nights = Number(argv[++i]);
    else if (flag === '--out') opts.out = argv[++i];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!Number.isInteger(opts.seed)) throw new Error('--seed must be an integer');
  if (!Number.isInteger(opts.nights) || opts.nights <= 0) {
    throw new Error('--nights must be a positive integer');
  }
  if (!opts.out) throw new Error('--out <soak.json> is required');
  return opts;
}

function rssMb() {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 100) / 100;
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
    const tuning = contract.tuning;

    const durationKeys = ['night1_duration_s', 'night2_duration_s', 'night3_duration_s'];
    const results = [];
    let crashes = 0;
    let memStartMb = 0;

    const move = [0, 0];
    const input = {
      move,
      cam_yaw_deg: 0,
      jump: false,
      dash: false,
      pulse: false,
      interact: false,
      pause: false,
    };

    const t0 = performance.now();

    for (let i = 0; i < opts.nights; i++) {
      const night = (i % 3) + 1;
      const nightSeed = opts.seed + i;
      const maxTicks = Math.round((tuning[durationKeys[night - 1]] || 240) * TICK_RATE);

      try {
        let sim = createSimulation({ seed: nightSeed, night, tuning });
        if (i === 0) {
          if (typeof global.gc === 'function') global.gc();
          memStartMb = rssMb();
        }

        const inputRng = createRng((nightSeed * 2654435761) >>> 0);
        move[0] = 0;
        move[1] = 0;

        for (let k = 0; k < maxTicks && !sim.isFinished(); k++) {
          if (k % 30 === 0) {
            const ang = inputRng.next() * Math.PI * 2;
            move[0] = Math.cos(ang);
            move[1] = Math.sin(ang);
          }
          input.jump = inputRng.next() < 0.05;
          input.dash = inputRng.next() < 0.03;
          input.pulse = inputRng.next() < 0.02;
          input.interact = inputRng.next() < 0.1;
          sim.step(input);
        }

        results.push(sim.getState() === 'won' ? 'won' : 'lost');
        sim = null;
        if (typeof global.gc === 'function') global.gc();
      } catch (err) {
        crashes += 1;
        results.push('crash');
        process.stderr.write(`Soak night ${i + 1} crashed: ${err.message}\n`);
      }
    }

    if (typeof global.gc === 'function') global.gc();
    const memEndMb = rssMb();
    const durationS = Math.round(((performance.now() - t0) / 1000) * 1000) / 1000;

    const report = {
      nights: opts.nights,
      crashes,
      results,
      mem_start_mb: memStartMb,
      mem_end_mb: memEndMb,
      duration_s: durationS,
    };

    const absOut = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, JSON.stringify(report, null, 2) + '\n', 'utf8');
    process.exit(crashes === 0 ? 0 : 1);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
