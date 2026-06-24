/* global Chart */
window.AnalysisUI = (function () {
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum(n, d = 2) {
    if (n == null || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
  }

  function fmtPct(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return `${Number(n).toFixed(1)}%`;
  }

  const TZ = 'Asia/Dhaka';

  function hasTimeComponent(s) {
    return /T\d{2}:\d{2}/.test(s) || /\d{1,2}:\d{2}(:\d{2})?/.test(s.slice(10));
  }

  /** Format timestamps with date + time in Dhaka (BDT). Date-only strings stay date-only. */
  function fmtDate(d, opts = {}) {
    if (!d) return '—';
    const s = String(d).trim();
    if (opts.dateOnly || (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && !hasTimeComponent(s))) {
      return s.slice(0, 10);
    }
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return s.slice(0, 19).replace('T', ' ');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(dt);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} BDT`;
  }

  function fmtDateWithAge(iso) {
    if (!iso) return '—';
    return `${fmtDate(iso)} (${formatAge(iso)})`;
  }

  function criterionIcon(passed) {
    if (passed === true) return '✓';
    if (passed === false) return '✗';
    return '⏳';
  }

  function criterionClass(passed) {
    if (passed === true) return 'passed';
    if (passed === false) return 'failed';
    return 'unknown';
  }

  function scoreColor(frac) {
    if (frac >= 0.7) return 'good';
    if (frac >= 0.4) return 'mid';
    return 'bad';
  }

  function recommendationFromScore(score, type) {
    const s = Number(score);
    if (type === 'momentum') {
      if (s >= 0.8) return { label: 'Strong momentum', text: 'Excellent momentum — consider entry on next minor dip with volume confirmation.' };
      if (s >= 0.6) return { label: 'Good momentum', text: 'Good momentum building — watch for volume confirmation before sizing up.' };
      if (s >= 0.4) return { label: 'Mixed', text: 'Mixed signals — wait for clearer direction on key criteria.' };
      if (s >= 0.2) return { label: 'Weakening', text: 'Momentum weakening — consider taking profits if held for trade.' };
      return { label: 'Weak', text: 'Momentum lost — exit or avoid new momentum positions.' };
    }
    if (s >= 0.27 / 0.3) return { label: 'Exceptional', text: 'Exceptional investment quality — suitable for long-term watchlist.' };
    if (s >= 0.24 / 0.3) return { label: 'Strong', text: 'Strong fundamentals — align with investment timeframe.' };
    if (s >= 0.18 / 0.3) return { label: 'Consider', text: 'Acceptable value — verify weak criteria before committing capital.' };
    return { label: 'Avoid', text: 'Multiple value criteria failed — high risk for long-term hold.' };
  }

  function confidenceBadge(conf) {
    if (conf == null) return '';
    const pct = Math.round(Number(conf) * (Number(conf) <= 1 ? 100 : 1));
    return `<span class="confidence-badge">${pct}% conf.</span>`;
  }

  function renderThinkingCard(title, card, scope) {
    if (!card || card.error) {
      return `<div class="thinking-card empty"><h4>${esc(title)}</h4><p class="muted">${esc(card?.error ?? 'No data')}</p></div>`;
    }
    const score = card.score != null ? Number(card.score).toFixed(2) : '—';
    const rating = card.rating ?? '—';
    const reasoning = Array.isArray(card.reasoning) ? card.reasoning : [];
    const km = card.key_metrics ?? {};
    const metricsHtml = Object.entries(km)
      .filter(([, v]) => typeof v !== 'object')
      .slice(0, 8)
      .map(([k, v]) => `<div class="metric-chip"><span class="mk">${esc(k)}</span><span class="mv">${esc(v)}</span></div>`)
      .join('');

    return `
      <div class="thinking-card">
        <div class="tc-header">
          <div>
            <h4>${esc(title)}</h4>
            ${scope ? `<p class="agent-scope">${esc(scope)}</p>` : ''}
          </div>
          <div class="tc-scores">
            <span class="grade-badge">${esc(rating)}</span>
            <span class="score-pill">${score}</span>
            ${confidenceBadge(card.confidence)}
          </div>
        </div>
        ${metricsHtml ? `<div class="metric-grid">${metricsHtml}</div>` : ''}
        <details class="glass-box">
          <summary>Reasoning chain (${reasoning.length} steps)</summary>
          <ul class="reasoning-list">${reasoning.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        </details>
      </div>`;
  }

  function renderRiskPanel(risk) {
    if (!risk || risk.error) {
      return `<p class="muted">${esc(risk?.error ?? 'Risk analysis unavailable')}</p>`;
    }
    const km = risk.key_metrics ?? {};
    const gates = risk.gates ?? {};
    const gateRows = Object.entries(gates)
      .map(
        ([name, g]) =>
          `<tr><td>${esc(name)}</td><td><span class="badge ${g.pass ? 'ok' : 'fail'}">${g.pass ? 'PASS' : 'FAIL'}</span></td><td class="muted">${esc(g.detail ?? '')}</td></tr>`,
      )
      .join('');

    return `
      <div class="risk-panel">
        <div class="price-row">
          <div class="price-card"><div class="label">Buy zone</div><div class="value">৳${fmtNum(km.buy_zone_low)} – ৳${fmtNum(km.buy_zone_high)}</div></div>
          <div class="price-card stop"><div class="label">Stop-loss</div><div class="value">৳${fmtNum(km.stop_loss)}</div></div>
          <div class="price-card target"><div class="label">Target</div><div class="value">৳${fmtNum(km.target)}</div></div>
          <div class="price-card"><div class="label">Position size</div><div class="value">৳${fmtNum(km.position_value_bdt, 0)}</div><div class="muted">${fmtNum(km.suggested_shares, 0)} shares · ${fmtPct(km.pct_of_capital)} cap</div></div>
        </div>
        <div class="meta-bar">Rating: <strong>${esc(risk.rating)}</strong> · R:R 1:${fmtNum(km.risk_reward)} · ATR ৳${fmtNum(km.atr)} ${confidenceBadge(risk.confidence)}</div>
        <h4>Risk gates</h4>
        <div class="table-wrap"><table><tr><th>Gate</th><th>Status</th><th>Detail</th></tr>${gateRows}</table></div>
      </div>`;
  }

  function renderComparison(synthesis, momentumScreen, valueChecklist) {
    const inv = synthesis?.investment ?? {};
    const mom = synthesis?.momentum ?? {};
    const momGrade = momentumScreen?.rating ?? '—';
    const valGrade = valueChecklist?.rating ?? '—';
    const valGpa = valueChecklist?.key_metrics?.gpa;
    const momCount = momentumScreen?.key_metrics?.overall_count ?? '—';
    const conflict = synthesis?.conflict ?? synthesis?.conflicts;
    const confluence = synthesis?.confluence ?? synthesis?.unified_rating ?? inv.rating;

    let conflictHtml = '';
    if (conflict) {
      conflictHtml = `<div class="conflict-banner">⚠ Signal conflict: ${esc(typeof conflict === 'string' ? conflict : JSON.stringify(conflict))}</div>`;
    }

    return `
      ${conflictHtml}
      <div class="comparison-grid">
        <div class="comparison-col investment">
          <h4>Investment</h4>
          <div class="big-grade">${esc(valGrade)}</div>
          <div>GPA ${fmtNum(valGpa)} · Score ${inv.composite_1_10 ?? '—'}/10</div>
          <div class="muted">${esc(inv.rating ?? '')}</div>
          ${confidenceBadge(inv.confidence ?? valueChecklist?.confidence)}
        </div>
        <div class="comparison-col momentum">
          <h4>Momentum</h4>
          <div class="big-grade">${esc(momGrade)}</div>
          <div>${esc(momCount)} criteria · Score ${mom.composite_1_10 ?? '—'}/10</div>
          <div class="muted">${esc(mom.rating ?? '')}</div>
          ${confidenceBadge(mom.confidence ?? momentumScreen?.confidence)}
        </div>
      </div>
      <div class="unified-rec"><strong>Unified:</strong> ${esc(String(confluence ?? '—'))}</div>`;
  }

  function renderCategoryBars(categories) {
    if (!categories) return '';
    return Object.entries(categories)
      .map(([cat, data]) => {
        const row = data && typeof data === 'object' ? data : {};
        const frac = row.fraction ?? 0;
        return `
          <div class="cat-bar">
            <div class="cat-label"><span>${esc(cat.replace(/_/g, ' '))}</span><span>${row.criteria_met ?? '—'}/${row.total ?? '—'}</span></div>
            <div class="progress-track"><div class="progress-fill ${scoreColor(frac)}" style="width:${Math.round(frac * 100)}%"></div></div>
          </div>`;
      })
      .join('');
  }

  function formatCriterionSummaryValue(c) {
    if (c.levels?.formattedValue) return c.levels.formattedValue;
    if (c.value != null && typeof c.value !== 'object') return fmtNum(c.value, 4);
    return '';
  }

  function renderCriterionBody(c) {
    const levels = c.levels;
    const simple = levels?.simple ?? c.explanation;
    const example = levels?.example ?? '';
    const bangla = levels?.bangla ?? '';
    const stock = levels?.formattedValue ?? formatCriterionSummaryValue(c);
    const verdict =
      c.passed === true
        ? 'Passes this check.'
        : c.passed === false
          ? 'Does not pass yet.'
          : 'Waiting on data for this check.';

    return `
      <div class="criterion-edu">
        <p class="criterion-verdict ${criterionClass(c.passed)}">${esc(verdict)}${stock ? ` <span class="criterion-stock">(${esc(stock)})</span>` : ''}</p>
        <p class="criterion-simple">${esc(simple)}</p>
        ${example ? `<p class="criterion-example">${esc(example)}</p>` : ''}
        ${bangla ? `<p class="criterion-bn" lang="bn">${esc(bangla)}</p>` : ''}
      </div>`;
  }

  function renderCriteriaList(criteria, bucketKey) {
    if (!Array.isArray(criteria) || !criteria.length) return '<p class="muted">No criteria data</p>';
    let current = null;
    let html = '';
    for (const c of criteria) {
      const bucket = c[bucketKey] ?? c.category ?? 'Other';
      if (bucket !== current) {
        if (current) html += '</div>';
        html += `<div class="criteria-group"><h5>${esc(String(bucket))}</h5>`;
        current = bucket;
      }
      const summaryVal = formatCriterionSummaryValue(c);
      const val = summaryVal ? ` · ${esc(summaryVal)}` : '';
      html += `
        <details class="criterion ${criterionClass(c.passed)}">
          <summary><span class="c-icon">${criterionIcon(c.passed)}</span> ${esc(c.label)}${val}</summary>
          ${renderCriterionBody(c)}
        </details>`;
    }
    if (current) html += '</div>';
    return html;
  }

  function renderMomentumChecklist(ms, rotation) {
    if (!ms || ms.error) return `<p class="muted">${esc(ms?.error ?? 'Run analysis to load momentum checklist')}</p>`;
    const rec = recommendationFromScore(ms.score, 'momentum');
    const formulas = ms.key_metrics?.formulas ?? {};
    const formulaHtml = Object.entries(formulas)
      .map(([k, v]) => `<span class="formula-chip">${esc(k)}: ${fmtNum(v)}</span>`)
      .join('');

    let rotHtml = '';
    if (rotation) {
      rotHtml = `
        <div class="rotation-panel">
          <h5>Momentum rotation</h5>
          <div class="formula-row">
            <span>1M ROC ${fmtPct(rotation.roc_1m)}</span>
            <span>3M ${fmtPct(rotation.roc_3m)}</span>
            <span>6M ${fmtPct(rotation.roc_6m)}</span>
            <span>12M ${fmtPct(rotation.roc_12m)}</span>
            <span>Age ${rotation.momentum_age_days ?? '—'}d</span>
          </div>
          <p class="muted">${esc(rotation.rebalance_note)}</p>
        </div>`;
    }

    return `
      <div class="checklist-intro">
        <p><strong>Momentum checklist</strong> — Short-term trading: is price, volume, and relative strength aligned for a trend trade? Not a buy signal on its own — pair with risk rules.</p>
        <p class="checklist-intro-bn" lang="bn">স্বল্পমেয়াদি ট্রেডিং: দাম, ভলিউম ও আপেক্ষিক শক্তি একসাথে ঊর্ধ্বমুখী কিনা। একা কেনার সংকেত নয় — ঝুঁকি নিয়মের সাথে দেখুন।</p>
      </div>
      <div class="checklist-header">
        <div><span class="grade-badge lg">${esc(ms.rating)}</span> ${esc(ms.key_metrics?.overall_count ?? '')} ${confidenceBadge(ms.confidence)}</div>
        <div class="action-rec ${scoreColor(ms.score)}"><strong>${esc(rec.label)}:</strong> ${esc(rec.text)}</div>
      </div>
      ${renderCategoryBars(ms.key_metrics?.categories)}
      ${formulaHtml ? `<div class="formula-row">${formulaHtml}</div>` : ''}
      ${rotHtml}
      ${renderCriteriaList(ms.criteria, 'category')}`;
  }

  function renderValueChecklist(vc, activeBucket) {
    if (!vc || vc.error) return `<p class="muted">${esc(vc?.error ?? 'Run analysis to load value checklist')}</p>`;
    const rec = recommendationFromScore(vc.score, 'investment');
    const buckets = ['buffett', 'lynch', 'graham'];
    const tabs = buckets
      .map((b) => `<button type="button" class="bucket-tab ${activeBucket === b ? 'active' : ''}" data-bucket="${b}">${esc(b)}</button>`)
      .join('');
    const filtered =
      activeBucket === 'all'
        ? vc.criteria
        : (vc.criteria ?? []).filter((c) => c.bucket === activeBucket);

    return `
      <div class="checklist-intro">
        <p><strong>Investment checklist</strong> — Long-term quality: can this business compound your money for years? Each row is pass ✓, fail ✗, or needs data ⏳.</p>
        <p class="checklist-intro-bn" lang="bn">দীর্ঘমেয়াদি বিনিয়োগ: ব্যবসাটি বছরের পর বছর টাকা বাড়াতে পারে কিনা। প্রতিটি সারি পাস, ফেল বা ডেটা অপেক্ষা।</p>
      </div>
      <div class="checklist-header">
        <div><span class="grade-badge lg">${esc(vc.rating)}</span> GPA ${fmtNum(vc.key_metrics?.gpa)} · ${esc(vc.key_metrics?.overall_count ?? '')} ${confidenceBadge(vc.confidence)}</div>
        <div class="action-rec ${scoreColor(vc.score)}"><strong>${esc(rec.label)}:</strong> ${esc(rec.text)}</div>
      </div>
      ${renderCategoryBars(vc.key_metrics?.buckets)}
      <div class="bucket-tabs">${tabs}<button type="button" class="bucket-tab ${activeBucket === 'all' ? 'active' : ''}" data-bucket="all">All 30</button></div>
      ${renderCriteriaList(filtered, 'bucket')}`;
  }

  function renderIndicators(card) {
    const km = card?.key_metrics ?? {};
    const items = [
      ['RSI', km.rsi_14],
      ['MACD hist', km.macd_hist],
      ['ROC', km.roc_12],
      ['MFI', km.mfi_14],
    ].filter(([, v]) => v != null);
    if (!items.length) return '';
    return `<div class="indicator-strip">${items.map(([l, v]) => `<span class="ind-chip">${l} ${fmtNum(v)}</span>`).join('')}</div>`;
  }

  const NEWS_SOURCE_LABELS = {
    tbs_stocks: 'TBS Stocks',
    tbs_economy: 'TBS Economy',
    tbs_economy_bn: 'TBS অর্থনীতি',
    dhaka_tribune_stock: 'Dhaka Tribune',
    daily_star_business: 'Daily Star',
    financial_express: 'Financial Express',
    financial_express_bn: 'FE বাংলা',
    prothomalo: 'Prothom Alo',
    google_news_dse: 'Google News',
    google_news_bn: 'Google News BN',
    dse: 'DSE',
  };

  const TICKER_BN_LABELS = {
    BXPHARMA: 'বেক্সিমকো',
    GP: 'গ্রামীণফোন',
    SQURPHARMA: 'স্কয়ার ফার্মা',
    LHB: 'লাফার্জ',
    BRACBANK: 'ব্র্যাক ব্যাংক',
    ROBI: 'রবি',
    ACI: 'এসিআই',
    WALTONHIL: 'ওয়ালটন',
    NHFIL: 'ন্যাশনাল হাউজিং',
    PEOPLESINS: 'পিপলস ইন্স্যুরেন্স',
    ISLAMIINS: 'ইসলামী ইন্স্যুরেন্স',
    IPDC: 'আইপিডিসি',
  };

  function formatNewsHeadline(n) {
    const h = (n.headline ?? '').trim();
    if (/^https?:\/\//i.test(h)) {
      if (n.category === 'price_sensitive') return 'Price sensitive information (DSE disclosure)';
      return 'Company disclosure — open link for details';
    }
    return h;
  }

  function newsCategoryLabel(cat) {
    const labels = {
      price_sensitive: 'Disclosure',
      earnings: 'Earnings',
      macro: 'Macro',
      rumour: 'Rumour',
      general: 'General',
    };
    return labels[cat] ?? cat ?? 'News';
  }

  function renderTickerNews(news, ticker, { compact = false } = {}) {
    const sym = ticker?.symbol ?? '';
    const items = news ?? [];

    if (!items.length) {
      return `<div class="ticker-news-empty">
        <p class="muted">No news tagged to <strong>${esc(sym)}</strong> yet.</p>
        <p class="muted">Run market news ingest, then DSE company news:</p>
        <pre class="cmd-snippet">npm run ingest -- --job news-market
npm run ingest -- --ticker ${esc(sym)} --job news
npm run ingest -- --job retag-news</pre>
      </div>`;
    }

    const list = items
      .map((n) => {
        const src = NEWS_SOURCE_LABELS[n.source] ?? n.source ?? '—';
        const cat = newsCategoryLabel(n.category);
        const pillKind =
          n.category === 'price_sensitive' ? 'disclosure' : n.category === 'earnings' ? 'market' : 'market';
        const catClass = `news-pill news-pill-${pillKind}`;
        const headlineText = formatNewsHeadline(n);
        const headline = n.url
          ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(headlineText)}</a>`
          : esc(headlineText);
        const bn =
          /[\u0980-\u09FF]/.test(headlineText) && TICKER_BN_LABELS[sym]
            ? `<span class="ticker-bn" lang="bn">${esc(TICKER_BN_LABELS[sym])}</span>`
            : '';
        return `<li class="home-news-item ticker-news-item">
          <div class="home-news-meta">
            <span class="${catClass}">${esc(cat)}</span>
            ${bn}
            <span class="muted home-news-src">${esc(src)} · ${fmtDate(n.publishedDate ?? n.date)}</span>
          </div>
          <div class="home-news-headline">${headline}</div>
        </li>`;
      })
      .join('');

    if (compact) {
      return `<ul class="home-news-list ticker-news-teaser">${list}</ul>`;
    }

    return `
      <div class="ticker-news-panel">
        <p class="agent-scope">${esc(sym)} — DSE disclosures, newspapers, and web headlines tagged to this symbol (last 90 days).</p>
        <p class="muted ticker-news-count">${items.length} item${items.length === 1 ? '' : 's'}</p>
        <ul class="home-news-list">${list}</ul>
      </div>`;
  }

  function renderTickerNewsTeaser(news, limit = 3) {
    const items = (news ?? []).slice(0, limit);
    if (!items.length) return '';
    return `
      <div class="ticker-news-teaser-block">
        <div class="home-section-head">
          <h4>Recent news</h4>
          <button type="button" class="btn-sm linkish" data-sub="news">All news →</button>
        </div>
        ${renderTickerNews(items, null, { compact: true })}
      </div>`;
  }

  function renderBusiness(fundamentals, news, ticker, warnings) {
    const f = fundamentals?.payload ?? {};
    const fieldSources = f._field_sources ?? {};
    const dy = f.dividend_yield ?? f.div_yield;
    const hasFund = fundamentals && Object.keys(f).some((k) => !k.startsWith('_') && f[k] != null && f[k] !== '');
    const fmtPe = () => {
      if (f.pe != null && Number.isFinite(Number(f.pe))) return fmtNum(f.pe);
      if (f.eps_ttm != null && Number(f.eps_ttm) <= 0) return 'n/a (loss-making)';
      return '—';
    };
    const fmtMc = () => {
      if (f.market_cap == null) return '—';
      const n = Number(f.market_cap);
      if (n >= 1e9) return `৳${fmtNum(n / 1e9, 2)}B`;
      if (n >= 1e6) return `৳${fmtNum(n / 1e6, 2)}M`;
      return `৳${fmtNum(n, 0)}`;
    };
    const fieldMeta = {
      'P/E': 'pe',
      'P/B': 'pb',
      ROE: 'roe',
      'EPS (TTM)': 'eps_ttm',
      'Debt/Eq': 'debt_to_equity',
      'Div yield': 'dividend_yield',
      'Market cap': 'market_cap',
    };
    const sourceLabel = (id) => {
      const labels = {
        dse: 'DSE',
        stockanalysis: 'StockAnalysis',
        stockanalysis_statistics: 'StockAnalysis stats',
        lankabd: 'LankaBangla',
        amarstock: 'AmarStock',
        derived: 'derived',
      };
      return labels[id] ?? id ?? '';
    };
    const rows = [
      ['P/E', fmtPe()],
      ['P/B', f.pb != null ? fmtNum(f.pb) : '—'],
      ['ROE', f.roe != null ? fmtPct(Number(f.roe) * 100) : '—'],
      ['EPS (TTM)', f.eps_ttm != null ? fmtNum(f.eps_ttm) : '—'],
      ['Debt/Eq', f.debt_to_equity != null ? fmtNum(f.debt_to_equity) : '—'],
      ['Div yield', dy != null ? fmtPct(Number(dy) * 100) : '—'],
      ['Market cap', fmtMc()],
    ];
    const table = rows
      .map(([k, v]) => {
        const key = fieldMeta[k];
        const src = key ? fieldSources[key] : null;
        const foot = src
          ? `<span class="field-source" title="Source: ${esc(sourceLabel(src))}">*</span>`
          : v === '—'
            ? `<span class="field-missing" title="Not available from any enabled source">†</span>`
            : '';
        return `<tr><td>${k}${foot}</td><td>${esc(v ?? '—')}</td></tr>`;
      })
      .join('');
    const newsNote = (news ?? []).length
      ? `<p class="muted">Latest headlines are on the <button type="button" class="btn-sm linkish" data-sub="news">News</button> tab (${(news ?? []).length} items).</p>`
      : `<p class="muted">No news yet — see the <button type="button" class="btn-sm linkish" data-sub="news">News</button> tab for ingest commands.</p>`;

    const fundNote = hasFund
      ? ''
      : `<p class="data-warnings">⚠ Fundamentals not in database. Run full ingest: <code>${esc(getFullIngestCommand(ticker?.symbol))}</code></p>`;
    const warnHtml = (warnings ?? []).length
      ? `<div class="data-warnings">${warnings.map((w) => `<p>⚠ ${esc(w)}</p>`).join('')}</div>`
      : '';
    const srcList = (f._sources ?? (fundamentals?.source ? fundamentals.source.split('+') : []))
      .map((s) => sourceLabel(s))
      .filter(Boolean);
    const provenanceNote = srcList.length
      ? `<p class="muted dse-note">Data sources: ${esc(srcList.join(', '))}. <span class="field-source">*</span> = field source · <span class="field-missing">†</span> = missing from all sources.</p>`
      : '';

    return `
      ${fundNote}${warnHtml}
      <p class="agent-scope">Business Analysis Agent — model, growth, competitive position from fundamentals.</p>
      ${newsNote}
      <div>
        <h4>${esc(ticker?.name ?? ticker?.symbol)}</h4>
        <p class="muted">Sector: ${esc(ticker?.sector ?? '—')} · Commodity: ${esc(ticker?.commodityType ?? '—')}</p>
        <div class="table-wrap"><table>${table}</table></div>
        ${provenanceNote}
        <p class="muted dse-note">DSE context: compare P/E vs market average ~18. Circuit breaker rules apply.</p>
      </div>`;
  }

  function renderGlossary(terms, query, sections) {
    const q = (query ?? '').toLowerCase();
    const filtered = (terms ?? []).filter((t) => {
      if (!q) return true;
      const hay = [
        t.term,
        t.id,
        t.section,
        t.simple,
        t.bangla,
        t.investor,
        t.trader,
        t.detail,
        t.where,
        t.good,
        t.bad,
        t.action,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    if (!filtered.length) {
      return '<p class="muted">No matching terms — try another keyword (e.g. RSI, stop, checklist).</p>';
    }

    const metaById = new Map((sections ?? []).map((s) => [s.id, s]));
    const bySection = new Map();
    for (const t of filtered) {
      const sec = t.section ?? 'other';
      if (!bySection.has(sec)) bySection.set(sec, []);
      bySection.get(sec).push(t);
    }

    const sectionOrder = (sections ?? []).map((s) => s.id);
    const ordered = sectionOrder.filter((id) => bySection.has(id));
    for (const id of bySection.keys()) {
      if (!ordered.includes(id)) ordered.push(id);
    }

    let html = '';
    for (const secId of ordered) {
      const meta = metaById.get(secId);
      const title = meta?.title ?? String(secId).replace(/_/g, ' ');
      const titleBn = meta?.title_bn;
      const count = bySection.get(secId).length;
      const openAttr = q || meta?.defaultOpen === true || secId === 'fundamental' || secId === 'technical' ? ' open' : '';

      html += `<details class="glossary-section" id="glossary-${esc(secId)}"${openAttr}>`;
      html += `<summary class="glossary-section-summary">`;
      html += `<span class="glossary-section-head">`;
      html += `<span class="glossary-section-title">${esc(title)}</span>`;
      if (titleBn) html += `<span class="glossary-section-title-bn bangla">${esc(titleBn)}</span>`;
      html += `</span>`;
      html += `<span class="glossary-section-count muted">${count} term${count === 1 ? '' : 's'}</span>`;
      html += `</summary>`;
      html += `<div class="glossary-section-body">`;
      if (meta?.intro) {
        html += `<p class="glossary-section-intro">${esc(meta.intro)}</p>`;
      }
      if (meta?.intro_bn) {
        html += `<p class="glossary-section-intro bangla">${esc(meta.intro_bn)}</p>`;
      }
      for (const t of bySection.get(secId)) {
        html += `
        <details class="glossary-term">
          <summary class="glossary-term-summary">${esc(t.term)}</summary>
          <div class="glossary-term-body">
            <div class="glossary-bilingual">
              <p class="glossary-en"><span class="glossary-lang-label">English</span>${esc(t.simple)}</p>
              <p class="glossary-bn bangla"><span class="glossary-lang-label">বাংলা</span>${esc(t.bangla)}</p>
            </div>
            ${t.detail ? `<p class="glossary-detail"><span class="glossary-lang-label">More detail</span>${esc(t.detail)}</p>` : ''}
            <div class="glossary-extra">
              <p><span class="glossary-extra-label">Long-term investor</span> ${esc(t.investor)}</p>
              <p><span class="glossary-extra-label">Short-term trader</span> ${esc(t.trader)}</p>
              <p class="glossary-thresholds muted"><span class="glossary-extra-label">Good sign</span> ${esc(t.good)} · <span class="glossary-extra-label">Caution</span> ${esc(t.bad)}</p>
              <p><span class="glossary-extra-label">What to do</span> ${esc(t.action)}</p>
            </div>
          </div>
        </details>`;
      }
      html += '</div></details>';
    }
    return html;
  }

  function renderLearnPanel() {
    return `
      <div class="learn-panel">
        <h4>What-if: ROE impact</h4>
        <label>ROE % <input type="range" id="learn-roe" min="5" max="30" value="15" /> <span id="learn-roe-val">15%</span></label>
        <p id="learn-roe-text">At 15% ROE, a quality company compounds shareholder capital well above fixed deposits.</p>
        <h4>Quick quiz</h4>
        <p>If ROE is 20% and you invest ৳10,000, roughly how much profit does the company generate on your share yearly?</p>
        <details><summary>Answer</summary><p>About ৳2,000 per year (20% of ৳10,000) if ROE holds and you own equity proportionally.</p></details>
      </div>`;
  }

  function renderBriefing(briefing) {
    if (!briefing?.markdown) return '<p class="muted">Briefing unavailable</p>';
    return `<div class="briefing-md"><pre class="briefing-pre">${esc(briefing.markdown)}</pre></div>`;
  }

  function roc1mCell(pct) {
    if (pct == null || Number.isNaN(pct)) return '—';
    const n = Number(pct);
    return `<span class="${n >= 0 ? 'pos' : 'neg'}">${fmtPct(n)}</span>`;
  }

  function renderPortfolioTable(positions, { compact = false } = {}) {
    if (!positions?.length) return '<p class="muted">No open positions.</p>';

    const sorted = [...positions].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
    const headers = compact
      ? ['Symbol', 'Qty', '1M %', 'Last', 'Sector', 'P&amp;L %', 'Inv', 'Mom', 'Risk']
      : ['Ticker', 'Qty', 'Avg', '1M %', 'Last', 'Sector', 'P&amp;L', 'Inv', 'Mom', 'Risk', ''];

    let html = `<table><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    for (const p of sorted) {
      const sym = `<span class="clickable" data-symbol="${esc(p.ticker)}">${esc(p.ticker)}</span>`;
      const pnlCell = compact
        ? (p.pnl_pct != null ? `<span class="${p.pnl_pct >= 0 ? 'pos' : 'neg'}">${fmtPct(p.pnl_pct)}</span>` : '—')
        : (p.pnl != null ? `৳${fmtNum(p.pnl, 0)} (${fmtPct(p.pnl_pct)})` : '—');
      const cells = compact
        ? [sym, fmtNum(p.qty, 0), roc1mCell(p.roc_1m_pct), fmtNum(p.last_close), esc(p.sector ?? '—'), pnlCell, p.investment_score ?? '—', p.momentum_score ?? '—', esc(p.risk_rating ?? '—')]
        : [sym, fmtNum(p.qty, 0), fmtNum(p.avg_cost), roc1mCell(p.roc_1m_pct), fmtNum(p.last_close), esc(p.sector ?? '—'), pnlCell, p.investment_score ?? '—', p.momentum_score ?? '—', esc(p.risk_rating ?? '—'), `<button type="button" class="btn-sm del-pos" data-symbol="${esc(p.ticker)}">×</button>`];
      html += `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    }
    return html + '</table>';
  }

  function renderHomePortfolio(portfolio) {
    if (!portfolio?.account) {
      return {
        summary: '<p class="muted">No portfolio yet — add positions on the Portfolio tab or run <code>npm run db:seed</code>.</p>',
        table: '',
      };
    }
    const totalPnl = (portfolio.positions ?? []).reduce((s, p) => s + (p.pnl ?? 0), 0);
    const summary =
      `Account <strong>${esc(portfolio.account.label)}</strong> · Capital ৳${fmtNum(portfolio.account.capital_bdt, 0)} · `
      + `Cost ৳${fmtNum(portfolio.total_cost_basis, 0)} · Unrealized P&amp;L ৳${fmtNum(totalPnl, 0)}`;

    return {
      summary,
      table: renderPortfolioTable(portfolio.positions, { compact: true }),
    };
  }

  function renderHomeImportantNews(items) {
    const SOURCE_LABELS = {
      tbs_stocks: 'TBS',
      tbs_economy: 'TBS Economy',
      tbs_economy_bn: 'TBS BN',
      dhaka_tribune_stock: 'Tribune',
      daily_star_business: 'Daily Star',
      financial_express: 'FE',
      financial_express_bn: 'FE BN',
      prothomalo: 'Prothom Alo',
      google_news_dse: 'Google',
      google_news_bn: 'Google BN',
      dse: 'DSE',
    };

    const TICKER_BN = {
      BXPHARMA: 'বেক্সিমকো',
      GP: 'গ্রামীণফোন',
      SQURPHARMA: 'স্কয়ার',
      LHB: 'লাফার্জ',
      BRACBANK: 'ব্র্যাক',
      ROBI: 'রবি',
      ACI: 'এসিআই',
      WALTONHIL: 'ওয়ালটন',
      NHFIL: 'ন্যাশনাল হাউজিং',
      PEOPLESINS: 'পিপলস',
      ISLAMIINS: 'ইসলামী ইন্স্যুরেন্স',
      IPDC: 'আইপিডিসি',
    };

    const IMPORTANCE_LABEL = {
      holding: 'Your holding',
      watchlist: 'Watchlist',
      disclosure: 'Disclosure',
      market: 'Market',
    };

    if (!items?.length) {
      return '<p class="muted">No ranked news yet — run <code>npm run ingest -- --job news-market</code> then refresh.</p>';
    }

    const bnHeadline = (text) => /[\u0980-\u09FF]/.test(text ?? '');

    return `<ul class="home-news-list">${items
      .map((n) => {
        const imp = IMPORTANCE_LABEL[n.importance] ?? 'Market';
        const impClass = `news-pill news-pill-${esc(n.importance ?? 'market')}`;
        const src = SOURCE_LABELS[n.source] ?? n.source ?? '—';
        const tickerBn = n.symbol && bnHeadline(n.headline) && TICKER_BN[n.symbol]
          ? `<span class="ticker-bn" lang="bn">${esc(TICKER_BN[n.symbol])}</span>`
          : '';
        const ticker = n.symbol
          ? `<span class="clickable home-news-ticker" data-symbol="${esc(n.symbol)}">${esc(n.symbol)}</span>${tickerBn}`
          : '';
        const headline = n.url
          ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.headline)}</a>`
          : esc(n.headline);
        return `<li class="home-news-item">
          <div class="home-news-meta">
            <span class="${impClass}">${esc(imp)}</span>
            ${ticker ? `<span class="home-news-symbol">${ticker}</span>` : ''}
            <span class="muted home-news-src">${esc(src)} · ${fmtDate(n.publishedDate)}</span>
          </div>
          <div class="home-news-headline">${headline}</div>
        </li>`;
      })
      .join('')}</ul>`;
  }

  function renderHome(data) {
    const port = renderHomePortfolio(data.portfolio);
    return {
      briefing: renderBriefing(data.briefing),
      importantNews: renderHomeImportantNews(data.importantNews),
      portfolioSummary: port.summary,
      portfolioTable: port.table,
    };
  }

  function renderDiscoverResults(results) {
    if (!results?.length) return '<p class="muted">No results — adjust filters and scan again.</p>';
    const rows = results.map((r, i) => [
      i + 1,
      `<span class="clickable" data-symbol="${esc(r.ticker)}">${esc(r.ticker)}</span>`,
      fmtNum(r.score, 3),
      esc(JSON.stringify(r.key_metrics ?? {})),
      `<button type="button" class="btn-sm watch-add" data-symbol="${esc(r.ticker)}" data-purpose="investment">+Inv</button>
       <button type="button" class="btn-sm watch-add" data-symbol="${esc(r.ticker)}" data-purpose="trading">+Trade</button>`,
    ]);
    let html = '<div class="table-wrap"><table><tr><th>#</th><th>Symbol</th><th>Score</th><th>Metrics</th><th></th></tr>';
    for (const row of rows) {
      html += `<tr>${row.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    }
    return html + '</table></div>';
  }

  function renderAnalytics(kpi) {
    if (!kpi) return '<p class="muted">No analytics data</p>';
    const agents = (kpi.agent_leaderboard ?? [])
      .map((a) => `<tr><td>${esc(a.agent)}</td><td>${a.total}</td><td>${fmtPct(a.win_rate * 100)}</td></tr>`)
      .join('');
    return `
      <div class="cards">
        <div class="card"><div class="label">Snapshots</div><div class="value">${kpi.total_snapshots ?? 0}</div></div>
        <div class="card"><div class="label">Outcomes tracked</div><div class="value">${kpi.total_outcomes ?? 0}</div></div>
        <div class="card"><div class="label">Win rate 1M</div><div class="value">${kpi.win_rate_1m != null ? fmtPct(kpi.win_rate_1m * 100) : '—'}</div></div>
        <div class="card"><div class="label">Model</div><div class="value muted" style="font-size:0.9rem">${esc(kpi.model_version)}</div></div>
      </div>
      <p class="muted">${esc(kpi.governance_note ?? '')}</p>
      <h4>Agent leaderboard</h4>
      <div class="table-wrap"><table><tr><th>Agent</th><th>Signals</th><th>Win rate</th></tr>${agents || '<tr><td colspan="3" class="muted">No outcome data yet</td></tr>'}</table></div>`;
  }

  function ageMs(iso) {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    return Date.now() - t;
  }

  function formatAge(iso) {
    const ms = ageMs(iso);
    if (ms == null) return '—';
    if (ms < 60 * 1000) return 'just now';
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(ms / 3600000);
    if (hrs < 48) return `${hrs} h ago`;
    const days = Math.floor(ms / 86400000);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  function dateOnly(iso) {
    if (!iso) return null;
    return String(iso).slice(0, 10);
  }

  function daysBetween(a, b) {
    const da = dateOnly(a);
    const db = dateOnly(b);
    if (!da || !db) return null;
    const ms = new Date(db).getTime() - new Date(da).getTime();
    return Math.round(ms / 86400000);
  }

  /** Analysis snapshot older than 24h (DSE daily cadence). */
  function isStale(createdAt) {
    const ms = ageMs(createdAt);
    if (ms == null) return true;
    return ms > 24 * 60 * 60 * 1000;
  }

  function entityFreshnessLabel(lastSuccessAt, staleAfterHours) {
    if (!lastSuccessAt) return { level: 'missing', text: 'never ingested' };
    const ms = ageMs(lastSuccessAt);
    if (ms == null) return { level: 'missing', text: 'unknown' };
    const limit = (staleAfterHours ?? 24) * 3600000;
    if (ms <= limit) return { level: 'fresh', text: formatAge(lastSuccessAt) };
    if (ms <= limit * 3) return { level: 'aging', text: formatAge(lastSuccessAt) };
    return { level: 'stale', text: formatAge(lastSuccessAt) };
  }

  function computeJsonFreshness(meta, analysis, tickerData) {
    const issues = [];
    const now = new Date().toISOString();
    const createdAt = meta?.created_at;
    const dataAsOf = analysis?.as_of ?? meta?.as_of;
    const ohlcv = tickerData?.ohlcv ?? [];
    const latestBar = ohlcv.length ? ohlcv[ohlcv.length - 1]?.date : null;
    const fundAsOf = tickerData?.fundamentals?.as_of ?? null;
    const runAge = ageMs(createdAt);

    let level = 'fresh';

    function bump(next) {
      const rank = { fresh: 0, aging: 1, stale: 2, missing: 3 };
      if (rank[next] > rank[level]) level = next;
    }

    if (!analysis) {
      return { level: 'missing', label: 'No snapshot', issues: ['Run Analyze to create a snapshot.'] };
    }
    if (runAge == null) {
      bump('missing');
      issues.push('Snapshot run time unknown — treat as unverified.');
    } else if (runAge > 72 * 3600000) {
      bump('stale');
      issues.push(`Analysis run is ${formatAge(createdAt)} (${fmtDate(createdAt)}) — re-run Analyze after refreshing ingest.`);
    } else if (runAge > 24 * 3600000) {
      bump('aging');
      issues.push(`Analysis run is ${formatAge(createdAt)} (${fmtDate(createdAt)}) — may not reflect the latest session.`);
    }

    if (!latestBar) {
      bump('stale');
      issues.push('No price bars in database — ingest OHLCV before trusting scores.');
    } else {
      const barLag = daysBetween(latestBar, now);
      if (barLag != null && barLag > 4) {
        bump('stale');
        issues.push(`Latest price bar is ${latestBar} (${barLag} calendar days behind today).`);
      } else if (barLag != null && barLag > 2) {
        bump('aging');
        issues.push(`Latest price bar is ${latestBar} — may be behind after a trading day.`);
      }
      if (dataAsOf && dateOnly(dataAsOf) < dateOnly(latestBar)) {
        bump('aging');
        issues.push(`Analysis as_of (${dateOnly(dataAsOf)}) is older than latest bar (${dateOnly(latestBar)}).`);
      }
    }

    if (!fundAsOf) {
      bump('aging');
      issues.push('Fundamentals missing — value scores may be incomplete.');
    } else {
      const fundLag = daysBetween(fundAsOf, now);
      if (fundLag != null && fundLag > 14) {
        bump('aging');
        issues.push(`Fundamentals dated ${fundAsOf} (${fundLag} days old).`);
      }
    }

    const freshness = tickerData?.freshness ?? [];
    for (const f of freshness) {
      const st = entityFreshnessLabel(f.lastSuccessAt, f.staleAfterHours);
      if (st.level === 'stale' || st.level === 'missing') {
        bump(st.level === 'missing' ? 'stale' : 'aging');
        issues.push(`${f.entityType}: ${st.text}${f.lastSuccessAt ? '' : ' — run ingest'}.`);
      }
    }

    const labels = {
      fresh: 'Fresh',
      aging: 'Aging',
      stale: 'Stale',
      missing: 'Missing',
    };
    return { level, label: labels[level] ?? level, issues };
  }

  function renderJsonProvenance(meta, analysis, tickerData) {
    const report = computeJsonFreshness(meta, analysis, tickerData);
    const ohlcv = tickerData?.ohlcv ?? [];
    const latestBar = ohlcv.length ? ohlcv[ohlcv.length - 1]?.date : null;
    const fundAsOf = tickerData?.fundamentals?.as_of ?? null;
    const mode = analysis?.analysis_mode ?? '—';
    const rows = [
      ['Snapshot', meta?.id != null ? `#${meta.id}` : '—'],
      ['Analysis run', meta?.created_at ? fmtDateWithAge(meta.created_at) : '—'],
      ['Data as_of', analysis?.as_of ? fmtDate(analysis.as_of, { dateOnly: !hasTimeComponent(String(analysis.as_of)) }) : '—'],
      ['Analysis mode', mode],
      ['Latest price bar', latestBar ? `${fmtDate(latestBar, { dateOnly: true })} (DSE session)` : '—'],
      ['Fundamentals as_of', fundAsOf ? fmtDate(fundAsOf, { dateOnly: !hasTimeComponent(String(fundAsOf)) }) : '—'],
      ['Model version', meta?.model_version ?? '—'],
    ];

    const entityRows = (tickerData?.freshness ?? []).map((f) => {
      const st = entityFreshnessLabel(f.lastSuccessAt, f.staleAfterHours);
      return `<tr>
        <td>${esc(f.entityType)}</td>
        <td><span class="freshness-dot ${st.level}"></span> ${esc(st.text)}</td>
        <td class="muted">${f.lastSuccessAt ? fmtDate(f.lastSuccessAt) : '—'}</td>
      </tr>`;
    }).join('');

    const issueList = report.issues.length
      ? `<ul class="json-issues">${report.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
      : '<p class="muted json-issues-none">Snapshot and ingested data look current for dashboard use.</p>';

    return `
      <div class="json-provenance-head">
        <span class="json-freshness-badge inline ${report.level}">${esc(report.label)}</span>
        <p class="json-provenance-hint muted">Compare <strong>Analysis run</strong> (when skills ran) vs <strong>Latest price bar</strong> / <strong>Fundamentals as_of</strong> (what was in Postgres). Times are shown in <strong>BDT (Asia/Dhaka)</strong>. Large gaps mean backdated output.</p>
      </div>
      <div class="json-provenance-grid">
        <dl class="json-kv">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(String(v))}</dd></div>`).join('')}</dl>
        <div class="json-ingest-col">
          <h4>Ingest freshness</h4>
          <div class="table-wrap">
            <table class="json-ingest-table">
              <tr><th>Entity</th><th>Status</th><th>Last success</th></tr>
              ${entityRows || '<tr><td colspan="3" class="muted">No freshness records</td></tr>'}
            </table>
          </div>
        </div>
      </div>
      ${issueList}`;
  }

  function ingestCmd(symbol, job, days) {
    const sym = String(symbol ?? 'LHB').toUpperCase();
    let cmd = `npm run ingest -- --ticker ${sym} --job ${job}`;
    if (days != null) cmd += ` --days ${days}`;
    return cmd;
  }

  function analyzeCurl(symbol, mode) {
    const sym = String(symbol ?? 'LHB').toUpperCase();
    const body = JSON.stringify({ mode, client_id: 'cli' });
    return `curl -s -X POST http://localhost:3000/api/tickers/${sym}/analyze -H "Content-Type: application/json" -d '${body}'`;
  }

  const WORKFLOW_COMMANDS = [
    {
      id: 'wf-postgres',
      label: '1. Start Postgres',
      description: 'Docker Compose database (required before any ingest).',
      command: () => 'docker compose up -d postgres',
    },
    {
      id: 'wf-migrate',
      label: '2. Apply schema',
      description: 'Create/update tables in PostgreSQL.',
      command: () => 'npm run db:migrate',
    },
    {
      id: 'wf-seed',
      label: '3. Seed tickers & watchlist',
      description: 'Default DSE symbols, watchlist rows, portfolio account.',
      command: () => 'npm run db:seed',
    },
    {
      id: 'wf-news-market',
      label: '4. Market news (newspapers + web)',
      description: 'TBS, Tribune, Daily Star, Prothom Alo, FE, Google News EN/BN — tags headlines to tickers.',
      command: () => 'npm run ingest -- --job news-market',
    },
    {
      id: 'wf-watchlist',
      label: '5. Watchlist full ingest',
      description: 'For each watchlist symbol: OHLCV, fundamentals, shareholding, DSE news, analysis snapshot.',
      command: () => 'npm run ingest -- --watchlist --days 365',
    },
    {
      id: 'wf-retag',
      label: '6. Retag Bengali / untagged news',
      description: 'Re-apply ticker matching on news already in DB (no new fetch).',
      command: () => 'npm run ingest -- --job retag-news',
    },
    {
      id: 'wf-dashboard',
      label: '7. Start dashboard',
      description: 'Web UI on port 3000 — reads Postgres only, does not scrape.',
      command: () => 'npm run dashboard',
    },
  ];

  const TICKER_COMMANDS = [
    {
      id: 'ingest-all',
      group: 'Per-ticker pipeline',
      label: 'Full ingest + analyze',
      description: 'Runs: OHLCV → fundamentals → shareholding → DSE company news → analysis snapshot. Does not include market news (run news-market separately).',
      command: (sym) => ingestCmd(sym, 'all', 365),
      quick: true,
    },
    {
      id: 'ingest-ohlcv-365',
      group: 'Per-ticker ingest',
      label: 'OHLCV (1 year)',
      description: 'Fetch daily bars from DSE, Yahoo, StockAnalysis — picks longest clean series → ohlcv_daily.',
      command: (sym) => ingestCmd(sym, 'ohlcv', 365),
    },
    {
      id: 'ingest-ohlcv-30',
      group: 'Per-ticker ingest',
      label: 'OHLCV (30-day refresh)',
      description: 'Light refresh after market close — same sources, fewer days.',
      command: (sym) => ingestCmd(sym, 'ohlcv', 30),
      quick: true,
    },
    {
      id: 'ingest-fundamentals',
      group: 'Per-ticker ingest',
      label: 'Fundamentals',
      description: 'Merge DSE, StockAnalysis, LankaBangla, AmarStock → fundamentals_snapshots.',
      command: (sym) => ingestCmd(sym, 'fundamentals'),
      quick: true,
    },
    {
      id: 'ingest-shareholding',
      group: 'Per-ticker ingest',
      label: 'Shareholding',
      description: 'Sponsor, institution, foreign, public from DSE company page → shareholding_monthly.',
      command: (sym) => ingestCmd(sym, 'shareholding'),
    },
    {
      id: 'ingest-news',
      group: 'Per-ticker ingest',
      label: 'News (DSE company page)',
      description: 'Price-sensitive disclosures from dsebd.org for this symbol → news_items.',
      command: (sym) => ingestCmd(sym, 'news'),
      quick: true,
    },
    {
      id: 'ingest-analysis',
      group: 'Per-ticker analysis',
      label: 'Analysis snapshot (CLI)',
      description: 'Read Postgres → run skills → save analysis_snapshots (same data as Analyze Full button).',
      command: (sym) => ingestCmd(sym, 'analysis'),
      quick: true,
    },
    {
      id: 'verify-fundamentals',
      group: 'Verify',
      label: 'Fundamentals sources',
      description: 'Compare raw output from each enabled scraper source for this ticker.',
      command: (sym) => `npm run verify:fundamentals -- --ticker ${String(sym ?? 'LHB').toUpperCase()}`,
      quick: true,
    },
    {
      id: 'api-analyze-full',
      group: 'Dashboard API',
      label: 'Analyze Full (curl)',
      description: 'POST /api/tickers/:symbol/analyze — full pipeline + checklists.',
      command: (sym) => analyzeCurl(sym, 'full'),
    },
    {
      id: 'api-analyze-investment',
      group: 'Dashboard API',
      label: 'Analyze Investment (curl)',
      description: 'POST — value checklist mode.',
      command: (sym) => analyzeCurl(sym, 'investment'),
    },
    {
      id: 'api-analyze-momentum',
      group: 'Dashboard API',
      label: 'Analyze Trading (curl)',
      description: 'POST — momentum checklist mode.',
      command: (sym) => analyzeCurl(sym, 'momentum'),
    },
  ];

  const GLOBAL_COMMANDS = [
    {
      id: 'ingest-news-market',
      group: 'Market-wide ingest',
      label: 'Market news (newspapers + web)',
      description: 'Fetch RSS/HTML from TBS, Tribune, Daily Star, Prothom Alo, FE, Google News — tag tickers → news_items.',
      command: () => 'npm run ingest -- --job news-market',
      quick: true,
    },
    {
      id: 'ingest-retag-news',
      group: 'Market-wide ingest',
      label: 'Retag untagged news',
      description: 'Re-run Bengali/English ticker matching on existing news_items rows.',
      command: () => 'npm run ingest -- --job retag-news',
      quick: true,
    },
    {
      id: 'ingest-macro',
      group: 'Market-wide ingest',
      label: 'Macro snapshot',
      description: 'Policy rate, FX, inflation seed data → macro_snapshots.',
      command: () => 'npm run ingest -- --job macro',
    },
    {
      id: 'ingest-universe',
      group: 'Market-wide ingest',
      label: 'Fundamentals universe (LankaBangla grid)',
      description: 'One fetch, ~400 tickers — bulk fundamentals_snapshots from Lankabd DataMatrix.',
      command: () => 'npm run ingest -- --job fundamentals-universe',
    },
    {
      id: 'ingest-watchlist',
      group: 'Market-wide ingest',
      label: 'Watchlist batch (macro + news + all tickers)',
      description: 'macro → news-market → ingest all for every watchlist symbol.',
      command: () => 'npm run ingest -- --watchlist --days 365',
      quick: true,
    },
    {
      id: 'db-postgres',
      group: 'Database & setup',
      label: 'Start Postgres (Docker)',
      description: 'Required before migrate, seed, or ingest.',
      command: () => 'docker compose up -d postgres',
    },
    {
      id: 'db-migrate',
      group: 'Database & setup',
      label: 'Apply DB schema',
      description: 'Drizzle migrations → tables (tickers, ohlcv_daily, news_items, …).',
      command: () => 'npm run db:migrate',
    },
    {
      id: 'db-seed',
      group: 'Database & setup',
      label: 'Seed tickers + watchlist + portfolio account',
      description: 'Default DSE symbols and empty portfolio shell.',
      command: () => 'npm run db:seed',
    },
    {
      id: 'db-setup',
      group: 'Database & setup',
      label: 'Postgres + migrate (combined)',
      description: 'Start database and apply schema in one step.',
      command: () => 'docker compose up -d postgres && npm run db:migrate',
    },
    {
      id: 'portfolio-import',
      group: 'Database & setup',
      label: 'Import portfolio JSON',
      description: 'Load positions from a JSON file into Postgres (edit path as needed).',
      command: () => 'npm run portfolio:import -- scripts/portfolio-kuntal.json',
    },
    {
      id: 'dashboard',
      group: 'Dashboard',
      label: 'Start dashboard dev server',
      description: 'Express + static UI on STOCK_BUDDY_DASHBOARD_PORT (default 3000). Reads DB only.',
      command: () => 'npm run dashboard',
    },
    {
      id: 'build-all',
      group: 'Dashboard',
      label: 'Build all packages',
      description: 'Compile TypeScript workspaces (optional for tsx-based ingest).',
      command: () => 'npm run build',
    },
  ];

  function cmdAttr(text) {
    return esc(text).replace(/"/g, '&quot;');
  }

  function renderTickerCommandsQuick(symbol) {
    if (!symbol) return '<p class="muted">Select a ticker to see commands.</p>';
    const sym = String(symbol).toUpperCase();
    const quick = TICKER_COMMANDS.filter((c) => c.quick);
    const globalQuick = GLOBAL_COMMANDS.filter((c) => c.quick);
    const wfQuick = WORKFLOW_COMMANDS.filter((c) =>
      ['wf-news-market', 'wf-watchlist', 'wf-retag'].includes(c.id),
    );
    return `
      <div class="cmd-quick-head">
        <span class="cmd-quick-title">Quick copy</span>
        <span class="muted cmd-quick-hint">CLI commands for <strong>${esc(sym)}</strong> — click to copy</span>
      </div>
      <div class="cmd-quick-row">
        ${quick.map((c) => {
          const cmd = c.command(sym);
          return `<button type="button" class="cmd-quick-chip" data-copy-cmd="${cmdAttr(cmd)}" title="${cmdAttr(cmd)}">${esc(c.label)}</button>`;
        }).join('')}
        ${globalQuick.map((c) => {
          const cmd = c.command();
          return `<button type="button" class="cmd-quick-chip cmd-quick-global" data-copy-cmd="${cmdAttr(cmd)}" title="${cmdAttr(cmd)}">${esc(c.label)}</button>`;
        }).join('')}
        ${wfQuick.map((c) => {
          const cmd = c.command();
          return `<button type="button" class="cmd-quick-chip cmd-quick-global" data-copy-cmd="${cmdAttr(cmd)}" title="${cmdAttr(cmd)}">${esc(c.label.replace(/^\d+\.\s*/, ''))}</button>`;
        }).join('')}
        <button type="button" class="cmd-quick-chip cmd-quick-more" data-sub-jump="commands">All commands →</button>
      </div>`;
  }

  function renderCommandRow(c, sym) {
    const cmd = sym != null ? c.command(sym) : c.command();
    return `
      <div class="cmd-row">
        <div class="cmd-row-head">
          <strong>${esc(c.label)}</strong>
          <button type="button" class="btn-sm cmd-copy" data-copy-cmd="${cmdAttr(cmd)}">Copy</button>
        </div>
        <p class="muted cmd-row-desc">${esc(c.description)}</p>
        <code class="cmd-text">${esc(cmd)}</code>
      </div>`;
  }

  function renderTickerCommandsFull(symbol) {
    if (!symbol) return '<p class="muted">Select a ticker to see commands.</p>';
    const sym = String(symbol).toUpperCase();
    const tickerGroups = [...new Set(TICKER_COMMANDS.map((c) => c.group))];
    const globalGroups = [...new Set(GLOBAL_COMMANDS.map((c) => c.group))];

    const workflowSection = `
      <section class="cmd-group cmd-group-workflow">
        <h4>Recommended workflow (first time / daily)</h4>
        <p class="muted cmd-group-note">Run from repo root. Ingest writes to PostgreSQL; dashboard and Analyze only read from DB.</p>
        ${WORKFLOW_COMMANDS.map((c) => renderCommandRow(c, null)).join('')}
      </section>`;

    const tickerSections = tickerGroups.map((g) => {
      const items = TICKER_COMMANDS.filter((c) => c.group === g);
      const note =
        g === 'Per-ticker pipeline'
          ? '<p class="muted cmd-group-note">Replace SYMBOL with the ticker above. <code>--job all</code> does not fetch market news — run news-market first.</p>'
          : g === 'Per-ticker ingest'
            ? `<p class="muted cmd-group-note">Individual jobs for <strong>${esc(sym)}</strong> — each maps to <code>packages/ingest/src/jobs.ts</code>.</p>`
            : '';
      return `
        <section class="cmd-group">
          <h4>${esc(g)} — ${esc(sym)}</h4>
          ${note}
          ${items.map((c) => renderCommandRow(c, sym)).join('')}
        </section>`;
    }).join('');

    const globalSections = globalGroups.map((g) => {
      const items = GLOBAL_COMMANDS.filter((c) => c.group === g);
      const note =
        g === 'Market-wide ingest'
          ? '<p class="muted cmd-group-note">No <code>--ticker</code> needed. Controlled by INGEST_NEWS_SOURCES / INGEST_FUNDAMENTALS_SOURCES in .env.</p>'
          : g === 'Database & setup'
            ? '<p class="muted cmd-group-note">One-time or after schema changes. Requires DATABASE_URL in .env.</p>'
            : '';
      return `
        <section class="cmd-group">
          <h4>${esc(g)}</h4>
          ${note}
          ${items.map((c) => renderCommandRow(c, null)).join('')}
        </section>`;
    }).join('');

    return `<div class="cmd-full-wrap">${workflowSection}${globalSections}${tickerSections}</div>`;
  }

  function getFullIngestCommand(symbol) {
    return ingestCmd(symbol, 'all', 365);
  }

  function buildJsonKeyIndex(jsonText) {
    if (!jsonText) return [];
    const lines = jsonText.split('\n');
    const keys = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^  "([^"]+)":/);
      if (m) keys.push({ key: m[1], line: i });
    }
    return keys;
  }

  function renderJsonKeyNav(keys, activeKey) {
    if (!keys.length) return '<p class="muted json-key-nav-empty">No JSON keys — run Analyze first.</p>';
    return keys.map(({ key, line }) =>
      `<button type="button" class="json-key-chip${activeKey === key ? ' active' : ''}" data-json-line="${line}" data-json-key="${esc(key)}">${esc(key)}</button>`,
    ).join('');
  }

  return {
    esc,
    fmtNum,
    fmtPct,
    fmtDate,
    fmtDateWithAge,
    formatAge,
    renderThinkingCard,
    renderRiskPanel,
    renderComparison,
    renderMomentumChecklist,
    renderValueChecklist,
    renderIndicators,
    renderBusiness,
    renderTickerNews,
    renderTickerNewsTeaser,
    renderGlossary,
    renderLearnPanel,
    renderBriefing,
    renderHome,
    renderPortfolioTable,
    renderDiscoverResults,
    renderAnalytics,
    isStale,
    computeJsonFreshness,
    renderJsonProvenance,
    renderCategoryBars,
    getFullIngestCommand,
    renderTickerCommandsQuick,
    renderTickerCommandsFull,
    buildJsonKeyIndex,
    renderJsonKeyNav,
  };
})();
