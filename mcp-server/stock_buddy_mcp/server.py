"""Stock Buddy MCP server.

Exposes one MCP tool per skill (from registry.SKILLS) plus the composite tools
(analyze_ticker, screen_market). Tools dispatch to the skills' stdlib-only CLIs
via subprocess (no logic duplication). Transport defaults to stdio; set
STOCK_BUDDY_HTTP=1 (with STOCK_BUDDY_PORT) to serve over streamable HTTP.

Requires the `mcp` package (pip install mcp).  The skills themselves require
nothing beyond the Python standard library.
"""
from __future__ import annotations

import json
import os

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from . import registry
from .composites import COMPOSITES
from .dispatch import run_skill, SkillError

app = Server("stock-buddy-mcp")

DISCLAIMER = "Educational analysis only. Not financial advice."


def _tool_list() -> list[Tool]:
    tools: list[Tool] = []
    # one tool per skill
    for name, spec in registry.SKILLS.items():
        tools.append(Tool(
            name=name,
            description=spec["description"] + f"  [{DISCLAIMER}]",
            inputSchema=registry.input_schema(name),
        ))
    # composite tools
    for name, spec in COMPOSITES.items():
        reads = spec["reads"]
        properties = {f: registry._FIELD_SCHEMAS[f]
                      for f in reads if f in registry._FIELD_SCHEMAS}
        tools.append(Tool(
            name=name,
            description=spec["description"] + f"  [{DISCLAIMER}]",
            inputSchema={
                "type": "object",
                "description": "Shared data-contract object the client assembles (server does "
                               "not fetch — see the dse-data-acquisition skill). Reads: "
                               + ", ".join(reads),
                "properties": properties,
                "additionalProperties": True,
            },
        ))
    return tools


@app.list_tools()
async def list_tools() -> list[Tool]:
    return _tool_list()


@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    arguments = arguments or {}
    try:
        if name in COMPOSITES:
            result = COMPOSITES[name]["fn"](arguments)
        else:
            result = run_skill(name, arguments)
    except SkillError as e:
        result = {"error": str(e), "tool": name}
    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]


def main() -> None:
    import anyio

    if os.environ.get("STOCK_BUDDY_HTTP") == "1":
        # Streamable HTTP transport for hosted/shared deployments.
        import uvicorn
        from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
        from starlette.applications import Starlette
        from starlette.routing import Mount

        manager = StreamableHTTPSessionManager(app=app)
        star = Starlette(routes=[Mount("/mcp", app=manager.handle_request)])
        port = int(os.environ.get("STOCK_BUDDY_PORT", "8080"))
        uvicorn.run(star, host="0.0.0.0", port=port)
        return

    async def _run() -> None:
        async with stdio_server() as (read, write):
            await app.run(read, write, app.create_initialization_options())

    anyio.run(_run)


if __name__ == "__main__":
    main()
