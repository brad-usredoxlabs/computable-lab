/**
 * VocabHandlers — minting new local-namespace terms; the floor of the
 * ontology funnel (specifications/creation-entry-points.md §6).
 *
 * POST /vocab/mint { refKind, label, sourceQuery? }
 *   → { success, recordId, label, iri, mention }
 *
 * A minted term is a real record (e.g. a `material` with
 * `status: proposed`), so the resolve spine's tier-1 records provider picks
 * it up on the next search with no extra plumbing — and it syncs through the
 * records repo like everything else. The IRI is minted under the workspace
 * namespace baseUri so terms are attributable to the lab that coined them.
 *
 * Minting is the LAST resort by design: the resolve spine ranks the mint
 * affordance below every records/OAK/OLS4 hit, and the slash menu pins it to
 * the bottom of the list. This endpoint just makes picking it real.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import { createEnvelope } from '../../types/RecordEnvelope.js';
import type { NamespaceConfig } from '../../config/types.js';
import type { ApiError } from '../types.js';

export interface MintTermRequestBody {
  /** Which vocabulary the term belongs to. Only 'material' is mintable today. */
  refKind: string;
  /** The user's text — becomes the record's name. */
  label: string;
  /** The search query that came up empty; kept as provenance. */
  sourceQuery?: string;
}

export interface MintTermResponse {
  success: true;
  recordId: string;
  label: string;
  /** IRI under the workspace namespace baseUri. */
  iri: string;
}

/** refKind → how to build the minimal draft record. */
const MINTABLE: Record<
  string,
  { schemaId: string; idPrefix: string; build: (recordId: string, label: string, sourceQuery?: string) => Record<string, unknown> }
> = {
  material: {
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    idPrefix: 'MAT',
    // NB: the material schema sets unevaluatedProperties: false and uses
    // `id` (not `recordId`) — the envelope derives recordId from id.
    build: (recordId, label, sourceQuery) => ({
      kind: 'material',
      id: recordId,
      name: label,
      domain: 'other',
      // The material schema's curation state — minted terms enter the
      // vocabulary as proposals, not curated facts.
      status: 'proposed',
      ...(sourceQuery
        ? {
            definition: `Locally minted term (no records/ontology match for "${sourceQuery}").`,
          }
        : {}),
    }),
  },
};

function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 24) || 'term'
  );
}

export function createVocabHandlers(
  store: RecordStore,
  namespace?: NamespaceConfig,
) {
  return {
    /** POST /vocab/mint */
    async mintTerm(
      request: FastifyRequest<{ Body: MintTermRequestBody }>,
      reply: FastifyReply,
    ): Promise<MintTermResponse | ApiError> {
      const body = request.body ?? ({} as MintTermRequestBody);
      const label = (body.label ?? '').trim();
      const refKind = (body.refKind ?? '').trim();

      if (!label) {
        reply.status(400);
        return { error: 'BAD_REQUEST', message: 'Body field "label" is required.' };
      }
      const mintable = MINTABLE[refKind];
      if (!mintable) {
        reply.status(400);
        return {
          error: 'BAD_REQUEST',
          message: `refKind "${refKind}" is not mintable. Mintable kinds: ${Object.keys(MINTABLE).join(', ')}.`,
        };
      }

      const rand = Math.random().toString(36).slice(2, 6);
      const recordId = `${mintable.idPrefix}-${slugify(label)}-${rand}`;
      const payload = mintable.build(recordId, label, body.sourceQuery);

      const envelope = createEnvelope(payload, mintable.schemaId, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      if (!envelope) {
        reply.status(500);
        return { error: 'INTERNAL', message: 'Failed to create envelope for minted term.' };
      }

      const result = await store.create({
        envelope,
        message: `Mint local term "${label}" (${refKind})`,
      });
      if (!result.success) {
        reply.status(422);
        return {
          error: 'VALIDATION_FAILED',
          message: `Minting "${label}" failed validation: ${JSON.stringify(result.validation ?? result.lint ?? 'unknown')}`,
        };
      }

      const baseUri = namespace?.baseUri ?? 'http://localhost:3001/records/';
      return {
        success: true,
        recordId,
        label,
        iri: `${baseUri}${recordId}`,
      };
    },
  };
}

export type VocabHandlers = ReturnType<typeof createVocabHandlers>;
