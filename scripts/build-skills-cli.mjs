#!/usr/bin/env node
/**
 * Copy compiled skill CLI wrappers into skills/<name>/scripts/*.js
 * so SKILL.md invocations work against the TypeScript build output.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliDist = join(root, 'packages/skills/dist/cli');
const skillsRoot = join(root, 'skills');

const CLI_MAP = {
  'financial-terms-educator': { script: 'lookup.js', source: 'financial-terms-educator.js' },
  'macro-regime': { script: 'regime.js', source: 'macro-regime.js' },
  'sentiment-news': { script: 'sentiment.js', source: 'sentiment-news.js' },
  'smart-money-flow': { script: 'analyze.js', source: 'smart-money-flow.js' },
  'fundamental-analysis': { script: 'analyze.js', source: 'fundamental-analysis.js' },
  'value-investment-checklist': { script: 'checklist.js', source: 'value-investment-checklist.js' },
  'technical-analysis': { script: 'analyze.js', source: 'technical-analysis.js' },
  'momentum-screen': { script: 'screen.js', source: 'momentum-screen.js' },
  'risk-manager': { script: 'analyze.js', source: 'risk-manager.js' },
  'stock-screener': { script: 'screen.js', source: 'stock-screener.js' },
  'pattern-miner': { script: 'mine.js', source: 'pattern-miner.js' },
  'signal-synthesizer': { script: 'synthesize.js', source: 'signal-synthesizer.js' },
  'daily-briefing': { script: 'brief.js', source: 'daily-briefing.js' },
  'ticker-dossier': { script: 'dossier.js', source: 'ticker-dossier.js' },
};

const SHEBANG = '#!/usr/bin/env node\n';

for (const [skill, { script, source }] of Object.entries(CLI_MAP)) {
  const src = join(cliDist, source);
  const destDir = join(skillsRoot, skill, 'scripts');
  const dest = join(destDir, script);

  if (!existsSync(src)) {
    console.warn(`skip ${skill}: missing ${src}`);
    continue;
  }

  mkdirSync(destDir, { recursive: true });
  let content = readFileSync(src, 'utf8');
  if (!content.startsWith('#!')) {
    content = SHEBANG + content;
  }
  writeFileSync(dest, content, { mode: 0o755 });
  console.log(`copied ${source} → skills/${skill}/scripts/${script}`);
}

// Sync to mirrors
for (const mirror of ['.claude/skills', '.agents/skills']) {
  const mirrorRoot = join(root, mirror);
  if (!existsSync(mirrorRoot)) continue;
  for (const skill of Object.keys(CLI_MAP)) {
    const srcDir = join(skillsRoot, skill, 'scripts');
    const destDir = join(mirrorRoot, skill, 'scripts');
    if (!existsSync(srcDir)) continue;
    mkdirSync(destDir, { recursive: true });
    for (const f of readdirSync(srcDir)) {
      if (f.endsWith('.js')) {
        cpSync(join(srcDir, f), join(destDir, f));
      }
    }
  }
  console.log(`synced JS CLIs to ${mirror}`);
}

console.log('done');
