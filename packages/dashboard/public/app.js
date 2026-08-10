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
let sectorCharts = {};
const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b', '#a855f7', '#14b8a6', '#f97316', '#84cc16'];
let currentTickerData = null;
let allTickers = [];
let currentAnalysis = null;
let currentSnapshotMeta = null;
let viewMode = 'both';
let valueBucket = 'buffett';
let momentumStrategyTab = 'minervini_sepa';
let glossaryTerms = [];
let glossarySections = [];
let rawOhlcv = [];
let activeJsonKey = null;
let tickerSortKey = 'symbol';
let tickerSortDir = 'asc';
let tickerSectorFilter = '';
let discoverTab = 'screen';

function chartColors() {
  const root = getComputedStyle(document.documentElement);
  return {
    line: root.getPropertyValue('--chart-line').trim() || '#2563eb',
    muted: root.getPropertyValue('--chart-muted').trim() || '#94a3b8',
  };
}

function initTheme() {
  const saved = localStorage.getItem('stock-buddy-theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (dark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('stock-buddy-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('stock-buddy-theme', 'dark');
  }
  if (rawOhlcv.length) renderChart(resampleOhlcv(rawOhlcv, $('#chart-tf')?.value ?? 'daily'));
}

function closeMobileNav() {
  $('#main-nav')?.classList.remove('open');
  const toggle = $('#nav-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function closeToolsMenu() {
  $('#nav-tools-wrap')?.classList.remove('open');
}

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

function portfolioBookLabel(purpose) {
  return purpose === 'trading' ? 'momentum trading' : 'investment';
}

let actionModalResolve = null;

/**
 * @returns {Promise<{ confirmed: boolean, value?: string }>}
 */
function showActionModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  input,
}) {
  return new Promise((resolve) => {
    const modal = $('#action-modal');
    const titleEl = $('#action-modal-title');
    const messageEl = $('#action-modal-message');
    const inputWrap = $('#action-modal-input-wrap');
    const inputEl = $('#action-modal-input');
    const inputLabel = $('#action-modal-input-label');
    const inputHint = $('#action-modal-input-hint');
    const confirmBtn = $('#action-modal-confirm');
    const cancelBtn = $('#action-modal-cancel');
    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
      resolve({ confirmed: false });
      return;
    }

    actionModalResolve = resolve;
    titleEl.textContent = title ?? 'Confirm';
    messageEl.textContent = message ?? '';
    cancelBtn.textContent = cancelLabel;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.classList.toggle('is-danger', Boolean(danger));

    if (input && inputWrap && inputEl && inputLabel) {
      inputWrap.classList.remove('hidden');
      inputLabel.textContent = input.label ?? 'Value';
      inputEl.type = input.type ?? 'text';
      inputEl.value = input.value ?? '';
      inputEl.min = input.min ?? '';
      inputEl.max = input.max ?? '';
      inputEl.step = input.step ?? 'any';
      inputEl.placeholder = input.placeholder ?? '';
      if (inputHint) {
        if (input.hint) {
          inputHint.textContent = input.hint;
          inputHint.classList.remove('hidden');
        } else {
          inputHint.textContent = '';
          inputHint.classList.add('hidden');
        }
      }
    } else if (inputWrap) {
      inputWrap.classList.add('hidden');
    }

    modal.classList.remove('hidden');

    const focusTarget = input && inputEl ? inputEl : confirmBtn;
    window.setTimeout(() => focusTarget?.focus(), 0);

    const onConfirm = () => {
      if (input && inputEl) {
        const val = inputEl.value.trim();
        if (!val) {
          showToast(`${input.label ?? 'Value'} is required`, 'error');
          inputEl.focus();
          return;
        }
        if (input.type === 'number') {
          const num = Number(val);
          if (!Number.isFinite(num) || num <= 0) {
            showToast('Enter a positive number', 'error');
            inputEl.focus();
            return;
          }
          if (input.min != null && num < Number(input.min)) {
            showToast(`Minimum is ${input.min}`, 'error');
            inputEl.focus();
            return;
          }
          if (input.max != null && num > Number(input.max)) {
            showToast(`Maximum is ${input.max}`, 'error');
            inputEl.focus();
            return;
          }
        }
        closeActionModal({ confirmed: true, value: val });
        return;
      }
      closeActionModal({ confirmed: true });
    };

    confirmBtn.onclick = onConfirm;
    cancelBtn.onclick = () => closeActionModal({ confirmed: false });
    if (inputEl) {
      inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onConfirm();
        }
      };
    }
  });
}

function closeAgentDetailModal() {
  $('#agent-detail-modal')?.classList.add('hidden');
}

function showAgentDetailModal({ title, html }) {
  const modal = $('#agent-detail-modal');
  const titleEl = $('#agent-detail-title');
  const bodyEl = $('#agent-detail-body');
  if (!modal || !titleEl || !bodyEl) return;
  titleEl.textContent = title ?? 'Agent status';
  bodyEl.innerHTML = html ?? '<p class="muted">No details available.</p>';
  modal.classList.remove('hidden');
}

function bindAgentDetailModal() {
  document.querySelectorAll('[data-close-agent-detail]').forEach((el) => {
    el.addEventListener('click', closeAgentDetailModal);
  });
}

function openAgentStatusDetail(agentKey, lens) {
  if (!UI?.renderAgentDetailModalContent || !currentAnalysis) return;
  const cards = currentAnalysis.agent_cards ?? {};
  const syn = currentAnalysis.synthesis ?? {};
  const label = {
    fundamental: 'Fundamental',
    smart_money: 'Smart money',
    macro: 'Macro',
    sentiment: 'Sentiment',
    technical: 'Technical',
    volume_flow: 'Volume flow',
  }[agentKey] ?? agentKey;
  const lensLabel = lens === 'momentum' ? 'Momentum' : 'Investment';
  const html = UI.renderAgentDetailModalContent(agentKey, lens, cards, syn);
  showAgentDetailModal({ title: `${label} — ${lensLabel} signal`, html });
}

function closeActionModal(result = { confirmed: false }) {
  const modal = $('#action-modal');
  modal?.classList.add('hidden');
  const inputEl = $('#action-modal-input');
  if (inputEl) inputEl.onkeydown = null;
  const resolve = actionModalResolve;
  actionModalResolve = null;
  resolve?.(result);
}

function initActionModal() {
  document.querySelectorAll('[data-close-action-modal]').forEach((el) => {
    el.addEventListener('click', () => closeActionModal({ confirmed: false }));
  });
}

// The async Clipboard API is unavailable on non-secure origins and is denied to
// a cross-origin frame (the workspace app embed) unless the parent delegates
// clipboard-write. execCommand still works in both, given a user gesture.
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  return legacyCopy(text);
}

