import { BaseAgent, type SkillData, type SkillResult } from './base-agent.js';

const RISK_MAP: Record<string, number> = {
  low: 0.8,
  medium: 0.5,
  high: 0.2,
  extreme: 0.0,
};

export class BusinessAgent extends BaseAgent {
  constructor() {
    super('BusinessAgent', ['fundamental-analysis', 'risk-manager']);
  }

  async analyze(data: SkillData): Promise<SkillResult> {
    const results: Record<string, unknown> = {};
    const scores: number[] = [];

    const fundamentalResult = this.runSkill('fundamental-analysis', data);
    if (!('error' in fundamentalResult)) {
      results.fundamentals = fundamentalResult;
      if (fundamentalResult.score != null) {
        scores.push(Number(fundamentalResult.score));
      }
    }

    const riskResult = this.runSkill('risk-manager', data);
    if (!('error' in riskResult)) {
      results.risk_assessment = riskResult;
      if (riskResult.risk_level != null) {
        const riskScore = RISK_MAP[String(riskResult.risk_level)] ?? 0.5;
        scores.push(riskScore);
      }
    }

    const finalScore = this.aggregateScores(scores);
    const businessAnalysis = this.analyzeBusinessModel(data, results);
    const competitivePosition = this.assessCompetitivePosition(data, results);
    const outlook = this.generateBusinessOutlook(
      finalScore,
      businessAnalysis,
      competitivePosition,
    );

    return {
      agent: this.name,
      score: finalScore,
      business_model: businessAnalysis,
      competitive_position: competitivePosition,
      outlook,
      details: results,
      ticker: data.ticker,
    };
  }

  private analyzeBusinessModel(
    data: SkillData,
    _results: Record<string, unknown>,
  ): Record<string, string> {
    const analysis: Record<string, string> = {
      revenue_stability: 'unknown',
      margin_trend: 'unknown',
      capital_efficiency: 'unknown',
      growth_sustainability: 'unknown',
    };

    const fundamentals = (data.fundamentals ?? {}) as Record<string, number>;

    const revenueGrowth = fundamentals.revenue_growth ?? 0;
    if (revenueGrowth > 0.15) {
      analysis.revenue_stability = 'strong growth';
    } else if (revenueGrowth > 0.05) {
      analysis.revenue_stability = 'steady growth';
    } else if (revenueGrowth > -0.05) {
      analysis.revenue_stability = 'stable';
    } else {
      analysis.revenue_stability = 'declining';
    }

    const profitMargin = fundamentals.profit_margin ?? 0;
    if (profitMargin > 0.2) {
      analysis.margin_trend = 'excellent';
    } else if (profitMargin > 0.1) {
      analysis.margin_trend = 'healthy';
    } else if (profitMargin > 0.05) {
      analysis.margin_trend = 'thin';
    } else {
      analysis.margin_trend = 'poor';
    }

    const roe = fundamentals.roe ?? 0;
    const assetTurnover = fundamentals.asset_turnover ?? 0;
    if (roe > 0.2 && assetTurnover > 1.0) {
      analysis.capital_efficiency = 'highly efficient';
    } else if (roe > 0.15) {
      analysis.capital_efficiency = 'efficient';
    } else if (roe > 0.1) {
      analysis.capital_efficiency = 'moderate';
    } else {
      analysis.capital_efficiency = 'inefficient';
    }

    const debtToEquity = fundamentals.debt_to_equity ?? 0;
    const fcf = fundamentals.free_cash_flow ?? 0;
    if (fcf > 0 && debtToEquity < 0.5) {
      analysis.growth_sustainability = 'highly sustainable';
    } else if (fcf > 0) {
      analysis.growth_sustainability = 'sustainable';
    } else if (debtToEquity < 1.0) {
      analysis.growth_sustainability = 'moderate';
    } else {
      analysis.growth_sustainability = 'at risk';
    }

    return analysis;
  }

  private assessCompetitivePosition(
    data: SkillData,
    _results: Record<string, unknown>,
  ): Record<string, unknown> {
    const position: Record<string, unknown> = {
      market_share: 'unknown',
      moat_strength: 'none',
      industry_position: 'follower',
      competitive_advantages: [] as string[],
    };

    const fundamentals = (data.fundamentals ?? {}) as Record<string, unknown>;
    const advantages = position.competitive_advantages as string[];

    if (fundamentals.moat) {
      position.moat_strength = 'strong';
      advantages.push('Economic moat');
    }

    const profitMargin = Number(fundamentals.profit_margin ?? 0);
    const roe = Number(fundamentals.roe ?? 0);

    if (profitMargin > 0.2 && roe > 0.2) {
      position.industry_position = 'leader';
      advantages.push('Superior profitability');
    } else if (profitMargin > 0.15 || roe > 0.15) {
      position.industry_position = 'strong player';
    } else {
      position.industry_position = 'follower';
    }

    if (Number(fundamentals.revenue_growth ?? 0) > 0.2) {
      advantages.push('High growth');
    }

    if (Number(fundamentals.debt_to_equity ?? 1.0) < 0.3) {
      advantages.push('Strong balance sheet');
    }

    return position;
  }

  private generateBusinessOutlook(
    score: number,
    businessAnalysis: Record<string, string>,
    competitivePosition: Record<string, unknown>,
  ): string {
    let outlook: string;
    if (score >= 0.7) {
      outlook = 'Strong business with favorable long-term prospects.';
    } else if (score >= 0.5) {
      outlook = 'Solid business with moderate growth potential.';
    } else if (score >= 0.3) {
      outlook = 'Challenged business facing headwinds.';
    } else {
      outlook = 'Weak business model with significant risks.';
    }

    if (businessAnalysis.revenue_stability === 'strong growth') {
      outlook += ' Revenue growing rapidly.';
    }

    if (businessAnalysis.capital_efficiency === 'highly efficient') {
      outlook += ' Excellent capital allocation.';
    }

    if (competitivePosition.industry_position === 'leader') {
      outlook += ' Market leadership position.';
    }

    const advantages = competitivePosition.competitive_advantages as string[];
    if (advantages.length > 2) {
      outlook += ` Multiple competitive advantages: ${advantages.slice(0, 2).join(', ')}.`;
    }

    return outlook;
  }
}
