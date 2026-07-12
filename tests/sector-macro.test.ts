import { describe, expect, it } from 'vitest';
import {
  normalizeSector,
  sectorSlug,
  detectSectorFromHeadline,
  CANONICAL_SECTORS,
} from '../packages/core/src/sectors.js';
import { runSkill } from '../packages/mcp-server/src/dispatch.js';

describe('sector taxonomy', () => {
  it('normalizes common aliases', () => {
    expect(normalizeSector('Pharma')).toBe('Pharmaceuticals');
    expect(normalizeSector('Bank')).toBe('Banking');
    expect(normalizeSector('FMCG')).toBe('Food & Allied');
    expect(normalizeSector('Consumer')).toBe('Food & Allied');
    expect(normalizeSector('Industrial')).toBe('Engineering');
  });

  it('maps slug from display or alias', () => {
    expect(sectorSlug('Pharma')).toBe('pharmaceuticals');
    expect(sectorSlug('Banking')).toBe('banking');
  });

  it('detects sector from headlines', () => {
    expect(detectSectorFromHeadline('Bangladesh pharma exports rise')).toBe('pharmaceuticals');
    expect(detectSectorFromHeadline('Real estate spending slows in Dhaka')).toBe('services');
    expect(detectSectorFromHeadline('Cement demand weakens')).toBe('cement');
  });

  it('has canonical sectors seeded', () => {
    expect(CANONICAL_SECTORS.length).toBeGreaterThanOrEqual(10);
  });
});

describe('sector_macro_insights skill', () => {
  it('returns instructions when no memo body', () => {
    const result = runSkill('sector_macro_insights', {
      sector: 'Pharmaceuticals',
      scope: 'both',
      as_of: '2026-07-01',
    });
    expect(result.skill).toBe('sector-macro-insights');
    expect(result.rating).toBe('instructions');
    expect(result.reasoning).toBeInstanceOf(Array);
    expect((result.reasoning as string[]).length).toBeGreaterThan(0);
  });

  it('validates memo body when provided', () => {
    const result = runSkill('sector_macro_insights', {
      memo_body: '## Summary\n- Test bullet',
      summary_json: { sector: 'Banking', scope: 'bangladesh', bullets: ['Test'] },
    });
    expect(result.memo_validated).toBe(true);
  });
});