async function copyCommand(text, label) {
  if (!text) return false;
  const ok = await copyText(text);
  if (ok) {
    const msg = label ? `Copied: ${label}` : 'Command copied';
    setAnalysisStatus(msg, 'ok');
    showToast(msg, 'ok');
  } else {
    setAnalysisStatus('Copy failed — select command manually', 'error');
    showToast('Copy failed — select the text manually', 'error');
  }
  return ok;
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
  $$('.tab').forEach((t) => {
    if (t.dataset.panel) t.classList.toggle('active', t.dataset.panel === panel);
  });
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${panel}`));
  closeMobileNav();
  closeToolsMenu();
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
  if (UI?.resampleOhlcvCalendar) return UI.resampleOhlcvCalendar(bars, tf);
  if (tf === 'daily') return bars;
  const out = [];
  const chunk = tf === 'weekly' ? 5 : 21;
  for (let i = 0; i < bars.length; i += chunk) {
    const slice = bars.slice(i, i + chunk);
    if (!slice.length) continue;
    out.push({
      date: slice[slice.length - 1].date,
      open: slice[0].open,
      high: Math.max(...slice.map((b) => b.high)),
      low: Math.min(...slice.map((b) => b.low)),
      close: slice[slice.length - 1].close,
      volume: slice.reduce((s, b) => s + (b.volume ?? 0), 0),
    });
  }
  return out;
}

function renderChart(bars) {
  const colors = chartColors();
  const labels = bars.map((b) => b.date);
  const closes = bars.map((b) => b.close);
  ohlcvChart = destroyChart(ohlcvChart);
  ohlcvChart = new Chart($('#ohlcv-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Close (BDT)', data: closes, borderColor: colors.line, tension: 0.1, pointRadius: 0 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: colors.muted } } },
      scales: {
        x: { ticks: { color: colors.muted, maxTicksLimit: 8 } },
        y: { ticks: { color: colors.muted } },
      },
    },
  });
}

function renderAnalysisAboveFold() {
  if (!UI) return;
  const ticker = currentTickerData?.ticker;
  const ohlcv = currentTickerData?.ohlcv ?? rawOhlcv;
  const a = currentAnalysis;
  const heroEl = $('#analysis-hero');
  const verdictEl = $('#analysis-verdict');
  const healthEl = $('#analysis-health');
  const keyEl = $('#analysis-keynums');
  if (heroEl) heroEl.innerHTML = UI.renderStockHero(ticker, ohlcv, a);
  if (verdictEl) {
    verdictEl.innerHTML = a
      ? UI.renderPlainVerdict(a.synthesis, a.value_investment_checklist, UI.resolveMomentumTrading(a), ticker)
      : '<p class="muted">Run Analyze for a plain-English verdict.</p>';
  }
  if (healthEl) {
    healthEl.innerHTML = a?.value_investment_checklist
      ? UI.renderHealthCheck(a.value_investment_checklist)
      : '';
  }
  if (keyEl) {
    keyEl.innerHTML = currentTickerData?.fundamentals
      ? UI.renderKeyNumbers(currentTickerData.fundamentals, currentTickerData)
      : '';
  }
}

function renderFullAnalysis() {
  if (!UI) return;
  const a = currentAnalysis;
  if (!a) {
    const sym = currentTickerData?.ticker?.symbol ?? currentTickerData?.symbol;
    ['summary', 'momentum', 'business', 'risk', 'history'].forEach((s) => {
      const el = $(`#sub-${s}`);
      if (el) el.innerHTML = '<p class="muted">No analysis — run Analyze.</p>';
    });
    const invEl = $('#sub-investment');
    if (invEl) {
      invEl.innerHTML =
        (sym ? UI.renderTickerClaudePrompts(sym, null) : '') +
        '<p class="muted">No analysis — run Analyze or paste a Claude MCP prompt above.</p>';
    }
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
    renderAnalysisAboveFold();
    if (currentTickerData?.news) {
      $('#sub-summary').innerHTML = UI.renderTickerNewsTeaser(currentTickerData.news, 3);
      bindSubPanelLinks('#sub-summary');
    }
    return;
  }

  const cards = a.agent_cards ?? {};
  const syn = a.synthesis ?? {};
  const mt = UI.resolveMomentumTrading(a);
  const vc = a.value_investment_checklist;
  const rot = a.momentum_rotation ?? mt?.momentum_rotation;

  $('#sub-summary').innerHTML =
    UI.renderComparison(syn, mt, vc) +
    UI.renderRecentMomentumBlock(currentTickerData?.ohlcv ?? rawOhlcv) +
    UI.renderTickerNewsTeaser(currentTickerData?.news, 3);
  $('#sub-investment').innerHTML =
    UI.renderTickerClaudePrompts(currentTickerData?.ticker?.symbol ?? currentTickerData?.symbol, vc) +
    (viewMode !== 'momentum' ? UI.renderSynthesisAgentBoard(cards, syn, 'investment') : '') +
    UI.renderThinkingCard('Investment Agent', cards.fundamental, 'Fundamentals, value criteria, long-term thesis (REQ-006)') +
    (viewMode !== 'momentum' ? `<div class="checklist-block"><h4>Value checklist</h4>${UI.renderValueChecklist(vc, valueBucket)}</div>` : '');
  $('#sub-momentum').innerHTML =
    UI.renderBuySignalBanner(a.daily_buy_signal) +
    (viewMode !== 'investment' ? UI.renderSynthesisAgentBoard(cards, syn, 'momentum') : '') +
    UI.renderThinkingCard('Technical Agent', cards.technical, 'Technical indicators and chart context (REQ-007)') +
    UI.renderIndicators(cards.technical) +
    (viewMode !== 'investment'
      ? `<div class="checklist-block"><h4>Momentum master strategies</h4>${UI.renderMomentumStrategiesPanel(mt, momentumStrategyTab, rot)}</div>` +
        UI.renderMultiTimeframePanel(mt?.multi_timeframe) +
        UI.renderMarketStructurePanel(mt?.market_structure)
      : '');
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
      if (btn.dataset.strategy != null) {
        momentumStrategyTab = btn.dataset.strategy;
      } else {
        valueBucket = btn.dataset.bucket;
      }
      renderFullAnalysis();
    };
  });
  updateAnalysisDataBar();
  renderAnalysisAboveFold();
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
    patchTickerListAnalysis(data.symbol ?? sym, data.analysis);
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
    const colors = chartColors();
    shareChart = new Chart($('#share-chart'), {
      type: 'doughnut',
      data: {
        labels: ['Sponsor', 'Institution', 'Foreign', 'Public', 'Govt'],
        datasets: [{
          data: [last.sponsor, last.institution, last.foreign, last.public, last.govt],
          backgroundColor: ['#2563eb', '#8b5cf6', '#16a34a', '#d97706', colors.muted],
        }],
      },
      options: { plugins: { legend: { labels: { color: colors.muted } } } },
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
  const [data, rankings] = await Promise.all([
    api('/api/overview'),
    api('/api/rankings?limit=5').catch(() => ({ rankings: [] })),
  ]);
  lastBriefingPayload = data.briefing ?? null;
  const home = UI.renderHome({ ...data, topRanked: rankings.rankings });

  $('#home-briefing-content').innerHTML = home.briefing;
  $('#home-important-news').innerHTML = home.importantNews;
  const rankedEl = $('#home-ranked-preview');
  if (rankedEl) rankedEl.innerHTML = home.rankedPreview;

  bindHomeClicks('#panel-overview');
  bindPanelLinks('#panel-overview');
  $$('#home-ranked-preview [data-symbol]').forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });
}

