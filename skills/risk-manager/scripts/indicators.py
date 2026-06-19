"""Pure-Python technical indicators (stdlib only).

Every function takes plain lists of floats and returns plain lists/floats so the
module is portable to any Python 3.8+ runtime with no third-party dependencies.
Series functions return a list aligned to the input length, using None for
positions where the indicator is not yet defined (warm-up period).

This module is the canonical indicator implementation for the Stock Buddy skill
suite; other skills copy it verbatim to remain self-contained.
"""
from __future__ import annotations

from typing import List, Optional, Dict


Num = float


def _f(xs):
    return [float(x) for x in xs]


def sma(values: List[Num], period: int) -> List[Optional[Num]]:
    """Simple moving average."""
    out: List[Optional[Num]] = [None] * len(values)
    if period <= 0:
        return out
    s = 0.0
    for i, v in enumerate(values):
        s += v
        if i >= period:
            s -= values[i - period]
        if i >= period - 1:
            out[i] = s / period
    return out


def ema(values: List[Num], period: int) -> List[Optional[Num]]:
    """Exponential moving average (seeded with the SMA of the first `period`)."""
    out: List[Optional[Num]] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    k = 2.0 / (period + 1)
    seed = sum(values[:period]) / period
    out[period - 1] = seed
    prev = seed
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(closes: List[Num], period: int = 14) -> List[Optional[Num]]:
    """Wilder's Relative Strength Index."""
    n = len(closes)
    out: List[Optional[Num]] = [None] * n
    if n <= period:
        return out
    gains, losses = 0.0, 0.0
    for i in range(1, period + 1):
        ch = closes[i] - closes[i - 1]
        gains += max(ch, 0.0)
        losses += max(-ch, 0.0)
    avg_gain = gains / period
    avg_loss = losses / period
    out[period] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    for i in range(period + 1, n):
        ch = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(ch, 0.0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-ch, 0.0)) / period
        out[i] = 100.0 if avg_loss == 0 else 100 - 100 / (1 + avg_gain / avg_loss)
    return out


def macd(closes: List[Num], fast: int = 12, slow: int = 26, signal: int = 9):
    """MACD line, signal line and histogram."""
    ef = ema(closes, fast)
    es = ema(closes, slow)
    line: List[Optional[Num]] = [
        (ef[i] - es[i]) if ef[i] is not None and es[i] is not None else None
        for i in range(len(closes))
    ]
    vals = [x for x in line if x is not None]
    sig_compact = ema(vals, signal)
    sig: List[Optional[Num]] = [None] * len(closes)
    j = 0
    for i in range(len(closes)):
        if line[i] is not None:
            sig[i] = sig_compact[j]
            j += 1
    hist = [
        (line[i] - sig[i]) if line[i] is not None and sig[i] is not None else None
        for i in range(len(closes))
    ]
    return {"macd": line, "signal": sig, "hist": hist}


def roc(closes: List[Num], period: int = 12) -> List[Optional[Num]]:
    """Rate of Change as a percentage."""
    n = len(closes)
    out: List[Optional[Num]] = [None] * n
    for i in range(period, n):
        prev = closes[i - period]
        if prev:
            out[i] = (closes[i] - prev) / prev * 100.0
    return out


def true_range(highs, lows, closes) -> List[Optional[Num]]:
    n = len(closes)
    out: List[Optional[Num]] = [None] * n
    for i in range(1, n):
        out[i] = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
    return out


def atr(highs, lows, closes, period: int = 14) -> List[Optional[Num]]:
    """Average True Range (Wilder smoothing)."""
    tr = true_range(highs, lows, closes)
    n = len(closes)
    out: List[Optional[Num]] = [None] * n
    trc = [x for x in tr if x is not None]
    if len(trc) < period:
        return out
    first = sum(trc[:period]) / period
    idx = period  # tr[1..period] consumed -> aligns to index `period`
    out[idx] = first
    prev = first
    for i in range(idx + 1, n):
        if tr[i] is None:
            continue
        prev = (prev * (period - 1) + tr[i]) / period
        out[i] = prev
    return out


