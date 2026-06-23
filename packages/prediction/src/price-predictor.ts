import type { OhlcvBar } from '@stock-buddy/core';

export interface PricePredictorInput {
  ticker?: string;
  ohlcv?: OhlcvBar[];
  fundamentals?: Record<string, unknown>;
}

export interface BuyZone {
  price_range: string;
  strength: string;
  reason: string;
}

export interface SellTarget {
  price: number;
  gain_pct: number;
  timeframe: string;
  confidence: string;
}

export interface StopLossLevel {
  price: number;
  risk_pct: number;
}

export class PricePredictor {
  readonly currency: string;

  constructor(currency = 'BDT') {
    this.currency = currency;
  }

  predictTargets(data: PricePredictorInput): Record<string, unknown> {
    const ticker = data.ticker ?? 'Unknown';
    const ohlcv = data.ohlcv ?? [];

    if (ohlcv.length === 0) {
      return this.noDataResponse(ticker);
    }

    const currentPrice = Number(ohlcv[ohlcv.length - 1]!.close);
    const supportLevels = this.calculateSupportLevels(ohlcv);
    const resistanceLevels = this.calculateResistanceLevels(ohlcv);

    const technicalTargets = this.calculateTechnicalTargets(
      currentPrice,
      ohlcv,
      supportLevels,
      resistanceLevels,
    );

    const fundamentalTargets = this.calculateFundamentalTargets(
      currentPrice,
      data.fundamentals ?? {},
    );

    const buyZones = this.identifyBuyZones(
      currentPrice,
      supportLevels,
      fundamentalTargets,
    );

    const sellTargets = this.identifySellTargets(
      currentPrice,
      resistanceLevels,
      technicalTargets,
    );

    const stopLoss = this.calculateStopLoss(currentPrice, supportLevels);
    const confidence = this.calculateConfidence(technicalTargets, fundamentalTargets, data);

    return {
      ticker,
      currency: this.currency,
      current_price: currentPrice,
      predictions: {
        buy_zones: buyZones,
        sell_targets: sellTargets,
        stop_loss: stopLoss,
        technical_targets: technicalTargets,
        fundamental_targets: fundamentalTargets,
      },
      levels: {
        support: supportLevels,
        resistance: resistanceLevels,
      },
      confidence,
      horizon: '3-6 months',
      disclaimer: 'Price predictions are estimates only. Not financial advice.',
    };
  }

  private calculateSupportLevels(ohlcv: OhlcvBar[]): number[] {
    if (ohlcv.length === 0) return [];

    const lows = ohlcv.map((bar) => Number(bar.low));
    const closes = ohlcv.map((bar) => Number(bar.close));

    const recentLows = [...(lows.length >= 20 ? lows.slice(-20) : lows)].sort((a, b) => a - b);
    const support1 = recentLows[0] ?? 0;

    const ma20Slice = closes.slice(-20);
    const ma20 = ma20Slice.reduce((a, b) => a + b, 0) / Math.min(20, closes.length);

    const ma50Slice = closes.length >= 50 ? closes.slice(-50) : closes;
    const ma50 = ma50Slice.reduce((a, b) => a + b, 0) / Math.min(50, closes.length);

    const window = ohlcv.length >= 252 ? ohlcv.slice(-252) : ohlcv;
    const high52w = Math.max(...window.map((bar) => Number(bar.high)));
    const low52w = Math.min(...window.map((bar) => Number(bar.low)));

    const fibLevels: number[] = [];
    if (high52w > low52w) {
      const diff = high52w - low52w;
      fibLevels.push(
        high52w - 0.236 * diff,
        high52w - 0.382 * diff,
        high52w - 0.5 * diff,
        high52w - 0.618 * diff,
      );
    }

    const allSupports = [support1, ma20, ma50, ...fibLevels];
    const uniqueSupports = [...new Set(allSupports.filter((s) => s > 0))].sort((a, b) => a - b);

    return uniqueSupports.slice(0, 5);
  }

