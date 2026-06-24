/** Levenshtein distance — used to catch single-character DSE symbol typos. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

/** Two symbols differ only by swapping two adjacent characters (e.g. UPGDLC ↔ UPGDCL). */
export function isAdjacentTransposition(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diffs.push(i);
  }
  if (diffs.length !== 2) return false;
  const [i, j] = diffs;
  return a[i] === b[j] && a[j] === b[i];
}

/** Single-char edit or adjacent transposition — common DSE ticker typos. */
export function isLikelySymbolTypo(a: string, b: string): boolean {
  return levenshtein(a, b) === 1 || isAdjacentTransposition(a, b);
}

/** If exactly one known symbol matches a likely typo, return it. */
export function findUniqueNearMatch(requested: string, known: string[]): string | null {
  const matches = known.filter((k) => isLikelySymbolTypo(requested, k));
  return matches.length === 1 ? matches[0]! : null;
}

/** Prefer a seeded/canonical row over a stub typo duplicate. */
export function isStubTicker(row: { name?: string | null; sector?: string | null }): boolean {
  return !row.name && !row.sector;
}
