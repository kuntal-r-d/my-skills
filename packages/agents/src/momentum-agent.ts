import { BaseAgent, type SkillData, type SkillResult } from './base-agent.js';

interface Criterion {
  passed?: boolean;
}

interface Pattern {
  sentiment?: string;
}

export class MomentumAgent extends BaseAgent {
  constructor() {
    super('MomentumAgent', ['momentum-screen', 'technical-analysis', 'pattern-miner']);
  }

  async analyze(data: SkillData): Promise<SkillResult> {
    const results: Record<string, unknown> = {};
    const scores: number[] = [];

    const momentumResult = this.runSkill('momentum-screen', data);
    if (!('error' in momentumResult)) {
      results.momentum_screen = momentumResult;

      const criteria = momentumResult.criteria as Criterion[] | undefined;
      if (criteria) {
        const passed = criteria.filter((c) => c.passed).length;
        const total = criteria.length;
        scores.push(total > 0 ? passed / total : 0.5);
      }
    }

    const techResult = this.runSkill('technical-analysis', data);
    if (!('error' in techResult)) {
      results.technical_analysis = techResult;
      if (techResult.score != null) {
        scores.push(Number(techResult.score));
      }
    }

    const patternResult = this.runSkill('pattern-miner', data);
    if (!('error' in patternResult)) {
      results.pattern_miner = patternResult;

      const patterns = patternResult.patterns as Pattern[] | undefined;
      if (patterns) {
        const bullishPatterns = patterns.filter((p) => p.sentiment === 'bullish');
        scores.push(Math.min(bullishPatterns.length * 0.2, 1.0));
      }
    }

    const finalScore = this.aggregateScores(scores);
    const signals = this.generateSignals(results, finalScore);
    const recommendation = this.generateMomentumRecommendation(finalScore, signals);

    return {
      agent: this.name,
      score: finalScore,
      signals,
      recommendation,
      details: results,
      ticker: data.ticker,
    };
  }

  private generateSignals(results: Record<string, unknown>, score: number): Record<string, unknown> {
    const signals: Record<string, unknown> = {
      trend: 'neutral',
      momentum: 'neutral',
      entry: null,
      stop_loss: null,
      target: null,
    };

    if (score >= 0.7) {
      signals.trend = 'bullish';
      signals.momentum = 'strong';
    } else if (score >= 0.5) {
      signals.trend = 'bullish';
      signals.momentum = 'moderate';
    } else if (score >= 0.3) {
      signals.trend = 'neutral';
      signals.momentum = 'weak';
    } else {
      signals.trend = 'bearish';
      signals.momentum = 'negative';
    }

    const tech = results.technical_analysis as Record<string, unknown> | undefined;
    if (tech) {
      if (tech.support != null) {
        signals.stop_loss = tech.support;
      }
      if (tech.resistance != null) {
        signals.target = tech.resistance;
      }
    }

    return signals;
  }

  private generateMomentumRecommendation(
    _score: number,
    signals: Record<string, unknown>,
  ): string {
    const trend = String(signals.trend ?? 'neutral');
    const momentum = String(signals.momentum ?? 'neutral');

    let rec: string;
    if (trend === 'bullish' && momentum === 'strong') {
      rec = 'Strong momentum detected. Consider entry on pullback to support.';
    } else if (trend === 'bullish' && momentum === 'moderate') {
      rec = 'Positive momentum building. Wait for confirmation before entry.';
    } else if (trend === 'neutral') {
      rec = 'Momentum is neutral. Monitor for directional breakout.';
    } else {
      rec = 'Negative momentum. Avoid long positions.';
    }

    if (signals.stop_loss != null) {
      rec += ` Stop loss: ${Number(signals.stop_loss).toFixed(2)}`;
    }
    if (signals.target != null) {
      rec += ` Target: ${Number(signals.target).toFixed(2)}`;
    }

    return rec;
  }
}
