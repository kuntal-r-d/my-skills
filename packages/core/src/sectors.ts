import { DSEConfig } from './dse-config.js';

export type CanonicalSector = {
  slug: string;
  displayName: string;
  dseGroup?: string;
  aliases: string[];
  peBenchmark?: number;
};

/** Canonical DSE sectors seeded from PE benchmarks + common DB aliases. */
export const CANONICAL_SECTORS: CanonicalSector[] = [
  { slug: 'banking', displayName: 'Banking', aliases: ['Bank', 'Banks', 'Banking'], peBenchmark: 8.5 },
  {
    slug: 'financial-institutions',
    displayName: 'Financial Institutions',
    aliases: ['NBFI', 'Financial', 'Financial Institutions'],
    peBenchmark: 12.0,
  },
  { slug: 'insurance', displayName: 'Insurance', aliases: ['Insurance'], peBenchmark: 15.0 },
  {
    slug: 'pharmaceuticals',
    displayName: 'Pharmaceuticals',
    aliases: ['Pharma', 'Pharmaceutical', 'Pharmaceuticals'],
    peBenchmark: 22.0,
  },
  { slug: 'textile', displayName: 'Textile', aliases: ['Textile', 'Textiles'], peBenchmark: 18.0 },
  {
    slug: 'telecommunications',
    displayName: 'Telecommunications',
    aliases: ['Telecom', 'Telco', 'Telecommunications'],
    peBenchmark: 15.0,
  },
  { slug: 'engineering', displayName: 'Engineering', aliases: ['Engineering', 'Industrial'], peBenchmark: 20.0 },
  {
    slug: 'food-allied',
    displayName: 'Food & Allied',
    aliases: ['Food', 'FMCG', 'Consumer', 'Food & Allied'],
    peBenchmark: 25.0,
  },
  { slug: 'cement', displayName: 'Cement', aliases: ['Cement'], peBenchmark: 16.0 },
  {
    slug: 'power-energy',
    displayName: 'Power & Energy',
    aliases: ['Power', 'Fuel', 'Energy', 'Power & Energy'],
    peBenchmark: 14.0,
  },
  { slug: 'it', displayName: 'IT', aliases: ['IT', 'Technology'], peBenchmark: 28.0 },
  {
    slug: 'services',
    displayName: 'Services',
    aliases: ['Services', 'Real Estate', 'RealEstate'],
    peBenchmark: 18.0,
  },
];

const ALIAS_TO_SLUG = new Map<string, string>();
for (const s of CANONICAL_SECTORS) {
  ALIAS_TO_SLUG.set(s.displayName.toLowerCase(), s.slug);
  ALIAS_TO_SLUG.set(s.slug, s.slug);
  for (const a of s.aliases) ALIAS_TO_SLUG.set(a.toLowerCase(), s.slug);
}

/** Map a raw ticker sector string to canonical display name. */
export function normalizeSector(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const slug = ALIAS_TO_SLUG.get(raw.trim().toLowerCase());
  if (!slug) return raw.trim();
  const found = CANONICAL_SECTORS.find((s) => s.slug === slug);
  return found?.displayName ?? raw.trim();
}

export function sectorSlug(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const slug = ALIAS_TO_SLUG.get(raw.trim().toLowerCase());
  if (slug) return slug;
  const normalized = normalizeSector(raw);
  if (!normalized) return null;
  return ALIAS_TO_SLUG.get(normalized.toLowerCase()) ?? normalized.toLowerCase().replace(/\s+/g, '-');
}

export function sectorBySlug(slug: string): CanonicalSector | undefined {
  return CANONICAL_SECTORS.find((s) => s.slug === slug);
}

export function sectorPeBenchmark(displayName: string): number {
  const pe = DSEConfig.SECTOR_PE_BENCHMARKS[displayName as keyof typeof DSEConfig.SECTOR_PE_BENCHMARKS];
  if (pe != null) return pe;
  const canon = normalizeSector(displayName);
  if (canon && canon in DSEConfig.SECTOR_PE_BENCHMARKS) {
    return DSEConfig.SECTOR_PE_BENCHMARKS[canon as keyof typeof DSEConfig.SECTOR_PE_BENCHMARKS];
  }
  return 15;
}

/** Headline keyword → canonical sector slug (for news tagging). */
export const SECTOR_HEADLINE_KEYWORDS: Record<string, string> = {
  bank: 'banking',
  banks: 'banking',
  banking: 'banking',
  nbfi: 'financial-institutions',
  insurance: 'insurance',
  pharma: 'pharmaceuticals',
  pharmaceutical: 'pharmaceuticals',
  textile: 'textile',
  telecom: 'telecommunications',
  telco: 'telecommunications',
  cement: 'cement',
  power: 'power-energy',
  energy: 'power-energy',
  fuel: 'power-energy',
  food: 'food-allied',
  fmcg: 'food-allied',
  consumer: 'food-allied',
  engineering: 'engineering',
  industrial: 'engineering',
  it: 'it',
  technology: 'it',
  'real estate': 'services',
  realestate: 'services',
  property: 'services',
  services: 'services',
};

export function detectSectorFromHeadline(headline: string): string | null {
  const q = headline.toLowerCase();
  const sorted = Object.keys(SECTOR_HEADLINE_KEYWORDS).sort((a, b) => b.length - a.length);
  for (const kw of sorted) {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(q)) return SECTOR_HEADLINE_KEYWORDS[kw]!;
  }
  return null;
}
