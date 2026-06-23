import { skills } from '@stock-buddy/skills';

export type SkillData = Record<string, unknown>;
export type SkillResult = Record<string, unknown>;

type SkillHandler = (data: SkillData) => SkillResult;

const SKILL_HANDLERS: Record<string, SkillHandler> = {
  'momentum-screen': (data) => skills['momentum-screen'].screen(data),
  'value-investment-checklist': (data) => skills['value-investment-checklist'].checklist(data),
  'fundamental-analysis': (data) => skills['fundamental-analysis'].analyze(data),
  'technical-analysis': (data) => skills['technical-analysis'].analyze(data),
  'risk-manager': (data) => skills['risk-manager'].analyze(data),
  'signal-synthesizer': (data) => skills['signal-synthesizer'].synthesize(data),
  'pattern-miner': (data) => skills['pattern-miner'].mine(data),
};

export abstract class BaseAgent {
  readonly name: string;
  readonly skills: string[];
  results: Record<string, unknown> = {};

  constructor(name: string, skillsList: string[]) {
    this.name = name;
    this.skills = skillsList;
  }

  abstract analyze(data: SkillData): Promise<SkillResult>;

  runSkill(skillName: string, data: SkillData): SkillResult {
    try {
      const normalized = skillName.replace(/_/g, '-');
      const handler = SKILL_HANDLERS[normalized];
      if (!handler) {
        return { error: `Unknown skill: ${skillName}` };
      }
      return handler(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { error: `Failed to run skill ${skillName}: ${msg}` };
    }
  }

  aggregateScores(scores: number[], weights?: number[]): number {
    if (scores.length === 0) {
      return 0.5;
    }

    const w = weights ?? scores.map(() => 1.0);
    if (w.length !== scores.length) {
      throw new Error('Weights and scores must have same length');
    }

    const totalWeight = w.reduce((sum, n) => sum + n, 0);
    if (totalWeight === 0) {
      return 0.5;
    }

    const weightedSum = scores.reduce((sum, s, i) => sum + s * w[i]!, 0);
    return weightedSum / totalWeight;
  }

  generateRecommendation(score: number, _analysis: SkillData): string {
    let strength: string;
    let action: string;

    if (score >= 0.8) {
      strength = 'Strong';
      action = 'Consider for immediate analysis';
    } else if (score >= 0.6) {
      strength = 'Moderate';
      action = 'Monitor closely';
    } else if (score >= 0.4) {
      strength = 'Weak';
      action = 'Wait for better conditions';
    } else {
      strength = 'Poor';
      action = 'Avoid at current levels';
    }

    return `${strength} signal (score: ${score.toFixed(2)}). ${action}.`;
  }
}
