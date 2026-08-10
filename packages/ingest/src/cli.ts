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
  ingestMarketIndexes,
  ingestSlowBooks,
  bootstrapTickerOnAdd,
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
        {
          const runAnalysis = !args['no-analysis'];
          console.log(
            `Running daily ingest (macro + news + indexes + OHLCV${runAnalysis ? ' + analysis' : ''} for portfolio/watchlist)...`,
          );
          const result = await ingestDaily(db, { analysis: runAnalysis });
          console.log('  macro: ok');
          console.log(`  news: ${result.news_rows} rows (${result.retagged_news} retagged)`);
          const idx = Object.entries(result.indexes ?? {});
          if (idx.length) {
            console.log(
              `  indexes: ${idx.map(([s, n]) => `${s}=${n}`).join(', ')}`,
            );
          }
          console.log(`  symbols: ${result.symbols.length ? result.symbols.join(', ') : '(none — add portfolio or watchlist tickers)'}`);
          const failed = [];
          for (const [sym, n] of Object.entries(result.ohlcv)) {
            console.log(`  ${sym}: ${n} OHLCV rows`);
            if (n === 0) failed.push(sym);
          }
          if (failed.length) {
            console.warn(
              `  ⚠ No OHLCV for: ${failed.join(', ')} — no tradeable bars after retries. ` +
                `Symbols that fail every day are usually suspended/non-trading (archive reports only a flat reference close, no OHLC) and are safe to drop from the watchlist; a symbol that recovers on the next run was a transient fetch failure.`,
            );
          }
          if (runAnalysis) {
            const analyzed = Object.entries(result.analysis);
            const failedAnalysis = analyzed.filter(([, id]) => id === 0).map(([sym]) => sym);
            console.log(
              `  analysis: ${analyzed.length - failedAnalysis.length}/${analyzed.length} snapshots persisted`,
            );
            if (failedAnalysis.length) {
              console.warn(`  ⚠ Analysis failed for: ${failedAnalysis.join(', ')}`);
            }
          } else {
            console.log('  analysis: skipped (--no-analysis)');
          }
        }
        break;
      case 'indexes':
      case 'market-indexes':
        {
          const result = await ingestMarketIndexes(db, days);
          console.log(
            'Indexes:',
            Object.entries(result)
              .map(([s, n]) => `${s}=${n}`)
              .join(', ') || '(none)',
          );
        }
        break;
      case 'slow-books':
      case 'weekly-books':
        {
          console.log(
            'Running lean weekly books (fundamentals + shareholding if stale, OHLCV top-up if short history)...',
          );
          const result = await ingestSlowBooks(db);
          console.log(`  symbols: ${result.symbols.length ? result.symbols.join(', ') : '(none)'}`);
          for (const sym of result.symbols) {
            console.log(
              `  ${sym}: fund=${result.fundamentals[sym]} share=${result.shareholding[sym]} ohlcv=${result.ohlcv[sym]}`,
            );
          }
        }
        break;
      case 'bootstrap':
      case 'on-add':
        await bootstrapTickerOnAdd(db, ticker, days);
        console.log(`Bootstrap complete for ${ticker}`);
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
