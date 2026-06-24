const UI = window.AnalysisUI;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

if (!UI) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<div class="error-banner">analysis-ui.js failed to load — hard-refresh the page (Cmd+Shift+R).</div>',
  );
}

let ohlcvChart = null;
let shareChart = null;
let sectorChart = null;
let currentTickerData = null;
let allTickers = [];
let currentAnalysis = null;
let currentSnapshotMeta = null;
let viewMode = 'both';
let valueBucket = 'buffett';
let glossaryTerms = [];
let rawOhlcv = [];
let activeJsonKey = null;

async function copyCommand(text, label) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    setAnalysisStatus(label ? `Copied: ${label}` : 'Command copied', 'ok');
    return true;
  } catch {
    setAnalysisStatus('Copy failed — select command manually', 'error');
    return false;
  }
}

function renderTickerCommands(symbol) {
  if (!UI) return;
  const sym = symbol ? String(symbol).toUpperCase() : '';
  const quickEl = $('#ticker-commands-quick');
  const fullEl = $('#sub-commands');
  if (quickEl) quickEl.innerHTML = UI.renderTickerCommandsQuick(sym);
  if (fullEl) fullEl.innerHTML = UI.renderTickerCommandsFull(sym);
}

function scrollJsonToLine(line, key) {
  const pre = $('#analysis-json');
  if (!pre) return;
  const panel = $('#dev-json-panel');
  if (panel && !panel.open) panel.open = true;
  const style = getComputedStyle(pre);
  const lineHeight = parseFloat(style.lineHeight) || 22;
  pre.scrollTop = Math.max(0, line * lineHeight - 4);
  activeJsonKey = key ?? null;
  const jsonText = pre.textContent ?? '';
  const keys = UI.buildJsonKeyIndex(jsonText);
  const nav = $('#json-key-nav');
  if (nav) nav.innerHTML = UI.renderJsonKeyNav(keys, activeJsonKey);
}

function renderJsonKeyNavigation(jsonText) {
  const nav = $('#json-key-nav');
  if (!nav || !UI) return;
  const keys = UI.buildJsonKeyIndex(jsonText);
  if (!keys.some((k) => k.key === activeJsonKey)) activeJsonKey = null;
  nav.innerHTML = UI.renderJsonKeyNav(keys, activeJsonKey);
}

async function api(path, options) {
  const r = await fetch(path, options);
  if (!r.ok) {
    const text = await r.text();
    let message = text;
    try {
      const j = JSON.parse(text);
      if (j.error) message = String(j.error);
    } catch {
      message = text.replace(/<[^>]+>/g, ' ').trim().slice(0, 200) || `HTTP ${r.status}`;
    }
    throw new Error(message);
  }
  return r.json();
}

function setAnalysisStatus(message, kind = 'muted') {
  const el = $('#analysis-status');
  if (!el) return;
  el.textContent = message ?? '';
  el.className = `analysis-status ${kind}`;
}

function bindClick(sel, handler) {
  const el = $(sel);
  if (!el) {
    console.error(`Missing element: ${sel}`);
    return;
  }
  el.addEventListener('click', handler);
}

function showPanel(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
}

function showSubPanel(name) {
  $$('.sub-tab').forEach((t) => t.classList.toggle('active', t.dataset.sub === name));
  $$('.sub-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `sub-${name}`);
  });
}