def adx(highs, lows, closes, period: int = 14):
    """Average Directional Index with +DI / -DI (Wilder)."""
    n = len(closes)
    none = [None] * n
    if n <= 2 * period:
        return {"adx": none, "plus_di": none[:], "minus_di": none[:]}
    plus_dm = [0.0] * n
    minus_dm = [0.0] * n
    tr = [0.0] * n
    for i in range(1, n):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm[i] = up if (up > down and up > 0) else 0.0
        minus_dm[i] = down if (down > up and down > 0) else 0.0
        tr[i] = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))

    def wilder(series):
        sm = [None] * n
        s = sum(series[1:period + 1])
        sm[period] = s
        for i in range(period + 1, n):
            s = s - s / period + series[i]
            sm[i] = s
        return sm

    str_ = wilder(tr)
    sp = wilder(plus_dm)
    sm = wilder(minus_dm)
    plus_di = [None] * n
    minus_di = [None] * n
    dx = [None] * n
    for i in range(period, n):
        if str_[i]:
            plus_di[i] = 100 * sp[i] / str_[i]
            minus_di[i] = 100 * sm[i] / str_[i]
            denom = plus_di[i] + minus_di[i]
            dx[i] = 100 * abs(plus_di[i] - minus_di[i]) / denom if denom else 0.0
    adx_out = [None] * n
    start = 2 * period
    dxc = [dx[i] for i in range(period, n) if dx[i] is not None]
    if len(dxc) >= period:
        first = sum(dxc[:period]) / period
        adx_out[start] = first
        prev = first
        for i in range(start + 1, n):
            if dx[i] is not None:
                prev = (prev * (period - 1) + dx[i]) / period
                adx_out[i] = prev
    return {"adx": adx_out, "plus_di": plus_di, "minus_di": minus_di}


def mfi(highs, lows, closes, volumes, period: int = 14) -> List[Optional[Num]]:
    """Money Flow Index."""
    n = len(closes)
    out: List[Optional[Num]] = [None] * n
    tp = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(n)]
    rmf = [tp[i] * volumes[i] for i in range(n)]
    for i in range(period, n):
        pos = neg = 0.0
        for j in range(i - period + 1, i + 1):
            if tp[j] > tp[j - 1]:
                pos += rmf[j]
            elif tp[j] < tp[j - 1]:
                neg += rmf[j]
        out[i] = 100.0 if neg == 0 else 100 - 100 / (1 + pos / neg)
    return out


def bollinger(closes: List[Num], period: int = 20, mult: float = 2.0):
    """Bollinger Bands (mid=SMA, upper/lower = mid ± mult*stdev)."""
    n = len(closes)
    mid = sma(closes, period)
    upper: List[Optional[Num]] = [None] * n
    lower: List[Optional[Num]] = [None] * n
    pctb: List[Optional[Num]] = [None] * n
    for i in range(period - 1, n):
        window = closes[i - period + 1:i + 1]
        m = mid[i]
        var = sum((x - m) ** 2 for x in window) / period
        sd = var ** 0.5
        upper[i] = m + mult * sd
        lower[i] = m - mult * sd
        rng = upper[i] - lower[i]
        pctb[i] = (closes[i] - lower[i]) / rng if rng else 0.5
    return {"mid": mid, "upper": upper, "lower": lower, "pct_b": pctb}


def obv(closes: List[Num], volumes: List[Num]) -> List[Num]:
    """On-Balance Volume."""
    out = [0.0] * len(closes)
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            out[i] = out[i - 1] + volumes[i]
        elif closes[i] < closes[i - 1]:
            out[i] = out[i - 1] - volumes[i]
        else:
            out[i] = out[i - 1]
    return out


def vroc(volumes: List[Num], period: int = 14) -> List[Optional[Num]]:
    """Volume Rate of Change (%)."""
    n = len(volumes)
    out: List[Optional[Num]] = [None] * n
    for i in range(period, n):
        prev = volumes[i - period]
        if prev:
            out[i] = (volumes[i] - prev) / prev * 100.0
    return out


def accum_dist(highs, lows, closes, volumes) -> List[Num]:
    """Accumulation/Distribution line."""
    out = [0.0] * len(closes)
    run = 0.0
    for i in range(len(closes)):
        rng = highs[i] - lows[i]
        mfm = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / rng if rng else 0.0
        run += mfm * volumes[i]
        out[i] = run
    return out


def last_valid(series: List[Optional[Num]]) -> Optional[Num]:
    for v in reversed(series):
        if v is not None:
            return v
    return None


def split_ohlcv(ohlcv: List[Dict]):
    """Return (opens, highs, lows, closes, volumes) from a list of bar dicts."""
    o = _f([b["open"] for b in ohlcv])
    h = _f([b["high"] for b in ohlcv])
    l = _f([b["low"] for b in ohlcv])
    c = _f([b["close"] for b in ohlcv])
    v = _f([b.get("volume", 0) for b in ohlcv])
    return o, h, l, c, v