function renderTickersPanel() {
  const q = () => ($('#ticker-search').value || '').toUpperCase();
  const filtered = allTickers.filter((t) => {
    const matchQ = t.symbol.includes(q()) || (t.name ?? '').toUpperCase().includes(q());
    const matchSector = !tickerSectorFilter || (t.sector ?? '') === tickerSectorFilter;
    return matchQ && matchSector;
  });
  $('#tickers-table').innerHTML = UI.renderTickersTable(filtered, {
    sortKey: tickerSortKey,
    sortDir: tickerSortDir,
    sectorFilter: tickerSectorFilter,
  });
  $$('#tickers-table [data-symbol]').forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });
  $$('#tickers-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (tickerSortKey === key) tickerSortDir = tickerSortDir === 'asc' ? 'desc' : 'asc';
      else {
        tickerSortKey = key;
        tickerSortDir = 'asc';
      }
      renderTickersPanel();
    });
  });
}

function renderSectorChips() {
  const chipsEl = $('#ticker-sector-chips');
  if (!chipsEl) return;
  const sectors = [...new Set(allTickers.map((t) => t.sector).filter(Boolean))].sort();
  chipsEl.innerHTML =
    `<button type="button" class="sector-chip-btn ${tickerSectorFilter === '' ? 'active' : ''}" data-sector="">All</button>`
    + sectors.map((s) =>
      `<button type="button" class="sector-chip-btn ${tickerSectorFilter === s ? 'active' : ''}" data-sector="${UI.esc(s)}">${UI.esc(s)}</button>`,
    ).join('');
  $$('#ticker-sector-chips .sector-chip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      tickerSectorFilter = btn.dataset.sector ?? '';
      renderTickersPanel();
      renderSectorChips();
    });
  });
}

function refreshTickerSelectOptions(filter) {
  const sel = $('#ticker-select');
  if (!sel) return;
  const cur = sel.value;
  const q = filter ?? $('#ticker-select-filter')?.value ?? '';
  const { html } = populateTickerSelectOptions(q);
  sel.innerHTML = html;
  if (cur && allTickers.some((t) => t.symbol === cur)) sel.value = cur;
  else if (!q && allTickers.some((t) => t.symbol === 'LHB')) sel.value = 'LHB';
}

function patchTickerListAnalysis(symbol, analysis) {
  const sym = String(symbol ?? '').toUpperCase();
  const t = allTickers.find((x) => x.symbol === sym);
  if (!t || !analysis) return;
  const syn = analysis.synthesis ?? {};
  const inv = syn.investment ?? {};
  const mom = syn.momentum ?? {};
  const vc = analysis.value_investment_checklist ?? {};
  const mt = analysis.momentum_trading ?? {};
  const summary = mt.summary ?? {};
  const ms = analysis.momentum_screen ?? {};
  if (inv.composite_1_10 != null) t.investment_score = inv.composite_1_10;
  if (inv.rating) t.investment_rating = inv.rating;
  if (mom.composite_1_10 != null) t.momentum_score = mom.composite_1_10;
  if (mom.rating) t.momentum_rating = mom.rating;
  if (vc.rating) t.value_grade = vc.rating;
  if (vc.key_metrics?.gpa != null) t.gpa = vc.key_metrics.gpa;
  const momGrade = summary.rating ?? summary.consensus_grade ?? ms.rating;
  if (momGrade) t.momentum_grade = momGrade;
  const momCount = summary.overall_count ?? ms.key_metrics?.overall_count;
  if (momCount) t.momentum_count = momCount;
  refreshTickerSelectOptions();
  if ($('#panel-tickers')?.classList.contains('active')) renderTickersPanel();
}

async function loadTickers() {
  const { tickers } = await api('/api/tickers');
  allTickers = [...tickers].sort((a, b) => a.symbol.localeCompare(b.symbol));
  $('#ticker-search').oninput = () => renderTickersPanel();
  $('#ticker-select-filter')?.addEventListener('input', (e) => {
    refreshTickerSelectOptions(e.target.value ?? '');
  });
  renderSectorChips();
  renderTickersPanel();

  const sel = $('#ticker-select');
  if (sel) refreshTickerSelectOptions();

  populateWatchSelects('investment');
  populateWatchSelects('trading');
  populatePosSymbolSelects('investment');
  populatePosSymbolSelects('trading');
  initPortfolioFillDates();
}

function populateTickerSelectOptions(filter = '') {
  const q = filter.trim().toUpperCase();
  const filtered = q
    ? allTickers.filter(
        (t) => t.symbol.includes(q) || (t.name ?? '').toUpperCase().includes(q),
      )
    : allTickers;

  const cap = 400;
  const slice = filtered.slice(0, cap);
  const html =
    '<option value="">Choose symbol…</option>'
    + slice.map((t) => {
      const label = UI.renderTickerOptionLabel(t);
      return `<option value="${UI.esc(t.symbol)}">${UI.esc(label)}</option>`;
    }).join('')
    + (filtered.length > cap ? `<option value="" disabled>…${filtered.length - cap} more — narrow filter</option>` : '');

  return { html, slice };
}

function populateWatchSelects(purpose, filter = '') {
  const sel = $(`#watch-select-${purpose}`);
  if (!sel) return;

  const { html, slice } = populateTickerSelectOptions(filter);
  const cur = sel.value;
  sel.innerHTML = html;

  if (cur && slice.some((t) => t.symbol === cur)) sel.value = cur;
}

function populatePosSymbolSelects(purpose, filter = '') {
  const sel = $(`.pos-symbol[data-purpose="${purpose}"]`);
  if (!sel) return;

  const { html, slice } = populateTickerSelectOptions(filter);
  const cur = sel.value;
  sel.innerHTML = html;

  if (cur && slice.some((t) => t.symbol === cur)) sel.value = cur;
}

