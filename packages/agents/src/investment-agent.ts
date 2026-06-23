import { BaseAgent, type SkillData, type SkillResult } from './base-agent.js';

interface Criterion {
  label?: string;
  value?: unknown;
}

export class InvestmentAgent extends BaseAgent {
  constructor() {
    super('InvestmentAgent', ['value-investment-checklist', 'fundamental-analysis']);
  }

  async analyze(data: SkillData): Promise<SkillResult> {
    const results: Record<string, unknown> = {};
    const scores: number[] = [];

    const valueResult = this.runSkill('value-investment-checklist', data);
    if (!('error' in valueResult)) {
      results.value_checklist = valueResult;
      if (valueResult.gpa != null) {
        scores.push(Number(valueResult.gpa) / 4.0);
      }
    }

    const fundamentalResult = this.runSkill('fundamental-analysis', data);
    if (!('error' in fundamentalResult)) {
      results.fundamental_analysis = fundamentalResult;
      if (fundamentalResult.score != null) {
        scores.push(Number(fundamentalResult.score));
      }
    }

    const finalScore = this.aggregateScores(scores, [0.6, 0.4]);
    const metrics = this.extractKeyMetrics(results);
    const thesis = this.generateInvestmentThesis(finalScore, metrics);

    return {
      agent: this.name,
      score: finalScore,
      grade: this.scoreToGrade(finalScore),
      metrics,
      thesis,
      details: results,
      ticker: data.ticker,
    };
  }

  private extractKeyMetrics(results: Record<string, unknown>): Record<string, unknown> {
    const metrics: Record<string, unknown> = {
      pe_ratio: null,
      roe: null,
      debt_to_equity: null,
      profit_margin: null,
      moat: null,
      intrinsic_value: null,
    };

    const checklist = results.value_checklist as Record<string, unknown> | undefined;
    if (checklist?.criteria) {
      for (const criterion of checklist.criteria as Criterion[]) {
        const label = criterion.label ?? '';
        if (label.includes('ROE')) {
          metrics.roe = criterion.value;
        } else if (label.includes('Debt/Equity')) {
          metrics.debt_to_equity = criterion.value;
        } else if (label.toLowerCase().includes('moat')) {
          metrics.moat = criterion.value;
        }
      }
    }

    const fundamental = results.fundamental_analysis as Record<string, unknown> | undefined;
    if (fundamental?.metrics) {
      Object.assign(metrics, fundamental.metrics as Record<string, unknown>);
    }

    return metrics;
  }

  private generateInvestmentThesis(
    score: number,
    metrics: Record<string, unknown>,
  ): string {
    let thesis: string;
    if (score >= 0.8) {
      thesis = 'Exceptional investment opportunity with strong fundamentals.';
    } else if (score >= 0.6) {
      thesis = 'Good investment candidate with solid value characteristics.';
    } else if (score >= 0.4) {
      thesis = 'Fair investment with mixed signals. Further research needed.';
    } else {
      thesis = 'Weak investment case. Significant concerns present.';
    }

    if (metrics.moat) {
      thesis += ' Economic moat provides competitive advantage.';
    }

    const roe = metrics.roe;
    if (typeof roe === 'number' && roe > 0.15) {
      thesis += ` High ROE of ${(roe * 100).toFixed(1)}% indicates efficient capital use.`;
    }

    const debtToEquity = metrics.debt_to_equity;
    if (typeof debtToEquity === 'number' && debtToEquity < 0.5) {
      thesis += ' Low debt provides financial stability.';
    }

    return thesis;
  }

  private scoreToGrade(score: number): string {
    if (score >= 0.9) return 'A+';
    if (score >= 0.8) return 'A';
    if (score >= 0.7) return 'B+';
    if (score >= 0.6) return 'B';
    if (score >= 0.5) return 'C';
    if (score >= 0.4) return 'D';
    return 'F';
  }
}
