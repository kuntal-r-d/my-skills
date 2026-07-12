import {
  stageAnalysisScreen,
  dowTheoryScreen,
  launchpadScreen,
  multiTimeframeAnalyze,
} from '@stock-buddy/skills';

function stripSkillResult(result: Record<string, unknown>): Record<string, unknown> {
  if ('error' in result) return { error: result.error };
  return result;
}

export function buildMarketStructure(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    stage_analysis: stripSkillResult(stageAnalysisScreen(payload)),
    dow_theory: stripSkillResult(dowTheoryScreen(payload)),
    launchpad: stripSkillResult(launchpadScreen(payload)),
  };
}

export function buildMultiTimeframeBlock(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return multiTimeframeAnalyze(payload);
}