function buildTickerAllocation(positions) {
  if (!positions?.length) return [];
  const items = positions.map((p) => ({
    label: p.ticker,
    value: p.market_value ?? p.cost_basis ?? 0,
  })).filter((x) => x.value > 0);
  const total = items.reduce((s, x) => s + x.value, 0);
  return items
    .map((x) => ({ ...x, pct: total > 0 ? (x.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

function pieLabelsWithPct(items) {
  return items.map((i) => `${i.label ?? i.sector} (${UI.fmtNum(i.pct, 1)}%)`);
}

function renderPieChart(canvas, chartKey, items, title) {
  if (!canvas) return;
  sectorCharts[chartKey] = destroyChart(sectorCharts[chartKey]);
  if (!items?.length) return;

  const values = items.map((i) => i.value);
  sectorCharts[chartKey] = new Chart(canvas, {
    type: 'pie',
    data: {
      labels: pieLabelsWithPct(items),
      datasets: [{
        data: values,
        backgroundColor: PIE_COLORS.slice(0, items.length),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: 6 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#8b9cb3',
            boxWidth: 12,
            font: { size: 11 },
            padding: 10,
          },
        },
        title: { display: true, text: title, color: '#8b9cb3', font: { size: 12 }, padding: { bottom: 8 } },
        tooltip: {
          callbacks: {
            label(ctx) {
              const item = items[ctx.dataIndex];
              return ` ${item.label ?? item.sector}: ৳${UI.fmtNum(item.value, 0)} (${UI.fmtNum(item.pct, 1)}%)`;
            },
          },
        },
      },
    },
  });
}

function renderPortfolioCharts(purpose, portfolio, { canvasPrefix = '' } = {}) {
  const sectorCanvas = $(`#${canvasPrefix}sector-chart-${purpose}`);
  const tickerCanvas = $(`#${canvasPrefix}ticker-chart-${purpose}`);
  const sectorKey = `${canvasPrefix}${purpose}-sector`;
  const tickerKey = `${canvasPrefix}${purpose}-ticker`;

  const sectorItems = (portfolio?.sector_allocation ?? []).map((s) => ({
    label: s.sector,
    sector: s.sector,
    value: s.value,
    pct: s.pct ?? 0,
  }));

  const tickerItems = buildTickerAllocation(portfolio?.positions);
  const bookLabel = purpose === 'trading' ? 'Trading' : 'Investment';

  renderPieChart(sectorCanvas, sectorKey, sectorItems, `${bookLabel} by sector`);
  renderPieChart(tickerCanvas, tickerKey, tickerItems, `${bookLabel} by ticker`);
}

function resizePortfolioCharts() {
  requestAnimationFrame(() => {
    for (const chart of Object.values(sectorCharts)) {
      chart?.resize?.();
    }
  });
}

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function initPortfolioFillDates() {
  for (const purpose of ['investment', 'trading']) {
    const el = $(`.pos-date[data-purpose="${purpose}"]`);
    if (el && !el.value) el.value = todayInputDate();
  }
}

let fillsModalSymbol = '';
let fillsModalPurpose = 'investment';

function closePortfolioFillsModal() {
  $('#portfolio-fills-modal')?.classList.add('hidden');
  fillsModalSymbol = '';
}

async function refreshPortfolioFillsModal() {
  if (!fillsModalSymbol) return;
  const body = $('#portfolio-fills-body');
  if (!body) return;
  try {
    const data = await api(`/api/portfolio/positions/${encodeURIComponent(fillsModalSymbol)}/fills?purpose=${fillsModalPurpose}`);
    body.innerHTML = UI.renderPortfolioFillsModal(data);
    bindPortfolioFillsModal(body);
  } catch (e) {
    body.innerHTML = `<p class="muted">${UI.esc(e.message || 'Could not load buy history')}</p>`;
  }
}

function setFillRowEditing(row, editing) {
  if (!row) return;
  row.classList.toggle('is-editing', editing);
  if (editing) row.classList.remove('is-splitting');
  row.querySelectorAll('.fill-view').forEach((el) => el.classList.toggle('hidden', editing));
  const editCell = row.querySelector('.fill-edit');
  if (editCell) editCell.classList.toggle('hidden', !editing);
  const splitCell = row.querySelector('.fill-split');
  if (splitCell) splitCell.classList.toggle('hidden', true);
}

function setFillRowSplitting(row, splitting) {
  if (!row) return;
  row.classList.toggle('is-splitting', splitting);
  if (splitting) row.classList.remove('is-editing');
  row.querySelectorAll('.fill-view').forEach((el) => el.classList.toggle('hidden', splitting));
  const splitCell = row.querySelector('.fill-split');
  if (splitCell) splitCell.classList.toggle('hidden', !splitting);
  const editCell = row.querySelector('.fill-edit');
  if (editCell) editCell.classList.toggle('hidden', true);
}

async function submitPortfolioMove({ symbol, from, to, qty, maxQty, closeModal = false, skipConfirm = false }) {
  const max = Number(maxQty);
  const moveQty = qty == null || qty === '' ? max : Number(qty);
  if (!moveQty || moveQty <= 0) {
    showToast('Enter a positive share quantity', 'error');
    return;
  }
  if (max > 0 && moveQty > max) {
    showToast(`Cannot move more than ${max} shares`, 'error');
    return;
  }
  const partial = max > 0 && moveQty < max;
  const label = partial ? `${moveQty} of ${max}` : `all ${moveQty}`;
  const fromLabel = portfolioBookLabel(from);
  const toLabel = portfolioBookLabel(to);

  if (!skipConfirm) {
    const { confirmed } = await showActionModal({
      title: `Move to ${toLabel}`,
      message: `Move ${label} shares of ${symbol} from ${fromLabel} to ${toLabel}.\n\nOldest buy lots transfer first (FIFO). Each lot keeps its date, price, and notes.`,
      confirmLabel: 'Move shares',
    });
    if (!confirmed) return;
  }

  const result = await api('/api/portfolio/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, from, to, qty: moveQty }),
  });
  showToast(
    partial
      ? `Moved ${result.moved_qty} shares of ${symbol} to ${toLabel}`
      : `Moved all ${result.moved_qty} shares of ${symbol} to ${toLabel}`,
    'ok',
  );
  if (closeModal) closePortfolioFillsModal();
  await loadPortfolio();
}

function bindPortfolioFillsModal(root) {
  if (!root) return;

  root.querySelector('#portfolio-add-fill-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const trade_date = form.trade_date?.value;
    const qty = Number(form.qty?.value);
    const price = Number(form.price?.value);
    const notes = form.notes?.value?.trim() ?? '';
    if (!trade_date || !qty || !price) {
      showToast('Date, qty, and price are required', 'error');
      return;
    }
    await api('/api/portfolio/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: fillsModalSymbol,
        qty,
        avg_cost: price,
        trade_date,
        notes,
        purpose: fillsModalPurpose,
      }),
    });
    showToast('Fill added', 'ok');
    form.reset();
    if (form.trade_date) form.trade_date.value = new Date().toISOString().slice(0, 10);
    await refreshPortfolioFillsModal();
    await loadPortfolio();
  });

  root.querySelector('#portfolio-move-qty-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = root.querySelector('.move-pos-from-modal');
    if (!btn) return;
    await submitPortfolioMove({
      symbol: btn.dataset.symbol,
      from: btn.dataset.from,
      to: btn.dataset.to,
      qty: e.target.move_qty?.value,
      maxQty: btn.dataset.maxQty,
      closeModal: true,
    });
  });

  root.querySelectorAll('.move-fill').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const to = btn.dataset.to;
      const fillId = btn.dataset.fillId;
      const sym = btn.dataset.symbol || fillsModalSymbol;
      const from = btn.dataset.from || fillsModalPurpose;
      const qty = btn.dataset.fillQty;
      const price = btn.dataset.fillPrice;
      const date = btn.dataset.fillDate;
      const notes = btn.dataset.fillNotes;
      const toLabel = portfolioBookLabel(to);
      const fromLabel = portfolioBookLabel(from);
      const priceStr = price != null && UI?.fmtNum ? `৳${UI.fmtNum(price, 2)}` : `৳${price}`;
      let message = `Move ${qty} shares of ${sym}`;
      if (date) message += ` (bought ${date}`;
      if (price) message += date ? ` @ ${priceStr})` : ` @ ${priceStr}`;
      else if (date) message += ')';
      message += ` from ${fromLabel} to ${toLabel}.`;
      if (notes) message += `\n\nNotes: “${notes}”`;
      message += '\n\nThis fill keeps its full history in the destination book.';

      const { confirmed } = await showActionModal({
        title: 'Move this fill',
        message,
        confirmLabel: `Move to ${toLabel}`,
      });
      if (!confirmed) return;

      try {
        const result = await api(`/api/portfolio/fills/${fillId}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to }),
        });
        showToast(`Moved ${result.moved_qty} shares of ${sym} to ${toLabel}`, 'ok');
        await refreshPortfolioFillsModal();
        await loadPortfolio();
      } catch (e) {
        showToast(e.message || 'Could not move fill', 'error');
      }
    });
  });

  root.querySelectorAll('.split-fill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.fill-row');
      root.querySelectorAll('.fill-row.is-splitting, .fill-row.is-editing').forEach((r) => {
        setFillRowSplitting(r, false);
        setFillRowEditing(r, false);
      });
      setFillRowSplitting(row, true);
      bindSplitPricePreview(row);
    });
  });

  function bindSplitPricePreview(row) {
    if (!row || row.dataset.splitPreviewBound) return;
    row.dataset.splitPreviewBound = '1';
    const qtyInput = row.querySelector('.fill-split-qty');
    const priceInput = row.querySelector('.fill-split-price');
    const preview = row.querySelector('.fill-split-preview');
    const saveBtn = row.querySelector('.save-split');
    if (!qtyInput || !preview || !saveBtn) return;
    const lotQty = Number(saveBtn.dataset.lotQty);
    const lotPrice = Number(saveBtn.dataset.lotPrice);
    const update = () => {
      const splitQty = Number(qtyInput.value);
      const splitPrice = priceInput?.value?.trim() ? Number(priceInput.value) : lotPrice;
      if (!splitQty || splitQty <= 0 || splitQty >= lotQty || !splitPrice || splitPrice <= 0) {
        preview.textContent = '';
        return;
      }
      const totalCost = lotQty * lotPrice;
      const splitCost = splitQty * splitPrice;
      const remainCost = totalCost - splitCost;
      if (remainCost <= 0) {
        preview.textContent = 'Split price too high for this quantity.';
        preview.classList.add('neg');
        return;
      }
      preview.classList.remove('neg');
      const remainQty = lotQty - splitQty;
      const remainPrice = remainCost / remainQty;
      preview.textContent = `Remainder after split: ${remainQty} @ ৳${UI.fmtNum(remainPrice, 2)} (was ৳${UI.fmtNum(lotPrice, 2)})`;
    };
    qtyInput.addEventListener('input', update);
    priceInput?.addEventListener('input', update);
    update();
  }

  root.querySelectorAll('.cancel-split').forEach((btn) => {
    btn.addEventListener('click', () => {
      setFillRowSplitting(btn.closest('.fill-row'), false);
    });
  });

  root.querySelectorAll('.save-split').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.fill-row');
      const splitQty = Number(row.querySelector('.fill-split-qty')?.value);
      const splitPriceRaw = row.querySelector('.fill-split-price')?.value?.trim();
      const lotQty = Number(btn.dataset.lotQty);
      const lotPrice = Number(btn.dataset.lotPrice);
      if (!splitQty || splitQty <= 0 || splitQty >= lotQty) {
        showToast(`Split qty must be between 1 and ${lotQty - 1}`, 'error');
        return;
      }
      const body = { split_qty: splitQty };
      if (splitPriceRaw) {
        const splitPrice = Number(splitPriceRaw);
        if (!splitPrice || splitPrice <= 0) {
          showToast('Split price must be positive', 'error');
          return;
        }
        body.split_price = splitPrice;
      }
      try {
        const result = await api(`/api/portfolio/fills/${btn.dataset.fillId}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const remainMsg = result.remain_price != null
          ? ` Remainder: ${result.remain_qty} @ ৳${UI.fmtNum(result.remain_price, 2)}.`
          : '';
        showToast(`Split ${result.split_qty} @ ৳${UI.fmtNum(result.split_price ?? lotPrice, 2)}.${remainMsg}`, 'ok');
        await refreshPortfolioFillsModal();
        await loadPortfolio();
      } catch (e) {
        showToast(e.message || 'Could not split lot', 'error');
      }
    });
  });

  root.querySelectorAll('.edit-fill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.fill-row');
      root.querySelectorAll('.fill-row.is-editing, .fill-row.is-splitting').forEach((r) => {
        setFillRowEditing(r, false);
        setFillRowSplitting(r, false);
      });
      setFillRowEditing(row, true);
    });
  });

  root.querySelectorAll('.cancel-fill-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      setFillRowEditing(btn.closest('.fill-row'), false);
    });
  });

  root.querySelectorAll('.save-fill').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.fill-row');
      const fillId = btn.dataset.fillId;
      const trade_date = row.querySelector('.fill-edit-date')?.value;
      const qty = Number(row.querySelector('.fill-edit-qty')?.value);
      const price = Number(row.querySelector('.fill-edit-price')?.value);
      const notes = row.querySelector('.fill-edit-notes')?.value?.trim() ?? '';
      if (!trade_date || !qty || !price) {
        showToast('Date, qty, and price are required', 'error');
        return;
      }
      await api(`/api/portfolio/fills/${fillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trade_date, qty, price, notes }),
      });
      showToast('Fill updated', 'ok');
      await refreshPortfolioFillsModal();
      await loadPortfolio();
    });
  });

  root.querySelectorAll('.del-fill').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.fill-row');
      const qty = btn.dataset.fillQty || row?.querySelector('td:nth-child(2)')?.textContent?.trim();
      const date = btn.dataset.fillDate || row?.querySelector('td:nth-child(1)')?.textContent?.trim();
      const sym = fillsModalSymbol || 'this position';
      const { confirmed } = await showActionModal({
        title: 'Delete fill',
        message: `Remove ${qty ? `${qty} shares` : 'this fill'}${date ? ` from ${date}` : ''} of ${sym}?\n\nPosition totals will be recalculated from remaining buy history.`,
        confirmLabel: 'Delete fill',
        danger: true,
      });
      if (!confirmed) return;
      await api(`/api/portfolio/fills/${btn.dataset.fillId}`, { method: 'DELETE' });
      showToast('Fill deleted — totals recalculated', 'info');
      await refreshPortfolioFillsModal();
      await loadPortfolio();
    });
  });
}

async function openPortfolioFillsModal(symbol, purpose) {
  const modal = $('#portfolio-fills-modal');
  const body = $('#portfolio-fills-body');
  const title = $('#portfolio-fills-title');
  if (!modal || !body || !title) return;

  fillsModalSymbol = symbol;
  fillsModalPurpose = purpose;
  title.textContent = `${symbol} — buy history (${purpose})`;
  body.innerHTML = '<p class="muted">Loading buy history…</p>';
  modal.classList.remove('hidden');

  await refreshPortfolioFillsModal();
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
  root.querySelectorAll('.move-pos').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sym = btn.dataset.symbol;
      const from = btn.dataset.from;
      const to = btn.dataset.to;
      const maxQty = Number(btn.dataset.qty);
      const toLabel = portfolioBookLabel(to);
      const fromLabel = portfolioBookLabel(from);
      const { confirmed, value } = await showActionModal({
        title: `Move to ${toLabel}`,
        message: `How many shares of ${sym} to move from ${fromLabel} to ${toLabel}?\n\nOldest lots move first (FIFO).`,
        confirmLabel: 'Move shares',
        input: {
          type: 'number',
          label: 'Shares to move',
          value: maxQty > 0 ? String(maxQty) : '',
          min: 1,
          max: maxQty > 0 ? maxQty : undefined,
          step: 1,
          hint: maxQty > 0 ? `Maximum available: ${maxQty} shares` : undefined,
        },
      });
      if (!confirmed) return;
      await submitPortfolioMove({
        symbol: sym,
        from,
        to,
        qty: value,
        maxQty,
        skipConfirm: true,
      });
    });
  });
  root.querySelectorAll('.view-fills').forEach((btn) => {
    btn.addEventListener('click', () => {
      openPortfolioFillsModal(btn.dataset.symbol, btn.dataset.purpose ?? purpose);
    });
  });
}

function formatSuggestZone(atr, structure) {
  const fmt = (low, high) => (low != null && high != null ? `৳${UI.fmtNum(low)} – ৳${UI.fmtNum(high)}` : null);
  const atrZ = fmt(atr?.buy_zone_low, atr?.buy_zone_high);
  const structZ = fmt(structure?.buy_zone_low, structure?.buy_zone_high);
  const parts = [];
  if (atrZ) parts.push(`ATR ${atrZ}`);
  if (structZ) parts.push(`Struct ${structZ}`);
  return parts.length ? parts.join(' · ') : '—';
}

function formatSuggestLevel(atr, structure, field) {
  const parts = [];
  if (atr?.[field] != null) parts.push(`ATR ৳${UI.fmtNum(atr[field])}`);
  if (structure?.[field] != null) parts.push(`Struct ৳${UI.fmtNum(structure[field])}`);
  return parts.length ? parts.join(' · ') : '—';
}

function formatSuggestSize(atr, structure) {
  const parts = [];
  if (atr?.position_value_bdt != null) {
    parts.push(`ATR ৳${UI.fmtNum(atr.position_value_bdt, 0)}${atr.suggested_shares != null ? ` · ${UI.fmtNum(atr.suggested_shares, 0)} shares` : ''}`);
  }
  if (structure?.position_value_bdt != null) {
    parts.push(`Struct ৳${UI.fmtNum(structure.position_value_bdt, 0)}${structure.suggested_shares != null ? ` · ${UI.fmtNum(structure.suggested_shares, 0)} shares` : ''}`);
  }
  return parts.length ? parts.join(' · ') : '—';
}

function clearTradingSuggestPanel() {
  $('#trading-suggested-panel')?.classList.add('hidden');
  for (const id of ['trading-suggest-buy-zone', 'trading-suggest-stop', 'trading-suggest-target', 'trading-suggest-size']) {
    const el = $(`#${id}`);
    if (el) el.textContent = '—';
  }
  const status = $('#trading-suggest-status');
  if (status) status.textContent = '';
}

