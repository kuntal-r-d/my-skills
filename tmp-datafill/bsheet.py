#!/usr/bin/env python3
"""usage: bsheet.py SYMBOL — fetch StockAnalysis balance sheet + income statement rows
needed for NCAV and interest coverage. Prints compact JSON."""
import json, re, sys, urllib.request

SYM = sys.argv[1]
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")

def num(s):
    s = s.replace(",", "").replace("%", "").strip()
    if s in ("-", "", "n/a"): return None
    try: return float(s)
    except ValueError: return None

def rows(html):
    # server-rendered tables: <tr>...<td>Label</td><td>v1</td>... strip tags
    out = {}
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        cells = [re.sub(r"<[^>]+>", " ", c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        cells = [re.sub(r"\s+", " ", c).strip() for c in cells]
        if len(cells) >= 2 and cells[0]:
            out[cells[0]] = cells[1:]
    return out

def first_num(r, *labels):
    for lab in labels:
        for k, v in r.items():
            if k.lower().startswith(lab.lower()):
                for cell in v:
                    n = num(cell)
                    if n is not None:
                        return n, k
    return None, None

res = {"symbol": SYM}
try:
    bs = rows(fetch(f"https://stockanalysis.com/quote/dse/{SYM}/financials/balance-sheet/"))
    for key, labels in {
        "total_current_assets": ["Total Current Assets"],
        "total_liabilities": ["Total Liabilities"],
        "shares_out_mn": ["Total Common Shares Outstanding", "Filing Date Shares Outstanding"],
        "book_value_per_share": ["Book Value Per Share"],
        "shareholders_equity": ["Shareholders' Equity", "Total Common Equity"],
        "total_debt": ["Total Debt"],
        "total_assets": ["Total Assets"],
        "cash_equivalents": ["Cash & Equivalents", "Cash & Short-Term Investments"],
    }.items():
        n, k = first_num(bs, *labels)
        res[key] = n
    if res.get("total_current_assets") is not None and res.get("total_liabilities") is not None and res.get("shares_out_mn"):
        res["ncav_per_share"] = round((res["total_current_assets"] - res["total_liabilities"]) / res["shares_out_mn"], 2)
except Exception as e:
    res["bs_error"] = str(e)
try:
    inc = rows(fetch(f"https://stockanalysis.com/quote/dse/{SYM}/financials/"))
    for key, labels in {
        "operating_income": ["Operating Income"],
        "interest_expense": ["Interest Expense", "Total Interest Expense"],
        "interest_income": ["Interest Income"],
        "pretax_income": ["Pretax Income"],
        "net_income": ["Net Income"],
        "revenue": ["Revenue"],
        "shares_change_yoy_pct": ["Shares Change (YoY)", "Shares Change"],
    }.items():
        n, k = first_num(inc, *labels)
        res[key] = n
    oi, ie = res.get("operating_income"), res.get("interest_expense")
    if oi is not None and ie not in (None, 0):
        res["interest_coverage"] = round(oi / abs(ie), 2)
except Exception as e:
    res["inc_error"] = str(e)
print(json.dumps(res))
