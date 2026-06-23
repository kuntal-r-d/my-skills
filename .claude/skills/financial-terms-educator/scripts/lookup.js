#!/usr/bin/env node

// src/cli.ts
import { readFileSync } from "fs";
import { stdin } from "process";
function readInput(inputPath) {
  if (inputPath) {
    return readFileSync(inputPath, "utf8");
  }
  return readFileSync(stdin.fd, "utf8");
}
function writeOutput(result, pretty = false) {
  const indent = pretty ? 2 : void 0;
  process.stdout.write(`${JSON.stringify(result, null, indent)}
`);
}
function runCli(handler, options = {}) {
  let raw;
  try {
    raw = readInput(options.input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeOutput({ error: `bad input: ${msg}` });
    process.exit(1);
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    writeOutput({ error: `bad input: ${msg}` });
    process.exit(1);
    return;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    writeOutput({ error: "request must be a JSON object" });
    process.exit(1);
    return;
  }
  const result = handler(data);
  writeOutput(result, options.pretty);
  if ("error" in result) {
    process.exit(1);
  }
}
function parseCliArgs(argv) {
  const options = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pretty") {
      options.pretty = true;
    } else if (arg === "--input" && argv[i + 1]) {
      options.input = argv[++i];
    }
  }
  return options;
}

