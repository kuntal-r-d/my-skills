import * as cheerio from 'cheerio';
import type { NewsRow } from './types.js';

export function parseFeStockHtml(html: string): NewsRow[] {
  const $ = cheerio.load(html);
  const items: NewsRow[] = [];
  const seen = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);
  const base = 'https://thefinancialexpress.com.bd';

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const isArticle =
      /^\/stock\/bangladesh\/[^/]+/.test(href) ||
      (/^\/stock\/[^/]+/.test(href) && href !== '/stock' && !href.startsWith('/stock/global'));
    if (!isArticle) return;

    const headline = $(el).text().trim().replace(/\s+/g, ' ');
    if (headline.length < 15) return;
    if (seen.has(href)) return;
    seen.add(href);
    items.push({
      date: today,
      headline,
      source: 'financial_express',
      category: 'general',
      url: href.startsWith('http') ? href : `${base}${href}`,
    });
  });

  return items.slice(0, 30);
}

export function parseFeBanglaStockHtml(html: string): NewsRow[] {
  const $ = cheerio.load(html);
  const items: NewsRow[] = [];
  const seen = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);
  const base = 'https://thefinancialexpress.com.bd';

  $('a[href^="/bangla/stock/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const headline = $(el).text().trim().replace(/\s+/g, ' ');
    if (headline.length < 12 || href === '/bangla/stock' || href.endsWith('/bangla/stock')) return;
    if (seen.has(href)) return;
    seen.add(href);
    items.push({
      date: today,
      headline,
      source: 'financial_express_bn',
      category: 'general',
      url: `${base}${href}`,
    });
  });

  return items.slice(0, 30);
}

export function parseDseNewsHtml(html: string): NewsRow[] {
  const $ = cheerio.load(html);
  const items: NewsRow[] = [];
  const today = new Date().toISOString().slice(0, 10);

  $('a').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const text = $(el).text().trim();
    if (text.length < 10 || !href.includes('displayNews')) return;
    items.push({
      date: today,
      headline: text,
      source: 'dse',
      category: 'price_sensitive',
      url: href.startsWith('http') ? href : `https://www.dsebd.org/${href.replace(/^\//, '')}`,
    });
  });

  if (items.length === 0) {
    $('tr').each((_, tr) => {
      const cells = $(tr).find('td, th');
      if (cells.length < 2) return;
      const label = $(cells[0]).text().trim().toLowerCase();
      if (!label.includes('price sensitive')) return;
      const link = $(cells[1]).find('a').first();
      const href = link.attr('href') ?? '';
      const headline = link.text().trim() || 'Price sensitive information';
      if (!href) return;
      items.push({
        date: today,
        headline,
        source: 'dse',
        category: 'price_sensitive',
        url: href.startsWith('http') ? href : `https://www.dsebd.org/${href.replace(/^\//, '')}`,
      });
    });
  }

  return items.slice(0, 20);
}
