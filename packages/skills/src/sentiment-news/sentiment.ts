export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

const POSITIVE = new Set([
  'profit', 'record', 'growth', 'grow', 'dividend', 'beats', 'beat', 'upgrade',
  'upgraded', 'expansion', 'expand', 'surge', 'surges', 'wins', 'win', 'won',
  'rises', 'rise', 'rally', 'jump', 'gain', 'gains', 'strong', 'high', 'highs',
  'outperform', 'approval', 'approved', 'award', 'bonus', 'buyback', 'rebound',
]);

const NEGATIVE = new Set([
  'loss', 'losses', 'fraud', 'probe', 'decline', 'declines', 'downgrade',
  'downgraded', 'default', 'halt', 'halted', 'suspension', 'suspended',
  'penalty', 'fall', 'falls', 'fell', 'drop', 'drops', 'plunge', 'plunges',
  'weak', 'miss', 'misses', 'missed', 'lawsuit', 'scandal', 'delist',
  'delisting', 'warning', 'cut', 'cuts', 'slump',
]);

const RUMOUR_SOURCES = new Set(['social', 'unconfirmed', 'forum', 'rumour', 'rumor']);
const RUMOUR_TERMS = new Set(['rumour', 'rumor', 'unconfirmed', 'speculation', 'speculative', 'alleged']);
const FUNDAMENTAL_CATEGORIES = new Set(['earnings', 'regulatory', 'corporate_action', 'macro']);
const RUMOUR_WEIGHT = 0.3;
const WORD = /[a-zA-Z]+/g;

function clamp(x: number, lo = -1.0, hi = 1.0): number {
  return Math.max(lo, Math.min(hi, x));
}

function itemSentiment(headline: string): number {
  const words = (headline || '').match(WORD)?.map((w) => w.toLowerCase()) ?? [];
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE.has(w)) pos++;
    if (NEGATIVE.has(w)) neg++;
  }
  if (pos === 0 && neg === 0) return 0.0;
  return clamp((pos - neg) / (pos + neg));
}

function isRumour(item: Record<string, unknown>): boolean {
  const src = String(item.source ?? '').toLowerCase();
  const cat = String(item.category ?? '').toLowerCase();
  const head = String(item.headline ?? '').toLowerCase();
  if (RUMOUR_SOURCES.has(src) || RUMOUR_TERMS.has(cat)) return true;
  for (const t of RUMOUR_TERMS) {
    if (head.includes(t)) return true;
  }
  return false;
}

export function analyze(data: Record<string, unknown>): Record<string, unknown> {
  const news = data.news;
  const flags: string[] = [];
  if (!Array.isArray(news)) {
    return { skill: 'sentiment-news', error: 'missing `news` array' };
  }

  const itemCount = news.length;
  if (itemCount === 0) {
    return { skill: 'sentiment-news', error: 'empty `news` array' };
  }

  const reasoning: string[] = [];
  const fundamentalSents: number[] = [];
  let rumourCount = 0;
  let fundamentalCount = 0;
  let weightedSum = 0.0;
  let weightTotal = 0.0;

  for (const it of news as Record<string, unknown>[]) {
    const s = itemSentiment(String(it.headline ?? ''));
    const rumour = isRumour(it);
    const cat = String(it.category ?? '').toLowerCase();
    const isFundamental = !rumour && FUNDAMENTAL_CATEGORIES.has(cat);

    let label: string;
    let weight: number;
    if (rumour) {
      label = 'RUMOUR';
      weight = RUMOUR_WEIGHT;
      rumourCount++;
    } else if (isFundamental) {
      label = 'FUNDAMENTAL';
      weight = 1.0;
      fundamentalCount++;
      fundamentalSents.push(s);
    } else {
      label = 'general';
      weight = 0.7;
    }

    weightedSum += s * weight;
    weightTotal += weight;

    if (Math.abs(s) >= 0.5 || rumour) {
      const tone = s > 0 ? 'positive' : s < 0 ? 'negative' : 'neutral';
      reasoning.push(
        `[${label}] '${it.headline ?? ''}' (${it.source ?? '?'}) -> ${tone} (${s >= 0 ? '+' : ''}${s.toFixed(2)})`,
      );
    }
  }

  let score = weightTotal ? clamp(weightedSum / weightTotal) : 0.0;
  const avgFund = fundamentalSents.length
    ? fundamentalSents.reduce((a, b) => a + b, 0) / fundamentalSents.length
    : 0.0;

  const rumourDominated = rumourCount > 0 && fundamentalCount === 0;
  if (rumourDominated) {
    score = clamp(score, -0.4, 0.4);
    flags.push('rumour_dominated');
  }
  if (itemCount < 2) flags.push('thin_coverage');

  let confidence = 0.4 + 0.1 * Math.min(fundamentalCount, 4) + 0.05 * Math.min(itemCount, 4);
  if (rumourDominated) confidence -= 0.2;
  if (flags.includes('thin_coverage')) confidence -= 0.15;
  confidence = clamp(confidence, 0.15, 0.9);

  let rating: string;
  if (score >= 0.2) rating = 'positive';
  else if (score <= -0.2) rating = 'negative';
  else rating = 'neutral';

  if (reasoning.length === 0) {
    reasoning.push('No headline carried decisive sentiment keywords — neutral read.');
  }

  return {
    skill: 'sentiment-news',
    ticker: data.ticker,
    mode: data.mode ?? 'both',
    as_of: data.as_of,
    score: Math.round(score * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
    rating,
    key_metrics: {
      item_count: itemCount,
      fundamental_count: fundamentalCount,
      rumour_count: rumourCount,
      avg_fundamental_sentiment: Math.round(avgFund * 1000) / 1000,
    },
    reasoning,
    flags,
    disclaimer: DISCLAIMER,
  };
}
