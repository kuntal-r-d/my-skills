import {
  type Db,
  listResearchMemos,
  upsertResearchMemo,
} from '@stock-buddy/db';
import { sectorBySlug } from '@stock-buddy/core';
import { buildMacroLandscape, buildSectorMacroDetail } from './macro-landscape.js';

const PRIORITY_SECTORS = [
  'banking',
  'pharmaceuticals',
  'food-allied',
  'cement',
  'textile',
  'power-energy',
  'telecommunications',
  'services',
];

async function callLlm(system: string, user: string): Promise<string> {
  const apiKey = process.env.STOCK_BUDDY_LLM_API_KEY;
  const provider = process.env.STOCK_BUDDY_LLM_PROVIDER ?? 'anthropic';
  if (!apiKey) throw new Error('STOCK_BUDDY_LLM_API_KEY not set');

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.STOCK_BUDDY_LLM_MODEL ?? 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3,
      }),
    });
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? '';
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.STOCK_BUDDY_LLM_MODEL ?? 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const json = (await res.json()) as { content?: Array<{ text?: string }> };
  return json.content?.map((c) => c.text ?? '').join('') ?? '';
}

function parseBullets(md: string): string[] {
  return md
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s+/, '').trim())
    .filter((l) => l.length > 10)
    .slice(0, 8);
}

async function generateSectorMemo(
  db: Db,
  slug: string,
  scope: 'bangladesh' | 'global' | 'cross_sector',
): Promise<{ ok: boolean; memo_id?: number; error?: string }> {
  const asOf = new Date().toISOString().slice(0, 10);
  const existing = await listResearchMemos(db, { sector: slug, scope, limit: 1, includeBody: false });
  const latest = existing[0];
  if (latest?.asOf === asOf) return { ok: true, memo_id: latest.id };

  const detail = scope === 'cross_sector' ? null : await buildSectorMacroDetail(db, slug);
  const landscape = await buildMacroLandscape(db);
  const canon = sectorBySlug(slug);
  const displayName = canon?.displayName ?? slug;

  const contextPayload = scope === 'cross_sector'
    ? { cross_sector_insights: landscape.cross_sector_insights, sectors: landscape.sectors?.slice(0, 6) }
    : { sector: displayName, metrics: detail?.metrics, news: detail?.news?.slice(0, 5), regime: landscape.bangladesh?.regime };

  const system = `You are a DSE macro analyst. Write concise markdown sector macro analysis for Bangladesh investors. Include 4-6 bullet key takeaways. Educational only, not financial advice.`;
  const user = `Scope: ${scope}\nSector: ${scope === 'cross_sector' ? 'cross-sector themes' : displayName}\nAs of: ${asOf}\n\nContext JSON:\n${JSON.stringify(contextPayload, null, 2)}\n\nWrite analysis with ## Summary and bullet points.`;

  try {
    const bodyMd = await callLlm(system, user);
    if (!bodyMd.trim()) return { ok: false, error: 'Empty LLM response' };

    const bullets = parseBullets(bodyMd);
    const title =
      scope === 'cross_sector'
        ? `Cross-sector macro themes — ${asOf}`
        : `${displayName} ${scope} outlook — ${asOf}`;

    const result = await upsertResearchMemo(
      db,
      {
        tickerId: null,
        title,
        bodyMd,
        summaryJson: {
          sector: scope === 'cross_sector' ? null : displayName,
          sector_slug: slug,
          scope,
          insight_type: scope === 'cross_sector' ? 'spending_trend' : 'sector_macro',
          bullets,
        },
        asOf,
      },
      { linkSessionSources: false },
    );

    return { ok: true, memo_id: result.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function refreshSectorInsights(
  db: Db,
  opts?: { sector?: string; scope?: string },
): Promise<Record<string, unknown>> {
  if (!process.env.STOCK_BUDDY_LLM_API_KEY) {
    return { ok: false, error: 'STOCK_BUDDY_LLM_API_KEY not configured' };
  }

  const results: Array<Record<string, unknown>> = [];

  if (opts?.sector) {
    const slug = opts.sector.toLowerCase();
    const scope = (opts.scope ?? 'bangladesh') as 'bangladesh' | 'global' | 'cross_sector';
    results.push({ slug, scope, ...(await generateSectorMemo(db, slug, scope)) });
    return { ok: true, refreshed: results };
  }

  for (const slug of PRIORITY_SECTORS) {
    for (const scope of ['bangladesh', 'global'] as const) {
      results.push({ slug, scope, ...(await generateSectorMemo(db, slug, scope)) });
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  results.push({ slug: 'cross_sector', scope: 'cross_sector', ...(await generateSectorMemo(db, 'cross_sector', 'cross_sector')) });

  return { ok: true, refreshed: results, sectors_total: PRIORITY_SECTORS.length };
}

export async function maybeRefreshSectorInsightsOnDaily(db: Db): Promise<void> {
  if (!process.env.STOCK_BUDDY_LLM_API_KEY) return;
  try {
    await refreshSectorInsights(db);
  } catch (err) {
    console.warn('[ingest] sector LLM insights skipped:', err);
  }
}