async function prefillTradingRisk(symbol) {
  const sym = String(symbol ?? '').trim().toUpperCase();
  if (!sym) {
    clearTradingSuggestPanel();
    return;
  }
  const status = $('#trading-suggest-status');
  try {
    if (status) status.textContent = 'Loading suggestions…';
    const data = await api(`/api/tickers/${encodeURIComponent(sym)}/risk-suggest`);
    const panel = $('#trading-suggested-panel');
    if (!data.has_analysis) {
      panel?.classList.add('hidden');
      if (status) status.textContent = 'No analysis yet — run Analyze Full for suggestions.';
      return;
    }
    panel?.classList.remove('hidden');
    const { atr, structure } = data;
    $('#trading-suggest-buy-zone').textContent = formatSuggestZone(atr, structure);
    $('#trading-suggest-stop').textContent = formatSuggestLevel(atr, structure, 'stop_loss');
    $('#trading-suggest-target').textContent = formatSuggestLevel(atr, structure, 'target');
    $('#trading-suggest-size').textContent = formatSuggestSize(atr, structure);

    const qtyEl = $('.pos-qty[data-purpose="trading"]');
    const costEl = $('.pos-cost[data-purpose="trading"]');
    const stopEl = $('.pos-stop[data-purpose="trading"]');
    const targetEl = $('.pos-target[data-purpose="trading"]');
    if (qtyEl && !qtyEl.value && atr?.suggested_shares != null) qtyEl.value = String(Math.round(atr.suggested_shares));
    if (costEl && !costEl.value) {
      const cost = atr?.buy_zone_high ?? atr?.entry;
      if (cost != null) costEl.value = String(cost);
    }
    if (stopEl && !stopEl.value && atr?.stop_loss != null) stopEl.value = String(atr.stop_loss);
    if (targetEl && !targetEl.value && atr?.target != null) targetEl.value = String(atr.target);

    if (status) status.textContent = 'Suggested levels shown above — My stop/target pre-filled from ATR (editable).';
  } catch (e) {
    clearTradingSuggestPanel();
    if (status) status.textContent = e.message || 'Could not load suggestions';
  }
}

