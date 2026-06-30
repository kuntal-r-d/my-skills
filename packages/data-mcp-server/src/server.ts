import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import { getDb, closeDb, getDatabaseUrl } from '@stock-buddy/db';
import { buildClientResearchInstructions, CORE_CONTRACT_FIELDS, getDisclaimer } from '@stock-buddy/core';
import { DATA_TOOLS, handleDataTool } from './tools.js';

export const DISCLAIMER = getDisclaimer();

function createServer(): Server {
  const server = new Server(
    { name: 'stock-buddy-data-mcp', version: '2.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: DATA_TOOLS.map(
      (t) =>
        ({
          name: t.name,
          description: `${t.description}  [${DISCLAIMER}]`,
          inputSchema: t.inputSchema,
        }) as Tool,
    ),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    let result: Record<string, unknown>;
    try {
      getDatabaseUrl();
      const db = getDb();
      result = await handleDataTool(db, name, args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isDb =
        /connect|ECONNREFUSED|DATABASE_URL|password authentication|timeout/i.test(message);
      result = isDb
        ? {
            error: message,
            tool: name,
            instructions: buildClientResearchInstructions({
              ticker: args.ticker ? String(args.ticker).toUpperCase() : undefined,
              missingFields: [...CORE_CONTRACT_FIELDS],
              reason: 'database_unavailable',
            }),
          }
        : { error: message, tool: name };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  return server;
}

async function main(): Promise<void> {
  const useHttp = process.env.STOCK_BUDDY_DATA_HTTP === '1';
  const server = createServer();

  if (useHttp) {
    const port = Number(process.env.STOCK_BUDDY_DATA_PORT ?? 8081);
    const app = express();
    app.use(express.json());

    app.post('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.listen(port, () => {
      console.error(`stock-buddy-data-mcp HTTP listening on :${port}`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('stock-buddy-data-mcp stdio ready');
  }

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      void closeDb().finally(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
