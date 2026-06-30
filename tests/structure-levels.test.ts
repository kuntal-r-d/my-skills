import { describe, expect, it } from 'vitest';
import { buildStructureLadder } from '../packages/skills/src/risk-manager/structure-levels.js';

describe('structure-levels', () => {
  it('finds next support and resistance below/above price', () => {
    const closes = [50, 52, 55, 54, 56, 58, 57, 55, 53, 51, 49, 48, 50, 52, 54, 55];
    const lows = closes.map((c) => c - 1);
    const highs = closes.map((c) => c + 1);
    const ladder = buildStructureLadder(closes, lows, highs, closes.length, 55);
    expect(ladder.support).toBeLessThanOrEqual(55);
    expect(ladder.resistance).toBeGreaterThanOrEqual(55);
    expect(ladder.next_support == null || ladder.next_support < ladder.support).toBe(true);
    expect(ladder.next_resistance == null || ladder.next_resistance > ladder.resistance).toBe(true);
  });
});