async function loadPortfolio() {
  const data = await api('/api/portfolio');
  const account = data.account ?? data.investment?.account ?? data.trading?.account;
  if (!account) {
    $('#portfolio-account-summary').textContent = 'No portfolio account — run npm run db:seed';
    return;
  }

  $('#portfolio-account-summary').innerHTML = UI.renderPortfolioBrokerBar(data.metrics, account);

  const heroEl = $('#portfolio-hero');
  if (heroEl) {
    heroEl.innerHTML = UI.renderPortfolioHero(data.investment, data.trading);
  }

  for (const purpose of ['investment', 'trading']) {
    const portfolio = data[purpose] ?? data;
    $(`#portfolio-${purpose}-summary`).innerHTML = UI.renderPortfolioSummary({ ...portfolio, purpose });

    const tableEl = $(`#portfolio-${purpose}-table`);
    if (purpose === 'trading') {
      $('#portfolio-trading-mirror').innerHTML = '';
      const syncBtn = $('#sync-trading-portfolio');
      const tradingEmpty = !(portfolio.positions?.length);
      const investmentHas = (data.investment?.positions?.length ?? 0) > 0;
      if (syncBtn) {
        syncBtn.classList.toggle('hidden', !(tradingEmpty && investmentHas));
      }
      tableEl.innerHTML = UI.renderMomentumPortfolioTable(portfolio.positions, {
        purpose,
        showActions: true,
      });
    } else {
      tableEl.innerHTML = UI.renderPortfolioTable(portfolio.positions, { purpose, showActions: true });
    }
    bindPortfolioPanel(tableEl, purpose);

    renderPortfolioCharts(purpose, portfolio);
  }
  resizePortfolioCharts();

  const host = $('#portfolio-claude-prompts');
  if (host && UI?.renderBatchClaudePrompts) {
    const invTickers = (data.investment?.positions ?? []).map((p) => p.ticker);
    const trTickers = (data.trading?.positions ?? []).map((p) => p.ticker);
    host.innerHTML =
      UI.renderBatchClaudePrompts({
        title: 'Complete data fill — entire portfolio',
        description: 'UPGDCL-style pipeline for every holding: ingest, 30-point checklist, research gaps, save to Postgres. Includes portfolio context for risk.',
        symbols: invTickers,
        purpose: 'investment',
        type: 'portfolio',
      }) +
      (trTickers.length
        ? UI.renderBatchClaudePrompts({
            title: 'Trading book — complete fill',
            description: 'Same pipeline for momentum trading positions.',
            symbols: trTickers,
            purpose: 'trading',
            type: 'portfolio',
          })
        : '');
  }
}