function table(headers, rows) {
  if (!rows.length) return '<p class="muted">No data</p>';
  const head = `<tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>`;
  const body = rows.map((cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table>${head}${body}</table>`;
}

function destroyChart(chart) {
  if (chart) chart.destroy();
  return null;
}

function resampleOhlcv(bars, tf) {
  if (tf === 'daily') return bars;
  const out = [];
  const chunk = tf === 'weekly' ? 5 : 21;
  for (let i = 0; i < bars.length; i += chunk) {
    const slice = bars.slice(i, i + chunk);
    if (!slice.length) continue;
    out.push({
      date: slice[slice.length - 1].date,
      close: slice[slice.length - 1].close,
    });
  }
  return out;
}

function renderChart(bars) {
  const labels = bars.map((b) => b.date);
  const closes = bars.map((b) => b.close);
  ohlcvChart = destroyChart(ohlcvChart);
  ohlcvChart = new Chart($('#ohlcv-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Close (BDT)', data: closes, borderColor: '#3b82f6', tension: 0.1, pointRadius: 0 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8b9cb3' } } },
      scales: {
        x: { ticks: { color: '#8b9cb3', maxTicksLimit: 8 } },
        y: { ticks: { color: '#8b9cb3' } },
      },
    },
  });
}

function renderFullAnalysis() {
  if (!UI) return;
  const a = currentAnalysis;
  if (!a) {
    ['summary', 'investment', 'momentum', 'business', 'risk', 'history'].forEach((s) => {
      const el = $(`#sub-${s}`);
      if (el) el.innerHTML = '<p class="muted">No analysis — run Analyze.</p>';
    });
    $('#analysis-json').textContent = '';
    $('#json-provenance').innerHTML = '<p class="muted">No snapshot — run Analyze to populate JSON.</p>';
    const badge = $('#json-freshness-badge');
    if (badge) {
      badge.textContent = 'Missing';
      badge.className = 'json-freshness-badge missing';
      badge.classList.remove('hidden');
    }
    $('#json-meta-line').textContent = '';
    $('#analysis-stale').classList.add('hidden');
    const jsonNav = $('#json-key-nav');
    if (jsonNav) jsonNav.innerHTML = '';
    activeJsonKey = null;
    return;
  }

  const cards = a.agent_cards ?? {};
  const syn = a.synthesis ?? {};
  const ms = a.momentum_screen;
  const vc = a.value_investment_checklist;
  const rot = a.momentum_rotation;

  $('#sub-summary').innerHTML = UI.renderComparison(syn, ms, vc);
  $('#sub-investment').innerHTML =
    UI.renderThinkingCard('Investment Agent', cards.fundamental, 'Fundamentals, value criteria, long-term thesis (REQ-006)') +
    (viewMode !== 'momentum' ? `<div class="checklist-block"><h4>Value checklist</h4>${UI.renderValueChecklist(vc, valueBucket)}</div>` : '');
  $('#sub-momentum').innerHTML =
    UI.renderThinkingCard('Momentum Agent', cards.technical, 'Technical indicators, SEPA, volume (REQ-007)') +
    UI.renderIndicators(cards.technical) +
    (viewMode !== 'investment' ? `<div class="checklist-block"><h4>Momentum checklist</h4>${UI.renderMomentumChecklist(ms, rot)}</div>` : '');
  $('#sub-business').innerHTML = UI.renderBusiness(
    currentTickerData?.fundamentals,
    currentTickerData?.news,
    currentTickerData?.ticker,
    currentTickerData?.data_warnings,
  );
  $('#sub-risk').innerHTML = UI.renderRiskPanel(a.risk);

  const histEl = $('#sub-history');
  if (currentSnapshotMeta) {
    histEl.innerHTML = `<p>Snapshot #${currentSnapshotMeta.id} · ${UI.fmtDate(currentSnapshotMeta.created_at)} · model ${UI.esc(currentSnapshotMeta.model_version ?? '—')}</p>`;
  } else histEl.innerHTML = '<p class="muted">No snapshot metadata</p>';

  const jsonText = JSON.stringify(a, null, 2);
  const jsonEl = $('#analysis-json');
  if (jsonEl) jsonEl.textContent = jsonText;
  renderJsonKeyNavigation(jsonText);

  const report = UI.computeJsonFreshness(currentSnapshotMeta, a, currentTickerData);
  const provEl = $('#json-provenance');
  if (provEl) provEl.innerHTML = UI.renderJsonProvenance(currentSnapshotMeta, a, currentTickerData);

  const badge = $('#json-freshness-badge');
  if (badge) {
    badge.textContent = report.label;
    badge.className = `json-freshness-badge ${report.level}`;
    badge.classList.remove('hidden');
  }

  const metaLine = $('#json-meta-line');
  if (metaLine) {
    const kb = (jsonText.length / 1024).toFixed(1);
    metaLine.textContent = `${kb} KB · ${jsonText.split('\n').length} lines`;
  }

  const stale = UI.isStale(currentSnapshotMeta?.created_at);
  const staleEl = $('#analysis-stale');
  if (staleEl) {
    staleEl.classList.toggle('hidden', !stale);
    if (stale && currentSnapshotMeta?.created_at) {
      staleEl.textContent = `Stale (${UI.formatAge(currentSnapshotMeta.created_at)} · ${UI.fmtDate(currentSnapshotMeta.created_at)}) — re-ingest, then Analyze`;
    } else if (stale) {
      staleEl.textContent = 'Stale — re-ingest, then Analyze';
    }
  }

  $$('.bucket-tab').forEach((btn) => {
    btn.onclick = () => {
      valueBucket = btn.dataset.bucket;
      renderFullAnalysis();
    };
  });
}

