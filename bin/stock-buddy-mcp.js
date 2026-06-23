#!/usr/bin/env node
/**
 * Stock Buddy MCP server launcher (TypeScript native).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '..', 'packages', 'mcp-server', 'dist', 'server.js');

const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    // Claude Desktop and other MCP clients require stdio transport.
    STOCK_BUDDY_HTTP: '0',
    STOCK_BUDDY_SKILLS_DIR:
      process.env.STOCK_BUDDY_SKILLS_DIR ?? join(__dirname, '..', 'skills'),
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