async function addPortfolioPosition(purpose) {
  const symbol = $(`.pos-symbol[data-purpose="${purpose}"]`)?.value.trim();
  const qty = Number($(`.pos-qty[data-purpose="${purpose}"]`)?.value);
  const avg_cost = Number($(`.pos-cost[data-purpose="${purpose}"]`)?.value);
  if (!symbol) {
    showToast('Choose a symbol from the list', 'error');
    return false;
  }
  if (!qty || !avg_cost) return false;

  const trade_date = $(`.pos-date[data-purpose="${purpose}"]`)?.value || todayInputDate();
  const notes = $(`.pos-notes[data-purpose="${purpose}"]`)?.value.trim();

  const body = { symbol, qty, avg_cost, purpose, trade_date };
  if (notes) body.notes = notes;
  if (purpose === 'trading') {
    const stopRaw = $(`.pos-stop[data-purpose="trading"]`)?.value;
    const targetRaw = $(`.pos-target[data-purpose="trading"]`)?.value;
    if (stopRaw !== '' && stopRaw != null) body.stop_level = Number(stopRaw);
    if (targetRaw !== '' && targetRaw != null) body.target_level = Number(targetRaw);
  }

  const result = await api('/api/portfolio/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  $(`.pos-symbol[data-purpose="${purpose}"]`).value = '';
  $(`.pos-date[data-purpose="${purpose}"]`).value = todayInputDate();
  $(`.pos-qty[data-purpose="${purpose}"]`).value = '';
  $(`.pos-cost[data-purpose="${purpose}"]`).value = '';
  $(`.pos-notes[data-purpose="${purpose}"]`).value = '';
  if (purpose === 'trading') {
    $(`.pos-stop[data-purpose="trading"]`).value = '';
    $(`.pos-target[data-purpose="trading"]`).value = '';
    clearTradingSuggestPanel();
  }
  const totalQty = result.qty ?? qty;
  const avgCost = result.avg_cost ?? body.avg_cost;
  showToast(
    `Added ${result.added_qty ?? qty} ${symbol.toUpperCase()} — total ${UI.fmtNum(totalQty, 0)} @ ৳${UI.fmtNum(avgCost, 2)}`,
    'ok',
  );
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
  const allByPurpose = {};
  for (const purpose of ['investment', 'trading']) {
    const { watchlist } = await api(`/api/watchlist?purpose=${purpose}`);
    allByPurpose[purpose] = watchlist ?? [];
    const el = $(`#watchlist-${purpose}`);
    if (!el) continue;
    el.innerHTML = UI.renderWatchlistTable(watchlist);
    el.querySelectorAll('[data-symbol].clickable').forEach((n) => {
      n.addEventListener('click', () => openTicker(n.dataset.symbol));
    });
    el.querySelectorAll('.watch-open').forEach((btn) => {
      btn.addEventListener('click', () => openTicker(btn.dataset.symbol));
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
  const host = $('#watchlist-claude-prompts');
  if (host && UI?.renderBatchClaudePrompts) {
    const invSyms = (allByPurpose.investment ?? []).map((w) => w.symbol);
    const trSyms = (allByPurpose.trading ?? []).map((w) => w.symbol);
    const combined = [...new Set([...invSyms, ...trSyms])];
    host.innerHTML =
      UI.renderBatchClaudePrompts({
        title: 'Complete data fill — entire watchlist',
        description: 'Runs the UPGDCL-style pipeline for every watchlist symbol: ingest, fill value checklist, research gaps, save memos. Paste into Claude Code / Cursor.',
        symbols: combined,
        purpose: 'investment',
        type: 'watchlist',
      }) +
      (trSyms.length && trSyms.join(',') !== invSyms.join(',')
        ? UI.renderBatchClaudePrompts({
            title: 'Trading watchlist — complete fill',
            description: 'Same pipeline for momentum watchlist symbols only.',
            symbols: trSyms,
            purpose: 'trading',
            type: 'watchlist',
          })
        : '');
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

function showDiscoverTab(name) {
  discoverTab = name;
  $$('.discover-tab').forEach((t) => t.classList.toggle('active', t.dataset.discoverTab === name));
  $$('.discover-panel').forEach((p) => p.classList.toggle('active', p.id === `discover-panel-${name}`));
  if (name === 'rankings') loadRankings();
  if (name === 'top20') loadTop20();
}

async function loadRankings() {
  const status = $('#rankings-status');
  const content = $('#rankings-content');
  if (status) status.textContent = 'Loading…';
  try {
    const data = await api('/api/rankings?limit=100');
    if (status) status.textContent = `${data.count ?? 0} stocks ranked`;
    if (content) {
      content.innerHTML = UI.renderRankingsPanel(data);
      $$('#rankings-content [data-symbol]').forEach((el) => {
        el.addEventListener('click', () => openTicker(el.dataset.symbol));
      });
    }
  } catch (e) {
    if (status) status.textContent = `Error: ${e.message}`;
  }
}

async function loadTop20() {
  const status = $('#top20-status');
  const content = $('#top20-content');
  if (status) status.textContent = 'Loading…';
  try {
    const data = await api('/api/market/top20');
    if (status) status.textContent = `${data.count ?? 0} leaders`;
    if (content) {
      content.innerHTML = UI.renderTop20Panel(data.rows);
      $$('#top20-content [data-symbol]').forEach((el) => {
        el.addEventListener('click', () => openTicker(el.dataset.symbol));
      });
    }
  } catch (e) {
    if (status) status.textContent = `Error: ${e.message}`;
  }
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
  if (await copyText(md)) {
    showToast('Briefing markdown copied', 'ok');
  } else {
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

  $('#all-news').innerHTML = UI.renderNewsCardFeed(news, { sourceLabels: SOURCE_LABELS, tickerBn: TICKER_BN });
  $$('#all-news [data-symbol]').forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });
}

let macroSectorSlug = '';

async function loadMacro() {
  const content = $('#macro-content');
  const meta = $('#macro-meta');
  if (content) content.innerHTML = '<p class="muted">Loading macro landscape…</p>';
  try {
    const landscape = await api('/api/macro/landscape');
    let sectorDetail = null;
    if (macroSectorSlug) {
      sectorDetail = await api(`/api/macro/sectors/${encodeURIComponent(macroSectorSlug)}`);
    }
    if (meta) {
      const src = landscape?.bangladesh?.macro?.source;
      meta.textContent = `As of ${UI.fmtDate(landscape.as_of)}${src ? ` · ${UI.macroSourceLabel(src)}` : ''}`;
    }
    if (content) {
      content.innerHTML = UI.renderMacroLandscape(landscape, sectorDetail);
      bindMacroInteractions();
    }
  } catch (e) {
    if (meta) meta.textContent = '';
    if (content) {
      content.innerHTML = `<p class="muted">Failed to load macro data: ${UI.esc(e.message)}</p>`;
    }
  }
}

function bindMacroInteractions() {
  $$('[data-macro-sector]').forEach((el) => {
    el.addEventListener('click', () => {
      macroSectorSlug = el.dataset.macroSector ?? '';
      loadMacro();
    });
  });
  $$('[data-macro-back]').forEach((el) => {
    el.addEventListener('click', () => {
      macroSectorSlug = '';
      loadMacro();
    });
  });
  $$('[data-macro-scroll]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(el.dataset.macroScroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

$('#panel-macro')?.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('[data-copy-cmd]');
  if (!copyBtn) return;
  const cmd = copyBtn.getAttribute('data-copy-cmd');
  await copyCommand(cmd, copyBtn.textContent?.trim());
});

function bindClaudePromptCopy(root) {
  const el = typeof root === 'string' ? $(root) : root;
  if (!el || el._claudeCopyBound) return;
  el._claudeCopyBound = true;
  el.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy-cmd]');
    if (!copyBtn || !el.contains(copyBtn)) return;
    const cmd = copyBtn.getAttribute('data-copy-cmd');
    await copyCommand(cmd, copyBtn.textContent?.trim());
  });
}

bindClaudePromptCopy('#panel-watchlist');
bindClaudePromptCopy('#panel-portfolio');

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
    if (!btn.dataset.panel) return;
    navigateToPanel(btn.dataset.panel, { historyMode: 'push' });
  });
});

