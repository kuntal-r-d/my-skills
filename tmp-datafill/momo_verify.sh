#!/bin/bash
# usage: ./momo_verify.sh SYMBOL — momentum-readiness summary from latest analysis snapshot
export PATH=/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:$PATH
DB=postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy
SYM=$1
psql "$DB" -Atc "SELECT payload FROM analysis_snapshots a JOIN tickers t ON t.id=a.ticker_id WHERE t.symbol='$SYM' ORDER BY a.created_at DESC LIMIT 1" > "/tmp/an_$SYM.json"
psql "$DB" -Atc "SELECT count(*) FROM ohlcv_daily o JOIN tickers t ON t.id=o.ticker_id WHERE t.symbol='$SYM'" > "/tmp/bars_$SYM.txt"
psql "$DB" -Atc "SELECT count(*) FROM news_items n JOIN tickers t ON t.id=n.ticker_id WHERE t.symbol='$SYM' AND n.published_at > now() - interval '30 days'" > "/tmp/news_$SYM.txt"
python3 - "$SYM" <<'EOF'
import json, sys
sym = sys.argv[1]
d = json.load(open(f"/tmp/an_{sym}.json"))
stages = d.get("stages", {})
skipped = {k: v for k, v in stages.items() if v != "ok" and not isinstance(v, dict)}
syn = d.get("synthesis") or {}
mom = None
for key in ("momentum", "momentum_signal"):
    if isinstance(syn.get(key), dict):
        mom = syn[key]; break
mt = d.get("momentum_trading") or {}
micro = ((d.get("agent_cards") or {}).get("microstructure")) or {}
if not micro:
    micro = (mt.get("microstructure") or {})
bars = int(open(f"/tmp/bars_{sym}.txt").read().strip() or 0)
news30 = int(open(f"/tmp/news_{sym}.txt").read().strip() or 0)
out = {
    "symbol": sym,
    "mode": d.get("analysis_mode"),
    "momentum_enriched": d.get("momentum_enriched"),
    "bars": bars,
    "news_items_30d": news30,
    "stages_not_ok": skipped,
    "synthesis_keys": sorted(syn.keys()) if isinstance(syn, dict) else None,
    "momentum_signal": ({k: mom.get(k) for k in ("signal", "rating", "score", "composite", "confidence", "suppressed") if k in mom} if isinstance(mom, dict) else None),
    "momentum_trading_keys": sorted(mt.keys())[:12] if isinstance(mt, dict) else None,
}
print(json.dumps(out, default=str))
EOF
