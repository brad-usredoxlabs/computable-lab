/**
 * Reverse-proxy implementations of the AI handler interfaces.
 *
 * When `CLA_AI_GATEWAY_URL` is set, the host delegates every AI request to
 * an external gateway process (the appliance's `cla-lab-ai-gateway` service,
 * or any other implementation of the AiClient contract). Each proxy mirrors
 * the route paths exposed by the host so the gateway can be a near-drop-in
 * replacement for the in-host AI runtime.
 *
 * Phase 1 of the AI-extension split introduces the gate; later phases move
 * the in-host AI handlers out of the AGPL3 codebase entirely, leaving only
 * these proxies + the deterministic fallback in the host.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AIHandlers } from './AIHandlers.js';
import type { KnowledgeAIHandlers } from './KnowledgeAIHandlers.js';
import type { IngestionAIHandlers } from './IngestionAIHandlers.js';
import type { MaterialAIHandlers } from './MaterialAIHandlers.js';
import type { AiRecordDraftHandlers } from './AiRecordDraftHandlers.js';

const FORWARDED_REQUEST_HEADERS = ['x-user-id', 'authorization', 'cookie'] as const;
const STRIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'content-encoding',
]);

function buildForwardHeaders(request: FastifyRequest, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasBody) headers['content-type'] = 'application/json';
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers[name];
    if (typeof value === 'string' && value.length > 0) headers[name] = value;
  }
  return headers;
}

async function proxyToGateway(
  gatewayUrl: string,
  method: string,
  path: string,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const hasBody = method !== 'GET' && method !== 'HEAD' && request.body !== undefined && request.body !== null;
  const body = hasBody ? JSON.stringify(request.body) : undefined;
  const url = `${gatewayUrl.replace(/\/$/, '')}${path}`;
  const upstream = await fetch(url, {
    method,
    headers: buildForwardHeaders(request, hasBody),
    ...(body !== undefined ? { body } : {}),
  });
  reply.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    reply.header(key, value);
  });
  if (upstream.body) {
    await reply.send(upstream.body);
  } else {
    await reply.send(await upstream.text());
  }
}

function withGatewayPath(gatewayUrl: string, method: string, path: string) {
  return (request: FastifyRequest, reply: FastifyReply) =>
    proxyToGateway(gatewayUrl, method, path, request, reply);
}

export function createGatewayAIHandlers(gatewayUrl: string): AIHandlers {
  return {
    draftEvents: withGatewayPath(gatewayUrl, 'POST', '/api/ai/draft-events'),
    draftEventsStream: withGatewayPath(gatewayUrl, 'POST', '/api/ai/draft-events/stream'),
    assistStream: withGatewayPath(gatewayUrl, 'POST', '/api/ai/assist/stream'),
  } as AIHandlers;
}

export function createGatewayKnowledgeAIHandlers(gatewayUrl: string): KnowledgeAIHandlers {
  return {
    extractKnowledge: withGatewayPath(gatewayUrl, 'POST', '/api/ai/knowledge/extract'),
    extractKnowledgeStream: withGatewayPath(gatewayUrl, 'POST', '/api/ai/knowledge/extract/stream'),
  } as KnowledgeAIHandlers;
}

export function createGatewayIngestionAIHandlers(gatewayUrl: string): IngestionAIHandlers {
  // Cast through unknown because IngestionAIHandlers is class-shaped with private state;
  // the proxy stands in via duck typing on the public method signatures used by routes.ts.
  return {
    suggestSourceKind: withGatewayPath(gatewayUrl, 'POST', '/api/ai/ingestion/suggest-source-kind'),
    analyze: withGatewayPath(gatewayUrl, 'POST', '/api/ai/ingestion/analyze'),
    analyzeStream: withGatewayPath(gatewayUrl, 'POST', '/api/ai/ingestion/analyze/stream'),
  } as unknown as IngestionAIHandlers;
}

export function createGatewayMaterialAIHandlers(gatewayUrl: string): MaterialAIHandlers {
  return {
    suggestMaterial: withGatewayPath(gatewayUrl, 'POST', '/api/ai/material/suggest'),
    suggestMaterialStream: withGatewayPath(gatewayUrl, 'POST', '/api/ai/material/suggest/stream'),
  } as unknown as MaterialAIHandlers;
}

export function createGatewayAiRecordDraftHandlers(gatewayUrl: string): AiRecordDraftHandlers {
  return {
    draftRecord: withGatewayPath(gatewayUrl, 'POST', '/api/ai/record/draft'),
  } as unknown as AiRecordDraftHandlers;
}