$('#nav-toggle')?.addEventListener('click', () => {
  const nav = $('#main-nav');
  const open = nav?.classList.toggle('open');
  $('#nav-toggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
});

$('#nav-tools-trigger')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('#nav-tools-wrap')?.classList.toggle('open');
});

document.addEventListener('click', () => closeToolsMenu());

$('#theme-toggle')?.addEventListener('click', toggleTheme);

$('#global-ticker-search')?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const sym = e.target.value.trim().toUpperCase();
  if (sym) {
    openTicker(sym);
    e.target.value = '';
  }
});

$$('.discover-tab').forEach((btn) => {
  btn.addEventListener('click', () => showDiscoverTab(btn.dataset.discoverTab ?? 'screen'));
});

bindClick('#load-rankings', loadRankings);
bindClick('#load-top20', loadTop20);

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

$$('.pos-filter').forEach((input) => {
  input.addEventListener('input', () => {
    populatePosSymbolSelects(input.dataset.purpose, input.value);
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
  if (await copyText(text)) {
    setAnalysisStatus('JSON copied to clipboard', 'ok');
    showToast('JSON copied to clipboard', 'ok');
  } else {
    setAnalysisStatus('Copy failed — select JSON manually', 'error');
    showToast('Copy failed — select the JSON manually', 'error');
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

  const agentBtn = e.target.closest('.agent-status-btn');
  if (agentBtn?.dataset.agentKey) {
    openAgentStatusDetail(agentBtn.dataset.agentKey, agentBtn.dataset.agentLens ?? 'investment');
  }
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

const tradingSymbolSelect = $('.pos-symbol[data-purpose="trading"]');
tradingSymbolSelect?.addEventListener('change', (e) => prefillTradingRisk(e.target.value));

$$('[data-close-modal="portfolio-fills"]').forEach((el) => {
  el.addEventListener('click', closePortfolioFillsModal);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#action-modal')?.classList.contains('hidden')) {
    closeActionModal({ confirmed: false });
    return;
  }
  if (!$('#agent-detail-modal')?.classList.contains('hidden')) {
    closeAgentDetailModal();
    return;
  }
  closePortfolioFillsModal();
});

initActionModal();
bindAgentDetailModal();

$('#sync-trading-portfolio')?.addEventListener('click', async () => {
  const { copied } = await api('/api/portfolio/sync-trading', { method: 'POST' });
  showToast(`Copied ${copied} positions to momentum trading`, 'ok');
  await loadPortfolio();
});

$('#portfolio-account-summary')?.addEventListener('submit', async (e) => {
  const form = e.target.closest('#portfolio-broker-form');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const body = {};
  const lb = String(fd.get('loan_balance_bdt') ?? '').trim();
  const pp = String(fd.get('purchasing_power_bdt') ?? '').trim();
  const equity = String(fd.get('equity_bdt') ?? '').trim();
  if (lb !== '') body.loan_balance_bdt = Number(lb);
  else body.loan_balance_bdt = null;
  if (pp !== '') body.purchasing_power_bdt = Number(pp);
  else body.purchasing_power_bdt = null;
  if (equity !== '') body.equity_bdt = Number(equity);
  await api('/api/portfolio/account', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  showToast('Account metrics saved', 'ok');
  await loadPortfolio();
});

async function init() {
  initTheme();
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
      `<div class="error-banner">Failed to load: ${UI ? UI.esc(e.message) : e.message}. Is the SQLite DB ready? Try: npm run db:migrate && npm run db:seed</div>`,
    );
  }
}

init();