  private calculateResistanceLevels(ohlcv: OhlcvBar[]): number[] {
    if (ohlcv.length === 0) return [];

    const highs = ohlcv.map((bar) => Number(bar.high));
    const closes = ohlcv.map((bar) => Number(bar.close));

    const recentHighs = [...(highs.length >= 20 ? highs.slice(-20) : highs)].sort((a, b) => b - a);
    const resistance1 = recentHighs[0] ?? 0;

    const peaks = this.findPeaks(highs);
    const current = closes[closes.length - 1] ?? 0;

    const roundLevels = [
      Math.ceil(current / 10) * 10,
      Math.ceil(current / 25) * 25,
      Math.ceil(current / 50) * 50,
      Math.ceil(current / 100) * 100,
    ];

    const allResistances = [resistance1, ...peaks, ...roundLevels];
    const uniqueResistances = [...new Set(allResistances.filter((r) => r > current))].sort(
      (a, b) => a - b,
    );

    return uniqueResistances.slice(0, 5);
  }

  private calculateTechnicalTargets(
    current: number,
    ohlcv: OhlcvBar[],
    support: number[],
    resistance: number[],
  ): Record<string, number> {
    const targets: Record<string, number> = {};

    if (resistance.length > 0) {
      targets.short_term = resistance[0]!;
    } else {
      targets.short_term = current * 1.05;
    }

    if (resistance.length > 1) {
      targets.medium_term = resistance[1]!;
    } else {
      targets.medium_term = current * 1.15;
    }

    if (resistance.length > 2) {
      targets.long_term = resistance[2]!;
    } else if (ohlcv.length >= 126) {
      const sixMonthAgo = Number(ohlcv[ohlcv.length - 126]!.close);
      const avgReturn = sixMonthAgo > 0 ? (current - sixMonthAgo) / sixMonthAgo : 0.1;
      targets.long_term = current * (1 + Math.max(avgReturn, 0.1));
    } else {
      targets.long_term = current * 1.25;
    }

    void support;
    return targets;
  }

  private calculateFundamentalTargets(
    _current: number,
    fundamentals: Record<string, unknown>,
  ): Record<string, number> {
    const targets: Record<string, number> = {};

    const intrinsic = fundamentals.intrinsic_value;
    if (typeof intrinsic === 'number' && intrinsic > 0) {
      targets.intrinsic = intrinsic;
    }

    const pe = Number(fundamentals.pe ?? 0);
    const eps = Number(fundamentals.eps ?? 0);
    const sectorPe = Number(fundamentals.sector_pe ?? 15);

    if (pe > 0 && eps > 0) {
      if (pe < sectorPe) {
        targets.pe_based = eps * sectorPe;
      } else {
        targets.pe_based = eps * pe * 1.1;
      }
    }

    const bookValue = fundamentals.book_value;
    if (typeof bookValue === 'number' && bookValue > 0) {
      targets.book_value_based = bookValue * 1.5;
    }

    return targets;
  }

  private identifyBuyZones(
    current: number,
    support: number[],
    targets: Record<string, number>,
  ): BuyZone[] {
    const buyZones: BuyZone[] = [];

    if (support.length > 0) {
      const strongSupport = support[0]!;
      if (current <= strongSupport * 1.05) {
        buyZones.push({
          price_range: `${strongSupport.toFixed(2)} - ${(strongSupport * 1.02).toFixed(2)}`,
          strength: 'strong',
          reason: 'Near strong support level',
        });
      }
    }

    const intrinsic = targets.intrinsic;
    if (intrinsic != null && current < intrinsic * 0.9) {
      buyZones.push({
        price_range: `${(current * 0.98).toFixed(2)} - ${(current * 1.02).toFixed(2)}`,
        strength: 'strong',
        reason: 'Trading below intrinsic value',
      });
    }

    if (support.length > 1) {
      const pullbackLevel = support[1]!;
      buyZones.push({
        price_range: `${pullbackLevel.toFixed(2)} - ${(pullbackLevel * 1.03).toFixed(2)}`,
        strength: 'moderate',
        reason: 'Pullback to secondary support',
      });
    }

    return buyZones;
  }

