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

  const INVESTMENT_AGENT_WEIGHTS = {
    fundamental: 0.40,
    smart_money: 0.20,
    macro: 0.15,
    sentiment: 0.15,
    technical: 0.10,
  };
  const MOMENTUM_AGENT_WEIGHTS = {
    technical: 0.45,
    volume_flow: 0.20,
    smart_money: 0.15,
    sentiment: 0.12,
    fundamental: 0.08,
  };
  const AGENT_DISPLAY_LABELS = {
    fundamental: 'Fundamental',
    smart_money: 'Smart money',
    macro: 'Macro',
    sentiment: 'Sentiment',
    technical: 'Technical',
    volume_flow: 'Volume flow',
  };
  const VALUE_BUCKET_WEIGHTS = {
    buffett: 0.35,
    lynch: 0.30,
    graham: 0.35,
    quality: (0.35 + 0.30 + 0.35) / 3,
  };
  const VALUE_BUCKET_LABELS = {
    buffett: 'Buffett',
    lynch: 'Lynch',
    graham: 'Graham',
    quality: 'Quality',
  };

  function agentLensStatus(score, rating) {
    if (rating) {
      const r = String(rating).toLowerCase().replace(/\s+/g, '_');
      let cls = 'status-warn';
      if (['buy', 'strong_buy', 'bullish', 'positive', 'accumulate'].some((x) => r.includes(x))) cls = 'status-pass';
      else if (['sell', 'bearish', 'negative', 'avoid'].some((x) => r.includes(x))) cls = 'status-fail';
      return { label: formatSignalRating(rating), cls };
    }
    const s = Number(score);
    if (Number.isNaN(s)) return { label: '—', cls: 'status-unknown' };
    if (s >= 0.3) return { label: 'Bullish', cls: 'status-pass' };
    if (s <= -0.3) return { label: 'Bearish', cls: 'status-fail' };
    return { label: 'Neutral', cls: 'status-warn' };
  }

  function criterionStatusLabel(passed) {
    if (passed === true) return { label: 'Pass', cls: 'status-pass' };
    if (passed === false) return { label: 'Fail', cls: 'status-fail' };
    return { label: 'No data', cls: 'status-unknown' };
  }

  function criterionPointLabel(c) {
    const v = formatCriterionSummaryValue(c);
    if (v) return v;
    if (c.passed == null) return '—';
    return '—';
  }

  function criterionGpaPoint(passed) {
    if (passed === true) return { label: '+1', cls: 'status-pass' };
    if (passed === false) return { label: '0', cls: 'status-fail' };
    return { label: '—', cls: 'status-unknown' };
  }

  function renderScoreBoardCells(cells) {
    return `<div class="score-board">${cells.map(([label, val, cls]) =>
      `<div class="sb-cell"><span class="sb-label">${esc(label)}</span><span class="sb-val ${cls ?? ''}">${val}</span></div>`,
    ).join('')}</div>`;
  }

  function renderCriterionScoreRow(c, { gpaLabel = 'GPA' } = {}) {
    const status = criterionStatusLabel(c.passed);
    const gpa = criterionGpaPoint(c.passed);
    const point = criterionPointLabel(c);
    return renderScoreBoardCells([
      ['Status', `<span class="${status.cls}">${esc(status.label)}</span>`, ''],
      ['Point', esc(point), point === '—' ? 'status-unknown' : ''],
      [gpaLabel, `<span class="${gpa.cls}">${esc(gpa.label)}</span>`, ''],
    ]);
  }

  function renderBucketGpaStrip(bucketKey, bucketData) {
    if (!bucketData) return '';
    const frac = bucketData.fraction ?? (bucketData.total ? (bucketData.criteria_met ?? 0) / bucketData.total : null);
    const weight = VALUE_BUCKET_WEIGHTS[bucketKey];
    const contrib = frac != null && weight != null ? frac * weight : null;
    const label = VALUE_BUCKET_LABELS[bucketKey] ?? bucketKey;
    return renderScoreBoardCells([
      ['Bucket', esc(label), ''],
      ['Status', `${bucketData.criteria_met ?? '—'}/${bucketData.total ?? '—'} pass`, ''],
      ['Points', frac != null ? fmtNum(frac * 100, 1) + '%' : '—', frac != null ? scoreColor(frac) : ''],
      ['GPA weight', weight != null ? `${Math.round(weight * 100)}%` : '—', ''],
      ['→ Total', contrib != null ? fmtNum(contrib * 100, 1) + '%' : '—', contrib != null ? scoreColor(contrib / (weight || 1)) : ''],
    ]);
  }

  function renderStrategyScoreBoard(strategy) {
    if (!strategy || strategy.error) return '';
    const km = strategy.key_metrics ?? {};
    const passed = km.criteria_passed;
    const evaluated = km.criteria_evaluated;
    const count = km.overall_count ?? (passed != null && evaluated != null ? `${passed}/${evaluated}` : '—');
    const score = strategy.score;
    const grade = strategy.rating ?? '—';
    return renderScoreBoardCells([
      ['Grade', `<span class="grade-badge">${esc(grade)}</span>`, ''],
      ['Status', esc(count), ''],
      ['Points', score != null ? fmtNum(score, 3) : '—', score != null ? scoreColor(score) : ''],
    ]);
  }

  function rawAgentScore(agentKey, agentCards, contributions) {
    const card = agentCards?.[agentKey];
    if (card?.score != null) return Number(card.score);
    if (agentKey === 'volume_flow' && agentCards?.technical?.score != null) {
      return Math.round(0.8 * Number(agentCards.technical.score) * 10000) / 10000;
    }
    const contrib = contributions?.[agentKey];
    const weight = MOMENTUM_AGENT_WEIGHTS[agentKey] ?? INVESTMENT_AGENT_WEIGHTS[agentKey];
    if (contrib != null && weight) return Math.round((contrib / weight) * 10000) / 10000;
    return null;
  }

  function renderSynthesisAgentBoard(agentCards, synthesis, lens) {
    const lensData = synthesis?.[lens] ?? {};
    const contributions = lensData.contributions ?? {};
    const weights = lens === 'investment' ? INVESTMENT_AGENT_WEIGHTS : MOMENTUM_AGENT_WEIGHTS;
    const title = lens === 'investment' ? 'Investment signal — agent breakdown' : 'Momentum signal — agent breakdown';
    const hint = lens === 'investment'
      ? 'Points = agent score (−1 bearish … +1 bullish). Weight pts = contribution to investment signal. Status = agent rating.'
      : 'Points = agent score. Weight pts = contribution to momentum signal. Fundamental weight is small (veto only).';

    const rows = Object.entries(weights).map(([key, weight]) => {
      const card = agentCards?.[key === 'volume_flow' ? 'technical' : key];
      const raw = rawAgentScore(key, agentCards, contributions);
      const contrib = contributions[key];
      const status = agentLensStatus(raw, card?.rating);
      const derived = key === 'volume_flow' && !agentCards?.volume_flow;
      return `
        <tr>
          <td>${esc(AGENT_DISPLAY_LABELS[key] ?? key)}${derived ? ' <span class="muted">(derived)</span>' : ''}</td>
          <td>
            <button type="button" class="agent-status-btn ${status.cls}" data-agent-key="${esc(key)}" data-agent-lens="${esc(lens)}" title="Why this status?">
              ${esc(status.label)} <span class="agent-status-hint" aria-hidden="true">ⓘ</span>
            </button>
          </td>
          <td>${raw != null ? fmtNum(raw, 3) : '—'}</td>
          <td>${contrib != null ? (contrib >= 0 ? '+' : '') + fmtNum(contrib, 4) : '—'}</td>
          <td class="muted">${Math.round(weight * 100)}%</td>
          <td>${card?.confidence != null ? confidenceBadge(card.confidence) : '—'}</td>
        </tr>`;
    }).join('');

    const signal = lensData.rating ? formatSignalRating(lensData.rating) : '—';
    const signalCls = ratingClass(lensData.rating);
    const composite = lensData.composite_1_10;
    const weighted = lensData.score;

    return `
      <div class="analysis-score-board">
        <h4>${esc(title)}</h4>
        <p class="muted score-board-hint">${esc(hint)} Click a <strong>Status</strong> for the full reasoning.</p>
        <div class="table-wrap">
          <table class="agent-board-table">
            <tr><th>Agent</th><th>Status</th><th>Points</th><th>Weight pts</th><th>Weight</th><th>Conf.</th></tr>
            ${rows}
          </table>
        </div>
        ${renderScoreBoardCells([
          ['Signal', `<span class="signal-rating ${signalCls}">${esc(signal)}</span>`, ''],
          ['Composite', composite != null ? `${composite}/10` : '—', ''],
          ['Weighted', weighted != null ? fmtNum(weighted, 3) : '—', ''],
        ])}
      </div>`;
  }

  function renderAgentEduBlock({ titleEn, titleBn, simpleEn, simpleBn, detailEn, detailBn, actionEn, actionBn, rawLine }) {
    const raw = rawLine
      ? `<p class="agent-edu-raw"><span class="agent-edu-label">System read</span> ${esc(rawLine)}</p>`
      : '';
    return `
      <article class="agent-edu-block">
        ${titleEn ? `<h5 class="agent-edu-title">${esc(titleEn)}${titleBn ? ` <span class="agent-edu-title-bn" lang="bn">· ${esc(titleBn)}</span>` : ''}</h5>` : ''}
        ${raw}
        ${simpleEn ? `<p class="agent-edu-simple"><strong>English:</strong> ${esc(simpleEn)}</p>` : ''}
        ${simpleBn ? `<p class="agent-edu-simple-bn" lang="bn"><strong>বাংলা:</strong> ${esc(simpleBn)}</p>` : ''}
        ${detailEn ? `<p class="agent-edu-detail">${esc(detailEn)}</p>` : ''}
        ${detailBn ? `<p class="agent-edu-detail-bn" lang="bn">${esc(detailBn)}</p>` : ''}
        ${actionEn ? `<p class="agent-edu-action"><strong>What to do:</strong> ${esc(actionEn)}</p>` : ''}
        ${actionBn ? `<p class="agent-edu-action-bn" lang="bn"><strong>করণীয়:</strong> ${esc(actionBn)}</p>` : ''}
      </article>`;
  }

  function renderAgentDetailModalContent(agentKey, lens, agentCards, synthesis) {
    const Edu = window.AnalysisAgentEducation;
    const cardKey = agentKey === 'volume_flow' ? 'technical' : agentKey;
    const card = agentCards?.[cardKey];
    const lensData = synthesis?.[lens] ?? {};
    const contributions = lensData.contributions ?? {};
    const contrib = contributions[agentKey];
    const raw = rawAgentScore(agentKey, agentCards, contributions);
    const weights = lens === 'investment' ? INVESTMENT_AGENT_WEIGHTS : MOMENTUM_AGENT_WEIGHTS;
    const weight = weights[agentKey];
    const derived = agentKey === 'volume_flow' && !agentCards?.volume_flow;
    const label = AGENT_DISPLAY_LABELS[agentKey] ?? agentKey;
    const profile = Edu?.profile(agentKey);
    const legend = Edu?.scoreLegend;

    if (!card || card.error) {
      return `<p class="muted">${esc(card?.error ?? 'No data from this agent — it may have been skipped during analysis.')}</p>`;
    }

    const status = agentLensStatus(raw, card.rating);
    const reasoning = Array.isArray(card.reasoning) ? card.reasoning : [];
    const flags = Array.isArray(card.flags) ? card.flags : [];
    const km = card.key_metrics ?? {};
    const metricEntries = Object.entries(km).filter(([, v]) => v != null && typeof v !== 'object').slice(0, 14);

    let html = '';

    if (profile) {
      const w = profile.weight?.[lens] ?? profile.weight?.investment;
      html += renderAgentEduBlock({
        titleEn: profile.title?.en,
        titleBn: profile.title?.bn,
        simpleEn: profile.intro?.en,
        simpleBn: profile.intro?.bn,
        detailEn: w?.en,
        detailBn: w?.bn,
      });
    }

    if (legend) {
      html += `<div class="agent-edu-legend">`;
      html += renderAgentEduBlock({
        titleEn: 'How to read the numbers',
        titleBn: 'সংখ্যাগুলো কী বোঝায়',
        simpleEn: `${legend.points.en} ${legend.weightPts.en}`,
        simpleBn: `${legend.points.bn} ${legend.weightPts.bn}`,
        detailEn: legend.status.en,
        detailBn: legend.status.bn,
        actionEn: legend.confidence.en,
        actionBn: legend.confidence.bn,
      });
      html += `</div>`;
    }

    html += `
      <div class="agent-detail-summary">
        ${renderScoreBoardCells([
          ['Agent', esc(label), ''],
          ['Status', `<span class="${status.cls}">${esc(status.label)}</span>`, ''],
          ['Points', raw != null ? fmtNum(raw, 3) : '—', ''],
          ['Weight pts', contrib != null ? (contrib >= 0 ? '+' : '') + fmtNum(contrib, 4) : '—', ''],
          ['Weight', weight != null ? `${Math.round(weight * 100)}%` : '—', ''],
          ['Confidence', card.confidence != null ? confidenceBadge(card.confidence) : '—', ''],
        ])}
      </div>`;

    if (derived) {
      html += renderAgentEduBlock({
        titleEn: 'Derived volume flow',
        titleBn: 'ভলিউম ফ্লো (অনুমান)',
        simpleEn: 'Volume flow uses 0.8 × technical score when no separate volume agent ran.',
        simpleBn: 'আলাদা ভলিউম এজেন্ট না থাকলে ০.৮ × টেকনিক্যাল স্কোর ব্যবহার হয়।',
        detailEn: 'Breakouts need volume confirmation — this row approximates that from price-volume indicators in the technical card.',
        detailBn: 'ব্রেকআউটে ভলিউম দরকার — এই সারি টেকনিক্যাল কার্ড থেকে ভলিউম সূচক অনুমান করে।',
      });
    }

    html += `<h4 class="agent-detail-heading">Why this status — step by step</h4>`;
    html += `<p class="muted agent-detail-subhead">Each point below: what the system saw, plain English, Bangla, and what you can do.</p>`;

    if (reasoning.length) {
      html += `<div class="agent-reasoning-edu-list">${reasoning.map((line, i) => {
        const rule = Edu?.matchReasoning(line, agentKey) ?? {};
        return renderAgentEduBlock({
          titleEn: rule.title?.en ? `Step ${i + 1}: ${rule.title.en}` : `Step ${i + 1}`,
          titleBn: rule.title?.bn,
          rawLine: line,
          simpleEn: rule.simple?.en,
          simpleBn: rule.simple?.bn,
          detailEn: rule.detail?.en,
          detailBn: rule.detail?.bn,
          actionEn: rule.action?.en,
          actionBn: rule.action?.bn,
        });
      }).join('')}</div>`;
    } else {
      html += '<p class="muted">No reasoning steps recorded for this agent.</p>';
    }

    if (metricEntries.length) {
      html += `<h4 class="agent-detail-heading">Key metrics explained</h4>`;
      html += `<div class="agent-metrics-edu">${metricEntries.map(([k, v]) => {
        const help = Edu?.metricHelp(k) ?? {};
        return `
          <div class="agent-metric-edu-row">
            <div class="agent-metric-edu-head"><strong>${esc(k.replace(/_/g, ' '))}</strong> <span class="agent-metric-val">${esc(String(v))}</span></div>
            <p class="agent-edu-detail">${esc(help.en ?? '')}</p>
            <p class="agent-edu-detail-bn" lang="bn">${esc(help.bn ?? '')}</p>
          </div>`;
      }).join('')}</div>`;
    }

    if (flags.length) {
      html += renderAgentEduBlock({
        titleEn: 'Data flags',
        titleBn: 'ডেটা ফ্ল্যাগ',
        simpleEn: `Notes: ${flags.join(' · ')}`,
        simpleBn: 'কিছু ইনপুট অনুপস্থিত বা আংশিক — স্কোর কম বিশ্বাসযোগ্য হতে পারে।',
        actionEn: 'Run full ingest on this ticker or fill gaps via research prompts on the Investment tab.',
        actionBn: 'এই টিকারে পূর্ণ ingest চালান বা Investment ট্যাবে গবেষণা প্রম্পট দিয়ে ফাঁক পূরণ করুন।',
      });
    }

    const lensReasoning = Array.isArray(lensData.reasoning) ? lensData.reasoning : [];
    const agentMentions = lensReasoning.filter((r) => {
      const t = String(r).toLowerCase();
      return t.includes(agentKey.replace('_', ' ')) || t.includes(cardKey) || t.includes(label.toLowerCase());
    });
    if (agentMentions.length) {
      html += `<h4 class="agent-detail-heading">How this agent affected the combined signal</h4>`;
      html += agentMentions.map((line, i) => {
        const rule = Edu?.matchReasoning(line, agentKey) ?? {};
        return renderAgentEduBlock({
          titleEn: `Synthesizer note ${i + 1}`,
          titleBn: 'সংমিশ্রক নোট',
          rawLine: line,
          simpleEn: rule.simple?.en ?? 'This rule adjusted the final buy/hold/sell label.',
          simpleBn: rule.simple?.bn ?? 'এই নিয়ম চূড়ান্ত buy/hold/sell লেবেল ঠিক করেছে।',
          detailEn: rule.detail?.en,
          detailBn: rule.detail?.bn,
        });
      }).join('');
    }

    html += `<p class="agent-edu-disclaimer muted">Educational analysis only — not financial advice. Verify important numbers in annual reports and DSE filings.</p>`;
    html += `<p class="agent-edu-disclaimer-bn muted" lang="bn">শিক্ষামূলক বিশ্লেষণ মাত্র — আর্থিক পরামর্শ নয়। গুরুত্বপূর্ণ সংখ্যা বার্ষিক প্রতিবেদন ও DSE ফাইলিংয়ে যাচাই করুন।</p>`;

    return html;
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

  function renderComparison(synthesis, momentumTrading, valueChecklist) {
    const inv = synthesis?.investment ?? {};
    const mom = synthesis?.momentum ?? {};
    const mt = momentumTrading ?? null;
    const summary = mt?.summary ?? {};
    const momGrade = summary.rating ?? summary.consensus_grade ?? '—';
    const momCount = summary.overall_count ?? '—';
    const valGrade = valueChecklist?.rating ?? '—';
    const valGpa = valueChecklist?.key_metrics?.gpa;
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
          ${confidenceBadge(mom.confidence ?? summary.confidence)}
        </div>
      </div>
      <div class="unified-rec"><strong>Unified:</strong> ${esc(String(confluence ?? '—'))}</div>`;
  }

  function renderCategoryBars(categories, labelMap) {
    if (!categories) return '';
    return Object.entries(categories)
      .map(([cat, data]) => {
        const row = data && typeof data === 'object' ? data : {};
        const frac = row.fraction ?? 0;
        const label = labelMap?.[cat] ?? cat.replace(/_/g, ' ');
        return `
          <div class="cat-bar">
            <div class="cat-label"><span>${esc(label)}</span><span>${row.criteria_met ?? '—'}/${row.total ?? '—'}</span></div>
            <div class="progress-track"><div class="progress-fill ${scoreColor(frac)}" style="width:${Math.round(frac * 100)}%"></div></div>
          </div>`;
      })
      .join('');
  }

  const MOMENTUM_STRATEGY_LABELS = {
    minervini_sepa: 'Minervini SEPA',
    can_slim: 'CAN SLIM',
    darvas_box: 'Darvas Box',
    livermore_pivot: 'Livermore Pivot',
  };

  const MOMENTUM_STRATEGY_KEYS = ['minervini_sepa', 'can_slim', 'darvas_box', 'livermore_pivot'];

  const MOMENTUM_CATEGORY_COPY = {
    trend_template: {
      en: 'Trend template',
      bn: 'ট্রেন্ড টেমপ্লেট',
      desc_en: 'Is the stock in a healthy Stage 2 uptrend with moving averages stacked up?',
      desc_bn: 'স্টেজ ২ ঊর্ধ্বমুখী ট্রেন্ড ও গড় লাইন সারি ঠিক আছে কিনা।',
    },
    vcp: {
      en: 'VCP (volatility contraction)',
      bn: 'ভলাটিলিটি সংকোচন (VCP)',
      desc_en: 'Is price tightening before a possible breakout?',
      desc_bn: 'ছুটির আগে দাম সংকুচিত হচ্ছে কিনা।',
    },
    fundamentals: {
      en: 'Fundamentals',
      bn: 'মৌলিক বিষয়',
      desc_en: 'Is earnings growth strong and accelerating?',
      desc_bn: 'আয়ের বৃদ্ধি শক্তিশালী ও ত্বরান্বিত কিনা।',
    },
    risk: {
      en: 'Risk',
      bn: 'ঝুঁকি',
      desc_en: 'Is volatility controlled and the stock not overextended?',
      desc_bn: 'অস্থিরতা নিয়ন্ত্রিত ও দাম অতিরিক্ত ছাড়া নয় কিনা।',
    },
    C: {
      en: 'C — Current earnings',
      bn: 'C — বর্তমান আয়',
      desc_en: 'Are current-quarter profits growing fast?',
      desc_bn: 'বর্তমান ত্রৈমাসিকে লাভ দ্রুত বাড়ছে কিনা।',
    },
    A: {
      en: 'A — Annual earnings',
      bn: 'A — বার্ষিক আয়',
      desc_en: 'Has earnings grown over multiple years with quality (ROE)?',
      desc_bn: 'কয়েক বছর ধরে আয় বেড়েছে ও গুণমান (ROE) ভালো কিনা।',
    },
    N: {
      en: 'N — New catalyst',
      bn: 'N — নতুন ক্যাটালিস্ট',
      desc_en: 'Near yearly highs or a positive earnings surprise?',
      desc_bn: 'বার্ষিক উচ্চের কাছে বা আশার চেয়ে ভালো ফলাফল?',
    },
    S: {
      en: 'S — Supply & demand',
      bn: 'S — সাপ্লাই ও চাহিদা',
      desc_en: 'Heavy volume and reasonable share supply?',
      desc_bn: 'ভারী ভলিউম ও যুক্তিসঙ্গত শেয়ার সাপ্লাই?',
    },
    L: {
      en: 'L — Leader',
      bn: 'L — নেতা',
      desc_en: 'Outperforming the market with positive 12-month momentum?',
      desc_bn: 'বাজারের চেয়ে ভালো করছে ও ১২ মাসের মোমেন্টাম ধনাত্মক?',
    },
    I: {
      en: 'I — Institutional',
      bn: 'I — প্রাতিষ্ঠানিক',
      desc_en: 'Are funds and institutions accumulating?',
      desc_bn: 'ফান্ড ও প্রতিষ্ঠান কিনছে কিনা।',
    },
    M: {
      en: 'M — Market',
      bn: 'M — বাজার',
      desc_en: 'Is the broad market in an uptrend?',
      desc_bn: 'সামগ্রিক বাজার উর্ধ্বমুখী কিনা।',
    },
    box: {
      en: 'Box',
      bn: 'বক্স',
      desc_en: 'Is price consolidating in a clear range?',
      desc_bn: 'দাম স্পষ্ট রেঞ্জে সংহত হচ্ছে কিনা।',
    },
    breakout: {
      en: 'Breakout',
      bn: 'ব্রেকআউট',
      desc_en: 'Breaking above the box with strong volume?',
      desc_bn: 'বক্স ভেঙে শক্তিশালী ভলিউমে উপরে?',
    },
    pivot: {
      en: 'Pivot',
      bn: 'পিভট',
      desc_en: 'Key price level where momentum may accelerate?',
      desc_bn: 'যে স্তর ভাঙলে গতি বাড়তে পারে?',
    },
    volume: {
      en: 'Volume',
      bn: 'ভলিউম',
      desc_en: 'Is volume confirming the pivot move?',
      desc_bn: 'পিভট ছুটিতে ভলিউম সমর্থন করছে কিনা।',
    },
  };

  const MOMENTUM_STRATEGY_INTRO = {
    minervini_sepa: {
      en: 'Mark Minervini looks for stocks in a strong uptrend, tightening before a breakout, with fast-growing earnings.',
      bn: 'মিনারভিনি শক্তিশালী উর্ধ্বমুখী ট্রেন্ড, ব্রেকআউটের আগে সংকোচন ও দ্রুত বাড়তি আয় খোঁজেন।',
    },
    can_slim: {
      en: "William O'Neil's CAN SLIM: Current earnings, Annual growth, New highs, Supply/demand, Leadership, Institutions, and Market direction.",
      bn: 'উইলিয়াম ওনিলের CAN SLIM: বর্তমান আয়, বার্ষিক বৃদ্ধি, নতুন উচ্চ, সাপ্লাই-চাহিদা, নেতৃত্ব, প্রাতিষ্ঠানিক ক্রয় ও বাজারের দিক।',
    },
    darvas_box: {
      en: 'Nicolas Darvas drew a box around consolidation; he watched for breakouts above the box with volume, stopping at the box floor.',
      bn: 'নিকোলাস দারভাস সংহতকরণকে বক্স ধরতেন; ভলিউমসহ ছাদ ভেঙে উপরে যাওয়া দেখতেন, বক্সের মেঝেতে স্টপ রাখতেন।',
    },
    livermore_pivot: {
      en: 'Jesse Livermore traded pivot breaks with volume, added only on strength, and never averaged down into losers.',
      bn: 'জেসি লিভারমোর পিভট ভেঙে ভলিউমে ট্রেড করতেন, শক্তিতে যোগ করতেন, হারানো পজিশনে আর কেনতেন না।',
    },
  };

  function momentumCategoryLabels() {
    return Object.fromEntries(
      Object.entries(MOMENTUM_CATEGORY_COPY).map(([k, v]) => [k, v.en]),
    );
  }

  function resolveMomentumTrading(analysis) {
    if (!analysis) return null;
    if (analysis.momentum_trading) return analysis.momentum_trading;
    return legacyMomentumScreenToTrading(analysis.momentum_screen);
  }

  function legacyMomentumScreenToTrading(ms) {
    if (!ms || ms.error) return null;
    const criteria = ms.criteria ?? [];
    const evaluable = criteria.filter((c) => c.passed != null);
    const met = evaluable.filter((c) => c.passed).length;
    const total = evaluable.length;
    const frac = total ? met / total : 0;
    return {
      summary: {
        rating: ms.rating,
        overall_count: ms.key_metrics?.overall_count ?? `${met}/${total}`,
        criteria_passed: ms.key_metrics?.criteria_passed ?? met,
        criteria_evaluated: ms.key_metrics?.criteria_evaluated ?? total,
        confidence: ms.confidence,
        consensus_grade: ms.rating,
        consensus_score: ms.score,
        buckets: {
          minervini_sepa: { criteria_met: met, total, fraction: frac },
          can_slim: { criteria_met: 0, total: 0, fraction: 0 },
          darvas_box: { criteria_met: 0, total: 0, fraction: 0 },
          livermore_pivot: { criteria_met: 0, total: 0, fraction: 0 },
        },
      },
      strategies: { minervini_sepa: ms },
      agents: {},
      _legacy: true,
    };
  }

  function renderStrategyMetricStrip(strategyKey, strategy) {
    if (!strategy?.key_metrics) return '';
    const km = strategy.key_metrics;
    if (strategyKey === 'darvas_box') {
      const items = [
        ['Box high', km.box_high],
        ['Box low', km.box_low],
        ['Box stop', km.box_stop],
        ['Breakout', km.breakout ? 'yes' : 'no'],
      ].filter(([, v]) => v != null);
      if (!items.length) return '';
      return `<div class="formula-row">${items.map(([l, v]) => `<span class="formula-chip">${esc(l)}: ${fmtNum(v, 2)}</span>`).join('')}</div>`;
    }
    if (strategyKey === 'livermore_pivot') {
      const adds = Array.isArray(km.add_levels) ? km.add_levels.join(', ') : null;
      const items = [
        ['Pivot', km.pivot],
        ['Trail stop', km.trail_stop],
        ['Add levels', adds],
      ].filter(([, v]) => v != null);
      if (!items.length) return '';
      return `<div class="formula-row">${items.map(([l, v]) => `<span class="formula-chip">${esc(l)}: ${esc(String(v))}</span>`).join('')}</div>`;
    }
    return '';
  }

  function renderMomentumStrategiesPanel(momentumTrading, activeStrategy, rotation) {
    if (!momentumTrading) {
      return '<p class="muted">Run analysis (momentum or full mode) to load master-trader strategies.</p>';
    }
    const summary = momentumTrading.summary ?? {};
    const buckets = summary.buckets ?? {};
    const strategies = momentumTrading.strategies ?? {};
    const rec = recommendationFromScore(summary.consensus_score ?? 0, 'momentum');

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
          <p class="muted">${esc(rotation.rebalance_note ?? '')}</p>
        </div>`;
    }

    const tabs = MOMENTUM_STRATEGY_KEYS.map((k) =>
      `<button type="button" class="bucket-tab strategy-tab ${activeStrategy === k ? 'active' : ''}" data-strategy="${k}">${esc(MOMENTUM_STRATEGY_LABELS[k] ?? k)}</button>`,
    ).join('');

    let detailHtml = '';
    if (activeStrategy === 'all') {
      for (const k of MOMENTUM_STRATEGY_KEYS) {
        const s = strategies[k];
        if (!s || s.error) continue;
        detailHtml += `<div class="criteria-group"><h5>${esc(MOMENTUM_STRATEGY_LABELS[k] ?? k)}</h5>`;
        detailHtml += renderStrategyScoreBoard(s);
        detailHtml += renderCategoryBars(s.key_metrics?.categories, momentumCategoryLabels());
        detailHtml += renderStrategyMetricStrip(k, s);
        detailHtml += renderCriteriaList(s.criteria, 'category', { categoryCopy: MOMENTUM_CATEGORY_COPY, gpaLabel: 'Score' });
        detailHtml += '</div>';
      }
    } else {
      const s = strategies[activeStrategy];
      const intro = MOMENTUM_STRATEGY_INTRO[activeStrategy];
      const introHtml = intro
        ? `<div class="strategy-intro"><p>${esc(intro.en)}</p><p class="strategy-intro-bn" lang="bn">${esc(intro.bn)}</p></div>`
        : '';
      if (!s || s.error) {
        detailHtml = `<p class="muted">${esc(s?.error ?? 'Strategy data unavailable')}</p>`;
      } else {
        detailHtml = introHtml + renderStrategyScoreBoard(s);
        detailHtml += renderCategoryBars(s.key_metrics?.categories, momentumCategoryLabels());
        detailHtml += renderStrategyMetricStrip(activeStrategy, s);
        detailHtml += renderCriteriaList(s.criteria, 'category', { categoryCopy: MOMENTUM_CATEGORY_COPY, gpaLabel: 'Score' });
      }
    }

    return `
      <div class="checklist-intro">
        <p><strong>Momentum master strategies</strong> — Minervini SEPA, CAN SLIM, Darvas Box, and Livermore Pivot. Each row shows pass/total for that methodology; tabs drill into criteria.</p>
        <p class="checklist-intro-bn" lang="bn">চারটি মাস্টার-ট্রেডার পদ্ধতি — প্রতিটিতে লক্ষ্য, ডেটা, ফলাফল ও ব্যাখ্যা।</p>
      </div>
      <div class="checklist-header">
        <div><span class="grade-badge lg">${esc(summary.rating ?? summary.consensus_grade ?? '—')}</span> ${esc(summary.overall_count ?? '')} ${confidenceBadge(summary.confidence)}</div>
        <div class="action-rec ${scoreColor(summary.consensus_score)}"><strong>${esc(rec.label)}:</strong> ${esc(rec.text)}</div>
      </div>
      ${renderScoreBoardCells([
        ['Checklist grade', `<span class="grade-badge">${esc(summary.rating ?? summary.consensus_grade ?? '—')}</span>`, ''],
        ['Status', esc(summary.overall_count ?? '—'), ''],
        ['Points', summary.consensus_score != null ? fmtNum(summary.consensus_score, 3) : '—', summary.consensus_score != null ? scoreColor(summary.consensus_score) : ''],
      ])}
      ${renderCategoryBars(buckets, MOMENTUM_STRATEGY_LABELS)}
      <div class="bucket-tabs">${tabs}<button type="button" class="bucket-tab strategy-tab ${activeStrategy === 'all' ? 'active' : ''}" data-strategy="all">All</button></div>
      ${rotHtml}
      ${detailHtml}`;
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
        ${bangla ? `<p class="criterion-bn" lang="bn"><strong>সহজ বাংলায়:</strong> ${esc(bangla)}</p>` : ''}
        ${example ? `<p class="criterion-example"><strong>Example:</strong> ${esc(example)}</p>` : ''}
      </div>`;
  }

  function renderCriteriaList(criteria, bucketKey, opts) {
    if (!Array.isArray(criteria) || !criteria.length) return '<p class="muted">No criteria data</p>';
    const categoryCopy = opts?.categoryCopy ?? {};
    const bucketScores = opts?.bucketScores ?? {};
    const gpaLabel = opts?.gpaLabel ?? 'GPA';
    let current = null;
    let html = '';
    for (const c of criteria) {
      const bucket = c[bucketKey] ?? c.category ?? 'Other';
      if (bucket !== current) {
        if (current) html += '</div>';
        const meta = categoryCopy[bucket];
        const title = meta?.en ?? String(bucket).replace(/_/g, ' ');
        const titleBn = meta?.bn ? `<span class="criteria-group-bn" lang="bn"> · ${esc(meta.bn)}</span>` : '';
        const desc = meta?.desc_en
          ? `<p class="criteria-group-desc">${esc(meta.desc_en)}</p>${meta.desc_bn ? `<p class="criteria-group-desc-bn" lang="bn">${esc(meta.desc_bn)}</p>` : ''}`
          : '';
        const bucketStrip = bucketScores[bucket] ? renderBucketGpaStrip(bucket, bucketScores[bucket]) : '';
        html += `<div class="criteria-group"><h5>${esc(title)}${titleBn}</h5>${desc}${bucketStrip}`;
        current = bucket;
      }
      html += `
        <article class="criterion ${criterionClass(c.passed)}">
          <header class="criterion-head">
            <span class="c-icon" aria-hidden="true">${criterionIcon(c.passed)}</span>
            <strong class="criterion-title">${esc(c.label)}</strong>
          </header>
          ${renderCriterionScoreRow(c, { gpaLabel })}
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
      ${renderCriteriaList(ms.criteria, 'category', { categoryCopy: MOMENTUM_CATEGORY_COPY })}`;
  }

  function fractionToGrade(frac) {
    const s = Number(frac);
    if (Number.isNaN(s)) return '—';
    if (s >= 0.9) return 'A+';
    if (s >= 0.8) return 'A';
    if (s >= 0.7) return 'B+';
    if (s >= 0.6) return 'B';
    if (s >= 0.5) return 'C';
    if (s >= 0.4) return 'D';
    return 'F';
  }

  function renderValueChecklistScoreContext(vc, activeBucket) {
    const allBuckets = vc.key_metrics?.buckets ?? {};
    const isAll = activeBucket === 'all';
    const bucketData = !isAll ? allBuckets[activeBucket] : null;

    if (isAll) {
      return {
        grade: vc.rating ?? '—',
        gpa: vc.key_metrics?.gpa,
        points: vc.score,
        status: vc.key_metrics?.overall_count ?? '—',
        pointsColor: vc.score != null ? scoreColor(vc.score) : '',
        scopeLabel: 'All 30 criteria',
        scopeNote: '',
      };
    }

    if (!bucketData) {
      return {
        grade: '—',
        gpa: null,
        points: null,
        status: '—',
        pointsColor: '',
        scopeLabel: VALUE_BUCKET_LABELS[activeBucket] ?? activeBucket,
        scopeNote: 'No data for this bucket.',
      };
    }

    const frac = bucketData.fraction ?? (bucketData.total ? (bucketData.criteria_met ?? 0) / bucketData.total : null);
    const weight = VALUE_BUCKET_WEIGHTS[activeBucket];
    const contrib = frac != null && weight != null ? frac * weight : null;
    const status = `${bucketData.criteria_met ?? '—'}/${bucketData.total ?? '—'}`;

    return {
      grade: fractionToGrade(frac),
      gpa: contrib != null ? fmtNum(contrib * 4, 2) : null,
      points: frac,
      status,
      pointsColor: frac != null ? scoreColor(frac) : '',
      scopeLabel: `${VALUE_BUCKET_LABELS[activeBucket] ?? activeBucket} bucket`,
      scopeNote: `Overall checklist: <strong>${esc(vc.rating ?? '—')}</strong> · GPA ${fmtNum(vc.key_metrics?.gpa, 1)} · ${esc(vc.key_metrics?.overall_count ?? '')}. Investment signal (above) is from agents — not recalculated per bucket.`,
      bucketContrib: contrib,
    };
  }

  function renderValueChecklist(vc, activeBucket) {
    if (!vc || vc.error) return `<p class="muted">${esc(vc?.error ?? 'Run analysis to load value checklist')}</p>`;
    const ctx = renderValueChecklistScoreContext(vc, activeBucket);
    const scoreForRec = activeBucket === 'all' ? vc.score : ctx.points;
    const rec = recommendationFromScore(scoreForRec, 'investment');
    const buckets = ['buffett', 'lynch', 'graham', 'quality'];
    const tabs = buckets
      .map((b) => `<button type="button" class="bucket-tab ${activeBucket === b ? 'active' : ''}" data-bucket="${b}">${esc(VALUE_BUCKET_LABELS[b] ?? b)}</button>`)
      .join('');
    const filtered =
      activeBucket === 'all'
        ? vc.criteria
        : (vc.criteria ?? []).filter((c) => c.bucket === activeBucket);

    const scoreCells = activeBucket === 'all'
      ? [
          ['Scope', esc(ctx.scopeLabel), ''],
          ['Checklist grade', `<span class="grade-badge">${esc(ctx.grade)}</span>`, ''],
          ['GPA', ctx.gpa != null ? fmtNum(ctx.gpa, 1) : '—', ''],
          ['Points', ctx.points != null ? fmtNum(ctx.points, 3) : '—', ctx.pointsColor],
          ['Status', esc(ctx.status), ''],
        ]
      : [
          ['Scope', esc(ctx.scopeLabel), ''],
          ['Bucket grade', `<span class="grade-badge">${esc(ctx.grade)}</span>`, ''],
          ['Wt GPA', ctx.gpa != null ? String(ctx.gpa) : '—', ''],
          ['Points', ctx.points != null ? fmtNum(ctx.points, 3) : '—', ctx.pointsColor],
          ['Status', esc(ctx.status), ''],
          ['→ Total', ctx.bucketContrib != null ? `${fmtNum(ctx.bucketContrib * 100, 1)}% of checklist` : '—', ctx.pointsColor],
        ];

    return `
      <div class="checklist-intro">
        <p><strong>Investment checklist</strong> — Tabs filter criteria and show <em>bucket-specific</em> grade/points, or <em>All 30</em> for the full GPA. The investment <strong>signal</strong> (buy/hold) always comes from the agent board above.</p>
        <p class="checklist-intro-bn" lang="bn">ট্যাব বদলালে ওই বাকেটের গ্রেড/পয়েন্ট দেখায়; সিগন্যাল উপরের এজেন্ট টেবিল থেকে — ট্যাবে বদলায় না।</p>
      </div>
      <div class="checklist-header">
        <div><span class="grade-badge lg">${esc(ctx.grade)}</span> ${activeBucket === 'all' ? `GPA ${fmtNum(ctx.gpa)}` : `bucket · ${esc(ctx.status)}`} · ${esc(ctx.scopeLabel)} ${confidenceBadge(vc.confidence)}</div>
        <div class="action-rec ${scoreColor(scoreForRec)}"><strong>${esc(rec.label)}:</strong> ${esc(rec.text)}</div>
        ${ctx.scopeNote ? `<p class="muted bucket-scope-note">${ctx.scopeNote}</p>` : ''}
      </div>
      ${renderScoreBoardCells(scoreCells)}
      ${activeBucket === 'all' ? renderCategoryBars(vc.key_metrics?.buckets, VALUE_BUCKET_LABELS) : renderBucketGpaStrip(activeBucket, vc.key_metrics?.buckets?.[activeBucket])}
      <div class="bucket-tabs">${tabs}<button type="button" class="bucket-tab ${activeBucket === 'all' ? 'active' : ''}" data-bucket="all">All 30</button></div>
      ${renderCriteriaList(filtered, 'bucket', {
        bucketScores: activeBucket === 'all' ? vc.key_metrics?.buckets : {},
        gpaLabel: activeBucket === 'all' ? 'GPA' : 'Score',
      })}`;
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

  function renderTickerModeCell(t, mode) {
    const isInv = mode === 'investment';
    const grade = isInv ? (t.value_grade ?? '—') : (t.momentum_grade ?? '—');
    const gpa = isInv && t.gpa != null ? `GPA ${fmtNum(t.gpa, 1)}` : '';
    const count = !isInv && t.momentum_count ? esc(t.momentum_count) : '';
    const score = isInv ? t.investment_score : t.momentum_score;
    const rating = isInv ? t.investment_rating : t.momentum_rating;
    const meta = [grade, gpa || count].filter(Boolean).join(' · ');
    const signal = renderSignalRatingCell(rating, score);
    if (meta === '—' && signal === '—') return '<span class="muted">—</span>';
    return `<div class="ticker-mode-cell">${signal}${meta && meta !== '—' ? `<div class="ticker-mode-meta muted">${meta}</div>` : ''}</div>`;
  }

  function renderTickerOptionLabel(t) {
    const sym = t.symbol ?? '';
    const invGrade = t.value_grade;
    const invGpa = t.gpa != null ? `GPA ${fmtNum(t.gpa, 1)}` : '';
    const invSignal = t.investment_rating ? formatSignalRating(t.investment_rating) : '';
    const invScore = t.investment_score != null ? `${t.investment_score}/10` : '';
    const invParts = [invGrade, invGpa, invSignal, invScore].filter(Boolean);

    const momGrade = t.momentum_grade;
    const momCount = t.momentum_count ?? '';
    const momSignal = t.momentum_rating ? formatSignalRating(t.momentum_rating) : '';
    const momScore = t.momentum_score != null ? `${t.momentum_score}/10` : '';
    const momParts = [momGrade, momCount, momSignal, momScore].filter(Boolean);

    const inv = invParts.length ? `Inv: ${invParts.join(' · ')}` : '';
    const mom = momParts.length ? `Mom: ${momParts.join(' · ')}` : '';
    const signals = [inv, mom].filter(Boolean).join('  |  ');
    const name = t.name ? ` — ${t.name}` : '';
    return signals ? `${sym}${name}  ·  ${signals}` : `${sym}${name}`;
  }

  function watchlistTickerFields(w) {
    return {
      value_grade: w.value_grade,
      gpa: w.gpa,
      investment_rating: w.investment_rating,
      investment_score: w.investment_score,
      momentum_grade: w.momentum_grade,
      momentum_count: w.momentum_count,
      momentum_rating: w.momentum_rating,
      momentum_score: w.momentum_score,
    };
  }

  function portfolioSignalCells(p) {
    const fields = watchlistTickerFields(p);
    return {
      inv: renderTickerModeCell(fields, 'investment'),
      mom: renderTickerModeCell(fields, 'momentum'),
      risk: renderWatchlistRiskCell(p.risk_rating),
    };
  }

  function renderWatchlistRiskCell(rating) {
    if (!rating) return '—';
    return `<span class="signal-rating ${ratingClass(rating)}">${esc(formatSignalRating(rating))}</span>`;
  }

  function renderWatchlistTable(items) {
    if (!items?.length) return '<p class="muted">No symbols yet — add one above.</p>';
    const purpose = items[0]?.purpose ?? 'investment';
    const headers = ['Symbol', '1M %', 'Last', 'Sector', 'Inv', 'Mom', 'Risk', ''];
    let html = `<div class="table-wrap"><table class="watchlist-table"><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    for (const w of items) {
      const sym = `<div class="watch-symbol-cell"><span class="clickable" data-symbol="${esc(w.symbol)}"><strong>${esc(w.symbol)}</strong></span>${w.name ? `<div class="watch-name muted">${esc(w.name)}</div>` : ''}</div>`;
      const cells = [
        sym,
        roc1mCell(w.roc_1m_pct),
        w.last_close != null ? `৳${fmtNum(w.last_close)}` : '—',
        esc(w.sector ?? '—'),
        renderTickerModeCell(watchlistTickerFields(w), 'investment'),
        renderTickerModeCell(watchlistTickerFields(w), 'momentum'),
        renderWatchlistRiskCell(w.risk_rating),
        `<div class="watchlist-row-actions"><button type="button" class="btn-sm watch-open" data-symbol="${esc(w.symbol)}">Analysis</button><button type="button" class="btn-sm rm-watch" data-symbol="${esc(w.symbol)}" data-purpose="${esc(purpose)}">Remove</button></div>`,
      ];
      html += `<tr>${cells.map((c, i) => {
        const cls = i === 4 || i === 5 ? ' class="ticker-signal-col"' : i === 7 ? ' class="watchlist-actions-col"' : '';
        return `<td${cls}>${c}</td>`;
      }).join('')}</tr>`;
    }
    return `${html}</table></div>`;
  }

  function renderPortfolioTable(positions, { compact = false, purpose = 'investment', showActions = !compact } = {}) {
    if (!positions?.length) return '<p class="muted">No open positions.</p>';

    const sorted = [...positions].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
    const headers = compact
      ? ['Symbol', 'Qty', '1M %', 'Last', 'Sector', 'P&amp;L %', 'Inv', 'Mom', 'Risk']
      : ['Ticker', 'Qty', 'Avg', '1M %', 'Last', 'Sector', 'P&amp;L', 'Inv', 'Mom', 'Risk', 'Buy history', ''];

    let html = `<table><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
    for (const p of sorted) {
      const sym = `<span class="clickable" data-symbol="${esc(p.ticker)}">${esc(p.ticker)}</span>`;
      const pnlCell = compact
        ? (p.pnl_pct != null ? `<span class="${p.pnl_pct >= 0 ? 'pos' : 'neg'}">${fmtPct(p.pnl_pct)}</span>` : '—')
        : (p.pnl != null ? `৳${fmtNum(p.pnl, 0)} (${fmtPct(p.pnl_pct)})` : '—');
      const signals = portfolioSignalCells(p);
      const cells = compact
        ? [sym, fmtNum(p.qty, 0), roc1mCell(p.roc_1m_pct), fmtNum(p.last_close), esc(p.sector ?? '—'), pnlCell, signals.inv, signals.mom, signals.risk]
        : [sym, fmtNum(p.qty, 0), fmtNum(p.avg_cost), roc1mCell(p.roc_1m_pct), fmtNum(p.last_close), esc(p.sector ?? '—'), pnlCell, signals.inv, signals.mom, signals.risk, portfolioFillButton(p, purpose), portfolioActionButtons(p, purpose, showActions)];
      const signalCols = compact ? new Set([6, 7, 8]) : new Set([7, 8, 9]);
      html += `<tr>${cells.map((c, i) => {
        const cls = signalCols.has(i) ? ' class="ticker-signal-col"' : '';
        return `<td${cls}>${c}</td>`;
      }).join('')}</tr>`;
    }
    if (!compact && sorted.length) {
      const totalCost = sorted.reduce((s, p) => s + (p.cost_basis ?? 0), 0);
      const totalMv = sorted.reduce((s, p) => s + (p.market_value ?? 0), 0);
      const totalUg = totalMv - totalCost;
      const ugClass = totalUg >= 0 ? 'pos' : 'neg';
      html += `<tfoot><tr class="portfolio-totals-row"><td colspan="${headers.length}">`
        + `<span class="portfolio-total-item">Total Cost <strong>৳${fmtNum(totalCost, 0)}</strong></span>`
        + `<span class="portfolio-total-item portfolio-total-item-primary">Total Value <strong>৳${fmtNum(totalMv, 0)}</strong></span>`
        + `<span class="portfolio-total-item ${ugClass}">UG <strong>৳${fmtNum(totalUg, 0)}</strong></span>`
        + `</td></tr></tfoot>`;
    }
    return html + '</table>';
  }

  function renderPortfolioBrokerBar(metrics, account) {
    const m = metrics ?? {};
    const inv = m.investment ?? {
      total_market_value: m.total_market_value,
      total_cost_basis: m.total_cost_basis,
      net_gain_bdt: m.net_gain_bdt,
    };
    const tr = m.trading ?? {};
    const lb = m.loan_balance_bdt ?? account?.loan_balance_bdt;
    const pp = m.purchasing_power_bdt ?? account?.purchasing_power_bdt;
    const equity = m.equity_bdt ?? account?.capital_bdt;
    const fmtMoney = (v) => (v != null && !Number.isNaN(v) ? `৳${fmtNum(v, 0)}` : '—');
    const netClass = (v) => (v != null && v >= 0 ? 'pos' : 'neg');

    function bookMetrics(book, label, primaryClass) {
      const ug = book.net_gain_bdt;
      return `<div class="portfolio-broker-book">`
        + `<div class="portfolio-broker-book-title">${label}</div>`
        + `<div class="portfolio-broker-book-metrics">`
        + `<div class="broker-metric ${primaryClass}">`
        + `<div class="broker-metric-value">${fmtMoney(book.total_market_value)}</div>`
        + `<div class="broker-metric-label">Total Value</div>`
        + `</div>`
        + `<div class="broker-metric">`
        + `<div class="broker-metric-value">${fmtMoney(book.total_cost_basis)}</div>`
        + `<div class="broker-metric-label">Cost</div>`
        + `</div>`
        + `<div class="broker-metric">`
        + `<div class="broker-metric-value ${netClass(ug)}">${fmtMoney(ug)}</div>`
        + `<div class="broker-metric-label">Net Gain</div>`
        + `</div>`
        + `</div></div>`;
    }

    return `<div class="portfolio-broker-bar">
      <div class="portfolio-broker-books">
        ${bookMetrics(inv, 'Investment', 'broker-metric-primary')}
        ${bookMetrics(tr, 'Momentum trading', 'broker-metric-trading')}
      </div>
      <div class="portfolio-broker-account-metrics">
        <div class="broker-metric">
          <div class="broker-metric-value">${fmtMoney(equity)}</div>
          <div class="broker-metric-label">Equity</div>
        </div>
        <div class="broker-metric">
          <div class="broker-metric-value">${fmtMoney(lb)}</div>
          <div class="broker-metric-label">LB</div>
        </div>
        <div class="broker-metric">
          <div class="broker-metric-value">${fmtMoney(pp)}</div>
          <div class="broker-metric-label">PP</div>
        </div>
      </div>
      <form class="portfolio-broker-edit toolbar wrap" id="portfolio-broker-form">
        <label>LB <input type="number" name="loan_balance_bdt" step="any" placeholder="Loan balance" value="${lb != null ? lb : ''}" /></label>
        <label>PP <input type="number" name="purchasing_power_bdt" step="any" placeholder="Purchasing power" value="${pp != null ? pp : ''}" /></label>
        <label>Equity <input type="number" name="equity_bdt" step="any" placeholder="Equity" value="${equity != null ? equity : ''}" /></label>
        <button type="submit" class="btn-sm">Save account</button>
        <span class="muted">Book totals are computed from holdings (last close × qty). Broker fields sync manually.</span>
      </form>
    </div>`;
  }

  function renderPortfolioSummary(portfolio) {
    const purpose = portfolio?.purpose ?? 'investment';
    const bookLabel = purpose === 'trading' ? 'Momentum trading' : 'Investment';
    if (!portfolio?.positions?.length) {
      return `<span class="muted">${purpose === 'trading' ? 'No trading positions — add fills below or move from investment.' : 'No investment positions.'}</span>`;
    }
    const metrics = portfolio.book_metrics ?? {};
    const totalCost = metrics.total_cost_basis ?? portfolio.total_cost_basis ?? portfolio.positions.reduce((s, p) => s + (p.cost_basis ?? 0), 0);
    const totalMv = metrics.total_market_value ?? portfolio.positions.reduce((s, p) => s + (p.market_value ?? 0), 0);
    const totalPnl = metrics.unrealized_gain ?? (totalMv - totalCost);
    const pnlPct = metrics.unrealized_gain_pct ?? (totalCost > 0 ? (totalPnl / totalCost) * 100 : null);
    const pnlClass = totalPnl >= 0 ? 'pos' : 'neg';
    const pctLabel = pnlPct != null ? ` (${fmtPct(pnlPct)})` : '';
    return `<div class="portfolio-book-summary" data-purpose="${esc(purpose)}">`
      + `<span class="portfolio-book-label">${bookLabel}</span>`
      + `<span class="portfolio-book-stat portfolio-book-stat-primary">Total Value <strong>৳${fmtNum(totalMv, 0)}</strong></span>`
      + `<span class="portfolio-book-stat">Cost <strong>৳${fmtNum(totalCost, 0)}</strong></span>`
      + `<span class="portfolio-book-stat ${pnlClass}">UG <strong>৳${fmtNum(totalPnl, 0)}${pctLabel}</strong></span>`
      + `<span class="portfolio-book-stat muted">${portfolio.positions.length} positions</span>`
      + `</div>`;
  }

  function renderTradingMirrorBanner() {
    return '';
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

  function renderDualRiskStackWithMy(atrDisplay, structDisplay, myValue, atrLines, structLines) {
    let stack = renderDualRiskStack(atrDisplay, structDisplay, atrLines, structLines);
    if (myValue == null) return stack;
    const myRow = `<div class="risk-dual-row risk-my-row"><span class="risk-dual-label">My</span>৳${fmtNum(myValue)}</div>`;
    if (stack === '—') return `<div class="risk-dual-cell">${myRow}</div>`;
    return `${stack.slice(0, -6)}${myRow}</div>`;
  }

  function portfolioFillButton(p, purpose) {
    const count = p.fill_count ?? 0;
    const label = count > 0 ? (count === 1 ? '1 fill' : `${count} fills`) : 'History';
    return `<button type="button" class="btn-sm view-fills" data-symbol="${esc(p.ticker)}" data-purpose="${esc(p.fills_purpose ?? purpose)}" data-qty="${p.qty ?? 0}" title="View buy history">${label}</button>`;
  }

  function portfolioActionButtons(p, purpose, showActions) {
    if (!showActions) return '';
    const sym = esc(p.ticker);
    const moveTo = purpose === 'investment' ? 'trading' : 'investment';
    const moveLabel = purpose === 'investment' ? '→ Trading' : '→ Investment';
    return `<div class="portfolio-actions">`
      + `<button type="button" class="btn-sm move-pos" data-symbol="${sym}" data-from="${esc(purpose)}" data-to="${esc(moveTo)}" data-qty="${p.qty ?? 0}" title="Move shares to ${esc(moveTo)}">${moveLabel}</button>`
      + `<button type="button" class="btn-sm del-pos" data-symbol="${sym}" data-purpose="${esc(purpose)}" title="Remove">×</button>`
      + `</div>`;
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

    const stopDisplay = atr.stop_loss != null ? `৳${fmtNum(atr.stop_loss)}` : null;
    const structStopDisplay = struct.stop_loss != null ? `৳${fmtNum(struct.stop_loss)}` : null;
    const stop = renderDualRiskStackWithMy(
      stopDisplay,
      structStopDisplay,
      p.stop_level,
      [...atrBase, '<strong>Formula</strong> entry − 2×ATR', analysisFooter],
      [...structBase, '<strong>Formula</strong> support − 0.5×ATR', analysisFooter],
    );

    const targetDisplay = atr.target != null ? `৳${fmtNum(atr.target)}` : null;
    const structTargetDisplay = struct.target != null ? `৳${fmtNum(struct.target)}` : null;
    const target = renderDualRiskStackWithMy(
      targetDisplay,
      structTargetDisplay,
      p.target_level,
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
      : ['Ticker', 'Qty', 'Avg', 'Last', 'Sector', 'P&amp;L', 'Buy zone', 'Stop-loss', 'Target', 'Position size', 'Buy history', 'Mom', 'Risk', ''];
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
      const signals = portfolioSignalCells(p);
      const cells = compact
        ? [sym, fmtNum(p.qty, 0), fmtNum(p.last_close), pnlCell, risk.buyZone, risk.stop, risk.target, risk.size]
        : [sym, fmtNum(p.qty, 0), fmtNum(p.avg_cost), fmtNum(p.last_close), esc(p.sector ?? '—'), pnlCell, risk.buyZone, risk.stop, risk.target, risk.size, portfolioFillButton(p, purpose), signals.mom, signals.risk];
      if (showActions) {
        cells.push(portfolioActionButtons(p, purpose, showActions));
      }
      const signalCols = compact ? new Set() : new Set([11, 12]);
      html += `<tr>${cells.map((c, i) => {
        const cls = signalCols.has(i) ? ' class="ticker-signal-col"' : '';
        return `<td${cls}>${c}</td>`;
      }).join('')}</tr>`;
    }
    if (!compact && sorted.length) {
      const totalCost = sorted.reduce((s, p) => s + (p.cost_basis ?? 0), 0);
      const totalMv = sorted.reduce((s, p) => s + (p.market_value ?? 0), 0);
      const totalUg = totalMv - totalCost;
      const ugClass = totalUg >= 0 ? 'pos' : 'neg';
      html += `<tfoot><tr class="portfolio-totals-row"><td colspan="${headers.length}">`
        + `<span class="portfolio-total-item">Total Cost <strong>৳${fmtNum(totalCost, 0)}</strong></span>`
        + `<span class="portfolio-total-item portfolio-total-item-primary">Total Value <strong>৳${fmtNum(totalMv, 0)}</strong></span>`
        + `<span class="portfolio-total-item ${ugClass}">UG <strong>৳${fmtNum(totalUg, 0)}</strong></span>`
        + `</td></tr></tfoot>`;
    }
    const structureNote = anyMissingStructure
      ? '<p class="muted portfolio-structure-hint">Struct rows appear after <strong>Analyze Full</strong> on each symbol (snapshots before dual-strategy risk-manager show ATR only).</p>'
      : '<p class="muted portfolio-structure-hint">Each level shows <span class="risk-dual-label">ATR</span> and <span class="risk-dual-label">Struct</span> — hover for formulas.</p>';
    return structureNote + html + '</table>';
  }

  function renderPortfolioFillsModal(data) {
    if (!data) return '<p class="muted">No buy history.</p>';
    const pos = data.position;
    const purpose = data.purpose ?? 'investment';
    const symbol = data.symbol ?? '';
    const maxQty = pos?.qty ?? 0;
    const summary = pos
      ? `<p class="portfolio-fills-summary">Total <strong>${fmtNum(pos.qty, 0)}</strong> shares · weighted avg <strong>৳${fmtNum(pos.avg_cost, 2)}</strong> · cost basis <strong>৳${fmtNum(pos.cost_basis, 0)}</strong></p>`
      : '<p class="portfolio-fills-summary muted">No open position — add a fill below.</p>';
    const moveTo = purpose === 'investment' ? 'trading' : 'investment';
    const moveTargetLabel = purpose === 'investment' ? 'momentum trading' : 'investment';
    const today = new Date().toISOString().slice(0, 10);
    const addFillForm = symbol
      ? `<form class="portfolio-add-fill-form toolbar wrap" id="portfolio-add-fill-form">`
        + `<span class="portfolio-add-fill-label"><strong>Add fill</strong> (split into lots)</span>`
        + `<label>Date <input type="date" name="trade_date" value="${today}" required /></label>`
        + `<label>Qty <input type="number" name="qty" min="1" step="1" placeholder="Shares" required /></label>`
        + `<label>Price <input type="number" name="price" min="0.01" step="any" placeholder="Avg cost" required /></label>`
        + `<label>Notes <input type="text" name="notes" placeholder="Optional" /></label>`
        + `<button type="submit" class="btn-sm">Add fill</button>`
        + `</form>`
      : '';
    const moveForm = symbol && maxQty > 0
      ? `<form class="portfolio-move-qty-form toolbar wrap" id="portfolio-move-qty-form">`
        + `<span class="portfolio-move-qty-label"><strong>Move shares</strong> to ${esc(moveTargetLabel)} (FIFO)</span>`
        + `<label>Qty <input type="number" name="move_qty" min="1" max="${maxQty}" step="1" value="${maxQty}" required /></label>`
        + `<button type="submit" class="btn-sm move-pos-from-modal" data-symbol="${esc(symbol)}" data-from="${esc(purpose)}" data-to="${esc(moveTo)}" data-max-qty="${maxQty}">Move</button>`
        + `<span class="muted">Oldest lots move first — or use <strong>→ Trading</strong> on a single row below.</span>`
        + `</form>`
      : '';
    const toolbar = symbol
      ? `<div class="portfolio-fills-toolbar">${addFillForm}${moveForm}</div>`
      : '';
    if (!data.fills?.length) {
      return summary + toolbar + '<p class="muted">No individual fills yet — add fills above to split this position into purchase lots.</p>';
    }
    let html = `${summary}${toolbar}<div class="table-wrap"><table class="portfolio-fills-table"><tr><th>Trade date</th><th>Qty</th><th>Price</th><th>Total cost</th><th>Notes</th><th></th></tr>`;
    for (const fill of data.fills) {
      const canSplit = fill.qty > 1;
      const lotMoveLabel = purpose === 'investment' ? '→ Trading' : '→ Inv';
      const lotMoveTo = purpose === 'investment' ? 'trading' : 'investment';
      const notesAttr = fill.notes ? esc(fill.notes) : '';
      html += `<tr class="fill-row" data-fill-id="${fill.id}">`
        + `<td class="fill-view">${esc(fmtDate(fill.trade_date))}</td>`
        + `<td class="fill-view">${fmtNum(fill.qty, 0)}</td>`
        + `<td class="fill-view">৳${fmtNum(fill.price, 2)}</td>`
        + `<td class="fill-view">৳${fmtNum(fill.total_cost, 0)}</td>`
        + `<td class="fill-view">${fill.notes ? esc(fill.notes) : '<span class="muted">—</span>'}</td>`
        + `<td class="fill-actions fill-view">`
        + `<button type="button" class="btn-sm move-fill" data-fill-id="${fill.id}" data-to="${lotMoveTo}" data-symbol="${esc(symbol)}" data-from="${esc(purpose)}" data-fill-qty="${fill.qty}" data-fill-price="${fill.price}" data-fill-date="${esc(String(fill.trade_date).slice(0, 10))}"${notesAttr ? ` data-fill-notes="${notesAttr}"` : ''} title="Move this fill only">${lotMoveLabel}</button> `
        + (canSplit ? `<button type="button" class="btn-sm split-fill" data-fill-id="${fill.id}" data-max-qty="${fill.qty - 1}" title="Split into two lots">Split</button> ` : '')
        + `<button type="button" class="btn-sm edit-fill" data-fill-id="${fill.id}">Edit</button> `
        + `<button type="button" class="btn-sm del-fill" data-fill-id="${fill.id}" data-fill-qty="${fill.qty}" data-fill-date="${esc(String(fill.trade_date).slice(0, 10))}">Delete</button>`
        + `</td>`
        + `<td class="fill-split hidden" colspan="6">`
        + `<div class="fill-split-form toolbar wrap">`
        + `<label>Split off <input type="number" class="fill-split-qty" min="1" max="${fill.qty - 1}" step="1" placeholder="Shares" /></label>`
        + `<label>Price <input type="number" class="fill-split-price" min="0.01" step="any" placeholder="${fmtNum(fill.price, 2)}" title="Cost for split portion — remainder avg is adjusted" /></label>`
        + `<span class="fill-split-preview muted"></span>`
        + `<span class="muted">from ${fmtNum(fill.qty, 0)} @ ৳${fmtNum(fill.price, 2)} — total cost stays ৳${fmtNum(fill.total_cost, 0)}</span>`
        + `<button type="button" class="btn-sm save-split" data-fill-id="${fill.id}" data-lot-qty="${fill.qty}" data-lot-price="${fill.price}">Split lot</button>`
        + `<button type="button" class="btn-sm cancel-split" data-fill-id="${fill.id}">Cancel</button>`
        + `</div></td>`
        + `<td class="fill-edit hidden" colspan="6">`
        + `<div class="fill-edit-form toolbar wrap">`
        + `<label>Date <input type="date" class="fill-edit-date" value="${esc(String(fill.trade_date).slice(0, 10))}" /></label>`
        + `<label>Qty <input type="number" class="fill-edit-qty" value="${fill.qty}" min="1" step="1" /></label>`
        + `<label>Price <input type="number" class="fill-edit-price" value="${fill.price}" min="0.01" step="any" /></label>`
        + `<label>Notes <input type="text" class="fill-edit-notes" value="${String(fill.notes ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}" placeholder="Optional" /></label>`
        + `<button type="button" class="btn-sm save-fill" data-fill-id="${fill.id}">Save</button>`
        + `<button type="button" class="btn-sm cancel-fill-edit" data-fill-id="${fill.id}">Cancel</button>`
        + `</div></td>`
        + `</tr>`;
    }
    return html + '</table></div>';
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
      tradingMirrorBanner: '',
      tradingTable: renderMomentumPortfolioTable(trading?.positions, {
        compact: true,
        purpose: 'trading',
        showActions: true,
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
      rankedPreview: renderHomeRankedPreview(data.topRanked),
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

  function macroClaudePrompt(sector, scope) {
    const label = sector ? `${sector} (${scope ?? 'Bangladesh + global'})` : 'cross-sector spending and macro themes';
    return `Run sector_macro_insights for ${label}. Research Bangladesh and global drivers, cite sources, and save memo to Stock Buddy via upsert_research_memo.`;
  }

  /** Collect checklist labels still waiting on data (passed === null). */
  function checklistPendingLabels(vc) {
    if (!vc?.criteria?.length) return [];
    return vc.criteria.filter((c) => c.passed == null).map((c) => c.label);
  }

  function symbolListForPrompt(symbols) {
    const list = [...new Set((symbols ?? []).map((s) => String(s).toUpperCase()).filter(Boolean))];
    return list.length ? list.join(', ') : '(no symbols)';
  }

  /** Shared per-ticker steps — same workflow used to fill UPGDCL value checklist gaps. */
  function claudeCompleteTickerSteps(sym, { pendingLabels, includePortfolio } = {}) {
    const pending = (pendingLabels ?? []).length
      ? `\nKnown ⏳ checklist rows for this stock: ${pendingLabels.join('; ')}`
      : '';
    const portfolioNote = includePortfolio
      ? '\n- Use get_ticker_contract_for_analysis({ include_portfolio: true }) for risk gates.'
      : '';

    return `══ COMPLETE DATA FILL: ${sym} (DSE) ══
Goal: fill the 30-point value checklist like UPGDCL — ingest scrapes first, then research only true gaps, save to Postgres.${pending}

MCP: stock-buddy-data (DB) + stock-buddy (skills). Repo root: npm run ingest / npm run ingest:one.

A) INGEST — write to database
1. stock-buddy-data.get_ticker_contract({ ticker: "${sym}", ohlcv_days: 260${includePortfolio ? ', include_portfolio: true' : ''} })
   → note _meta.missing
