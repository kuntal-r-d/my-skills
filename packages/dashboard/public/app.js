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
let sectorCharts = { investment: null, trading: null };
let currentTickerData = null;
let allTickers = [];
let currentAnalysis = null;
let currentSnapshotMeta = null;
let viewMode = 'both';
let valueBucket = 'buffett';
let glossaryTerms = [];
let glossarySections = [];
let rawOhlcv = [];
let activeJsonKey = null;

const TOAST_DEFAULT_MS = 3200;
const TOAST_ERROR_MS = 5000;
const MAX_TOASTS = 4;

function showToast(message, kind = 'info', durationMs) {
  const host = $('#toast-host');
  if (!host || !message) return;
  while (host.children.length >= MAX_TOASTS) {
    host.firstElementChild?.remove();
  }
  const ms =
    durationMs ??
    (kind === 'error' ? TOAST_ERROR_MS : kind === 'busy' ? 0 : TOAST_DEFAULT_MS);
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add('toast-visible'));
  });
  const dismiss = () => {
    if (el.classList.contains('toast-out')) return;
    el.classList.remove('toast-visible');
    el.classList.add('toast-out');
    window.setTimeout(() => el.remove(), 220);
  };
  const timer = ms > 0 ? window.setTimeout(dismiss, ms) : null;
  el.addEventListener('click', () => {
    if (timer) window.clearTimeout(timer);
    dismiss();
  });
}

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
  if (kind === 'ok' || kind === 'error') {
    showToast(message, kind);
  }
}

function bindClick(sel, handler) {
  const el = $(sel);
  if (!el) {
    console.error(`Missing element: ${sel}`);
    return;
  }
  el.addEventListener('click', handler);
}

const VALID_PANELS = new Set([
  'overview',
  'tickers',
  'ticker-detail',
  'discover',
  'portfolio',
  'watchlist',
  'briefing',
  'glossary',
  'analytics',
  'news',
  'macro',
  'skills',
  'daily',
  'ops',
]);

function parseHashRoute() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, '').trim());
  if (!raw || raw === 'overview' || raw === 'home') {
    return { panel: 'overview', ticker: null };
  }
  const slash = raw.indexOf('/');
  const panel = (slash === -1 ? raw : raw.slice(0, slash)).trim();
  const ticker = slash === -1 ? null : raw.slice(slash + 1).trim().toUpperCase() || null;
  if (!VALID_PANELS.has(panel)) {
    return { panel: 'overview', ticker: null };
  }
  return { panel, ticker };
}

function buildHash(panel, ticker) {
  if (panel === 'overview') return '';
  if (panel === 'ticker-detail' && ticker) {
    return `#${panel}/${encodeURIComponent(ticker)}`;
  }
  return `#${panel}`;
}

function setHashRoute(panel, ticker, { replace = true } = {}) {
  const base = `${window.location.pathname}${window.location.search}`;
  const hash = buildHash(panel, ticker);
  const url = hash ? `${base}${hash}` : base;
  if (replace) {
    window.history.replaceState({ panel, ticker }, '', url);
  } else {
    window.history.pushState({ panel, ticker }, '', url);
  }
}

