import {
  getLatestMacro,
  getLatestSectorSnapshots,
  getSectorSnapshot,
  getSectorNews,
  listCanonicalSectors,
  listResearchMemos,
  type Db,
} from '@stock-buddy/db';
import { sectorBySlug, sectorPeBenchmark } from '@stock-buddy/core';
import { runSkill } from '@stock-buddy/mcp-server/composites';

function assessMacroRegime(
  macroRaw: Record<string, unknown> | undefined,
  asOf: string,
): Record<string, unknown> | undefined {
  if (!macroRaw) return undefined;
  const assessed = runSkill('macro_regime', { macro: macroRaw, as_of: asOf });
  if ('error' in assessed) return undefined;
  const km = assessed.key_metrics as Record<string, unknown> | undefined;
  return {
    rating: assessed.rating,
    risk_multiplier: km?.risk_multiplier,
    score: assessed.score,
    confidence: assessed.confidence,
    reasoning: assessed.reasoning,
    flags: assessed.flags,
    drivers: km?.drivers,
  };
}

function formatMemo(row: Awaited<ReturnType<typeof listResearchMemos>>[number]) {
  const sj = row.summaryJson as Record<string, unknown> | null;
  return {
    id: row.id,
    title: row.title,
    as_of: row.asOf,
    created_at: row.createdAt,
    summary: sj,
    bullets: (sj?.bullets as string[] | undefined) ?? [],
    body_md: 'bodyMd' in row ? (row as { bodyMd: string }).bodyMd : undefined,
  };
}

export async function buildMacroLandscape(db: Db) {
  const asOf = new Date().toISOString().slice(0, 10);
  const macroSnap = await getLatestMacro(db);
  const macroRaw = macroSnap?.payload as Record<string, unknown> | undefined;
  const global = (macroRaw?.global as Record<string, unknown> | undefined) ?? {};
  const regime = assessMacroRegime(macroRaw, asOf);

  const canonical = await listCanonicalSectors(db);
  const snapshots = await getLatestSectorSnapshots(db);
  const snapshotBySlug = new Map(snapshots.map((s) => [s.sectorSlug, s]));

  const sectorGrid = canonical.map((c) => {
    const snap = snapshotBySlug.get(c.slug);
    const metrics = snap?.metricsJson as Record<string, unknown> | undefined;
    const newsSummary = snap?.newsSummaryJson as Record<string, unknown> | undefined;
    return {
      slug: c.slug,
      display_name: c.displayName,
      as_of: snap?.asOf ?? null,
      metrics: metrics ?? null,
      news_count_7d: newsSummary?.news_count_7d ?? 0,
      pe_benchmark: sectorPeBenchmark(c.displayName),
    };
  });

  const crossSectorMemos = await listResearchMemos(db, {
    scope: 'cross_sector',
    limit: 10,
    includeBody: false,
  });

  const globalMemos = await listResearchMemos(db, {
    scope: 'global',
    limit: 3,
    includeBody: false,
  });

  return {
    as_of: macroSnap?.asOf ?? asOf,
    bangladesh: {
      macro: macroSnap
        ? { as_of: macroSnap.asOf, source: macroSnap.source, payload: macroRaw }
        : null,
      regime,
    },
    global: {
      indicators: global,
      memo: globalMemos[0] ? formatMemo(globalMemos[0] as Awaited<ReturnType<typeof listResearchMemos>>[number]) : null,
    },
    sectors: sectorGrid,
    cross_sector_insights: crossSectorMemos.map((m) =>
      formatMemo(m as Awaited<ReturnType<typeof listResearchMemos>>[number]),
    ),
  };
}

export async function buildSectorMacroDetail(db: Db, slug: string) {
  const canon = sectorBySlug(slug);
  if (!canon) {
    const rows = await listCanonicalSectors(db);
    const found = rows.find((r) => r.slug === slug);
    if (!found) return null;
  }

  const displayName = canon?.displayName ?? slug;
  const snap = await getSectorSnapshot(db, slug);
  const metrics = snap?.metricsJson as Record<string, unknown> | undefined;
  const news = await getSectorNews(db, displayName, 7, 30);

  const bdMemos = await listResearchMemos(db, {
    sector: slug,
    scope: 'bangladesh',
    limit: 3,
    includeBody: true,
  });
  const globalMemos = await listResearchMemos(db, {
    sector: slug,
    scope: 'global',
    limit: 3,
    includeBody: true,
  });

  return {
    slug,
    display_name: displayName,
    as_of: snap?.asOf ?? null,
    metrics: metrics ?? null,
    news_summary: snap?.newsSummaryJson ?? null,
    news: news.map((n) => ({
      headline: n.headline,
      published_date: n.publishedDate,
      source: n.source,
      category: n.category,
      url: n.url,
    })),
    bangladesh_analysis: bdMemos.map((m) =>
      formatMemo(m as Awaited<ReturnType<typeof listResearchMemos>>[number]),
    ),
    global_analysis: globalMemos.map((m) =>
      formatMemo(m as Awaited<ReturnType<typeof listResearchMemos>>[number]),
    ),
    pe_benchmark: sectorPeBenchmark(displayName),
  };
}

export async function listMacroInsights(
  db: Db,
  opts: { scope?: string; sector?: string; insightType?: string; limit?: number },
) {
  const memos = await listResearchMemos(db, {
    scope: opts.scope,
    sector: opts.sector,
    insightType: opts.insightType,
    limit: opts.limit ?? 20,
    includeBody: false,
  });
  return memos.map((m) => formatMemo(m as Awaited<ReturnType<typeof listResearchMemos>>[number]));
}
