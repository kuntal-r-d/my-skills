import { describe, expect, it } from 'vitest';
import { findUniqueNearMatch, isAdjacentTransposition, isLikelySymbolTypo, levenshtein } from '../src/symbols.js';

describe('symbol typo resolution', () => {
  it('detects UPGDLC as transposition of UPGDCL', () => {
    expect(isAdjacentTransposition('UPGDLC', 'UPGDCL')).toBe(true);
    expect(isLikelySymbolTypo('UPGDLC', 'UPGDCL')).toBe(true);
    expect(findUniqueNearMatch('UPGDLC', ['UPGDCL', 'GP', 'LHB'])).toBe('UPGDCL');
  });

  it('returns null when multiple neighbors exist', () => {
    expect(findUniqueNearMatch('ABC', ['ABD', 'ACB'])).toBeNull();
  });
});