function showPanel(name, { updateHash = true, ticker = null, historyMode = 'replace' } = {}) {
  const panel = VALID_PANELS.has(name) ? name : 'overview';
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === panel));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${panel}`));
  if (updateHash) {
    setHashRoute(panel, panel === 'ticker-detail' ? ticker : null, {
      replace: historyMode === 'replace',
    });
  }
}

async function loadPanelData(panel, { ticker } = {}) {
  switch (panel) {
    case 'overview':
      return loadOverview();
    case 'portfolio':
      return loadPortfolio();
    case 'briefing':
      return loadBriefing();
    case 'news':
      return loadNews();
    case 'macro':
      return loadMacro();
    case 'analytics':
      return loadAnalytics();
    case 'watchlist':
      await loadWatchlists();
      populateWatchSelects('investment', $(`.watch-filter[data-purpose="investment"]`)?.value ?? '');
      populateWatchSelects('trading', $(`.watch-filter[data-purpose="trading"]`)?.value ?? '');
      break;
    case 'skills':
      return loadSkillsList();
    case 'daily':
      return loadDaily();
    case 'ticker-detail': {
      const sym = (ticker || $('#ticker-select')?.value || 'LHB').toUpperCase();
      if ($('#ticker-select')) $('#ticker-select').value = sym;
      return loadTickerDetail(sym);
    }
    default:
      break;
  }
}

async function navigateToPanel(name, { ticker = null, updateHash = true, loadData = true, historyMode = 'replace' } = {}) {
  const panel = VALID_PANELS.has(name) ? name : 'overview';
  const sym = panel === 'ticker-detail' ? (ticker || $('#ticker-select')?.value || null) : null;
  showPanel(panel, { updateHash, ticker: sym, historyMode });
  if (loadData) await loadPanelData(panel, { ticker: sym });
}

async function onRouteChange() {
  const route = parseHashRoute();
  showPanel(route.panel, { updateHash: false, ticker: route.ticker });
  await loadPanelData(route.panel, { ticker: route.ticker });
}

function goHome() {
  navigateToPanel('overview', { historyMode: 'replace' });
  window.scrollTo(0, 0);
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
    updateAnalysisDataBar();
    if (currentTickerData?.news) {
      $('#sub-summary').innerHTML = UI.renderTickerNewsTeaser(currentTickerData.news, 3);
      bindSubPanelLinks('#sub-summary');
    }
    return;
  }

  const cards = a.agent_cards ?? {};
  const syn = a.synthesis ?? {};
  const ms = a.momentum_screen;
  const vc = a.value_investment_checklist;
  const rot = a.momentum_rotation;

  $('#sub-summary').innerHTML =
    UI.renderComparison(syn, ms, vc) + UI.renderTickerNewsTeaser(currentTickerData?.news, 3);
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
  $('#sub-risk').innerHTML = UI.renderRiskPanel(a.risk, a);

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
      staleEl.textContent = `Stale (${UI.formatAge(currentSnapshotMeta.created_at)} · ${UI.fmtDate(currentSnapshotMeta.created_at)}) — npm run ingest:daily, then Analyze`;
    } else if (stale) {
      staleEl.textContent = 'Stale — npm run ingest:daily, then Analyze';
    }
  }

  $$('.bucket-tab').forEach((btn) => {
    btn.onclick = () => {
      valueBucket = btn.dataset.bucket;
      renderFullAnalysis();
    };
  });
  updateAnalysisDataBar();
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
    navigateToPanel('ticker-detail');
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
    navigateToPanel('ticker-detail', { ticker: data.symbol ?? sym, updateHash: true, loadData: false });
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
  navigateToPanel('ticker-detail', { ticker: symbol, historyMode: 'push' });
}

function updateAnalysisDataBar() {
  const el = $('#analysis-data-bar');
  if (!el || !UI?.renderAnalysisDataBar) return;
  el.innerHTML = UI.renderAnalysisDataBar(currentSnapshotMeta, currentAnalysis, currentTickerData);
}

function renderDataWarnings(warnings) {
  if (!warnings?.length) return '';
  const esc = UI?.esc ?? ((s) => String(s ?? ''));
  return `<div class="data-warnings">${warnings.map((w) => `<p>⚠ ${esc(w)}</p>`).join('')}</div>`;
}

function bindSubPanelLinks(root = 'body') {
  $$(`${root} [data-sub].linkish, ${root} button[data-sub].linkish`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.sub;
      if (sub) showSubPanel(sub);
    });
  });
}

async function loadTickerDetail(symbol) {
  const sym = symbol || $('#ticker-select').value;
  const data = await api(`/api/tickers/${sym}?limit=260`);
  currentTickerData = data;
  const t = data.ticker;

  $('#ticker-meta').innerHTML =
    `<strong>${t.symbol}</strong> — ${t.name ?? ''} · ${t.sector ?? 'No sector'} · ${data.ohlcv.length} bars`
    + renderDataWarnings(data.data_warnings);

  updateAnalysisDataBar();

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

  const newsEl = $('#sub-news');
  if (newsEl) {
    newsEl.innerHTML = UI.renderTickerNews(data.news, data.ticker);
  }
  bindSubPanelLinks('#panel-ticker-detail');

  renderTickerCommands(t.symbol);
  await loadTickerAnalysis(sym);
  bindSubPanelLinks('#sub-summary');
}

function bindHomeClicks(root) {
  $$(`${root} [data-symbol].clickable`).forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });
}

function bindPanelLinks(root = 'body') {
  $$(`${root} [data-panel].linkish, ${root} button[data-panel]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel;
      if (panel) navigateToPanel(panel, { historyMode: 'push' });
    });
  });
}

