import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import { createRecordRef } from '../records.js';
import type { IngestionBundlePayload, IngestionCandidatePayload, IngestionPublishResult } from '../types.js';

const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';
const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';
const RECIPE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml';

function candidateData<T extends Record<string, unknown>>(candidate: RecordEnvelope<IngestionCandidatePayload>): T {
  return candidate.payload.payload as T;
}

export async function publishVendorFormulationBundle(args: {
  store: RecordStore;
  bundle: RecordEnvelope<IngestionBundlePayload>;
  candidates: Array<RecordEnvelope<IngestionCandidatePayload>>;
}): Promise<IngestionPublishResult> {
  const { store, bundle, candidates } = args;
  const createdRecordIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdVendorProductIds: string[] = [];
  const createdPlateLayoutTemplateIds: string[] = [];
  const createdLabwareIds: string[] = [];
  const createdMaterialSpecIds: string[] = [];
  const createdRecipeIds: string[] = [];

  const materialCandidate = candidates.find((candidate) => candidate.payload.candidate_type === 'material');
  const formulationCandidates = candidates.filter((candidate) => candidate.payload.candidate_type === 'formulation');
  const recipeCandidates = candidates.filter((candidate) => candidate.payload.candidate_type === 'recipe');

  const materialItems = materialCandidate
    ? candidateData<{ items?: Array<{ id: string; name: string; domain: string }> }>(materialCandidate).items ?? []
    : [];

  for (const item of materialItems) {
    const existing = await store.get(item.id);
    if (existing) continue;
    const result = await store.create({
      envelope: {
        recordId: item.id,
        schemaId: MATERIAL_SCHEMA_ID,
        payload: {
          kind: 'material',
          id: item.id,
          name: item.name,
          domain: item.domain,
          tags: ['ingestion_generated', 'vendor_formulation'],
        },
      },
      message: `Publish material ${item.id} from ${bundle.recordId}`,
      skipLint: true,
    });
    if (!result.success) throw new Error(result.error ?? `Failed to create material ${item.id}`);
    createdRecordIds.push(item.id);
    createdMaterialIds.push(item.id);
  }

  for (const candidate of formulationCandidates) {
    const payload = candidateData<{
      recordId: string;
      name: string;
      material_id: string;
      output?: { composition?: Array<{ component_id: string; component_name: string; role: string; concentration?: { value: number; unit: string; basis: string } }>; notes?: string };
    }>(candidate);
    const existing = await store.get(payload.recordId);
    if (existing) continue;
    const result = await store.create({
      envelope: {
        recordId: payload.recordId,
        schemaId: MATERIAL_SPEC_SCHEMA_ID,
        payload: {
          kind: 'material-spec',
          id: payload.recordId,
          name: payload.name,
          material_ref: createRecordRef(payload.material_id, 'material', payload.name),
          ...(payload.output ? {
            formulation: {
              ...(payload.output.composition ? {
                composition: payload.output.composition.map((entry) => ({
                  component_ref: createRecordRef(entry.component_id, 'material', entry.component_name),
                  role: entry.role,
                  ...(entry.concentration ? { concentration: entry.concentration } : {}),
                })),
              } : {}),
              ...(payload.output.notes ? { notes: payload.output.notes } : {}),
            },
          } : {}),
          tags: ['ingestion_generated', 'vendor_formulation'],
        },
      },
      message: `Publish material spec ${payload.recordId} from ${bundle.recordId}`,
      skipLint: true,
    });
    if (!result.success) throw new Error(result.error ?? `Failed to create material spec ${payload.recordId}`);
    createdRecordIds.push(payload.recordId);
    createdMaterialSpecIds.push(payload.recordId);
  }

  for (const candidate of recipeCandidates) {
    const payload = candidateData<{
      recordId: string;
      name: string;
      output_material_spec_id: string;
      output_material_id: string;
      output?: { composition?: Array<{ component_id: string; component_name: string; role: string; concentration?: { value: number; unit: string; basis: string } }>; notes?: string };
      input_roles?: Array<{ role_id: string; role_type: string; material_id: string; quantity?: { value: number; unit: string; basis: string } }>;
      steps?: Array<{ order: number; instruction: string }>;
    }>(candidate);
    const existing = await store.get(payload.recordId);
    if (existing) continue;
    const result = await store.create({
      envelope: {
        recordId: payload.recordId,
        schemaId: RECIPE_SCHEMA_ID,
        payload: {
          kind: 'recipe',
          id: payload.recordId,
          name: payload.name,
          input_roles: (payload.input_roles ?? []).map((role) => ({
            role_id: role.role_id,
            role_type: role.role_type,
            material_ref: createRecordRef(role.material_id, 'material', role.material_id),
            ...(role.quantity ? { quantity: { value: role.quantity.value, unit: role.quantity.unit } } : {}),
          })),
          output_material_spec_ref: createRecordRef(payload.output_material_spec_id, 'material-spec', payload.output_material_spec_id),
          ...(payload.output ? {
            output: {
              ...(payload.output.composition ? {
                composition: payload.output.composition.map((entry) => ({
                  component_ref: createRecordRef(entry.component_id, 'material', entry.component_name),
                  role: entry.role,
                  ...(entry.concentration ? { concentration: entry.concentration } : {}),
                })),
              } : {}),
              ...(payload.output.notes ? { notes: payload.output.notes } : {}),
            },
          } : {}),
          steps: (payload.steps ?? []).map((step) => ({
            order: step.order,
            instruction: step.instruction,
          })),
          tags: ['ingestion_generated', 'vendor_formulation'],
        },
      },
      message: `Publish recipe ${payload.recordId} from ${bundle.recordId}`,
      skipLint: true,
    });
    if (!result.success) throw new Error(result.error ?? `Failed to create recipe ${payload.recordId}`);
    createdRecordIds.push(payload.recordId);
    createdRecipeIds.push(payload.recordId);
  }

  return {
    bundleId: bundle.recordId,
    createdRecordIds,
    createdMaterialIds,
    createdVendorProductIds,
    createdPlateLayoutTemplateIds,
    createdLabwareIds,
    createdMaterialSpecIds,
    createdRecipeIds,
  };
}
