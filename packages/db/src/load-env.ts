import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function findEnvFile(): string | null {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];

  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const envPath = join(dir, '.env');
      if (existsSync(envPath)) return envPath;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  return null;
}

/** Load repo `.env` when DATABASE_URL is not already set (e.g. npm run db:migrate). */
export function loadEnv(): void {
  if (process.env.DATABASE_URL) return;

  const envPath = findEnvFile();
  if (!envPath) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
