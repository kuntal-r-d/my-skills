const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let ohlcvChart = null;
let shareChart = null;
let sectorChart = null;

async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fmtNum(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d });
}

function fmtDate(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
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

function showPanel(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
}

$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => showPanel(btn.dataset.panel));
});

async function loadOverview() {
  const data = await api('/api/overview');
  const c = data.counts;
  $('#stat-cards').innerHTML = Object.entries(c)
    .map(
      ([k, v]) =>
        `<div class="card"><div class="label">${k.replace(/_/g, ' ')}</div><div class="value">${fmtNum(v, 0)}</div></div>`,
    )
    .join('');

  $('#overview-runs').innerHTML = table(
    ['Job', 'Ticker', 'Status', 'Rows', 'Started', 'Error'],
    data.recentRuns.map((r) => [
      r.jobName,
      r.symbol ?? '—',
      `<span class="badge ${r.status === 'ok' ? 'ok' : 'fail'}">${r.status}</span>`,
      r.rowsUpserted,
      fmtDate(r.startedAt),
      r.errorMessage ?? '',
    ]),
  );
}

async function loadTickers() {
  const { tickers } = await api('/api/tickers');
  const q = () => ($('#ticker-search').value || '').toUpperCase();
  const render = () => {
    const filtered = tickers.filter((t) => t.symbol.includes(q()));
    $('#tickers-table').innerHTML = table(
      ['Symbol', 'Name', 'Sector', 'OHLCV bars', 'Last date', ''],
      filtered.map((t) => [
        `<span class="clickable" data-symbol="${t.symbol}">${t.symbol}</span>`,
        t.name ?? '—',
        t.sector ?? '—',
        t.ohlcv_bars,
        fmtDate(t.last_trade_date),
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
  sel.innerHTML = tickers.map((t) => `<option value="${t.symbol}">${t.symbol}</option>`).join('');
  if (tickers.some((t) => t.symbol === 'LHB')) sel.value = 'LHB';
}

function openTicker(symbol) {
  $('#ticker-select').value = symbol;
  showPanel('ticker-detail');
  loadTickerDetail(symbol);
}

async function loadTickerDetail(symbol) {
  const sym = symbol || $('#ticker-select').value;
  const data = await api(`/api/tickers/${sym}?limit=260`);
  const t = data.ticker;

  $('#ticker-meta').innerHTML = `
    <strong>${t.symbol}</strong> — ${t.name ?? ''} · ${t.sector ?? 'No sector'}
    · ${data.ohlcv.length} bars · Freshness: ${data.freshness.map((f) => f.entityType).join(', ') || 'none'}
  `;

  const labels = data.ohlcv.map((b) => b.date);
  const closes = data.ohlcv.map((b) => b.close);

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

  $('#fundamentals-json').textContent = data.fundamentals
    ? JSON.stringify(data.fundamentals.payload, null, 2)
    : 'No fundamentals ingested';

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

  $('#ticker-news').innerHTML = table(
    ['Date', 'Headline', 'Source'],
    data.news.map((n) => [fmtDate(n.publishedDate), n.headline, n.source ?? '—']),
  );
}

async function loadPortfolio() {
  const data = await api('/api/portfolio');
  if (!data.account) {
    $('#portfolio-summary').textContent = 'No portfolio account — run npm run db:seed';
    return;
  }

  $('#portfolio-summary').innerHTML = `
    Account: <strong>${data.account.label}</strong>
    · Capital ৳${fmtNum(data.account.capital_bdt, 0)}
    · Risk/trade ${data.account.risk_per_trade_pct}%
    · Cost basis ৳${fmtNum(data.total_cost_basis, 0)}
    · ${data.positions.length} positions
  `;

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
        title: { display: true, text: 'Sector allocation (cost basis)', color: '#8b9cb3' },
      },
    },
  });

  $('#portfolio-table').innerHTML = table(
    ['Ticker', 'Qty', 'Avg cost', 'Cost basis', 'Sector'],
    data.positions
      .sort((a, b) => b.cost_basis - a.cost_basis)
      .map((p) => [
        `<span class="clickable" data-symbol="${p.ticker}">${p.ticker}</span>`,
        fmtNum(p.qty, 0),
        fmtNum(p.avg_cost),
        fmtNum(p.cost_basis, 0),
        p.sector,
      ]),
  );
  $$('#portfolio-table [data-symbol]').forEach((el) => {
    el.addEventListener('click', () => openTicker(el.dataset.symbol));
  });
}

async function loadNews() {
  const { news } = await api('/api/news');
  $('#all-news').innerHTML = table(
    ['Date', 'Ticker', 'Headline', 'Source'],
    news.map((n) => [fmtDate(n.publishedDate), n.symbol ?? '—', n.headline, n.source ?? '—']),
  );
}

async function loadMacro() {
  const { macro } = await api('/api/macro');
  if (!macro) {
    $('#macro-meta').textContent = 'No macro snapshot';
    $('#macro-json').textContent = '';
    return;
  }
  $('#macro-meta').textContent = `As of ${fmtDate(macro.as_of)} · Source: ${macro.source}`;
  $('#macro-json').textContent = JSON.stringify(macro.payload, null, 2);
}

async function loadOps() {
  const [fresh, runs] = await Promise.all([api('/api/freshness'), api('/api/ingest-runs?limit=100')]);

  $('#freshness-table').innerHTML = table(
    ['Entity', 'Ticker', 'Last success', 'Stale after (h)'],
    fresh.freshness.map((f) => [
      f.entityType,
      f.symbol ?? 'global',
      fmtDate(f.lastSuccessAt),
      f.staleAfterHours,
    ]),
  );

  $('#ingest-table').innerHTML = table(
    ['Job', 'Ticker', 'Status', 'Rows', 'Started', 'Error'],
    runs.runs.map((r) => [
      r.jobName,
      r.symbol ?? '—',
      `<span class="badge ${r.status === 'ok' ? 'ok' : 'fail'}">${r.status}</span>`,
      r.rowsUpserted,
      fmtDate(r.startedAt),
      r.errorMessage ?? '',
    ]),
  );
}

$('#load-ticker').addEventListener('click', () => loadTickerDetail());

async function init() {
  try {
    await Promise.all([loadOverview(), loadTickers(), loadPortfolio(), loadNews(), loadMacro(), loadOps()]);
    await loadTickerDetail($('#ticker-select').value || 'LHB');
  } catch (e) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div style="background:#ef4444;color:#fff;padding:1rem;text-align:center">Failed to load: ${e.message}. Is Postgres running?</div>`,
    );
  }
}

init();
