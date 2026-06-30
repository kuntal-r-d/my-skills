export interface NewsRow {
  date: string;
  headline: string;
  source?: string;
  category?: string;
  url?: string;
}

export type NewsSourceKind = 'rss' | 'html' | 'dse_company' | 'dse_archive';

export interface NewsSourceDef {
  id: string;
  label: string;
  kind: NewsSourceKind;
  /** RSS feed URL, HTML listing page, or DSE archive endpoint */
  url: string;
  category: string;
  /** newspaper | dse | web | social */
  channel: string;
  /** DSE old_news.php criteria: 1=PSI, 2=corporate, 3=all */
  dseCriteria?: 1 | 2 | 3;
  /** Filter RSS/HTML to stock-related headlines only */
  stockFilter?: boolean;
  /** bn | en — for display / tagging */
  lang?: 'bn' | 'en';
}
