import { BaseAgent, type SkillData, type SkillResult } from './base-agent.js';

function gradeFromScore(score: number): string {
  if (score >= 0.9) return 'A+';
  if (score >= 0.8) return 'A';
  if (score >= 0.7) return 'B+';
  if (score >= 0.6) return 'B';
  if (score >= 0.5) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}

function strategyRecommendation(score: number, label: string): string {
  if (score >= 0.7) {
    return `${label}: strong trend alignment — watch for a tight base or pullback entry zone; use structure stop if momentum holds.`;
  }
  if (score >= 0.5) {
    return `${label}: partial alignment — monitor for criteria improvement before committing size.`;
  }
  if (score >= 0.3) {
    return `${label}: weak setup — stand aside until more checks pass.`;
  }
  return `${label}: does not qualify — avoid long momentum exposure on this read.`;
}

export abstract class MomentumStrategyAgent extends BaseAgent {
  abstract readonly strategyKey: string;
  abstract readonly strategyLabel: string;
  abstract readonly skillName: string;

  async analyze(data: SkillData): Promise<SkillResult> {
    const result = this.runSkill(this.skillName, data);
    if ('error' in result) {
      return { agent: this.name, strategy: this.strategyKey, error: result.error };
    }

    const score = Number(result.score ?? 0);
    return {
      agent: this.name,
      strategy: this.strategyKey,
      score,
      rating: result.rating ?? gradeFromScore(score),
      recommendation: strategyRecommendation(score, this.strategyLabel),
      details: result,
      ticker: data.ticker,
    };
  }
}

export class MinerviniSepaAgent extends MomentumStrategyAgent {
  readonly strategyKey = 'minervini_sepa';
  readonly strategyLabel = 'Minervini SEPA';
  readonly skillName = 'minervini-sepa';

  constructor() {
    super('MinerviniSepaAgent', ['minervini-sepa']);
  }
}

export class CanSlimAgent extends MomentumStrategyAgent {
  readonly strategyKey = 'can_slim';
  readonly strategyLabel = 'CAN SLIM';
  readonly skillName = 'can-slim';

  constructor() {
    super('CanSlimAgent', ['can-slim']);
  }
}

export class DarvasBoxAgent extends MomentumStrategyAgent {
  readonly strategyKey = 'darvas_box';
  readonly strategyLabel = 'Darvas Box';
  readonly skillName = 'darvas-box';

  constructor() {
    super('DarvasBoxAgent', ['darvas-box']);
  }
}

export class LivermorePivotAgent extends MomentumStrategyAgent {
  readonly strategyKey = 'livermore_pivot';
  readonly strategyLabel = 'Livermore Pivot';
  readonly skillName = 'livermore-pivot';

  constructor() {
    super('LivermorePivotAgent', ['livermore-pivot']);
  }
}