2. Refresh all data (pick one):
   • stock-buddy-data.trigger_ingest({ ticker: "${sym}", job: "all", days: 365 })  [needs STOCK_BUDDY_DATA_ADMIN=1]
   • OR shell: npm run ingest -- --ticker ${sym} --job all --days 365
3. npm run ingest -- --ticker ${sym} --job fundamentals   (StockAnalysis stats + DSE EPS history merge)
4. npm run ingest -- --ticker ${sym} --job analysis       (value checklist + agent snapshot)${portfolioNote}

B) VERIFY coverage
5. stock-buddy-data.get_fundamentals({ ticker: "${sym}" }) — expect fields like:
   pe, pb, roe, debt_to_equity, profit_margin, dividend_yield, eps_history[], earnings_growth,
   revenue_growth, current_ratio, operating_margin, return_on_assets, interest_coverage,
   free_cash_flow, institution_ownership, inventory_turnover, peg, moat (proxy)
6. stock-buddy-data.get_ticker_contract_for_analysis({ ticker: "${sym}", ohlcv_days: 260 })
7. stock-buddy.value_investment_checklist(<contract>) — count criteria where passed === null (⏳)
   Target: 27+/30 evaluable; grade should not be dominated by missing rows.

C) RESEARCH only fields still ⏳ after ingest (credible sources + citations)
   ncav_per_share — balance sheet: (current assets − total liabilities) / shares
   intrinsic_value — fair_value_median from fundamental-analysis or Graham/DCF
   inventory_turnover_prev — prior-year turnover from annual report (for "improving" test)
   insider_buying — DSE sponsor/director trading disclosures
   buyback — corporate announcements / share count YoY from filings
   moat — qualitative override if ROE/margin proxy is insufficient
   Ratios as decimals (0.15 = 15%). Never fabricate shareholding %.

