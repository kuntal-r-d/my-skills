import * as ind from '@stock-buddy/core';

export const DISCLAIMER = 'Educational analysis only. Not financial advice.';
export const SKILL = 'risk-manager';

const ATR_PERIOD = 14;
const BUY_ZONE_ATR = 0.25;
const STOP_ATR = 2.0;
const TARGET_ATR = 3.0;
const KELLY_CAP = 0.25;
const PER_POSITION_CAP = 0.05;
const VOL_SCALE_THRESHOLD = 0.06;
const VOL_SCALE_FACTOR = 0.5;
const LIQUIDITY_FLOOR_BDT = 10_000_000;
const SECTOR_CAP = 0.30;
const HEAT_CAP = 0.06;
const PROXY_POSITION_RISK = 0.01;

function num(x: unknown, defaultVal = 0.0): number {
  try {
    const n = Number(x);
    return Number.isNaN(n) ? defaultVal : n;
  } catch {
    return defaultVal;
  }
}

function roundBdt(x: number | null): number | null {
  if (x == null) return null;
  return Math.round(x * 100) / 100;
}

export function analyze(data: Record<string, unknown>): Record<string, unknown> {
  const ohlcv = (data.ohlcv as ind.OhlcvBar[]) ?? [];
  if (ohlcv.length < ATR_PERIOD + 1) {
    return {
      skill: SKILL,
      error: `need >=${ATR_PERIOD + 1} OHLCV bars for ATR(${ATR_PERIOD})`,
      bars_supplied: ohlcv.length,
    };
  }

  const account = (data.account as Record<string, unknown>) ?? {};
  const capital = num(account.capital_bdt);
  if (capital <= 0) return { skill: SKILL, error: 'account.capital_bdt must be > 0' };
  let riskPct = num(account.risk_per_trade_pct, 1.0);
  if (riskPct <= 0) riskPct = 1.0;

  const [, h, l, c] = ind.splitOhlcv(ohlcv);
  const atrV = ind.lastValid(ind.atr(h, l, c, ATR_PERIOD));
  if (!atrV || atrV <= 0) return { skill: SKILL, error: 'could not compute a positive ATR' };

  const signal = (data.signal as Record<string, unknown>) ?? {};
  const mode = (signal.mode as string) ?? (data.mode as string) ?? 'momentum';
  const entry = num(signal.entry) || c[c.length - 1]!;
  if (entry <= 0) return { skill: SKILL, error: 'entry price must be > 0' };

  const flags: string[] = [];
  const reasoning: string[] = [];

  const buyLow = entry - BUY_ZONE_ATR * atrV;
  const buyHigh = entry;
  const stop = entry - STOP_ATR * atrV;
  const target = entry + TARGET_ATR * atrV;
  const riskPerShare = entry - stop;
  const rewardPerShare = target - entry;
  const riskReward = riskPerShare ? rewardPerShare / riskPerShare : 0.0;
  const tradeRiskPct = entry ? (riskPerShare / entry) * 100 : 0.0;

  reasoning.push(
    `ATR(${ATR_PERIOD})=${roundBdt(atrV)} BDT. Buy zone ${roundBdt(buyLow)}-${roundBdt(buyHigh)} (entry - 0.25*ATR).`,
  );
  reasoning.push(
    `Stop ${roundBdt(stop)} (entry - 2*ATR), target ${roundBdt(target)} (entry + 3*ATR) -> risk:reward 1:${Math.round(riskReward * 100) / 100}.`,
  );

  const riskAmount = capital * riskPct / 100.0;
  const rawShares = riskPerShare ? riskAmount / riskPerShare : 0.0;

  const kellyValue = KELLY_CAP * capital;
  const posCapValue = PER_POSITION_CAP * capital;
  const capValue = Math.min(kellyValue, posCapValue);
  const capShares = entry ? capValue / entry : 0.0;

  let capped = false;
  let shares = rawShares;
  if (shares > capShares) {
    shares = capShares;
    capped = true;
    reasoning.push(
      `Size capped by min(Kelly 25%=${roundBdt(kellyValue)}, 5% per-position=${roundBdt(posCapValue)} BDT) -> ${roundBdt(capValue)} BDT ceiling.`,
    );
  }

  const atrRatio = atrV / entry;
  if (atrRatio > VOL_SCALE_THRESHOLD) {
    shares *= VOL_SCALE_FACTOR;
    flags.push('high_volatility_size_halved');
    reasoning.push(`ATR/price ${Math.round(atrRatio * 1000) / 10}% > 6% — position halved (volatility scaling).`);
  }

  shares = Math.floor(shares);
  const positionValue = shares * entry;
  const pctOfCapital = capital ? (positionValue / capital) * 100 : 0.0;
  const actualRiskAmount = shares * riskPerShare;
  const actualRiskPctOfCapital = capital ? (actualRiskAmount / capital) * 100 : 0.0;

  if (shares <= 0) {
    flags.push('size_rounds_to_zero');
    reasoning.push('Computed size rounds to 0 shares at this risk budget.');
  }

  const gates: Record<string, { pass: boolean; detail: string }> = {};
  let rating = 'approved';

  const ms = (data.microstructure as Record<string, unknown>) ?? {};
  const adv = num(ms.avg_daily_value_bdt, 0.0);
  if (adv > LIQUIDITY_FLOOR_BDT) {
    gates.liquidity = { pass: true, detail: `Avg daily value ${roundBdt(adv)} BDT > 1 crore floor.` };
  } else {
    gates.liquidity = {
      pass: false,
      detail: `Avg daily value ${roundBdt(adv)} BDT <= 1 crore floor — too illiquid; trade rejected.`,
    };
    rating = 'rejected';
    reasoning.push('Liquidity gate FAILED — illiquid name, slippage/exit risk too high.');
  }

  const portfolio = (data.portfolio as Record<string, unknown>) ?? {};
  const totalValue = num(portfolio.total_value_bdt, 0.0);
  const sector = ((data.fundamentals as Record<string, unknown>) ?? {}).sector as string | undefined;
  if (portfolio && totalValue > 0) {
    const positions = (portfolio.positions as Record<string, unknown>[]) ?? [];
    const existingSector = positions
      .filter((p) => sector && p.sector === sector)
      .reduce((sum, p) => sum + num(p.value_bdt), 0);
    const sectorPct = ((existingSector + positionValue) / totalValue) * 100;
    if (sectorPct <= SECTOR_CAP * 100) {
      gates.sector = { pass: true, detail: `Sector '${sector}' exposure would be ${Math.round(sectorPct * 10) / 10}% <= 30%.` };
    } else {
      gates.sector = {
        pass: false,
        detail: `Sector '${sector}' exposure would be ${Math.round(sectorPct * 10) / 10}% > 30% — concentration limit.`,
      };
      if (rating !== 'rejected') rating = 'reduced';
      flags.push('sector_concentration_breach');
      reasoning.push('Sector gate FAILED — over-concentrated; reduce or skip.');
    }
  } else {
    gates.sector = { pass: true, detail: 'No portfolio supplied — sector gate skipped.' };
  }

  if (portfolio) {
    const positions = (portfolio.positions as unknown[]) ?? [];
    const nPositions = positions.length;
    const existingHeat = nPositions * PROXY_POSITION_RISK;
    const thisHeat = capital ? actualRiskAmount / capital : 0.0;
    const totalHeat = existingHeat + thisHeat;
    if (totalHeat <= HEAT_CAP) {
      gates.heat = {
        pass: true,
        detail: `Portfolio heat ${Math.round(totalHeat * 1000) / 10}% <= 6% (${nPositions} existing @1% proxy + this trade).`,
      };
    } else {
      gates.heat = {
        pass: false,
        detail: `Portfolio heat ${Math.round(totalHeat * 1000) / 10}% > 6% — too much aggregate risk.`,
      };
      if (rating !== 'rejected') rating = 'reduced';
      flags.push('portfolio_heat_breach');
      reasoning.push('Heat gate FAILED — aggregate open risk exceeds 6%.');
    }
  } else {
    gates.heat = { pass: true, detail: 'No portfolio supplied — heat gate skipped.' };
  }

  const circuitHit =
    ms.circuit_state === 'limit_up' ||
    ms.circuit_state === 'limit_down' ||
    Boolean(ms.floor_price) ||
    Boolean(ms.halted);
  if (circuitHit) {
    const why =
      ms.circuit_state === 'limit_up' || ms.circuit_state === 'limit_down'
        ? `circuit_state=${ms.circuit_state}`
        : ms.floor_price
          ? 'floor_price set'
          : 'trading halted';
    gates.circuit = { pass: false, detail: `${why} — price discovery interrupted.` };
    if (mode === 'momentum') {
      rating = 'suppressed';
      reasoning.push(
        `Circuit gate: ${why}. Momentum recommendation SUPPRESSED — no reliable price discovery, do not enter until normal trading resumes.`,
      );
    } else {
      flags.push('microstructure_circuit_or_floor');
      reasoning.push(
        `Circuit gate: ${why}. Investment levels stand but defer execution until normal trading resumes.`,
      );
    }
  } else {
    gates.circuit = { pass: true, detail: 'Normal trading — no circuit/floor/halt.' };
  }

  if (capped && rating === 'approved') rating = 'reduced';

  let score = 0.5 + Math.min(0.3, Math.max(0.0, (riskReward - 1.0) * 0.2));
  score -= 0.05 * Object.values(gates).filter((g) => !g.pass).length;
  if (flags.includes('high_volatility_size_halved')) score -= 0.1;
  score = Math.round(Math.max(0.1, Math.min(0.95, score)) * 100) / 100;

  return {
    skill: SKILL,
    ticker: data.ticker,
    mode,
    as_of: data.as_of,
    score,
    confidence: score,
    rating,
    key_metrics: {
      atr: roundBdt(atrV),
      entry: roundBdt(entry),
      buy_zone_low: roundBdt(buyLow),
      buy_zone_high: roundBdt(buyHigh),
      stop_loss: roundBdt(stop),
      target: roundBdt(target),
      risk_reward: Math.round(riskReward * 100) / 100,
      suggested_shares: shares,
      position_value_bdt: roundBdt(positionValue),
      pct_of_capital: Math.round(pctOfCapital * 100) / 100,
      trade_risk_pct: Math.round(tradeRiskPct * 100) / 100,
      risk_amount_bdt: roundBdt(actualRiskAmount),
      risk_pct_of_capital: Math.round(actualRiskPctOfCapital * 100) / 100,
    },
    gates,
    reasoning,
    flags,
    disclaimer: DISCLAIMER,
  };
}