async function loadOverview() {
  $('#home-briefing-content').innerHTML = '<p class="muted">Loading…</p>';
  const data = await api('/api/overview');
  lastBriefingPayload = data.briefing ?? null;
  const home = UI.renderHome(data);

  $('#home-briefing-content').innerHTML = home.briefing;
  $('#home-important-news').innerHTML = home.importantNews;

  bindHomeClicks('#panel-overview');
  bindPanelLinks('#panel-overview');
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

function renderSectorChart(purpose, portfolio, { canvasPrefix = '' } = {}) {
  const canvas = $(`#${canvasPrefix}sector-chart-${purpose}`);
  if (!canvas) return;
  const chartKey = canvasPrefix ? `${canvasPrefix}${purpose}` : purpose;
  sectorCharts[chartKey] = destroyChart(sectorCharts[chartKey]);
  if (!portfolio?.sector_allocation?.length) return;

  sectorCharts[chartKey] = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: portfolio.sector_allocation.map((s) => s.sector),
      datasets: [{
        data: portfolio.sector_allocation.map((s) => s.value),
        backgroundColor: ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b'],
      }],
    },
    options: {
      plugins: {
        legend: { labels: { color: '#8b9cb3' } },
        title: {
          display: true,
          text: purpose === 'trading' ? 'Trading sector allocation' : 'Investment sector allocation',
          color: '#8b9cb3',
        },
      },
    },
  });
}

function bindPortfolioPanel(root, purpose) {
  root.querySelectorAll('[data-symbol].clickable').forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });
  root.querySelectorAll('.del-pos').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sym = btn.dataset.symbol;
      const posPurpose = btn.dataset.purpose ?? purpose;
      await api(`/api/portfolio/positions/${sym}?purpose=${posPurpose}`, { method: 'DELETE' });
      loadPortfolio();
      showToast(`Removed ${sym} from ${posPurpose} portfolio`, 'info');
    });
  });
}

async function loadPortfolio() {
  const data = await api('/api/portfolio');
  const account = data.account ?? data.investment?.account ?? data.trading?.account;
  if (!account) {
    $('#portfolio-account-summary').textContent = 'No portfolio account — run npm run db:seed';
    return;
  }

  $('#portfolio-account-summary').innerHTML =
    `Account <strong>${account.label}</strong> · Capital ৳${UI.fmtNum(account.capital_bdt, 0)} · Risk/trade ${UI.fmtNum(account.risk_per_trade_pct, 1)}%`;

  for (const purpose of ['investment', 'trading']) {
    const portfolio = data[purpose] ?? data;
    $(`#portfolio-${purpose}-summary`).innerHTML = UI.renderPortfolioSummary({ ...portfolio, purpose });

    const tableEl = $(`#portfolio-${purpose}-table`);
    if (purpose === 'trading') {
      $('#portfolio-trading-mirror').innerHTML = UI.renderTradingMirrorBanner(portfolio.mirrored_from_investment);
      const syncBtn = $('#sync-trading-portfolio');
      if (syncBtn) {
        syncBtn.classList.toggle('hidden', !portfolio.mirrored_from_investment);
      }
      tableEl.innerHTML = UI.renderMomentumPortfolioTable(portfolio.positions, {
        purpose,
        showActions: !portfolio.mirrored_from_investment,
      });
    } else {
      tableEl.innerHTML = UI.renderPortfolioTable(portfolio.positions, { purpose });
    }
    bindPortfolioPanel(tableEl, purpose);

    renderSectorChart(purpose, portfolio);
  }
}