D) PERSIST research lineage
8. stock-buddy-data.upsert_research_sources({
     ticker: "${sym}",
     session_id: "complete-data-fill-${sym}",
     client_id: "claude",
     sources: [{ url, title, publisher, category: "fundamentals", extracted_facts: { ... } }]
   })
9. If shareholding verified from filing: promote_shareholding on upsert_research_sources
10. stock-buddy-data.upsert_research_memo({
      ticker: "${sym}",
      title: "${sym} — complete data fill memo",
      body_md: "<what was ingested vs researched>",
      summary_json: { checklist_grade, criteria_evaluated, remaining_gaps },
      link_all_ticker_sources: true
    })
11. Re-run ingest analysis after any manual facts:
    npm run ingest -- --ticker ${sym} --job fundamentals && npm run ingest -- --ticker ${sym} --job analysis

E) REPORT
   • Value grade (GPA), passed/total, list any remaining ⏳ rows
   • Sources used · as_of dates
   Educational analysis only. Not financial advice.`;
  }

  function claudeTickerCompletePrompt(symbol, pendingLabels) {
    const sym = String(symbol ?? 'LHB').toUpperCase();
    return claudeCompleteTickerSteps(sym, { pendingLabels });
  }

  function claudeTickerIngestPrompt(symbol) {
    return claudeTickerCompletePrompt(symbol, []);
  }

  function claudeTickerResearchPrompt(symbol, pendingLabels) {
    const sym = String(symbol ?? 'LHB').toUpperCase();
    return `Focus on RESEARCH + PERSIST for ${sym} — ingest already ran but checklist rows are still ⏳.

