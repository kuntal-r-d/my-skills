# Client Configuration — Docker (recommended)

Stock Buddy runs in Docker. MCP clients connect to **HTTP endpoints** exposed by `docker compose` (or use stdio `docker run` as fallback).

## 1. Start the stack

```bash
cd /Users/kuntal/Developer/stock-buddy-skill-mcp/stock-buddy

docker compose build
docker compose up -d postgres stock-buddy-mcp stock-buddy-data-mcp

# One-time DB setup (wait ~5s for postgres healthy)
docker compose run --rm \
  -e DATABASE_URL=postgresql://stockbuddy:stockbuddy@postgres:5432/stockbuddy \
  stock-buddy-mcp node packages/db/dist/migrate.js

docker compose run --rm \
  -e DATABASE_URL=postgresql://stockbuddy:stockbuddy@postgres:5432/stockbuddy \
  stock-buddy-mcp node packages/db/dist/seed.js

# Load market data
docker compose run --rm \
  -e DATABASE_URL=postgresql://stockbuddy:stockbuddy@postgres:5432/stockbuddy \
  stock-buddy-mcp node packages/ingest/dist/cli.js -- --watchlist --days 365
```

Optional: dashboard on http://localhost:3000

```bash
docker compose up -d dashboard
```

Verify MCP:

```bash
curl -s -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | head -c 300

curl -s -X POST http://localhost:8081/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | head -c 300
```

| Service | Port | MCP URL |
|---------|------|---------|
| Analysis (`stock-buddy`) | 8080 | `http://localhost:8080/mcp` |
| Data (`stock-buddy-data`) | 8081 | `http://localhost:8081/mcp` |
| Dashboard | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | `postgresql://stockbuddy:stockbuddy@localhost:5432/stockbuddy` |

**Docker Desktop must be running** before opening MCP clients.

---

## 2. MCP client configs

### Claude Desktop (stdio via Docker)

Claude Desktop **does not accept** `"url"` in `claude_desktop_config.json` — it requires `command` + `args` (stdio). Use Docker stdio:

**Prerequisites:**

```bash
docker compose build
docker compose up -d postgres   # only Postgres — do NOT need 8080/8081 for Claude
```

**File:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Copy from [`claude-desktop.json`](claude-desktop.json). If Claude cannot find `docker`, set `"command": "/usr/local/bin/docker"` (run `which docker`).

```json
{
  "mcpServers": {
    "stock-buddy-data": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "STOCK_BUDDY_DATA_HTTP=0",
        "-e", "DATABASE_URL=postgresql://stockbuddy:stockbuddy@host.docker.internal:5432/stockbuddy",
        "-e", "STOCK_BUDDY_DATA_ADMIN=1",
        "stock-buddy-mcp:latest",
        "node", "packages/data-mcp-server/dist/server.js"
      ]
    },
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

Quit Claude completely (Cmd+Q), reopen. Docker Desktop must be running.

**Remote HTTP in Claude:** use Settings → Connectors → Add custom connector (`http://localhost:8080/mcp`) — not `claude_desktop_config.json`.

---

### Cursor / Codex / Gemini (HTTP OK)

Start HTTP MCP containers:

```bash
docker compose up -d postgres stock-buddy-mcp stock-buddy-data-mcp
```

Then use URL configs below.

### Cursor

**File:** `.cursor/mcp.json` (project) — template: [`cursor.json`](cursor.json)

Same JSON as Claude Desktop above. Refresh MCP in Cursor settings after save.

---

### OpenAI Codex

**File:** `~/.codex/config.toml` — append from [`codex-config.toml`](codex-config.toml):

```toml
[mcp_servers.stock-buddy-data]
url = "http://localhost:8081/mcp"
enabled = true

[mcp_servers.stock-buddy]
url = "http://localhost:8080/mcp"
enabled = true
```

---

### Gemini CLI

**File:** `~/.gemini/settings.json` — copy from [`gemini-settings.json`](gemini-settings.json)

Uses `httpUrl` (streamable HTTP):

```json
{
  "mcpServers": {
    "stock-buddy-data": {
      "httpUrl": "http://localhost:8081/mcp",
      "timeout": 120000,
      "trust": true
    },
    "stock-buddy": {
      "httpUrl": "http://localhost:8080/mcp",
      "timeout": 120000,
      "trust": true
    }
  }
}
```

