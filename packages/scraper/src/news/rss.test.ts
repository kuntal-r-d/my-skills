import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRssXml, isStockRelatedHeadline } from './rss.js';
import { tagTickerInHeadline } from './ticker-tag.js';

const SAMPLE = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0">
<channel>
<item>
<title>DSE serves query to Daffodil Computers following sharp price rise</title>
<link>https://example.com/a</link>
<pubDate>Wed, 24 Jun 2026 17:05:00 +0600</pubDate>
</item>
</channel>
</rss>`;

describe('parseRssXml', () => {
  it('parses title, link, and date', () => {
    const rows = parseRssXml(SAMPLE, 'tbs_stocks', 'earnings');
    assert.equal(rows.length, 1);
    assert.match(rows[0]!.headline, /Daffodil/);
    assert.equal(rows[0]!.url, 'https://example.com/a');
    assert.equal(rows[0]!.source, 'tbs_stocks');
  });
});

describe('isStockRelatedHeadline', () => {
  it('matches English market keywords', () => {
    assert.equal(isStockRelatedHeadline('DSE turnover falls'), true);
    assert.equal(isStockRelatedHeadline('Weather forecast for Dhaka'), false);
  });

  it('matches Bengali market keywords', () => {
    assert.equal(isStockRelatedHeadline('শেয়ারবাজারে লেনদেন বেড়েছে'), true);
    assert.equal(isStockRelatedHeadline('৬৯৪ কোটি টাকা মুনাফা বেক্সিমকোর'), true);
  });
});

describe('tagTickerInHeadline', () => {
  const gp = [{ id: 1, symbol: 'GP', name: 'Grameenphone Ltd.' }];
  const bx = [{ id: 2, symbol: 'BXPHARMA', name: 'Beximco Pharmaceuticals' }];

  it('tags by symbol', () => {
    assert.equal(tagTickerInHeadline('GP declares dividend', gp), 1);
  });

  it('tags by company alias', () => {
    assert.equal(tagTickerInHeadline('Grameenphone profit rises', gp), 1);
  });

  it('tags Bengali company names', () => {
    assert.equal(tagTickerInHeadline('৬৯৪ কোটি টাকা মুনাফা বেক্সিমকো ফার্মার', bx), 2);
    assert.equal(tagTickerInHeadline('গ্রামীণফোন লভ্যাংশ ঘোষণা', gp), 1);
  });

  it('tags Bengali headlines after stripping Google News source suffix', () => {
    const nh = [{ id: 3, symbol: 'NHFIL', name: null }];
    const pi = [{ id: 4, symbol: 'PEOPLESINS', name: null }];
    assert.equal(
      tagTickerInHeadline('ন্যাশনাল হাউজিংয়ের লভ্যাংশ ঘোষণা - Apan Desh', nh),
      3,
    );
    assert.equal(
      tagTickerInHeadline('পিপলস্ ইন্স্যুরেন্সের নগদ লভ্যাংশ ঘোষণা - Banglanews24', pi),
      4,
    );
  });

  it('tags from Bengali URL slug', () => {
    assert.equal(
      tagTickerInHeadline(
        'কম টার্নওভার জুলাই-ডিসেম্বর মাসে 30% কর',
        bx,
        'https://thefinancialexpress.com.bd/bangla/stock/beximco-pharmas-delayed-reports',
      ),
      2,
    );
  });
});
