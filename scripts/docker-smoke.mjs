#!/usr/bin/env node
/** Smoke-test the Docker MCP HTTP server at localhost:8080/mcp */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MCP_URL ?? 'http://localhost:8080/mcp';
const fixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../skills/_fixtures/sample_input.json'),
    'utf8',
  ),
);

async function mcpCall(method, params, id = 1) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  // SSE or JSON response
  if (text.startsWith('event:')) {
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    if (!dataLine) throw new Error(`No SSE data in: ${text.slice(0, 300)}`);
    return JSON.parse(dataLine.slice(6));
  }
  return JSON.parse(text);
}

async function main() {
  console.log(`Testing MCP server at ${BASE}`);

  const init = await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'docker-smoke-test', version: '1.0.0' },
  });
  console.log('initialize:', init.result?.serverInfo?.name ?? init);

  const tools = await mcpCall('tools/list', {}, 2);
  const toolNames = tools.result?.tools?.map((t) => t.name) ?? [];
  console.log(`tools/list: ${toolNames.length} tools`);
  if (toolNames.length !== 16) {
    throw new Error(`Expected 16 tools, got ${toolNames.length}: ${toolNames.join(', ')}`);
  }

  const macro = await mcpCall(
    'tools/call',
    { name: 'macro_regime', arguments: fixture },
    3,
  );
  const text = macro.result?.content?.[0]?.text;
  if (!text) throw new Error(`macro_regime: no content — ${JSON.stringify(macro)}`);
  const card = JSON.parse(text);
  if (card.error) throw new Error(`macro_regime error: ${card.error}`);
  console.log(`macro_regime: rating=${card.rating}, score=${card.score}`);

  const analyze = await mcpCall(
    'tools/call',
    { name: 'analyze_ticker', arguments: fixture },
    4,
  );
  const analyzeText = analyze.result?.content?.[0]?.text;
  if (!analyzeText) throw new Error(`analyze_ticker: no content`);
  const pipeline = JSON.parse(analyzeText);
  if (pipeline.error) throw new Error(`analyze_ticker error: ${pipeline.error}`);
  console.log(`analyze_ticker: stages=${Object.keys(pipeline.stages ?? {}).length}, synthesis=${!!pipeline.synthesis}`);

  console.log('\nAll Docker MCP smoke tests passed.');
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