async function loadTickerAnalysis(symbol) {
  try {
    const data = await api(`/api/tickers/${symbol}/analysis`);
    currentSnapshotMeta = data.snapshot
      ? {
          id: data.snapshot.id,
          created_at: data.snapshot.created_at,
          as_of: data.snapshot.as_of,
          model_version: data.snapshot.model_version,
        }
      : null;
    currentAnalysis = data.snapshot?.payload ?? null;
    renderFullAnalysis();
  } catch {
    currentAnalysis = null;
    renderFullAnalysis();
  }
}

async function runAnalyze(mode) {
  const sym = ($('#ticker-select')?.value ?? '').trim().toUpperCase();
  if (!sym) {
    setAnalysisStatus('Pick a ticker first (Tickers tab → View, or use the dropdown).', 'error');
    showPanel('ticker-detail');
    return;
  }

  const btns = ['#analyze-full', '#analyze-investment', '#analyze-momentum'];
  btns.forEach((id) => {
    const b = $(id);
    if (b) b.disabled = true;
  });
  setAnalysisStatus(`Analyzing ${sym}…`, 'busy');

  try {
    const data = await api(`/api/tickers/${encodeURIComponent(sym)}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: 'dashboard', mode }),
    });
    if (data.analysis?.error) {
      throw new Error(String(data.analysis.error));
    }
    currentAnalysis = data.analysis;
    currentSnapshotMeta = {
      id: data.snapshot_id,
      created_at: new Date().toISOString(),
      as_of: data.analysis.as_of,
      model_version: '2.0.0',
    };
    if (data.symbol && data.symbol !== sym) {
      $('#ticker-select').value = data.symbol;
    }
    await loadTickerDetail(data.symbol ?? sym);
    showPanel('ticker-detail');
    showSubPanel('summary');
    renderFullAnalysis();
    $('#analysis-subtabs')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setAnalysisStatus(`Done — ${sym} · snapshot #${data.snapshot_id ?? '—'}`, 'ok');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setAnalysisStatus(`Failed: ${msg}`, 'error');
    console.error('runAnalyze', e);
  } finally {
    btns.forEach((id) => {
      const b = $(id);
      if (b) b.disabled = false;
    });
  }
}

function openTicker(symbol) {
  $('#ticker-select').value = symbol;
  showPanel('ticker-detail');
  loadTickerDetail(symbol);
}

function renderDataWarnings(warnings) {
  if (!warnings?.length) return '';
  const esc = UI?.esc ?? ((s) => String(s ?? ''));
  return `<div class="data-warnings">${warnings.map((w) => `<p>⚠ ${esc(w)}</p>`).join('')}</div>`;
}

async function loadTickerDetail(symbol) {
  const sym = symbol || $('#ticker-select').value;
  const data = await api(`/api/tickers/${sym}?limit=260`);
  currentTickerData = data;
  const t = data.ticker;

  $('#ticker-meta').innerHTML =
    `<strong>${t.symbol}</strong> — ${t.name ?? ''} · ${t.sector ?? 'No sector'} · ${data.ohlcv.length} bars`
    + renderDataWarnings(data.data_warnings);

  rawOhlcv = data.ohlcv;
  renderChart(resampleOhlcv(rawOhlcv, $('#chart-tf').value));

  const sh = data.shareholding;
  shareChart = destroyChart(shareChart);
  if (sh.length) {
    const last = sh[sh.length - 1];
    shareChart = new Chart($('#share-chart'), {
      type: 'doughnut',
      data: {
        labels: ['Sponsor', 'Institution', 'Foreign', 'Public', 'Govt'],
        datasets: [{
          data: [last.sponsor, last.institution, last.foreign, last.public, last.govt],
          backgroundColor: ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#64748b'],
        }],
      },
      options: { plugins: { legend: { labels: { color: '#8b9cb3' } } } },
    });
  }

  $('#ticker-watchlist-actions').innerHTML = `
    <button type="button" class="btn-sm watch-add" data-symbol="${t.symbol}" data-purpose="investment">+ Investment watchlist</button>
    <button type="button" class="btn-sm watch-add" data-symbol="${t.symbol}" data-purpose="trading">+ Trading watchlist</button>`;
  bindWatchlistButtons('#ticker-watchlist-actions');

  renderTickerCommands(t.symbol);
  await loadTickerAnalysis(sym);
}

async function loadOverview() {
  const data = await api('/api/overview');
  const c = data.counts;
  $('#stat-cards').innerHTML = Object.entries(c)
    .map(([k, v]) => `<div class="card"><div class="label">${k.replace(/_/g, ' ')}</div><div class="value">${UI.fmtNum(v, 0)}</div></div>`)
    .join('');

  $('#overview-analyses').innerHTML = table(
    ['Symbol', 'Investment', 'Momentum', 'Risk', 'When'],
    (data.recentAnalyses ?? []).map((a) => [
      `<span class="clickable" data-symbol="${a.symbol}">${a.symbol}</span>`,
      a.investmentScore ?? '—',
      a.momentumScore ?? '—',
      a.riskRating ?? '—',
      UI.fmtDate(a.createdAt),
    ]),
  );
  $$('#overview-analyses [data-symbol]').forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });

  $('#overview-runs').innerHTML = table(
    ['Job', 'Ticker', 'Status', 'Rows', 'Started'],
    data.recentRuns.map((r) => [
      r.jobName,
      r.symbol ?? '—',
      `<span class="badge ${r.status === 'ok' ? 'ok' : 'fail'}">${r.status}</span>`,
      r.rowsUpserted,
      UI.fmtDate(r.startedAt),
    ]),
  );
}

