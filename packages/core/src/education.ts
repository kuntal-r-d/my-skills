export interface CriterionEducation {
  simple: string;
  bangla: string;
  example: string;
  formattedValue: string | null;
  /** Plain-language pass bar derived from the criterion label. */
  target: string;
  /** Human-readable line for the stock's numbers (or a missing-data note). */
  dataLine: string;
  /** Where to find missing fields, when applicable. */
  missingHint: string | null;
  beginner: string;
  intermediate: string;
  advanced: string;
}

export interface CriterionEducationOptions {
  passed?: boolean | null;
  missingFields?: string[];
}

const DATA_FIELD_LABELS: Record<string, string> = {
  free_cash_flow: 'free cash flow (FCF)',
  moat: 'economic moat (qualitative)',
  roe: 'return on equity (ROE)',
  debt_to_equity: 'debt-to-equity ratio',
  profit_margin: 'profit margin',
  eps_history: 'EPS history (multi-year)',
  intrinsic_value: 'intrinsic / fair value estimate',
  price: 'share price',
  peg: 'PEG ratio',
  earnings_growth: 'earnings growth rate',
  revenue_growth: 'revenue growth rate',
  inventory_turnover: 'inventory turnover',
  insider_buying: 'insider buying activity',
  institution_ownership: 'institutional ownership %',
  buyback: 'share buyback program',
  pe: 'P/E ratio',
  pb: 'P/B ratio',
  current_ratio: 'current ratio',
  dividend_yield: 'dividend yield',
  ncav_per_share: 'net current asset value per share',
  operating_margin: 'operating margin',
  return_on_assets: 'return on assets (ROA)',
  interest_coverage: 'interest coverage',
  earnings_surprise: 'recent earnings surprise',
  market_index: 'market index comparison data',
  ohlcv: 'price & volume history (OHLCV bars)',
};

const DATA_FIELD_HINTS: Record<string, string> = {
  free_cash_flow:
    'Check the annual report cash-flow statement (operating cash flow minus capital expenditure). Stock Buddy ingest does not auto-fill FCF yet.',
  moat:
    'Judgment call from brand strength, margins, and competitive position — not available from price feeds alone.',
  eps_history:
    'Multi-year EPS from DSE financial tables or annual reports. Run a full fundamentals ingest.',
  intrinsic_value:
    'Comes from fundamental-analysis after enough inputs exist, or from your own DCF / Graham estimate.',
  inventory_turnover: 'From annual report operating metrics — not in basic DSE quote pages.',
  insider_buying: 'From DSE sponsor/director trading disclosures.',
  institution_ownership: 'From monthly DSE shareholding breakdown (ingest shareholding).',
  buyback: 'From corporate announcements or annual report notes.',
  ncav_per_share: 'Balance-sheet deep dive — current assets minus total liabilities, per share.',
  earnings_surprise: 'Latest results vs prior consensus — often from news or research platforms.',
  market_index: 'Needs benchmark index OHLCV loaded for relative-strength comparison.',
  ohlcv: 'Run OHLCV ingest (Ops tab or ingest job) — at least 30 daily bars required.',
};

export function humanizeDataField(field: string): string {
  const key = field.split('/')[0]!.trim();
  return DATA_FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
}

export function missingFieldsHint(fields: string[]): string | null {
  if (!fields.length) return null;
  const labels = fields.flatMap((f) => f.split('/').map((p) => humanizeDataField(p)));
  const unique = [...new Set(labels)];
  const hints = fields
    .flatMap((f) => f.split('/'))
    .map((k) => DATA_FIELD_HINTS[k])
    .filter(Boolean);
  const hintText = hints.length ? ` ${hints[0]}` : ' Run fundamentals ingest or add via research memo.';
  return `Waiting on: ${unique.join(', ')}.${hintText}`;
}

/** Turn checklist labels like "ROE > 15%" into investor-friendly targets. */
export function targetFromLabel(label: string): string {
  const l = label.trim();
  if (/^business understandable$/i.test(l)) return 'You should be able to explain what the company does in plain language.';
  if (/positive$/i.test(l) || /present$/i.test(l) || /in place$/i.test(l)) {
    return `Must satisfy: ${l.charAt(0).toLowerCase()}${l.slice(1)}`;
  }
  if (/buying$/i.test(l)) return `Must satisfy: ${l.charAt(0).toLowerCase()}${l.slice(1)}`;
  if (l.includes('>=')) return `Need ${l.replace('>=', 'at least').replace('>', ' above ')}`;
  if (l.includes('<=')) return `Need ${l.replace('<=', 'at most').replace('<', ' below ')}`;
  if (l.includes('>')) return `Need ${l.replace('>', ' above ')}`;
  if (l.includes('<')) return `Need ${l.replace('<', ' below ')}`;
  if (/between/i.test(l)) return `Need ${l}`;
  if (/understandable/i.test(l)) return l;
  return `Need: ${l}`;
}

const RATIO_LABELS =
  /roe|margin|yield|growth|below|above|within|distance|atr\/price|ownership|surprise|turnover|coverage|inflation/i;

function isRatioField(key: string, n: number): boolean {
  if (RATIO_LABELS.test(key)) return true;
  return Math.abs(n) <= 1.5 && !/pe|peg|pb|p\/e|p\/b|ratio|current/i.test(key);
}

