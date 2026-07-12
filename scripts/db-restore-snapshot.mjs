#!/usr/bin/env node
/**
 * Restore the shared SQLite snapshot shipped in git, then run migrations.
 *
 * Usage (from repo root):
 *   npm run db:restore-snapshot
 *
 * Steps:
 *   1. Remove local live/export DB files
 *   2. Decompress data/stockbuddy.sqlite.gz → data/stockbuddy.sqlite
 *   3. npm run db:migrate
 */
import { createReadStream, createWriteStream, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'data');
const gzPath = resolve(dataDir, 'stockbuddy.sqlite.gz');
const sqlitePath = resolve(dataDir, 'stockbuddy.sqlite');

const toRemove = [
  sqlitePath,
  resolve(dataDir, 'stockbuddy.export.sqlite'),
  resolve(dataDir, 'stockbuddy.ci.sqlite'),
];

for (const path of toRemove) {
  if (existsSync(path)) {
    rmSync(path);
    console.log(`Removed ${path}`);
  }
}

// WAL/SHM sidecars from a previous live DB
for (const suffix of ['-wal', '-shm', '-journal']) {
  const path = `${sqlitePath}${suffix}`;
  if (existsSync(path)) {
    rmSync(path);
    console.log(`Removed ${path}`);
  }
}

if (!existsSync(gzPath)) {
  console.error(`Snapshot not found: ${gzPath}`);
  console.error('Pull latest main, or refresh the .gz on a machine that has market data.');
  process.exit(1);
}

console.log(`Decompressing ${gzPath} → ${sqlitePath}`);
await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(sqlitePath));
console.log('Snapshot restored.');

const migrate = spawnSync('npm', ['run', 'db:migrate'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    // Always migrate the restored snapshot, not a stale DATABASE_URL from the shell.
    DATABASE_URL: `file:${sqlitePath}`,
    DATABASE_PATH: sqlitePath,
  },
});
process.exit(migrate.status ?? 1);
