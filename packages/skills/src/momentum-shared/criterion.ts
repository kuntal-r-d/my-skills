import { buildCriterionEducation } from '@stock-buddy/core';
import { gradeFromScore, MOMENTUM_DISCLAIMER } from './grading.js';

export interface MomentumCriterion {
  id: number;
  category: string;
  label: string;
  passed: boolean | null;
  explanation: string;
  value?: unknown;
  missing_fields?: string[];
  levels?: ReturnType<typeof buildCriterionEducation>;
}

export class CriterionCollector {
  private nextId = 1;
  readonly criteria: MomentumCriterion[] = [];

  add(
    category: string,
    label: string,
    passed: boolean | null,
    explanation: string,
    value?: unknown,
    missing?: string[],
  ): void {
    const id = this.nextId++;
    this.criteria.push({
      id,
      category,
      label,
      passed,
      explanation,
      value,
      missing_fields: missing,
      levels: buildCriterionEducation(label, explanation, value, 'momentum', {
        passed,
        missingFields: missing,
      }),
    });
  }
}

export interface CategoryBucket {
  criteria_met: number;
  total: number;
  fraction: number;
}

export function buildCategoryScores(
  criteria: MomentumCriterion[],
  categoryWeights: Record<string, number>,
  categoryCriteria: Record<string, number[]>,
): { score: number; categories: Record<string, CategoryBucket> } {
  const keyMetrics: Record<string, CategoryBucket> = {};
  let score = 0;

  for (const [cat, weight] of Object.entries(categoryWeights)) {
    const ids = new Set(categoryCriteria[cat] ?? []);
    const catItems = criteria.filter((x) => ids.has(x.id) && x.passed != null);
    const met = catItems.filter((x) => x.passed).length;
    const total = catItems.length;
    const frac = total ? met / total : 0;
    score += weight * frac;
    keyMetrics[cat] = {
      criteria_met: met,
      total,
      fraction: Math.round(frac * 1000) / 1000,
    };
  }

  return { score: Math.round(score * 1000) / 1000, categories: keyMetrics };
}

export function buildChecklistOutput(opts: {
  skill: string;
  data: Record<string, unknown>;
  criteria: MomentumCriterion[];
  categoryWeights: Record<string, number>;
  categoryCriteria: Record<string, number[]>;
  flags: string[];
  extraKeyMetrics?: Record<string, unknown>;
  totalCriteria?: number;
}): Record<string, unknown> {
  const { criteria, categoryWeights, categoryCriteria, flags, extraKeyMetrics } = opts;
  const total = opts.totalCriteria ?? criteria.length;
  const counted = criteria.filter((x) => x.passed != null);
  const passed = counted.filter((x) => x.passed);
  const { score, categories } = buildCategoryScores(criteria, categoryWeights, categoryCriteria);
  const rating = gradeFromScore(score);

  const reasoning = criteria.map((x) => {
    const mark = x.passed ? '✓' : x.passed == null ? '?' : '✗';
    const suffix = x.passed != null ? '' : ' (data unavailable — not counted)';
    return `${mark} ${x.label} — ${x.explanation}${suffix}`;
  });

  const evaluable = total ? counted.length / total : 0;
  const confidence = Math.round(
    Math.max(0.1, Math.min(0.95, 0.5 + 0.45 * evaluable - (flags.includes('limited_history_<200_bars') ? 0.1 : 0))) * 100,
  ) / 100;

  return {
    skill: opts.skill,
    ticker: opts.data.ticker,
    mode: opts.data.mode ?? 'momentum',
    as_of: opts.data.as_of,
    score,
    confidence,
    rating,
    key_metrics: {
      overall_count: `${passed.length}/${total}`,
      criteria_passed: passed.length,
      criteria_evaluated: counted.length,
      categories,
      ...extraKeyMetrics,
    },
    criteria,
    reasoning,
    flags,
    disclaimer: MOMENTUM_DISCLAIMER,
  };
}
