import { MomentumAgent } from './momentum-agent.js';
import { InvestmentAgent } from './investment-agent.js';
import { BusinessAgent } from './business-agent.js';
import type { SkillData, SkillResult } from './base-agent.js';

type AgentKey = 'momentum' | 'investment' | 'business';

interface AgentLike {
  analyze(data: SkillData): Promise<SkillResult>;
}

export class AgentCoordinator {
  readonly agents: Record<AgentKey, AgentLike>;

  constructor() {
    this.agents = {
      momentum: new MomentumAgent(),
      investment: new InvestmentAgent(),
      business: new BusinessAgent(),
    };
  }

  async analyzeComprehensive(
    data: SkillData,
    agentNames?: string[],
  ): Promise<SkillResult> {
    const selected = (agentNames ?? Object.keys(this.agents)) as AgentKey[];
    const tasks = selected
      .filter((name) => name in this.agents)
      .map((name) => this.agents[name]!.analyze(data));

    const settled = await Promise.allSettled(tasks);

    const agentResults: Record<string, SkillResult> = {};
    const scores: number[] = [];

    selected.forEach((agentName, i) => {
      const result = settled[i];
      if (!result) return;

      if (result.status === 'rejected') {
        agentResults[agentName] = {
          error: String(result.reason),
          agent: agentName,
        };
      } else {
        agentResults[agentName] = result.value;
        if (result.value.score != null) {
          scores.push(Number(result.value.score));
        }
      }
    });

    const synthesis = this.synthesizeInsights(agentResults);
    const consensusScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0.5;

    const recommendation = this.generateFinalRecommendation(
      consensusScore,
      agentResults,
      synthesis,
    );

    return {
      ticker: data.ticker,
      consensus_score: consensusScore,
      agents: agentResults,
      synthesis,
      recommendation,
      timestamp: data.as_of,
    };
  }

  private synthesizeInsights(agentResults: Record<string, SkillResult>): Record<string, unknown> {
    const synthesis: Record<string, unknown> = {
      agreement_level: 'none',
      key_strengths: [] as string[],
      key_concerns: [] as string[],
      divergences: [] as string[],
    };

    const scores: number[] = [];

    for (const result of Object.values(agentResults)) {
      if (!('error' in result)) {
        if (result.score != null) {
          scores.push(Number(result.score));
        }
      }
    }

    if (scores.length > 0) {
      const scoreVariance = this.calculateVariance(scores);
      if (scoreVariance < 0.1) {
        synthesis.agreement_level = 'strong';
      } else if (scoreVariance < 0.2) {
        synthesis.agreement_level = 'moderate';
      } else {
        synthesis.agreement_level = 'weak';
      }
    }

    this.extractKeyInsights(agentResults, synthesis);
    return synthesis;
  }

  private extractKeyInsights(
    agentResults: Record<string, SkillResult>,
    synthesis: Record<string, unknown>,
  ): void {
    const strengths = synthesis.key_strengths as string[];
    const concerns = synthesis.key_concerns as string[];
    const divergences = synthesis.divergences as string[];

    const momentum = agentResults.momentum;
    if (momentum && !('error' in momentum)) {
      const momScore = Number(momentum.score ?? 0);
      if (momScore > 0.7) {
        strengths.push('Strong technical momentum');
      } else if (momScore < 0.3) {
        concerns.push('Weak technical momentum');
      }

      const signals = momentum.signals as Record<string, unknown> | undefined;
      if (signals?.trend === 'bullish') {
        strengths.push('Bullish trend confirmed');
      }
    }

    const investment = agentResults.investment;
    if (investment && !('error' in investment)) {
      const grade = String(investment.grade ?? '');
      if (['A+', 'A', 'B+'].includes(grade)) {
        strengths.push(`Investment grade: ${grade}`);
      } else if (['D', 'F'].includes(grade)) {
        concerns.push(`Poor investment grade: ${grade}`);
      }

      const metrics = investment.metrics as Record<string, unknown> | undefined;
      if (metrics?.moat) {
        strengths.push('Economic moat present');
      }
    }

    const business = agentResults.business;
    if (business && !('error' in business)) {
      const position = business.competitive_position as Record<string, unknown> | undefined;
      if (position?.industry_position === 'leader') {
        strengths.push('Industry leader');
      }

      const advantages = position?.competitive_advantages as string[] | undefined;
      if (advantages?.length) {
        strengths.push(...advantages.slice(0, 2));
      }

      const model = business.business_model as Record<string, string> | undefined;
      if (model?.growth_sustainability === 'at risk') {
        concerns.push('Growth sustainability at risk');
      }
    }

    if (agentResults.momentum && agentResults.investment) {
      const momScore = Number(agentResults.momentum.score ?? 0.5);
      const invScore = Number(agentResults.investment.score ?? 0.5);

      if (Math.abs(momScore - invScore) > 0.3) {
        if (momScore > invScore) {
          divergences.push('Technical signals stronger than fundamentals');
        } else {
          divergences.push('Fundamentals stronger than technicals');
        }
      }
    }
  }

  private generateFinalRecommendation(
    consensusScore: number,
    _agentResults: Record<string, SkillResult>,
    synthesis: Record<string, unknown>,
  ): Record<string, unknown> {
    let stance: string;
    let action: string;

    if (consensusScore >= 0.7) {
      stance = 'bullish';
      action = 'Consider for investment';
    } else if (consensusScore >= 0.5) {
      stance = 'neutral-positive';
      action = 'Monitor for entry opportunity';
    } else if (consensusScore >= 0.3) {
      stance = 'neutral-negative';
      action = 'Wait for improvement';
    } else {
      stance = 'bearish';
      action = 'Avoid';
    }

    let narrative = `${action}. `;

    const agreementLevel = String(synthesis.agreement_level ?? '');
    if (agreementLevel === 'strong') {
      narrative += 'All agents agree on the assessment. ';
    } else if (agreementLevel === 'weak') {
      narrative += 'Mixed signals from different perspectives. ';
    }

    const strengths = synthesis.key_strengths as string[];
    const concerns = synthesis.key_concerns as string[];
    const divergences = synthesis.divergences as string[];

    if (strengths.length > 0) {
      narrative += `Strengths: ${strengths.slice(0, 2).join(', ')}. `;
    }

    if (concerns.length > 0) {
      narrative += `Concerns: ${concerns.slice(0, 2).join(', ')}. `;
    }

    if (divergences.length > 0) {
      narrative += `Note: ${divergences[0]}. `;
    }

    return {
      stance,
      action,
      narrative,
      confidence: this.calculateConfidence(agreementLevel),
    };
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0.0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length;
  }

  private calculateConfidence(agreementLevel: string): string {
    const confidenceMap: Record<string, string> = {
      strong: 'high',
      moderate: 'medium',
      weak: 'low',
      none: 'very low',
    };
    return confidenceMap[agreementLevel] ?? 'medium';
  }
}
