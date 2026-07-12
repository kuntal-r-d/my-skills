export interface LivermorePivot {
  pivot: number;
  prior_pivot: number | null;
  crossed: boolean;
  volume_confirmed: boolean;
  add_levels: number[];
  trail_stop: number | null;
}

/** Identify Livermore-style pivot (consolidation high) and pyramiding rungs. */
export function detectLivermorePivot(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  window = 20,
): LivermorePivot | null {
  if (closes.length < window + 5) return null;

  const px = closes[closes.length - 1]!;
  const hWindow = highs.slice(-window - 1, -1);
  const pivot = Math.max(...hWindow);
  if (!Number.isFinite(pivot) || pivot <= 0) return null;

  const priorWindow = highs.slice(-window * 2 - 1, -window - 1);
  const priorPivot = priorWindow.length ? Math.max(...priorWindow) : null;

  const avgVol = volumes.slice(-window).reduce((a, b) => a + b, 0) / window;
  const lastVol = volumes[volumes.length - 1] ?? 0;
  const crossed = px > pivot;
  const volumeConfirmed = crossed && lastVol > avgVol;

  const addLevels: number[] = [];
  if (pivot > px) addLevels.push(Math.round(pivot * 100) / 100);
  if (priorPivot != null && priorPivot > pivot) {
    addLevels.push(Math.round(priorPivot * 100) / 100);
  }
  const sortedHighs = [...highs].sort((a, b) => b - a);
  for (const level of sortedHighs) {
    if (level > px && !addLevels.includes(Math.round(level * 100) / 100)) {
      addLevels.push(Math.round(level * 100) / 100);
    }
    if (addLevels.length >= 2) break;
  }

  const trailStop = priorPivot != null ? Math.round(Math.min(...lows.slice(-window)) * 100) / 100 : null;

  return {
    pivot: Math.round(pivot * 100) / 100,
    prior_pivot: priorPivot != null ? Math.round(priorPivot * 100) / 100 : null,
    crossed,
    volume_confirmed: volumeConfirmed,
    add_levels: addLevels.slice(0, 2),
    trail_stop: trailStop,
  };
}
