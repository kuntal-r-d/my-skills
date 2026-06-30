#!/usr/bin/env node
import { createDb, closeDb, loadEnv } from '@stock-buddy/db';
import {
  ingestAll,
  ingestFundamentals,
  ingestMacro,
  ingestNews,
  ingestNewsMarket,
  ingestRetagNews,
  ingestOhlcv,
  ingestShareholding,
  ingestWatchlist,
  ingestDaily,
  ingestFundamentalsUniverse,
} from './jobs.js';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const db = createDb();

  try {
    if (args.watchlist) {
      const days = args.days ? parseInt(String(args.days), 10) : 365;
      console.log('Ingesting watchlist...');
      await ingestWatchlist(db, days);
      console.log('Done.');
      return;
    }

    const ticker = String(args.ticker ?? 'LHB').toUpperCase();
    const job = String(args.job ?? 'all');
    const days = args.days ? parseInt(String(args.days), 10) : 365;

    switch (job) {
      case 'ohlcv':
        console.log(await ingestOhlcv(db, ticker, days), 'OHLCV rows');
        break;
      case 'fundamentals-universe':
        console.log(await ingestFundamentalsUniverse(db), 'tickers from Lankabd DataMatrix');
        break;
      case 'fundamentals':
        await ingestFundamentals(db, ticker);
        console.log('Fundamentals ingested');
        break;
      case 'shareholding':
        console.log(await ingestShareholding(db, ticker), 'shareholding rows');
        break;
      case 'macro':
        await ingestMacro(db);
        console.log('Macro ingested');
        break;
      case 'news':
        console.log(await ingestNews(db, ticker), 'DSE news rows');
        break;
      case 'news-market':
        console.log(await ingestNewsMarket(db), 'market news rows inserted/retagged');
        break;
      case 'retag-news':
        console.log(await ingestRetagNews(db), 'news rows tagged');
        break;
      case 'daily':
        console.log('Running daily ingest (macro + news + OHLCV for portfolio/watchlist)...');
        {
          const result = await ingestDaily(db);
          console.log('  macro: ok');
          console.log(`  news: ${result.news_rows} rows (${result.retagged_news} retagged)`);
          console.log(`  symbols: ${result.symbols.length ? result.symbols.join(', ') : '(none — add portfolio or watchlist tickers)'}`);
          const failed = [];
          for (const [sym, n] of Object.entries(result.ohlcv)) {
            console.log(`  ${sym}: ${n} OHLCV rows`);
            if (n === 0) failed.push(sym);
          }
          if (failed.length) {
            console.warn(
              `  ⚠ No OHLCV for: ${failed.join(', ')} — DSE archive may be empty for these symbols; try Analyze after a full ingest.`,
            );
          }
        }
        break;
      case 'analysis':
        const { ingestAnalysis } = await import('./analysis.js');
        console.log(await ingestAnalysis(db, ticker), 'analysis snapshot id');
        break;
      case 'all':
        await ingestNewsMarket(db);
        await ingestAll(db, ticker, days);
        console.log(`All jobs complete for ${ticker}`);
        break;
      default:
        console.error(`Unknown job: ${job}`);
        process.exit(1);
    }
  } finally {
    await closeDb(db);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
