export const KELLY_CAP = 0.25;
export const PER_POSITION_CAP = 0.05;
export const VOL_SCALE_THRESHOLD = 0.06;
export const VOL_SCALE_FACTOR = 0.5;
export const LIQUIDITY_FLOOR_BDT = 10_000_000;
export const SECTOR_CAP = 0.30;
export const HEAT_CAP = 0.06;
export const PROXY_POSITION_RISK = 0.01;

export function num(x: unknown, defaultVal = 0.0): number {
  try {
    const n = Number(x);
    return Number.isNaN(n) ? defaultVal : n;
  } catch {
    return defaultVal;
  }
}

export function roundBdt(x: number | null): number | null {
  if (x == null) return null;
  return Math.round(x * 100) / 100;
}

export interface TradeLevels {
  entry: number;
  buy_zone_low: number;
  buy_zone_high: number;
  stop_loss: number;
  target: number;
  risk_reward: number;
  trade_risk_pct: number;
  support?: number;
  resistance?: number;
  next_support?: number | null;
  next_resistance?: number | null;
}

export interface SizedTrade extends TradeLevels {
  suggested_shares: number;
  position_value_bdt: number;
  pct_of_capital: number;
  risk_amount_bdt: number;
  risk_pct_of_capital: number;
}

export interface GateResult {
  pass: boolean;
  detail: string;
}

export function computeSizing(
  levels: TradeLevels,
  capital: number,
  riskPct: number,
  atrV: number,
  reasoning: string[],
  flags: string[],
): SizedTrade {
  const { entry, stop_loss: stop } = levels;
  const riskPerShare = entry - stop;
  const riskAmount = (capital * riskPct) / 100;
  const rawShares = riskPerShare > 0 ? riskAmount / riskPerShare : 0;

  const kellyValue = KELLY_CAP * capital;
  const posCapValue = PER_POSITION_CAP * capital;
  const capValue = Math.min(kellyValue, posCapValue);
  const capShares = entry > 0 ? capValue / entry : 0;

  let shares = rawShares;
  if (shares > capShares) {
    shares = capShares;
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
  const pctOfCapital = capital ? (positionValue / capital) * 100 : 0;
  const actualRiskAmount = shares * riskPerShare;
  const actualRiskPctOfCapital = capital ? (actualRiskAmount / capital) * 100 : 0;

  if (shares <= 0) {
    flags.push('size_rounds_to_zero');
    reasoning.push('Computed size rounds to 0 shares at this risk budget.');
  }

  return {
    ...levels,
    suggested_shares: shares,
    position_value_bdt: roundBdt(positionValue) ?? 0,
    pct_of_capital: Math.round(pctOfCapital * 100) / 100,
    risk_amount_bdt: roundBdt(actualRiskAmount) ?? 0,
    risk_pct_of_capital: Math.round(actualRiskPctOfCapital * 100) / 100,
  };
}

export function evaluateGates(input: {
  mode: string;
  ms: Record<string, unknown>;
  portfolio: Record<string, unknown>;
  sector?: string;
  positionValue: number;
  capital: number;
  actualRiskAmount: number;
  capped: boolean;
  riskReward: number;
  flags: string[];
  reasoning: string[];
}): { rating: string; gates: Record<string, GateResult>; score: number } {
  const {
    mode,
    ms,
    portfolio,
    sector,
    positionValue,
    capital,
    actualRiskAmount,
    capped,
    riskReward,
    flags,
    reasoning,
  } = input;

  const gates: Record<string, GateResult> = {};
  let rating = 'approved';

  const adv = num(ms.avg_daily_value_bdt, 0);
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

  const totalValue = num(portfolio.total_value_bdt, 0);
  if (portfolio && totalValue > 0) {
    const positions = (portfolio.positions as Record<string, unknown>[]) ?? [];
    const existingSector = positions
      .filter((p) => sector && p.sector === sector)
      .reduce((sum, p) => sum + num(p.value_bdt), 0);
    const sectorPct = ((existingSector + positionValue) / totalValue) * 100;
    if (sectorPct <= SECTOR_CAP * 100) {
      gates.sector = {
        pass: true,
        detail: `Sector '${sector}' exposure would be ${Math.round(sectorPct * 10) / 10}% <= 30%.`,
      };
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
    const thisHeat = capital ? actualRiskAmount / capital : 0;
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

  let score = 0.5 + Math.min(0.3, Math.max(0, (riskReward - 1.0) * 0.2));
  score -= 0.05 * Object.values(gates).filter((g) => !g.pass).length;
  if (flags.includes('high_volatility_size_halved')) score -= 0.1;
  score = Math.round(Math.max(0.1, Math.min(0.95, score)) * 100) / 100;

  return { rating, gates, score };
}
