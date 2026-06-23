# Client Configuration Templates

Stock Buddy v2 is **TypeScript / Node.js only**. Python (`python -m stock_buddy_mcp.server`) was removed in v2.0.0.

## Data platform (PostgreSQL + dual MCP)

Market data is stored in PostgreSQL and exposed by a **separate** data MCP server. Analysis MCP stays no-network.

1. Start Postgres:

```bash
docker compose up -d postgres
```

2. Migrate and seed:

```bash
cp .env.example .env   # set DATABASE_URL if needed
npm run db:migrate
npm run db:seed
npm run ingest -- --ticker LHB --job all --days 365
```

3. Add **both** servers to Cursor / Claude — see [`stock-buddy-data.json`](stock-buddy-data.json):

- `stock-buddy-data` — `get_ticker_contract_for_analysis`, portfolio write tools
- `stock-buddy` — `analyze_ticker`, analysis skills

Workflow: fetch contract from data MCP → pass JSON to `analyze_ticker`.

Portfolio is **manual only**: `upsert_position`, `set_account` on data MCP.

### Web dashboard

Visual explorer for all Postgres tables (tickers, OHLCV charts, portfolio, news, ingest logs):

```bash
docker compose up -d postgres
npm run dashboard
# → http://localhost:3000
```

Or via Docker: `docker compose up -d dashboard` (port 3000).

Full LHB example: [`docs/LHB-walkthrough.md`](../docs/LHB-walkthrough.md).

## Claude Desktop (recommended: local Node)

**Prerequisites:** Node 20+, built server (`npm ci && npm run build` in repo root).

1. Build once:

```bash
cd /Users/kuntal/Developer/stock-buddy-skill-mcp/stock-buddy
npm ci && npm run build
```

2. Merge into Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

Use [`claude-desktop.json`](claude-desktop.json) — update paths if your clone lives elsewhere.

```json
{
  "mcpServers": {
    "stock-buddy": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/stock-buddy/packages/mcp-server/dist/server.js"],
      "env": {
        "STOCK_BUDDY_HTTP": "0",
        "STOCK_BUDDY_SKILLS_DIR": "/ABSOLUTE/PATH/TO/stock-buddy/skills"
      }
    }
  }
}
```

3. Restart Claude Desktop completely (Quit, not just close window).

**Alternative launcher** (same stdio behaviour):

```json
{
  "command": "node",
  "args": ["/ABSOLUTE/PATH/TO/stock-buddy/bin/stock-buddy-mcp.js"]
}
```

## Claude Desktop via Docker (stdio)

Use [`claude-desktop.docker-stdio.json`](claude-desktop.docker-stdio.json).

```bash
docker compose build   # or: docker build -t stock-buddy-mcp:latest .
```

```json
{
  "mcpServers": {
    "stock-buddy": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "STOCK_BUDDY_HTTP=0",
        "-e", "STOCK_BUDDY_SKILLS_DIR=/app/skills",
        "stock-buddy-mcp:latest"
      ]
    }
  }
}
```

Docker Desktop must be running.

## HTTP endpoint (remote clients / curl)

For hosted HTTP MCP (`docker compose up -d`), clients that support streamable HTTP:

```json
{
  "mcpServers": {
    "stock-buddy": {
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

This is **not** the same as Claude Desktop stdio — do not mix `docker compose up` (HTTP on :8080) with `docker exec ... python`.

## Troubleshooting

| Log / error | Cause | Fix |
|-------------|-------|-----|
| `No module named 'stock_buddy_mcp'` | Old Python config | Use Node config above |
| `docker exec ... python -m stock_buddy_mcp` | Old Docker + Python config | Use `docker run -i` with Node image, or local Node |
| `address already in use ... 8080` | `docker exec` into HTTP container while :8080 is taken | Don't exec a second server; use stdio `docker run` or local Node |
| `Cannot connect to the Docker daemon` | Docker Desktop not running | Start Docker, or switch to local Node config |
| `OCI runtime ...` / invalid JSON | Container missing or wrong image | `docker compose build` then use `docker-stdio` config |
| `need >=30 OHLCV bars` | Tool called without market data | Pass full contract (`ohlcv`, `fundamentals`, etc.) — server does not fetch data |
| `missing required fundamentals object` | `fundamentals` passed as JSON string | Pass a JSON **object**, not a string |

## Environment variables

| Variable | Claude Desktop | Docker Compose (HTTP) |
|----------|----------------|------------------------|
| `STOCK_BUDDY_HTTP` | **`0`** (stdio) | `1` |
| `STOCK_BUDDY_PORT` | unused | `8080` |
| `STOCK_BUDDY_SKILLS_DIR` | absolute path to `skills/` | `/app/skills` |
