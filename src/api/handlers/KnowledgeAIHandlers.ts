/**
 * REST handlers for the knowledge-extraction AI endpoint.
 *
 * Single-turn completion (no tools, no agent loop). The model outputs claims
 * only; assertions and evidence are auto-generated from the claims + source
 * metadata on the backend.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { InferenceConfig, AgentConfig } from '../../config/types.js';
import type {
  InferenceClient,
  ToolBridge,
  AgentEvent,
  ChatMessage,
  CompletionRequest,
} from '../../ai/types.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

// ============================================================================
// Types
// ============================================================================

export interface ExtractKnowledgeBody {
  source: string;
  sourceId: string;
  sourceData: Record<string, unknown>;
  userHint?: string;
}

export interface KnowledgeAIHandlers {
  extractKnowledge(
    request: FastifyRequest<{ Body: ExtractKnowledgeBody }>,
    reply: FastifyReply,
  ): Promise<unknown>;
  extractKnowledgeStream(
    request: FastifyRequest<{ Body: ExtractKnowledgeBody }>,
    reply: FastifyReply,
  ): Promise<void>;
}

// ============================================================================
// Prompt builder
// ============================================================================

const templateCache = new Map<string, string>();

function loadKnowledgePrompt(templatePath: string): string {
  const absPath = resolve(templatePath);
  const cached = templateCache.get(absPath);
  if (cached) return cached;

  if (!existsSync(absPath)) {
    throw new Error(`Knowledge extraction prompt not found: ${absPath}`);
  }
  const content = readFileSync(absPath, 'utf-8');
  templateCache.set(absPath, content);
  return content;
}

function buildKnowledgeSystemPrompt(
  sourceData: Record<string, unknown>,
  userHint: string | undefined,
  templatePath: string,
): string {
  const template = loadKnowledgePrompt(templatePath);
  return template
    .replace('{{SOURCE_DATA}}', JSON.stringify(sourceData, null, 2))
    .replace('{{USER_HINT}}', userHint || '(none)');
}

// ============================================================================
// Parse response — extract claims from model output
// ============================================================================

interface ClaimObject {
  kind: 'claim';
  id: string;
  statement: string;
  subject: Record<string, unknown>;
  predicate: Record<string, unknown>;
  object: Record<string, unknown>;
  keywords?: string[];
  [key: string]: unknown;
}

interface KnowledgeResult {
  success: boolean;
  claims?: unknown[];
  assertions?: unknown[];
  evidence?: unknown[];
  unresolvedRefs?: unknown[];
  notes?: string[];
  error?: string;
  clarificationNeeded?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    turns: number;
    toolCalls: number;
  };
}

/**
 * Attempt to fix common JSON issues from LLMs:
 * trailing commas, single-line comments, truncated output.
 */
function lenientJsonParse(raw: string): Record<string, unknown> | null {
  // First try strict parse
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch { /* continue to lenient attempts */ }

  // Strip single-line comments (// ...)
  let cleaned = raw.replace(/^\s*\/\/.*$/gm, '');
  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch { /* continue */ }

  // Attempt to repair truncated JSON by closing open brackets/braces
  const repaired = repairTruncatedJson(cleaned);
  if (repaired) {
    try {
      return JSON.parse(repaired) as Record<string, unknown>;
    } catch { /* continue */ }
  }

  return null;
}

/**
 * Repair JSON that was truncated mid-stream (e.g. by max_tokens).
 * Walks through to find unclosed brackets and appends closers.
 */
function repairTruncatedJson(raw: string): string | null {
  let trimmed = raw.replace(/,\s*"[^"]*$/, '');       // trailing incomplete key or string
  trimmed = trimmed.replace(/,\s*$/, '');              // trailing comma
  trimmed = trimmed.replace(/"[^"]*$/, '"');           // unclosed string — close it

  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  if (stack.length === 0) return null;
  trimmed = trimmed.replace(/,\s*$/, '');
  return trimmed + stack.reverse().join('');
}

