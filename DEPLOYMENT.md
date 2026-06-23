# Stock Buddy Skills Suite - Deployment Guide

## 🚀 Quick Deployment

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/kuntal-r-d/my-skills.git
cd my-skills

# Start with Docker Compose
docker-compose up -d

# Verify deployment (MCP HTTP endpoint)
curl -s -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | head -c 200
```

### Option 2: NPM Package

```bash
# Install globally
npm install -g @stock-buddy/mcp-server

# Run the server
stock-buddy-mcp

# Or use npx without installing
npx @stock-buddy/mcp-server
```

### Option 3: From Source (Node.js)

```bash
# Clone and build
git clone https://github.com/kuntal-r-d/my-skills.git
cd my-skills

npm ci
npm run build
npm run build:skills-cli

# Run the server (stdio)
npm start
```

## 🔧 Configuration

### Claude Desktop Integration

Stock Buddy v2 uses **Node.js stdio** — not Python, not `docker exec` into the HTTP container.

1. Build from source (once):

```bash
cd /path/to/stock-buddy
npm ci && npm run build
```

2. Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "stock-buddy": {
      "command": "node",
      "args": ["/absolute/path/to/stock-buddy/packages/mcp-server/dist/server.js"],
      "env": {
        "STOCK_BUDDY_HTTP": "0",
        "STOCK_BUDDY_SKILLS_DIR": "/absolute/path/to/stock-buddy/skills"
      }
    }
  }
}
```

See [`client-config/README.md`](client-config/README.md) for Docker stdio and troubleshooting.

3. Restart Claude Desktop (full quit + reopen).

**Do not use:**
- `python3 -m stock_buddy_mcp.server` (removed in v2)
- `docker exec -i stock-buddy-mcp python ...` (wrong runtime; conflicts with HTTP service on :8080)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STOCK_BUDDY_HTTP` | `0` | Set to `1` for HTTP transport |
| `STOCK_BUDDY_PORT` | `8080` | HTTP server port |
| `STOCK_BUDDY_SKILLS_DIR` | `../skills` | Path to skills directory |

## 📊 Available Tools

Once deployed, the following tools are available via MCP:

### Analysis Skills (14)
- `technical_analysis` - Technical indicators and charts
- `momentum_screen` - 25-point momentum checklist
- `fundamental_analysis` - Financial evaluation
- `value_investment_checklist` - 30-point value criteria
- `smart_money_flow` - Institutional flow tracking
- `sentiment_news` - News sentiment analysis
- `macro_regime` - Economic environment
- `signal_synthesizer` - Multi-signal aggregation
- `risk_manager` - Risk assessment
- `stock_screener` - Market screening
- `pattern_miner` - Pattern recognition
- `daily_briefing` - Pre-market briefing
- `ticker_dossier` - Comprehensive profile
- `financial_terms_educator` - Educational explanations

### Composite Tools (2)
- `analyze_ticker` - Full analysis pipeline
- `screen_market` - Market-wide screening

## 🐳 Docker Deployment Details

### Build Custom Image

```bash
# Build from source
docker build -f mcp-server/Dockerfile -t stock-buddy-mcp:custom .

# Run custom image
docker run -d \
  --name stock-buddy \
  -p 8080:8080 \
  -e STOCK_BUDDY_HTTP=1 \
  stock-buddy-mcp:custom
```

### Docker Compose Options

```yaml
# docker-compose.override.yml
version: '3.8'

services:
  stock-buddy-mcp:
    environment:
      - LOG_LEVEL=INFO
      - CACHE_TTL=300
      - RATE_LIMIT=10
    volumes:
      # Mount custom fixtures
      - ./my-fixtures:/app/skills/_fixtures:ro
    ports:
      - "8080:8080"
```

## 🔒 Production Security

### 1. Use HTTPS Proxy

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name api.stockbuddy.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /mcp {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

### 2. Rate Limiting

Configure in environment:

```bash
RATE_LIMIT=5  # Requests per second
RATE_PERIOD=1.0  # Time window in seconds
```

### 3. API Authentication

For production, implement authentication middleware:

```python
# Custom middleware example
from starlette.middleware.base import BaseHTTPMiddleware

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        api_key = request.headers.get("X-API-Key")
        if not self.validate_api_key(api_key):
            return JSONResponse({"error": "Unauthorized"}, 401)
        return await call_next(request)
```

## 📈 Monitoring

### Health Check

```bash
# HTTP transport — list MCP tools
curl -s -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'

# Via MCP tool
echo '{"method":"tool.list"}' | python -m stock_buddy_mcp.server
```

### Logging

```bash
# Enable debug logging
LOG_LEVEL=DEBUG python -m stock_buddy_mcp.server

# Docker logs
docker logs -f stock-buddy-mcp
```

### Metrics

Monitor these key metrics:
- Request rate
- Response time
- Cache hit ratio
- Error rate
- Memory usage

## 🧪 Testing Deployment

### 1. Test Individual Skill

```bash
# Test momentum screen
echo '{
  "ticker": "GP",
  "ohlcv": [...],
  "fundamentals": {...}
}' | python skills/momentum-screen/scripts/screen.py
```

### 2. Test MCP Server

```python
# test_mcp.py
import asyncio
from mcp.client import Client

async def test():
    client = Client()
    await client.connect("stdio")

    # List available tools
    tools = await client.list_tools()
    print(f"Available tools: {len(tools)}")

    # Call a tool
    result = await client.call_tool(
        "technical_analysis",
        {"ticker": "GP", "ohlcv": [...]}
    )
    print(result)

asyncio.run(test())
```

### 3. Test Docker Container

```bash
# Interactive test
docker run -it --rm stock-buddy-mcp python

>>> import stock_buddy_mcp
>>> from stock_buddy_mcp.registry import SKILLS
>>> print(f"Skills loaded: {len(SKILLS)}")
```

## 🔄 Updates and Maintenance

### Pull Latest Changes

```bash
cd my-skills
git pull origin main
docker-compose down
docker-compose build
docker-compose up -d
```

### Version Management

Check current version:

```bash
docker run --rm stock-buddy-mcp python -c "print('1.1.0')"
```

Update to specific version:

```bash
git checkout v1.1.0
docker-compose build --no-cache
```

## 🆘 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Change port
   STOCK_BUDDY_PORT=8081 docker-compose up
   ```

2. **Skills not found**
   ```bash
   # Verify skills directory
   ls -la skills/
   # Set correct path
   export STOCK_BUDDY_SKILLS_DIR=/path/to/skills
   ```

3. **MCP connection failed**
   - Check Claude Desktop is restarted
   - Verify server is running: `ps aux | grep stock_buddy`
   - Check logs: `docker logs stock-buddy-mcp`

4. **Docker build fails**
   ```bash
   # Clean rebuild
   docker system prune -a
   docker-compose build --no-cache
   ```

### Debug Mode

```bash
# Enable verbose logging
DEBUG=1 python -m stock_buddy_mcp.server

# Docker debug
docker run -it --rm \
  -e DEBUG=1 \
  stock-buddy-mcp \
  /bin/bash
```

## 📞 Support

- GitHub Issues: https://github.com/kuntal-r-d/my-skills/issues
- Documentation: `/docs/`
- Version: 1.1.0

---

**Disclaimer**: Educational analysis only. Not financial advice.