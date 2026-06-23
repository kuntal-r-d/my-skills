# Build from the REPO ROOT so both skills/ and mcp-server/ are in context:
#   docker build -f mcp-server/Dockerfile -t stock-buddy-mcp .
FROM python:3.14-slim

WORKDIR /app

# Skills (stdlib-only) + the server package.
COPY skills/ /app/skills/
COPY mcp-server/ /app/mcp-server/

RUN pip install --no-cache-dir "/app/mcp-server[http]"

# Tell the server where the skills live inside the image.
ENV STOCK_BUDDY_SKILLS_DIR=/app/skills

# Default to HTTP transport in a container; override for stdio if desired.
ENV STOCK_BUDDY_HTTP=1
ENV STOCK_BUDDY_PORT=8080
EXPOSE 8080

CMD ["stock-buddy-mcp"]
