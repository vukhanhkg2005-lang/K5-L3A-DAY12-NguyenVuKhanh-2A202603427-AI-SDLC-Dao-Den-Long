import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_LEADERBOARD_ENTRIES = 10;
// 3–12 chars: ASCII [A-Za-z0-9_] + accented Vietnamese Unicode letters
const NAME_REGEX = /^[\p{L}\p{N}_]{3,12}$/u;

export function getLeaderboardPath() {
  const baseDir = process.env.DDL_DATA_DIR
    ? path.resolve(process.env.DDL_DATA_DIR)
    : path.join(os.homedir(), '.dao-den-long');
  return path.join(baseDir, 'leaderboard.json');
}

export function validatePlayerName(name) {
  if (typeof name !== 'string') return false;
  return NAME_REGEX.test(name.trim());
}

export function formatIsoWithTimezone(date = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const tzOffsetMin = -date.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  const tzH = pad(tzOffsetMin / 60);
  const tzM = pad(tzOffsetMin % 60);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${tzH}:${tzM}`
  );
}

export function sortLeaderboardEntries(entries) {
  return [...entries]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const tA = Date.parse(a.achieved_at) || 0;
      const tB = Date.parse(b.achieved_at) || 0;
      if (tA !== tB) return tA - tB;
      return 0;
    })
    .slice(0, MAX_LEADERBOARD_ENTRIES);
}

export function readLeaderboard(filePath = getLeaderboardPath()) {
  try {
    if (!fs.existsSync(filePath)) {
      return { entries: [] };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return { entries: sortLeaderboardEntries(list) };
  } catch {
    return { entries: [] };
  }
}

export function writeLeaderboard(data, filePath = getLeaderboardPath()) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = { entries: sortLeaderboardEntries(data.entries || []) };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

export function addLeaderboardEntry(rawEntry, filePath = getLeaderboardPath()) {
  const name = typeof rawEntry.name === 'string' ? rawEntry.name.trim() : '';
  if (!validatePlayerName(name)) {
    throw new Error('Tên phải dài 3–12 ký tự (chữ cái, số hoặc dấu gạch dưới _)');
  }
  const score = Math.max(0, Math.floor(Number(rawEntry.score) || 0));
  const nightsWon = Math.max(0, Math.min(3, Math.floor(Number(rawEntry.nights_won) || 0)));
  const seed = Number.isInteger(Number(rawEntry.seed)) ? Number(rawEntry.seed) : 0;
  const achievedAt =
    typeof rawEntry.achieved_at === 'string' && rawEntry.achieved_at.length >= 19
      ? rawEntry.achieved_at
      : formatIsoWithTimezone(new Date());

  const current = readLeaderboard(filePath);
  current.entries.push({
    name,
    score,
    nights_won: nightsWon,
    achieved_at: achievedAt,
    seed,
  });
  return writeLeaderboard(current, filePath);
}

export function exportLeaderboard(outPath, filePath = getLeaderboardPath()) {
  const data = readLeaderboard(filePath);
  const absOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, JSON.stringify({ entries: data.entries }, null, 2) + '\n', 'utf8');
  return data;
}