export function formatCriterionValue(label: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (!value.length) return 'No data';
    const allNum = value.every((x) => typeof x === 'number');
    if (allNum && value.length <= 12) {
      return value.map((x) => (typeof x === 'number' ? x.toFixed(2) : String(x))).join(', ');
    }
    return `${value.length} periods`;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const parts = Object.entries(o)
      .filter(([, v]) => v != null)
      .map(([k, v]) => {
        if (typeof v === 'number' && isRatioField(k, v)) return `${k.replace(/_/g, ' ')}: ${(v * 100).toFixed(1)}%`;
        if (typeof v === 'number') return `${k.replace(/_/g, ' ')}: ${v.toFixed(2)}`;
        return `${k.replace(/_/g, ' ')}: ${v}`;
      });
    return parts.length ? parts.join(' · ') : null;
  }
  if (typeof value === 'number') {
    const l = label.toLowerCase();
    if (isRatioField(l, value)) return `${(value * 100).toFixed(1)}%`;
    if (l.includes('p/e') || l.includes('peg') || l.includes('p/b') || l.includes('current ratio') || l.includes('interest coverage')) {
      return value.toFixed(2);
    }
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return value.toLocaleString('en-BD', { maximumFractionDigits: 2 });
    return value.toFixed(2);
  }
  return String(value);
}

type Copy = { simple: string; bangla: string; example: string };

