import { getDisclaimer } from '@stock-buddy/core';

/** Prompt-first sector macro skill — returns context + instructions for host LLM. */
export function context(data: Record<string, unknown>): Record<string, unknown> {
  const sector = data.sector ? String(data.sector) : undefined;
  const scope = data.scope ? String(data.scope) : 'both';
  const asOf = data.as_of ? String(data.as_of) : new Date().toISOString().slice(0, 10);
  const providedContext = data.context as Record<string, unknown> | undefined;
  const memoBody = data.memo_body ? String(data.memo_body).trim() : '';

  if (memoBody) {
    const summary = data.summary_json as Record<string, unknown> | undefined;
    return {
      skill: 'sector-macro-insights',
      ticker: data.ticker ?? 'MARKET',
      mode: 'both',
      as_of: asOf,
      score: 0,
      confidence: 0.7,
      rating: 'context_ready',
      key_metrics: {
        sector: sector ?? summary?.sector,
        scope: summary?.scope ?? scope,
        insight_type: summary?.insight_type ?? 'sector_macro',
        bullets: summary?.bullets ?? [],
      },
      reasoning: ['Memo body received — persist via stock-buddy-data.upsert_research_memo'],
      flags: [],
      disclaimer: getDisclaimer(),
      memo_validated: true,
    };
  }

  const instructions = [
    '1. Call stock-buddy-data.get_sector_macro_context({ sector, scope, days: 14 }) for structured data.',
    '2. Web-research Bangladesh and global drivers for the sector/theme.',
    '3. stock-buddy-data.upsert_research_sources({ sources: [...] }) with category macro or news.',
    '4. stock-buddy-data.upsert_research_memo({ title, body_md, summary_json: { sector, sector_slug, scope, insight_type, bullets[] }, as_of })',
    '5. Return Thinking Card JSON with score, reasoning, and key_metrics.bullets.',
  ];

  return {
    skill: 'sector-macro-insights',
    ticker: data.ticker ?? 'MARKET',
    mode: 'both',
    as_of: asOf,
    score: 0,
    confidence: 0.5,
    rating: 'instructions',
    key_metrics: { sector, scope, insight_type: data.insight_type ?? 'sector_macro' },
    reasoning: instructions,
    flags: providedContext ? [] : ['needs_context'],
    instructions,
    suggested_prompt: sector
      ? `Analyze ${sector} sector macro outlook for Bangladesh and globally. Cover demand trends, regulatory backdrop, and DSE implications. Save memo with scope bangladesh and global separately if needed.`
      : 'Analyze cross-sector macro themes in Bangladesh (e.g. real estate spending slowdown, FMCG volume pressure). Save as scope cross_sector.',
    context: providedContext ?? null,
    disclaimer: getDisclaimer(),
  };
}
