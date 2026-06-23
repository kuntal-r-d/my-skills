export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

const CARD_LABELS: Record<string, string> = {
  technical: 'Technical Analysis',
  momentum: 'Momentum Screen',
  pattern: 'Pattern Miner',
  fundamental: 'Fundamental Analysis',
  value: 'Value Checklist',
  smart_money: 'Smart-Money Flow',
  sentiment: 'Sentiment & News',
  macro: 'Macro Regime',
  synthesizer: 'Signal Synthesizer',
  risk: 'Risk Manager',
};

const ALL_CARDS = Object.keys(CARD_LABELS);

function fmt(x: unknown): string {
  if (x == null) return '-';
  if (typeof x === 'number') {
    return `${x.toFixed(3)}`.replace(/\.?0+$/, '');
  }
  return String(x);
}

function verdictRow(label: string, card: Record<string, unknown>): string | null {
  const rating = card.rating ?? card.grade ?? card.status ?? '-';
  let score = card.score;
  if (score == null) score = card.composite_score ?? card.dse_composite_score;
  const conf = card.confidence;
  return `| ${label} | ${fmt(rating)} | ${fmt(score)} | ${fmt(conf)} |`;
}

function cardBlock(label: string, card: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const rating = card.rating ?? card.grade ?? card.status;
  const score = card.score ?? card.composite_score;
  const conf = card.confidence;
  const bits: string[] = [];
  if (rating != null) bits.push(`**Rating:** ${fmt(rating)}`);
  if (score != null) bits.push(`**Score:** ${fmt(score)}`);
  if (conf != null) bits.push(`**Confidence:** ${fmt(conf)}`);
  if (bits.length) lines.push(bits.join(' · '));
  const reasoning = (card.reasoning ?? card.notes) as unknown;
  if (Array.isArray(reasoning) && reasoning.length) {
    for (const r of reasoning.slice(0, 8)) lines.push(`- ${r}`);
  }
  const fl = card.flags;
  if (Array.isArray(fl) && fl.length) {
    lines.push(`- _Flags: ${fl.map(String).join(', ')}_`);
  }
  if (!lines.length) lines.push(`_${label}: card supplied but no readable fields._`);
  lines.push('');
  return lines;
}

function section(md: string[], title: string, keys: string[], cards: Record<string, unknown>): void {
  md.push(`## ${title}`);
  const present = keys.filter((k) => cards[k] && typeof cards[k] === 'object');
  if (!present.length) {
    md.push('_No analyses supplied for this section._');
    md.push('');
    return;
  }
  for (const k of keys) {
    if (k in cards) {
      md.push(`### ${CARD_LABELS[k]}`);
      md.push(...cardBlock(CARD_LABELS[k]!, cards[k] as Record<string, unknown>));
    }
  }
}

export function render(data: Record<string, unknown>): Record<string, unknown> {
  const ticker = (data.ticker as string) ?? '(unknown)';
  const asOf = (data.as_of as string) ?? '(date unknown)';
  const rawCards = data.cards;
  const cards: Record<string, unknown> =
    rawCards && typeof rawCards === 'object' && !Array.isArray(rawCards)
      ? (rawCards as Record<string, unknown>)
      : {};

  const included = ALL_CARDS.filter((k) => cards[k] && typeof cards[k] === 'object');
  const missing = ALL_CARDS.filter((k) => !included.includes(k));

  const md: string[] = [];
  md.push(`# Ticker Dossier — ${ticker}`);
  md.push('');
  md.push(`**As of:** ${asOf}  `);
  md.push(`**Disclaimer:** ${DISCLAIMER}`);
  md.push('');
  md.push(
    '> This dossier consolidates the analyses supplied by Stock Buddy\'s component skills. It contains educational analysis only and is not individualised investment advice or an instruction to trade.',
  );
  md.push('');

  md.push('## At a glance');
  if (included.length) {
    md.push('| Analysis | Rating | Score | Confidence |');
    md.push('|----------|--------|-------|------------|');
    for (const k of ALL_CARDS) {
      if (included.includes(k)) {
        const row = verdictRow(CARD_LABELS[k]!, cards[k] as Record<string, unknown>);
        if (row) md.push(row);
      }
    }
    md.push('');
  } else {
    md.push(
      '_No analyses supplied — this is a skeleton dossier. Run the component skills (technical-analysis, fundamental-analysis, etc.) and pass their Thinking Cards under `cards` to populate this report._',
    );
    md.push('');
  }

  section(md, 'Investment view', ['fundamental', 'value'], cards);
  section(md, 'Momentum view', ['technical', 'momentum', 'pattern'], cards);
  section(md, 'Risk & levels', ['risk'], cards);
  section(md, 'Smart-money & sentiment', ['smart_money', 'sentiment'], cards);
  section(md, 'Macro context', ['macro'], cards);
  section(md, 'Synthesised signal', ['synthesizer'], cards);

  md.push('## Data provenance & missing analyses');
  md.push(
    `- **Included cards (${included.length}):** ${included.length ? included.map((k) => CARD_LABELS[k]).join(', ') : 'none'}`,
  );
  md.push(
    `- **Missing cards (${missing.length}):** ${missing.length ? missing.map((k) => CARD_LABELS[k]).join(', ') : 'none'}`,
  );
  md.push('- Verdicts above are only as current as the cards supplied; re-run the component skills to refresh.');
  md.push('');

  return {
    skill: 'ticker-dossier',
    ticker,
    as_of: asOf,
    markdown: md.join('\n'),
    included_cards: included,
    missing_cards: missing,
    disclaimer: DISCLAIMER,
  };
}
