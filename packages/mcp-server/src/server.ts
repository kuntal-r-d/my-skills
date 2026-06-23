/** Stock Buddy MCP server.
 *
 * Exposes one MCP tool per skill (from registry.SKILLS) plus the composite tools
 * (analyze_ticker, screen_market). Tools dispatch to @stock-buddy/skills in-process
 * (no logic duplication). Transport defaults to stdio; set STOCK_BUDDY_HTTP=1
 * (with STOCK_BUDDY_PORT) to serve over streamable HTTP.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

import { COMPOSITES } from './composites.js';
import { runSkill, SkillError } from './dispatch.js';
import { inputSchema, SKILLS } from './registry.js';

export const DISCLAIMER = 'Educational analysis only. Not financial advice.';

function toolList(): Tool[] {
  const tools: Tool[] = [];

  for (const [name, spec] of Object.entries(SKILLS)) {
    tools.push({
      name,
      description: `${spec.description}  [${DISCLAIMER}]`,
      inputSchema: inputSchema(name) as Tool['inputSchema'],
    });
  }

  for (const [name, spec] of Object.entries(COMPOSITES)) {
    tools.push({
      name,
      description: `${spec.description}  [${DISCLAIMER}]`,
      inputSchema: {
        type: 'object',
        description: `Shared data-contract object. Reads: ${spec.reads.join(', ')}`,
        additionalProperties: true,
      },
    });
  }

  return tools;
}

function createServer(): Server {
  const server = new Server(
    { name: 'stock-buddy-mcp', version: '2.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolList(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    let result: Record<string, unknown>;
    try {
      if (name in COMPOSITES) {
        result = COMPOSITES[name].fn(args);
      } else {
        result = runSkill(name, args);
      }
    } catch (err) {
      result = {
        error: err instanceof SkillError ? err.message : String(err),
        tool: name,
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  return server;
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHttp(): Promise<void> {
  const port = Number(process.env.STOCK_BUDDY_PORT ?? '8080');
  const app = express();
  app.use(express.json());

  app.all('/mcp', async (req, res) => {
    const server = createServer();
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (err) {
      console.error('Error handling MCP request:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.listen(port, '0.0.0.0', () => {
    console.error(`Stock Buddy MCP HTTP server listening on port ${port}`);
  });
}

async function main(): Promise<void> {
  if (process.env.STOCK_BUDDY_HTTP === '1') {
    await runHttp();
    return;
  }
  await runStdio();
}

main().catch((err) => {
  console.error('Fatal error in main():', err);
  process.exit(1);
});