async function addPortfolioPosition(purpose) {
  const symbol = $(`.pos-symbol[data-purpose="${purpose}"]`)?.value.trim();
  const qty = Number($(`.pos-qty[data-purpose="${purpose}"]`)?.value);
  const avg_cost = Number($(`.pos-cost[data-purpose="${purpose}"]`)?.value);
  if (!symbol || !qty || !avg_cost) return false;

  await api('/api/portfolio/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, qty, avg_cost, purpose }),
  });

  $(`.pos-symbol[data-purpose="${purpose}"]`).value = '';
  $(`.pos-qty[data-purpose="${purpose}"]`).value = '';
  $(`.pos-cost[data-purpose="${purpose}"]`).value = '';
  showToast(`Added ${symbol.toUpperCase()} to ${purpose} portfolio`, 'ok');
  await loadPortfolio();
  return true;
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
  showToast(`Added ${sym} to ${purpose} watchlist`, 'ok');
  return true;
}

async function loadWatchlists() {
  for (const purpose of ['investment', 'trading']) {
    const { watchlist } = await api(`/api/watchlist?purpose=${purpose}`);
    const el = $(`#watchlist-${purpose}`);
    if (!el) continue;
    el.innerHTML = UI.renderWatchlistTable(watchlist);
    el.querySelectorAll('[data-symbol].clickable').forEach((n) => {
      n.addEventListener('click', () => openTicker(n.dataset.symbol));
    });
    el.querySelectorAll('.rm-watch').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sym = btn.dataset.symbol;
        await api(`/api/watchlist/${sym}?purpose=${btn.dataset.purpose}`, { method: 'DELETE' });
        loadWatchlists();
        showToast(`Removed ${sym} from ${btn.dataset.purpose} watchlist`, 'info');
      });
    });
  }
}

