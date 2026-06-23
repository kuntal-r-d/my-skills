# Changelog

All notable changes to the Stock Buddy Skills Suite will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-24

### Changed
- **BREAKING:** Migrated entire codebase from Python to TypeScript (Node.js 20+)
- MCP server now runs natively via `@modelcontextprotocol/sdk` (no Python subprocess)
- Skills compiled to Node.js CLIs in `skills/*/scripts/*.js`
- Monorepo layout under `packages/` (`core`, `skills`, `mcp-server`, `data-adapter`, `agents`, `prediction`, `ui`, `scraper`)
- CI/CD updated to Node.js matrix; Docker base image is `node:20-slim`
- In-process skill dispatch replaces subprocess dispatch (supersedes ADR-002)

### Removed
- Python runtime requirement
- Duplicated `indicators.py` copies across skills (consolidated in `@stock-buddy/core`)
- Legacy Python modules (`mcp-server/`, `data_adapter/`, `agents/`, `scraper/`, `prediction/`, `ui/`)

## [1.1.0] - 2024-06-21

### Added
- Complete RCF Build Sequence implementation (21/21 FBS entries)
- Multi-agent system with specialized agents:
  - MomentumAgent for momentum trading analysis
  - InvestmentAgent for value investing evaluation
  - BusinessAgent for business health assessment
  - AgentCoordinator for multi-agent synthesis
- Enhanced data adapter layer:
  - FileProvider with JSON fixtures support
  - DSEProvider stub for future live data
  - MockProvider for testing
  - In-memory caching with TTL support
  - Token bucket rate limiting
- Interactive UI components:
  - HTML checklist generator for momentum screening
  - Investment grade visualization
  - Interactive explanations for all criteria
- Price prediction engine:
  - Support and resistance level calculation
  - Buy zone identification
  - Sell target recommendations
  - Stop loss calculations
  - Technical and fundamental price targets
- DSE market localization:
  - Circuit breaker adaptations
  - Sector-specific P/E benchmarks
  - Bengali translations for key terms
  - DSE-specific market metrics
- Production-ready infrastructure:
  - Docker containerization with multi-stage build
  - GitHub Actions CI/CD pipeline
  - NPM package distribution
  - Comprehensive test coverage
  - Security scanning and dependency management

### Changed
- Enhanced MCP server with HTTP transport option
- Improved skill execution with async support
- Updated documentation with deployment guide

### Fixed
- Rate limiting for data provider access
- Cache invalidation for stale data
- Error handling in agent coordination

## [1.0.0] - 2024-06-20

### Added
- Initial release of Stock Buddy Skills Suite
- 14 specialized analysis skills for DSE stocks
- MCP server with stdio and HTTP transports
- Data adapter layer with pluggable providers
- Multi-agent system for coordinated analysis
- Interactive HTML checklists for momentum and investment criteria
- Price prediction engine with technical and fundamental targets
- DSE market localization with sector benchmarks
- CI/CD pipeline with GitHub Actions
- Docker packaging and deployment
- Comprehensive test infrastructure
- Full documentation suite

### Features
- **Core Skills**: All 14 analysis skills operational
- **Data Layer**: FileProvider, DSEProvider (stub), MockProvider
- **Caching**: In-memory cache with TTL support
- **Rate Limiting**: Token bucket algorithm
- **Agents**: MomentumAgent, InvestmentAgent, BusinessAgent
- **UI**: Interactive checklists with explanations
- **Predictions**: Buy zones, sell targets, stop loss calculations
- **Localization**: DSE circuit breakers, sector P/E benchmarks

### Security
- Educational disclaimers on all outputs
- No hardcoded credentials
- Rate limiting on data access
- Container runs as non-root user
- Dependency scanning enabled

## [0.9.0] - 2024-06-19 (Pre-release)

### Added
- Core skill implementations
- Basic MCP server
- Initial test framework

## [0.1.0] - 2024-06-15 (Alpha)

### Added
- Project structure
- RCF documentation
- Initial skill templates