${claudeCompleteTickerSteps(sym, { pendingLabels })}

Start at step C (skip A if fundamentals snapshot is fresh today).`;
  }

  function claudeBatchCompletePrompt(symbols, { purpose, type, includePortfolio } = {}) {
    const list = symbolListForPrompt(symbols);
    const mode = purpose === 'trading' ? 'momentum' : 'investment';
    const batchLabel = type === 'portfolio' ? 'portfolio holdings' : 'watchlist';
    const count = (symbols ?? []).filter(Boolean).length;

    return `COMPLETE DATA FILL — ALL ${batchLabel.toUpperCase()} SYMBOLS (${count} stocks)
Same workflow used for UPGDCL: ingest → verify checklist → research gaps → save to Postgres.

Symbols (${mode}): ${list}

RULES
• Process ONE symbol at a time; print a progress line after each.
• Do not skip ingest — scrapers fill most Buffett/Graham/Lynch fields automatically.
• Only web-research fields still ⏳ after step B.
• Save upsert_research_sources + upsert_research_memo per symbol with gaps.

FOR EACH SYMBOL (replace SYMBOL):
${claudeCompleteTickerSteps('SYMBOL', { includePortfolio: includePortfolio ?? type === 'portfolio' })}

AFTER ALL SYMBOLS — summary table:
| Symbol | Value grade | Evaluated | ⏳ left | Ingest OK? | Memo saved? |

