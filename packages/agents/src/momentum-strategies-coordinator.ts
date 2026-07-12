import type { SkillData, SkillResult } from './base-agent.js';
import {
  CanSlimAgent,
  DarvasBoxAgent,
  LivermorePivotAgent,
  MinerviniSepaAgent,
} from './momentum-strategy-agent.js';

const STRATEGY_KEYS = ['minervini_sepa', 'can_slim', 'darvas_box', 'livermore_pivot'] as const;

type StrategyKey = (typeof STRATEGY_KEYS)[number];

interface StrategySkillResult {
  criteria?: { passed?: boolean | null }[];
  key_metrics?: {
    criteria_passed?: number;
    criteria_evaluated?: number;
    overall_count?: string;
    categories?: Record<string, { criteria_met: number; total: number; fraction: number }>;
  };
  score?: number;
  rating?: string;
  confidence?: number;
  error?: string;
}

function bucketFromSkill(result: StrategySkillResult | undefined): {
  criteria_met: number;
  total: number;
  fraction: number;
} {
  if (!result || result.error) return { criteria_met: 0, total: 0, fraction: 0 };
  const criteria = result.criteria ?? [];
  const evaluable = criteria.filter((c) => c.passed != null);
  const met = evaluable.filter((c) => c.passed).length;
  const total = evaluable.length;
  return {
    criteria_met: met,
    total,
    fraction: total ? Math.round((met / total) * 1000) / 1000 : 0,
  };
}

function gradeFromScore(score: number): string {
  if (score >= 0.9) return 'A+';
  if (score >= 0.8) return 'A';
  if (score >= 0.7) return 'B+';
  if (score >= 0.6) return 'B';
  if (score >= 0.5) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}

export class MomentumStrategiesCoordinator {
  readonly agents = {
    minervini_sepa: new MinerviniSepaAgent(),
    can_slim: new CanSlimAgent(),
    darvas_box: new DarvasBoxAgent(),
    livermore_pivot: new LivermorePivotAgent(),
  };

  async analyze(
    data: SkillData,
    momentumRotation?: Record<string, unknown>,
  ): Promise<SkillResult> {
    const entries = Object.entries(this.agents) as [StrategyKey, (typeof this.agents)[StrategyKey]][];
    const settled = await Promise.allSettled(entries.map(([, agent]) => agent.analyze(data)));

    const strategies: Record<string, StrategySkillResult> = {};
    const agents: Record<string, SkillResult> = {};
    const buckets: Record<string, { criteria_met: number; total: number; fraction: number }> = {};
    const scores: number[] = [];
    let totalPassed = 0;
    let totalEvaluated = 0;

    entries.forEach(([key], i) => {
      const result = settled[i];
      if (!result || result.status === 'rejected') {
        strategies[key] = { error: String(result && 'reason' in result ? result.reason : 'failed') };
        buckets[key] = { criteria_met: 0, total: 0, fraction: 0 };
        return;
      }

      const agentResult = result.value;
      agents[key] = agentResult;

      if (!('error' in agentResult)) {
        const details = agentResult.details as StrategySkillResult;
        strategies[key] = details;
        const bucket = bucketFromSkill(details);
        buckets[key] = bucket;
        totalPassed += bucket.criteria_met;
        totalEvaluated += bucket.total;
        if (agentResult.score != null) scores.push(Number(agentResult.score));
      } else {
        strategies[key] = { error: String(agentResult.error) };
        buckets[key] = { criteria_met: 0, total: 0, fraction: 0 };
      }
    });

    const consensusScore = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 1000
      : 0;

    return {
      summary: {
        consensus_score: consensusScore,
        consensus_grade: gradeFromScore(consensusScore),
        rating: gradeFromScore(consensusScore),
        overall_count: `${totalPassed}/${totalEvaluated}`,
        criteria_passed: totalPassed,
        criteria_evaluated: totalEvaluated,
        confidence: this.avgConfidence(strategies),
        buckets,
      },
      strategies,
      agents,
      momentum_rotation: momentumRotation,
      ticker: data.ticker,
      as_of: data.as_of,
    };
  }

  private avgConfidence(strategies: Record<string, StrategySkillResult>): number {
    const vals = STRATEGY_KEYS.map((k) => strategies[k]?.confidence).filter((v): v is number => v != null);
    if (!vals.length) return 0.5;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  }
}