const INVESTMENT_COPY: Record<string, Copy> = {
  'Economic moat present': {
    simple: 'A moat is a lasting edge — brand, cost, or regulation — that keeps rivals from stealing profits.',
    bangla: 'মোয়াত মানে দীর্ঘমেয়াদি প্রতিযোগিতামূলক সুবিধা; যেমন শক্তিশালী ব্র্যান্ড বা নেটওয়ার্ক।',
    example: 'Square Pharma’s brand trust is a moat; a tiny unknown firm usually has none.',
  },
  'ROE > 15%': {
    simple: 'ROE shows how much profit the company makes per ৳100 of shareholder money.',
    bangla: 'ROE বলে প্রতি ৳১০০ শেয়ারহোল্ডারের টাকায় কত লাভ হয়। ১৫% এর উপরে ভালো।',
    example: 'ROE 8.3% ≈ ৳8.30 profit per ৳100 equity — below the 15% quality bar.',
  },
  'Debt/Equity < 0.5': {
    simple: 'Debt/Equity compares borrowing to owner money. Lower means less stress in bad years.',
    bangla: 'ঋণ বনাম মালিকানা টাকা। ০.৫ এর নিচে সাধারণত নিরাপদ।',
    example: 'D/E 0.21 means ৳21 debt for every ৳100 equity — comfortably low.',
  },
  'Profit margin > 20%': {
    simple: 'Profit margin is what is left from sales after costs — higher means stronger pricing power.',
    bangla: 'বিক্রির পর খরচ বাদে যে লাভ থাকে তাই মার্জিন। ২০% এর উপরে শক্তিশালী।',
    example: 'Margin 14% means ৳14 kept from each ৳100 sales — good, but below the 20% target.',
  },
  'Free cash flow positive': {
    simple: 'FCF is real cash left after running and growing the business — not just accounting profit.',
    bangla: 'ব্যবসা চালানোর পর হাতে যে আসল নগদ টাকা থাকে তাই FCF। ধনাত্মক হওয়া ভালো।',
    example: 'Positive FCF can fund dividends or expansion without new loans.',
  },
  'Quality management (proxy: ROE>15% & margin>15%)': {
    simple: 'We proxy good management with both high ROE and healthy margins at once.',
    bangla: 'উচ্চ ROE এবং ভালো মার্জিন একসাথে থাকলে ব্যবস্থাপনা শক্তিশালী ধরা হয়।',
    example: 'Both need to clear 15% — one strong number alone is not enough.',
  },
  'Predictable earnings (all EPS history positive)': {
    simple: 'Every year in the EPS history should show profit — no loss years.',
    bangla: 'EPS ইতিহাসে প্রতি বছর লাভ থাকা উচিত; কোনো বছর লোকসান থাকলে ঝুঁকি বাড়ে।',
    example: 'Ten straight positive EPS years are easier to value than a boom-bust pattern.',
  },
  'Trading >= 25% below intrinsic value': {
    simple: 'Buy with a margin of safety — price at least 25% under our fair-value estimate.',
    bangla: 'মূল্য অন্তত ২৫% অন্তর্নিহিত মূল্যের নিচে থাকলে নিরাপদ কেনার জায়গা পাওয়া যায়।',
    example: 'Fair value ৳100 and price ৳70 → 30% discount → passes.',
  },
  'Business understandable': {
    simple: 'Buffett only buys businesses he can explain in plain language.',
    bangla: 'ব্যবসাটি সহজ ভাষায় বোঝা যায় কিনা — জটিল মডেল এড়ানো ভালো।',
    example: 'A bank or pharma with clear revenue is easier than an opaque holding maze.',
  },
  'Sustainable competitive advantage': {
    simple: 'The moat must last years, not fade after one good quarter.',
    bangla: 'প্রতিযোগিতামূলক সুবিধা বছরের পর বছর টিকে থাকতে হবে।',
    example: 'A one-time subsidy is not a moat; a dominant distribution network might be.',
  },
  'PEG < 1.0': {
    simple: 'PEG links P/E to growth — under 1.0 means you are not overpaying for growth.',
    bangla: 'PEG ১.০ এর নিচে মানে বৃদ্ধির তুলনায় দাম বেশি নয়।',
    example: 'PEG 0.8 with solid growth is Lynch-style GARP territory.',
  },
  'Earnings growth 15-30%': {
    simple: 'Earnings should grow fast enough to compound, but not so hot it cannot last.',
    bangla: 'লাভের বৃদ্ধি ১৫–৩০% রেঞ্জে থাকলে টেকসই মনে হয়।',
    example: '25% EPS growth can double earnings in ~3 years if sustained.',
  },
  'Revenue growth consistent with earnings (within 10pp)': {
    simple: 'Sales growth should roughly match profit growth — not profits from cuts alone.',
    bangla: 'বিক্রি ও লাভের বৃদ্ধি কাছাকাছি হওয়া উচিত; শুধু খরচ কাটা নয়।',
    example: 'Revenue +18% and earnings +20% → aligned and credible.',
  },
  'Inventory turnover improving': {
    simple: 'Faster inventory turns mean goods sell quickly and cash is not stuck in stock.',
    bangla: 'ইনভেন্টরি দ্রুত ঘুরলে পণ্য দ্রুত বিক্রি হয়, নগদ আটকে থাকে না।',
    example: 'Turnover rising from 4× to 5× per year is a healthy Lynch signal.',
  },
  'Insider buying': {
    simple: 'Directors or sponsors buying shares often signals real confidence.',
    bangla: 'পরিচালক বা প্রমোটার কেনলে সাধারণত আস্থা বোঝায়।',
    example: 'Open-market insider buys on DSE filings are worth watching.',
  },
  'Institutional ownership < 60%': {
    simple: 'Room left for funds to discover the stock — not already fully owned by institutions.',
    bangla: 'প্রাতিষ্ঠানিক মালিকানা ৬০% এর নিচে থাকলে আরও ক্রেতা আসার জায়গা থাকে।',
    example: 'Ownership 40% means big funds could still build positions.',
  },
  'Share buyback in place': {
    simple: 'Buybacks return cash to shareholders and lift earnings per share.',
    bangla: 'শেয়ার কিনে নিলে প্রতি শেয়ারে লাভ বাড়তে পারে।',
    example: 'A company retiring 5% of shares boosts EPS even if total profit is flat.',
  },
  'P/E < earnings-growth rate': {
    simple: "Lynch: if growth is 20%, P/E below 20 is fair; growth should exceed the multiple.",
    bangla: 'লিঞ্চের নিয়ম: বৃদ্ধির হারের চেয়ে P/E কম হলে ভালো।',
    example: '20% growth and P/E 15 → growth rate beats the multiple.',
  },
  'P/E < 15': {
    simple: 'Low P/E limits how much you pay for each ৳1 of annual earnings.',
    bangla: 'কম P/E মানে প্রতি টাকা লাভের জন্য কম দাম দিচ্ছেন।',
    example: 'P/E 12 on a steady earner is cheaper than P/E 25 on the same profit.',
  },
  'P/B < 1.5': {
    simple: 'P/B compares price to book assets — lower gives more asset backing.',
    bangla: 'P/B কম হলে বই মূল্যের কাছাকাছি কেনা — সম্পদের নিরাপত্তা বেশি।',
    example: 'P/B 1.2 means you pay ৳1.20 per ৳1 of net assets.',
  },
  'P/E x P/B < 22.5 (Graham number)': {
    simple: "Graham's combined test: cheap on both earnings and book value.",
    bangla: 'গ্রাহামের যৌথ পরীক্ষা: P/E × P/B ২২.৫ এর নিচে।',
    example: 'P/E 10 × P/B 2 = 20 → passes the classic Graham screen.',
  },
  'Current ratio > 2': {
    simple: 'Current assets should be at least 2× short-term bills — liquidity cushion.',
    bangla: 'স্বল্পমেয়াদি সম্পদ দায়ের দ্বিগুণের বেশি হলে নগদ চাপ সহনীয়।',
    example: 'Ratio 2.5 means ৳250 of liquid assets vs ৳100 due within a year.',
  },
  'Pays a dividend': {
    simple: 'A dividend shows real cash profits returned to owners.',
    bangla: 'লভ্যাংশ মানে কোম্পানি আসল লাভ শেয়ারহোল্ডারকে দিচ্ছে।',
    example: 'A 3% yield on ৳100 stock pays about ৳3 cash per year per share.',
  },
  'Long-run earnings growth (first EPS < last)': {
    simple: 'Latest EPS should be clearly higher than the oldest year in history.',
    bangla: 'দীর্ঘমেয়াদে EPS বেড়েছে কিনা দেখুন।',
    example: 'EPS rising from ৳2 to ৳8 over ten years shows real compounding.',
  },
  'Price < 67% of NCAV': {
    simple: 'Deep value: price below two-thirds of net current asset value per share.',
    bangla: 'দাম NCAV এর ৬৭% এর নিচে — গ্রাহামের গভীর নিরাপত্তা মার্জিন।',
    example: 'NCAV ৳150 and price ৳90 → 60% of NCAV → deep bargain if real.',
  },
  'Earnings stability (no negative EPS year)': {
    simple: 'No loss years in EPS history — defensive, dependable earnings.',
    bangla: 'কোনো বছর লোকসান না থাকা — স্থিতিশীল আয়।',
    example: 'A utility with 12 positive EPS years fits this defensive test.',
  },
  'Revenue growth > inflation': {
    simple: 'Sales must grow faster than inflation or the business shrinks in real terms.',
    bangla: 'বিক্রি মুদ্রাস্ফীতির চেয়ে বেশি বাড়তে হবে।',
    example: '8% revenue growth vs 6% inflation → real growth of about 2%.',
  },
  'Operating margin healthy (>10%)': {
    simple: 'Operating margin is core profit from operations before interest and tax.',
    bangla: 'অপারেটিং মার্জিন ১০% এর উপরে হলে মূল ব্যবসা লাভজনক।',
    example: '12% operating margin → ৳12 operating profit per ৳100 sales.',
  },
  'Return on assets > 5%': {
    simple: 'ROA shows how efficiently all assets (plants, cash, inventory) generate profit.',
    bangla: 'ROA বলে সম্পদ কত দক্ষতায় লাভ করে। ৫% এর উপরে ভালো।',
    example: 'ROA 7% means ৳7 profit per ৳100 of total assets.',
  },
  'Interest coverage > 3': {
    simple: 'Operating profit should cover interest at least 3× — low default risk.',
    bangla: 'সুদের চেয়ে অপারেটিং লাভ কমপক্ষে ৩ গুণ বেশি হওয়া উচিত।',
    example: 'Coverage 4× → profit can pay interest four times over.',
  },
};