// ../../skills/financial-terms-educator/assets/glossary.json
var glossary_default = {
  _meta: {
    version: "0.1.0",
    language: "en+bn",
    term_count_note: "Core set of key DSE investing/trading terms. Extensible toward the 120+ target documented in references/GLOSSARY.md.",
    metric_key_map: {
      roe: "ROE",
      roa: "ROA",
      return_on_assets: "ROA",
      pe: "PE",
      pb: "PB",
      peg: "PEG",
      eps: "EPS",
      eps_ttm: "EPS",
      debt_to_equity: "debt_to_equity",
      current_ratio: "current_ratio",
      free_cash_flow: "free_cash_flow",
      dividend_yield: "dividend_yield",
      profit_margin: "operating_margin",
      operating_margin: "operating_margin",
      earnings_growth: "earnings_growth",
      interest_coverage: "interest_coverage",
      beta: "beta",
      market_cap: "market_cap",
      book_value_per_share: "book_value",
      rsi_14: "RSI",
      rsi: "RSI",
      macd: "MACD",
      adx_14: "ADX",
      adx: "ADX",
      atr: "ATR",
      mfi_14: "MFI",
      obv: "OBV",
      roc_12: "ROC",
      ncav_per_share: "NCAV",
      intrinsic_value: "intrinsic_value",
      nav: "NAV"
    }
  },
  terms: {
    ROE: {
      term: "Return on Equity (ROE)",
      term_bn: "\u0987\u0995\u09C1\u0987\u099F\u09BF\u09B0 \u0989\u09AA\u09B0 \u09B0\u09BF\u099F\u09BE\u09B0\u09CD\u09A8 (ROE)",
      one_liner: "Profit earned per taka of shareholders' equity.",
      one_liner_bn: "\u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09B9\u09CB\u09B2\u09CD\u09A1\u09BE\u09B0\u09A6\u09C7\u09B0 \u09AA\u09CD\u09B0\u09A4\u09BF \u099F\u09BE\u0995\u09BE \u0987\u0995\u09C1\u0987\u099F\u09BF\u09A4\u09C7 \u0995\u09CB\u09AE\u09CD\u09AA\u09BE\u09A8\u09BF \u0995\u09A4 \u09AE\u09C1\u09A8\u09BE\u09AB\u09BE \u0995\u09B0\u09C7\u0964",
      analogy: "Like asking how much GP earns on every taka the owners left inside the business.",
      for_investor: "A core quality screen; consistently high ROE signals a durable franchise worth holding.",
      for_trader: "Less direct, but high-ROE leaders (e.g. Square Pharma) tend to attract institutional flow that fuels momentum.",
      good_vs_bad: "Good >15%, excellent >20%, weak <10%. Beware ROE inflated by heavy debt.",
      what_to_do: "Compare ROE across years and peers; check it is not propped up by leverage."
    },
    ROA: {
      term: "Return on Assets (ROA)",
      term_bn: "\u09B8\u09AE\u09CD\u09AA\u09A6\u09C7\u09B0 \u0989\u09AA\u09B0 \u09B0\u09BF\u099F\u09BE\u09B0\u09CD\u09A8 (ROA)",
      one_liner: "Profit earned per taka of total assets.",
      one_liner_bn: "\u09AE\u09CB\u099F \u09B8\u09AE\u09CD\u09AA\u09A6\u09C7\u09B0 \u09AA\u09CD\u09B0\u09A4\u09BF \u099F\u09BE\u0995\u09BE\u09AF\u09BC \u0995\u09CB\u09AE\u09CD\u09AA\u09BE\u09A8\u09BF \u0995\u09A4 \u09AE\u09C1\u09A8\u09BE\u09AB\u09BE \u0995\u09B0\u09C7\u0964",
      analogy: "How efficiently BRAC Bank turns its whole balance sheet into profit, not just owners' money.",
      for_investor: "Shows asset efficiency; pairs with ROE to reveal how much leverage is doing the work.",
      for_trader: "Secondary; useful to confirm an earnings beat is real and not balance-sheet bloat.",
      good_vs_bad: "Good >8% (banks lower, ~1-2% is normal). Falling ROA warns of asset bloat.",
      what_to_do: "Use sector-relative benchmarks; banks and manufacturers are not comparable."
    },
    PE: {
      term: "Price-to-Earnings Ratio (P/E)",
      term_bn: "\u09AE\u09C2\u09B2\u09CD\u09AF-\u0986\u09AF\u09BC \u0985\u09A8\u09C1\u09AA\u09BE\u09A4 (P/E)",
      one_liner: "Price you pay per taka of annual earnings.",
      one_liner_bn: "\u0995\u09CB\u09AE\u09CD\u09AA\u09BE\u09A8\u09BF\u09B0 \u09AC\u099B\u09B0\u09C7 \u09AA\u09CD\u09B0\u09A4\u09BF \u099F\u09BE\u0995\u09BE \u0986\u09AF\u09BC\u09C7\u09B0 \u099C\u09A8\u09CD\u09AF \u0986\u09AA\u09A8\u09BF \u0995\u09A4 \u09A6\u09BE\u09AE \u09A6\u09BF\u099A\u09CD\u099B\u09C7\u09A8\u0964",
      analogy: "Paying 14 taka for a share earning 1 taka/year is a P/E of 14 \u2014 like a 14-year payback.",
      for_investor: "Central valuation gauge; a low P/E versus history and peers can flag value.",
      for_trader: "Expanding P/E often accompanies momentum runs; contracting P/E warns of de-rating.",
      good_vs_bad: "DSE context: <12 cheap, 12-20 fair, >25 rich. Compare to the stock's own history.",
      what_to_do: "Never use P/E alone; cross-check earnings quality and growth (see PEG)."
    },
    PB: {
      term: "Price-to-Book Ratio (P/B)",
      term_bn: "\u09AE\u09C2\u09B2\u09CD\u09AF-\u09AC\u09C1\u0995 \u0985\u09A8\u09C1\u09AA\u09BE\u09A4 (P/B)",
      one_liner: "Price relative to net asset (book) value per share.",
      one_liner_bn: "\u09AA\u09CD\u09B0\u09A4\u09BF \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09C7\u09B0 \u09A8\u09BF\u099F \u09B8\u09AE\u09CD\u09AA\u09A6\u09AE\u09C2\u09B2\u09CD\u09AF\u09C7\u09B0 \u09A4\u09C1\u09B2\u09A8\u09BE\u09AF\u09BC \u09AC\u09BE\u099C\u09BE\u09B0\u09AE\u09C2\u09B2\u09CD\u09AF\u0964",
      analogy: "Buying BRAC Bank at 1.3x book means paying 1.30 taka for 1 taka of net assets.",
      for_investor: "Useful for banks and asset-heavy firms; low P/B with healthy ROE can mean value.",
      for_trader: "Minor; very low P/B sometimes precedes turnaround momentum.",
      good_vs_bad: "<1 potentially cheap, 1-3 normal, >3 demands strong growth. Banks often trade near 1.",
      what_to_do: "Pair P/B with ROE; cheap book + poor ROE is a value trap."
    },
    PEG: {
      term: "Price/Earnings-to-Growth (PEG)",
      term_bn: "\u09AE\u09C2\u09B2\u09CD\u09AF-\u0986\u09AF\u09BC-\u09AC\u09C3\u09A6\u09CD\u09A7\u09BF \u0985\u09A8\u09C1\u09AA\u09BE\u09A4 (PEG)",
      one_liner: "P/E divided by the earnings growth rate.",
      one_liner_bn: "\u0986\u09AF\u09BC \u09AC\u09C3\u09A6\u09CD\u09A7\u09BF\u09B0 \u09B9\u09BE\u09B0\u09C7\u09B0 \u09A4\u09C1\u09B2\u09A8\u09BE\u09AF\u09BC P/E \u0985\u09A8\u09C1\u09AA\u09BE\u09A4\u0964",
      analogy: "A high P/E is fine if earnings grow fast \u2014 PEG checks if growth justifies the price.",
      for_investor: "Lynch's favourite; PEG near 1 means price and growth are in balance.",
      for_trader: "Low PEG growth names are momentum favourites when earnings surprise upward.",
      good_vs_bad: "<1 attractive, ~1 fair, >2 expensive for the growth on offer.",
      what_to_do: "Use a realistic, sustainable growth estimate, not a one-off spike."
    },
    EPS: {
      term: "Earnings Per Share (EPS)",
      term_bn: "\u09AA\u09CD\u09B0\u09A4\u09BF \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0 \u0986\u09AF\u09BC (EPS)",
      one_liner: "Net profit attributable to each share.",
      one_liner_bn: "\u09AA\u09CD\u09B0\u09A4\u09BF\u099F\u09BF \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09C7\u09B0 \u09AD\u09BE\u0997\u09C7 \u0986\u09B8\u09BE \u09A8\u09BF\u099F \u09AE\u09C1\u09A8\u09BE\u09AB\u09BE\u0964",
      analogy: "If GP earns 1,000 crore over 135 crore shares, each share earns its slice as EPS.",
      for_investor: "The denominator of value; rising EPS over years is the engine of long-term returns.",
      for_trader: "EPS surprises are prime momentum catalysts around earnings dates.",
      good_vs_bad: "Direction matters more than level: steady growth good, erratic/declining bad.",
      what_to_do: "Track multi-year EPS trend and watch for dilution from new shares."
    },
    debt_to_equity: {
      term: "Debt-to-Equity (D/E)",
      term_bn: "\u098B\u09A3-\u0987\u0995\u09C1\u0987\u099F\u09BF \u0985\u09A8\u09C1\u09AA\u09BE\u09A4 (D/E)",
      one_liner: "Borrowed money relative to shareholders' equity.",
      one_liner_bn: "\u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09B9\u09CB\u09B2\u09CD\u09A1\u09BE\u09B0\u09A6\u09C7\u09B0 \u0987\u0995\u09C1\u0987\u099F\u09BF\u09B0 \u09A4\u09C1\u09B2\u09A8\u09BE\u09AF\u09BC \u0995\u09CB\u09AE\u09CD\u09AA\u09BE\u09A8\u09BF\u09B0 \u098B\u09A3 \u0995\u09A4\u0964",
      analogy: "Like a household's loans versus its savings \u2014 more debt magnifies both gains and pain.",
      for_investor: "Key solvency check; high D/E raises risk in a rate-hike or downturn.",
      for_trader: "Highly leveraged names swing harder \u2014 sharper momentum but bigger drawdowns.",
      good_vs_bad: "Good <0.5, watch 0.5-1.0, risky >1.5 (banks excluded, they run higher by design).",
      what_to_do: "Combine with interest coverage; rising debt + falling coverage is a red flag."
    },
    current_ratio: {
      term: "Current Ratio",
      term_bn: "\u099A\u09B2\u09A4\u09BF \u0985\u09A8\u09C1\u09AA\u09BE\u09A4",
      one_liner: "Current assets divided by current liabilities.",
      one_liner_bn: "\u09B8\u09CD\u09AC\u09B2\u09CD\u09AA\u09AE\u09C7\u09AF\u09BC\u09BE\u09A6\u09BF \u09B8\u09AE\u09CD\u09AA\u09A6 \u09AD\u09BE\u0997 \u09B8\u09CD\u09AC\u09B2\u09CD\u09AA\u09AE\u09C7\u09AF\u09BC\u09BE\u09A6\u09BF \u09A6\u09BE\u09AF\u09BC\u0964",
      analogy: "Can the company cover the next year's bills with the next year's cash? Above 1 means yes.",
      for_investor: "Liquidity safety check; too low risks a cash crunch, too high may mean idle assets.",
      for_trader: "Low priority unless a liquidity scare is the trade thesis.",
      good_vs_bad: "Healthy 1.5-3.0, <1 is a warning, >3 may signal inefficient capital.",
      what_to_do: "Read alongside cash flow; a high ratio built on slow inventory is misleading."
    },
    free_cash_flow: {
      term: "Free Cash Flow (FCF)",
      term_bn: "\u09AE\u09C1\u0995\u09CD\u09A4 \u09A8\u0997\u09A6 \u09AA\u09CD\u09B0\u09AC\u09BE\u09B9 (FCF)",
      one_liner: "Cash left after running and reinvesting in the business.",
      one_liner_bn: "\u09AC\u09CD\u09AF\u09AC\u09B8\u09BE \u099A\u09BE\u09B2\u09BE\u09A8\u09CB \u0993 \u09AC\u09BF\u09A8\u09BF\u09AF\u09BC\u09CB\u0997\u09C7\u09B0 \u09AA\u09B0 \u09B9\u09BE\u09A4\u09C7 \u09A5\u09BE\u0995\u09BE \u09AA\u09CD\u09B0\u0995\u09C3\u09A4 \u09A8\u0997\u09A6\u0964",
      analogy: "Your salary after rent and essentials \u2014 the cash truly free to use or pay out.",
      for_investor: "The hardest-to-fake quality metric; sustained positive FCF funds dividends and growth.",
      for_trader: "Indirect, but strong FCF underpins buybacks/dividends that support price.",
      good_vs_bad: "Positive and growing is good; persistently negative FCF needs a strong growth story.",
      what_to_do: "Prefer FCF over reported profit when judging earnings quality."
    },
    dividend_yield: {
      term: "Dividend Yield",
      term_bn: "\u09B2\u09AD\u09CD\u09AF\u09BE\u0982\u09B6 \u09AB\u09B2\u09A8",
      one_liner: "Annual dividend as a percentage of share price.",
      one_liner_bn: "\u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09AE\u09C2\u09B2\u09CD\u09AF\u09C7\u09B0 \u09A4\u09C1\u09B2\u09A8\u09BE\u09AF\u09BC \u09AC\u09BE\u09B0\u09CD\u09B7\u09BF\u0995 \u09B2\u09AD\u09CD\u09AF\u09BE\u0982\u09B6\u09C7\u09B0 \u09B6\u09A4\u0995\u09B0\u09BE \u09B9\u09BE\u09B0\u0964",
      analogy: "Like the interest rate on the cash you parked in the stock.",
      for_investor: "Income and a quality signal; many DSE investors prize steady cash dividends.",
      for_trader: "Yield can floor a price (support) but rarely drives momentum on its own.",
      good_vs_bad: "DSE context: 4-7% attractive if covered; an unusually high yield can signal trouble.",
      what_to_do: "Check the payout ratio \u2014 a yield the company cannot sustain will be cut."
    },
    margin_of_safety: {
      term: "Margin of Safety",
      term_bn: "\u09A8\u09BF\u09B0\u09BE\u09AA\u09A4\u09CD\u09A4\u09BE \u09AC\u09CD\u09AF\u09AC\u09A7\u09BE\u09A8",
      one_liner: "Discount of price below estimated intrinsic value.",
      one_liner_bn: "\u0986\u09A8\u09C1\u09AE\u09BE\u09A8\u09BF\u0995 \u09AA\u09CD\u09B0\u0995\u09C3\u09A4 \u09AE\u09C2\u09B2\u09CD\u09AF\u09C7\u09B0 \u09A4\u09C1\u09B2\u09A8\u09BE\u09AF\u09BC \u09AC\u09BE\u099C\u09BE\u09B0\u09AE\u09C2\u09B2\u09CD\u09AF \u0995\u09A4 \u0995\u09AE\u0964",
      analogy: "Building a bridge for 30-ton trucks but only allowing 20 \u2014 buffer against being wrong.",
      for_investor: "Graham's central idea; buy well below value so errors don't sink you.",
      for_trader: "Less relevant; traders use stops rather than valuation buffers.",
      good_vs_bad: "Aim for 25-50% below intrinsic value; near or above value offers little cushion.",
      what_to_do: "Demand a wider margin when your value estimate is uncertain."
    },
    economic_moat: {
      term: "Economic Moat",
      term_bn: "\u0985\u09B0\u09CD\u09A5\u09A8\u09C8\u09A4\u09BF\u0995 \u09AA\u09B0\u09BF\u0996\u09BE (Moat)",
      one_liner: "A durable advantage that protects profits from rivals.",
      one_liner_bn: "\u09AA\u09CD\u09B0\u09A4\u09BF\u09AF\u09CB\u0997\u09C0\u09A6\u09C7\u09B0 \u09B9\u09BE\u09A4 \u09A5\u09C7\u0995\u09C7 \u09AE\u09C1\u09A8\u09BE\u09AB\u09BE \u09B0\u0995\u09CD\u09B7\u09BE\u0995\u09BE\u09B0\u09C0 \u099F\u09C7\u0995\u09B8\u0987 \u09B8\u09C1\u09AC\u09BF\u09A7\u09BE\u0964",
      analogy: "GP's network coverage or BATBC's brands act like a moat around a castle.",
      for_investor: "The reason a great business stays great; moats justify holding for years.",
      for_trader: "Background context; wide-moat leaders trend more cleanly.",
      good_vs_bad: "Wide and widening is best; eroding moats (new entrants, regulation) are a warning.",
      what_to_do: "Ask what would let a competitor steal share \u2014 if the answer is 'little', moat is wide."
    },
    RSI: {
      term: "Relative Strength Index (RSI)",
      term_bn: "\u0986\u09AA\u09C7\u0995\u09CD\u09B7\u09BF\u0995 \u09B6\u0995\u09CD\u09A4\u09BF \u09B8\u09C2\u099A\u0995 (RSI)",
      one_liner: "0-100 oscillator of recent gain vs loss momentum.",
      one_liner_bn: "\u09B8\u09BE\u09AE\u09CD\u09AA\u09CD\u09B0\u09A4\u09BF\u0995 \u09B2\u09BE\u09AD \u09AC\u09A8\u09BE\u09AE \u0995\u09CD\u09B7\u09A4\u09BF\u09B0 \u0997\u09A4\u09BF\u09AC\u09C7\u0997 \u09AE\u09BE\u09AA\u09BE \u09E6-\u09E7\u09E6\u09E6 \u09B8\u09C2\u099A\u0995\u0964",
      analogy: "Like a speedometer for the stock \u2014 too fast (overbought) or stalled (oversold).",
      for_investor: "Minor; a low RSI can time an entry into an already-chosen quality name.",
      for_trader: "Core tool; overbought/oversold and divergences shape entries and exits.",
      good_vs_bad: "70 overbought, <30 oversold; 40-60 healthy trend. Context beats the raw level.",
      what_to_do: "Use RSI with trend; oversold in a downtrend is not automatically a buy zone."
    },
    MACD: {
      term: "Moving Average Convergence Divergence (MACD)",
      term_bn: "MACD",
      one_liner: "Difference between fast and slow EMAs, plus a signal line.",
      one_liner_bn: "\u09A6\u09CD\u09B0\u09C1\u09A4 \u0993 \u09A7\u09C0\u09B0 EMA-\u098F\u09B0 \u09AA\u09BE\u09B0\u09CD\u09A5\u0995\u09CD\u09AF \u098F\u09AC\u0982 \u098F\u0995\u099F\u09BF \u09B8\u09BF\u0997\u09A8\u09CD\u09AF\u09BE\u09B2 \u09B2\u09BE\u0987\u09A8\u0964",
      analogy: "Two runners (fast/slow averages) \u2014 MACD tracks the gap and who is pulling ahead.",
      for_investor: "Light use for confirming a trend turn before adding.",
      for_trader: "Crossovers and histogram shifts are classic momentum triggers.",
      good_vs_bad: "MACD above signal/zero is bullish; below is bearish. Whipsaws in flat markets.",
      what_to_do: "Favour MACD signals aligned with the higher-timeframe trend."
    },
    ADX: {
      term: "Average Directional Index (ADX)",
      term_bn: "\u0997\u09A1\u09BC \u09A6\u09BF\u0995\u09A8\u09BF\u09B0\u09CD\u09A6\u09C7\u09B6\u0995 \u09B8\u09C2\u099A\u0995 (ADX)",
      one_liner: "Measures trend strength (not direction) on a 0-100 scale.",
      one_liner_bn: "\u09AA\u09CD\u09B0\u09AC\u09A3\u09A4\u09BE\u09B0 \u09A6\u09BF\u0995 \u09A8\u09AF\u09BC, \u09B6\u0995\u09CD\u09A4\u09BF \u09AE\u09BE\u09AA\u09C7 (\u09E6-\u09E7\u09E6\u09E6 \u09B8\u09CD\u0995\u09C7\u09B2\u09C7)\u0964",
      analogy: "Tells you the wind's strength, while +DI/-DI tell you its direction.",
      for_investor: "Helps confirm a real trend before committing to a position.",
      for_trader: "Filters setups; momentum strategies work best when ADX is rising above 25.",
      good_vs_bad: ">25 strong trend, <20 choppy/range-bound, >40 very strong (may be late).",
      what_to_do: "Avoid trend strategies when ADX is low; switch to range tactics."
    },
    ATR: {
      term: "Average True Range (ATR)",
      term_bn: "\u0997\u09A1\u09BC \u09AA\u09CD\u09B0\u0995\u09C3\u09A4 \u09AA\u09B0\u09BF\u09B8\u09B0 (ATR)",
      one_liner: "Average daily price range \u2014 a volatility gauge.",
      one_liner_bn: "\u09A6\u09C8\u09A8\u09BF\u0995 \u09AE\u09C2\u09B2\u09CD\u09AF\u09C7\u09B0 \u0997\u09A1\u09BC \u09AA\u09B0\u09BF\u09B8\u09B0 \u2014 \u0985\u09B8\u09CD\u09A5\u09BF\u09B0\u09A4\u09BE\u09B0 \u09AA\u09B0\u09BF\u09AE\u09BE\u09AA\u0964",
      analogy: "How much the stock 'breathes' each day \u2014 wider breath, wider stops needed.",
      for_investor: "Helps size positions so a normal wiggle doesn't scare you out.",
      for_trader: "Sets stop distance and position size; ATR-based stops adapt to volatility.",
      good_vs_bad: "No good/bad level \u2014 higher ATR means higher risk and wider stops.",
      what_to_do: "Place stops a multiple of ATR away so noise doesn't trigger them."
    },
    moving_average: {
      term: "Moving Average (MA)",
      term_bn: "\u099A\u09B2\u09AE\u09BE\u09A8 \u0997\u09A1\u09BC (MA)",
      one_liner: "Average price over a window that updates each bar.",
      one_liner_bn: "\u098F\u0995\u099F\u09BF \u09A8\u09BF\u09B0\u09CD\u09A6\u09BF\u09B7\u09CD\u099F \u09B8\u09AE\u09AF\u09BC\u09C7\u09B0 \u0997\u09A1\u09BC \u09AE\u09C2\u09B2\u09CD\u09AF \u09AF\u09BE \u09AA\u09CD\u09B0\u09A4\u09BF\u09A6\u09BF\u09A8 \u09B9\u09BE\u09B2\u09A8\u09BE\u0997\u09BE\u09A6 \u09B9\u09AF\u09BC\u0964",
      analogy: "Smooths out daily noise to show the underlying direction, like a trend line.",
      for_investor: "The 200-day MA is a simple long-term health line \u2014 above it is constructive.",
      for_trader: "50/150/200 stacks and crossovers define trend regimes and pullback entries.",
      good_vs_bad: "Price above rising MAs is bullish; below falling MAs is bearish.",
      what_to_do: "Watch how price behaves at key MAs (support/resistance) more than the line itself."
    },
    OBV: {
      term: "On-Balance Volume (OBV)",
      term_bn: "\u0985\u09A8-\u09AC\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09B8 \u09AD\u09B2\u09BF\u0989\u09AE (OBV)",
      one_liner: "Running volume total that adds up-days and subtracts down-days.",
      one_liner_bn: "\u0986\u09AA-\u09A6\u09BF\u09A8\u09C7 \u09AD\u09B2\u09BF\u0989\u09AE \u09AF\u09CB\u0997 \u0993 \u09A1\u09BE\u0989\u09A8-\u09A6\u09BF\u09A8\u09C7 \u09AC\u09BF\u09AF\u09BC\u09CB\u0997 \u0995\u09B0\u09C7 \u099A\u09B2\u09AE\u09BE\u09A8 \u09AF\u09CB\u0997\u09AB\u09B2\u0964",
      analogy: "Tracks whether volume is quietly accumulating or distributing behind the price.",
      for_investor: "Confirms whether smart money is building a position you also like.",
      for_trader: "Rising OBV confirms a breakout; OBV divergence warns of a weak move.",
      good_vs_bad: "OBV rising with price is healthy; OBV falling while price rises is a warning.",
      what_to_do: "Use OBV to confirm price moves, not as a standalone signal."
    },
    MFI: {
      term: "Money Flow Index (MFI)",
      term_bn: "\u09AE\u09BE\u09A8\u09BF \u09AB\u09CD\u09B2\u09CB \u0987\u09A8\u09A1\u09C7\u0995\u09CD\u09B8 (MFI)",
      one_liner: "Volume-weighted RSI of money flowing in vs out.",
      one_liner_bn: "\u09AD\u09B2\u09BF\u0989\u09AE-\u09AF\u09C1\u0995\u09CD\u09A4 RSI \u2014 \u09AD\u09C7\u09A4\u09B0\u09C7 \u09AC\u09A8\u09BE\u09AE \u09AC\u09BE\u0987\u09B0\u09C7 \u09AF\u09BE\u0993\u09AF\u09BC\u09BE \u0985\u09B0\u09CD\u09A5\u09AA\u09CD\u09B0\u09AC\u09BE\u09B9 \u09AE\u09BE\u09AA\u09C7\u0964",
      analogy: "Like RSI but it also asks how much money rode along with each move.",
      for_investor: "Secondary confirmation of accumulation in a quality name.",
      for_trader: "Overbought/oversold with volume context; divergences flag exhaustion.",
      good_vs_bad: ">80 overbought, <20 oversold; 20-80 normal range.",
      what_to_do: "Trust MFI extremes more when volume is genuinely heavy."
    },
    ROC: {
      term: "Rate of Change (ROC)",
      term_bn: "\u09AA\u09B0\u09BF\u09AC\u09B0\u09CD\u09A4\u09A8\u09C7\u09B0 \u09B9\u09BE\u09B0 (ROC)",
      one_liner: "Percentage price change over a fixed lookback.",
      one_liner_bn: "\u098F\u0995\u099F\u09BF \u09A8\u09BF\u09B0\u09CD\u09A6\u09BF\u09B7\u09CD\u099F \u09B8\u09AE\u09AF\u09BC\u09C7 \u09B6\u09A4\u0995\u09B0\u09BE \u09AE\u09C2\u09B2\u09CD\u09AF \u09AA\u09B0\u09BF\u09AC\u09B0\u09CD\u09A4\u09A8\u0964",
      analogy: "Pure speed reading \u2014 how fast the price has moved over N days.",
      for_investor: "Light use to gauge whether a long-term entry is chasing a hot move.",
      for_trader: "A momentum core; positive and rising ROC favours trend-following.",
      good_vs_bad: "Positive = upward momentum, negative = downward; extremes can mean-revert.",
      what_to_do: "Compare ROC across names to rank relative strength."
    },
    bollinger_bands: {
      term: "Bollinger Bands",
      term_bn: "\u09AC\u09B2\u09BF\u099E\u09CD\u099C\u09BE\u09B0 \u09AC\u09CD\u09AF\u09BE\u09A8\u09CD\u09A1",
      one_liner: "A moving average with bands set at \xB12 standard deviations.",
      one_liner_bn: "\u099A\u09B2\u09AE\u09BE\u09A8 \u0997\u09A1\u09BC\u09C7\u09B0 \u09B8\u09BE\u09A5\u09C7 \xB1\u09E8 \u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u09A8\u09CD\u09A1\u09BE\u09B0\u09CD\u09A1 \u09A1\u09C7\u09AD\u09BF\u09AF\u09BC\u09C7\u09B6\u09A8\u09C7 \u0986\u0981\u0995\u09BE \u09AC\u09CD\u09AF\u09BE\u09A8\u09CD\u09A1\u0964",
      analogy: "Elastic rails around price \u2014 squeezes precede big moves, edges mark extremes.",
      for_investor: "Minor; a band squeeze can hint a quiet name is about to move.",
      for_trader: "Squeezes signal coiling volatility; band rides confirm strong trends.",
      good_vs_bad: "Close near upper band = strength/overbought; near lower = weakness/oversold.",
      what_to_do: "Trade squeeze breakouts in the direction volume confirms."
    },
    support_resistance: {
      term: "Support & Resistance",
      term_bn: "\u09B8\u09BE\u09AA\u09CB\u09B0\u09CD\u099F \u0993 \u09B0\u09C7\u099C\u09BF\u09B8\u09CD\u099F\u09CD\u09AF\u09BE\u09A8\u09CD\u09B8",
      one_liner: "Price levels where buying or selling has repeatedly clustered.",
      one_liner_bn: "\u09AF\u09C7 \u09AE\u09C2\u09B2\u09CD\u09AF\u09B8\u09CD\u09A4\u09B0\u09C7 \u09AC\u09BE\u09B0\u09AC\u09BE\u09B0 \u0995\u09CD\u09B0\u09AF\u09BC \u09AC\u09BE \u09AC\u09BF\u0995\u09CD\u09B0\u09AF\u09BC \u0995\u09C7\u09A8\u09CD\u09A6\u09CD\u09B0\u09C0\u09AD\u09C2\u09A4 \u09B9\u09AF\u09BC\u0964",
      analogy: "Floor (support) and ceiling (resistance) the price keeps bouncing between.",
      for_investor: "Helps choose a sensible entry near support rather than chasing.",
      for_trader: "Defines entries, stops and targets; breaks of these levels are key signals.",
      good_vs_bad: "Holding support is constructive; breaking it on volume is bearish (and vice versa).",
      what_to_do: "Place stops just beyond a level so a clean break, not noise, takes you out."
    },
    breakout: {
      term: "Breakout",
      term_bn: "\u09AC\u09CD\u09B0\u09C7\u0995\u0986\u0989\u099F",
      one_liner: "Price moving decisively beyond a prior range or level.",
      one_liner_bn: "\u09AA\u09C2\u09B0\u09CD\u09AC\u09C7\u09B0 \u09AA\u09B0\u09BF\u09B8\u09B0 \u09AC\u09BE \u09B8\u09CD\u09A4\u09B0 \u099C\u09CB\u09B0\u09BE\u09B2\u09CB\u09AD\u09BE\u09AC\u09C7 \u0985\u09A4\u09BF\u0995\u09CD\u09B0\u09AE \u0995\u09B0\u09BE\u0964",
      analogy: "Water breaching a dam \u2014 once past resistance it can run fast.",
      for_investor: "Can confirm a thesis is being recognised by the market.",
      for_trader: "A primary momentum entry; volume separates real breaks from fakeouts.",
      good_vs_bad: "High-volume breakout = good; a low-volume break that fails (fakeout) = bad.",
      what_to_do: "Require volume confirmation and a plan for the failure case."
    },
    momentum: {
      term: "Momentum",
      term_bn: "\u09AE\u09CB\u09AE\u09C7\u09A8\u09CD\u099F\u09BE\u09AE (\u0997\u09A4\u09BF\u09AC\u09C7\u0997)",
      one_liner: "The tendency of recent strength or weakness to persist.",
      one_liner_bn: "\u09B8\u09BE\u09AE\u09CD\u09AA\u09CD\u09B0\u09A4\u09BF\u0995 \u09B6\u0995\u09CD\u09A4\u09BF \u09AC\u09BE \u09A6\u09C1\u09B0\u09CD\u09AC\u09B2\u09A4\u09BE \u099F\u09BF\u0995\u09C7 \u09A5\u09BE\u0995\u09BE\u09B0 \u09AA\u09CD\u09B0\u09AC\u09A3\u09A4\u09BE\u0964",
      analogy: "A rolling ball keeps rolling \u2014 winners often keep winning for a while.",
      for_investor: "Tilts timing toward already-healthy names within a quality watchlist.",
      for_trader: "The whole game: buy strength, ride the trend, exit when it fades.",
      good_vs_bad: "Strong, broad, volume-backed momentum good; narrow or fading momentum risky.",
      what_to_do: "Pair momentum with a stop \u2014 momentum reverses, sometimes sharply."
    },
    volatility: {
      term: "Volatility",
      term_bn: "\u0985\u09B8\u09CD\u09A5\u09BF\u09B0\u09A4\u09BE",
      one_liner: "How much and how fast a price swings around.",
      one_liner_bn: "\u09AE\u09C2\u09B2\u09CD\u09AF \u0995\u09A4\u099F\u09BE \u0993 \u0995\u09A4 \u09A6\u09CD\u09B0\u09C1\u09A4 \u0993\u09A0\u09BE\u09A8\u09BE\u09AE\u09BE \u0995\u09B0\u09C7\u0964",
      analogy: "A calm pond versus a choppy sea \u2014 same destination, very different ride.",
      for_investor: "Determines how much daily noise you must tolerate to hold for years.",
      for_trader: "Drives position size and stop width; opportunity and risk both rise with it.",
      good_vs_bad: "Neither good nor bad in itself; mismatched to your sizing it becomes dangerous.",
      what_to_do: "Size positions so a typical volatile day cannot ruin your account."
    },
    market_cap: {
      term: "Market Capitalisation",
      term_bn: "\u09AC\u09BE\u099C\u09BE\u09B0 \u09AE\u09C2\u09B2\u09A7\u09A8",
      one_liner: "Total value of all shares (price x shares outstanding).",
      one_liner_bn: "\u09B8\u09AC \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09C7\u09B0 \u09AE\u09CB\u099F \u09AE\u09C2\u09B2\u09CD\u09AF (\u09AE\u09C2\u09B2\u09CD\u09AF \u0997\u09C1\u09A3 \u09AE\u09CB\u099F \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0)\u0964",
      analogy: "The full price tag to buy the entire company at today's quote.",
      for_investor: "Frames scale and risk; large caps like GP are steadier than small caps.",
      for_trader: "Small caps move faster but are thinner and easier to manipulate.",
      good_vs_bad: "No good/bad level; match cap size to your liquidity and risk tolerance.",
      what_to_do: "Check that daily traded value supports the size you intend to trade."
    },
    NAV: {
      term: "Net Asset Value (NAV)",
      term_bn: "\u09A8\u09BF\u099F \u09B8\u09AE\u09CD\u09AA\u09A6 \u09AE\u09C2\u09B2\u09CD\u09AF (NAV)",
      one_liner: "Net assets per share (assets minus liabilities).",
      one_liner_bn: "\u09AA\u09CD\u09B0\u09A4\u09BF \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09C7 \u09A8\u09BF\u099F \u09B8\u09AE\u09CD\u09AA\u09A6 (\u09B8\u09AE\u09CD\u09AA\u09A6 \u09AC\u09BF\u09AF\u09BC\u09CB\u0997 \u09A6\u09BE\u09AF\u09BC)\u0964",
      analogy: "What each share would be worth if the company were wound up today.",
      for_investor: "A valuation floor for funds and asset-heavy firms; price below NAV can be value.",
      for_trader: "Minor; deep NAV discounts sometimes precede re-rating moves.",
      good_vs_bad: "Price well below NAV may be cheap; far above NAV needs strong earnings.",
      what_to_do: "Verify the assets are real and current, not stale or impaired."
    },
    NCAV: {
      term: "Net Current Asset Value (NCAV)",
      term_bn: "\u09A8\u09BF\u099F \u099A\u09B2\u09A4\u09BF \u09B8\u09AE\u09CD\u09AA\u09A6 \u09AE\u09C2\u09B2\u09CD\u09AF (NCAV)",
      one_liner: "Current assets minus all liabilities, per share.",
      one_liner_bn: "\u099A\u09B2\u09A4\u09BF \u09B8\u09AE\u09CD\u09AA\u09A6 \u09AC\u09BF\u09AF\u09BC\u09CB\u0997 \u09B8\u09AC \u09A6\u09BE\u09AF\u09BC, \u09AA\u09CD\u09B0\u09A4\u09BF \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09C7\u0964",
      analogy: "Graham's deep-value test: liquid assets alone covering the whole price.",
      for_investor: "A strict bargain screen; price below NCAV is a classic deep-value signal.",
      for_trader: "Rarely used; these are slow, illiquid situations.",
      good_vs_bad: "Price below NCAV is the rare bargain; far above means no liquidation cushion.",
      what_to_do: "Confirm current assets are liquid (cash/receivables), not slow inventory."
    },
    intrinsic_value: {
      term: "Intrinsic Value",
      term_bn: "\u09AA\u09CD\u09B0\u0995\u09C3\u09A4 \u09AE\u09C2\u09B2\u09CD\u09AF",
      one_liner: "Estimated true worth from a company's future cash flows.",
      one_liner_bn: "\u09AD\u09AC\u09BF\u09B7\u09CD\u09AF\u09CE \u09A8\u0997\u09A6 \u09AA\u09CD\u09B0\u09AC\u09BE\u09B9 \u09A5\u09C7\u0995\u09C7 \u0985\u09A8\u09C1\u09AE\u09BE\u09A8 \u0995\u09B0\u09BE \u09AA\u09CD\u09B0\u0995\u09C3\u09A4 \u09AE\u09C2\u09B2\u09CD\u09AF\u0964",
      analogy: "What the business is worth on its merits, regardless of today's quote.",
      for_investor: "The anchor of value investing; buy below it with a margin of safety.",
      for_trader: "Background only; traders price action, not intrinsic value.",
      good_vs_bad: "Price below intrinsic value is attractive; above it is expensive.",
      what_to_do: "Use conservative assumptions; small input changes swing the estimate a lot."
    },
    beta: {
      term: "Beta",
      term_bn: "\u09AC\u09BF\u099F\u09BE",
      one_liner: "Sensitivity of a stock's moves to the overall market.",
      one_liner_bn: "\u09B8\u09BE\u09AE\u0997\u09CD\u09B0\u09BF\u0995 \u09AC\u09BE\u099C\u09BE\u09B0\u09C7\u09B0 \u09A4\u09C1\u09B2\u09A8\u09BE\u09AF\u09BC \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09C7\u09B0 \u099A\u09B2\u09BE\u099A\u09B2\u09C7\u09B0 \u09B8\u0982\u09AC\u09C7\u09A6\u09A8\u09B6\u09C0\u09B2\u09A4\u09BE\u0964",
      analogy: "Beta 1.5 means when DSEX moves 1%, the stock tends to move ~1.5%.",
      for_investor: "Gauges how much market risk a holding adds to the portfolio.",
      for_trader: "High-beta names amplify index swings \u2014 more momentum, more risk.",
      good_vs_bad: "<1 defensive, =1 market-like, >1 aggressive; none is inherently good/bad.",
      what_to_do: "Blend betas so total portfolio risk matches your comfort."
    },
    circuit_breaker: {
      term: "Circuit Breaker",
      term_bn: "\u09B8\u09BE\u09B0\u09CD\u0995\u09BF\u099F \u09AC\u09CD\u09B0\u09C7\u0995\u09BE\u09B0",
      one_liner: "DSE daily price limit that caps how far a stock can move.",
      one_liner_bn: "DSE-\u09B0 \u09A6\u09C8\u09A8\u09BF\u0995 \u09AE\u09C2\u09B2\u09CD\u09AF\u09B8\u09C0\u09AE\u09BE \u09AF\u09BE \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09C7\u09B0 \u099A\u09B2\u09BE\u099A\u09B2 \u09B8\u09C0\u09AE\u09BF\u09A4 \u0995\u09B0\u09C7\u0964",
      analogy: "A speed limiter \u2014 once price hits the band, trading at further prices stops.",
      for_investor: "Limits single-day damage but can trap you if you need to exit.",
      for_trader: "Critical: at limit-up/limit-down, signals are unreliable and exits may be blocked.",
      good_vs_bad: "Not good/bad; a name pinned at a limit is a liquidity/price-discovery warning.",
      what_to_do: "Treat indicators as suspect during circuit conditions; size for the gap risk."
    },
    floor_price: {
      term: "Floor Price",
      term_bn: "\u09AB\u09CD\u09B2\u09CB\u09B0 \u09AA\u09CD\u09B0\u09BE\u0987\u09B8",
      one_liner: "A regulatory minimum below which a stock may not trade.",
      one_liner_bn: "\u09A8\u09BF\u09AF\u09BC\u09A8\u09CD\u09A4\u09CD\u09B0\u0995-\u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09BF\u09A4 \u09B8\u09B0\u09CD\u09AC\u09A8\u09BF\u09AE\u09CD\u09A8 \u09AE\u09C2\u09B2\u09CD\u09AF, \u09AF\u09BE\u09B0 \u09A8\u09BF\u099A\u09C7 \u09B2\u09C7\u09A8\u09A6\u09C7\u09A8 \u09B9\u09AF\u09BC \u09A8\u09BE\u0964",
      analogy: "An artificial floor \u2014 sellers can't go lower, so trading can simply dry up.",
      for_investor: "A floor can freeze liquidity; 'cheap' is meaningless if you cannot sell.",
      for_trader: "Avoid: price discovery is broken and volume often vanishes at the floor.",
      good_vs_bad: "A stock stuck at its floor is a serious liquidity red flag.",
      what_to_do: "Check whether a floor is in force before sizing any position."
    },
    DSEX: {
      term: "DSEX Index",
      term_bn: "DSEX \u09B8\u09C2\u099A\u0995",
      one_liner: "The Dhaka Stock Exchange broad-market benchmark index.",
      one_liner_bn: "\u09A2\u09BE\u0995\u09BE \u09B8\u09CD\u099F\u0995 \u098F\u0995\u09CD\u09B8\u099A\u09C7\u099E\u09CD\u099C\u09C7\u09B0 \u09AC\u09BF\u09B8\u09CD\u09A4\u09C3\u09A4-\u09AC\u09BE\u099C\u09BE\u09B0 \u09B8\u09C2\u099A\u0995\u0964",
      analogy: "The market's thermometer \u2014 the headline number for 'how the market did'.",
      for_investor: "The benchmark to beat; sector and stock health are read against it.",
      for_trader: "Sets the regime; trading with the index trend raises the odds.",
      good_vs_bad: "Above rising moving averages = constructive market; below = defensive.",
      what_to_do: "Check the DSEX trend before trusting an individual stock's signal."
    },
    book_value: {
      term: "Book Value (per share)",
      term_bn: "\u09AC\u09C1\u0995 \u09AD\u09CD\u09AF\u09BE\u09B2\u09C1 (\u09AA\u09CD\u09B0\u09A4\u09BF \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0)",
      one_liner: "Accounting net worth of the company per share.",
      one_liner_bn: "\u09B9\u09BF\u09B8\u09BE\u09AC\u09AE\u09A4\u09C7 \u0995\u09CB\u09AE\u09CD\u09AA\u09BE\u09A8\u09BF\u09B0 \u09AA\u09CD\u09B0\u09A4\u09BF \u09B6\u09C7\u09AF\u09BC\u09BE\u09B0\u09C7\u09B0 \u09A8\u09BF\u099F \u09B8\u09AE\u09CD\u09AA\u09A6\u09AE\u09C2\u09B2\u09CD\u09AF\u0964",
      analogy: "The company's 'on-paper' net worth divided across all shares.",
      for_investor: "The denominator of P/B and a value reference for banks and asset plays.",
      for_trader: "Minor; mostly a backdrop to valuation.",
      good_vs_bad: "Rising book value over time is healthy; falling book value warns of losses.",
      what_to_do: "Pair with ROE \u2014 book growing through real earnings is the good kind."
    },
    earnings_growth: {
      term: "Earnings Growth",
      term_bn: "\u0986\u09AF\u09BC \u09AC\u09C3\u09A6\u09CD\u09A7\u09BF",
      one_liner: "The rate at which profits are increasing over time.",
      one_liner_bn: "\u09B8\u09AE\u09AF\u09BC\u09C7\u09B0 \u09B8\u09BE\u09A5\u09C7 \u09AE\u09C1\u09A8\u09BE\u09AB\u09BE \u09AC\u09C3\u09A6\u09CD\u09A7\u09BF\u09B0 \u09B9\u09BE\u09B0\u0964",
      analogy: "The engine of compounding \u2014 faster, steadier growth pulls the price up over years.",
      for_investor: "The single biggest long-term return driver for a quality business.",
      for_trader: "Accelerating growth fuels momentum, especially around earnings beats.",
      good_vs_bad: "Good >15% and consistent; lumpy or negative growth is a caution.",
      what_to_do: "Prefer sustainable, broad-based growth over one-off spikes."
    },
    operating_margin: {
      term: "Operating Margin",
      term_bn: "\u09AA\u09B0\u09BF\u099A\u09BE\u09B2\u09A8 \u09AE\u09BE\u09B0\u09CD\u099C\u09BF\u09A8",
      one_liner: "Operating profit as a percentage of revenue.",
      one_liner_bn: "\u09B0\u09BE\u099C\u09B8\u09CD\u09AC\u09C7\u09B0 \u09B6\u09A4\u0995\u09B0\u09BE \u09B9\u09BF\u09B8\u09C7\u09AC\u09C7 \u09AA\u09B0\u09BF\u099A\u09BE\u09B2\u09A8 \u09AE\u09C1\u09A8\u09BE\u09AB\u09BE\u0964",
      analogy: "How many taka of profit survive from each 100 taka of sales after running costs.",
      for_investor: "Profitability and pricing-power gauge; stable high margins suggest a moat.",
      for_trader: "Margin surprises move earnings and therefore price.",
      good_vs_bad: "Sector-dependent; rising margins good, shrinking margins warn of cost/pricing stress.",
      what_to_do: "Compare to peers and the firm's own trend, not an absolute cutoff."
    },
    interest_coverage: {
      term: "Interest Coverage",
      term_bn: "\u09B8\u09C1\u09A6 \u09AA\u09B0\u09BF\u09B6\u09CB\u09A7 \u09B8\u0995\u09CD\u09B7\u09AE\u09A4\u09BE",
      one_liner: "Operating profit divided by interest expense.",
      one_liner_bn: "\u09AA\u09B0\u09BF\u099A\u09BE\u09B2\u09A8 \u09AE\u09C1\u09A8\u09BE\u09AB\u09BE \u09AD\u09BE\u0997 \u09B8\u09C1\u09A6 \u09AC\u09CD\u09AF\u09AF\u09BC\u0964",
      analogy: "How many times over the company can pay its loan interest from operations.",
      for_investor: "A solvency safety check; low coverage is dangerous if rates rise.",
      for_trader: "Background risk; thin coverage means sharper downside on bad news.",
      good_vs_bad: "Good >4x, watch 2-4x, distress <1.5x.",
      what_to_do: "Read with debt-to-equity; rising debt and falling coverage together are a red flag."
    },
    position_sizing: {
      term: "Position Sizing",
      term_bn: "\u09AA\u099C\u09BF\u09B6\u09A8 \u09B8\u09BE\u0987\u099C\u09BF\u0982",
      one_liner: "Deciding how much capital to risk on a single trade or holding.",
      one_liner_bn: "\u098F\u0995\u099F\u09BF \u099F\u09CD\u09B0\u09C7\u09A1 \u09AC\u09BE \u09AC\u09BF\u09A8\u09BF\u09AF\u09BC\u09CB\u0997\u09C7 \u0995\u09A4 \u09AE\u09C2\u09B2\u09A7\u09A8 \u099D\u09C1\u0981\u0995\u09BF\u09A4\u09C7 \u09B0\u09BE\u0996\u09AC\u09C7\u09A8 \u09A4\u09BE \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09A3\u0964",
      analogy: "Not putting all your eggs in one basket \u2014 and deciding how big each basket is.",
      for_investor: "Caps single-name risk so one bad call cannot wreck the portfolio.",
      for_trader: "The discipline that keeps you alive; risk a small, fixed % per trade.",
      good_vs_bad: "Risking ~1-2% of capital per trade is prudent; oversized bets are the usual ruin.",
      what_to_do: "Set size from your stop distance and a fixed risk-per-trade rule (see risk-manager)."
    }
  }
};