function bindWatchlistButtons(root) {
  $$(`${root} .watch-add`).forEach((btn) => {
    btn.onclick = async () => {
      const sym = btn.dataset.symbol;
      await api('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym, purpose: btn.dataset.purpose }),
      });
      loadWatchlists();
      showToast(`Added ${sym} to ${btn.dataset.purpose} watchlist`, 'ok');
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

let lastBriefingPayload = null;

async function loadBriefing() {
  $('#briefing-content').innerHTML = '<p class="muted">Loading…</p>';
  const { briefing } = await api('/api/briefing');
  lastBriefingPayload = briefing;
  $('#briefing-content').innerHTML = UI.renderBriefing(briefing);
  const asOfEl = $('#briefing-as-of');
  if (asOfEl) asOfEl.textContent = briefing?.as_of ? `As of ${briefing.as_of}` : '';
}

async function copyBriefingMarkdown() {
  const md = lastBriefingPayload?.markdown;
  if (!md) {
    showToast('Refresh briefing first', 'info');
    return;
  }
  try {
    await navigator.clipboard.writeText(md);
    showToast('Briefing markdown copied', 'ok');
  } catch {
    showToast('Could not copy to clipboard', 'info');
  }
}

const GLOSSARY_SECTION_ORDER = [
  'fundamental',
  'technical',
  'dashboard_overview',
  'dashboard_risk',
  'dashboard_tools',
];

const FUNDAMENTAL_IDS = new Set(['roe', 'pe', 'peg', 'debt_equity', 'margin_of_safety', 'pb_ratio', 'eps_ttm', 'dividend_yield', 'market_cap']);
const TECHNICAL_IDS = new Set(['adx', 'atr', 'rsi', 'macd', 'mfi']);
const PORTFOLIO_IDS = new Set(['inv', 'mom', 'risk']);

function orderGlossarySections(sections) {
  const byId = new Map((sections ?? []).map((s) => [s.id, s]));
  const ordered = GLOSSARY_SECTION_ORDER.map((id) => byId.get(id)).filter(Boolean);
  for (const s of sections ?? []) {
    if (!GLOSSARY_SECTION_ORDER.includes(s.id)) ordered.push(s);
  }
  return ordered;
}

function defaultTermSection(term) {
  if (term.section) return term.section;
  if (PORTFOLIO_IDS.has(term.id)) return 'dashboard_risk';
  if (TECHNICAL_IDS.has(term.id)) return 'technical';
  if (FUNDAMENTAL_IDS.has(term.id)) return 'fundamental';
  return 'fundamental';
}

function mergeGlossaryPayload(apiData, guide) {
  const rawTerms = Array.isArray(apiData) ? apiData : (apiData.terms ?? []);
  const metricTerms = rawTerms.map((t) => ({
    ...t,
    section: defaultTermSection(t),
  }));
  const byId = new Map(metricTerms.map((t) => [t.id, t]));
  for (const t of guide.terms ?? []) byId.set(t.id, t);

  const sectionById = new Map();
  for (const s of guide.sections ?? []) sectionById.set(s.id, s);
  for (const s of apiData.sections ?? []) sectionById.set(s.id, s);

  return {
    terms: [...byId.values()],
    sections: orderGlossarySections([...sectionById.values()]),
  };
}

async function loadGlossary() {
  const [apiData, guide] = await Promise.all([
    api('/api/glossary'),
    fetch('/analysis-glossary.json')
      .then((r) => (r.ok ? r.json() : { sections: [], terms: [] }))
      .catch(() => ({ sections: [], terms: [] })),
  ]);

  const merged = mergeGlossaryPayload(apiData, guide);

  glossaryTerms = merged.terms;
  glossarySections = merged.sections;
  renderGlossary();
  bindGlossaryToolbar();
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
  $('#glossary-list').innerHTML = UI.renderGlossary(
    glossaryTerms,
    $('#glossary-search')?.value,
    glossarySections,
  );
}

function bindGlossaryToolbar() {
  const setAll = (open) => {
    $$('#glossary-list details.glossary-section').forEach((el) => { el.open = open; });
  };
  const expandBtn = $('#glossary-expand-all');
  const collapseBtn = $('#glossary-collapse-all');
  if (expandBtn) expandBtn.onclick = () => setAll(true);
  if (collapseBtn) collapseBtn.onclick = () => setAll(false);
}

async function loadAnalytics() {
  const kpi = await api('/api/analytics/kpi');
  $('#analytics-content').innerHTML = UI.renderAnalytics(kpi);
}

async function loadNews() {
  const { news } = await api('/api/news?days=30');
  const tagged = news.filter((n) => n.symbol).length;
  const meta = $('#news-meta');
  if (meta) {
    meta.textContent = `${news.length} items · ${tagged} with ticker · run: npm run ingest:daily`;
  }

  const SOURCE_LABELS = {
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

  const TICKER_BN = {
    BXPHARMA: 'বেক্সিমকো',
    GP: 'গ্রামীণফোন',
    SQURPHARMA: 'স্কয়ার ফার্মা',
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

  const bnHeadline = (text) => /[\u0980-\u09FF]/.test(text ?? '');

  const fmtTicker = (n) => {
    if (!n.symbol) return '<span class="muted">—</span>';
    const bn = bnHeadline(n.headline) && TICKER_BN[n.symbol]
      ? `<span class="ticker-bn" lang="bn">${UI.esc(TICKER_BN[n.symbol])}</span>`
      : '';
    return `<span class="news-ticker"><span class="clickable" data-symbol="${n.symbol}">${UI.esc(n.symbol)}</span>${bn}</span>`;
  };

  $('#all-news').innerHTML = table(
    ['Date', 'Ticker', 'Headline', 'Source', 'Category'],
    news.map((n) => [
      UI.fmtDate(n.publishedDate),
      fmtTicker(n),
      n.url ? `<a href="${n.url}" target="_blank" rel="noopener">${UI.esc(n.headline)}</a>` : UI.esc(n.headline),
      UI.esc(SOURCE_LABELS[n.source] ?? n.source ?? '—'),
      UI.esc(n.category ?? '—'),
    ]),
  );
  $$('#all-news [data-symbol]').forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });
}

async function loadMacro() {
  const content = $('#macro-content');
  const meta = $('#macro-meta');
  if (content) content.innerHTML = '<p class="muted">Loading macro snapshot…</p>';
  try {
    const { macro } = await api('/api/macro');
    if (!macro) {
      if (meta) meta.textContent = '';
      if (content) content.innerHTML = UI.renderMacroPanel(null);
      return;
    }
    if (meta) {
      meta.textContent = `As of ${UI.fmtDate(macro.as_of)} · ${UI.macroSourceLabel(macro.source)}`;
    }
    if (content) content.innerHTML = UI.renderMacroPanel(macro);
  } catch (e) {
    if (meta) meta.textContent = '';
    if (content) {
      content.innerHTML = `<p class="muted">Failed to load macro data: ${UI.esc(e.message)}</p>`;
    }
  }
}

let skillsCache = [];
let activeSkillSlug = '';
let skillsViewMode = 'split';
let skillsPreviewTimer = null;

const SKILL_FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

function parseSkillMarkdown(skillMd) {
  const m = skillMd.match(SKILL_FM_RE);
  if (!m) return { frontmatter: '', body: skillMd };
  return { frontmatter: m[1] ?? '', body: m[2] ?? '' };
}

function renderSkillPreview(skillMd) {
  const preview = $('#skills-preview');
  if (!preview) return;
  const esc = UI?.esc ?? ((s) => String(s ?? ''));
  const text = skillMd ?? '';
  if (!text.trim()) {
    preview.innerHTML = '<p class="muted">Nothing to preview yet.</p>';
    return;
  }

  const { frontmatter, body } = parseSkillMarkdown(text);
  let html = '';

  if (frontmatter.trim()) {
    html += `<section class="skill-preview-fm" aria-label="YAML frontmatter">
      <div class="skill-preview-fm-label">YAML frontmatter</div>
      <pre><code>${esc(frontmatter.trim())}</code></pre>
    </section>`;
  }

  const bodyTrim = body.trim();
  if (!bodyTrim) {
    html += '<p class="muted">No markdown body after frontmatter.</p>';
  } else if (typeof marked !== 'undefined') {
    html += `<article class="skill-preview-body">${marked.parse(bodyTrim, { breaks: true, gfm: true })}</article>`;
  } else {
    html += `<pre class="skill-preview-fallback">${esc(bodyTrim)}</pre>`;
  }

  preview.innerHTML = html;
}

function setSkillsViewMode(mode) {
  skillsViewMode = mode;
  $$('.skills-view-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.skillsView === mode);
    btn.setAttribute('aria-selected', btn.dataset.skillsView === mode ? 'true' : 'false');
  });
  const pane = $('#skills-editor-pane');
  if (pane) {
    pane.classList.remove('skills-view-edit', 'skills-view-split', 'skills-view-preview');
    pane.classList.add(`skills-view-${mode}`);
  }
  if (mode !== 'edit') {
    renderSkillPreview($('#skills-editor')?.value ?? '');
  }
}

function scheduleSkillPreview() {
  if (skillsViewMode === 'edit') return;
  clearTimeout(skillsPreviewTimer);
  skillsPreviewTimer = setTimeout(() => {
    renderSkillPreview($('#skills-editor')?.value ?? '');
  }, 180);
}

async function loadSkillsList() {
  const { skills } = await api('/api/skills');
  skillsCache = skills ?? [];
  const esc = UI?.esc ?? ((s) => String(s ?? ''));
  $('#skills-table').innerHTML = table(
    ['Skill', 'Source', 'Version', 'Updated'],
    skillsCache.map((s) => [
      `<span class="clickable skills-pick" data-slug="${esc(s.slug)}">${esc(s.slug)}</span>`,
      `<span class="badge source-${esc(s.source)}">${esc(s.source)}</span>`,
      s.version != null ? esc(String(s.version)) : '—',
      s.updated_at ? UI.fmtDate(s.updated_at) : '—',
    ]),
  );
  const sel = $('#skills-select');
  if (sel) {
    sel.innerHTML = skillsCache.map((s) => `<option value="${esc(s.slug)}">${esc(s.slug)}</option>`).join('');
    if (activeSkillSlug && skillsCache.some((s) => s.slug === activeSkillSlug)) {
      sel.value = activeSkillSlug;
    } else if (skillsCache[0]) {
      activeSkillSlug = skillsCache[0].slug;
      sel.value = activeSkillSlug;
    }
  }
  $$('.skills-pick').forEach((el) => {
    el.addEventListener('click', () => loadSkillEditor(el.dataset.slug));
  });
  if (activeSkillSlug) await loadSkillEditor(activeSkillSlug, { keepEditorIfSame: true });
}

async function loadSkillEditor(slug, opts = {}) {
  if (!slug) return;
  activeSkillSlug = slug;
  const sel = $('#skills-select');
  if (sel) sel.value = slug;
  $$('#skills-table tr').forEach((tr) => {
    tr.classList.toggle('skills-row-active', tr.textContent?.includes(slug));
  });
  const { skill } = await api(`/api/skills/${encodeURIComponent(slug)}`);
  const meta = `${skill.slug} · ${skill.source}${skill.tool_name ? ` · MCP: ${skill.tool_name}` : ''} · ${skill.skill_md_length} chars`;
  $('#skills-meta').textContent = meta;
  const editor = $('#skills-editor');
  if (editor && (!opts.keepEditorIfSame || editor.value.trim() === '' || editor.dataset.slug !== slug)) {
    editor.value = skill.skill_md ?? '';
    editor.dataset.slug = slug;
  }
  scheduleSkillPreview();
  if (skillsViewMode !== 'edit') renderSkillPreview(editor?.value ?? '');
  setSkillsStatus('');
}

function setSkillsStatus(msg, kind = '') {
  const el = $('#skills-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `muted skills-status${kind ? ` ${kind}` : ''}`;
  if (kind === 'ok' || kind === 'error') {
    showToast(msg, kind);
  }
}

async function saveSkill(syncToDisk) {
  const slug = activeSkillSlug || $('#skills-select')?.value;
  const skillMd = $('#skills-editor')?.value ?? '';
  if (!slug || !skillMd.trim()) {
    setSkillsStatus('Select a skill and enter SKILL.md content', 'error');
    return;
  }
  setSkillsStatus('Saving…');
  try {
    const data = await api(`/api/skills/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_md: skillMd, sync_to_disk: syncToDisk, client_id: 'dashboard' }),
    });
    setSkillsStatus(`Saved v${data.version}${data.synced_to_disk ? ' · synced to disk' : ''}`, 'ok');
    await loadSkillsList();
    await loadSkillEditor(slug, { keepEditorIfSame: true });
  } catch (e) {
    setSkillsStatus(e.message, 'error');
  }
}

async function resetSkillOverride() {
  const slug = activeSkillSlug || $('#skills-select')?.value;
  if (!slug) return;
  if (!confirm(`Remove DB override for ${slug} and revert to on-disk SKILL.md?`)) return;
  setSkillsStatus('Resetting…');
  try {
    await api(`/api/skills/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    setSkillsStatus('Reverted to disk', 'ok');
    await loadSkillsList();
    await loadSkillEditor(slug);
  } catch (e) {
    setSkillsStatus(e.message, 'error');
  }
}

async function syncSkillToDisk() {
  const slug = activeSkillSlug || $('#skills-select')?.value;
  if (!slug) return;
  setSkillsStatus('Syncing to disk…');
  try {
    const data = await api(`/api/skills/${encodeURIComponent(slug)}/sync-disk`, { method: 'POST' });
    setSkillsStatus(`Synced (${data.source}) → ${data.disk_path}`, 'ok');
  } catch (e) {
    setSkillsStatus(e.message, 'error');
  }
}

async function reloadSkillFromDisk() {
  const slug = activeSkillSlug || $('#skills-select')?.value;
  if (!slug) return;
  await loadSkillEditor(slug);
  setSkillsStatus('Reloaded effective skill', 'ok');
}

async function loadDaily() {
  const el = $('#daily-content');
  if (!el || !UI) return;
  const sym = currentTickerData?.ticker?.symbol ?? $('#ticker-select')?.value ?? 'GP';
  el.innerHTML = UI.renderDailyCommands(sym);
  bindPanelLinks('#panel-daily');
  $('#panel-daily [data-daily-analysis-tab]')?.addEventListener('click', () => {
    navigateToPanel('ticker-detail', { historyMode: 'push' });
    showSubPanel('commands');
  });
  try {
    const { runs } = await api('/api/ingest-runs?limit=20');
    const banner = $('#daily-status-banner');
    if (banner) banner.outerHTML = UI.renderDailyStatusBanner(runs);
  } catch {
    const banner = $('#daily-status-banner');
    if (banner) {
      banner.className = 'daily-status-banner daily-status-warn';
      banner.textContent = 'Could not load ingest status — is Postgres running?';
    }
  }
}

async function loadOps() {
  const [fresh, runs, stats] = await Promise.all([
    api('/api/freshness'),
    api('/api/ingest-runs?limit=100'),
    api('/api/stats').catch(() => ({ counts: {} })),
  ]);
  const c = stats.counts ?? {};
  $('#ops-stat-cards').innerHTML = Object.entries(c)
    .map(([k, v]) => `<div class="card"><div class="label">${k.replace(/_/g, ' ')}</div><div class="value">${UI.fmtNum(v, 0)}</div></div>`)
    .join('');
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
    navigateToPanel(btn.dataset.panel, { historyMode: 'push' });
  });
});

$('#panel-daily')?.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('[data-copy-cmd]');
  if (!copyBtn) return;
  const cmd = copyBtn.getAttribute('data-copy-cmd');
  const label = copyBtn.classList.contains('cmd-quick-chip')
    ? copyBtn.textContent?.trim()
    : copyBtn.closest('.cmd-row')?.querySelector('strong')?.textContent?.trim();
  await copyCommand(cmd, label);
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

bindClick('#load-ticker', () => {
  navigateToPanel('ticker-detail', { ticker: $('#ticker-select').value, historyMode: 'replace' });
});
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
bindClick('#briefing-copy-md', copyBriefingMarkdown);
bindClick('#refresh-home', () => loadOverview());

window.addEventListener('hashchange', () => {
  onRouteChange();
});

window.addEventListener('popstate', () => {
  onRouteChange();
});
bindClick('#load-analytics', loadAnalytics);
bindClick('#refresh-news', loadNews);
bindClick('#refresh-macro', loadMacro);
bindClick('#skills-refresh', loadSkillsList);
bindClick('#skills-save-db', () => saveSkill(false));
bindClick('#skills-save-disk', () => saveSkill(true));
bindClick('#skills-sync-disk', syncSkillToDisk);
bindClick('#skills-reset', resetSkillOverride);
bindClick('#skills-reload-disk', reloadSkillFromDisk);
$$('.skills-view-btn').forEach((btn) => {
  btn.addEventListener('click', () => setSkillsViewMode(btn.dataset.skillsView ?? 'split'));
});
$('#skills-select')?.addEventListener('change', (e) => loadSkillEditor(e.target.value));
const skillsEditorEl = $('#skills-editor');
skillsEditorEl?.addEventListener('input', scheduleSkillPreview);
skillsEditorEl?.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  const ta = e.target;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  ta.value = `${ta.value.slice(0, start)}  ${ta.value.slice(end)}`;
  ta.selectionStart = ta.selectionEnd = start + 2;
  scheduleSkillPreview();
});
$('#glossary-search')?.addEventListener('input', renderGlossary);

