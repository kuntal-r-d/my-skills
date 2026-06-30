#!/usr/bin/env node
/**
 * Stop one-off `docker run stock-buddy-mcp:latest` containers (stdio MCP spawns).
 * Keeps docker-compose services: stock-buddy-mcp, stock-buddy-data-mcp, stock-buddy-ingest, etc.
 */
import { execSync } from 'node:child_process';

const KEEP = new Set([
  'stock-buddy-mcp',
  'stock-buddy-data-mcp',
  'stock-buddy-ingest',
  'stock-buddy-dashboard',
  'stock-buddy-postgres',
]);

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

let names = [];
try {
  const out = sh('docker ps -a --filter ancestor=stock-buddy-mcp:latest --format "{{.Names}}"');
  names = out ? out.split('\n').filter(Boolean) : [];
} catch {
  console.error('Docker not available — nothing to clean.');
  process.exit(0);
}

const orphans = names.filter((n) => !KEEP.has(n));
if (!orphans.length) {
  console.log('No orphan stock-buddy-mcp containers found.');
  process.exit(0);
}

console.log('Stopping orphan MCP containers:', orphans.join(', '));
for (const name of orphans) {
  try {
    sh(`docker stop ${name}`);
    console.log(`  stopped ${name}`);
  } catch (err) {
    console.warn(`  failed ${name}:`, err.message ?? err);
  }
}

console.log('Done. Compose services kept:', [...KEEP].filter((n) => names.includes(n)).join(', ') || '(none running)');