const MOMENTUM_COPY: Record<string, Copy> = {
  'Close > 50-day MA': {
    simple: 'Price above the 50-day average means recent buyers are in control.',
    bangla: 'দাম ৫০ দিনের গড়ের উপরে — সাম্প্রতিক ট্রেন্ড শক্তিশালী।',
    example: 'Close ৳85 vs 50-day MA ৳80 → short-term uptrend.',
  },
  'Close > 150-day MA': {
    simple: 'Above the 150-day line confirms the medium-term trend is up.',
    bangla: '১৫০ দিনের গড়ের উপরে — মাঝমেয়াদি উর্ধ্বমুখী ট্রেন্ড।',
    example: 'Holding above 150-day MA for weeks filters weak bounces.',
  },
  'Close > 200-day MA': {
    simple: 'Above the 200-day average is the classic long-term bull trend test.',
    bangla: '২০০ দিনের গড়ের উপরে — দীর্ঘমেয়াদি ঊর্ধ্বগামী বাজার।',
    example: 'Many DSE leaders stay above the 200-day MA during strong phases.',
  },
  '50-day MA > 150-day MA': {
    simple: 'Short average above medium average — momentum is improving.',
    bangla: '৫০ দিনের গড় ১৫০ দিনের গড়ের উপরে — গতি বাড়ছে।',
    example: 'This “golden cross” stack often precedes sustained rallies.',
  },
  '150-day MA > 200-day MA': {
    simple: 'Medium average above long average — trend stack aligned upward.',
    bangla: '১৫০ দিনের গড় ২০০ দিনের উপরে — ট্রেন্ড সারি ঠিক আছে।',
    example: 'All three MAs stacked up is the Minervini trend template.',
  },
  '200-day MA rising (~1 month)': {
    simple: 'The long-term average itself should slope up, not flatten or fall.',
    bangla: '২০০ দিনের গড় উর্ধ্বমুখী হওয়া উচিত — ট্রেন্ড এখনও জীবিত।',
    example: 'A rising 200-day MA filters stocks still in structural decline.',
  },
  'Within 25% of 52-week high': {
    simple: 'Leaders trade near highs — not 50% off the peak.',
    bangla: '৫২ সপ্তাহের সর্বোচ্চের ২৫% এর মধ্যে — শক্তিশালী স্টকের চিহ্ন।',
    example: 'High ৳100, price ৳80 → 20% below high → in the leader zone.',
  },
  '>= 30% above 52-week low': {
    simple: 'A solid bounce off the yearly low — not a falling knife.',
    bangla: '৫২ সপ্তাহের নিম্ন থেকে কমপক্ষে ৩০% উপরে — পুনরুদ্ধার দেখায়।',
    example: 'Low ৳50, price ৳70 → 40% above low → recovery confirmed.',
  },
  'RSI between 40 and 70': {
    simple: 'RSI in 40–70 is strong momentum without being overbought.',
    bangla: 'RSI ৪০–৭০ — শক্তিশালী কিন্তু অতিরিক্ত কেনা নয়।',
    example: 'RSI 55 shows buyers active; above 70 often means exhaustion.',
  },
  'MACD above signal line': {
    simple: 'MACD line above its signal hints bullish momentum is accelerating.',
    bangla: 'MACD সিগন্যাল লাইনের উপরে — ঊর্ধ্বমুখী গতি।',
    example: 'A fresh MACD cross above signal often marks trend resumption.',
  },
  'ROC positive and rising': {
    simple: 'Rate of change positive and speeding up — momentum building.',
    bangla: 'ROC ধনাত্মক ও বাড়ছে — গতি ত্বরান্বিত হচ্ছে।',
    example: 'ROC rising from 2% to 5% shows the move is strengthening.',
  },
  'ADX > 25': {
    simple: 'ADX above 25 means a real trend, not sideways chop.',
    bangla: 'ADX ২৫ এর উপরে — স্পষ্ট ট্রেন্ড, দুলছে না।',
    example: 'ADX 30 with rising price → trend has conviction.',
  },
  'MFI between 20 and 80': {
    simple: 'Money Flow Index 20–80 — healthy buying without a blow-off top.',
    bangla: 'MFI ২০–৮০ — সুস্থ কেনাকাটা, চরম উত্তেজনা নয়।',
    example: 'MFI 65 with rising price shows money flowing in steadily.',
  },
  'Bollinger %B favourable (0.5-1.0)': {
    simple: 'Price in the upper half of Bollinger bands — strength without bursting out.',
    bangla: 'বলিঞ্জার ব্যান্ডের উপরের অর্ধে — শক্তি কিন্তু অতিরিক্ত নয়।',
    example: '%B 0.75 means price sits in the strong upper zone of the band.',
  },
  'OBV trending up': {
    simple: 'On-Balance Volume rising means volume confirms the price rise.',
    bangla: 'OBV বাড়লে দামের সাথে ভলিউমও সমর্থন করে।',
    example: 'Price flat but OBV up can warn of accumulation before a breakout.',
  },
  'Volume > 20-day average': {
    simple: 'Today’s volume beats the 20-day average — real participation.',
    bangla: 'আজকের ভলিউম ২০ দিনের গড়ের চেয়ে বেশি — আগ্রহ বেশি।',
    example: '1.5× average volume on a green day supports the move.',
  },
  'Accumulation/Distribution rising': {
    simple: 'Rising A/D line means buyers dominate intraday — accumulation.',
    bangla: 'A/D লাইন বাড়লে ক্রেতারা দিনের মধ্যে বেশি নিয়ন্ত্রণে।',
    example: 'Price dips but A/D rises → smart money may be buying dips.',
  },
  'Volume ROC positive': {
    simple: 'Volume growing vs a month ago — fresh interest entering.',
    bangla: 'ভলিউম গত মাসের তুলনায় বাড়ছে — নতুন আগ্রহ।',
    example: 'Positive volume ROC often appears before DSE momentum leaders run.',
  },
  'Earnings acceleration': {
    simple: 'Each year’s EPS growth should beat the prior year — Driehaus style.',
    bangla: 'প্রতি বছরের EPS বৃদ্ধি আগের বছরের চেয়ে বেশি হওয়া উচিত।',
    example: 'Growth 10% then 18% then 25% shows acceleration.',
  },
  'Positive recent earnings surprise': {
    simple: 'Beating estimates often triggers the next leg up in momentum names.',
    bangla: 'আশার চেয়ে ভালো ফলাফল মোমেন্টাম শেয়ারে উত্থান ঘটাতে পারে।',
    example: 'EPS beat + gap-up day is a classic short-term catalyst on DSE.',
  },
  'Institutional accumulation (rel. volume > 1.2)': {
    simple: 'Volume 20%+ above normal hints big players are building positions.',
    bangla: 'স্বাভাবিকের ২০% বেশি ভলিউম — বড় ক্রেতা কিনছে হতে পারে।',
    example: 'Relative volume 1.3 on up days suggests institutional buying.',
  },
  'Relative strength vs market positive': {
    simple: 'Stock outperforming the broad index — money rotating in.',
    bangla: 'সূচকের চেয়ে শেয়ার ভালো করছে — টাকা এই দিকে আসছে।',
    example: 'Stock +15% in 3 months while DSEX +5% → positive relative strength.',
  },
  'ATR within acceptable range (ATR/price < 6%)': {
    simple: 'Lower daily swing (ATR) means tighter stops and less gap risk.',
    bangla: 'ATR/দাম ৬% এর নিচে — দৈনিক ওঠানামা কম, স্টপ টাইট রাখা যায়।',
    example: 'ATR/price 4% on a ৳100 stock ≈ ৳4 typical daily range.',
  },
  'Distance from support < 8%': {
    simple: 'Entry near support keeps risk small — stop just below the floor.',
    bangla: 'সাপোর্টের কাছে কেনা — ঝুঁকি কম, স্টপ কাছাকাছি।',
    example: 'Support ৳92, price ৳95 → ~3% above support → tight risk.',
  },
  'No major resistance within 10%': {
    simple: 'Room above price before the next ceiling — room to run.',
    bangla: 'উপরে ১০% এর মধ্যে বড় বাধা না থাকা — দাম ছুটতে পারে।',
    example: 'Resistance ৳110, price ৳95 → ~16% headroom → clear path.',
  },
  // --- Minervini SEPA (VCP, fundamentals, risk) ---
  'Volatility contraction (ranges tightening)': {
    simple: 'Each recent price pause is narrower than the one before — like a spring coiling before a possible jump up.',
    bangla: 'প্রতিটি সাম্প্রতিক দামের বিরতি আগেরটির চেয়ে সঙ্কুচিত — ভেতরে চাপ জমছে, বিক্রেতারা দুর্বল হচ্ছে।',
    example: 'Range shrinks from 15% to 10% to 6% over three bases — classic VCP tightening.',
  },
  'ATR declining vs prior segment': {
    simple: 'Average daily price swings are getting smaller — calm often comes before a sharp move.',
    bangla: 'গড় দৈনিক ওঠানামা কমছে — শান্তি প্রায়ই বড় ছুটির আগে আসে।',
    example: 'ATR falling while price holds steady often signals sellers are exhausted.',
  },
  'Price in upper half of base': {
    simple: 'While moving sideways, price stays in the top half of the range — buyers are absorbing selling.',
    bangla: 'পাশ্বরেখায় চলাকালীন দাম রেঞ্জের উপরের অর্ধে — ক্রেতারা বিক্রি শোষণ করছে।',
    example: 'Base ৳90–৳100 with price at ৳97 shows demand at the highs.',
  },
  'EPS growth >= 20% (latest period)': {
    simple: 'Earnings per share grew at least 20% in the latest period — the business is growing profits quickly.',
    bangla: 'সর্বশেষ সময়ে শেয়ারপ্রতি আয় (EPS) কমপক্ষে ২০% বেড়েছে — লাভ দ্রুত বাড়ছে।',
    example: 'EPS ৳2.0 → ৳2.5 is 25% growth — passes Minervini’s growth bar.',
  },
  'Earnings acceleration (growth speeding up)': {
    simple: 'This period’s profit growth is faster than last period’s — growth is speeding up, not slowing.',
    bangla: 'এই সময়ের লাভের বৃদ্ধি গত সময়ের চেয়ে দ্রুত — বৃদ্ধি ত্বরান্বিত হচ্ছে।',
    example: 'EPS growth 10% then 18% then 28% shows true acceleration.',
  },
  'ATR/price < 6%': {
    simple: 'Day-to-day price moves are modest (under ~6% of the stock price) — easier to set a tight stop.',
    bangla: 'দৈনিক ওঠানামা মাঝারি (দামের ~৬% এর নিচে) — টাইট স্টপ রাখা সহজ।',
    example: 'ATR ৳4 on a ৳100 stock = 4% — controlled volatility.',
  },
  'Not extended >15% above 50-day MA': {
    simple: 'Price has not run too far above its 50-day average — you are not chasing an already extended move.',
    bangla: 'দাম ৫০ দিনের গড়ের খুব উপরে নয় — ইতিমধ্যে অতিরিক্ত ছুটে ওঠা স্টক নয়।',
    example: '50-day MA ৳100, price ৳112 (12% above) → still OK; ৳120 (20%) → too extended.',
  },
  // --- CAN SLIM ---
  'Current quarterly EPS growth >= 18%': {
    simple: 'Latest-quarter earnings per share jumped at least ~18% — strong recent profit growth.',
    bangla: 'সর্বশেষ ত্রৈমাসিকে EPS কমপক্ষে ~১৮% বেড়েছে — সাম্প্রতিক লাভের বৃদ্ধি শক্তিশালী।',
    example: 'Quarter EPS ৳1.00 → ৳1.20 = 20% — passes CAN SLIM “C”.',
  },
  'Earnings trend positive (latest > prior)': {
    simple: 'The most recent EPS is higher than the one before — earnings are moving up, not down.',
    bangla: 'সর্বশেষ EPS আগেরটির চেয়ে বেশি — আয় ঊর্ধ্বমুখী, নিম্নমুখী নয়।',
    example: 'EPS rising ৳1.8 → ৳2.1 shows a positive earnings trend.',
  },
  'Annual EPS growth positive (multi-year)': {
    simple: 'Over several years, earnings have grown on average — not a one-quarter fluke.',
    bangla: 'কয়েক বছর ধরে গড়ে EPS বেড়েছে — শুধু এক ত্রৈমাসিকের ঝলক নয়।',
    example: 'EPS CAGR 12% over five years supports a real growth story.',
  },
  'ROE >= 15% (quality proxy)': {
    simple: 'Return on equity is at least 15% — the company earns good profit on shareholders’ money.',
    bangla: 'ROE কমপক্ষে ১৫% — শেয়ারহোল্ডারের টাকায় ভালো লাভ আসছে।',
    example: 'ROE 18% means ৳18 profit per ৳100 of equity — quality growth.',
  },
  'Within 15% of 52-week high': {
    simple: 'Price is very close to its yearly high — a sign of leadership and fresh strength.',
    bangla: 'দাম বার্ষিক সর্বোচ্চের খুব কাছে — নেতৃত্ব ও নতুন শক্তির চিহ্ন।',
    example: '52-week high ৳100, price ৳88 → 12% below → near-high leader.',
  },
  'Positive earnings surprise': {
    simple: 'The company beat what analysts expected — a positive surprise that can spark the next leg up.',
    bangla: 'আশার চেয়ে ভালো ফলাফল — ইতিবাচক চমক যা পরের ধাপের উত্থান ঘটাতে পারে।',
    example: 'EPS beat + strong volume day is a classic CAN SLIM catalyst.',
  },
  'Relative volume > 1.2x (demand)': {
    simple: 'Today’s volume is more than 20% above normal — extra buyers are showing up.',
    bangla: 'আজকের ভলিউম স্বাভাবিকের ২০% এর বেশি — অতিরিক্ত ক্রেতা এসেছে।',
    example: 'Relative volume 1.4 on a green day signals strong demand.',
  },
  'Reasonable supply (not mega-cap dilution)': {
    simple: 'Share count is not huge — smaller supply can move faster when demand arrives.',
    bangla: 'শেয়ার সংখ্যা বিশাল নয় — কম সাপ্লাই চাহিদায় দ্রুত নড়তে পারে।',
    example: 'Under 500M shares is a practical DSE float proxy for CAN SLIM “S”.',
  },
  'Relative strength vs market': {
    simple: 'The stock has risen more than the broad market — money is flowing into this name.',
    bangla: 'সূচকের চেয়ে শেয়ার ভালো করেছে — টাকা এই দিকে আসছে।',
    example: 'Stock +15% vs index +5% in 3 months → leadership.',
  },
  '12-month ROC positive': {
    simple: 'Price is higher than it was about 12 months ago — positive momentum over a year.',
    bangla: 'প্রায় ১২ মাস আগের চেয়ে দাম বেশি — বার্ষিক মোমেন্টাম ধনাত্মক।',
    example: 'ROC +18% means the stock is up meaningfully over the past year.',
  },
  'Institutional sponsorship rising': {
    simple: 'Big holders (institutions/funds) are increasing their stake — “smart money” interest is growing.',
    bangla: 'বড় ধরনের হোল্ডাররা অংশ বাড়াচ্ছে — স্মার্ট মানির আগ্রহ বাড়ছে।',
    example: 'Institutional % rising from 22% to 25% over two filings.',
  },
  'Fund holder count >= 2': {
    simple: 'At least two funds hold the stock — not relying on a single buyer.',
    bangla: 'কমপক্ষে দুটি ফান্ড শেয়ার ধরে — একক ক্রেতার উপর নির্ভর নয়।',
    example: 'Three disclosed fund holders adds sponsorship breadth.',
  },
  'Market in uptrend': {
    simple: 'The overall market is supportive — rising index or above its long average. Don’t fight a weak market.',
    bangla: 'সামগ্রিক বাজার সহায়ক — সূচক উর্ধ্বমুখী বা দীর্ঘ গড়ের উপরে। দুর্বল বাজারের বিপক্ষে যাবেন না।',
    example: 'DSEX above its 200-day MA is a risk-on backdrop for momentum trades.',
  },
  'Market 3M ROC positive': {
    simple: 'The market index is up over roughly the last 3 months — short-term market momentum is positive.',
    bangla: 'গত ~৩ মাসে সূচক বেড়েছে — স্বল্পমেয়াদি বাজার মোমেন্টাম ধনাত্মক।',
    example: 'Index +6% over 13 weeks confirms a supportive “M” in CAN SLIM.',
  },
  // --- Darvas Box ---
  'Trading inside a defined box': {
    simple: 'Price is moving sideways between a clear ceiling and floor — consolidation, not wild trending.',
    bangla: 'দাম স্পষ্ট ছাদ ও মেঝের মধ্যে পাশ্বরেখায় চলছে — সংহতকরণ, বিশৃঙ্খল ট্রেন্ড নয়।',
    example: 'Box ৳48–৳52 for three weeks — classic Darvas consolidation.',
  },
  'Box range reasonably tight (< 25% width)': {
    simple: 'The high–low range is not too wide — controlled consolidation, not chaos.',
    bangla: 'উচ্চ–নিম্নের পার্থক্য বেশি নয় — নিয়ন্ত্রিত সংহতকরণ।',
    example: 'Box width 12% of price is tight; 35% is too loose for Darvas.',
  },
  'Box tightening (VCP-style contraction)': {
    simple: 'This box is narrower than the previous one — pressure building for a move.',
    bangla: 'এই বক্স আগেরটির চেয়ে সঙ্কুচিত — ছুটির জন্য চাপ জমছে।',
    example: 'Prior box 20% wide, current box 14% — tightening sequence.',
  },
  'Price at upper half of box': {
    simple: 'Price sits in the top half of the range — buyers are defending the upper area.',
    bangla: 'দাম রেঞ্জের উপরের অর্ধে — ক্রেতারা উপরের অংশ রক্ষা করছে।',
    example: 'Box ৳50–৳60, price ৳57 — holding upper box.',
  },
  'Breakout above box high': {
    simple: 'Price has pushed above the top of the box — classic Darvas entry signal.',
    bangla: 'দাম বক্সের ছাদ ভেঙে উপরে — ক্লাসিক দারভাস এন্ট্রি সংকেত।',
    example: 'Box high ৳52, close ৳53.5 on volume — breakout day.',
  },
  'Volume > 1.5x average on move': {
    simple: 'Volume on the move is at least 50% above normal — real participation, not a thin fake breakout.',
    bangla: 'ছুটির দিন ভলিউম স্বাভাবিকের কমপক্ষে ৫০% বেশি — সত্যিকারের অংশগ্রহণ।',
    example: 'Relative volume 1.8× on breakout close validates the move.',
  },
  'Close above box high (or testing)': {
    simple: 'The closing price is at or through the box ceiling — not just a brief intraday spike.',
    bangla: 'ক্লোজিং দাম বক্সের ছাদে বা তার উপরে — শুধু ইনট্রাডে স্পাইক নয়।',
    example: 'Close ৳52.2 vs box high ৳52.0 — accepted above the box.',
  },
  'Stop at box floor defined': {
    simple: 'A clear stop exists at the bottom of the box — if price falls back in, you exit.',
    bangla: 'বক্সের মেঝেতে স্পষ্ট স্টপ — দাম ফিরে এলে বের হন।',
    example: 'Box low ৳48 is the mechanical Darvas stop level.',
  },
  'Stop distance acceptable (< 12%)': {
    simple: 'The gap from current price down to that stop is less than ~12% — risk is defined and not huge.',
    bangla: 'বর্তমান দাম থেকে স্টপ পর্যন্ত ব্যবধান ~১২% এর নিচে — ঝুঁকি সীমিত।',
    example: 'Price ৳53, box stop ৳48 → ~9% risk — acceptable.',
  },
  'ATR/price < 8%': {
    simple: 'Day-to-day volatility is not extreme — the box setup is tradeable without wild swings.',
    bangla: 'দৈনিক অস্থিরতা চরম নয় — বক্স সেটআপে ট্রেড করা যায়।',
    example: 'ATR/price 5% suits box trading; 12% is often too wild.',
  },
  // --- Livermore Pivot ---
  'Pivot level identified': {
    simple: 'A recent consolidation high is marked — the price level where momentum may accelerate if broken.',
    bangla: 'সাম্প্রতিক সংহতকরণের উচ্চ স্তর চিহ্নিত — ভাঙলে গতি বাড়তে পারে এমন স্তর।',
    example: 'Highest high of the last 20 bars before today = pivot at ৳65.',
  },
  'Price crossed pivot (go signal)': {
    simple: 'Price has broken above that pivot — the “go” moment in Livermore’s method.',
    bangla: 'দাম পিভট ভেঙে উপরে — লিভারমোরের “গো” মুহূর্ত।',
    example: 'Pivot ৳65, close ৳66.5 — pivot cross trigger.',
  },
  'At or above pivot zone': {
    simple: 'Price is holding at or above the pivot — the market is accepting higher prices.',
    bangla: 'দাম পিভটে বা তার উপরে ধরে আছে — বাজার উচ্চ দাম মেনে নিচ্ছে।',
    example: 'Holding ৳65–৳67 after pivot break shows acceptance.',
  },
  'Pyramiding levels mapped': {
    simple: 'Higher add-on levels are identified above — you only add size at higher prices, never on weakness.',
    bangla: 'উপরে অতিরিক্ত কেনার স্তর চিহ্নিত — শক্তিতে যোগ করুন, দুর্বলতায় নয়।',
    example: 'Add at next pivot ৳70, then ৳75 — pyramid up only.',
  },
  'Volume confirms pivot cross': {
    simple: 'The pivot break happened with above-average volume — conviction behind the move.',
    bangla: 'পিভট ভাঙতে গড়ের চেয়ে বেশি ভলিউম — ছুটিতে বিশ্বাস।',
    example: 'Pivot cross on 2× average volume is a validated Livermore go.',
  },
  'No averaging down (price above trail)': {
    simple: 'Price is still above the trailing stop — you are not holding a loser and adding more (Livermore’s rule).',
    bangla: 'দাম ট্রেইলিং স্টপের উপরে — হারানো পজিশনে আর কেনা নয় (লিভারমোরের নিয়ম)।',
    example: 'Never add shares if price drops below your last pivot stop.',
  },
  'Market aligns with trade direction': {
    simple: 'Both the stock and the broad market are moving up — you are not fighting the environment.',
    bangla: 'শেয়ার ও সামগ্রিক বাজার উর্ধ্বমুখী — পরিবেশের বিপক্ষে নয়।',
    example: 'Stock up 8% and index up 4% over 3 months — aligned tide.',
  },
  'Not over-extended past prior pivot': {
    simple: 'Price has not blasted too far above the last pivot — avoids chasing an overextended move.',
    bangla: 'দাম গত পিভটের খুব উপরে ছুটে যায়নি — অতিরিক্ত পিছু নেওয়া এড়ায়।',
    example: 'Within 15% of prior pivot keeps risk/reward reasonable.',
  },
  'Trail stop below recent pivot low': {
    simple: 'A stop sits under the recent pivot low — as price rises, you raise the stop under new pivot floors.',
    bangla: 'সাম্প্রতিক পিভট নিম্নের নিচে স্টপ — দাম বাড়লে স্টপ তুলে নিন।',
    example: 'Trail stop at ৳62 under pivot low ৳63 while price is ৳68.',
  },
};