Sort by most ⏳ rows first. Flag ingest failures (0 OHLCV, empty fundamentals).
Educational analysis only. Not financial advice.`;
  }

  function claudeWatchlistBatchPrompt(symbols, purpose) {
    return claudeBatchCompletePrompt(symbols, { purpose, type: 'watchlist', includePortfolio: false });
  }

  function claudePortfolioBatchPrompt(symbols, purpose) {
    return claudeBatchCompletePrompt(symbols, { purpose, type: 'portfolio', includePortfolio: true });
  }

  function renderClaudePromptChip(label, promptText) {
    return `<button type="button" class="cmd-quick-chip claude-prompt-chip" data-copy-cmd="${cmdAttr(promptText)}">${esc(label)}</button>`;
  }

  function renderTickerClaudePrompts(symbol, vc) {
    if (!symbol) return '';
    const sym = String(symbol).toUpperCase();
    const pending = checklistPendingLabels(vc);
    const pendingNote = pending.length
      ? `<p class="muted">${pending.length} checklist row(s) still waiting on data.</p>`
      : '<p class="muted">Checklist mostly complete — use ingest prompt to refresh from latest sources.</p>';
    const pendingList = pending.length
      ? `<ul class="claude-pending-list muted">${pending.slice(0, 6).map((l) => `<li>${esc(l)}</li>`).join('')}${pending.length > 6 ? `<li>…and ${pending.length - 6} more</li>` : ''}</ul>`
      : '';

    return `
      <div class="claude-prompt-wrap">
        <p class="claude-prompt-kicker muted">Claude / Cursor MCP — full data fill (ingest → checklist → research gaps → save DB), same as UPGDCL workflow</p>
        <div class="macro-two-col claude-prompt-grid">
          <section class="macro-panel-block">
            <h3>Complete data fill</h3>
            <p class="muted">Ingest all sources, run analysis, research any remaining ⏳ checklist rows, persist memos.</p>
            ${renderClaudePromptChip('Copy Claude prompt (complete fill)', claudeTickerCompletePrompt(sym, pending))}
          </section>
          <section class="macro-panel-block">
            <h3>Research gaps only</h3>
            ${pendingNote}
            ${pendingList}
            <p class="muted">Use if ingest already ran today but rows are still ⏳.</p>
            ${renderClaudePromptChip('Copy Claude prompt (gaps only)', claudeTickerResearchPrompt(sym, pending))}
          </section>
        </div>
      </div>`;
  }

  function renderBatchClaudePrompts({ title, description, symbols, purpose, type }) {
    const list = (symbols ?? []).map((s) => String(s).toUpperCase()).filter(Boolean);
    const count = list.length;
    const empty = count === 0;
    const promptFn = type === 'portfolio' ? claudePortfolioBatchPrompt : claudeWatchlistBatchPrompt;
    const prompt = empty ? '' : promptFn(list, purpose);

    return `
      <div class="claude-prompt-wrap batch-claude-prompts">
        <h3 class="claude-batch-title">${esc(title)}</h3>
        <p class="muted">${esc(description)}</p>
        ${empty
          ? '<p class="muted">No symbols yet — add holdings or watchlist names first.</p>'
          : `<p class="muted"><strong>${count}</strong> symbol${count === 1 ? '' : 's'}: ${esc(list.join(', '))}</p>
             <p class="muted">Each symbol: ingest → verify 30-point checklist → research NCAV/moat/etc. → upsert_research_sources → memo.</p>
             ${renderClaudePromptChip(`Copy Claude prompt — complete fill (${count} stocks)`, prompt)}`}
      </div>`;
  }

  function renderMacroBangladeshBlock(bd) {
    const macroSnap = bd?.macro;
    const regime = bd?.regime;
    if (!macroSnap?.payload && !regime) {
      return renderMacroPanel(null);
    }
    const payload = macroSnap?.payload ?? {};
    const assessed = regime
      ? {
          rating: regime.rating,
          score: regime.score,
          confidence: regime.confidence,
          key_metrics: { risk_multiplier: regime.risk_multiplier, drivers: regime.drivers },
          reasoning: regime.reasoning,
          flags: regime.flags,
        }
      : assessMacroRegime(payload);
    const meta = REGIME_META[assessed.rating] ?? { label: assessed.rating ?? '—', tone: 'neutral', hint: '' };
    const mult = assessed.key_metrics?.risk_multiplier ?? 1;
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

    return `
      <div class="macro-wrap macro-bd-block">
        <div class="macro-hero tone-${meta.tone}">
          <div class="macro-hero-main">
            <p class="macro-hero-kicker">Bangladesh macro regime</p>
            <div class="macro-hero-regime">
              <span class="grade-badge lg macro-regime-badge">${esc(meta.label)}</span>
              <span class="score-pill">score ${fmtNum(assessed.score, 2)}</span>
              ${confidenceBadge(assessed.confidence)}
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
          </div>
        </div>
        <h3 class="macro-section-title">Key indicators</h3>
        <div class="cards macro-metrics">${numericCards}</div>
        <h3 class="macro-section-title">Qualitative factors</h3>
        <div class="macro-qual-grid">${qualCards}</div>
        <div class="macro-two-col">
          <section class="macro-panel-block">
            <h3 class="macro-section-title">Factor drivers</h3>
            ${renderMacroDriverBars(assessed.key_metrics?.drivers)}
          </section>
          <section class="macro-panel-block">
            <h3 class="macro-section-title">Reasoning</h3>
            <ul class="reasoning-list macro-reasoning">${(assessed.reasoning ?? []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          </section>
        </div>
      </div>`;
  }

  function renderGlobalMacroBlock(globalBlock) {
    const ind = globalBlock?.indicators ?? {};
    const memo = globalBlock?.memo;
    const cards = [
      { key: 'fed_funds', label: 'Fed funds', fmt: (v) => fmtMacroPct(v) },
      { key: 'usd_index', label: 'USD index (DXY)', fmt: (v) => fmtNum(v, 1) },
      { key: 'brent_usd', label: 'Brent crude', fmt: (v) => `$${fmtNum(v, 1)}` },
      { key: 'us_10y', label: 'US 10Y yield', fmt: (v) => fmtMacroPct(v) },
      { key: 'china_pmi', label: 'China PMI', fmt: (v) => fmtNum(v, 1) },
      { key: 'em_risk', label: 'EM risk', fmt: (v) => esc(String(v)) },
    ].map(({ key, label, fmt }) => `
      <div class="card macro-metric-card">
        <div class="label">${esc(label)}</div>
        <div class="value">${ind[key] != null ? fmt(ind[key]) : '—'}</div>
      </div>`).join('');

    const memoHtml = memo
      ? `<div class="macro-insight-card"><h4>${esc(memo.title)}</h4><p class="muted">${esc(memo.as_of ?? '')}</p><ul>${(memo.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>`
      : `<p class="muted macro-empty-hint">No global analysis memo yet. Use Claude Desktop with <code>sector_macro_insights</code> (scope: global).</p>`;

    return `
      <section class="macro-landscape-section" id="macro-section-global">
        <h2 class="macro-landscape-heading">Global macro</h2>
        <p class="muted macro-section-note">External drivers affecting Bangladesh sectors — rates, commodities, EM risk.</p>
        <div class="cards macro-metrics">${cards}</div>
        <div class="macro-insights-block">${memoHtml}</div>
        <button type="button" class="cmd-quick-chip macro-claude-prompt" data-copy-cmd="${cmdAttr(macroClaudePrompt(null, 'global'))}">Copy Claude prompt (global)</button>
      </section>`;
  }

  function rocTone(pct) {
    if (pct == null) return 'neutral';
    if (pct >= 5) return 'good';
    if (pct <= -5) return 'bad';
    return 'neutral';
  }

  function renderSectorGrid(sectors) {
    if (!sectors?.length) {
      return `<p class="muted">No sector snapshots yet. Run <code>npm run ingest:daily</code> to aggregate sector metrics.</p>`;
    }
    const cards = sectors.map((s) => {
      const m = s.metrics ?? {};
      const roc = m.median_roc_1m_pct;
      const tone = rocTone(roc);
      return `
        <button type="button" class="macro-sector-card tone-${tone}" data-macro-sector="${esc(s.slug)}">
          <div class="macro-sector-name">${esc(s.display_name)}</div>
          <div class="macro-sector-roc ${tone}">${roc != null ? `${roc > 0 ? '+' : ''}${fmtNum(roc, 1)}%` : '—'}</div>
          <div class="macro-sector-meta muted"><span>${m.ticker_count ?? 0} tickers</span><span>${s.news_count_7d ?? 0} news</span></div>
        </button>`;
    }).join('');
    return `
      <section class="macro-landscape-section" id="macro-section-sectors">
        <h2 class="macro-landscape-heading">DSE sectors</h2>
        <p class="muted macro-section-note">Median 1-month return and news activity by sector. Click a sector for Bangladesh + global analysis.</p>
        <div class="macro-sector-grid">${cards}</div>
      </section>`;
  }

  function renderCrossSectorInsights(insights) {
    const cards = (insights ?? []).map((m) => `
      <div class="macro-insight-card"><h4>${esc(m.title)}</h4><p class="muted">${esc(m.as_of ?? m.created_at ?? '')}</p><ul>${(m.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div>`).join('');
    const empty = !insights?.length
      ? `<p class="muted">No cross-sector insights yet. Run via Claude:</p><button type="button" class="cmd-quick-chip macro-claude-prompt" data-copy-cmd="${cmdAttr(macroClaudePrompt(null, 'cross_sector'))}">Copy Claude prompt (cross-sector)</button>`
      : cards;
    return `
      <section class="macro-landscape-section" id="macro-section-insights">
        <h2 class="macro-landscape-heading">Cross-sector insights</h2>
        <p class="muted macro-section-note">Qualitative themes spanning multiple sectors — spending patterns, regulatory shifts, demand cycles.</p>
        <div class="macro-insights-grid">${empty}</div>
      </section>`;
  }

  function renderSectorDetail(detail) {
    if (!detail) return '<p class="muted">Sector not found.</p>';
    const m = detail.metrics ?? {};
    const bdMemo = detail.bangladesh_analysis?.[0];
    const glMemo = detail.global_analysis?.[0];
    const newsRows = (detail.news ?? []).map((n) => `
      <tr><td>${esc(n.published_date)}</td><td>${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.headline)}</a>` : esc(n.headline)}</td><td class="muted">${esc(n.source ?? '')}</td></tr>`).join('');

    return `
      <div class="macro-sector-detail">
        <button type="button" class="macro-back-btn" data-macro-back>← All sectors</button>
        <h2 class="macro-landscape-heading">${esc(detail.display_name)}</h2>
        <div class="cards macro-metrics macro-sector-stats">
          <div class="card macro-metric-card"><div class="label">1M median return</div><div class="value">${m.median_roc_1m_pct != null ? `${fmtNum(m.median_roc_1m_pct, 1)}%` : '—'}</div></div>
          <div class="card macro-metric-card"><div class="label">3M median return</div><div class="value">${m.median_roc_3m_pct != null ? `${fmtNum(m.median_roc_3m_pct, 1)}%` : '—'}</div></div>
          <div class="card macro-metric-card"><div class="label">Avg P/E</div><div class="value">${m.avg_pe != null ? fmtNum(m.avg_pe, 1) : '—'}</div></div>
          <div class="card macro-metric-card"><div class="label">vs sector benchmark</div><div class="value">${m.pe_vs_benchmark != null ? `${m.pe_vs_benchmark > 0 ? '+' : ''}${m.pe_vs_benchmark}%` : '—'}</div></div>
        </div>
        <div class="macro-sector-tabs">
          <section class="macro-panel-block"><h3>Bangladesh analysis</h3>${bdMemo ? `<h4>${esc(bdMemo.title)}</h4><ul>${(bdMemo.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '<p class="muted">No Bangladesh sector memo. Use Claude MCP skill to generate.</p>'}<button type="button" class="cmd-quick-chip macro-claude-prompt" data-copy-cmd="${cmdAttr(macroClaudePrompt(detail.display_name, 'Bangladesh'))}">Copy Claude prompt (BD)</button></section>
          <section class="macro-panel-block"><h3>Global analysis</h3>${glMemo ? `<h4>${esc(glMemo.title)}</h4><ul>${(glMemo.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : '<p class="muted">No global sector memo yet.</p>'}<button type="button" class="cmd-quick-chip macro-claude-prompt" data-copy-cmd="${cmdAttr(macroClaudePrompt(detail.display_name, 'global'))}">Copy Claude prompt (global)</button></section>
        </div>
        <section class="macro-panel-block"><h3>Sector news (7d)</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Headline</th><th>Source</th></tr></thead><tbody>${newsRows || '<tr><td colspan="3" class="muted">No recent news for this sector.</td></tr>'}</tbody></table></div></section>
      </div>`;
  }

  function renderMacroLandscape(landscape, sectorDetail) {
    if (sectorDetail) return renderSectorDetail(sectorDetail);
    const nav = `<nav class="macro-section-nav" aria-label="Macro sections"><a href="#macro" data-macro-scroll="macro-section-bd">Bangladesh</a><a href="#macro" data-macro-scroll="macro-section-global">Global</a><a href="#macro" data-macro-scroll="macro-section-sectors">Sectors</a><a href="#macro" data-macro-scroll="macro-section-insights">Insights</a></nav>`;
    return `${renderMacroPlainLead(landscape)}<div class="macro-landscape section-card">${nav}<section class="macro-landscape-section" id="macro-section-bd"><h2 class="macro-landscape-heading">Bangladesh</h2>${renderMacroBangladeshBlock(landscape?.bangladesh)}</section>${renderGlobalMacroBlock(landscape?.global)}${renderSectorGrid(landscape?.sectors)}${renderCrossSectorInsights(landscape?.cross_sector_insights)}</div>`;
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
        ${renderClaudePromptChip('Claude: complete data fill', claudeTickerCompletePrompt(sym, []))}
        ${renderClaudePromptChip('Claude: gaps only', claudeTickerResearchPrompt(sym, []))}
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

    const claudeSection = `
      <section class="cmd-group cmd-group-claude">
        <h4>Claude / Cursor MCP — complete data fill (${esc(sym)})</h4>
        <p class="muted cmd-group-note">Same workflow as UPGDCL: ingest all → value checklist → research ⏳ rows → upsert_research_sources → memo → re-analyze.</p>
        ${renderCommandRow({
          id: 'claude-complete',
          label: 'Complete data fill (recommended)',
          description: 'Full A→E pipeline: ingest, verify 30 criteria, research NCAV/moat/insider gaps, persist to Postgres.',
          command: (s) => claudeTickerCompletePrompt(s, []),
        }, sym)}
        ${renderCommandRow({
          id: 'claude-research',
          label: 'Research gaps only',
          description: 'Skip ingest if fresh; web research for remaining ⏳ checklist fields.',
          command: (s) => claudeTickerResearchPrompt(s, []),
        }, sym)}
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

    return `<div class="cmd-full-wrap">${workflowSection}${claudeSection}${globalSections}${tickerSections}</div>`;
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
      if (obj.momentum_trading) {
        const mtLine = findJsonLine(jsonText, 'momentum_trading');
        add('momentum_trading', mtLine);
        if (obj.momentum_trading.summary?.buckets) {
          const bucketsLine = findJsonLine(jsonText, 'buckets', mtLine ?? 0);
          add('momentum_trading.summary.buckets', bucketsLine);
        }
        if (obj.momentum_trading.strategies) {
          const stratLine = findJsonLine(jsonText, 'strategies', mtLine ?? 0);
          add('momentum_trading.strategies', stratLine);
        }
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

  function compute52WeekRange(ohlcv) {
    if (!ohlcv?.length) return null;
    const window = ohlcv.slice(-252);
    let low = Infinity;
    let high = -Infinity;
    for (const b of window) {
      if (b.low != null) low = Math.min(low, b.low);
      if (b.high != null) high = Math.max(high, b.high);
      if (b.close != null) {
        low = Math.min(low, b.close);
        high = Math.max(high, b.close);
      }
    }
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    const last = ohlcv[ohlcv.length - 1]?.close;
    const pct = last != null && high > low ? ((last - low) / (high - low)) * 100 : null;
    return { low, high, last, pct };
  }

  function computeRecentMomentum(ohlcv) {
    if (!ohlcv?.length || ohlcv.length < 2) return null;
    const last = ohlcv[ohlcv.length - 1];
    const weekAgo = ohlcv[Math.max(0, ohlcv.length - 6)];
    const chg7d = weekAgo?.close && last?.close ? ((last.close - weekAgo.close) / weekAgo.close) * 100 : null;
    const recent = ohlcv.slice(-7);
    const upDays = recent.filter((b, i) => i > 0 && b.close > recent[i - 1].close).length;
    const avgVol = ohlcv.slice(-30).reduce((s, b) => s + (b.volume ?? 0), 0) / Math.min(30, ohlcv.length);
    const weekVol = recent.reduce((s, b) => s + (b.volume ?? 0), 0) / recent.length;
    const volMult = avgVol > 0 ? weekVol / avgVol : null;
    const prev = ohlcv[ohlcv.length - 2];
    const chg1d = prev?.close && last?.close ? ((last.close - prev.close) / prev.close) * 100 : null;
    return { chg7d, chg1d, upDays, volMult, lastClose: last?.close };
  }

  function gradeToScore(grade, gpa) {
    if (gpa != null && !Number.isNaN(gpa)) return Math.round((Number(gpa) / 4) * 100);
    const map = { 'A+': 95, A: 90, 'A-': 85, 'B+': 80, B: 75, 'B-': 70, 'C+': 65, C: 60, 'C-': 55, D: 45, F: 30 };
    return map[String(grade ?? '').trim()] ?? null;
  }

  function scoreBandClass(score) {
    const s = Number(score);
    if (Number.isNaN(s)) return 'hold';
    if (s >= 80) return 'strong-buy';
    if (s >= 60) return 'buy';
    if (s >= 45) return 'hold';
    return 'avoid';
  }

  function render52WeekRange(ohlcv) {
    const r = compute52WeekRange(ohlcv);
    if (!r) return '';
    const pos = r.pct != null ? Math.min(98, Math.max(2, r.pct)) : 50;
    let caption = 'Where today\'s price sits in its 52-week range';
    if (r.pct != null) {
      if (r.pct < 25) caption = 'Near its 1-year low';
      else if (r.pct > 75) caption = 'Near its 1-year high';
      else caption = 'In its normal range';
    }
    return `
      <div class="range-bar-52w">
        <div class="range-labels"><span>Low ৳${fmtNum(r.low)}</span><span>High ৳${fmtNum(r.high)}</span></div>
        <div class="range-track"><div class="range-marker" style="left:${pos}%"></div></div>
        <div class="range-caption">${esc(caption)}</div>
      </div>`;
  }

  function renderScoreBadge(grade, gpa, label) {
    const score = gradeToScore(grade, gpa);
    const band = scoreBandClass(score);
    const display = score != null ? score : '—';
    return `<div class="score-badge ${band}" title="Fundamental / value grade"><span class="score-num">${display}</span><span class="score-label">${esc(label ?? grade ?? 'Score')}</span></div>`;
  }

  function healthPillStatus(frac) {
    if (frac == null || Number.isNaN(frac)) return { cls: 'warn', text: 'No data' };
    if (frac >= 0.65) return { cls: 'pass', text: 'Strong' };
    if (frac >= 0.4) return { cls: 'warn', text: 'Mixed' };
    return { cls: 'fail', text: 'Weak' };
  }

  function renderHealthCheck(vc) {
    if (!vc?.key_metrics?.buckets) {
      return '<p class="muted">Run Analyze Investment to see health check.</p>';
    }
    const labels = {
      buffett: 'Profit',
      lynch: 'Business',
      graham: 'Valuation',
      quality: 'Money health',
    };
    const pills = Object.entries(vc.key_metrics.buckets).slice(0, 5).map(([key, data]) => {
      const row = data && typeof data === 'object' ? data : {};
      const frac = row.fraction ?? (row.total ? (row.criteria_met ?? 0) / row.total : null);
      const st = healthPillStatus(frac);
      return `<div class="health-pill ${st.cls}"><span class="pill-label">${esc(labels[key] ?? key)}</span><span class="pill-status">${esc(st.text)}</span></div>`;
    });
    if (pills.length < 5) {
      const divYield = vc.criteria?.find((c) => /dividend/i.test(c.label ?? ''));
      const divPass = divYield?.passed;
      const st = divPass === true ? { cls: 'pass', text: 'Reliable' } : divPass === false ? { cls: 'fail', text: 'Weak' } : { cls: 'warn', text: 'Some' };
      pills.push(`<div class="health-pill ${st.cls}"><span class="pill-label">Dividend</span><span class="pill-status">${esc(st.text)}</span></div>`);
    }
    return `<div class="section-card"><h4>The health check</h4><div class="health-check-row">${pills.join('')}</div></div>`;
  }

  function renderPlainVerdict(syn, vc, mt, ticker) {
    const inv = syn?.investment ?? {};
    const valGrade = vc?.rating ?? '—';
    const momGrade = mt?.summary?.rating ?? syn?.momentum?.rating ?? '—';
    const name = ticker?.name ?? ticker?.symbol ?? 'This stock';
    const reasoning = (vc?.reasoning ?? inv.reasoning ?? [])[0]
      ?? (Array.isArray(mt?.summary?.reasoning) ? mt.summary.reasoning[0] : null)
      ?? `Investment grade ${valGrade}, momentum ${momGrade}. Review tabs below for detail.`;
    const title = inv.rating ? `${esc(String(inv.rating))} — ${esc(name)}` : esc(name);
    return `
      <div class="verdict-banner">
        <p class="verdict-title">${title}</p>
        <p class="verdict-body">${esc(typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning))}</p>
        <p class="verdict-disclaimer">Educational analysis only — not financial advice.</p>
      </div>`;
  }

  function renderKeyNumbers(fundamentals, tickerData) {
    const p = fundamentals?.payload ?? {};
    const items = [
      ['EPS', p.eps_ttm != null ? `৳${fmtNum(p.eps_ttm)}` : p.eps != null ? `৳${fmtNum(p.eps)}` : '—'],
      ['P/E', p.pe_ratio != null ? fmtNum(p.pe_ratio, 1) : p.pe != null ? fmtNum(p.pe, 1) : '—'],
      ['Div yield', p.dividend_yield != null ? fmtPct(Number(p.dividend_yield) * (p.dividend_yield <= 1 ? 100 : 1)) : p.div_yield != null ? fmtPct(p.div_yield) : '—'],
      ['P/B', p.pb_ratio != null ? fmtNum(p.pb_ratio, 1) : '—'],
      ['ROE', p.roe != null ? fmtPct(p.roe) : '—'],
      ['Market cap', p.market_cap != null ? `৳${fmtNum(p.market_cap, 0)}` : '—'],
    ];
    return `
      <div class="section-card">
        <h4>Key numbers</h4>
        <div class="stat-grid">${items.map(([label, val]) =>
          `<div class="stat-item"><div class="stat-label">${esc(label)}</div><div class="stat-value">${val}</div></div>`,
        ).join('')}</div>
      </div>`;
  }

  function renderStockHero(ticker, ohlcv, analysis) {
    const sym = ticker?.symbol ?? '—';
    const name = ticker?.name ?? sym;
    const sector = ticker?.sector ?? '—';
    const mom = computeRecentMomentum(ohlcv);
    const last = mom?.lastClose;
    const chg = mom?.chg1d;
    const chgCls = chg == null ? '' : chg >= 0 ? 'up' : 'down';
    const chgSign = chg != null && chg >= 0 ? '+' : '';
    const vc = analysis?.value_investment_checklist;
    const syn = analysis?.synthesis;
    const grade = vc?.rating;
    const gpa = vc?.key_metrics?.gpa;
    const invScore = syn?.investment?.composite_1_10;

    return `
      <div class="stock-hero">
        <div class="stock-hero-top">
          <div class="stock-hero-title">
            <h2>${esc(name)}</h2>
            <div class="stock-hero-meta">
              <strong>${esc(sym)}</strong>
              <span class="sector-chip">${esc(sector)}</span>
              ${invScore != null ? `<span>Score ${invScore}/10</span>` : ''}
            </div>
            ${render52WeekRange(ohlcv)}
          </div>
          <div class="stock-hero-price">
            ${renderScoreBadge(grade, gpa, grade ?? 'Grade')}
            <div class="price-main">${last != null ? `৳${fmtNum(last)}` : '—'}</div>
            <div class="price-change ${chgCls}">${chg != null ? `${chgSign}${fmtNum(chg, 2)}% today` : ''}</div>
          </div>
        </div>
      </div>`;
  }

  function renderRecentMomentumBlock(ohlcv) {
    const m = computeRecentMomentum(ohlcv);
    if (!m) return '';
    const flat = m.chg7d != null && Math.abs(m.chg7d) < 0.5 ? 'Flat' : m.chg7d > 0 ? 'Rising' : 'Falling';
    return `
      <div class="section-card">
        <h4>Recent momentum</h4>
        <div class="stat-grid">
          <div class="stat-item"><div class="stat-label">Past week</div><div class="stat-value">${m.chg7d != null ? fmtPct(m.chg7d) : '—'}</div></div>
          <div class="stat-item"><div class="stat-label">Trend</div><div class="stat-value">${esc(flat)}</div></div>
          <div class="stat-item"><div class="stat-label">Volume</div><div class="stat-value">${m.volMult != null ? `${fmtNum(m.volMult, 1)}×` : '—'}</div></div>
          <div class="stat-item"><div class="stat-label">Up days</div><div class="stat-value">${m.upDays}/7</div></div>
        </div>
      </div>`;
  }

  function renderMarketSnapshotPlaceholder() {
    return '<p class="market-snapshot-placeholder muted">DSE index &amp; breadth — connect <code>/api/market/today</code> ingest to populate.</p>';
  }

  function renderHomeRankedPreview(rankings) {
    const rows = (rankings ?? []).slice(0, 5);
    if (!rows.length) return '<p class="muted">No rankings yet — run analysis on tickers first.</p>';
    return `<ul class="home-ranked-list">${rows.map((r, i) =>
      `<li><span class="muted">${i + 1}</span><span class="clickable" data-symbol="${esc(r.symbol)}"><strong>${esc(r.symbol)}</strong></span><span class="score-badge ${scoreBandClass(r.score)} mini" style="padding:0.25rem 0.5rem;min-width:auto"><span class="score-num" style="font-size:1rem">${r.score ?? '—'}</span></span><span class="muted">${r.grade ?? ''}</span></li>`,
    ).join('')}</ul>`;
  }

  function rankingBucket(score) {
    const s = Number(score);
    if (s >= 80) return 'Strong Buy';
    if (s >= 60) return 'Buy';
    if (s >= 45) return 'Hold';
    return 'Avoid';
  }

  function renderRankingsPanel(data) {
    const rows = data?.rankings ?? [];
    if (!rows.length) return '<p class="muted">No ranked stocks — ingest fundamentals and run analysis.</p>';
    const buckets = { 'Strong Buy': 0, Buy: 0, Hold: 0, Avoid: 0 };
    for (const r of rows) buckets[rankingBucket(r.score)] = (buckets[rankingBucket(r.score)] ?? 0) + 1;
    const bucketHtml = Object.entries(buckets).map(([label, count]) =>
      `<div class="ranking-bucket"><div class="bucket-count">${count}</div><div class="bucket-label">${esc(label)}</div></div>`,
    ).join('');
    const tableRows = rows.slice(0, 100).map((r, i) =>
      `<tr><td>${i + 1}</td><td class="clickable" data-symbol="${esc(r.symbol)}">${esc(r.symbol)}</td><td>${esc(r.name ?? '—')}</td><td>${esc(r.sector ?? '—')}</td><td><span class="score-badge ${scoreBandClass(r.score)} mini" style="padding:0.2rem 0.45rem;min-width:auto;display:inline-flex;flex-direction:row;gap:0.35rem"><span class="score-num" style="font-size:0.95rem">${r.score ?? '—'}</span></span></td><td>${esc(r.grade ?? '—')}</td><td>${r.investment_score ?? '—'}</td></tr>`,
    ).join('');
    return `${bucketHtml}<div class="table-wrap"><table class="sortable"><tr><th>#</th><th>Symbol</th><th>Company</th><th>Sector</th><th>Score</th><th>Grade</th><th>Inv 1-10</th></tr>${tableRows}</table></div>`;
  }

  function renderTop20Panel(rows) {
    if (!rows?.length) return '<p class="muted">No momentum data — need OHLCV history.</p>';
    const tableRows = rows.map((r, i) =>
      `<tr><td>${i + 1}</td><td class="clickable" data-symbol="${esc(r.symbol)}">${esc(r.symbol)}</td><td>৳${fmtNum(r.last_close)}</td><td class="${r.chg_7d >= 0 ? 'pos' : 'neg'}">${fmtPct(r.chg_7d)}</td><td>${fmtPct(r.chg_7d_vs_market ?? 0)}</td></tr>`,
    ).join('');
    return `<p class="muted">7-day price momentum leaders (not fundamental scores).</p><div class="table-wrap"><table><tr><th>#</th><th>Symbol</th><th>LTP</th><th>7d %</th><th>Rel.</th></tr>${tableRows}</table></div>`;
  }

  function renderNewsCardFeed(news, { sourceLabels = {}, tickerBn = {} } = {}) {
    if (!news?.length) return '<p class="muted">No news items.</p>';
    const bnHeadline = (text) => /[\u0980-\u09FF]/.test(text ?? '');
    return news.map((n) => {
      const src = sourceLabels[n.source] ?? n.source ?? '—';
      const tickerBnHtml = n.symbol && bnHeadline(n.headline) && tickerBn[n.symbol]
        ? `<span class="ticker-bn lang-bn" lang="bn">${esc(tickerBn[n.symbol])}</span>` : '';
      const ticker = n.symbol
        ? `<span class="clickable" data-symbol="${esc(n.symbol)}">${esc(n.symbol)}</span>${tickerBnHtml}` : '';
      const headline = n.url
        ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.headline)}</a>`
        : esc(n.headline);
      return `<article class="news-card"><div class="news-card-meta">${ticker ? `<span>${ticker}</span>` : ''}<span>${fmtDate(n.publishedDate)}</span><span>${esc(src)}</span>${n.category ? `<span>${esc(n.category)}</span>` : ''}</div><div class="news-card-headline">${headline}</div></article>`;
    }).join('');
  }

  function renderTickersTable(tickers, { sortKey = 'symbol', sortDir = 'asc', sectorFilter = '' } = {}) {
    let rows = [...(tickers ?? [])];
    if (sectorFilter) rows = rows.filter((t) => (t.sector ?? '') === sectorFilter);
    const dir = sortDir === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    if (!rows.length) return '<p class="muted">No tickers match filter.</p>';
    const cols = [
      { key: 'symbol', label: 'Code' },
      { key: 'name', label: 'Company' },
      { key: 'sector', label: 'Sector' },
      { key: 'last_close', label: 'LTP' },
      { key: 'chg_pct', label: 'Chg%' },
      { key: 'investment_rating', label: 'Investment' },
      { key: 'momentum_rating', label: 'Momentum' },
    ];
    const head = cols.map((c) =>
      `<th class="${sortKey === c.key ? `sorted-${sortDir}` : ''}" data-sort="${c.key}">${c.label}</th>`,
    ).join('');
    const body = rows.map((t) => {
      const chgCls = t.chg_pct != null && t.chg_pct >= 0 ? 'pos' : 'neg';
      return `<tr>
        <td class="clickable" data-symbol="${esc(t.symbol)}">${esc(t.symbol)}</td>
        <td>${esc(t.name ?? '—')}</td>
        <td>${esc(t.sector ?? '—')}</td>
        <td>${t.last_close != null ? `৳${fmtNum(t.last_close)}` : '—'}</td>
        <td class="${chgCls}">${t.chg_pct != null ? fmtPct(t.chg_pct) : '—'}</td>
        <td class="ticker-signal-col">${renderTickerModeCell(t, 'investment')}</td>
        <td class="ticker-signal-col">${renderTickerModeCell(t, 'momentum')}</td>
      </tr>`;
    }).join('');
    return `<table class="sortable"><tr>${head}</tr>${body}</table>`;
  }

  function renderPortfolioHero(investment, trading) {
    const positions = [...(investment?.positions ?? []), ...(trading?.positions ?? [])];
    if (!positions.length) {
      return `<div class="portfolio-hero"><p class="muted">Add holdings to see portfolio verdict.</p></div>`;
    }
    const totalCost = positions.reduce((s, p) => s + (p.cost_basis ?? 0), 0);
    const totalValue = positions.reduce((s, p) => s + (p.market_value ?? 0), 0);
    const totalPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0);
    const pnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const sectors = new Set(positions.map((p) => p.sector).filter(Boolean));
    const scores = positions.map((p) => p.investment_score).filter((x) => x != null);
    const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const spread = Math.min(10, sectors.size * 2.5);
    const quality = avgScore != null ? Math.min(10, avgScore) : 5;
    const entry = pnlPct >= 0 ? Math.min(10, 5 + pnlPct / 5) : Math.max(1, 5 + pnlPct / 5);
    const verdict = quality >= 7 && pnlPct >= 0
      ? 'Solid holdings — watch entries on weaker names.'
      : pnlPct < -5
        ? 'Review weak positions and stop levels.'
        : 'Mixed book — check quality scores per holding.';
    return `
      <div class="portfolio-hero">
        <p class="verdict-body" style="margin:0;font-weight:600">${esc(verdict)}</p>
        <div class="portfolio-hero-stats">
          <div class="portfolio-hero-stat"><div class="ph-label">Current value</div><div class="ph-value">৳${fmtNum(totalValue, 0)}</div></div>
          <div class="portfolio-hero-stat"><div class="ph-label">Total P/L</div><div class="ph-value ${totalPnl >= 0 ? 'pos' : 'neg'}">${totalPnl >= 0 ? '+' : ''}৳${fmtNum(totalPnl, 0)} (${fmtPct(pnlPct)})</div></div>
        </div>
        <div class="portfolio-subscores">
          <div class="portfolio-subscore"><div class="ps-label">Spread</div><div class="ps-value">${fmtNum(spread, 1)}/10</div></div>
          <div class="portfolio-subscore"><div class="ps-label">Diversification</div><div class="ps-value">${sectors.size} sectors</div></div>
          <div class="portfolio-subscore"><div class="ps-label">Quality</div><div class="ps-value">${avgScore != null ? fmtNum(quality, 1) : '—'}/10</div></div>
          <div class="portfolio-subscore"><div class="ps-label">Entry</div><div class="ps-value">${fmtNum(entry, 1)}/10</div></div>
        </div>
      </div>`;
  }

  function renderWatchlistCards(items, purpose) {
    return renderWatchlistTable((items ?? []).map((w) => ({ ...w, purpose: w.purpose ?? purpose })));
  }

  function renderMacroPlainLead(landscape) {
    const regime = landscape?.bangladesh?.regime;
    const rating = regime?.rating ?? 'neutral';
    const mult = regime?.risk_multiplier;
    const sentences = {
      risk_on: 'Right now: supportive backdrop — policy and liquidity favour selective risk-taking.',
      neutral: 'Right now: steady conditions — focus on strong companies at fair prices.',
      cautious: 'Right now: mixed signals — be selective and keep position sizes modest.',
      risk_off: 'Right now: defensive backdrop — prioritise quality and liquidity.',
    };
    const text = sentences[String(rating).toLowerCase().replace(/\s+/g, '_')] ?? `Market regime: ${rating}.`;
    const extra = mult != null ? ` Risk multiplier: ${fmtNum(mult, 2)}.` : '';
    return `<p class="macro-plain-lead">${esc(text)}${esc(extra)}</p>`;
  }

  function isoWeekKey(dateStr) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  function aggregateOhlcvBars(bars) {
    return {
      date: bars[bars.length - 1].date,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((s, b) => s + (b.volume ?? 0), 0),
    };
  }

  function resampleOhlcvCalendar(bars, tf) {
    if (tf === 'daily' || !bars.length) return bars;
    const groups = new Map();
    for (const bar of bars) {
      const key = tf === 'weekly' ? isoWeekKey(bar.date) : bar.date.slice(0, 7);
      const list = groups.get(key) ?? [];
      list.push(bar);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, chunk]) => aggregateOhlcvBars(chunk));
  }

  function stageBadge(stage) {
    const labels = { 1: 'Stage 1 Base', 2: 'Stage 2 Advancing', 3: 'Stage 3 Top', 4: 'Stage 4 Decline' };
    const cls = stage === 2 ? 'pass' : stage === 4 ? 'fail' : 'warn';
    return `<span class="stage-badge ${cls}">${esc(labels[stage] ?? `Stage ${stage ?? '?'}`)}</span>`;
  }

  function renderMultiTimeframePanel(mtf) {
    if (!mtf || mtf.error) {
      return `<p class="muted">${esc(mtf?.error ?? 'Run momentum analysis for multi-timeframe confluence.')}</p>`;
    }
    const cols = ['daily', 'weekly', 'monthly'].map((tf) => {
      const r = mtf[tf] ?? {};
      return `
        <div class="mtf-col">
          <h5>${esc(tf.charAt(0).toUpperCase() + tf.slice(1))}</h5>
          <p>Trend: <strong>${esc(r.trend ?? '—')}</strong></p>
          ${r.stage != null ? stageBadge(r.stage) : ''}
          <p class="muted">MA: ${esc(r.ma_stack ?? r.ma_slope ?? '—')} · ADX ${esc(r.adx ?? '—')}</p>
          ${r.extension_pct != null ? `<p class="muted">Extension: ${fmtPct(r.extension_pct)}</p>` : ''}
        </div>`;
    }).join('');
    const alignCls = mtf.alignment === 'bullish' ? 'pass' : mtf.alignment === 'bearish' ? 'fail' : 'warn';
    const conflicts = (mtf.conflicts ?? [])
      .map((c) => `<li>${esc(String(c).replace(/_/g, ' '))}</li>`)
      .join('');
    return `
      <div class="mtf-panel checklist-block">
        <h4>Multi-timeframe confluence</h4>
        <p class="muted">Daily = execution · Weekly = Weinstein stage · Monthly = primary trend filter</p>
        <div class="mtf-score ${alignCls}">
          <strong>${esc(mtf.alignment ?? 'mixed')}</strong> · score ${fmtNum(mtf.confluence_score, 2)}
        </div>
        <div class="mtf-cols">${cols}</div>
        ${conflicts ? `<ul class="mtf-conflicts">${conflicts}</ul>` : '<p class="muted">No major timeframe conflicts.</p>'}
      </div>`;
  }

  function renderMarketStructurePanel(ms) {
    if (!ms) return '';
    const stage = ms.stage_analysis;
    const dow = ms.dow_theory;
    const lp = ms.launchpad;
    let html = '<div class="market-structure-panels">';

    if (stage && !stage.error) {
      const km = stage.key_metrics ?? {};
      html += `
        <div class="checklist-block">
          <h4>Stage analysis (Weinstein)</h4>
          ${stageBadge(km.stage)}
          <p class="muted">30-week MA ${fmtNum(km.ma30, 2)} · slope ${esc(km.ma30_slope ?? '—')}</p>
          ${renderCriteriaList(stage.criteria, 'category')}
        </div>`;
    }

    if (dow && !dow.error) {
      const km = dow.key_metrics ?? {};
      html += `
        <div class="checklist-block">
          <h4>Dow Theory</h4>
          <p>Primary: <strong>${esc(km.primary_trend ?? '—')}</strong> · Secondary: <strong>${esc(km.secondary_trend ?? '—')}</strong></p>
          <p class="muted">Index confirmed: ${km.index_confirmed ? 'yes' : km.index_confirmed === false ? 'no' : '—'} · Volume: ${km.volume_confirms ? 'yes' : '—'}</p>
          ${renderCriteriaList(dow.criteria, 'category')}
        </div>`;
    }

    if (lp && !lp.error) {
      const km = lp.key_metrics ?? {};
      html += `
        <div class="checklist-block">
          <h4>Launchpad</h4>
          <p>${km.launchpad_ready ? '<span class="pass">Launchpad ready</span>' : '<span class="warn">Not ready</span>'}</p>
          <p class="muted">Pivot ${fmtNum(km.pivot, 2)} · VCP ${esc(km.vcp_segments ?? '—')}</p>
          ${renderCriteriaList(lp.criteria, 'category')}
        </div>`;
    }

    html += '</div>';
    return html;
  }

  return {
    esc,
    fmtNum,
    fmtPct,
    fmtDate,
    fmtDateWithAge,
    formatAge,
    renderThinkingCard,
    renderSynthesisAgentBoard,
    renderAgentDetailModalContent,
    renderRiskPanel,
    renderComparison,
    renderMomentumChecklist,
    renderMomentumStrategiesPanel,
    renderMultiTimeframePanel,
    renderMarketStructurePanel,
    resampleOhlcvCalendar,
    resolveMomentumTrading,
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
    renderPortfolioBrokerBar,
    renderPortfolioFillsModal,
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
    renderMacroLandscape,
    renderSectorDetail,
    macroSourceLabel,
    buildJsonKeyIndex,
    renderJsonKeyNav,
    renderTickerClaudePrompts,
    renderBatchClaudePrompts,
    claudeTickerCompletePrompt,
    claudeTickerIngestPrompt,
    claudeTickerResearchPrompt,
    claudeWatchlistBatchPrompt,
    claudePortfolioBatchPrompt,
    claudeBatchCompletePrompt,
    compute52WeekRange,
    computeRecentMomentum,
    gradeToScore,
    renderStockHero,
    render52WeekRange,
    renderHealthCheck,
    renderPlainVerdict,
    renderKeyNumbers,
    renderRecentMomentumBlock,
    renderMarketSnapshotPlaceholder,
    renderHomeRankedPreview,
    renderRankingsPanel,
    renderTop20Panel,
    renderNewsCardFeed,
    renderTickersTable,
    renderTickerOptionLabel,
    renderPortfolioHero,
    renderWatchlistCards,
    renderMacroPlainLead,
  };
})();