async function loadTickers() {
  const { tickers } = await api('/api/tickers');
  allTickers = [...tickers].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const q = () => ($('#ticker-search').value || '').toUpperCase();
  const render = () => {
    const filtered = tickers.filter((t) => t.symbol.includes(q()));
    $('#tickers-table').innerHTML = table(
      ['Symbol', 'Name', 'Sector', 'Bars', 'Last', ''],
      filtered.map((t) => [
        `<span class="clickable" data-symbol="${t.symbol}">${t.symbol}</span>`,
        t.name ?? '—',
        t.sector ?? '—',
        t.ohlcv_bars,
        UI.fmtDate(t.last_trade_date),
        `<span class="clickable" data-symbol="${t.symbol}">View →</span>`,
      ]),
    );
    $$('#tickers-table [data-symbol]').forEach((el) => {
      el.addEventListener('click', () => openTicker(el.dataset.symbol));
    });
  };
  $('#ticker-search').oninput = render;
  render();

  const sel = $('#ticker-select');
  sel.innerHTML = allTickers.map((t) => `<option value="${t.symbol}">${t.symbol}</option>`).join('');
  if (allTickers.some((t) => t.symbol === 'LHB')) sel.value = 'LHB';

  populateWatchSelects('investment');
  populateWatchSelects('trading');
}

function populateWatchSelects(purpose, filter = '') {
  const sel = $(`#watch-select-${purpose}`);
  if (!sel) return;

  const q = filter.trim().toUpperCase();
  const filtered = q
    ? allTickers.filter(
        (t) => t.symbol.includes(q) || (t.name ?? '').toUpperCase().includes(q),
      )
    : allTickers;

  const cur = sel.value;
  const cap = 400;
  const slice = filtered.slice(0, cap);
  sel.innerHTML =
    '<option value="">Choose symbol…</option>'
    + slice.map((t) => {
      const label = t.name ? `${t.symbol} — ${t.name}` : t.symbol;
      return `<option value="${UI.esc(t.symbol)}">${UI.esc(label)}</option>`;
    }).join('')
    + (filtered.length > cap ? `<option value="" disabled>…${filtered.length - cap} more — narrow filter</option>` : '');

  if (cur && slice.some((t) => t.symbol === cur)) sel.value = cur;
}

