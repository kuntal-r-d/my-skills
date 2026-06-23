export { run as financialTermsEducatorRun } from './financial-terms-educator/lookup.js';
export { assess as macroRegimeAssess } from './macro-regime/regime.js';
export { analyze as sentimentNewsAnalyze } from './sentiment-news/sentiment.js';
export { analyze as smartMoneyFlowAnalyze } from './smart-money-flow/analyze.js';
export { analyze as fundamentalAnalysisAnalyze } from './fundamental-analysis/analyze.js';
export { checklist as valueInvestmentChecklist } from './value-investment-checklist/checklist.js';
export { analyze as technicalAnalysisAnalyze } from './technical-analysis/analyze.js';
export { screen as momentumScreen } from './momentum-screen/screen.js';
export { analyze as riskManagerAnalyze } from './risk-manager/analyze.js';
export { screen as stockScreenerScreen, parseQuery as stockScreenerParseQuery } from './stock-screener/screen.js';
export { mine as patternMinerMine } from './pattern-miner/mine.js';
export { synthesize as signalSynthesizerSynthesize } from './signal-synthesizer/synthesize.js';
export { build as dailyBriefingBuild } from './daily-briefing/brief.js';
export { render as tickerDossierRender } from './ticker-dossier/dossier.js';

export { readInput, writeOutput, runCli, parseCliArgs } from './cli.js';

import { run as financialTermsEducatorRunFn } from './financial-terms-educator/lookup.js';
import { assess as macroRegimeAssessFn } from './macro-regime/regime.js';
import { analyze as sentimentNewsAnalyzeFn } from './sentiment-news/sentiment.js';
import { analyze as smartMoneyFlowAnalyzeFn } from './smart-money-flow/analyze.js';
import { analyze as fundamentalAnalysisAnalyzeFn } from './fundamental-analysis/analyze.js';
import { checklist as valueInvestmentChecklistFn } from './value-investment-checklist/checklist.js';
import { analyze as technicalAnalysisAnalyzeFn } from './technical-analysis/analyze.js';
import { screen as momentumScreenFn } from './momentum-screen/screen.js';
import { analyze as riskManagerAnalyzeFn } from './risk-manager/analyze.js';
import { screen as stockScreenerScreenFn } from './stock-screener/screen.js';
import { mine as patternMinerMineFn } from './pattern-miner/mine.js';
import { synthesize as signalSynthesizerSynthesizeFn } from './signal-synthesizer/synthesize.js';
import { build as dailyBriefingBuildFn } from './daily-briefing/brief.js';
import { render as tickerDossierRenderFn } from './ticker-dossier/dossier.js';

export const skills = {
  'financial-terms-educator': { run: financialTermsEducatorRunFn },
  'macro-regime': { assess: macroRegimeAssessFn },
  'sentiment-news': { analyze: sentimentNewsAnalyzeFn },
  'smart-money-flow': { analyze: smartMoneyFlowAnalyzeFn },
  'fundamental-analysis': { analyze: fundamentalAnalysisAnalyzeFn },
  'value-investment-checklist': { checklist: valueInvestmentChecklistFn },
  'technical-analysis': { analyze: technicalAnalysisAnalyzeFn },
  'momentum-screen': { screen: momentumScreenFn },
  'risk-manager': { analyze: riskManagerAnalyzeFn },
  'stock-screener': { screen: stockScreenerScreenFn },
  'pattern-miner': { mine: patternMinerMineFn },
  'signal-synthesizer': { synthesize: signalSynthesizerSynthesizeFn },
  'daily-briefing': { build: dailyBriefingBuildFn },
  'ticker-dossier': { render: tickerDossierRenderFn },
} as const;
