export const DSEConfig = {
  MARKET_OPEN: '10:00',
  MARKET_CLOSE: '14:30',
  PRE_OPEN: '09:30',
  POST_CLOSE: '15:00',

  CIRCUIT_BREAKER_LIMITS: {
    daily_upper: 0.1,
    daily_lower: -0.1,
    floor_price: 0.9,
  },

  SECTOR_PE_BENCHMARKS: {
    Banking: 8.5,
    'Financial Institutions': 12.0,
    Insurance: 15.0,
    Pharmaceuticals: 22.0,
    Textile: 18.0,
    Telecommunications: 15.0,
    Engineering: 20.0,
    'Food & Allied': 25.0,
    Cement: 16.0,
    'Power & Energy': 14.0,
    IT: 28.0,
    Services: 18.0,
  } as Record<string, number>,

  DSE_METRICS: {
    min_lot_size: 10,
    settlement_days: 2,
    currency: 'BDT',
    tax_on_gain: 0.1,
    commission: 0.005,
  },

  MACRO_BENCHMARKS: {
    gdp_growth: 0.065,
    inflation: 0.06,
    interest_rate: 0.075,
    market_cap_to_gdp: 0.3,
  },

  adaptAnalysis(analysis: Record<string, unknown>, sector?: string): Record<string, unknown> {
    const adapted = { ...analysis };
    adapted.market = 'DSE';
    adapted.currency = DSEConfig.DSE_METRICS.currency;

    if ('pe_ratio' in adapted && sector) {
      const sectorPe = DSEConfig.SECTOR_PE_BENCHMARKS[sector] ?? 15;
      const pe = adapted.pe_ratio as number;
      if (pe < sectorPe * 0.7) {
        adapted.pe_assessment = 'undervalued';
      } else if (pe < sectorPe * 1.3) {
        adapted.pe_assessment = 'fairly_valued';
      } else {
        adapted.pe_assessment = 'overvalued';
      }
      adapted.sector_pe_benchmark = sectorPe;
    }

    if ('price_change_pct' in adapted) {
      const change = adapted.price_change_pct as number;
      const warnings = (adapted.warnings as string[] | undefined) ?? [];
      if (change >= DSEConfig.CIRCUIT_BREAKER_LIMITS.daily_upper) {
        warnings.push('At upper circuit limit');
      } else if (change <= DSEConfig.CIRCUIT_BREAKER_LIMITS.daily_lower) {
        warnings.push('At lower circuit limit');
      }
      if (warnings.length) adapted.warnings = warnings;
    }

    adapted.translations = DSEConfig.getBengaliTranslations(adapted);
    return adapted;
  },

  getBengaliTranslations(analysis: Record<string, unknown>): Record<string, string> {
    const translations: Record<string, string> = {
      buy: 'ক্রয় (kroy)',
      sell: 'বিক্রয় (bikroy)',
      hold: 'ধরে রাখা (dhore rakha)',
      bullish: 'ঊর্ধ্বমুখী (urdhomukhi)',
      bearish: 'নিম্নমুখী (nimnomukhi)',
      support: 'সমর্থন (somorthon)',
      resistance: 'প্রতিরোধ (protirodh)',
    };

    if ('recommendation' in analysis) {
      const rec = String(analysis.recommendation).toLowerCase();
      if (rec.includes('buy')) {
        translations.recommendation = 'ক্রয়ের সুপারিশ';
      } else if (rec.includes('sell')) {
        translations.recommendation = 'বিক্রয়ের সুপারিশ';
      } else {
        translations.recommendation = 'ধরে রাখার সুপারিশ';
      }
    }

    return translations;
  },
} as const;
