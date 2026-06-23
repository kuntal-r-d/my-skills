import { defineConfig } from 'tsup';

const cliEntries = [
  'financial-terms-educator',
  'macro-regime',
  'sentiment-news',
  'smart-money-flow',
  'fundamental-analysis',
  'value-investment-checklist',
  'technical-analysis',
  'momentum-screen',
  'risk-manager',
  'stock-screener',
  'pattern-miner',
  'signal-synthesizer',
  'daily-briefing',
  'ticker-dossier',
] as const;

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    ...Object.fromEntries(
      cliEntries.map((name) => [`cli/${name}`, `src/cli/${name}.ts`]),
    ),
  },
  format: ['esm'],
  dts: true,
  clean: true,
  shims: true,
  splitting: false,
  sourcemap: true,
});
