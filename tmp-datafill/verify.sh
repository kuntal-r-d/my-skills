#!/bin/bash
# usage: ./verify.sh SYMBOL — prints checklist + fundamentals coverage summary as JSON
export PATH=/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:$PATH
DB=postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy
SYM=$1
psql "$DB" -Atc "SELECT payload->'value_investment_checklist' FROM analysis_snapshots a JOIN tickers t ON t.id=a.ticker_id WHERE t.symbol='$SYM' ORDER BY a.created_at DESC LIMIT 1" > "/tmp/vc_$SYM.json"
psql "$DB" -Atc "SELECT payload FROM fundamentals_snapshots f JOIN tickers t ON t.id=f.ticker_id WHERE t.symbol='$SYM' ORDER BY f.as_of DESC LIMIT 1" > "/tmp/fund_$SYM.json"
psql "$DB" -Atc "SELECT count(*) FROM ohlcv_daily o JOIN tickers t ON t.id=o.ticker_id WHERE t.symbol='$SYM'" > "/tmp/ohlcv_$SYM.txt"
python3 - "$SYM" <<'EOF'
import json,sys
sym=sys.argv[1]
def load(p):
    try:
        s=open(p).read().strip()
        return json.loads(s) if s else {}
    except Exception:
        return {}
d=load(f"/tmp/vc_{sym}.json")
if not isinstance(d,dict): d={}
crit=d.get("criteria") or []
pend=[(c.get("id") or c.get("key") or c.get("name")) for c in crit if isinstance(c,dict) and c.get("passed") is None]
f=load(f"/tmp/fund_{sym}.json")
nulls=sorted([k for k,v in f.items() if v is None]) if isinstance(f,dict) else []
try: bars=int(open(f"/tmp/ohlcv_{sym}.txt").read().strip() or 0)
except Exception: bars=0
top={k:d.get(k) for k in ("grade","gpa","score","passed","passed_count","failed_count","evaluated","summary") if k in d}
print(json.dumps({"symbol":sym,"checklist_top":top,"criteria_total":len(crit),"pending_count":len(pend),"pending":pend,"ohlcv_bars":bars,"fund_field_count":(len(f) if isinstance(f,dict) else 0),"fund_null_fields":nulls},default=str))
EOF
