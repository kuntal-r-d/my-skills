# Stock Buddy Skills Suite

A comprehensive suite of AI-powered stock analysis tools for the Dhaka Stock Exchange (DSE), built on the MCP (Model Context Protocol) framework.

## 🚀 Quick Start

### Using npx (Node.js)
```bash
npx @stock-buddy/mcp-server
```

### Using Docker
```bash
docker-compose up -d
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/kuntal-r-d/my-skills.git
cd my-skills

# Install Node.js dependencies and build
npm ci
npm run build
npm run build:skills-cli

# Run the server (stdio)
npm start
# or: npx stock-buddy-mcp
```

## 📦 Features

### 14 Specialized Analysis Skills

1. **daily-briefing** - Pre-market briefing with portfolio alerts
2. **financial-terms-educator** - Educational explanations of financial concepts
3. **fundamental-analysis** - Company financial evaluation
4. **macro-regime** - Economic environment assessment
5. **momentum-screen** - 25-point momentum checklist
6. **pattern-miner** - Price pattern recognition
7. **risk-manager** - Portfolio risk assessment
8. **sentiment-news** - Market sentiment analysis
9. **signal-synthesizer** - Multi-signal aggregation
10. **smart-money-flow** - Institutional flow tracking
11. **stock-screener** - Market-wide screening
12. **technical-analysis** - Technical indicators
13. **ticker-dossier** - Comprehensive stock profiles
14. **value-investment-checklist** - 30-point value criteria

### Composite Tools

- **analyze_ticker** - Full pipeline analysis for a single stock
- **screen_market** - Market-wide screening and ranking

## 🛠️ Architecture

### Technology Stack
- **Skills**: TypeScript (compiled Node.js CLIs)
- **MCP Server**: TypeScript with `@modelcontextprotocol/sdk`
- **Transports**: stdio (default) and HTTP
- **Data**: Pluggable data adapter with caching (`@stock-buddy/data-adapter`)

### Project Structure
```
stock-buddy/
├── packages/              # TypeScript monorepo
│   ├── core/              # Shared types, indicators, DSE config
│   ├── skills/            # All 14 skill implementations
│   ├── mcp-server/        # MCP server
│   ├── data-adapter/      # Data provider abstraction
│   ├── agents/            # Multi-agent orchestration
│   ├── prediction/        # Price target engine
│   ├── ui/                # HTML checklist generator
│   └── scraper/           # DSE data fetchers
├── skills/                # SKILL.md + compiled CLI scripts
├── tests/                 # Vitest integration tests
└── docs/                  # Documentation
```

## 🔧 Configuration

### Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "stock-buddy": {
      "command": "python3",
      "args": ["-m", "stock_buddy_mcp.server"],
      "cwd": "/path/to/stock-buddy/mcp-server"
    }
  }
}
```

### Environment Variables

- `STOCK_BUDDY_HTTP=1` - Enable HTTP transport
- `STOCK_BUDDY_PORT=8080` - HTTP port (default: 8080)
- `STOCK_BUDDY_SKILLS_DIR` - Path to skills directory

## 📊 Data Providers

The system uses a pluggable data adapter architecture:

- **FileProvider** - Reads from JSON fixtures (development)
- **DSEProvider** - Real DSE data (production, stub)
- **MockProvider** - Predictable test data

All providers support caching and rate limiting.

## 🧪 Testing

Run the test suite:

```bash
# Unit tests
python -m pytest tests/

# Test individual skills
python skills/momentum-screen/scripts/screen.py --input fixtures/sample.json

# Test data adapter
python test_data_adapter.py
```

## 🚢 Deployment

### Docker

```bash
# Build image
docker build -f mcp-server/Dockerfile -t stock-buddy-mcp .

# Run container
docker run -p 8080:8080 stock-buddy-mcp
```

### Docker Compose

```bash
docker-compose up -d
```

## 📝 Development

### Adding a New Skill

1. Create skill directory: `skills/your-skill/`
2. Add `SKILL.md` with metadata
3. Implement logic in `scripts/`
4. Add to registry in `mcp-server/stock_buddy_mcp/registry.py`

### Running Locally

```bash
# Install in development mode
pip install -e mcp-server/

# Run with stdio transport
python -m stock_buddy_mcp.server

# Run with HTTP transport
STOCK_BUDDY_HTTP=1 python -m stock_buddy_mcp.server
```

## 🔒 Security

- All outputs include educational disclaimers
- No API keys or credentials in code
- Rate limiting on all data providers
- Docker runs as non-root user
- Regular dependency scanning via Dependabot

## 📄 License

MIT License - See LICENSE file for details.

## ⚠️ Disclaimer

**Educational analysis only. Not financial advice.**

This software provides educational analysis of publicly available market data. It does not constitute financial advice. Always consult qualified financial professionals before making investment decisions.

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit PRs to the `develop` branch.

## 📞 Support

- Issues: [GitHub Issues](https://github.com/kuntal-r-d/my-skills/issues)
- Documentation: [docs/](./docs/)

---

Built with ❤️ for the Dhaka Stock Exchange community