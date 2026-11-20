#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readLeaderboard,
  addLeaderboardEntry,
  exportLeaderboard,
} from './leaderboard.js';

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
  '.ico': 'image/x-icon',
};

function parseArgs(argv) {
  const opts = { exportPath: null, port: 4173, host: '0.0.0.0' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--export-leaderboard') {
      opts.exportPath = argv[++i];
      if (!opts.exportPath) throw new Error('--export-leaderboard requires an output file path');
    } else if (a === '--port') {
      opts.port = Number(argv[++i]) || 4173;
    } else if (a === '--host') {
      opts.host = argv[++i] || '0.0.0.0';
    }
  }
  return opts;
}

function serveStaticFile(reqPath, res) {
  const cleanPath = reqPath.split('?')[0];
  let filePath = path.join(DIST_DIR, cleanPath === '/' ? 'index.html' : cleanPath);
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 65536) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));

    // Contract v1.3: <run_cmd> --export-leaderboard out.json
    if (opts.exportPath) {
      exportLeaderboard(opts.exportPath);
      process.exit(0);
    }

    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      process.stderr.write('Error: dist/ not found. Run "npm run build" first.\n');
      process.exit(1);
    }

    const server = http.createServer(async (req, res) => {
      const urlPath = (req.url || '/').split('?')[0];

      if (urlPath === '/api/leaderboard' && req.method === 'GET') {
        const data = readLeaderboard();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
        return;
      }

      if (urlPath === '/api/leaderboard' && req.method === 'POST') {
        try {
          const payload = await readJsonBody(req);
          const updated = addLeaderboardEntry(payload);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(updated));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      serveStaticFile(req.url || '/', res);
    });

    server.listen(opts.port, opts.host, () => {
      const displayHost = opts.host === '0.0.0.0' ? 'localhost' : opts.host;
      console.log(`Đảo Đèn Lồng đang chạy tại http://${displayHost}:${opts.port}`);
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
