/**
 * Reverse-proxy implementations of the AI handler interfaces.
 *
 * When `CLA_AI_GATEWAY_URL` is set, the host delegates every AI request to
 * an external gateway process (the appliance's `cla-lab-ai-gateway`
 * service, or any other implementation of the AiClient contract). Each
 * proxy forwards request.url and request.method 1:1 — the gateway is
 * expected to mirror the host's route paths exactly.
 *
 * Phase 1 of the AI-extension split introduces the gate; later phases
 * move the in-host AI handlers out of the AGPL3 codebase entirely,
 * leaving only these proxies + the deterministic fallback in the host.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AIHandlers } from './AIHandlers.js';
import type { KnowledgeAIHandlers } from './KnowledgeAIHandlers.js';
import type { IngestionAIHandlers } from './IngestionAIHandlers.js';
import type { MaterialAIHandlers } from './MaterialAIHandlers.js';
import type { AiRecordDraftHandlers } from './AiRecordDraftHandlers.js';
import type { EventEditorFixHandlers } from './EventEditorFixHandlers.js';

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
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD' && request.body !== undefined && request.body !== null;
  const body = hasBody ? JSON.stringify(request.body) : undefined;
  const url = `${gatewayUrl.replace(/\/$/, '')}${request.url}`;
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

function proxy(gatewayUrl: string) {
  return (request: FastifyRequest, reply: FastifyReply) =>
    proxyToGateway(gatewayUrl, request, reply);
}

export function createGatewayAIHandlers(gatewayUrl: string): AIHandlers {
  const p = proxy(gatewayUrl);
  return { draftEvents: p, draftEventsStream: p, assistStream: p } as AIHandlers;
}

export function createGatewayKnowledgeAIHandlers(gatewayUrl: string): KnowledgeAIHandlers {
  const p = proxy(gatewayUrl);
  return { extractKnowledge: p, extractKnowledgeStream: p } as KnowledgeAIHandlers;
}

export function createGatewayIngestionAIHandlers(gatewayUrl: string): IngestionAIHandlers {
  const p = proxy(gatewayUrl);
  return {
    inferSourceKind: p,
    suggestIngestionMapping: p,
    explainIngestionIssue: p,
  } as IngestionAIHandlers;
}

export function createGatewayMaterialAIHandlers(gatewayUrl: string): MaterialAIHandlers {
  const p = proxy(gatewayUrl);
  return {
    draftMaterial: p,
    searchMaterials: p,
    reviewComposition: p,
    checkDuplicate: p,
  } as MaterialAIHandlers;
}

export function createGatewayAiRecordDraftHandlers(gatewayUrl: string): AiRecordDraftHandlers {
  const p = proxy(gatewayUrl);
  return { draftRecord: p } as unknown as AiRecordDraftHandlers;
}

export function createGatewayEventEditorFixHandlers(gatewayUrl: string): EventEditorFixHandlers {
  const p = proxy(gatewayUrl);
  return {
    chatStream: p,
    synthesizeSpec: p,
    applyFixStream: p,
    startApplyFixJob: p,
    health: p,
    listJobs: p,
    getJob: p,
    streamJobEvents: p,
    completeJob: p,
    getJobSpec: p,
  } as unknown as EventEditorFixHandlers;
}