// src/financial-terms-educator/lookup.ts
var DISCLAIMER = "Educational analysis only. Not financial advice.";
function load() {
  return glossary_default;
}
function resolveKey(query, terms, keyMap) {
  const q = String(query).trim();
  if (q in terms) return q;
  const lo = q.toLowerCase();
  if (lo in keyMap) return keyMap[lo];
  for (const k of Object.keys(terms)) {
    if (k.toLowerCase() === lo) return k;
  }
  return null;
}
function verdictRoe(v) {
  const pct = v <= 1 ? v * 100 : v;
  if (pct >= 20) return ["good", `${pct.toFixed(0)}% is excellent (>20%).`];
  if (pct >= 15) return ["good", `${pct.toFixed(0)}% is good (>15%).`];
  if (pct >= 10) return ["fair", `${pct.toFixed(0)}% is fair (10-15%).`];
  return ["weak", `${pct.toFixed(0)}% is weak (<10%).`];
}
function verdictPe(v) {
  if (v < 12) return ["good", `P/E ${v.toFixed(1)} is on the cheap side (<12 for DSE).`];
  if (v <= 20) return ["fair", `P/E ${v.toFixed(1)} is fair (12-20).`];
  if (v <= 25) return ["fair", `P/E ${v.toFixed(1)} is fullish (20-25).`];
  return ["weak", `P/E ${v.toFixed(1)} is rich (>25); growth must justify it.`];
}
function verdictPb(v) {
  if (v < 1) return ["good", `P/B ${v.toFixed(1)} is below book (<1) \u2014 potentially cheap.`];
  if (v <= 3) return ["fair", `P/B ${v.toFixed(1)} is normal (1-3).`];
  return ["weak", `P/B ${v.toFixed(1)} is high (>3); needs strong growth/ROE.`];
}
function verdictPeg(v) {
  if (v < 1) return ["good", `PEG ${v.toFixed(2)} is attractive (<1).`];
  if (v <= 2) return ["fair", `PEG ${v.toFixed(2)} is fair (~1-2).`];
  return ["weak", `PEG ${v.toFixed(2)} is expensive for the growth (>2).`];
}
function verdictDe(v) {
  if (v < 0.5) return ["good", `D/E ${v.toFixed(2)} is conservative (<0.5).`];
  if (v <= 1) return ["fair", `D/E ${v.toFixed(2)} is moderate (0.5-1.0).`];
  return ["weak", `D/E ${v.toFixed(2)} is elevated (>1.0) \u2014 leverage risk.`];
}
function verdictCurrent(v) {
  if (v < 1) return ["weak", `Current ratio ${v.toFixed(1)} is below 1 \u2014 liquidity warning.`];
  if (v <= 3) return ["good", `Current ratio ${v.toFixed(1)} is healthy (1.5-3).`];
  return ["fair", `Current ratio ${v.toFixed(1)} is high (>3) \u2014 possibly idle assets.`];
}
function verdictDiv(v) {
  const pct = v <= 1 ? v * 100 : v;
  if (pct >= 4 && pct <= 7) return ["good", `Yield ${pct.toFixed(1)}% is attractive (4-7%) if covered.`];
  if (pct > 7) return ["fair", `Yield ${pct.toFixed(1)}% is high (>7%) \u2014 check it is sustainable.`];
  return ["fair", `Yield ${pct.toFixed(1)}% is modest (<4%).`];
}
function verdictMargin(v) {
  const pct = v <= 1 ? v * 100 : v;
  if (pct >= 20) return ["good", `Margin ${pct.toFixed(0)}% is strong (>=20%).`];
  if (pct >= 10) return ["fair", `Margin ${pct.toFixed(0)}% is moderate (10-20%).`];
  return ["weak", `Margin ${pct.toFixed(0)}% is thin (<10%).`];
}
function verdictGrowth(v) {
  const pct = Math.abs(v) <= 1 ? v * 100 : v;
  if (pct >= 15) return ["good", `Growth ${pct.toFixed(0)}% is strong (>=15%).`];
  if (pct >= 5) return ["fair", `Growth ${pct.toFixed(0)}% is moderate (5-15%).`];
  return ["weak", `Growth ${pct.toFixed(0)}% is slow/negative (<5%).`];
}
function verdictCoverage(v) {
  if (v >= 4) return ["good", `Interest coverage ${v.toFixed(1)}x is safe (>=4x).`];
  if (v >= 2) return ["fair", `Interest coverage ${v.toFixed(1)}x is moderate (2-4x).`];
  return ["weak", `Interest coverage ${v.toFixed(1)}x is risky (<2x).`];
}
function verdictRsi(v) {
  if (v > 70) return ["weak", `RSI ${v.toFixed(0)} is overbought (>70).`];
  if (v < 30) return ["weak", `RSI ${v.toFixed(0)} is oversold (<30).`];
  return ["good", `RSI ${v.toFixed(0)} is in a healthy band (30-70).`];
}
function verdictAdx(v) {
  if (v >= 25) return ["good", `ADX ${v.toFixed(0)} shows a strong trend (>=25).`];
  if (v >= 20) return ["fair", `ADX ${v.toFixed(0)} is a borderline trend (20-25).`];
  return ["weak", `ADX ${v.toFixed(0)} is choppy/range-bound (<20).`];
}
var VERDICTS = {
  ROE: verdictRoe,
  ROA: verdictRoe,
  PE: verdictPe,
  PB: verdictPb,
  PEG: verdictPeg,
  debt_to_equity: verdictDe,
  current_ratio: verdictCurrent,
  dividend_yield: verdictDiv,
  operating_margin: verdictMargin,
  earnings_growth: verdictGrowth,
  interest_coverage: verdictCoverage,
  RSI: verdictRsi,
  ADX: verdictAdx
};
function entry(terms, key) {
  return { ...terms[key], key };
}
function run(req) {
  const g = load();
  const terms = g.terms;
  const keyMap = {};
  for (const [k, v] of Object.entries(g._meta.metric_key_map)) {
    keyMap[k.toLowerCase()] = v;
  }
  const results = [];
  if (req.list === true) {
    results.push(...Object.keys(terms).sort());
    return {
      skill: "financial-terms-educator",
      results,
      count: results.length,
      language: "en+bn",
      disclaimer: DISCLAIMER
    };
  }
  if ("term" in req) {
    const key = resolveKey(req.term, terms, keyMap);
    if (key) results.push(entry(terms, key));
    else results.push({ query: req.term, error: "term not found" });
  } else if ("terms" in req && Array.isArray(req.terms)) {
    for (const q of req.terms) {
      const key = resolveKey(q, terms, keyMap);
      results.push(key ? entry(terms, key) : { query: q, error: "term not found" });
    }
  } else if ("metrics" in req && req.metrics && typeof req.metrics === "object") {
    for (const [mkey, val] of Object.entries(req.metrics)) {
      const key = resolveKey(mkey, terms, keyMap);
      const ann = { metric: mkey, value: val };
      if (key) {
        ann.entry = entry(terms, key);
        const vf = VERDICTS[key];
        if (vf != null && typeof val === "number") {
          try {
            const [verdict, note] = vf(val);
            ann.verdict = verdict;
            ann.assessment = note;
          } catch {
            ann.verdict = "n/a";
            ann.assessment = "value not numeric/assessable";
          }
        } else {
          ann.verdict = "n/a";
          ann.assessment = "No threshold rule for this term; see entry's good_vs_bad field.";
        }
      } else {
        ann.error = "no glossary entry for this metric key";
      }
      results.push(ann);
    }
  } else {
    return {
      skill: "financial-terms-educator",
      error: "request must include one of: term, terms, metrics, list"
    };
  }
  return {
    skill: "financial-terms-educator",
    results,
    count: results.length,
    language: "en+bn",
    disclaimer: DISCLAIMER
  };
}

// src/cli/financial-terms-educator.ts
runCli(run, parseCliArgs(process.argv));
//# sourceMappingURL=financial-terms-educator.js.map