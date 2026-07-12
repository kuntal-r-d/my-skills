/** Read/write Agent Skill SKILL.md files and merge with DB overrides. */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _DEFAULT_SKILLS_DIR = path.resolve(__dirname, '../../../skills');

export const SKILL_TOOL_NAMES: Record<string, string> = {
  'technical-analysis': 'technical_analysis',
  'momentum-screen': 'momentum_screen',
  'minervini-sepa': 'minervini_sepa',
  'can-slim': 'can_slim',
  'darvas-box': 'darvas_box',
  'livermore-pivot': 'livermore_pivot',
  'fundamental-analysis': 'fundamental_analysis',
  'value-investment-checklist': 'value_investment_checklist',
  'smart-money-flow': 'smart_money_flow',
  'sentiment-news': 'sentiment_news',
  'macro-regime': 'macro_regime',
  'signal-synthesizer': 'signal_synthesizer',
  'risk-manager': 'risk_manager',
  'stock-screener': 'stock_screener',
  'pattern-miner': 'pattern_miner',
  'daily-briefing': 'daily_briefing',
  'ticker-dossier': 'ticker_dossier',
  'financial-terms-educator': 'financial_terms_educator',
  'sector-macro-insights': 'sector_macro_insights',
  'dse-data-acquisition': 'dse_data_acquisition',
};

export type SkillSource = 'disk' | 'db' | 'merged';

export type SkillSummary = {
  slug: string;
  tool_name: string | null;
  name: string | null;
  description: string | null;
  source: SkillSource;
  has_disk: boolean;
  has_override: boolean;
  is_active: boolean;
  version: number | null;
  updated_at: string | null;
  skill_md_length: number;
};

export type SkillDetail = SkillSummary & {
  skill_md: string;
  disk_skill_md?: string;
  override_id?: number;
};

export type SkillOverrideRow = {
  id: number;
  slug: string;
  toolName: string | null;
  name: string | null;
  description: string | null;
  skillMd: string;
  metadataJson: Record<string, unknown> | null;
  isActive: boolean;
  clientId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function resolveSkillsDir(customDir?: string): string {
  return path.resolve(customDir ?? process.env.STOCK_BUDDY_SKILLS_DIR ?? _DEFAULT_SKILLS_DIR);
}

export function validateSkillSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid skill slug: ${slug}. Use lowercase letters, numbers, and hyphens.`);
  }
}

export function parseSkillMd(skillMd: string): { frontmatterRaw: string; body: string; name: string | null; description: string | null } {
  const m = skillMd.match(FRONTMATTER_RE);
  if (!m) {
    return { frontmatterRaw: '', body: skillMd, name: null, description: null };
  }
  const frontmatterRaw = m[1] ?? '';
  const body = m[2] ?? '';
  const name = frontmatterRaw.match(/^name:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;
  const descMatch = frontmatterRaw.match(/^description:\s*(.+)$/m);
  const description = descMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null;
  return { frontmatterRaw, body, name, description };
}

export function listSkillSlugsFromDisk(skillsDir = resolveSkillsDir()): string[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .map((d) => d.name)
    .filter((slug) => existsSync(path.join(skillsDir, slug, 'SKILL.md')))
    .sort();
}

export function readSkillFromDisk(slug: string, skillsDir = resolveSkillsDir()): string | null {
  validateSkillSlug(slug);
  const filePath = path.join(skillsDir, slug, 'SKILL.md');
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf8');
}

export function writeSkillToDisk(slug: string, skillMd: string, skillsDir = resolveSkillsDir()): { path: string } {
  validateSkillSlug(slug);
  const dir = path.join(skillsDir, slug);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'SKILL.md');
  writeFileSync(filePath, skillMd.endsWith('\n') ? skillMd : `${skillMd}\n`, 'utf8');
  return { path: filePath };
}

function toolNameForSlug(slug: string): string | null {
  return SKILL_TOOL_NAMES[slug] ?? null;
}

function summaryFromMd(
  slug: string,
  skillMd: string,
  opts: {
    source: SkillSource;
    has_disk: boolean;
    has_override: boolean;
    is_active: boolean;
    version: number | null;
    updated_at: string | null;
    override_id?: number;
    disk_skill_md?: string;
  },
): SkillDetail {
  const parsed = parseSkillMd(skillMd);
  return {
    slug,
    tool_name: toolNameForSlug(slug),
    name: parsed.name,
    description: parsed.description,
    source: opts.source,
    has_disk: opts.has_disk,
    has_override: opts.has_override,
    is_active: opts.is_active,
    version: opts.version,
    updated_at: opts.updated_at,
    skill_md_length: skillMd.length,
    skill_md: skillMd,
    disk_skill_md: opts.disk_skill_md,
    override_id: opts.override_id,
  };
}

export function mergeSkill(
  slug: string,
  diskMd: string | null,
  override: SkillOverrideRow | null,
  includeDiskCopy = false,
): SkillDetail | null {
  validateSkillSlug(slug);
  const hasDisk = diskMd != null;
  const hasOverride = override != null && override.isActive;

  if (!hasDisk && !hasOverride) return null;

  if (override && override.isActive) {
    return summaryFromMd(slug, override.skillMd, {
      source: hasDisk ? 'merged' : 'db',
      has_disk: hasDisk,
      has_override: true,
      is_active: override.isActive,
      version: override.version,
      updated_at: override.updatedAt.toISOString(),
      override_id: override.id,
      disk_skill_md: includeDiskCopy ? (diskMd ?? undefined) : undefined,
    });
  }

  return summaryFromMd(slug, diskMd!, {
    source: 'disk',
    has_disk: true,
    has_override: false,
    is_active: true,
    version: null,
    updated_at: null,
    disk_skill_md: includeDiskCopy ? diskMd! : undefined,
  });
}

export function listMergedSkills(
  diskSlugs: string[],
  overrides: SkillOverrideRow[],
  opts?: { include_skill_md?: boolean },
): SkillSummary[] {
  const overrideBySlug = new Map(overrides.map((o) => [o.slug, o]));
  const allSlugs = [...new Set([...diskSlugs, ...overrides.map((o) => o.slug)])].sort();
  const skillsDir = resolveSkillsDir();

  return allSlugs
    .map((slug) => {
      const diskMd = readSkillFromDisk(slug, skillsDir);
      const override = overrideBySlug.get(slug) ?? null;
      const detail = mergeSkill(slug, diskMd, override, false);
      if (!detail) return null;
      const { skill_md, disk_skill_md: _d, override_id: _o, ...summary } = detail;
      if (opts?.include_skill_md) {
        return { ...summary, skill_md };
      }
      return summary;
    })
    .filter((s): s is SkillSummary => s != null);
}

export function getMergedSkill(
  slug: string,
  override: SkillOverrideRow | null,
  opts?: { include_disk_copy?: boolean },
): SkillDetail | null {
  validateSkillSlug(slug);
  const diskMd = readSkillFromDisk(slug);
  return mergeSkill(slug, diskMd, override, opts?.include_disk_copy ?? false);
}