Verify: `gemini mcp list`

---

## 3. Workflow

```
1. stock-buddy-data.get_ticker_contract_for_analysis({ ticker: "GP", include_portfolio: true })
2. stock-buddy.analyze_ticker(<result>)
```

Data MCP admin tools (`trigger_ingest`, `register_ticker`) are enabled in the data container via `STOCK_BUDDY_DATA_ADMIN=1`.

Research citations from agent/web search: `upsert_research_sources` / `get_research_sources` (no admin flag required).

Full markdown memos: `upsert_research_memo` / `get_research_memo` / `list_research_memos`.

### Skill editor (MCP + dashboard)

Edit Agent Skill `SKILL.md` content without hand-editing files:

| Tool / route | Purpose |
|--------------|---------|
| `list_skills` / `GET /api/skills` | List skills from disk + DB overrides |
| `get_skill` / `GET /api/skills/:slug` | Fetch effective SKILL.md |
| `upsert_skill` / `PUT /api/skills/:slug` | Save override to PostgreSQL |
| `reset_skill` / `DELETE /api/skills/:slug` | Drop override → revert to disk |
| `sync_skill_to_disk` / `POST /api/skills/:slug/sync-disk` | Write effective skill to `skills/{slug}/SKILL.md` |

**Dashboard:** open **Skills** tab at `http://localhost:3000` (after `npm run dashboard`).

**MCP write flags:** set `STOCK_BUDDY_SKILLS_ADMIN=1` or `STOCK_BUDDY_DATA_ADMIN=1`. Disk writes also need `STOCK_BUDDY_SKILLS_WRITE_DISK=1` (dashboard defaults to allowing disk sync unless set to `0`).

**Docker `sync_to_disk`:** The image still **copies** `skills/` at build time, but `docker-compose.yml` mounts `./skills:/app/skills` on `stock-buddy-data-mcp`, `dashboard`, and `stock-buddy-mcp`. DB overrides always work (Postgres). **Save + sync disk** / `sync_skill_to_disk` / `upsert_skill({ sync_to_disk: true })` then update files in your repo. Without that mount, writes inside the container would not reach the host.

**When to rebuild Docker**

| Setup | Rebuild? |
|-------|----------|
| **Local Node** data MCP (`node packages/data-mcp-server/...`) | No — `npm run db:migrate`, `npm run build`, reload MCP in Cursor |
| **docker compose** data MCP / dashboard | Yes — `docker compose build` then `docker compose up -d stock-buddy-data-mcp dashboard` |

When Postgres or contract data is missing, MCP returns an **`instructions`** block — the client agent (Claude Code / Codex / Gemini) should gather missing fields from **any credible public source** (web search, news, PDFs, aggregators, etc.; example sites in `instructions` are hints only) per `dse-data-acquisition` skill.

---

## Alternative: Docker stdio (no HTTP ports)

If your client does **not** support HTTP MCP, use [`claude-desktop.docker-stdio.json`](claude-desktop.docker-stdio.json):

- Only run `docker compose up -d postgres` (do **not** start the HTTP MCP containers on 8080/8081).
- Build image: `docker compose build`
- Client spawns `docker run -i --rm` per session.

Requires Postgres port `5432` published (default in compose).

---

## Local Node (no Docker)

See git history or run `npm run build` and use absolute paths to `packages/*/dist/server.js` with `STOCK_BUDDY_HTTP=0`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| MCP disconnected | `docker compose ps` — ensure `stock-buddy-mcp` and `stock-buddy-data-mcp` are up |
| Connection refused :8080/:8081 | `docker compose up -d stock-buddy-mcp stock-buddy-data-mcp` |
| Empty analysis / missing OHLCV | Run ingest command above |
| Postgres errors | `docker compose up -d postgres` and wait for healthy |
| Port conflict on 8080 | Stop other services or change ports in `docker-compose.yml` |
| Many `stock-buddy-mcp` processes / random Docker names (`elated_*`, etc.) | Use **one** mode: HTTP via compose (`8080`/`8081`). Cursor: copy [`cursor.json`](cursor.json) to `.cursor/mcp.json`. Then `npm run mcp:clean` and restart the MCP client. Do **not** mix HTTP compose + stdio `docker run` + local `node …/server.js`. |

Full walkthrough: [`docs/LHB-walkthrough.md`](../docs/LHB-walkthrough.md)
