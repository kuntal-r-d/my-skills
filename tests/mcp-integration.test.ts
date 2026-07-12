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
  it('registers 19 skills', () => {
    expect(Object.keys(SKILLS)).toHaveLength(23);
    expect(SKILLS).toHaveProperty('sector_macro_insights');
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

  it('runs sector_macro_insights', () => {
    const result = runSkill('sector_macro_insights', { sector: 'pharmaceuticals', scope: 'both' });
    expect(result.skill).toBe('sector-macro-insights');
    expect(result.rating).toBe('instructions');
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

  it('analyze_ticker with ticker-only returns client research instructions', () => {
    const result = analyzeTicker({ ticker: 'WALTONHIL' });
    expect(result.error).toBe('insufficient_data_contract');
    expect(result.instructions).toBeDefined();
    expect(result.instructions).toHaveProperty('client_agent_action');
    expect(result.instructions).toHaveProperty('source_selection_policy');
    expect(result.instructions).toHaveProperty('missing_core_fields');
    expect(result.instructions).toHaveProperty('example_public_sources');
    expect(result.instructions).toHaveProperty('suggested_public_sources');
  });
});
