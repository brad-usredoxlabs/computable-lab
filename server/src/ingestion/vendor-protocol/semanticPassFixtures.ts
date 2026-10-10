/**
 * W2-6-SEMANTIC-PASS — shared fixture helpers (NOT a test file; imported by
 * Wave2SemanticFamilyPass.test.ts and Wave2SemanticPassE2E.test.ts).
 *
 * The Zymo candidate is decoded from the real golden PDF (the same chain
 * ZymoGoldenE2E.test.ts:13-17 proves) so the captured-request completeness
 * arms run against the REAL full candidate, not a hand-typed stand-in.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeVendorProtocolPdfFile, extractVendorProtocolCandidate } from './VendorProtocolPdf.js';
import type { ProtocolCandidate } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
export const zymoPdfPath = resolve(repoRoot, 'resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf');

let cached: ProtocolCandidate | null = null;

export async function loadZymoCandidate(): Promise<ProtocolCandidate> {
  if (cached) return cached;
  const document = await decodeVendorProtocolPdfFile(zymoPdfPath, {
    documentId: 'vendor-protocol-zymo-magbead',
  });
  cached = extractVendorProtocolCandidate(document);
  return cached;
}

/** A fake InferenceClient that records every CompletionRequest (no HTTP). */
export interface CapturedCall {
  request: Record<string, unknown>;
}

export function verbRef(id: string, canonical: string): Record<string, unknown> {
  return { ref: { kind: 'record', type: 'verb-definition', id }, canonical };
}

/** Full 17-intent-step answer over the Zymo candidate: two DERIVED intents
 *  WITH copied anchors and one invariant conclusion WITHOUT an anchor
 *  (spec §6 T3 fixture shape). `candidateId` is the SAID record's own id —
 *  the merged StepProvenanceRef field is `id`, NOT documentId (P1). */
export function zymoIntentAnswer(
  candidate: ProtocolCandidate,
  candidateId: string,
): { steps: Array<Record<string, unknown>> } {
  const steps = candidate.steps.map((step, index) => {
    const base: Record<string, unknown> = {
      stepId: step.id,
      label: `Intent: ${step.sourceText.slice(0, 40)}`,
      ordinal: index + 1,
      kind: 'other',
      intent: {
        semanticVerb: verbRef('VERB-INCUBATE', 'incubate'),
        provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: candidateId, pageStart: step.provenance.pageStart }],
      },
    };
    if (index === 16) {
      // The invariant conclusion WITHOUT an anchor: provenance omitted.
      delete (base.intent as Record<string, unknown>).provenance;
    }
    return base;
  });
  return { steps };
}

export function fakeInferenceClient(opts: {
  content?: string;
  finishReason?: 'stop' | 'tool_calls' | 'length';
}): { client: { complete(req: never): Promise<never>; completeStream(): AsyncIterable<never> }; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const client = {
    async complete(request: never): Promise<never> {
      calls.push({ request: request as unknown as Record<string, unknown> });
      return {
        id: 'fake-completion-1',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: opts.content ?? '{}' },
            finish_reason: opts.finishReason ?? 'stop',
          },
        ],
      } as never;
    },
    completeStream(): AsyncIterable<never> {
      throw new Error('semantic pass never streams');
    },
  };
  return { client, calls };
}
