/**
 * Bilingual (English + Bangla) education copy for agent status modals.
 * Loaded before analysis-ui.js — exposes window.AnalysisAgentEducation.
 */
window.AnalysisAgentEducation = (function () {
  const AGENT_PROFILES = {
    fundamental: {
      title: { en: 'Fundamental agent', bn: 'মৌলিক বিশ্লেষণ এজেন্ট' },
      intro: {
        en: 'Studies whether the business is healthy and whether the share price is fair for a long-term owner. It reads earnings history, valuation ratios (P/E, P/B), return on equity, debt, fair-value estimates, and balance-sheet red flags.',
        bn: 'এটি দেখে ব্যবসা ভালো কিনা এবং দীর্ঘমেয়াদি মালিকের জন্য শেয়ারের দাম যুক্তিসঙ্গত কিনা। আয়ের ইতিহাস, মূল্যায়ন (P/E, P/B), ROE, ঋণ, ন্যায্য মূল্য ও ব্যালেন্স শিট ঝুঁকি যাচাই করে।',
      },
      weight: {
        investment: {
          en: 'Counts for 40% of the investment signal — the loudest voice for “should I own this for years?”',
          bn: 'বিনিয়োগ সিগন্যালের ৪০% ওজন — “বছরের পর বছর রাখব?” প্রশ্নের প্রধান উত্তরদাতা।',
        },
        momentum: {
          en: 'Only 8% in momentum — mainly a safety veto. If fundamentals are very weak, momentum trades are blocked.',
          bn: 'মোমেন্টামে মাত্র ৮% — মূলত নিরাপত্তা ভেটো। মৌলিক দুর্বল হলে মোমেন্টাম ট্রেড আটকে যেতে পারে।',
        },
      },
    },
    smart_money: {
      title: { en: 'Smart money agent', bn: 'স্মার্ট মানি এজেন্ট' },
      intro: {
        en: 'Tracks what big, informed players are doing — institutional funds, foreign investors, sponsors/directors (insiders), and monthly shareholding changes from DSE disclosures.',
        bn: 'বড় ও অভিজ্ঞ বিনিয়োগকারীরা কী করছে তা দেখে — প্রাতিষ্ঠানিক, বিদেশি, স্পনসর/পরিচালক এবং DSE শেয়ারহোল্ডিং পরিবর্তন।',
      },
      weight: {
        investment: {
          en: '20% of investment signal — “are the informed players accumulating or leaving?”',
          bn: 'বিনিয়োগ সিগন্যালের ২০% — “বড় খেলোয়াড়রা কি জমা করছে নাকি বের হচ্ছে?”',
        },
        momentum: {
          en: '15% of momentum signal — heavy buying by funds can confirm a breakout.',
          bn: 'মোমেন্টাম সিগন্যালের ১৫% — ফান্ডের কেনা ব্রেকআউট নিশ্চিত করতে পারে।',
        },
      },
    },
    macro: {
      title: { en: 'Macro agent', bn: 'ম্যাক্রো এজেন্ট' },
      intro: {
        en: 'Reads Bangladesh’s big-picture backdrop: policy interest rate, inflation, FX reserves, BDT pressure, politics, and regulation. A tough macro climate lowers appetite for risk even if one stock looks good.',
        bn: 'বাংলাদেশের বড় ছবি: সুদের হার, মুদ্রাস্ফীতি, রিজার্ভ, টাকার চাপ, রাজনীতি ও নিয়ম। ম্যাক্রো খারাপ হলে ভালো স্টকেও ঝুঁকি কমে।',
      },
      weight: {
        investment: {
          en: '15% of investment signal — scales how much new money you should put at risk nationally.',
          bn: 'বিনিয়োগ সিগন্যালের ১৫% — দেশীয় ঝুঁকির মেজাজ কতটা সহনীয়।',
        },
        momentum: {
          en: 'Not in the momentum blend directly, but macro still shapes sentiment and liquidity.',
          bn: 'মোমেন্টাম ওজনে সরাসরি নেই, তবে ম্যাক্রো সেন্টিমেন্ট ও লিকুইডিটিকে প্রভাবিত করে।',
        },
      },
    },
    sentiment: {
      title: { en: 'Sentiment agent', bn: 'সেন্টিমেন্ট এজেন্ট' },
      intro: {
        en: 'Scores recent news headlines for tone — positive, negative, or rumour-driven. DSE is rumour-heavy, so it separates hype from fundamentals-linked news where possible.',
        bn: 'সাম্প্রতিক খবরের সুর মাপে — ইতিবাচক, নেতিবাচক বা গুজব। DSE-তে গুজব বেশি, তাই সম্ভব হলে গুজব আলাদা করা হয়।',
      },
      weight: {
        investment: {
          en: '15% of investment signal — news can speed up or slow a thesis, but should not replace fundamentals.',
          bn: 'বিনিয়োগ সিগন্যালের ১৫% — খবর থিসিসকে ত্বরান্বিত বা ধীর করতে পারে, মৌলিকের বিকল্প নয়।',
        },
        momentum: {
          en: '12% of momentum signal — headlines often trigger short-term moves.',
          bn: 'মোমেন্টাম সিগন্যালের ১২% — শিরোনাম স্বল্পমেয়াদে দাম নাড়ায়।',
        },
      },
    },
    technical: {
      title: { en: 'Technical agent', bn: 'টেকনিক্যাল এজেন্ট' },
      intro: {
        en: 'Reads the price chart: trend (moving averages), momentum indicators (RSI, MACD, ROC), volume, support/resistance, and whether the stock is in an uptrend or losing steam.',
        bn: 'চার্ট পড়ে: ট্রেন্ড (গড় লাইন), RSI/MACD/ROC, ভলিউম, সাপোর্ট/রেজিস্ট্যান্স — ঊর্ধ্বমুখী না নিম্নমুখী।',
      },
      weight: {
        investment: {
          en: '10% of investment signal — timing hint only; quality matters more for long holds.',
          bn: 'বিনিয়োগ সিগন্যালের ১০% — সময়ের ইঙ্গিত; দীর্ঘমেয়াদে মান বেশি গুরুত্বপূর্ণ।',
        },
        momentum: {
          en: '45% of momentum signal — the main driver for “is price action strong right now?”',
          bn: 'মোমেন্টাম সিগন্যালের ৪৫% — “এখন দামের গতি শক্তিশালী?” এর প্রধান উত্তর।',
        },
      },
    },
    volume_flow: {
      title: { en: 'Volume flow', bn: 'ভলিউম ফ্লো' },
      intro: {
        en: 'Measures whether volume confirms the price move — rising OBV, above-average volume, accumulation. Often derived as 0.8 × technical score when no separate reading exists.',
        bn: 'ভলিউম দামের সাথে মিলছে কিনা — OBV, গড়ের চেয়ে বেশি ভলিউম, জমা। আলাদা ডেটা না থাকলে ০.৮ × টেকনিক্যাল স্কোর ব্যবহার হয়।',
      },
      weight: {
        investment: { en: 'Not used in investment blend.', bn: 'বিনিয়োগ মিশ্রণে ব্যবহার হয় না।' },
        momentum: {
          en: '20% of momentum signal — breakouts without volume are often false.',
          bn: 'মোমেন্টাম সিগন্যালের ২০% — ভলিউম ছাড়া ব্রেকআউট প্রায়ই মিথ্যা।',
        },
      },
    },
  };

  const SCORE_LEGEND = {
    points: {
      en: 'Agent score from −1 (very bearish) to +1 (very bullish). Zero is neutral.',
      bn: 'এজেন্ট স্কোর −১ (খুব বিয়ারিশ) থেকে +১ (খুব বুলিশ)। শূন্য মানে নিরপেক্ষ।',
    },
    weightPts: {
      en: 'How much this agent moved the combined signal = weight × points. Example: 40% weight × +0.44 points ≈ +0.176.',
      bn: 'এজেন্ট মিলিত সিগন্যালে কতটা যোগ করল = ওজন × পয়েন্ট। উদাহরণ: ৪০% × +০.৪৪ ≈ +০.১৭৬।',
    },
    status: {
      en: 'The agent’s own label (Buy, Neutral, Bullish, etc.) from its rules — click each step below for why.',
      bn: 'এজেন্টের নিজস্ব লেবেল (Buy, Neutral, Bullish ইত্যাদি) — নিচে প্রতিটি ধাপে কারণ দেখুন।',
    },
    confidence: {
      en: 'How complete the data was. Low confidence means missing inputs — treat the row cautiously.',
      bn: 'ডেটা কতটা পূর্ণ ছিল। কম কনফিডেন্স = কিছু ইনপুট নেই — সতর্ক থাকুন।',
    },
  };

  /** Pattern rules — first match wins. */
  const REASONING_RULES = [
    {
      test: (t) => /policy rate/i.test(t),
      title: { en: 'Policy interest rate', bn: 'নীতি সুদের হার' },
      simple: {
        en: 'When the central bank keeps rates high, borrowing costs rise and stocks often face headwinds.',
        bn: 'সুদের হার উচ্চ থাকলে ঋণের খরচ বাড়ে এবং শেয়ারবাজারে চাপ পড়ে।',
      },
      detail: {
        en: 'High policy rates make fixed income and deposits more attractive vs risky equities. Companies pay more on loans, which can squeeze profits — especially for leveraged firms.',
        bn: 'উচ্চ সুদে ব্যাংক আমানত ও বন্ড আকর্ষণীয় হয়; কোম্পানির ঋণের খরচ বাড়ে, বিশেষ করে ঋণভারী প্রতিষ্ঠানের লাভ কমতে পারে।',
      },
      action: {
        en: 'In risk-off macro, prefer quality names and smaller new positions until rates ease.',
        bn: 'ম্যাক্রো ঝুঁকি-বিরত থাকলে মানসম্পন্ন স্টক ও ছোট পজিশন বেছে নিন।',
      },
    },
    {
      test: (t) => /inflation/i.test(t),
      title: { en: 'Inflation', bn: 'মুদ্রাস্ফীতি' },
      simple: {
        en: 'Inflation erodes real returns. Moderate inflation can be OK; very high inflation hurts consumers and margins.',
        bn: 'মুদ্রাস্ফীতি প্রকৃত আয় কমায়। মাঝারি সহনীয়; অতিরিক্ত উচ্চ হলে ক্ষতি বেশি।',
      },
      detail: {
        en: 'The agent compares inflation to a comfort zone. Contained inflation supports equities; runaway inflation forces rate hikes and hurts valuations.',
        bn: 'এজেন্ট মুদ্রাস্ফীতি স্বাভাবিক সীমার সঙ্গে তুলনা করে। নিয়ন্ত্রিত হলে ইকুইটি সহায়ক; অতিমাত্রা হলে সুদ বাড়ে ও মূল্যায়ন ক্ষতিগ্রস্ত হয়।',
      },
      action: {
        en: 'Watch companies that can pass cost increases to customers (pricing power).',
        bn: 'যারা দাম বাড়িয়ে খরচ পুষতে পারে (প্রাইসিং পাওয়ার) তাদের দেখুন।',
      },
    },
    {
      test: (t) => /reserves/i.test(t),
      title: { en: 'FX reserves', bn: 'বৈদেশিক মুদ্রার রিজার্ভ' },
      simple: {
        en: 'Foreign exchange reserves show how much cushion Bangladesh has for imports and currency stability.',
        bn: 'রিজার্ভ দেশের আমদানি ও টাকার স্থিতিশীলতার বালুয়াম দেখায়।',
      },
      detail: {
        en: 'Rising reserves ease pressure on the taka and support risk-on mood. Falling reserves raise devaluation fears and can trigger risk-off selling.',
        bn: 'রিজার্ভ বাড়লে টাকার চাপ কমে; কমলে অবমূল্যায়নের ভয় ও ঝুঁকি-বিরত বিক্রি হতে পারে।',
      },
      action: {
        en: 'Pair macro read with your FX-sensitive holdings (importers vs exporters).',
        bn: 'ম্যাক্রো পড়া FX-সংবেদনশীল হোল্ডিংয়ের সঙ্গে মিলিয়ে নিন।',
      },
    },
    {
      test: (t) => /politic/i.test(t),
      title: { en: 'Political backdrop', bn: 'রাজনৈতিক পরিস্থিতি' },
      simple: {
        en: 'Political uncertainty makes investors demand a higher risk premium — prices can swing on headlines.',
        bn: 'রাজনৈতিক অনিশ্চয়তায় বিনিয়োগকারী বেশি ঝুঁকি প্রিমিয়াম চায় — শিরোনামে দাম নড়ে।',
      },
      detail: {
        en: 'Stable politics supports steady policy and foreign inflows. Crises or tension increase volatility and can override good single-stock fundamentals short term.',
        bn: 'স্থিতিশীল রাজনীতি নীতি ও বিদেশি প্রবাহকে সহায়তা করে; সংকটে অস্থিরতা বাড়ে ও ভালো স্টকও স্বল্পমেয়াদে চাপে পড়তে পারে।',
      },
      action: {
        en: 'Reduce position size and widen mental stop levels during political stress weeks.',
        bn: 'রাজনৈতিক চাপের সপ্তাহে পজিশন ছোট রাখুন ও স্টপ কড়া মেনে চলুন।',
      },
    },
    {
      test: (t) => /institutional|ownership|shareholding|sponsor|director|foreign/i.test(t),
      title: { en: 'Shareholding / smart money', bn: 'শেয়ারহোল্ডিং / স্মার্ট মানি' },
      simple: {
        en: 'Tracks whether institutions, foreigners, or insiders are buying or selling versus last month.',
        bn: 'প্রাতিষ্ঠানিক, বিদেশি বা ইনসাইডার গত মাসের তুলনায় কিনছে না বিকছে তা দেখে।',
      },
      detail: {
        en: 'Small changes below the significance threshold are treated as neutral noise. Large sustained accumulation is bullish; distribution is bearish for both investment and momentum.',
        bn: 'ছোট পরিবর্তন প্রায়ই নিরপেক্ষ শব্দ; দীর্ঘ জমা বুলিশ, বিতরণ বিয়ারিশ—বিনিয়োগ ও মোমেন্টাম উভয়ের জন্য।',
      },
      action: {
        en: 'Read the monthly DSE shareholding PDF for the stock — confirm the trend over 2–3 months.',
        bn: 'DSE মাসিক শেয়ারহোল্ডিং রিপোর্ট ২–৩ মাস ট্রেন্ড দেখে নিশ্চিত করুন।',
      },
    },
    {
      test: (t) => /EPS|earnings|ROE|margin|fair value|intrinsic|P\/E|debt/i.test(t),
      title: { en: 'Fundamentals driver', bn: 'মৌলিক বিষয়' },
      simple: {
        en: 'This line ties the score to profits, valuation, or balance-sheet strength.',
        bn: 'এই লাইন লাভ, মূল্যায়ন বা ব্যালেন্স শিট শক্তির সঙ্গে স্কোর যুক্ত করে।',
      },
      detail: {
        en: 'Fundamental agent blends earnings trend, how expensive the stock is vs history/peers, and whether fair-value models show a margin of safety. Weak earnings or high debt pull the score down.',
        bn: 'মৌলিক এজেন্ট আয়ের ট্রেন্ড, দাম কতটা ব্যয়বহুল, ন্যায্য মূল্যে নিরাপত্তা আছে কিনা মিলিয়ে স্কোর দেয়। দুর্বল আয় বা ঋণ স্কোর কমায়।',
      },
      action: {
        en: 'Open Investment tab → Value checklist to see which of the 30 rules passed or failed.',
        bn: 'Investment ট্যাব → Value checklist-এ ৩০টি নিয়মে কী পাস/ফেল দেখুন।',
      },
    },
    {
      test: (t) => /200-day|150-day|50-day|MA|moving average|uptrend|RSI|MACD|ADX|support|resistance|breakout/i.test(t),
      title: { en: 'Chart / technical driver', bn: 'চার্ট / টেকনিক্যাল কারণ' },
      simple: {
        en: 'Price and indicators are telling a story about trend strength or weakness.',
        bn: 'দাম ও ইন্ডিকেটর ট্রেন্ড শক্তি বা দুর্বলতা বলছে।',
      },
      detail: {
        en: 'Moving averages stacked upward = healthy uptrend. RSI/MACD show if momentum is building or exhausted. Support/resistance marks where buyers/sellers historically stepped in.',
        bn: 'গড় লাইন ঊর্ধ্বে সাজানো = সুস্থ ঊর্ধ্বমুখী ট্রেন্ড। RSI/MACD মোমেন্টাম তৈরি না ক্লান্ত। সাপোর্ট/রেজিস্ট্যান্সে ক্রেতা-বিক্রেতা আগে এসেছিল।',
      },
      action: {
        en: 'Open Momentum tab for full strategy checklists (SEPA, CAN SLIM, etc.) and Risk tab for stop levels.',
        bn: 'Momentum ট্যাবে পূর্ণ চেকলিস্ট ও Risk ট্যাবে স্টপ দেখুন।',
      },
    },
    {
      test: (t) => /volume|OBV|accumulation|relative volume/i.test(t),
      title: { en: 'Volume confirmation', bn: 'ভলিউম নিশ্চিতকরণ' },
      simple: {
        en: 'Volume shows real money behind the move — thin volume breakouts often fail.',
        bn: 'ভলিউম দেখায় দামের পিছনে আসল টাকা আছে কিনা — কম ভলিউমে ব্রেকআউট প্রায়ই ব্যর্থ।',
      },
      detail: {
        en: 'Rising on-balance volume (OBV) means more shares traded on up-days than down-days. Relative volume > 1.2× average hints institutions may be active.',
        bn: 'OBV বাড়লে উর্ধ্বদিনে বেশি শেয়ার লেনদেন হয়েছে। গড়ের ১.২ গুণ ভলিউম প্রাতিষ্ঠানিক সক্রিয়তার ইঙ্গিত।',
      },
      action: {
        en: 'Wait for a volume spike on breakout before sizing up a momentum trade.',
        bn: 'মোমেন্টাম ট্রেডে ব্রেকআউটে ভলিউম স্পাইকের পর সাইজ বাড়ান।',
      },
    },
    {
      test: (t) => /\[FUNDAMENTAL\]|\[RUMOUR\]|headline|news|sentiment|negative|positive/i.test(t),
      title: { en: 'News sentiment', bn: 'খবরের সেন্টিমেন্ট' },
      simple: {
        en: 'A headline was scored positive or negative based on keywords and whether it looks rumour-driven.',
        bn: 'শিরোনাম কীওয়ার্ড ও গুজব কিনা দেখে ইতিবাচক/নেতিবাচক স্কোর পেয়েছে।',
      },
      detail: {
        en: 'DSE moves on rumours quickly. Fundamental-tagged news (earnings, dividends, disclosures) weighs more than pure rumour. One negative headline rarely kills a thesis alone — look at the list as a whole.',
        bn: 'DSE-তে গুজবে দ্রুত নড়ে। আয়/লভ্যাংশ/ডিসক্লোজার গুরুত্বপূর্ণ; একটা নেতিবাচক শিরোনাম একা থিসিস শেষ করে না — পুরো তালিকা দেখুন।',
      },
      action: {
        en: 'Verify the story on the Business/News tab and the company’s DSE filing.',
        bn: 'Business/News ট্যাব ও DSE ফাইলিং দিয়ে খবর যাচাই করুন।',
      },
    },
    {
      test: (t) => /conflict|confluence|downgraded|stand aside|veto|suppressed|circuit|floor|halt/i.test(t),
      title: { en: 'Signal governance', bn: 'সিগন্যাল নিয়ন্ত্রণ' },
      simple: {
        en: 'The synthesizer adjusted the final rating because agents disagreed, data was incomplete, or trading was abnormal.',
        bn: 'এজেন্টরা মিলেনি, ডেটা অসম্পূর্ণ, বা অস্বাভাবিক লেনদেনের কারণে সিগন্যাল সমন্বয় হয়েছে।',
      },
      detail: {
        en: 'Strong bull + strong bear at once → stand_aside (no false “hold”). Circuit/floor/halt → suppressed for momentum. Missing confluence downgrades strong_buy to buy.',
        bn: 'শক্ত বুলিশ + বিয়ারিশ একসাথে → stand_aside। সার্কিট/ফ্লোর/হাল্ট → মোমেন্টাম suppressed। কনফ্লুয়েন্স না থাকলে রেটিং নরম হয়।',
      },
      action: {
        en: 'When stand_aside or suppressed, wait — do not force a trade.',
        bn: 'stand_aside বা suppressed হলে অপেক্ষা করুন — জোর করে ট্রেড করবেন না।',
      },
    },
  ];

  const AGENT_FALLBACK = {
    fundamental: {
      title: { en: 'Fundamental note', bn: 'মৌলিক নোট' },
      simple: {
        en: 'This step contributed to the fundamental agent’s overall buy/hold/sell style score.',
        bn: 'এই ধাপ মৌলিক এজেন্টের মোট স্কোরে অবদান রেখেছে।',
      },
      detail: {
        en: 'Read the raw line above for the exact numbers. Lower scores mean valuation or quality concerns; higher scores mean supportive earnings and fair price.',
        bn: 'উপরের কাঁচা লাইনে সংখ্যা দেখুন। কম স্কোর = মূল্যায়ন/মানের চিন্তা; উচ্চ = আয় ও দাম সহায়ক।',
      },
      action: {
        en: 'Cross-check the Value checklist on the Investment tab.',
        bn: 'Investment ট্যাবে Value checklist মিলিয়ে দেখুন।',
      },
    },
    smart_money: {
      title: { en: 'Smart money note', bn: 'স্মার্ট মানি নোট' },
      simple: { en: 'Shareholding or flow data point for informed investors.', bn: 'অভিজ্ঞ বিনিয়োগকারীদের শেয়ারহোল্ডিং/ফ্লো তথ্য।' },
      detail: { en: 'Compare month-over-month DSE disclosure — one month is noise, three months is a trend.', bn: 'মাসে মাসে DSE ডিসক্লোজার তুলুন — এক মাস শব্দ, তিন মাস ট্রেন্ড।' },
      action: { en: 'Avoid chasing a stock only on one month of foreign buying.', bn: 'এক মাস বিদেশি কেনার ওপর একা ভর করবেন না।' },
    },
    macro: {
      title: { en: 'Macro note', bn: 'ম্যাক্রো নোট' },
      simple: { en: 'Country-level factor affecting all stocks.', bn: 'দেশ-স্তরের কারণ — সব স্টককে প্রভাবিত করে।' },
      detail: { en: 'Macro does not replace stock-specific work — it scales how much risk to take overall.', bn: 'ম্যাক্রো স্টক-নির্দিষ্ট কাজের বিকল্প নয় — মোট ঝুঁকি কত নেবেন তা ঠিক করে।' },
      action: { en: 'See Macro panel in the app for regime label (risk_on / cautious / risk_off).', bn: 'অ্যাপের Macro প্যানেলে রেজিম (risk_on / cautious / risk_off) দেখুন।' },
    },
    sentiment: {
      title: { en: 'Sentiment note', bn: 'সেন্টিমেন্ট নোট' },
      simple: { en: 'News tone affecting short-term perception.', bn: 'খবরের সুর স্বল্পমেয়াদি ধারণাকে প্রভাবিত করে।' },
      detail: { en: 'Sentiment can reverse fast on DSE. Use it for timing, not as the only reason to invest.', bn: 'DSE-তে সেন্টিমেন্ট দ্রুত বদলায়। সময়ের জন্য ব্যবহার করুন, একমাত্র কারণ নয়।' },
      action: { en: 'Read full headlines on the News tab — not just the score.', bn: 'News ট্যাবে পুরো শিরোনাম পড়ুন — শুধু স্কোর নয়।' },
    },
    technical: {
      title: { en: 'Technical note', bn: 'টেকনিক্যাল নোট' },
      simple: { en: 'Chart-based evidence for trend or momentum.', bn: 'চার্ট-ভিত্তিক ট্রেন্ড/মোমেন্টাম প্রমাণ।' },
      detail: { en: 'Technicals tell you when and how strong; fundamentals tell you what you own.', bn: 'টেকনিক্যাল বলে কখন ও কত শক্ত; মৌলিক বলে আপনি কী ধরে রেখেছেন।' },
      action: { en: 'Use Risk tab stops — charts can reverse without warning.', bn: 'Risk ট্যাবে স্টপ ব্যবহার করুন — চার্ট হঠাৎ বদলাতে পারে।' },
    },
    volume_flow: {
      title: { en: 'Volume flow note', bn: 'ভলিউম ফ্লো নোট' },
      simple: { en: 'Whether volume supports the price trend.', bn: 'ভলিউম দামের ট্রেন্ড সমর্থন করছে কিনা।' },
      detail: { en: 'Price up on low volume is fragile. Ideal breakouts show volume well above the 20-day average.', bn: 'কম ভলিউমে দাম ওঠা দুর্বল। ভালো ব্রেকআউটে ২০-দিনের গড়ের চেয়ে বেশি ভলিউম থাকে।' },
      action: { en: 'Confirm on the chart before entry.', bn: 'প্রবেশের আগে চার্টে নিশ্চিত করুন।' },
    },
  };

  const METRIC_HELP = {
    pe_ratio: {
      en: 'Price ÷ earnings per share — how many years of profit you pay for. Lower can mean cheaper, but very low P/E sometimes signals trouble.',
      bn: 'দাম ÷ শেয়ার প্রতি আয় — কত বছরের লাভের দাম দিচ্ছেন। কম হলে সস্তা হতে পারে, তবে খুব কম P/E কখনও সমস্যার ইঙ্গিত।',
    },
    pb_ratio: {
      en: 'Price ÷ book value per share — compares market price to accounting net assets.',
      bn: 'দাম ÷ বুক ভ্যালু — বাজার দাম হিসাবের নিট সম্পদের সঙ্গে তুলনা।',
    },
    roe: {
      en: 'Return on equity — profit generated per taka of shareholder money. Higher ROE often means a more efficient business.',
      bn: 'ইকুইটিতে রিটার্ন — শেয়ারহোল্ডারের টাকায় কত লাভ। উচ্চ ROE প্রায়ই দক্ষ ব্যবসার চিহ্ন।',
    },
    debt_to_equity: {
      en: 'Total debt vs shareholder equity — high leverage increases risk in downturns.',
      bn: 'মোট ঋণ বনাম ইকুইটি — বেশি লিভারেজ মন্দায় ঝুঁকি বাড়ায়।',
    },
    eps_growth: {
      en: 'How fast earnings per share are growing year over year.',
      bn: 'শেয়ার প্রতি আয় বছরে বছরে কত দ্রুত বাড়ছে।',
    },
    margin_of_safety: {
      en: 'Gap between fair value and current price — larger margin = more cushion if estimates are wrong.',
      bn: 'ন্যায্য মূল্য ও বর্তমান দামের ফাঁক — বেশি ফাঁক = ভুল অনুমানে নিরাপত্তা।',
    },
    fair_value_median: {
      en: 'Estimated fair price from multiple valuation methods (DCF, Graham, multiples).',
      bn: 'বিভিন্ন পদ্ধতিতে (DCF, Graham, মাল্টিপল) অনুমানিত ন্যায্য দাম।',
    },
    rsi_14: {
      en: 'RSI 14-day — above 70 often “overbought” (extended rally), below 30 “oversold” (stretched decline). Not a buy/sell button by itself.',
      bn: 'RSI ১৪ দিন — ৭০ এর উপরে প্রায়ই “অতিকেনা”, ৩০ এর নিচে “অতিবিক্রি”। একা buy/sell বোতাম নয়।',
    },
    macd_hist: {
      en: 'MACD histogram — positive bars mean bullish momentum building; shrinking bars warn momentum is fading.',
      bn: 'MACD হিস্টোগ্রাম — ধনাত্মক বার বুলিশ মোমেন্টাম; ছোট হলে মোমেন্টাম ক্ষীণ হচ্ছে।',
    },
    adx: {
      en: 'Average Directional Index — above 25 suggests a strong trend; below 20 means choppy, range-bound price.',
      bn: 'ADX — ২৫ এর উপরে শক্ত ট্রেন্ড; ২০ এর নিচে রেঞ্জবাউন্ড, অস্থির দাম।',
    },
    relative_strength: {
      en: 'How this stock performed vs the broad market — leaders show high relative strength in uptrends.',
      bn: 'বাজারের তুলনায় স্টকের পারফরম্যান্স — লিডারদের আপট্রেন্ডে উচ্চ রিলেটিভ স্ট্রেংথ থাকে।',
    },
    obv: {
      en: 'On-balance volume — cumulative volume flow; rising OBV with rising price supports an uptrend.',
      bn: 'অন-ব্যালেন্স ভলিউম — জমা ভলিউম প্রবাহ; দাম ও OBV একসাথে ওঠা আপট্রেন্ড সমর্থন করে।',
    },
    relative_volume: {
      en: 'Today’s volume vs average — spikes above 1.5× often mark institutional interest or news.',
      bn: 'আজকের ভলিউম বনাম গড় — ১.৫ গুণের উপরে স্পাইক প্রায়ই প্রাতিষ্ঠানিক বা খবরের চিহ্ন।',
    },
    institutional_change: {
      en: 'Month-over-month change in institutional shareholding from DSE disclosure.',
      bn: 'DSE ডিসক্লোজারে প্রাতিষ্ঠানিক শেয়ারহোল্ডিংয়ের মাসিক পরিবর্তন।',
    },
    foreign_change: {
      en: 'Month-over-month foreign investor holding change — sustained buying can support momentum.',
      bn: 'বিদেশি বিনিয়োগকারীর মাসিক পরিবর্তন — ধারাবাহিক কেনা মোমেন্টাম সমর্থন করতে পারে।',
    },
    sentiment_score: {
      en: 'Aggregate news tone from −1 (very negative) to +1 (very positive), with rumour discount where detected.',
      bn: 'খবরের মোট সুর −১ (খুব নেতিবাচক) থেকে +১ (খুব ইতিবাচক), গুজব শনাক্ত হলে হালকা করা।',
    },
    risk_multiplier: {
      en: 'Macro scale factor applied to risk appetite — below 1 = defensive backdrop, above 1 = more risk-on.',
      bn: 'ম্যাক্রো স্কেল — ১ এর নিচে প্রতিরক্ষামূলক, ১ এর উপরে ঝুঁকি-সহনীয় পরিবেশ।',
    },
    regime: {
      en: 'Macro regime label: risk_on, neutral, cautious, or risk_off — guides how aggressively to deploy new capital.',
      bn: 'ম্যাক্রো রেজিম: risk_on, neutral, cautious, risk_off — নতুন টাকা কত আক্রমণাত্মকভাবে বসাবেন তা নির্দেশ করে।',
    },
  };

  function matchReasoning(line, agentKey) {
    const text = String(line ?? '');
    for (const rule of REASONING_RULES) {
      if (rule.test(text)) return rule;
    }
    return AGENT_FALLBACK[agentKey] ?? AGENT_FALLBACK.technical;
  }

  function profile(agentKey) {
    return AGENT_PROFILES[agentKey] ?? AGENT_PROFILES.technical;
  }

  function metricHelp(key) {
    const k = String(key).toLowerCase();
    if (METRIC_HELP[k]) return METRIC_HELP[k];
    const label = k.replace(/_/g, ' ');
    return {
      en: `${label} — a numeric input this agent used in its scoring formula. Compare the value to the reasoning steps above to see if it helped or hurt the status.`,
      bn: `${label} — এজেন্টের স্কোরিং সূত্রে ব্যবহৃত সংখ্যা। উপরের যুক্তি ধাপের সঙ্গে মিলিয়ে দেখুন এটি স্ট্যাটাসকে সহায়তা করেছে না ক্ষতি।`,
    };
  }

  return {
    profile,
    scoreLegend: SCORE_LEGEND,
    matchReasoning,
    metricHelp,
  };
})();
