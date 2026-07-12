export interface VcpSegment {
  range_pct: number;
  avg_volume: number;
  pullback_volume_ratio: number | null;
}

export interface VcpDetection {
  segments: VcpSegment[];
  progressive: boolean;
  final_tightest: boolean;
  pivot: number;
  distance_to_pivot_pct: number | null;
  volume_dry_up: boolean;
  breakout_volume_surge: boolean;
  launchpad_ready: boolean;
  final_range_pct: number | null;
}

function segmentRangePct(highs: number[], lows: number[], start: number, len: number): number | null {
  const h = highs.slice(start, start + len);
  const l = lows.slice(start, start + len);
  if (h.length < len) return null;
  const hi = Math.max(...h);
  const lo = Math.min(...l);
  if (lo <= 0) return null;
  return ((hi - lo) / lo) * 100;
}

/** Detect Minervini-style VCP with progressive contractions on daily bars. */
export function detectVcp(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  segmentLen = 15,
): VcpDetection | null {
  const minBars = segmentLen * 3 + 10;
  if (closes.length < minBars) return null;

  const n = closes.length;
  const segments: VcpSegment[] = [];
  const offsets = [segmentLen * 2, segmentLen, 0];

  for (const off of offsets) {
    const start = n - segmentLen - off;
    if (start < 0) continue;
    const rng = segmentRangePct(highs, lows, start, segmentLen);
    if (rng == null) continue;
    const volSlice = volumes.slice(start, start + segmentLen);
    const avgVol = volSlice.reduce((a, b) => a + b, 0) / volSlice.length;
    const mid = Math.floor(segmentLen / 2);
    const pullbackVol = volSlice.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const rallyVol = volSlice.slice(mid).reduce((a, b) => a + b, 0) / (segmentLen - mid);
    const ratio = rallyVol > 0 ? pullbackVol / rallyVol : null;
    segments.push({
      range_pct: Math.round(rng * 10) / 10,
      avg_volume: Math.round(avgVol),
      pullback_volume_ratio: ratio != null ? Math.round(ratio * 100) / 100 : null,
    });
  }

  if (segments.length < 2) return null;

  const progressive =
    segments.length >= 2 &&
    segments.every((s, i) => i === 0 || s.range_pct < segments[i - 1]!.range_pct);

  const finalRange = segments[segments.length - 1]!.range_pct;
  const priorRange = segments.length >= 2 ? segments[segments.length - 2]!.range_pct : finalRange;
  const finalTightest = finalRange <= priorRange && finalRange <= 8;

  const lookback = Math.min(25, n);
  const pivot = Math.max(...highs.slice(-lookback));
  const px = closes[closes.length - 1]!;
  const distPivot = pivot > 0 ? ((pivot - px) / pivot) * 100 : null;

  const volDry =
    segments.length >= 2 &&
    segments[segments.length - 1]!.pullback_volume_ratio != null &&
    segments[segments.length - 1]!.pullback_volume_ratio! < 0.85;

  const avg20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVol = volumes[volumes.length - 1] ?? 0;
  const breakoutSurge = px >= pivot * 0.998 && lastVol > avg20 * 1.4;

  const launchpadReady =
    progressive &&
    finalTightest &&
    volDry &&
    distPivot != null &&
    distPivot >= -2 &&
    distPivot <= 8;

  return {
    segments,
    progressive,
    final_tightest: finalTightest,
    pivot: Math.round(pivot * 100) / 100,
    distance_to_pivot_pct: distPivot != null ? Math.round(distPivot * 10) / 10 : null,
    volume_dry_up: volDry,
    breakout_volume_surge: breakoutSurge,
    launchpad_ready: launchpadReady,
    final_range_pct: Math.round(finalRange * 10) / 10,
  };
}
