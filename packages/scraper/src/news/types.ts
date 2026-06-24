export interface NewsRow {
  date: string;
  headline: string;
  source?: string;
  category?: string;
  url?: string;
}

export type NewsSourceKind = 'rss' | 'html' | 'dse_company';

export interface NewsSourceDef {
  id: string;
  label: string;
  kind: NewsSourceKind;
  /** RSS feed URL or HTML listing page */
  url: string;
  category: string;
  /** newspaper | dse | web | social */
  channel: string;
  /** Filter RSS/HTML to stock-related headlines only */
  stockFilter?: boolean;
  /** bn | en — for display / tagging */
  lang?: 'bn' | 'en';
}
