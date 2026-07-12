import { injectIntrinsicValue } from '@stock-buddy/core';
import { runSkill } from '@stock-buddy/mcp-server/composites';

/** Re-run value checklist from the latest DB contract (keeps other snapshot fields). */
export function enrichValueChecklistInAnalysis(
  analysis: Record<string, unknown>,
  contractPayload: Record<string, unknown>,
): Record<string, unknown> {
  try {
    let payload = { ...contractPayload };
    const fundCard = runSkill('fundamental_analysis', payload);
    if (fundCard && !('error' in fundCard)) {
      payload = {
        ...payload,
        fundamentals: injectIntrinsicValue(
          (payload.fundamentals as Record<string, unknown>) ?? {},
          fundCard,
        ),
      };
    }

    const val = runSkill('value_investment_checklist', payload);
    if (val && !('error' in val)) {
      return {
        ...analysis,
        value_investment_checklist: val,
        value_checklist_enriched: true,
      };
    }
    return {
      ...analysis,
      value_checklist_enrich_skipped: String((val as { error?: string })?.error ?? 'checklist returned empty'),
    };
  } catch (err) {
    return {
      ...analysis,
      value_checklist_enrich_error: err instanceof Error ? err.message : String(err),
    };
  }
}