function extractClaimsFromResponse(
  content: string | null,
  usage: { promptTokens: number; completionTokens: number },
): { claims: ClaimObject[]; unresolvedRefs: unknown[]; notes: string[]; usage: KnowledgeResult['usage'] } | { error: string; clarificationNeeded?: string; usage: KnowledgeResult['usage'] } {
  const usageResult = {
    ...usage,
    totalTokens: usage.promptTokens + usage.completionTokens,
    turns: 1,
    toolCalls: 0,
  };

  if (!content) {
    return { error: 'Empty response from model', usage: usageResult };
  }

  console.log('[knowledge-extraction] Raw response (%d chars):\n%s', content.length, content.slice(0, 2000));

  // Try multiple extraction strategies
  const candidates: string[] = [];

  const fencedJson = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (fencedJson?.[1]) candidates.push(fencedJson[1]);

  const fenced = content.match(/```\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) candidates.push(fenced[1]);

  const braceMatch = content.match(/(\{[\s\S]*\})/);
  if (braceMatch?.[1]) candidates.push(braceMatch[1]);

  const claimsMatch = content.match(/(\{\s*"claims"[\s\S]*\})/);
  if (claimsMatch?.[1]) candidates.push(claimsMatch[1]);

  if (candidates.length === 0) {
    return { error: 'No JSON found in response', clarificationNeeded: content, usage: usageResult };
  }

  for (const candidate of candidates) {
    const parsed = lenientJsonParse(candidate.trim());
    if (parsed && Array.isArray(parsed.claims) && parsed.claims.length > 0) {
      return {
        claims: parsed.claims as ClaimObject[],
        unresolvedRefs: Array.isArray(parsed.unresolvedRefs) ? parsed.unresolvedRefs : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes as string[] : [],
        usage: usageResult,
      };
    }
  }

  console.warn('[knowledge-extraction] Failed to parse claims from %d candidates', candidates.length);
  return {
    error: 'Failed to parse claims from model output',
    clarificationNeeded: content,
    usage: usageResult,
  };
}

// ============================================================================
// Auto-generate assertions + evidence from claims
// ============================================================================

function randomHex(n: number): string {
  return randomBytes(n).toString('hex').slice(0, n);
}

/** Map bio-source type → evidence source type + namespace for CURIE. */
const SOURCE_META: Record<string, { evidenceType: string; namespace: string }> = {
  pubmed:     { evidenceType: 'publication', namespace: 'PMID' },
  europepmc:  { evidenceType: 'publication', namespace: 'PMID' },
  uniprot:    { evidenceType: 'file', namespace: 'UniProt' },
  pdb:        { evidenceType: 'file', namespace: 'PDB' },
  chebi:      { evidenceType: 'file', namespace: 'CHEBI' },
  reactome:   { evidenceType: 'file', namespace: 'REACTOME' },
  ncbi_gene:  { evidenceType: 'file', namespace: 'NCBIGene' },
};

function buildSourceLabel(sourceData: Record<string, unknown>): string {
  // Try common fields to build a human-readable label
  const title = sourceData.title as string | undefined;
  const authors = sourceData.authors as string | string[] | undefined;
  const year = sourceData.year ?? sourceData.pubDate ?? sourceData.date;

  if (title) {
    const short = title.length > 60 ? title.slice(0, 57) + '...' : title;
    if (year) return `${short} (${year})`;
    return short;
  }

  if (typeof authors === 'string') return authors;
  if (Array.isArray(authors) && authors.length > 0) {
    return `${authors[0]} et al.`;
  }

  return 'Source record';
}

function generateAssertionsAndEvidence(
  claims: ClaimObject[],
  source: string,
  sourceId: string,
  sourceData: Record<string, unknown>,
): { assertions: unknown[]; evidence: unknown[] } {
  const meta = SOURCE_META[source] ?? { evidenceType: 'file', namespace: source.toUpperCase() };
  const sourceLabel = buildSourceLabel(sourceData);

  // Build the CURIE for the source
  const sourceCurie = `${meta.namespace}:${sourceId}`;

  // One evidence bundle for all assertions from this source
  const evidenceId = `EVD-${source}-${sourceId.slice(0, 8)}-${randomHex(4)}`;
  const assertionRefs: unknown[] = [];
  const assertions: unknown[] = [];

  for (const claim of claims) {
    const slug = claim.id.replace(/^CLM-/, '').replace(/-[a-f0-9]{4}$/, '');
    const assertionId = `ASN-${slug}-${randomHex(4)}`;

    assertionRefs.push({
      kind: 'record',
      id: assertionId,
      type: 'assertion',
      label: claim.statement,
    });

    assertions.push({
      kind: 'assertion',
      id: assertionId,
      claim_ref: {
        kind: 'record',
        id: claim.id,
        type: 'claim',
        label: claim.statement,
      },
      statement: claim.statement,
      scope: {},
      evidence_refs: [
        {
          kind: 'record',
          id: evidenceId,
          type: 'evidence',
          label: sourceLabel,
        },
      ],
    });
  }

  const evidence = [
    {
      kind: 'evidence',
      id: evidenceId,
      supports: assertionRefs,
      sources: [
        {
          type: meta.evidenceType,
          ref: {
            kind: 'ontology',
            id: sourceCurie,
            namespace: meta.namespace,
            label: sourceLabel,
          },
        },
      ],
    },
  ];

  return { assertions, evidence };
}

// ============================================================================
// Single-turn knowledge extraction (no agent loop, no tools)
// ============================================================================

async function runKnowledgeExtraction(opts: {
  inferenceClient: InferenceClient;
  inferenceConfig: InferenceConfig;
  agentConfig: AgentConfig;
  body: ExtractKnowledgeBody;
  onEvent?: (event: AgentEvent) => void;
}): Promise<KnowledgeResult> {
  const { inferenceClient, inferenceConfig, agentConfig, body, onEvent } = opts;

  const templatePath = agentConfig.systemPromptPath ?? 'prompts/knowledge-extraction-agent.md';
  const systemPrompt = buildKnowledgeSystemPrompt(body.sourceData, body.userHint, templatePath);

  const userPrompt = `Extract structured claims from this ${body.source} record (ID: ${body.sourceId}).${
    body.userHint ? ` Focus on: ${body.userHint}` : ''
  }`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  onEvent?.({ type: 'status', message: 'Extracting claims...' });

  // Single completion — no tools, no agent loop
  let response;
  try {
    const completionReq: CompletionRequest = {
      model: inferenceConfig.model,
      messages,
      temperature: inferenceConfig.temperature ?? 0.1,
      max_tokens: Math.max(inferenceConfig.maxTokens ?? 4096, 8192),
    };
    response = await inferenceClient.complete(completionReq);
  } catch (err) {
    return {
      success: false,
      error: `Inference error: ${err instanceof Error ? err.message : String(err)}`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, turns: 1, toolCalls: 0 },
    };
  }

  const totalUsage = {
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };

  const choice = response.choices[0];
  if (!choice) {
    return { success: false, error: 'No response from model' };
  }

  let content = choice.message.content;

  // If truncated, retry once with higher limit
  if (choice.finish_reason === 'length' && content) {
    onEvent?.({ type: 'status', message: 'Output truncated — retrying...' });

    try {
      const retryReq: CompletionRequest = {
        model: inferenceConfig.model,
        messages: [
          ...messages,
          { role: 'assistant', content },
          { role: 'user', content: 'Your response was truncated. Please output the complete JSON. Be concise — 3-5 claims max, short slugs.' },
        ],
        temperature: inferenceConfig.temperature ?? 0.1,
        max_tokens: 16384,
      };
      const retryResponse = await inferenceClient.complete(retryReq);
      if (retryResponse.usage) {
        totalUsage.promptTokens += retryResponse.usage.prompt_tokens;
        totalUsage.completionTokens += retryResponse.usage.completion_tokens;
      }
      const retryChoice = retryResponse.choices[0];
      if (retryChoice?.message.content) {
        content = retryChoice.message.content;
      }
    } catch {
      onEvent?.({ type: 'status', message: 'Retry failed — using partial output...' });
    }
  }

  // Parse claims from model output
  const parsed = extractClaimsFromResponse(content, totalUsage);

  if ('error' in parsed) {
    const result: KnowledgeResult = {
      success: false,
      error: parsed.error,
      usage: parsed.usage!,
    };
    if (parsed.clarificationNeeded) result.clarificationNeeded = parsed.clarificationNeeded;
    return result;
  }

  // Auto-generate assertions and evidence from the claims
  onEvent?.({ type: 'status', message: `Extracted ${parsed.claims.length} claims, building triples...` });

  const { assertions, evidence } = generateAssertionsAndEvidence(
    parsed.claims,
    body.source,
    body.sourceId,
    body.sourceData,
  );

  return {
    success: true,
    claims: parsed.claims,
    assertions,
    evidence,
    unresolvedRefs: parsed.unresolvedRefs,
    notes: parsed.notes,
    usage: parsed.usage!,
  };
}

// ============================================================================
// Factory
// ============================================================================

export function createKnowledgeAIHandlers(
  inferenceClient: InferenceClient,
  _toolBridge: ToolBridge,
  inferenceConfig: InferenceConfig,
  agentConfig: AgentConfig,
): KnowledgeAIHandlers {
  return {
    async extractKnowledge(request, reply) {
      const body = request.body;

      if (!body.source || !body.sourceData) {
        reply.status(400);
        return { error: 'INVALID_REQUEST', message: 'source and sourceData are required' };
      }

      try {
        const result = await runKnowledgeExtraction({
          inferenceClient,
          inferenceConfig,
          agentConfig,
          body,
        });
        return result;
      } catch (err) {
        request.log.error(err, 'Knowledge extraction failed');
        reply.status(500);
        return {
          error: 'AGENT_ERROR',
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async extractKnowledgeStream(request, reply) {
      const body = request.body;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const sendEvent = (event: AgentEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        const result = await runKnowledgeExtraction({
          inferenceClient,
          inferenceConfig,
          agentConfig,
          body,
          onEvent: sendEvent,
        });

        sendEvent({ type: 'done', result: result as unknown as import('../../ai/types.js').AgentResult });
      } catch (err) {
        sendEvent({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        reply.raw.end();
      }
    },
  };
}
