#!/bin/bash
# usage: ./apply_facts.sh SYMBOL — merges tmp-datafill/facts/SYMBOL.json into latest fundamentals snapshot
export PATH=/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:$PATH
DB=postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy
SYM=$1
F="/Users/kuntal/Developer/stock-buddy-skill-mcp/stock-buddy/tmp-datafill/facts/$SYM.json"
[ -f "$F" ] || { echo "no facts file $F"; exit 1; }
J=$(python3 -c "import json;print(json.dumps(json.load(open('$F'))).replace(chr(39), chr(39)*2))")
psql "$DB" -Atc "UPDATE fundamentals_snapshots f SET payload = f.payload || '$J'::jsonb, source = CASE WHEN f.source LIKE '%+research' THEN f.source ELSE f.source || '+research' END FROM tickers t WHERE t.id = f.ticker_id AND t.symbol = '$SYM' AND f.as_of = (SELECT max(as_of) FROM fundamentals_snapshots f2 WHERE f2.ticker_id = f.ticker_id) RETURNING 'merged as_of ' || f.as_of;"
