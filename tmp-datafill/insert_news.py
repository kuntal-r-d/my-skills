#!/usr/bin/env python3
"""Insert researched news items from news_fill.json into news_items (skips duplicates by ticker+headline)."""
import json, subprocess, os

DB = "postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy"
HERE = os.path.dirname(os.path.abspath(__file__))
PSQL = None
for p in ("/opt/homebrew/opt/libpq/bin/psql", "/opt/homebrew/bin/psql", "/usr/local/bin/psql"):
    if os.path.exists(p):
        PSQL = p; break

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

data = json.load(open(os.path.join(HERE, "news_fill.json")))
for sym, items in data.items():
    for it in items:
        sql = (
            "INSERT INTO news_items (ticker_id, published_date, headline, source, category, url) "
            f"SELECT t.id, {q(it['date'])}::date, {q(it['headline'])}, {q(it['source'])}, {q(it['category'])}, {q(it['url'])} "
            f"FROM tickers t WHERE t.symbol = {q(sym)} "
            f"AND NOT EXISTS (SELECT 1 FROM news_items n WHERE n.ticker_id = t.id AND n.headline = {q(it['headline'])})"
        )
        r = subprocess.run([PSQL, DB, "-Atc", sql], capture_output=True, text=True)
        status = r.stdout.strip() or r.stderr.strip()
        print(sym, it["date"], "->", status)
