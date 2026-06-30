/** Advisory vs educational output mode (STOCK_BUDDY_ADVISORY_MODE). Default: advisory (on). */

export function isAdvisoryMode(): boolean {
  const v = (process.env.STOCK_BUDDY_ADVISORY_MODE ?? '1').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no' || v === 'off' || v === 'educational') {
    return false;
  }
  return true;
}

export function getDisclaimer(): string {
  if (isAdvisoryMode()) {
    return 'Personal investment analysis. Verify live prices and official disclosures before acting.';
  }
  return 'Educational analysis only. Not financial advice.';
}

export function getBriefingFooterNote(): string {
  if (isAdvisoryMode()) {
    return 'Actionable briefing from your portfolio, watchlist, and stored analysis — confirm levels against live quotes before trading.';
  }
  return 'Conditions and levels only; no instructions to act.';
}

/** When false, briefing and skills may use direct buy/sell/hold phrasing. */
export function shouldStripImperatives(): boolean {
  return !isAdvisoryMode();
}
