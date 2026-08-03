/**
 * HumanStepsHandlers — generate a CONCISE, human-readable protocol (≤20 short
 * steps) from a vendor PDF using the LLM.
 *
 * This is the "the biologist reads this" artifact. It deliberately returns
 * plain language steps, NOT the role/verb-deck structure — the event-graph/deck
 * is a later, AI-assisted derived build. See the concise-protocol design notes.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { InferenceClient, CompletionResponse } from '../../ai/types.js';
import type { RecordStore } from '../../store/types.js';

const MAX_INPUT_CHARS = 30000;

export interface HumanStepsHandlers {
  generateHumanSteps(
    request: FastifyRequest<{ Params: { vendorPdfId: string } }>,
    reply: FastifyReply,
  ): Promise<{ steps: Array<{ ordinal: number; text: string }>; raw?: string; title?: string }>;
}

const PROMPT_TEMPLATE = `You are a bench-scientist protocol editor. Below is raw OCR text of a manufacturer's instruction manual for a lab kit.

Produce a CLEAN, CONCISE, HUMAN protocol a biologist could follow at the bench.

Rules:
- Exactly ONE numbered list called "STEPS:" of 20-or-fewer steps (aim for 8-15).
- Each step: 1-2 short sentences, specific with real quantities/volumes/speeds/temps/times, e.g. "Transfer 100 uL of 100% ethanol into each tube."
- Plain human language. NO roles, NO ids, NO 'semanticVerb', NO JSON, NO code blocks, NO markdown headers other than "STEPS:".
- Drop TOC, components, storage, safety, troubleshooting, warranty, catalog numbers.
- Collapse repeated steps ("Repeat the wash").
- Start directly with "STEPS:"

MANUAL TEXT:
{text}`;

export function createHumanStepsHandlers(
  inferenceClient: InferenceClient,
  model: string,
  store: RecordStore,
): HumanStepsHandlers {
  return {
    async generateHumanSteps(request, _reply) {
      const { vendorPdfId } = request.params;
      const envelope = await store.get(vendorPdfId);
      if (!envelope) {
        return { steps: [], title: vendorPdfId };
      }
      const payload = (envelope.payload ?? {}) as Record<string, unknown>;
      const title =
        typeof payload.title === 'string' && payload.title.trim().length > 0
          ? payload.title.trim()
          : vendorPdfId;

      const extractedTextArr = Array.isArray(payload.extractedText)
        ? (payload.extractedText as Array<{ text?: string }>)
        : [];
      let text = extractedTextArr
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('\n\n');
      // If no extractedText (e.g. a draft source), fall back to any string body.
      if (!text.trim() && typeof payload.body === 'string') {
        text = payload.body;
      }
      if (!text.trim()) {
        return { steps: [], title };
      }
      if (text.length > MAX_INPUT_CHARS) {
        text = text.slice(0, MAX_INPUT_CHARS);
      }

      const completion = await inferenceClient.complete({
        model,
        messages: [
          { role: 'user', content: PROMPT_TEMPLATE.replace('{text}', text) },
        ],
        temperature: 0.3,
        max_tokens: 1200,
        // Qwen3 is a thinking model; disable thinking so content comes back
        // directly instead of appearing empty.
        chat_template_kwargs: { enable_thinking: false },
      });

      const raw = extractContent(completion);
      return { steps: parseSteps(raw), raw, title };
    },
  };
}

function extractContent(resp: CompletionResponse): string {
  const msg = (resp as { choices?: Array<{ message?: { content?: string | null } }> }).choices?.[0]?.message;
  if (msg && typeof msg.content === 'string') return msg.content;
  const direct = (resp as { content?: unknown }).content;
  return typeof direct === 'string' ? direct : '';
}

/** Parse "STEPS:\n1. ... \n2. ..." into ordinal+text pairs. */
export function parseSteps(raw: string): Array<{ ordinal: number; text: string }> {
  if (!raw) return [];
  const out: Array<{ ordinal: number; text: string }> = [];
  const re = /^\s*(\d+)\.\s*(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const ord = Number.parseInt(m[1] ?? '', 10);
    const txt = (m[2] ?? '').trim();
    if (txt.length > 0) out.push({ ordinal: ord, text: txt });
  }
  return out;
}
