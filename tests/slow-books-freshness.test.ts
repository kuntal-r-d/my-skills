import { describe, it, expect } from 'vitest';
import { isStaleTimestamp } from '../packages/ingest/src/jobs.ts';

describe('isStaleTimestamp', () => {
  const now = Date.parse('2026-08-10T12:00:00Z');

  it('treats missing timestamps as stale', () => {
    expect(isStaleTimestamp(null, 14, now)).toBe(true);
    expect(isStaleTimestamp(undefined, 14, now)).toBe(true);
  });

  it('is fresh inside the age window', () => {
    expect(isStaleTimestamp('2026-08-05T12:00:00Z', 14, now)).toBe(false);
    expect(isStaleTimestamp(new Date('2026-08-09T12:00:00Z'), 14, now)).toBe(false);
  });

  it('is stale past the age window', () => {
    expect(isStaleTimestamp('2026-07-20T12:00:00Z', 14, now)).toBe(true);
  });

  it('treats invalid dates as stale', () => {
    expect(isStaleTimestamp('not-a-date', 14, now)).toBe(true);
  });
});
