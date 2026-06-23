#!/usr/bin/env node
import { createDb, closeDb, loadEnv } from '@stock-buddy/db';
import {
  ingestAll,
  ingestFundamentals,
  ingestMacro,
  ingestNews,
  ingestOhlcv,
  ingestShareholding,
  ingestWatchlist,
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
        console.log(await ingestNews(db, ticker), 'news rows');
        break;
      case 'all':
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
