import type { NewsRow } from './types.js';

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function pickTag(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(block);
  if (cdata?.[1]) return stripCdata(cdata[1]).trim();
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block);
  if (!plain?.[1]) return '';
  return decodeEntities(plain[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function parseRssDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/** Lightweight RSS 2.0 parser (no XML dependency). */
export function parseRssXml(xml: string, sourceId: string, category: string): NewsRow[] {
  const items: NewsRow[] = [];
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  for (const chunk of chunks) {
    const block = chunk.split(/<\/item>/i)[0] ?? chunk;
    const title = pickTag(block, 'title');
    const link = pickTag(block, 'link') || pickTag(block, 'guid');
    const pubDate = pickTag(block, 'pubDate') || pickTag(block, 'dc:date');
    if (!title || title.length < 8) continue;
    items.push({
      date: parseRssDate(pubDate),
      headline: title,
      source: sourceId,
      category,
      url: link || undefined,
    });
  }
  return items;
}

const STOCK_KEYWORDS_EN =
  /\b(stocks?|shares?|markets?|dse|cse|bsec|dividend|ipo|equity|bourse|ticker|portfolio|ebitda|eps|quarter|agm|egm|floor price|circuit|turnover|listing|delist|mutual fund|bond|bank(?:ing)?|securities|beximco|grameenphone)\b/i;

/** Bengali business / share-market terms */
const STOCK_KEYWORDS_BN =
  /(?:শেয়ার|শেয়ার|শেয়ারবাজার|শেয়ারবাজার|পুঁজিবাজার|স্টক|লভ্যাংশ|ডিএসই|বিএসইসি|বোর্ড|লেনদেন|আইপিও|ইপিও|অর্থনীতি|বিনিয়োগ|বিনিয়োগ|কোম্পানি|মূল্য|লাভ|লোকসান|বাজার|পুঁজি|প্রাইস\s*সেনসিটিভ|মুনাফা|টাকা|ব্যাংক|ব্যাংকিং|টার্নওভার|রপ্তানি)/u;

export function isStockRelatedHeadline(headline: string): boolean {
  return STOCK_KEYWORDS_EN.test(headline) || STOCK_KEYWORDS_BN.test(headline);
}
