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
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { NamespaceConfig } from '../../config/types.js';
import type { ApiError } from '../types.js';
import { localMaterialIdForLabel } from '../../materials/termId.js';

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

/** Local mirror of MaterialGrounding's module-private `asPayload` (:50-54):
 *  object payload → record map, else null. Duplicated (not imported) to keep
 *  the diff to one file; MaterialGrounding's helpers stay private. */
function asPayload(env: RecordEnvelope | null): Record<string, unknown> | null {
  return env?.payload && typeof env.payload === 'object' && !Array.isArray(env.payload)
    ? env.payload as Record<string, unknown>
    : null;
}

/** Local mirror of MaterialGrounding's `payloadName` (:56-58): `payload.name`
 *  trimmed, else '' — never undefined (exactOptionalPropertyTypes). */
function payloadName(payload: Record<string, unknown> | null): string {
  return typeof payload?.name === 'string' ? payload.name.trim() : '';
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

      // Deterministic local id: same label always → same recordId, so
      // re-minting (e.g. re-normalizing an accepted graph, or a user re-picking
      // the same term) is idempotent: a repeat mint returns the EXISTING record
      // (200, same shape) instead of failing on the store's create-collision
      // guard. Mirrors MaterialGrounding.ensureLocalMaterialForDraft (:211-223):
      // exact normalized-name match among materials, then lookup by record id.
      const recordId = localMaterialIdForLabel(label);
      const baseUri = namespace?.baseUri ?? 'http://localhost:3001/records/';

      // Lookup-first (mirrors MaterialGrounding.ts:211-214): exact normalized
      // name equality (trim + toLowerCase) over MATERIALS only.
      const materials = await store.list({ schemaId: mintable.schemaId, limit: 10000 });
      const needle = label.toLowerCase();
      const nameMatch = materials.find((env) => payloadName(asPayload(env)).toLowerCase() === needle);
      if (nameMatch) {
        return {
          success: true,
          recordId: nameMatch.recordId,
          label: payloadName(asPayload(nameMatch)) || label,
          iri: `${baseUri}${nameMatch.recordId}`,
        };
      }

      // Lookup by the deterministic id (mirrors MaterialGrounding.ts:219-223).
      const existing = await store.get(recordId);
      if (existing) {
        return {
          success: true,
          recordId: existing.recordId,
          label: payloadName(asPayload(existing)) || label,
          iri: `${baseUri}${existing.recordId}`,
        };
      }

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
          message: `Minting "${label}" failed: ${
            result.error ?? 'unknown'
          }${result.validation ? ` validation=${JSON.stringify(result.validation)}` : ''}${
            result.lint ? ` lint=${JSON.stringify(result.lint)}` : ''
          }`,
        };
      }

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