async function loadPortfolio() {
  const data = await api('/api/portfolio');
  if (!data.account) {
    $('#portfolio-summary').textContent = 'No portfolio account — run npm run db:seed';
    return;
  }

  const totalPnl = data.positions.reduce((s, p) => s + (p.pnl ?? 0), 0);
  $('#portfolio-summary').innerHTML =
    `Account <strong>${data.account.label}</strong> · Capital ৳${UI.fmtNum(data.account.capital_bdt, 0)} · `
    + `Cost ৳${UI.fmtNum(data.total_cost_basis, 0)} · Unrealized P&amp;L ৳${UI.fmtNum(totalPnl, 0)} · ${data.positions.length} positions`;

  sectorChart = destroyChart(sectorChart);
  sectorChart = new Chart($('#sector-chart'), {
    type: 'pie',
    data: {
      labels: data.sector_allocation.map((s) => s.sector),
      datasets: [{
        data: data.sector_allocation.map((s) => s.value),
        backgroundColor: ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'],
      }],
    },
    options: {
      plugins: {
        legend: { labels: { color: '#8b9cb3' } },
        title: { display: true, text: 'Sector allocation', color: '#8b9cb3' },
      },
    },
  });

  $('#portfolio-table').innerHTML = table(
    ['Ticker', 'Qty', 'Avg', 'Last', 'P&L', 'Inv', 'Mom', 'Risk', ''],
    data.positions
      .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
      .map((p) => [
        `<span class="clickable" data-symbol="${p.ticker}">${p.ticker}</span>`,
        UI.fmtNum(p.qty, 0),
        UI.fmtNum(p.avg_cost),
        UI.fmtNum(p.last_close),
        p.pnl != null ? `৳${UI.fmtNum(p.pnl, 0)} (${UI.fmtPct(p.pnl_pct)})` : '—',
        p.investment_score ?? '—',
        p.momentum_score ?? '—',
        p.risk_rating ?? '—',
        `<button type="button" class="btn-sm del-pos" data-symbol="${p.ticker}">×</button>`,
      ]),
  );
  $$('#portfolio-table [data-symbol]').forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });
  $$('.del-pos').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/portfolio/positions/${btn.dataset.symbol}`, { method: 'DELETE' });
      loadPortfolio();
    });
  });
}

async function addWatchlistSymbol(purpose, symbol) {
  const sel = $(`#watch-select-${purpose}`);
  const sym = String(symbol ?? sel?.value ?? '').trim().toUpperCase();
  if (!sym) return false;
  await api('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: sym, purpose }),
  });
  if (sel) sel.value = '';
  const filter = $(`.watch-filter[data-purpose="${purpose}"]`);
  if (filter) filter.value = '';
  populateWatchSelects(purpose);
  await loadWatchlists();
  return true;
}

