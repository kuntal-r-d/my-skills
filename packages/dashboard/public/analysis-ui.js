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

  function renderRiskPriceRow(km, labelPrefix = '') {
    return `
        <div class="price-row">
          <div class="price-card"><div class="label">${labelPrefix}Buy zone</div><div class="value">৳${fmtNum(km.buy_zone_low)} – ৳${fmtNum(km.buy_zone_high)}</div></div>
          <div class="price-card stop"><div class="label">${labelPrefix}Stop-loss</div><div class="value">৳${fmtNum(km.stop_loss)}</div></div>
          <div class="price-card target"><div class="label">${labelPrefix}Target</div><div class="value">৳${fmtNum(km.target)}</div></div>
          <div class="price-card"><div class="label">${labelPrefix}Position size</div><div class="value">৳${fmtNum(km.position_value_bdt, 0)}</div><div class="muted">${fmtNum(km.suggested_shares, 0)} shares · ${fmtPct(km.pct_of_capital)} cap</div></div>
        </div>`;
  }

  function renderStructureLevelCard(label, value, extraClass, hint) {
    const display = value != null && value !== '' ? `৳${fmtNum(value)}` : '—';
    const hintHtml = hint ? `<div class="muted structure-card-hint">${hint}</div>` : '';
    return `<div class="price-card ${extraClass}"><div class="label">${label}</div><div class="value">${display}</div>${hintHtml}</div>`;
  }

  function renderStructureStrategyCards(km) {
    return `
        <div class="price-row structure-strategy-cards">
          <div class="price-card"><div class="label">Buy zone</div><div class="value">৳${fmtNum(km.buy_zone_low)} – ৳${fmtNum(km.buy_zone_high)}</div></div>
          <div class="price-card stop"><div class="label">Stop-loss</div><div class="value">৳${fmtNum(km.stop_loss)}</div></div>
          <div class="price-card target"><div class="label">Target</div><div class="value">৳${fmtNum(km.target)}</div></div>
          <div class="price-card"><div class="label">Position size</div><div class="value">৳${fmtNum(km.position_value_bdt, 0)}</div><div class="muted">${fmtNum(km.suggested_shares, 0)} shares · ${fmtPct(km.pct_of_capital)} cap</div></div>
          ${renderStructureLevelCard('Support', km.support, 'support', 'Nearest floor')}
          ${renderStructureLevelCard('Next support', km.next_support, 'support next', 'If support breaks')}
          ${renderStructureLevelCard('Resistance', km.resistance, 'resistance', 'Nearest ceiling')}
          ${renderStructureLevelCard('Next resistance', km.next_resistance, 'resistance next', 'If resistance clears')}
        </div>`;
  }

  function renderRiskPanel(risk, analysis) {
    if (!risk || risk.error) {
      const detail = risk?.error ? ` — ${esc(String(risk.error))}` : '';
      return `<p class="muted">${esc(risk?.error ?? 'Risk analysis unavailable')}${detail}</p>`;
    }
    const km = risk.key_metrics ?? {};
    const gates = risk.gates ?? {};
    const structure = risk.strategies?.structure;
    const structKm = structure?.key_metrics ?? {};
    const structureMissing = !structure?.key_metrics;
    const enrichHint = analysis?.risk_enrich_skipped
      ? `<p class="muted risk-structure-missing">Could not add structure strategy: ${esc(String(analysis.risk_enrich_skipped))}. Run <code>npm run build -w @stock-buddy/skills</code> then restart the dashboard.</p>`
      : '';
    const gateRows = Object.entries(gates)
      .map(
        ([name, g]) =>
          `<tr><td>${esc(name)}</td><td><span class="badge ${g.pass ? 'ok' : 'fail'}">${g.pass ? 'PASS' : 'FAIL'}</span></td><td class="muted">${esc(g.detail ?? '')}</td></tr>`,
      )
      .join('');

    const structureBlock = structure && !structure.error
      ? `
        <h4>Structure strategy <span class="muted">(support / resistance)</span></h4>
        ${renderStructureStrategyCards(structKm)}
        <div class="meta-bar">Rating: <strong>${esc(structure.rating)}</strong> · R:R 1:${fmtNum(structKm.risk_reward)} ${confidenceBadge(structure.confidence)}</div>`
      : structureMissing
        ? '<p class="muted risk-structure-missing">Structure strategy not in this snapshot — click <strong>Analyze Full</strong> to refresh. If it persists, rebuild skills: <code>npm run build -w @stock-buddy/skills</code> and restart the dashboard (Docker: rebuild or use mounted <code>packages/*/dist</code> volumes).</p>'
        : '';

    return `
      <div class="risk-panel">
        ${enrichHint}
        <h4>ATR strategy <span class="muted">(default)</span></h4>
        ${renderRiskPriceRow(km)}
        <div class="meta-bar">Rating: <strong>${esc(risk.rating)}</strong> · R:R 1:${fmtNum(km.risk_reward)} · ATR ৳${fmtNum(km.atr)} ${confidenceBadge(risk.confidence)}</div>
        ${structureBlock}
        <h4>Risk gates <span class="muted">(ATR strategy)</span></h4>
        <div class="table-wrap"><table><tr><th>Gate</th><th>Status</th><th>Detail</th></tr>${gateRows}</table></div>
        ${structure && !structure.error ? `<p class="muted">Structure gates: <strong>${esc(structure.rating)}</strong> — see <code>risk.strategies.structure</code> in Developer JSON.</p>` : ''}
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

  function criterionVerdictText(passed) {
    if (passed === true) return 'Passes this check.';
    if (passed === false) return 'Does not pass yet.';
    return 'Waiting on data — not scored in GPA.';
  }

  function renderCriterionBody(c) {
    const levels = c.levels ?? {};
    const simple = levels.simple ?? c.explanation;
    const example = levels.example ?? '';
    const bangla = levels.bangla ?? '';
    const target = levels.target ?? c.label;
    const dataLine =
      levels.dataLine ??
      (Array.isArray(c.missing_fields) && c.missing_fields.length
        ? `Waiting on: ${c.missing_fields.join(', ')}. Run fundamentals ingest or add via research.`
        : null) ??
      formatCriterionSummaryValue(c) ??
      (c.passed == null ? 'Data not available for this check yet.' : '—');
    const verdict = criterionVerdictText(c.passed);

    return `
      <div class="criterion-edu">
        <dl class="criterion-facts">
          <div class="criterion-fact">
            <dt>Target</dt>
            <dd>${esc(target)}</dd>
          </div>
          <div class="criterion-fact">
            <dt>This stock</dt>
            <dd class="${c.passed == null && !levels.formattedValue ? 'criterion-missing' : ''}">${esc(dataLine)}</dd>
          </div>
          <div class="criterion-fact">
            <dt>Result</dt>
            <dd class="criterion-verdict ${criterionClass(c.passed)}">${esc(verdict)}</dd>
          </div>
        </dl>
        <p class="criterion-simple"><strong>What it means:</strong> ${esc(simple)}</p>
        ${example ? `<p class="criterion-example"><strong>Example:</strong> ${esc(example)}</p>` : ''}
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
        <article class="criterion ${criterionClass(c.passed)}">
          <header class="criterion-head">
            <span class="c-icon" aria-hidden="true">${criterionIcon(c.passed)}</span>
            <strong class="criterion-title">${esc(c.label)}</strong>
            ${summaryVal ? `<span class="criterion-inline-data">${esc(summaryVal)}</span>` : ''}
          </header>
          ${renderCriterionBody(c)}
        </article>`;
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
        <p><strong>Momentum checklist</strong> — Each row shows the target, calculated values for this stock, pass/fail, and what it means for short-term trend trading.</p>
        <p class="checklist-intro-bn" lang="bn">প্রতিটি সারিতে লক্ষ্য, এই স্টকের সংখ্যা, ফলাফল ও সহজ ব্যাখ্যা — একা কেনার সংকেত নয়।</p>
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
        <p><strong>Investment checklist</strong> — Long-term quality: each row shows the <em>target</em>, <em>this stock's data</em>, <em>pass/fail</em>, and a plain-language explanation (English + Bangla where available).</p>
        <p class="checklist-intro-bn" lang="bn">দীর্ঘমেয়াদি বিনিয়োগ: প্রতিটি সারিতে লক্ষ্য, স্টকের ডেটা, ফলাফল ও সহজ ব্যাখ্যা দেখুন। ⏳ = ডেটা এখনো নেই, GPA-তে গণনা হয় না।</p>
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
        <pre class="cmd-snippet">npm run ingest:daily
npm run ingest -- --ticker ${esc(sym)} --job all
npm run ingest -- --ticker ${esc(sym)} --job news</pre>
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
      : `<p class="data-warnings">⚠ Fundamentals not in database. Run <code>${esc(getFullIngestCommand(ticker?.symbol))}</code> or <code>npm run ingest:watchlist</code> for all watchlist names.</p>`;
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

  function formatBriefingInline(text) {
    if (text == null) return '';
    return String(text)
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part) => {
        if (part.startsWith('**') && part.endsWith('**')) return `<strong>${esc(part.slice(2, -2))}</strong>`;
        return esc(part);
      })
      .join('');
  }

  function regimeTone(rating) {
    const r = String(rating ?? '').toLowerCase();
    if (r === 'risk_on') return 'good';
    if (r === 'risk_off' || r === 'cautious') return 'bad';
    return 'neutral';
  }

  function briefingKpiChip(label, value, tone) {
    const cls = tone ? ` briefing-kpi-${tone}` : '';
    return `<span class="briefing-kpi${cls}"><span class="briefing-kpi-val">${esc(String(value))}</span><span class="briefing-kpi-label">${esc(label)}</span></span>`;
  }

  function renderBriefingList(lines) {
    if (!lines?.length) return '<p class="muted briefing-empty">Nothing to report.</p>';
    let html = '<ul class="briefing-list">';
    for (const line of lines) {
      const raw = String(line);
      if (raw.startsWith('**') && raw.endsWith('**') && !raw.slice(2, -2).includes('**')) {
        html += `<li class="briefing-subhead">${formatBriefingInline(raw)}</li>`;
        continue;
      }
      if (raw === '') continue;
      html += `<li>${formatBriefingInline(raw.replace(/^-\s*/, ''))}</li>`;
    }
    return `${html}</ul>`;
  }

  function renderBriefingCard(title, section, { alert = false, compact = false } = {}) {
    const lines = section?.lines ?? (section?.line ? [section.line] : []);
    if (compact && !lines.length) return '';
    return `
      <article class="briefing-card${alert ? ' briefing-card-alert' : ''}">
        <header class="briefing-card-head">
          <h4>${esc(title)}</h4>
        </header>
        <div class="briefing-card-body">${renderBriefingList(lines)}</div>
      </article>`;
  }

  function renderBriefing(briefing, { compact = false } = {}) {
    if (!briefing?.sections && !briefing?.markdown) {
      return '<p class="muted">Briefing unavailable — run npm run ingest:daily, then Refresh.</p>';
    }

    const sections = briefing.sections ?? {};
    const counts = briefing.item_counts ?? {};
    const regimeMeta = sections.market_regime?.meta ?? {};
    const rating = regimeMeta.rating ?? 'unknown';
    const tone = regimeTone(rating);
    const flags = briefing.flags ?? [];

    const hero = `
      <div class="briefing-hero briefing-hero-${tone}">
        <div class="briefing-hero-main">
          <div class="briefing-hero-label">Market regime</div>
          <div class="briefing-hero-rating">${esc(String(rating).replace(/_/g, ' '))}</div>
          ${regimeMeta.risk_multiplier != null ? `<div class="briefing-hero-meta">Risk multiplier ${esc(String(regimeMeta.risk_multiplier))}</div>` : ''}
        </div>
        ${sections.market_regime?.line ? `<p class="briefing-hero-copy">${formatBriefingInline(sections.market_regime.line)}</p>` : ''}
      </div>`;

    const kpis = `
      <div class="briefing-kpis">
        ${briefingKpiChip('Near levels', (counts.positions_near_level ?? 0) + (counts.watchlist_near_entry ?? 0), (counts.positions_near_level ?? 0) + (counts.watchlist_near_entry ?? 0) ? 'warn' : '')}
        ${briefingKpiChip('Risk items', counts.risk_items ?? 0, counts.risk_items ? 'warn' : '')}
        ${briefingKpiChip('News', counts.news ?? 0, '')}
        ${briefingKpiChip('Events today', counts.events_today ?? 0, '')}
      </div>`;

    const flagHtml = flags.length
      ? `<div class="briefing-flags">${flags.map((f) => `<span class="briefing-flag">${esc(String(f).replace(/_/g, ' '))}</span>`).join('')}</div>`
      : '';

    const summary = briefing.summary
      ? `<p class="briefing-summary">${formatBriefingInline(briefing.summary)}</p>`
      : '';

    const cards = [
      renderBriefingCard('Positions near stop / target', sections.positions_near_levels, { alert: counts.positions_near_level > 0, compact }),
      renderBriefingCard('Watchlist near entry', sections.watchlist_near_entry, { alert: counts.watchlist_near_entry > 0, compact }),
      renderBriefingCard('Risk items', sections.risk_items, { alert: counts.risk_items > 0, compact: false }),
      ...(compact ? [] : [
        renderBriefingCard('Overnight news & disclosures', sections.overnight_news, { compact }),
        renderBriefingCard('Calendar today', sections.calendar_today, { compact }),
        renderBriefingCard('Portfolio & watchlist signals', sections.signal_summary, { compact }),
      ]),
    ].filter(Boolean);

    if (compact) {
      const compactCards = cards.slice(0, 2).filter(Boolean);
      return `
        <div class="briefing-view briefing-view-compact">
          ${hero}
          ${summary}
          ${kpis}
          <div class="briefing-grid briefing-grid-compact">${compactCards.join('')}</div>
          ${flagHtml}
        </div>`;
    }

    return `
      <div class="briefing-view">
        ${hero}
        ${summary}
        ${kpis}
        ${flagHtml}
        <div class="briefing-grid">${cards.join('')}</div>
      </div>`;
  }

  function roc1mCell(pct) {
    if (pct == null || Number.isNaN(pct)) return '—';
    const n = Number(pct);
    return `<span class="${n >= 0 ? 'pos' : 'neg'}">${fmtPct(n)}</span>`;
  }

  function formatSignalRating(rating) {
    if (!rating) return '—';
    return String(rating)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function ratingClass(rating) {
    if (!rating) return '';
    const r = String(rating).toLowerCase();
    if (r.includes('strong_buy') || r === 'buy') return 'rating-buy';
    if (r.includes('sell')) return 'rating-sell';
    if (r === 'stand_aside' || r === 'suppressed') return 'rating-warn';
    return 'rating-hold';
  }

  function renderSignalRatingCell(rating, score) {
    if (!rating && score == null) return '—';
    const label = formatSignalRating(rating);
    const scoreTxt = score != null ? `<span class="muted">${score}/10</span>` : '';
    return `<span class="signal-rating ${ratingClass(rating)}">${esc(label)}</span>${scoreTxt ? ` ${scoreTxt}` : ''}`;
  }

  function renderWatchlistTable(items) {
    if (!items?.length) return '<p class="muted">No symbols yet — add one above.</p>';

    const sorted = [...items].sort((a, b) => a.symbol.localeCompare(b.symbol));
    let html = '<div class="table-wrap"><table class="watchlist-table"><tr>'
      + '<th>Symbol</th><th>Sector</th><th>Investment</th><th>Momentum</th><th></th></tr>';

    for (const w of sorted) {
      const sym = `<span class="clickable" data-symbol="${esc(w.symbol)}">${esc(w.symbol)}</span>`;
      const meta = w.name ? `<div class="muted watch-name">${esc(w.name)}</div>` : '';
      html += `<tr>
        <td>${sym}${meta}</td>
        <td class="muted">${esc(w.sector ?? '—')}</td>
        <td>${renderSignalRatingCell(w.investment_rating, w.investment_score)}</td>
        <td>${renderSignalRatingCell(w.momentum_rating, w.momentum_score)}</td>
        <td><button type="button" class="btn-sm rm-watch" data-symbol="${esc(w.symbol)}" data-purpose="${esc(w.purpose)}" title="Remove">Remove</button></td>
      </tr>`;
    }
    return html + '</table></div>';
  }

  function renderPortfolioTable(positions, { compact = false, purpose = 'investment' } = {}) {
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
        : [sym, fmtNum(p.qty, 0), fmtNum(p.avg_cost), roc1mCell(p.roc_1m_pct), fmtNum(p.last_close), esc(p.sector ?? '—'), pnlCell, p.investment_score ?? '—', p.momentum_score ?? '—', esc(p.risk_rating ?? '—'), `<button type="button" class="btn-sm del-pos" data-symbol="${esc(p.ticker)}" data-purpose="${esc(purpose)}">×</button>`];
      html += `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    }
    return html + '</table>';
  }

  function renderPortfolioSummary(portfolio) {
    const mirrored = portfolio?.mirrored_from_investment;
    if (!portfolio?.positions?.length) {
      return `<span class="muted">${portfolio?.purpose === 'trading' ? 'No trading positions.' : 'No investment positions.'}</span>`;
    }
    const totalPnl = portfolio.positions.reduce((s, p) => s + (p.pnl ?? 0), 0);
    const line = `Cost ৳${fmtNum(portfolio.total_cost_basis, 0)} · Unrealized P&amp;L ৳${fmtNum(totalPnl, 0)} · ${portfolio.positions.length} positions`;
    if (mirrored) {
      return `${line} · <span class="muted">Showing investment holdings until you split or add trading positions</span>`;
    }
    return line;
  }

  function renderTradingMirrorBanner(mirrored) {
    if (!mirrored) return '';
    return `<div class="portfolio-mirror-banner">Showing your investment holdings with momentum risk levels. Use <strong>Copy to momentum trading</strong> to maintain a separate trading book, or add positions below.</div>`;
  }

  function riskTipPopup(lines) {
    const body = lines.map((l) => `<div class="risk-tip-line">${l}</div>`).join('');
    return `<span class="risk-level-tip-popup" role="tooltip">${body}</span>`;
  }

  function riskTipCell(display, lines) {
    if (!display || display === '—') return '—';
    return `<span class="risk-level-tip" tabindex="0">${display}${riskTipPopup(lines)}</span>`;
  }

  function riskZoneDisplay(km) {
    if (km?.buy_zone_low != null && km?.buy_zone_high != null) {
      return `৳${fmtNum(km.buy_zone_low)} – ৳${fmtNum(km.buy_zone_high)}`;
    }
    return null;
  }

  function renderDualRiskStack(atrDisplay, structDisplay, atrLines, structLines) {
    const rows = [];
    if (atrDisplay && atrDisplay !== '—') {
      rows.push(`<div class="risk-dual-row"><span class="risk-dual-label">ATR</span>${riskTipCell(atrDisplay, atrLines)}</div>`);
    }
    if (structDisplay && structDisplay !== '—') {
      rows.push(`<div class="risk-dual-row"><span class="risk-dual-label">Struct</span>${riskTipCell(structDisplay, structLines)}</div>`);
    }
    if (!rows.length) return '—';
    return `<div class="risk-dual-cell">${rows.join('')}</div>`;
  }

  function momentumRiskCells(p) {
    const atr = p.risk ?? {};
    const struct = p.risk?.structure ?? {};
    const entry = atr.entry ?? p.last_close;
    const hasAtrLevels = atr.atr != null && entry != null;
    const analysisFooter = '<span class="muted">risk-manager · latest analysis snapshot</span>';
    const atrBase = hasAtrLevels
      ? [
          `<strong>Entry</strong> ৳${fmtNum(entry)} <span class="muted">(last close)</span>`,
          `<strong>ATR(14)</strong> ৳${fmtNum(atr.atr)}`,
        ]
      : [];
    const structBase = struct.support != null
      ? [
          `<strong>Support</strong> ৳${fmtNum(struct.support)}`,
          struct.next_support != null ? `<strong>Next support</strong> ৳${fmtNum(struct.next_support)}` : '',
          `<strong>Resistance</strong> ৳${fmtNum(struct.resistance)}`,
          struct.next_resistance != null ? `<strong>Next resistance</strong> ৳${fmtNum(struct.next_resistance)}` : '',
          struct.entry != null ? `<strong>Entry</strong> ৳${fmtNum(struct.entry)} <span class="muted">(buy-zone high)</span>` : '',
        ].filter(Boolean)
      : [];

    const buyZone = renderDualRiskStack(
      riskZoneDisplay(atr),
      riskZoneDisplay(struct),
      [...atrBase, '<strong>Formula</strong> entry − 0.25×ATR … entry', '<span class="muted">Pullback band from last close.</span>', analysisFooter],
      [...structBase, '<strong>Formula</strong> pullback to 60-bar support', analysisFooter],
    );

    const stopDisplay = atr.stop_loss != null ? `৳${fmtNum(atr.stop_loss)}` : (p.stop_level != null ? `৳${fmtNum(p.stop_level)}` : null);
    const structStopDisplay = struct.stop_loss != null ? `৳${fmtNum(struct.stop_loss)}` : null;
    const stop = renderDualRiskStack(
      stopDisplay,
      structStopDisplay,
      [...atrBase, '<strong>Formula</strong> entry − 2×ATR', analysisFooter],
      [...structBase, '<strong>Formula</strong> support − 0.5×ATR', analysisFooter],
    );

    const targetDisplay = atr.target != null ? `৳${fmtNum(atr.target)}` : (p.target_level != null ? `৳${fmtNum(p.target_level)}` : null);
    const structTargetDisplay = struct.target != null ? `৳${fmtNum(struct.target)}` : null;
    const target = renderDualRiskStack(
      targetDisplay,
      structTargetDisplay,
      [...atrBase, '<strong>Formula</strong> entry + 3×ATR', analysisFooter],
      [...structBase, '<strong>Formula</strong> resistance or min 1.5:1 R:R', analysisFooter],
    );

    const sizeDisplay = atr.position_value_bdt != null ? `৳${fmtNum(atr.position_value_bdt, 0)}` : (p.market_value != null ? `৳${fmtNum(p.market_value, 0)}` : null);
    const structSizeDisplay = struct.position_value_bdt != null ? `৳${fmtNum(struct.position_value_bdt, 0)}` : null;
    const size = renderDualRiskStack(
      sizeDisplay,
      structSizeDisplay,
      [...atrBase, '<strong>Size</strong> from 1% risk / stop distance + caps', analysisFooter],
      [...structBase, '<strong>Size</strong> from structure stop distance + caps', analysisFooter],
    );

    return { buyZone, stop, target, size, hasStructure: Boolean(struct.stop_loss) };
  }

  function renderMomentumPortfolioTable(positions, { compact = false, purpose = 'trading', showActions = !compact } = {}) {
    if (!positions?.length) {
      return '<p class="muted">No open trading positions.</p>';
    }

    const sorted = [...positions].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
    const headers = compact
      ? ['Symbol', 'Qty', 'Last', 'P&amp;L %', 'Buy zone', 'Stop-loss', 'Target', 'Position size']
      : ['Ticker', 'Qty', 'Avg', 'Last', 'Sector', 'P&amp;L', 'Buy zone', 'Stop-loss', 'Target', 'Position size', 'Mom', 'Risk', ''];
    if (showActions && !headers.includes('')) headers.push('');

    let html = `<table class="momentum-portfolio-table"><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    let anyMissingStructure = false;
    for (const p of sorted) {
      const sym = `<span class="clickable" data-symbol="${esc(p.ticker)}">${esc(p.ticker)}</span>`;
      const risk = momentumRiskCells(p);
      if (!risk.hasStructure) anyMissingStructure = true;
      const pnlCell = compact
        ? (p.pnl_pct != null ? `<span class="${p.pnl_pct >= 0 ? 'pos' : 'neg'}">${fmtPct(p.pnl_pct)}</span>` : '—')
        : (p.pnl != null ? `৳${fmtNum(p.pnl, 0)} (${fmtPct(p.pnl_pct)})` : '—');
      const cells = compact
        ? [sym, fmtNum(p.qty, 0), fmtNum(p.last_close), pnlCell, risk.buyZone, risk.stop, risk.target, risk.size]
        : [sym, fmtNum(p.qty, 0), fmtNum(p.avg_cost), fmtNum(p.last_close), esc(p.sector ?? '—'), pnlCell, risk.buyZone, risk.stop, risk.target, risk.size, p.momentum_score ?? '—', esc(p.risk_rating ?? '—')];
      if (showActions) {
        cells.push(`<button type="button" class="btn-sm del-pos" data-symbol="${esc(p.ticker)}" data-purpose="${esc(purpose)}">×</button>`);
      }
      html += `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    }
    const structureNote = anyMissingStructure
      ? '<p class="muted portfolio-structure-hint">Struct rows appear after <strong>Analyze Full</strong> on each symbol (snapshots before dual-strategy risk-manager show ATR only).</p>'
      : '<p class="muted portfolio-structure-hint">Each level shows <span class="risk-dual-label">ATR</span> and <span class="risk-dual-label">Struct</span> — hover for formulas.</p>';
    return structureNote + html + '</table>';
  }

  function renderHomePortfolio(portfolios) {
    const investment = portfolios?.investment;
    const trading = portfolios?.trading;
    const account = investment?.account ?? trading?.account;

    if (!account) {
      return {
        account: '<p class="muted">No portfolio yet — add positions on the Portfolio tab or run <code>npm run db:seed</code>.</p>',
        investmentSummary: '',
        investmentTable: '',
        tradingSummary: '',
        tradingTable: '',
        tradingMirrorBanner: '',
      };
    }

    return {
      account: `Account <strong>${esc(account.label)}</strong> · Capital ৳${fmtNum(account.capital_bdt, 0)}`,
      investmentSummary: renderPortfolioSummary(investment),
      investmentTable: renderPortfolioTable(investment?.positions, { compact: true, purpose: 'investment' }),
      tradingSummary: renderPortfolioSummary(trading),
      tradingMirrorBanner: renderTradingMirrorBanner(trading?.mirrored_from_investment),
      tradingTable: renderMomentumPortfolioTable(trading?.positions, {
        compact: true,
        purpose: 'trading',
        showActions: !trading?.mirrored_from_investment,
      }),
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
      return '<p class="muted">No ranked news yet — run <code>npm run ingest:daily</code> or <code>npm run ingest:news</code>, then refresh.</p>';
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
    return {
      briefing: renderBriefing(data.briefing, { compact: true }),
      importantNews: renderHomeImportantNews(data.importantNews),
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
      issues.push(`Analysis run is ${formatAge(createdAt)} (${fmtDate(createdAt)}) — run npm run ingest:daily, then Analyze.`);
    } else if (runAge > 24 * 3600000) {
      bump('aging');
      issues.push(`Analysis run is ${formatAge(createdAt)} (${fmtDate(createdAt)}) — may not reflect the latest session.`);
    }

    if (!latestBar) {
      bump('stale');
      issues.push('No price bars in database — run `npm run ingest:daily`, then full ingest for this ticker if daily reported 0 OHLCV rows.');
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

  function renderAnalysisDataBar(meta, analysis, tickerData) {
    const ohlcv = tickerData?.ohlcv ?? [];
    const latestBar = ohlcv.length ? ohlcv[ohlcv.length - 1]?.date : null;
    const fundAsOf = tickerData?.fundamentals?.as_of ?? null;
    const analysisAsOf = analysis?.as_of ?? meta?.as_of ?? null;
    const analysisRun = meta?.created_at ?? null;
    const sym = tickerData?.ticker?.symbol;

    if (!sym && !latestBar && !fundAsOf && !analysisAsOf) {
      return '<p class="muted analysis-data-empty">Load a ticker to see data dates.</p>';
    }

    const report = analysis && tickerData ? computeJsonFreshness(meta, analysis, tickerData) : null;
    const tone = report?.level ?? (latestBar ? 'aging' : 'missing');

    function chip(label, value, sub) {
      const missing = !value || value === '—';
      return `<div class="data-date-chip${missing ? ' data-date-missing' : ''}">
        <span class="data-date-label">${esc(label)}</span>
        <span class="data-date-val">${missing ? '—' : esc(value)}</span>
        ${sub ? `<span class="data-date-sub">${esc(sub)}</span>` : ''}
      </div>`;
    }

    const runSub = analysisRun ? fmtDateWithAge(analysisRun) : '';

    return `
      <div class="analysis-data-bar-inner freshness-${tone}">
        ${chip('Latest price', latestBar ? fmtDate(latestBar, { dateOnly: true }) : null, latestBar ? 'DSE daily bar' : 'Run ingest:daily')}
        ${chip('Fundamentals', fundAsOf ? fmtDate(fundAsOf, { dateOnly: !hasTimeComponent(String(fundAsOf)) }) : null, fundAsOf && tickerData?.fundamentals?.source ? String(tickerData.fundamentals.source) : '')}
        ${chip('Analysis', analysisAsOf ? fmtDate(analysisAsOf, { dateOnly: !hasTimeComponent(String(analysisAsOf)) }) : null, analysisRun ? `Snapshot ${runSub}` : (analysis ? '' : 'Run Analyze'))}
        ${report ? `<span class="data-freshness-pill freshness-${tone}">${esc(report.label)}</span>` : ''}
      </div>`;
  }

  function renderJsonProvenance(meta, analysis, tickerData) {
    const report = computeJsonFreshness(meta, analysis, tickerData);
    const ohlcv = tickerData?.ohlcv ?? [];
    const latestBar = ohlcv.length ? ohlcv[ohlcv.length - 1]?.date : null;
    const fundAsOf = tickerData?.fundamentals?.as_of ?? null;
    const mode = analysis?.analysis_mode ?? '—';
    const hasStructure = Boolean(analysis?.risk?.strategies?.structure?.key_metrics);
    const rows = [
      ['Snapshot', meta?.id != null ? `#${meta.id}` : '—'],
      ['Analysis run', meta?.created_at ? fmtDateWithAge(meta.created_at) : '—'],
      ['Data as_of', analysis?.as_of ? fmtDate(analysis.as_of, { dateOnly: !hasTimeComponent(String(analysis.as_of)) }) : '—'],
      ['Analysis mode', mode],
      ['Structure strategy', hasStructure ? 'Present (risk.strategies.structure)' : 'Missing — re-run Analyze Full'],
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

    const structureNav = hasStructure
      ? '<p class="muted json-structure-hint">Structure levels: use the <strong>risk.strategies.structure</strong> chip below, or expand <code>risk</code> → <code>strategies</code> → <code>structure</code> in the JSON.</p>'
      : '<p class="muted json-structure-hint warn">No <code>risk.strategies.structure</code> in this snapshot. Click <strong>Analyze Full</strong> on the Analysis tab to regenerate.</p>';

    return `
      <div class="json-provenance-head">
        <span class="json-freshness-badge inline ${report.level}">${esc(report.label)}</span>
        <p class="json-provenance-hint muted">Compare <strong>Analysis run</strong> (when skills ran) vs <strong>Latest price bar</strong> / <strong>Fundamentals as_of</strong> (what was in Postgres). Times are shown in <strong>BDT (Asia/Dhaka)</strong>. Large gaps mean backdated output.</p>
        ${structureNav}
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
    let cmd = `npm run ingest:one -- --ticker ${sym} --job ${job}`;
    if (days != null) cmd += ` --days ${days}`;
    return cmd;
  }

  const REPO_ROOT_NOTE =
    'Run from the repo root (the folder containing package.json), e.g. cd ~/Developer/stock-buddy-skill-mcp/stock-buddy';

  const INGEST_SHORTCUTS_NOTE =
    'Shortcuts: npm run ingest:daily · ingest:macro · ingest:news · ingest:watchlist. '
    + 'Per-ticker full ingest: npm run ingest:one -- --ticker SYMBOL --job all --days 365 (compiled node; less likely to trip AV than tsx). '
    + 'OHLCV order: dsebd.org archive → StockAnalysis → Yahoo. '
    + 'If ingest:daily reports 0 OHLCV rows for a symbol, run full per-ticker ingest (--job all). '
    + 'Security software may flag ingest (many HTTP fetches + DSE TLS workaround) — allow/whitelist this repo or run inside Docker.';

  function analyzeCurl(symbol, mode) {
    const sym = String(symbol ?? 'LHB').toUpperCase();
    const body = JSON.stringify({ mode, client_id: 'cli' });
    return `curl -s -X POST http://localhost:3000/api/tickers/${sym}/analyze -H "Content-Type: application/json" -d '${body}'`;
  }

  const WORKFLOW_COMMANDS = [
    {
      id: 'wf-cd',
      label: '0. Go to repo root',
      description: REPO_ROOT_NOTE,
      command: () => 'cd ~/Developer/stock-buddy-skill-mcp/stock-buddy',
    },
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
      id: 'wf-daily',
      label: '4. Daily pre-market refresh',
      description: 'Macro + market news + OHLCV for portfolio and watchlist (dsebd.org → StockAnalysis → Yahoo). Check output for symbols with 0 rows.',
      command: () => 'npm run ingest:daily',
    },
    {
      id: 'wf-news-market',
      label: '5. Market news (newspapers + web)',
      description: 'TBS, Tribune, Daily Star, Prothom Alo, FE, Google News EN/BN — tags headlines to tickers.',
      command: () => 'npm run ingest:news',
    },
    {
      id: 'wf-watchlist',
      label: '6. Watchlist full ingest',
      description: 'For each watchlist symbol: OHLCV, fundamentals, shareholding, DSE news, analysis snapshot.',
      command: () => 'npm run ingest:watchlist',
    },
    {
      id: 'wf-retag',
      label: '7. Retag Bengali / untagged news',
      description: 'Re-apply ticker matching on news already in DB (no new fetch).',
      command: () => 'npm run ingest -- --job retag-news',
    },
    {
      id: 'wf-dashboard',
      label: '8. Start dashboard',
      description: 'Web UI on port 3000 — reads Postgres only, does not scrape.',
      command: () => 'npm run dashboard',
    },
  ];

  const TICKER_COMMANDS = [
    {
      id: 'ingest-all',
      group: 'Per-ticker pipeline',
      label: 'Full ingest + analyze',
      description: 'OHLCV → fundamentals → shareholding → DSE news → analysis. Use when ingest:daily shows 0 OHLCV rows for this symbol, or for a new ticker.',
      command: (sym) => ingestCmd(sym, 'all', 365),
      quick: true,
    },
    {
      id: 'ingest-ohlcv-365',
      group: 'Per-ticker ingest',
      label: 'OHLCV (1 year)',
      description: 'Daily bars from dsebd.org archive, StockAnalysis, Yahoo — picks the longest clean series.',
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
      description: 'Read Postgres → run skills → save analysis_snapshots (same as Analyze Full button).',
      command: (sym) => `npm run ingest:analysis -- --ticker ${String(sym ?? 'LHB').toUpperCase()}`,
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
      id: 'ingest-daily',
      group: 'Market-wide ingest',
      label: 'Daily pre-market refresh',
      description: 'Macro + market news + OHLCV for portfolio and watchlist. Primary command before the Briefing tab. Warns if any symbol gets 0 OHLCV rows.',
      command: () => 'npm run ingest:daily',
      quick: true,
    },
    {
      id: 'ingest-news-market',
      group: 'Market-wide ingest',
      label: 'Market news (newspapers + web)',
      description: 'Fetch RSS/HTML from TBS, Tribune, Daily Star, Prothom Alo, FE, Google News — tag tickers → news_items.',
      command: () => 'npm run ingest:news',
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
      description: 'Policy rate, FX, inflation seed data → macro_snapshots (included in ingest:daily).',
      command: () => 'npm run ingest:macro',
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
      description: 'Full ingest for every watchlist symbol — fundamentals, shareholding, analysis. Weekly catch-up.',
      command: () => 'npm run ingest:watchlist',
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

  const DAILY_COMMAND_SECTIONS = [
    {
      id: 'schedule',
      title: 'What runs automatically',
      note: 'The ingest-worker runs ingest:daily every 24h while Docker is up. OHLCV is fetched from dsebd.org (not dsebd.com.bd), then StockAnalysis and Yahoo as fallbacks. If your PC is off, cd to the repo root and run npm run ingest:daily when you return.',
      schedule: [
        ['Every 24 hours', 'npm run ingest:daily — macro, news, OHLCV for portfolio + watchlist'],
        ['Every 7 days', 'npm run ingest:watchlist — full fundamentals, shareholding, news, analysis'],
        ['0 OHLCV rows', 'npm run ingest:one -- --ticker SYMBOL --job all — full ingest for that symbol (use ingest:one if AV blocks tsx)'],
      ],
      commands: [],
    },
    {
      id: 'set-once',
      title: 'Set once — keep services running',
      note: 'Run from the repo root after install or reboot. Containers use restart: unless-stopped when Docker Desktop starts.',
      commands: [
        {
          id: 'daily-stack',
          label: 'Start database + automated ingest',
          description: 'Postgres plus ingest-worker (ingest:daily every 24h + weekly full watchlist). Minimum for hands-off updates.',
          command: () => 'docker compose up -d postgres ingest-worker',
          quick: true,
          badge: 'Once / after reboot',
        },
        {
          id: 'daily-mcp',
          label: 'Start MCP servers (Claude Code / Cursor)',
          description: 'Analysis MCP on :8080 and data MCP on :8081 — needed for agent workflows.',
          command: () => 'docker compose up -d stock-buddy-mcp stock-buddy-data-mcp',
          badge: 'Once / after reboot',
        },
        {
          id: 'daily-dashboard',
          label: 'Start dashboard (Docker)',
          description: 'Web UI on http://localhost:3000 — reads Postgres only.',
          command: () => 'docker compose up -d dashboard',
          badge: 'Once / after reboot',
        },
        {
          id: 'daily-dashboard-local',
          label: 'Start dashboard (local Node)',
          description: 'Alternative to Docker dashboard — requires DATABASE_URL in .env.',
          command: () => 'npm run dashboard',
          badge: 'Dev',
        },
        {
          id: 'daily-logs',
          label: 'Check ingest worker logs',
          description: 'Confirm daily OHLCV ran and row counts look sane.',
          command: () => 'docker compose logs ingest-worker --tail 50',
          quick: true,
          badge: 'Verify',
        },
        {
          id: 'daily-ps',
          label: 'Check container status',
          description: 'All services should show Up — especially ingest-worker and postgres.',
          command: () => 'docker compose ps',
          quick: true,
          badge: 'Verify',
        },
      ],
    },
    {
      id: 'optional-daily',
      title: 'Optional — same-day freshness',
      note: `${REPO_ROOT_NOTE}. Not required if ingest-worker is healthy. Use after market close for a fresh Briefing. Dashboard Refresh only reads DB — it does not scrape.`,
      commands: [
        {
          id: 'daily-ingest',
          label: 'Daily pre-market refresh',
          description: 'Macro + market news + OHLCV for portfolio and watchlist. End of run lists symbols with 0 rows — use full ingest for those.',
          command: () => 'npm run ingest:daily',
          quick: true,
          badge: 'Pre-market',
        },
        {
          id: 'daily-news',
          label: 'Market news only',
          description: 'TBS, Tribune, Daily Star, Prothom Alo, FE, Google News — tags headlines to tickers.',
          command: () => 'npm run ingest:news',
          quick: true,
          badge: 'Optional daily',
        },
        {
          id: 'daily-macro',
          label: 'Macro snapshot only',
          description: 'Bangladesh Bank inflation scrape + seed defaults → macro_snapshots.',
          command: () => 'npm run ingest:macro',
          badge: 'Optional daily',
        },
        {
          id: 'daily-retag',
          label: 'Retag untagged news',
          description: 'Re-apply ticker matching on news already in Postgres (no new fetch).',
          command: () => 'npm run ingest -- --job retag-news',
          badge: 'Optional',
        },
        {
          id: 'daily-watchlist-manual',
          label: 'Full watchlist ingest (manual)',
          description: 'Same as the weekly scheduler job — use for catch-up after PC was off several days.',
          command: () => 'npm run ingest:watchlist',
          quick: true,
          badge: 'Catch-up',
        },
      ],
    },
    {
      id: 'one-time',
      title: 'One-time setup (new machine)',
      note: 'Only when installing Stock Buddy for the first time or resetting the database.',
      commands: [
        {
          id: 'setup-build',
          label: 'Build Docker images',
          command: () => 'docker compose build',
        },
        {
          id: 'setup-migrate',
          label: 'Apply database schema',
          command: () =>
            'docker compose run --rm -e DATABASE_URL=postgresql://stockbuddy:stockbuddy@postgres:5432/stockbuddy stock-buddy-mcp node packages/db/dist/migrate.js',
        },
        {
          id: 'setup-seed',
          label: 'Seed tickers, watchlist, portfolio shell',
          command: () =>
            'docker compose run --rm -e DATABASE_URL=postgresql://stockbuddy:stockbuddy@postgres:5432/stockbuddy stock-buddy-mcp node packages/db/dist/seed.js',
        },
        {
          id: 'setup-backfill',
          label: 'Initial watchlist backfill (1 year)',
          description: 'First load of OHLCV, fundamentals, shareholding, news, and analysis for every watchlist symbol.',
          command: () => 'npm run ingest:watchlist',
          quick: true,
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting ingest',
      note: INGEST_SHORTCUTS_NOTE,
      commands: [
        {
          id: 'fix-zero-ohlcv',
          label: 'Fix symbol with 0 OHLCV rows',
          description: 'Use when ingest:daily prints "No OHLCV for: SYMBOL". Verifies symbol on dsebd.org if all sources return empty.',
          command: (sym) => ingestCmd(sym ?? 'GP', 'all', 365),
          symbolPlaceholder: true,
          quick: true,
          badge: '0 rows',
        },
        {
          id: 'fix-ohlcv-only',
          label: 'OHLCV only (1 year)',
          description: 'Retry price bars without fundamentals — tries dsebd.org, StockAnalysis, Yahoo.',
          command: (sym) => ingestCmd(sym ?? 'GP', 'ohlcv', 365),
          symbolPlaceholder: true,
        },
        {
          id: 'rebuild-scraper',
          label: 'Rebuild scraper package',
          description: 'After pulling code changes to packages/scraper (e.g. DSE host fixes).',
          command: () => 'npm run build -w @stock-buddy/scraper',
        },
      ],
    },
    {
      id: 'new-ticker',
      title: 'When you add a ticker',
      note: 'Replace SYMBOL with the new DSE code after adding it to the watchlist in the Watchlist tab.',
      commands: [
        {
          id: 'new-ticker-all',
          label: 'Full ingest + analysis for one symbol',
          command: (sym) => ingestCmd(sym ?? 'GP', 'all', 365),
          symbolPlaceholder: true,
          quick: true,
        },
      ],
    },
  ];

  const MACRO_SOURCE_LABELS = {
    bangladesh_bank: 'Bangladesh Bank',
    seed: 'Seed defaults',
    manual: 'Manual',
  };

  const REGIME_META = {
    risk_on: { label: 'Risk-on', tone: 'good', hint: 'Macro backdrop supports risk appetite' },
    neutral: { label: 'Neutral', tone: 'neutral', hint: 'Mixed macro — size positions normally' },
    cautious: { label: 'Cautious', tone: 'mid', hint: 'Headwinds present — tighten risk budget' },
    risk_off: { label: 'Risk-off', tone: 'bad', hint: 'Strong macro headwinds — defensive stance' },
  };

  const QUALITATIVE_FACTORS = {
    reserves_trend: {
      label: 'Reserves trend',
      values: {
        rising: { label: 'Rising', tone: 'good' },
        stable: { label: 'Stable', tone: 'neutral' },
        falling: { label: 'Falling', tone: 'bad' },
      },
    },
    politics: {
      label: 'Politics',
      values: {
        stable: { label: 'Stable', tone: 'good' },
        tense: { label: 'Tense', tone: 'mid' },
        crisis: { label: 'Crisis', tone: 'bad' },
      },
    },
    regulatory: {
      label: 'Regulatory',
      values: {
        normal: { label: 'Normal', tone: 'good' },
        tightening: { label: 'Tightening', tone: 'mid' },
        floor_prices: { label: 'Floor prices', tone: 'bad' },
      },
    },
  };

  function macroSourceLabel(source) {
    if (!source) return '—';
    return MACRO_SOURCE_LABELS[source] ?? String(source).replace(/_/g, ' ');
  }

  function fmtMacroPct(n) {
    if (n == null || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    const pct = Math.abs(v) <= 1 ? v * 100 : v;
    return `${pct.toFixed(1)}%`;
  }

  function fmtMacroValue(key, value) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (Number.isNaN(n)) return esc(String(value));
    if (key === 'policy_rate' || key === 'inflation') return fmtMacroPct(n);
    if (key === 'fx_reserves_bn' || key === 'remittances_bn') return `$${fmtNum(n, 1)}B`;
    if (key === 'bdt_usd') return `৳${fmtNum(n, 2)}`;
    return fmtNum(n);
  }

  function assessMacroRegime(macro) {
    const flags = [];
    if (!macro || typeof macro !== 'object') {
      return { error: 'missing macro object' };
    }
    const m = macro;
    let mult = 1.0;
    const reasoning = [];
    const drivers = {};

    const rate = m.policy_rate;
    if (rate == null) {
      flags.push('stale_macro');
    } else {
      const r = Number(rate);
      let d;
      if (r >= 0.09) {
        d = -0.1;
        reasoning.push(`Policy rate ${fmtMacroPct(r)} — tight money raises cost of capital, risk-off pressure`);
      } else {
        d = 0.07;
        reasoning.push(`Policy rate ${fmtMacroPct(r)} — accommodative stance supports risk appetite`);
      }
      mult += d;
      drivers.policy_rate = Math.round(d * 1000) / 1000;
    }

    const infl = m.inflation;
    if (infl == null) {
      flags.push('stale_macro');
    } else {
      const i = Number(infl);
      let d;
      if (i > 0.08) {
        d = -0.1;
        reasoning.push(`Inflation ${fmtMacroPct(i)} — above 8% erodes real returns and invites tightening, risk-off`);
      } else {
        d = 0.05;
        reasoning.push(`Inflation ${fmtMacroPct(i)} — contained, supportive of equities`);
      }
      mult += d;
      drivers.inflation = Math.round(d * 1000) / 1000;
    }

    const trend = m.reserves_trend;
    if (trend == null) {
      flags.push('stale_macro');
    } else if (trend === 'falling') {
      const d = -0.12;
      reasoning.push('Reserves falling — import-cover stress and BDT pressure, strong risk-off pressure');
      mult += d;
      drivers.reserves_trend = Math.round(d * 1000) / 1000;
    } else if (trend === 'rising') {
      const d = 0.1;
      reasoning.push('Reserves rising — easing external pressure, risk-on');
      mult += d;
      drivers.reserves_trend = Math.round(d * 1000) / 1000;
    } else {
      reasoning.push('Reserves stable — neutral external backdrop');
      drivers.reserves_trend = 0.0;
    }

    const pol = m.politics;
    if (pol == null) {
      flags.push('stale_macro');
    } else if (pol === 'crisis') {
      const d = -0.2;
      reasoning.push('Political crisis — heightened uncertainty, sharp risk-off');
      mult += d;
      drivers.politics = Math.round(d * 1000) / 1000;
    } else if (pol === 'tense') {
      const d = -0.1;
      reasoning.push('Political tension — elevated headline risk, risk-off pressure');
      mult += d;
      drivers.politics = Math.round(d * 1000) / 1000;
    } else {
      const d = 0.05;
      reasoning.push('Politics stable — supportive backdrop');
      mult += d;
      drivers.politics = Math.round(d * 1000) / 1000;
    }

    const reg = m.regulatory;
    if (reg == null) {
      flags.push('stale_macro');
      reasoning.push('Regulatory stance unknown — assuming neutral');
    } else if (reg === 'floor_prices') {
      const d = -0.15;
      reasoning.push('Floor prices in force — broken price discovery and trapped liquidity, risk-off');
      mult += d;
      drivers.regulatory = Math.round(d * 1000) / 1000;
    } else if (reg === 'tightening') {
      const d = -0.08;
      reasoning.push('Regulatory tightening — added market friction, mild risk-off');
      mult += d;
      drivers.regulatory = Math.round(d * 1000) / 1000;
    } else {
      reasoning.push('Regulatory regime normal — no policy drag');
      drivers.regulatory = 0.0;
    }

    mult = Math.max(0.5, Math.min(1.2, mult));

    let regime;
    if (mult >= 1.05) regime = 'risk_on';
    else if (mult >= 0.85) regime = 'neutral';
    else if (mult >= 0.7) regime = 'cautious';
    else regime = 'risk_off';

    const score = Math.max(-1, Math.min(1, (mult - 1.0) / 0.2));
    const stale = flags.includes('stale_macro');
    let confidence = Math.max(0.2, Math.min(0.9, 0.85 - 0.12 * flags.filter((f) => f === 'stale_macro').length));
    if (stale) confidence = Math.max(0.2, Math.min(0.6, confidence));

    return {
      rating: regime,
      score: Math.round(score * 1000) / 1000,
      confidence: Math.round(confidence * 100) / 100,
      key_metrics: { risk_multiplier: Math.round(mult * 1000) / 1000, drivers },
      reasoning,
      flags,
    };
  }

  function renderMacroDriverBars(drivers) {
    const entries = Object.entries(drivers ?? {});
    if (!entries.length) return '';
    const maxAbs = Math.max(0.2, ...entries.map(([, v]) => Math.abs(Number(v))));
    const rows = entries.map(([key, val]) => {
      const n = Number(val);
      const pct = Math.min(100, (Math.abs(n) / maxAbs) * 100);
      const sign = n >= 0 ? '+' : '';
      const tone = n > 0 ? 'good' : n < 0 ? 'bad' : 'neutral';
      return `
        <div class="macro-driver">
          <div class="macro-driver-head">
            <span>${esc(key.replace(/_/g, ' '))}</span>
            <span class="macro-driver-val ${tone}">${sign}${n.toFixed(3)}</span>
          </div>
          <div class="progress-track macro-driver-track">
            <div class="progress-fill ${tone}" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');
    return `<div class="macro-drivers">${rows}</div>`;
  }

  function renderMacroPanel(macroSnap) {
    if (!macroSnap?.payload) {
      return `
        <div class="macro-empty">
          <p><strong>No macro snapshot in the database.</strong></p>
          <p class="muted">Run the macro ingest job to populate policy rate, inflation, FX reserves, and regime inputs.</p>
          <code class="macro-cmd">npm run ingest:macro</code>
          <span class="muted"> or <code>npm run ingest:daily</code> for full pre-market refresh</span>
        </div>`;
    }

    const payload = macroSnap.payload;
    const regime = assessMacroRegime(payload);
    const meta = REGIME_META[regime.rating] ?? { label: regime.rating ?? '—', tone: 'neutral', hint: '' };
    const mult = regime.key_metrics?.risk_multiplier ?? 1;
    const multPct = ((mult - 0.5) / 0.7) * 100;

    const numericCards = [
      { key: 'policy_rate', label: 'Policy rate', hint: 'Bangladesh Bank policy rate' },
      { key: 'inflation', label: 'Inflation (CPI)', hint: 'Point-to-point CPI', sub: payload.inflation_month },
      { key: 'fx_reserves_bn', label: 'FX reserves', hint: 'Official reserves (USD bn)' },
      { key: 'bdt_usd', label: 'BDT / USD', hint: 'Interbank reference' },
      { key: 'remittances_bn', label: 'Remittances', hint: 'Monthly inflow (USD bn)' },
    ].map(({ key, label, hint, sub }) => `
      <div class="card macro-metric-card">
        <div class="label">${esc(label)}</div>
        <div class="value">${fmtMacroValue(key, payload[key])}</div>
        ${sub ? `<div class="macro-metric-sub muted">${esc(sub)}</div>` : ''}
        <div class="macro-metric-hint muted">${esc(hint)}</div>
      </div>`).join('');

    const qualCards = Object.entries(QUALITATIVE_FACTORS).map(([key, def]) => {
      const raw = payload[key];
      const info = raw != null ? def.values[String(raw)] : null;
      const tone = info?.tone ?? 'neutral';
      const label = info?.label ?? (raw != null ? esc(String(raw)) : '—');
      return `
        <div class="macro-qual-card tone-${tone}">
          <div class="label">${esc(def.label)}</div>
          <div class="macro-qual-value">${label}</div>
        </div>`;
    }).join('');

    const flags = (regime.flags ?? []).filter((f) => f === 'stale_macro');
    const staleNote = flags.length
      ? `<p class="macro-stale-warn">Some macro fields are missing — confidence capped. Re-run ingest to refresh.</p>`
      : '';

    return `
      <div class="macro-wrap">
        <div class="macro-hero tone-${meta.tone}">
          <div class="macro-hero-main">
            <p class="macro-hero-kicker">Bangladesh macro regime</p>
            <div class="macro-hero-regime">
              <span class="grade-badge lg macro-regime-badge">${esc(meta.label)}</span>
              <span class="score-pill">score ${fmtNum(regime.score, 2)}</span>
              ${confidenceBadge(regime.confidence)}
            </div>
            <p class="macro-hero-hint">${esc(meta.hint)}</p>
          </div>
          <div class="macro-mult-panel">
            <div class="label">Risk multiplier</div>
            <div class="macro-mult-value">${fmtNum(mult, 3)}</div>
            <div class="macro-mult-range muted">0.5 (risk-off) — 1.2 (risk-on)</div>
            <div class="progress-track macro-mult-track">
              <div class="macro-mult-marker" style="left:${Math.max(0, Math.min(100, multPct))}%"></div>
            </div>
            <p class="muted macro-mult-note">Used by signal-synthesizer and risk-manager to scale position sizing.</p>
          </div>
        </div>

        ${staleNote}

        <h3 class="macro-section-title">Key indicators</h3>
        <div class="cards macro-metrics">${numericCards}</div>

        <h3 class="macro-section-title">Qualitative factors</h3>
        <div class="macro-qual-grid">${qualCards}</div>

        <div class="macro-two-col">
          <section class="macro-panel-block">
            <h3 class="macro-section-title">Factor drivers</h3>
            <p class="muted macro-section-note">Contribution to risk multiplier from each input (starts at 1.0).</p>
            ${renderMacroDriverBars(regime.key_metrics?.drivers)}
          </section>
          <section class="macro-panel-block">
            <h3 class="macro-section-title">Reasoning</h3>
            <ul class="reasoning-list macro-reasoning">${(regime.reasoning ?? []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          </section>
        </div>

        <details class="glass-box macro-raw">
          <summary>Raw snapshot JSON</summary>
          <pre class="json-block">${esc(JSON.stringify(payload, null, 2))}</pre>
        </details>
      </div>`;
  }

  function renderDailyCommands(symbol) {
    const sym = symbol ? String(symbol).toUpperCase() : 'GP';
    const quick = DAILY_COMMAND_SECTIONS.flatMap((s) => s.commands ?? []).filter((c) => c.quick);
    const quickHtml = quick.length
      ? `
      <div class="daily-quick-block">
        <div class="cmd-quick-head">
          <span class="cmd-quick-title">Quick copy</span>
          <span class="muted cmd-quick-hint">Most common upkeep commands — click to copy</span>
        </div>
        <div class="cmd-quick-row">
          ${quick
            .map((c) => {
              const cmd = c.symbolPlaceholder ? c.command(sym) : c.command();
              const badge = c.badge ? ` <span class="daily-badge">${esc(c.badge)}</span>` : '';
              return `<button type="button" class="cmd-quick-chip" data-copy-cmd="${cmdAttr(cmd)}" title="${cmdAttr(cmd)}">${esc(c.label)}${badge}</button>`;
            })
            .join('')}
        </div>
      </div>`
      : '';

    const sectionsHtml = DAILY_COMMAND_SECTIONS.map((section) => {
      if (section.schedule?.length) {
        const rows = section.schedule
          .map(
            ([when, what]) =>
              `<tr><td><strong>${esc(when)}</strong></td><td>${esc(what)}</td></tr>`,
          )
          .join('');
        return `
        <section class="cmd-group daily-schedule-group">
          <h4>${esc(section.title)}</h4>
          ${section.note ? `<p class="muted cmd-group-note">${esc(section.note)}</p>` : ''}
          <div class="table-wrap">
            <table class="daily-schedule-table">
              <thead><tr><th>Schedule</th><th>Action</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p class="muted daily-pc-note"><strong>PC off?</strong> Data stays in Postgres, but ingest pauses. When you return: <code>docker compose up -d postgres ingest-worker</code>, then <code>npm run ingest:daily</code> (or <code>npm run ingest:watchlist</code> for full catch-up).</p>
        </section>`;
      }

      const items = (section.commands ?? []).map((c) => {
        const cmd = c.symbolPlaceholder ? c.command(sym) : c.command();
        const badge = c.badge
          ? `<span class="daily-badge daily-badge-inline">${esc(c.badge)}</span>`
          : '';
        return `
        <div class="cmd-row">
          <div class="cmd-row-head">
            <strong>${esc(c.label)}${badge}</strong>
            <button type="button" class="btn-sm cmd-copy" data-copy-cmd="${cmdAttr(cmd)}">Copy</button>
          </div>
          ${c.description ? `<p class="muted cmd-row-desc">${esc(c.description)}</p>` : ''}
          <code class="cmd-text">${esc(cmd)}</code>
        </div>`;
      }).join('');

      return `
        <section class="cmd-group">
          <h4>${esc(section.title)}</h4>
          ${section.note ? `<p class="muted cmd-group-note">${esc(section.note)}</p>` : ''}
          ${items}
        </section>`;
    }).join('');

    return `
      <div class="daily-wrap">
        <div class="daily-header">
          <h2 class="daily-title">Daily upkeep</h2>
          <p class="muted daily-intro">Commands to keep Stock Buddy data fresh. Run from the <strong>repo root</strong>. Ingest writes to PostgreSQL; dashboard and Analyze buttons only read from the database.</p>
        </div>
        <div id="daily-status-banner" class="daily-status-banner muted">Loading recent ingest status…</div>
        ${quickHtml}
        <div class="cmd-full-wrap">${sectionsHtml}</div>
        <p class="muted daily-footer">Ingest history and freshness tables → <button type="button" class="btn-sm linkish" data-panel="ops">Ops tab</button>. Per-ticker CLI reference → <button type="button" class="btn-sm linkish" data-panel="ticker-detail" data-daily-analysis-tab>Analysis → Commands</button>.</p>
      </div>`;
  }

  function renderDailyStatusBanner(recentRuns) {
    const runs = recentRuns ?? [];
    if (!runs.length) {
      return '<p id="daily-status-banner" class="daily-status-banner muted">No ingest runs recorded yet — complete one-time setup, then start ingest-worker.</p>';
    }
    const latest = runs[0];
    const sym = latest.symbol ? ` · ${latest.symbol}` : '';
    const when = latest.startedAt ? fmtDateWithAge(latest.startedAt) : '—';
    const ok = latest.status === 'ok';
    const macroRun = runs.find((r) => r.jobName === 'ingest_macro' || r.jobName === 'ingest_daily');
    const ohlcvRun = runs.find((r) => r.jobName === 'ingest_ohlcv' || r.jobName === 'ingest_daily');
    const dailyRun = runs.find((r) => r.jobName === 'ingest_daily');
    const parts = [
      `Last ingest: <strong>${esc(latest.jobName ?? '—')}</strong>${esc(sym)} — <span class="badge ${ok ? 'ok' : 'fail'}">${esc(latest.status ?? '?')}</span> (${when})`,
    ];
    if (dailyRun?.startedAt) {
      parts.push(`Daily: ${fmtDateWithAge(dailyRun.startedAt)}`);
    } else {
      if (macroRun?.startedAt) {
        parts.push(`Macro: ${fmtDateWithAge(macroRun.startedAt)}`);
      }
      if (ohlcvRun?.startedAt) {
        parts.push(`OHLCV: ${fmtDateWithAge(ohlcvRun.startedAt)}`);
      }
    }
    return `<p id="daily-status-banner" class="daily-status-banner">${parts.join(' · ')}</p>`;
  }

  function renderTickerCommandsQuick(symbol) {
    if (!symbol) return '<p class="muted">Select a ticker to see commands.</p>';
    const sym = String(symbol).toUpperCase();
    const quick = TICKER_COMMANDS.filter((c) => c.quick);
    const globalQuick = GLOBAL_COMMANDS.filter((c) => c.quick);
    const wfQuick = WORKFLOW_COMMANDS.filter((c) =>
      ['wf-daily', 'wf-news-market', 'wf-watchlist'].includes(c.id),
    );
    const troubleshootQuick = (DAILY_COMMAND_SECTIONS.find((s) => s.id === 'troubleshooting')?.commands ?? []).filter(
      (c) => c.quick,
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
        ${troubleshootQuick.map((c) => {
          const cmd = c.symbolPlaceholder ? c.command(sym) : c.command();
          return `<button type="button" class="cmd-quick-chip cmd-quick-warn" data-copy-cmd="${cmdAttr(cmd)}" title="${cmdAttr(cmd)}">${esc(c.label)}</button>`;
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
        <p class="muted cmd-group-note">${REPO_ROOT_NOTE}. Ingest writes to PostgreSQL; dashboard and Analyze only read from DB.</p>
        ${WORKFLOW_COMMANDS.map((c) => renderCommandRow(c, null)).join('')}
      </section>`;

    const tickerSections = tickerGroups.map((g) => {
      const items = TICKER_COMMANDS.filter((c) => c.group === g);
      const note =
        g === 'Per-ticker pipeline'
          ? `<p class="muted cmd-group-note">Use <strong>Full ingest + analyze</strong> when ingest:daily reports 0 OHLCV rows for this symbol. Market news: npm run ingest:news first.</p>`
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
          ? `<p class="muted cmd-group-note">${INGEST_SHORTCUTS_NOTE} Controlled by INGEST_OHLCV_SOURCES / INGEST_NEWS_SOURCES in .env.</p>`
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

  function findJsonLine(jsonText, key, minLine = 0) {
    const lines = jsonText.split('\n');
    for (let i = minLine; i < lines.length; i++) {
      if (new RegExp(`^\\s*"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}":`).test(lines[i])) {
        return i;
      }
    }
    return null;
  }

  function buildJsonKeyIndex(jsonText) {
    if (!jsonText) return [];
    const lines = jsonText.split('\n');
    const keys = [];
    const seen = new Set();
    const add = (key, line) => {
      if (line == null || seen.has(key)) return;
      seen.add(key);
      keys.push({ key, line });
    };

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^  "([^"]+)":/);
      if (m) add(m[1], i);
    }

    try {
      const obj = JSON.parse(jsonText);
      const riskLine = findJsonLine(jsonText, 'risk');
      if (obj.risk) add('risk', riskLine);
      if (obj.risk?.strategies) {
        const strategiesLine = findJsonLine(jsonText, 'strategies', riskLine ?? 0);
        add('risk.strategies', strategiesLine);
      }
      if (obj.risk?.strategies?.atr) {
        const atrLine = findJsonLine(jsonText, 'atr', findJsonLine(jsonText, 'strategies', riskLine ?? 0) ?? 0);
        add('risk.strategies.atr', atrLine);
      }
      if (obj.risk?.strategies?.structure) {
        const structLine = findJsonLine(jsonText, 'structure', findJsonLine(jsonText, 'strategies', riskLine ?? 0) ?? 0);
        add('risk.strategies.structure', structLine);
      }
    } catch {
      // keep line-based keys only
    }

    return keys.sort((a, b) => a.line - b.line);
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
    renderAnalysisDataBar,
    renderHome,
    renderPortfolioTable,
    renderPortfolioSummary,
    renderTradingMirrorBanner,
    renderMomentumPortfolioTable,
    renderWatchlistTable,
    renderDiscoverResults,
    renderAnalytics,
    isStale,
    computeJsonFreshness,
    renderJsonProvenance,
    renderCategoryBars,
    getFullIngestCommand,
    renderTickerCommandsQuick,
    renderTickerCommandsFull,
    renderDailyCommands,
    renderDailyStatusBanner,
    renderMacroPanel,
    macroSourceLabel,
    buildJsonKeyIndex,
    renderJsonKeyNav,
  };
})();
