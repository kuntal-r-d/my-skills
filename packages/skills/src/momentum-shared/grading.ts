export const MOMENTUM_DISCLAIMER = 'Educational analysis only. Not financial advice.';

export function gradeFromScore(score: number): string {
  if (score >= 0.9) return 'A+';
  if (score >= 0.8) return 'A';
  if (score >= 0.7) return 'B+';
  if (score >= 0.6) return 'B';
  if (score >= 0.5) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}

export function slopeRising(series: (number | null)[], lookback = 21): boolean | null {
  const vals = series.filter((x): x is number => x != null);
  if (vals.length < 2) return null;
  const a = vals[vals.length - Math.min(lookback, vals.length)]!;
  const b = vals[vals.length - 1]!;
  return b > a;
}