async function loadWatchlists() {
  for (const purpose of ['investment', 'trading']) {
    const { watchlist } = await api(`/api/watchlist?purpose=${purpose}`);
    const el = $(`#watchlist-${purpose}`);
    if (!el) continue;
    el.innerHTML = watchlist.length
      ? `<ul class="watch-list">${watchlist.map((w) => {
        const meta = [w.name, w.sector].filter(Boolean).join(' · ');
        return `<li>
          <div class="watch-meta">
            <span class="clickable watch-symbol" data-symbol="${UI.esc(w.symbol)}">${UI.esc(w.symbol)}</span>
            ${meta ? `<span class="muted"> ${UI.esc(meta)}</span>` : ''}
          </div>
          <button type="button" class="btn-sm rm-watch" data-symbol="${UI.esc(w.symbol)}" data-purpose="${purpose}" title="Remove">Remove</button>
        </li>`;
      }).join('')}</ul>`
      : '<p class="muted">No symbols yet — add one above.</p>';
    el.querySelectorAll('[data-symbol].clickable').forEach((n) => {
      n.addEventListener('click', () => openTicker(n.dataset.symbol));
    });
    el.querySelectorAll('.rm-watch').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/api/watchlist/${btn.dataset.symbol}?purpose=${btn.dataset.purpose}`, { method: 'DELETE' });
        loadWatchlists();
      });
    });
  }
}

function bindWatchlistButtons(root) {
  $$(`${root} .watch-add`).forEach((btn) => {
    btn.onclick = async () => {
      await api('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: btn.dataset.symbol, purpose: btn.dataset.purpose }),
      });
      loadWatchlists();
    };
  });
}

async function loadDiscover() {
  const sectors = await api('/api/sectors');
  const sel = $('#discover-sector');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All sectors</option>' +
    sectors.sectors.map((s) => `<option value="${s}">${s}</option>`).join('');
  sel.value = cur;
}

async function runDiscover() {
  $('#discover-status').textContent = 'Scanning…';
  const template = $('#discover-template').value;
  const sector = $('#discover-sector').value || undefined;
  const mode = viewMode === 'investment' ? 'investment' : 'momentum';
  try {
    const data = await api('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, sector, mode, limit: 30 }),
    });
    $('#discover-status').textContent = `${data.count ?? 0} results${data.cached ? ' (cached)' : ''}`;
    $('#discover-results').innerHTML = UI.renderDiscoverResults(data.results);
    bindWatchlistButtons('#discover-results');
    $$('#discover-results [data-symbol].clickable').forEach((el) => {
      el.addEventListener('click', () => openTicker(el.dataset.symbol));
    });
  } catch (e) {
    $('#discover-status').textContent = `Error: ${e.message}`;
  }
}

async function loadBriefing() {
  $('#briefing-content').innerHTML = '<p class="muted">Loading…</p>';
  const { briefing } = await api('/api/briefing');
  $('#briefing-content').innerHTML = UI.renderBriefing(briefing);
}

async function loadGlossary() {
  const data = await api('/api/glossary');
  glossaryTerms = data.terms ?? data;
  renderGlossary();
  $('#learn-panel').innerHTML = UI.renderLearnPanel();
  const roe = $('#learn-roe');
  if (roe) {
    roe.oninput = () => {
      const v = roe.value;
      $('#learn-roe-val').textContent = `${v}%`;
      $('#learn-roe-text').textContent =
        Number(v) >= 15
          ? `At ${v}% ROE, capital efficiency is strong for long-term compounding.`
          : `At ${v}% ROE, returns may not beat DSE fixed-income alternatives — review value grade.`;
    };
  }
}

function renderGlossary() {
  $('#glossary-list').innerHTML = UI.renderGlossary(glossaryTerms, $('#glossary-search')?.value);
}

async function loadAnalytics() {
  const kpi = await api('/api/analytics/kpi');
  $('#analytics-content').innerHTML = UI.renderAnalytics(kpi);
}

async function loadNews() {
  const { news } = await api('/api/news');
  $('#all-news').innerHTML = table(
    ['Date', 'Ticker', 'Headline', 'Source'],
    news.map((n) => [UI.fmtDate(n.publishedDate), n.symbol ?? '—', n.headline, n.source ?? '—']),
  );
}

async function loadMacro() {
  const { macro } = await api('/api/macro');
  if (!macro) {
    $('#macro-meta').textContent = 'No macro snapshot';
    $('#macro-json').textContent = '';
    return;
  }
  $('#macro-meta').textContent = `As of ${UI.fmtDate(macro.as_of)} · ${macro.source}`;
  $('#macro-json').textContent = JSON.stringify(macro.payload, null, 2);
}

async function loadOps() {
  const [fresh, runs] = await Promise.all([api('/api/freshness'), api('/api/ingest-runs?limit=100')]);
  $('#freshness-table').innerHTML = table(
    ['Entity', 'Ticker', 'Last success', 'Stale (h)'],
    fresh.freshness.map((f) => [f.entityType, f.symbol ?? 'global', UI.fmtDate(f.lastSuccessAt), f.staleAfterHours]),
  );
  $('#ingest-table').innerHTML = table(
    ['Job', 'Ticker', 'Status', 'Rows', 'Started'],
    runs.runs.map((r) => [
      r.jobName,
      r.symbol ?? '—',
      `<span class="badge ${r.status === 'ok' ? 'ok' : 'fail'}">${r.status}</span>`,
      r.rowsUpserted,
      UI.fmtDate(r.startedAt),
    ]),
  );
}

$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    showPanel(btn.dataset.panel);
    if (btn.dataset.panel === 'watchlist') {
      loadWatchlists();
      populateWatchSelects('investment', $(`.watch-filter[data-purpose="investment"]`)?.value ?? '');
      populateWatchSelects('trading', $(`.watch-filter[data-purpose="trading"]`)?.value ?? '');
    }
  });
});

$$('.watch-add-manual').forEach((btn) => {
  btn.addEventListener('click', () => {
    addWatchlistSymbol(btn.dataset.purpose);
  });
});

$$('.watch-filter').forEach((input) => {
  input.addEventListener('input', () => {
    populateWatchSelects(input.dataset.purpose, input.value);
  });
});

for (const purpose of ['investment', 'trading']) {
  $(`#watch-select-${purpose}`)?.addEventListener('dblclick', () => {
    addWatchlistSymbol(purpose);
  });
}

