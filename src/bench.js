#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROCESS_START_MS = performance.now();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '../dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function parseArgs(argv) {
  const opts = { seed: 42, duration: 30, out: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--seed') opts.seed = Number(argv[++i]);
    else if (flag === '--duration') opts.duration = Number(argv[++i]);
    else if (flag === '--out') opts.out = argv[++i];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!Number.isInteger(opts.seed)) throw new Error('--seed must be an integer');
  if (!Number.isFinite(opts.duration) || opts.duration <= 0) {
    throw new Error('--duration must be a positive number');
  }
  if (!opts.out) throw new Error('--out <bench.json> is required');
  return opts;
}

function findBrowserExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const platform = process.platform;
  const candidates = [];

  if (platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  } else if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  const cmdNames =
    platform === 'win32'
      ? ['chrome', 'msedge']
      : ['google-chrome', 'chromium', 'chromium-browser'];
  for (const name of cmdNames) {
    const which = spawnSync(platform === 'win32' ? 'where' : 'which', [name], {
      encoding: 'utf8',
    });
    if (which.status === 0 && which.stdout.trim()) {
      return which.stdout.trim().split(/\r?\n/)[0];
    }
  }
  return null;
}

function sampleProcessRssMb(pid) {
  if (!pid) return null;
  try {
    if (process.platform === 'linux' || process.platform === 'darwin') {
      const res = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
      if (res.status === 0) {
        const kb = Number(res.stdout.trim());
        if (Number.isFinite(kb) && kb > 0) return Math.round((kb / 1024) * 10) / 10;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getOsLabel() {
  return `${os.type()} ${os.release()} (${os.arch()})`;
}

async function main() {
  let browserProc = null;
  let server = null;
  let userDataDir = null;
  let memTimer = null;

  const cleanup = () => {
    if (memTimer) clearInterval(memTimer);
    if (browserProc && !browserProc.killed) {
      try {
        browserProc.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    if (server) {
      try {
        server.close();
      } catch {
        // ignore
      }
    }
    if (userDataDir) {
      setTimeout(() => {
        try {
          fs.rmSync(userDataDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }, 250);
    }
  };

  try {
    const opts = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      throw new Error('dist/ not found. Run "npm run build" before running benchmark.');
    }

    const browserPath = findBrowserExecutable();
    if (!browserPath) {
      throw new Error(
        'No Chrome/Chromium/Edge browser found. Set CHROME_PATH environment variable to run 3D benchmark.'
      );
    }

    let loadMs = null;
    let peakMemMb = null;
    let resolveDone;
    let rejectDone;
    const donePromise = new Promise((res, rej) => {
      resolveDone = res;
      rejectDone = rej;
    });

    server = http.createServer(async (req, res) => {
      const urlPath = (req.url || '/').split('?')[0];

      if (urlPath === '/__bench_loaded' && req.method === 'POST') {
        if (loadMs === null) {
          loadMs = Math.round(performance.now() - PROCESS_START_MS);
        }
        res.writeHead(204);
        res.end();
        return;
      }

      if (urlPath === '/__bench_done' && req.method === 'POST') {
        try {
          const payload = await readBody(req);
          res.writeHead(204);
          res.end();
          resolveDone(payload);
        } catch (err) {
          res.writeHead(400);
          res.end();
          rejectDone(err);
        }
        return;
      }

      let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-bench-profile-'));

    const url = `http://127.0.0.1:${port}/?bench=1&seed=${opts.seed}&duration=${opts.duration}`;
    const browserArgs = [
      `--app=${url}`,
      '--window-size=1280,720',
      '--window-position=40,40',
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--autoplay-policy=no-user-gesture-required',
      `--user-data-dir=${userDataDir}`,
    ];

    browserProc = spawn(browserPath, browserArgs, { stdio: 'ignore' });
    browserProc.on('error', (err) => rejectDone(err));

    memTimer = setInterval(() => {
      const rss = sampleProcessRssMb(browserProc.pid);
      if (rss !== null && (peakMemMb === null || rss > peakMemMb)) {
        peakMemMb = rss;
      }
    }, 500);

    const timeoutMs = (opts.duration + 35) * 1000;
    const timeoutId = setTimeout(() => {
      rejectDone(new Error(`Benchmark timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const metrics = await donePromise;
    clearTimeout(timeoutId);

    // If web page reported JS heap memory or OS RSS was unavailable, keep spec-compliant peak_mem_mb (number or null)
    const report = {
      contract_version: '1.3',
      avg_fps: metrics.avg_fps,
      p1_low_fps: metrics.p1_low_fps,
      frame_ms_p95: metrics.frame_ms_p95,
      frames: metrics.frames,
      load_ms: loadMs ?? Math.round(performance.now() - PROCESS_START_MS),
      peak_mem_mb: peakMemMb,
      vsync_off: true,
      renderer: metrics.renderer || 'Three.js / WebGL2',
      os: getOsLabel(),
    };

    const absOut = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, JSON.stringify(report, null, 2) + '\n', 'utf8');

    cleanup();
    process.exit(0);
  } catch (err) {
    cleanup();
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
