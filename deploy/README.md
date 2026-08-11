# Stock Buddy launchd agents (this Mac)

Canonical plists for the host schedule. Copy into `~/Library/LaunchAgents/` and bootstrap.

| Label | Script | When | Log |
|---|---|---|---|
| `com.stockbuddy.daily-ingest` | `npm run ingest:daily` | every day 16:00 | `~/.stock-buddy/daily-ingest.log` |
| `com.stockbuddy.weekly-books` | `npm run ingest:weekly-books` | Sunday 10:00 | `~/.stock-buddy/weekly-books.log` |

Daily stays lean (macro + news + indexes + OHLCV + analysis). Weekly is staleness-gated fundamentals/shareholding + OHLCV top-up for portfolio ∪ watchlist (`ingestSlowBooks`).

```bash
mkdir -p ~/.stock-buddy
cp deploy/com.stockbuddy.daily-ingest.plist ~/Library/LaunchAgents/
cp deploy/com.stockbuddy.weekly-books.plist ~/Library/LaunchAgents/
launchctl bootout gui/$(id -u)/com.stockbuddy.daily-ingest 2>/dev/null || true
launchctl bootout gui/$(id -u)/com.stockbuddy.weekly-books 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stockbuddy.daily-ingest.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stockbuddy.weekly-books.plist
launchctl kickstart -k gui/$(id -u)/com.stockbuddy.weekly-books   # optional one-shot
```

Paths inside the plists are absolute for this machine (`/Users/kuntal/...`, `/opt/homebrew/bin/npm`). Edit before installing elsewhere.