$$('.sub-tab').forEach((btn) => {
  btn.addEventListener('click', () => showSubPanel(btn.dataset.sub));
});

$$('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    viewMode = btn.dataset.mode;
    renderFullAnalysis();
  });
});

bindClick('#load-ticker', () => loadTickerDetail());
bindClick('#analyze-full', () => runAnalyze('full'));
bindClick('#analyze-investment', () => runAnalyze('investment'));
bindClick('#analyze-momentum', () => runAnalyze('momentum'));

bindClick('#json-copy', async () => {
  const text = $('#analysis-json')?.textContent ?? '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setAnalysisStatus('JSON copied to clipboard', 'ok');
  } catch {
    setAnalysisStatus('Copy failed — select JSON manually', 'error');
  }
});

bindClick('#json-wrap', () => {
  const pre = $('#analysis-json');
  const btn = $('#json-wrap');
  if (!pre || !btn) return;
  const wrap = !pre.classList.contains('wrap-lines');
  pre.classList.toggle('wrap-lines', wrap);
  btn.setAttribute('aria-pressed', wrap ? 'true' : 'false');
  btn.textContent = wrap ? 'No wrap' : 'Wrap lines';
});

$('#panel-ticker-detail')?.addEventListener('click', async (e) => {
  const jsonChip = e.target.closest('.json-key-chip');
  if (jsonChip?.dataset.jsonLine != null) {
    scrollJsonToLine(Number(jsonChip.dataset.jsonLine), jsonChip.dataset.jsonKey);
    return;
  }

  const copyBtn = e.target.closest('[data-copy-cmd]');
  if (copyBtn) {
    const cmd = copyBtn.getAttribute('data-copy-cmd');
    const label = copyBtn.classList.contains('cmd-quick-chip')
      ? copyBtn.textContent?.trim()
      : copyBtn.closest('.cmd-row')?.querySelector('strong')?.textContent?.trim();
    await copyCommand(cmd, label);
    return;
  }

  const moreBtn = e.target.closest('[data-sub-jump="commands"]');
  if (moreBtn) showSubPanel('commands');
});

bindClick('#run-discover', runDiscover);
bindClick('#load-briefing', loadBriefing);
bindClick('#load-analytics', loadAnalytics);
$('#glossary-search')?.addEventListener('input', renderGlossary);

$('#chart-tf').addEventListener('change', () => {
  renderChart(resampleOhlcv(rawOhlcv, $('#chart-tf').value));
});

$('#add-position').addEventListener('click', async () => {
  const symbol = $('#pos-symbol').value.trim();
  const qty = Number($('#pos-qty').value);
  const avg_cost = Number($('#pos-cost').value);
  if (!symbol || !qty || !avg_cost) return;
  await api('/api/portfolio/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, qty, avg_cost }),
  });
  $('#pos-symbol').value = '';
  loadPortfolio();
});

async function init() {
  try {
    await Promise.all([
      loadOverview(),
      loadTickers(),
      loadPortfolio(),
      loadWatchlists(),
      loadNews(),
      loadMacro(),
      loadOps(),
      loadDiscover(),
      loadGlossary(),
    ]);
    await loadTickerDetail($('#ticker-select').value || 'LHB');
  } catch (e) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div class="error-banner">Failed to load: ${UI ? UI.esc(e.message) : e.message}. Is Postgres running? Try: docker compose up -d postgres && npm run db:migrate</div>`,
    );
  }
}

init();
