/**
 * Fastify plugin that mounts the MCP server on a route prefix.
 *
 * Registers POST / for JSON-RPC requests (stateless Streamable HTTP).
 * Returns 405 for GET / and DELETE / (no SSE or session teardown in stateless mode).
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export interface McpPluginOptions extends FastifyPluginOptions {
  mcpServer: McpServer;
}

export async function mcpPlugin(
  fastify: FastifyInstance,
  opts: McpPluginOptions
): Promise<void> {
  const { mcpServer } = opts;

  // Disable Fastify body parsing for this scope — MCP transport parses raw body
  fastify.removeAllContentTypeParsers();
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // POST / — handle MCP JSON-RPC requests
  fastify.post('/', async (request, reply) => {
    // Stateless mode: no session ID generator
    const transport = new StreamableHTTPServerTransport({});

    // Cast needed because SDK Transport type doesn't align with exactOptionalPropertyTypes
    await mcpServer.connect(transport as unknown as Transport);

    await transport.handleRequest(
      request.raw,
      reply.raw,
      request.body
    );

    // Hijack so Fastify doesn't try to send a second response
    reply.hijack();
  });

  // GET / and DELETE / — not supported in stateless mode
  fastify.get('/', async (_request, reply) => {
    reply.code(405).send({ error: 'Method Not Allowed — stateless mode, no SSE' });
  });

  fastify.delete('/', async (_request, reply) => {
    reply.code(405).send({ error: 'Method Not Allowed — stateless mode, no session teardown' });
  });
}
