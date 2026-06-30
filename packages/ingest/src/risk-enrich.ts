import { runSkill } from '@stock-buddy/mcp-server/composites';

export function hasStructureStrategy(risk: unknown): boolean {
  const record = risk as Record<string, unknown> | undefined;
  const strategies = record?.strategies as Record<string, unknown> | undefined;
  const structure = strategies?.structure as Record<string, unknown> | undefined;
  return Boolean(structure?.key_metrics);
}

/** Re-run risk_manager when snapshot predates dual-strategy output. */
export function enrichRiskInAnalysis(
  analysis: Record<string, unknown>,
  contractPayload: Record<string, unknown>,
): Record<string, unknown> {
  if (hasStructureStrategy(analysis.risk)) return analysis;

  try {
    const refreshed = runSkill('risk_manager', contractPayload);
    if ('error' in refreshed) {
      return {
        ...analysis,
        risk_enrich_skipped: String(refreshed.error),
      };
    }
    if (!hasStructureStrategy(refreshed)) {
      return {
        ...analysis,
        risk_enrich_skipped: 'risk_manager returned no strategies.structure — rebuild @stock-buddy/skills',
      };
    }
    return {
      ...analysis,
      risk: refreshed,
      risk_enriched: true,
    };
  } catch (err) {
    return {
      ...analysis,
      risk_enrich_error: err instanceof Error ? err.message : String(err),
    };
  }
}
