# Stock Buddy MCP Server — TypeScript (Node 20)
FROM node:26-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json vitest.config.ts ./
COPY packages/ ./packages/
COPY skills/ ./skills/
COPY scripts/ ./scripts/
COPY bin/ ./bin/

RUN npm ci && npm run build:docker && npm run build:skills-cli

ENV STOCK_BUDDY_SKILLS_DIR=/app/skills
# Note: STOCK_BUDDY_HTTP is NOT set here — default is stdio.
# docker-compose.yml sets STOCK_BUDDY_HTTP=1 for the HTTP service.

EXPOSE 8080

# Default: stdio (Claude Desktop `docker run -i`). Compose overrides to HTTP.
CMD ["node", "packages/mcp-server/dist/server.js"]
