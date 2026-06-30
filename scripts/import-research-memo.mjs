#!/usr/bin/env node
/** Import a markdown research memo into PostgreSQL via @stock-buddy/db repos. */
import { readFileSync } from 'node:fs';
import {
  closeDb,
  createDb,
  getTickerBySymbol,
  linkResearchSourcesToMemo,
  upsertResearchMemo,
} from '../packages/db/dist/index.js';

const [filePath, tickerArg, sessionIdArg] = process.argv.slice(2);
if (!filePath || !tickerArg) {
  console.error('Usage: node scripts/import-research-memo.mjs <path.md> <TICKER> [session_id]');
  process.exit(1);
}

const bodyMd = readFileSync(filePath, 'utf8');
const ticker = tickerArg.toUpperCase();
const sessionId = sessionIdArg ?? `import-${ticker}-${new Date().toISOString().slice(0, 10)}`;
const titleMatch = bodyMd.match(/^#\s+(.+)$/m);
const title = titleMatch?.[1]?.trim() ?? `${ticker} Research Memo`;

const db = createDb();
try {
  const t = await getTickerBySymbol(db, ticker);
  if (!t) {
    console.error(`Unknown ticker: ${ticker}`);
    process.exit(1);
  }

  const result = await upsertResearchMemo(
    db,
    {
      tickerId: t.id,
      sessionId,
      clientId: 'import-script',
      title,
      bodyMd,
      asOf: '2026-06-21',
      summaryJson: { imported_from: filePath, ticker },
    },
    { linkSessionSources: true },
  );

  const extra = await linkResearchSourcesToMemo(db, result.id, { tickerId: t.id });

  console.log(
    JSON.stringify(
      {
        ok: true,
        memo_id: result.id,
        version: result.version,
        sources_linked: result.sources_linked + extra,
        body_md_length: bodyMd.length,
      },
      null,
      2,
    ),
  );
} finally {
  await closeDb(db);
}