  private identifySellTargets(
    current: number,
    resistance: number[],
    targets: Record<string, number>,
  ): SellTarget[] {
    const sellTargets: SellTarget[] = [];

    if (resistance.length > 0) {
      const price = resistance[0]!;
      sellTargets.push({
        price,
        gain_pct: ((price - current) / current) * 100,
        timeframe: '1-2 weeks',
        confidence: 'high',
      });
    }

    const techTarget = targets.medium_term;
    if (techTarget != null) {
      sellTargets.push({
        price: techTarget,
        gain_pct: ((techTarget - current) / current) * 100,
        timeframe: '1-3 months',
        confidence: 'medium',
      });
    }

    const intrinsic = targets.intrinsic;
    if (intrinsic != null && intrinsic > current) {
      sellTargets.push({
        price: intrinsic,
        gain_pct: ((intrinsic - current) / current) * 100,
        timeframe: '3-6 months',
        confidence: 'medium',
      });
    }

    sellTargets.sort((a, b) => a.price - b.price);
    return sellTargets.slice(0, 3);
  }

  private calculateStopLoss(
    current: number,
    support: number[],
  ): Record<string, StopLossLevel> {
    const stopLoss: Record<string, StopLossLevel> = {
      tight: {
        price: current * 0.95,
        risk_pct: 5.0,
      },
    };

    if (support.length > 0) {
      const standardPrice = support[0]! * 0.98;
      stopLoss.standard = {
        price: standardPrice,
        risk_pct: ((current - standardPrice) / current) * 100,
      };
    }

    let widePrice: number;
    if (support.length > 1) {
      widePrice = Math.min(current * 0.9, support[1]! * 0.98);
    } else {
      widePrice = current * 0.9;
    }

    stopLoss.wide = {
      price: widePrice,
      risk_pct: ((current - widePrice) / current) * 100,
    };

    return stopLoss;
  }

  private calculateConfidence(
    _technical: Record<string, number>,
    _fundamental: Record<string, number>,
    data: PricePredictorInput,
  ): Record<string, unknown> {
    const confidence: Record<string, unknown> = {
      technical: 0.5,
      fundamental: 0.5,
      overall: 0.5,
    };

    const ohlcvLen = data.ohlcv?.length ?? 0;
    if (ohlcvLen >= 252) {
      confidence.technical = 0.8;
    } else if (ohlcvLen >= 126) {
      confidence.technical = 0.6;
    } else if (ohlcvLen >= 20) {
      confidence.technical = 0.4;
    }

    const fundamentals = data.fundamentals ?? {};
    if ('intrinsic_value' in fundamentals) {
      confidence.fundamental = 0.7;
    }
    if ('pe' in fundamentals && 'eps' in fundamentals) {
      confidence.fundamental = Math.min(Number(confidence.fundamental) + 0.1, 0.9);
    }
    if ('book_value' in fundamentals) {
      confidence.fundamental = Math.min(Number(confidence.fundamental) + 0.1, 0.9);
    }

    confidence.overall = (Number(confidence.technical) + Number(confidence.fundamental)) / 2;

    if (Number(confidence.overall) >= 0.7) {
      confidence.level = 'high';
    } else if (Number(confidence.overall) >= 0.5) {
      confidence.level = 'medium';
    } else {
      confidence.level = 'low';
    }

    return confidence;
  }

  private findPeaks(prices: number[], window = 10): number[] {
    const peaks: number[] = [];
    for (let i = window; i < prices.length - window; i++) {
      const current = prices[i]!;
      let isPeak = true;
      for (let j = i - window; j <= i + window; j++) {
        if (current < prices[j]!) {
          isPeak = false;
          break;
        }
      }
      if (isPeak) {
        peaks.push(current);
      }
    }
    return [...new Set(peaks)].sort((a, b) => b - a).slice(0, 3);
  }

  private noDataResponse(ticker: string): Record<string, unknown> {
    return {
      ticker,
      currency: this.currency,
      error: 'Insufficient data for price prediction',
      predictions: null,
      confidence: { overall: 0, level: 'none' },
    };
  }
}