function fallbackCopy(_label: string, explanation: string): Copy {
  const first = explanation.split('.').filter(Boolean)[0]?.trim() ?? explanation;
  return {
    simple: first.endsWith('.') ? first : `${first}.`,
    bangla: '',
    example: '',
  };
}

export function buildCriterionEducation(
  label: string,
  explanation: string,
  value: unknown,
  mode: 'investment' | 'momentum' = 'investment',
  options?: CriterionEducationOptions,
): CriterionEducation {
  const map = mode === 'momentum' ? MOMENTUM_COPY : INVESTMENT_COPY;
  const copy = map[label] ?? fallbackCopy(label, explanation);
  const formattedValue = formatCriterionValue(label, value);
  const target = targetFromLabel(label);
  const missingFields = options?.missingFields ?? [];
  const passed = options?.passed;
  const missingHint = missingFields.length ? missingFieldsHint(missingFields) : null;

  let dataLine: string;
  if (formattedValue) {
    dataLine = formattedValue;
  } else if (missingHint) {
    dataLine = missingHint;
  } else if (passed === null) {
    dataLine = 'Data not available for this check yet.';
  } else {
    dataLine = '—';
  }

  let example = copy.example;
  if (formattedValue) {
    const stockSuffix = `This stock: ${formattedValue}.`;
    const hasStock = example.toLowerCase().includes('this stock') || example.includes(formattedValue);
    if (!hasStock) example = example ? `${example} ${stockSuffix}` : stockSuffix;
  }

  const stockLine = formattedValue ? `This stock: ${formattedValue}.` : '';
  const advanced = stockLine ? `${explanation} ${stockLine}` : explanation;

  return {
    simple: copy.simple,
    bangla: copy.bangla,
    example,
    formattedValue,
    target,
    dataLine,
    missingHint,
    beginner: copy.simple,
    intermediate: explanation,
    advanced,
  };
}

/** @deprecated Prefer buildCriterionEducation — kept for callers not yet migrated. */
export function educationLevels(label: string, explanation: string, value?: unknown) {
  return buildCriterionEducation(label, explanation, value, 'investment');
}
