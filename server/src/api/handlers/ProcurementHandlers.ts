/**
 * ProcurementHandlers
 *
 * Handles the POST /planned-runs/:id/procurement/draft endpoint.
 * Derives a procurement manifest and draft budget from a planned-run,
 * persists both records, and updates the planned-run's procurement anchor.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { RecordStore, RecordEnvelope } from '../store/types.js';
import { ProcurementManifestService } from '../procurement/ProcurementManifestService.js';
import { BudgetDraftService } from '../procurement/BudgetDraftService.js';

// ---------------------------------------------------------------------------
// Request/Response shapes
// ---------------------------------------------------------------------------

interface ProcurementDraftResponse {
  success: boolean;
  manifestId: string;
  budgetId: string;
  manifestRef: { kind: string; id: string; type: string };
  budgetRef: { kind: string; id: string; type: string };
  lineCount: number;
}

// ---------------------------------------------------------------------------
// Handler interface
// ---------------------------------------------------------------------------

export interface ProcurementHandlers {
  generateProcurementDraft(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<ProcurementDraftResponse | { error: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProcurementHandlers(store: RecordStore): ProcurementHandlers {
  const manifestService = new ProcurementManifestService();
  const budgetService = new BudgetDraftService();

  return {
    async generateProcurementDraft(request, reply) {
      const { id: plannedRunId } = request.params;

      // 1. Load the planned-run
      const plannedRunEnvelope = await store.get(plannedRunId);
      if (!plannedRunEnvelope) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: `Planned run not found: ${plannedRunId}` };
      }

      const plannedRunPayload = plannedRunEnvelope.payload as Record<string, unknown>;
      const sourceType = plannedRunPayload.sourceType as string | undefined;

      // 2. Derive the procurement manifest
      const manifest = manifestService.derive(plannedRunEnvelope);

      // 3. Create the manifest record
      const manifestRecordId = `PMF-${String(Date.now()).slice(-6)}`;
      const manifestPayload: Record<string, unknown> = {
        kind: 'procurement-manifest',
        recordId: manifestRecordId,
        title: `Procurement manifest for ${plannedRunPayload.title || plannedRunId}`,
        sourceType: 'planned-run',
        sourceRef: {
          kind: 'record',
          id: plannedRunId,
          type: 'planned-run',
        },
        state: 'draft',
        lines: manifest.lines.map((l) => ({
          lineId: l.requirementId,
          materialRef: l.sourceRef
            ? { kind: 'record', id: l.sourceRef, type: l.category }
            : undefined,
          quantity: {
            value: l.quantityHint,
            unit: l.unit,
          },
          notes: l.provenanceSummary,
          priority: l.coverageStatus === 'uncovered' ? 'high' : 'medium',
          quoteStatus: 'not_requested',
        })),
        vendorSearchScope: {
          vendors: ['fisher-scientific', 'vwr', 'cayman-chemical', 'thomas-scientific'],
          searchTerms: manifest.lines.map((l) => l.description),
        },
        derivedAt: manifest.derivedAt,
      };

      const manifestResult = await store.create({
        envelope: {
          recordId: manifestRecordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/procurement-manifest.schema.yaml',
          payload: manifestPayload,
        },
        message: `Generate procurement manifest for planned run ${plannedRunId}`,
      });

      if (!manifestResult.success) {
        reply.status(500);
        return { error: 'MANIFEST_SAVE_FAILED', message: manifestResult.error ?? 'Failed to save manifest' };
      }

      // 4. Create the draft budget from the manifest
      const budgetRecordId = `BUD-${String(Date.now()).slice(-6)}`;
      const draft = budgetService.createFromManifest(manifest, budgetRecordId);

      const budgetPayload: Record<string, unknown> = {
        kind: 'budget',
        recordId: budgetRecordId,
        title: `Budget for ${plannedRunPayload.title || plannedRunId}`,
        sourceType: 'procurement-manifest',
        sourceRef: {
          kind: 'record',
          id: manifestRecordId,
          type: 'procurement-manifest',
        },
        state: 'draft',
        currency: 'USD',
        lines: draft.lines.map((l) => ({
          lineId: l.lineId,
          requirementId: l.requirementId,
          suggestedPackageCount: l.suggestedPackageCount,
          unit: l.unit,
          description: l.description,
          provenance: l.provenance,
          selectedOfferRef: l.selectedOfferRef,
          unitPrice: l.unitPrice,
          totalPrice: l.totalPrice,
          approved: l.approved,
          ...(l.notes ? { notes: l.notes } : {}),
        })),
        summary: {
          lineCount: draft.lines.length,
          approvedLineCount: 0,
          grandTotal: 0,
        },
      };

      const budgetResult = await store.create({
        envelope: {
          recordId: budgetRecordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/budget.schema.yaml',
          payload: budgetPayload,
        },
        message: `Generate draft budget for planned run ${plannedRunId}`,
      });

      if (!budgetResult.success) {
        reply.status(500);
        return { error: 'BUDGET_SAVE_FAILED', message: budgetResult.error ?? 'Failed to save budget' };
      }

      // 5. Update the planned-run's procurement anchor
      const updatedPlannedRunPayload = {
        ...plannedRunPayload,
        procurement: {
          ...(plannedRunPayload.procurement as Record<string, unknown> | undefined),
          manifestRef: {
            kind: 'record',
            id: manifestRecordId,
            type: 'procurement-manifest',
          },
          budgetRef: {
            kind: 'record',
            id: budgetRecordId,
            type: 'budget',
          },
          quoteStatus: 'not_requested',
          lastQuotedAt: new Date().toISOString(),
        },
      };

      await store.update({
        envelope: {
          recordId: plannedRunId,
          schemaId: plannedRunEnvelope.schemaId,
          payload: updatedPlannedRunPayload,
        },
        message: `Update procurement anchor for planned run ${plannedRunId}`,
      });

      // 6. Return the response
      return {
        success: true,
        manifestId: manifestRecordId,
        budgetId: budgetRecordId,
        manifestRef: {
          kind: 'record',
          id: manifestRecordId,
          type: 'procurement-manifest',
        },
        budgetRef: {
          kind: 'record',
          id: budgetRecordId,
          type: 'budget',
        },
        lineCount: manifest.lines.length,
      };
    },
  };
}
