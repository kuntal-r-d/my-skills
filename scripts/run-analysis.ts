import { createDb, closeDb } from '@stock-buddy/db';
import { buildTickerContract, stripMeta } from '@stock-buddy/ingest';
import { analyzeTicker } from '../packages/mcp-server/src/composites.ts';

const ticker = process.argv[2]?.toUpperCase() ?? 'LHB';
const db = createDb();
try {
  const contract = await buildTickerContract(db, ticker, {
    includePortfolio: true,
    ohlcvDays: 260,
  });
  const meta = contract._meta;
  console.log(
    JSON.stringify({
      ticker,
      ohlcv_count: contract.ohlcv?.length,
      missing: meta?.missing,
      as_of: contract.as_of,
      last_close: contract.ohlcv?.at(-1)?.close,
    }),
  );
  const analysis = analyzeTicker(stripMeta(contract));
  console.log(JSON.stringify(analysis, null, 2));
} finally {
  await closeDb(db);
}
