/**
 * ProtocolRealizePass
 *
 * Reads upstream outputs from protocol_extract (extraction-draft) and
 * lab_context_resolve (LabContext), selects a single variant from the
 * extraction-draft, promotes it to a canonical protocol record via
 * runPromotionCompile, then constructs a local-protocol record that
 * binds the protocol against the resolved labContext.
 *
 * Output: { protocolRef, localProtocolRef, selectedVariantLabel? }
 *
 * Variant-picker UX is deferred to spec-029. This pass auto-picks the
 * first variant and emits an info diagnostic so the UX layer can detect it.
 */

import { randomUUID } from 'node:crypto';
import type { Pass, PassRunArgs, PassResult, PassDiagnostic } from '../types.js';
import type { RecordStore } from '../../../store/types.js';
import type { runPromotionCompile } from '../PromotionCompileRunner.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateProtocolRealizePassDeps {
  recordStore: RecordStore;
  runPromotionCompile: typeof runPromotionCompile;
  recordIdPrefix?: { protocol?: string; localProtocol?: string };
}

export interface LabContext {
  labwareKind: string;
  plateCount: number;
  sampleCount: number;
  equipmentOverrides: Array<{ role: string; equipmentId: string }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PROTOCOL_PREFIX = 'PRT-realized-';
const DEFAULT_LOCAL_PROTOCOL_PREFIX = 'LPR-realized-';

// Schema ID for local-protocol records.
// NOTE: The local-protocol.schema.yaml references ./common.schema.yaml which
// resolves to the core common schema. We use the canonical schema URI here.
const LOCAL_PROTOCOL_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';

// The local-protocol schema does NOT have a `customizations` field.
// We fold labContext into `notes` as a JSON string for v1.
// TODO (spec-023): When local-protocol-compile passes are implemented,
// consider adding a `customizations` field to the schema to hold labContext
// data more structurally.
const LAB_CONTEXT_NOTES_KEY = 'labContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid local-protocol envelope from the promoted protocol
 * and the resolved labContext.
 */
function buildLocalProtocolEnvelope(params: {
  recordIdPrefix: string;
  protocolRef: string;
  protocolTitle: string;
  labContext: LabContext;
}): { envelope: Record<string, unknown>; recordId: string } {
  const recordId = `${params.recordIdPrefix}${randomUUID().replace(/-/g, '').slice(0, 8)}`;

  const envelope = {
    kind: 'local-protocol',
    recordId,
    title: `Realized: ${params.protocolTitle}`,
    inherits_from: {
      kind: 'record',
      type: 'protocol',
      id: params.protocolRef,
    },
    status: 'draft',
    protocolLayer: 'lab',
    notes: JSON.stringify({
      [LAB_CONTEXT_NOTES_KEY]: {
        labwareKind: params.labContext.labwareKind,
        plateCount: params.labContext.plateCount,
        sampleCount: params.labContext.sampleCount,
        equipmentOverrides: params.labContext.equipmentOverrides,
      },
    }),
  };

  return { envelope, recordId };
}

// ---------------------------------------------------------------------------
// Pass factory
// ---------------------------------------------------------------------------

export function createProtocolRealizePass(
  deps: CreateProtocolRealizePassDeps,
): Pass {
  const protocolPrefix = deps.recordIdPrefix?.protocol ?? DEFAULT_PROTOCOL_PREFIX;
  const localProtocolPrefix =
    deps.recordIdPrefix?.localProtocol ?? DEFAULT_LOCAL_PROTOCOL_PREFIX;

  return {
    id: 'protocol_realize',
    family: 'expand',
    async run(args: PassRunArgs): Promise<PassResult> {
      const diagnostics: PassDiagnostic[] = [];

      // ------------------------------------------------------------------
      // 1. Read upstream outputs
      // ------------------------------------------------------------------
      const extractOutput = args.state.outputs.get('protocol_extract');
      if (
        !extractOutput ||
        typeof extractOutput !== 'object' ||
        !(extractOutput as Record<string, unknown>).extractionDraftRef
      ) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'MISSING_UPSTREAM_OUTPUT',
              message:
                'protocol_realize requires upstream protocol_extract output',
              pass_id: 'protocol_realize',
            },
          ],
        };
      }

      const labContextOutput = args.state.outputs.get('lab_context_resolve');
      if (
        !labContextOutput ||
        typeof labContextOutput !== 'object' ||
        !(labContextOutput as Record<string, unknown>).labContext
      ) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'MISSING_UPSTREAM_OUTPUT',
              message:
                'protocol_realize requires upstream lab_context_resolve output',
              pass_id: 'protocol_realize',
            },
          ],
        };
      }

      const extractionDraftRef = (
        extractOutput as Record<string, unknown>
      ).extractionDraftRef as string;
      const labContext = (
        labContextOutput as Record<string, unknown>
      ).labContext as LabContext;

      // ------------------------------------------------------------------
      // 2. Load the extraction-draft record
      // ------------------------------------------------------------------
      const draftEnvelope = await deps.recordStore.get(extractionDraftRef);
      if (!draftEnvelope) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'DRAFT_NOT_FOUND',
              message: `extraction-draft record not found: ${extractionDraftRef}`,
              pass_id: 'protocol_realize',
            },
          ],
        };
      }

      const candidates =
        (draftEnvelope.payload as Record<string, unknown>)?.candidates ?? [];

      if (!Array.isArray(candidates) || candidates.length === 0) {
        return {
          ok: false,
          diagnostics: [
            {
              severity: 'error',
              code: 'NO_CANDIDATES',
              message: 'extraction-draft has no candidates to realize',
              pass_id: 'protocol_realize',
            },
          ],
        };
      }

      // ------------------------------------------------------------------
      // 3. Select a variant (auto-pick first)
      // ------------------------------------------------------------------
      const selectedCandidate = candidates[0] as Record<string, unknown>;
      const draftObj = selectedCandidate.draft as Record<string, unknown> | undefined;
      const selectedVariantLabel =
        (draftObj?.variant_label as string | undefined) ?? null;

      if (candidates.length > 1) {
        diagnostics.push({
          severity: 'info',
          code: 'protocol_realize_multivariant_auto_pick',
          message: `extraction-draft has ${candidates.length} variants; auto-picked first ('${selectedVariantLabel}'). Variant selection UX is deferred.`,
          pass_id: 'protocol_realize',
        });
      }

      // ------------------------------------------------------------------
      // 4. Promote the selected candidate to a protocol record
      // ------------------------------------------------------------------
      const promotionResult = await deps.runPromotionCompile({
        pipelinePath:
          'schema/registry/compile-pipelines/promotion-compile.yaml',
        candidate: {
          target_kind: selectedCandidate.target_kind ?? 'protocol',
          draft: draftObj ?? {},
          confidence: (selectedCandidate.confidence as number) ?? 0.5,
        },
        source_draft_id: extractionDraftRef,
        recordIdPrefix: protocolPrefix,
      });

      if (!promotionResult.ok) {
        return {
          ok: false,
          diagnostics: [
            ...diagnostics,
            {
              severity: 'error',
              code: 'PROMOTION_FAILED',
              message: `promotion failed: ${promotionResult.diagnostics.map((d) => d.message).join('; ')}`,
              pass_id: 'protocol_realize',
            },
          ],
        };
      }

      const canonicalRecord = promotionResult.canonicalRecord as
        | Record<string, unknown>
        | undefined;
      if (!canonicalRecord) {
        return {
          ok: false,
          diagnostics: [
            ...diagnostics,
            {
              severity: 'error',
              code: 'PROMOTION_NO_CANONICAL',
              message: 'promotion succeeded but produced no canonical record',
              pass_id: 'protocol_realize',
            },
          ],
        };
      }

      const protocolRef = (canonicalRecord.recordId as string) ?? '';
      const protocolTitle =
        (canonicalRecord.title as string) ??
        (draftObj?.display_name as string) ??
        (draftObj?.title as string) ??
        'Untitled';

      // ------------------------------------------------------------------
      // 5. Build and persist the local-protocol record
      // ------------------------------------------------------------------
      const { envelope: localProtocolEnvelope, recordId: localProtocolRef } =
        buildLocalProtocolEnvelope({
          recordIdPrefix: localProtocolPrefix,
          protocolRef,
          protocolTitle,
          labContext,
        });

      await deps.recordStore.create({
        envelope: localProtocolEnvelope as Record<string, unknown>,
        message: 'protocol_realize local-protocol',
      });

      // ------------------------------------------------------------------
      // 6. Return result
      // ------------------------------------------------------------------
      const output: Record<string, unknown> = {
        protocolRef,
        localProtocolRef,
      };
      if (selectedVariantLabel) {
        output.selectedVariantLabel = selectedVariantLabel;
      }

      return {
        ok: true,
        output,
        diagnostics,
      };
    },
  };
}
