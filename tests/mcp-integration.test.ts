import { describe, expect, it } from 'vitest';
import { runSkill } from '../packages/mcp-server/src/dispatch.js';
import { analyzeTicker } from '../packages/mcp-server/src/composites.js';
import { SKILLS } from '../packages/mcp-server/src/registry.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = JSON.parse(
  readFileSync(join(import.meta.dirname, '../skills/_fixtures/sample_input.json'), 'utf8'),
);

describe('MCP registry', () => {
  it('registers 14 skills', () => {
    expect(Object.keys(SKILLS)).toHaveLength(14);
  });
});

describe('Skill dispatch', () => {
  it('runs macro_regime', () => {
    const result = runSkill('macro_regime', fixture);
    expect(result).toHaveProperty('skill');
    expect(result.error).toBeUndefined();
  });

  it('runs technical_analysis', () => {
    const result = runSkill('technical_analysis', fixture);
    expect(result).toHaveProperty('score');
  });
});

describe('Composites', () => {
  it('analyze_ticker returns synthesis and risk', () => {
    const result = analyzeTicker(fixture);
    expect(result.skill).toBe('analyze_ticker');
    expect(result).toHaveProperty('synthesis');
    expect(result).toHaveProperty('risk');
    expect(result).toHaveProperty('stages');
  });
});