$('#chart-tf').addEventListener('change', () => {
  renderChart(resampleOhlcv(rawOhlcv, $('#chart-tf').value));
});

$$('.add-position').forEach((btn) => {
  btn.addEventListener('click', () => {
    addPortfolioPosition(btn.dataset.purpose);
  });
});

$('#sync-trading-portfolio')?.addEventListener('click', async () => {
  const { copied } = await api('/api/portfolio/sync-trading', { method: 'POST' });
  showToast(`Copied ${copied} positions to momentum trading`, 'ok');
  await loadPortfolio();
});

async function init() {
  const route = parseHashRoute();
  showPanel(route.panel, { updateHash: false, ticker: route.ticker });
  try {
    await loadTickers();
    await Promise.all([
      loadPanelData(route.panel, { ticker: route.ticker }),
      loadWatchlists(),
      loadNews(),
      loadMacro(),
      loadOps(),
      loadDiscover(),
      loadGlossary(),
    ]);
    if (route.panel !== 'ticker-detail') {
      await loadTickerDetail(route.ticker || $('#ticker-select').value || 'LHB');
    }
  } catch (e) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div class="error-banner">Failed to load: ${UI ? UI.esc(e.message) : e.message}. Is Postgres running? Try: docker compose up -d postgres && npm run db:migrate</div>`,
    );
  }
}

init();
