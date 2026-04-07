import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import { createRecordRef } from '../records.js';
import type { IngestionBundlePayload, IngestionCandidatePayload, IngestionPublishResult } from '../types.js';

const LABWARE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml';
const MATERIAL_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material.schema.yaml';
const VENDOR_PRODUCT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';
const PLATE_LAYOUT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/plate-layout-template.schema.yaml';
const DEFAULT_LABWARE_ID = 'LBW-96-WELL-PLATE-STANDARD';

function candidateData<T extends Record<string, unknown>>(candidate: RecordEnvelope<IngestionCandidatePayload>): T {
  return candidate.payload.payload as T;
}

async function ensureStandardLabware(store: RecordStore): Promise<string[]> {
  const existing = await store.get(DEFAULT_LABWARE_ID);
  if (existing) return [];
  const result = await store.create({
    envelope: {
      recordId: DEFAULT_LABWARE_ID,
      schemaId: LABWARE_SCHEMA_ID,
      payload: {
        kind: 'labware',
        recordId: DEFAULT_LABWARE_ID,
        name: 'Standard 96-well plate',
        labwareType: 'plate',
        format: {
          rows: 8,
          cols: 12,
          wellNaming: 'A1..H12',
          wellCount: 96,
        },
        tags: ['ingestion_generated', 'standard_96_well'],
      },
    },
    message: `Create standard 96-well labware ${DEFAULT_LABWARE_ID}`,
    skipLint: true,
  });
  if (!result.success) throw new Error(result.error ?? 'Failed to create standard labware');
  return [DEFAULT_LABWARE_ID];
}

export async function publishCaymanLibraryBundle(args: {
  store: RecordStore;
  bundle: RecordEnvelope<IngestionBundlePayload>;
  candidates: Array<RecordEnvelope<IngestionCandidatePayload>>;
}): Promise<IngestionPublishResult> {
  const { store, bundle, candidates } = args;
  const createdRecordIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdVendorProductIds: string[] = [];
  const createdPlateLayoutTemplateIds: string[] = [];
  const createdLabwareIds = await ensureStandardLabware(store);
  createdRecordIds.push(...createdLabwareIds);

  const materialCandidate = candidates.find((candidate) => candidate.payload.candidate_type === 'material');
  const vendorCandidate = candidates.find((candidate) => candidate.payload.candidate_type === 'vendor_product');
  const plateLayoutCandidates = candidates.filter((candidate) => candidate.payload.candidate_type === 'plate_layout');

  const materialItems = materialCandidate
    ? candidateData<{
        items?: Array<{
          id: string;
          name: string;
          domain: string;
          definition?: string;
          synonyms?: string[];
          molecular_weight?: { value: number; unit: 'g/mol' };
          chemical_properties?: {
            molecular_formula?: string;
            cas_number?: string;
            solubility?: string;
          };
        }>;
      }>(materialCandidate).items ?? []
    : [];
  for (const item of materialItems) {
    const existing = await store.get(item.id);
    if (existing) continue;
    const preferredOntologyMatch = Array.isArray((item as Record<string, unknown>).ontology_matches)
      ? (((item as Record<string, unknown>).ontology_matches as Array<Record<string, unknown>>)[0] ?? null)
      : null;
    const ontologyRef = preferredOntologyMatch && typeof preferredOntologyMatch.term_id === 'string' && typeof preferredOntologyMatch.namespace === 'string'
      ? {
          kind: 'ontology',
          id: preferredOntologyMatch.term_id,
          namespace: String(preferredOntologyMatch.namespace).toUpperCase(),
          label: typeof preferredOntologyMatch.label === 'string' ? preferredOntologyMatch.label : item.name,
          ...(typeof preferredOntologyMatch.uri === 'string' ? { uri: preferredOntologyMatch.uri } : {}),
        }
      : null;
    const ontologySynonyms = preferredOntologyMatch && Array.isArray(preferredOntologyMatch.synonyms)
      ? preferredOntologyMatch.synonyms.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const result = await store.create({
      envelope: {
        recordId: item.id,
        schemaId: MATERIAL_SCHEMA_ID,
        payload: {
          kind: 'material',
          id: item.id,
          name: item.name,
          domain: item.domain,
          ...(ontologyRef ? { class: [ontologyRef] } : {}),
          ...((item.definition || (preferredOntologyMatch && typeof preferredOntologyMatch.description === 'string'))
            ? { definition: item.definition ?? preferredOntologyMatch!.description }
            : {}),
          ...(((item.synonyms?.length ?? 0) > 0 || ontologySynonyms.length > 0)
            ? { synonyms: (item.synonyms && item.synonyms.length > 0 ? item.synonyms : ontologySynonyms).slice(0, 20) }
            : {}),
          ...(item.molecular_weight ? { molecular_weight: item.molecular_weight } : {}),
          ...(item.chemical_properties ? { chemical_properties: item.chemical_properties } : {}),
          tags: ['ingestion_generated', 'cayman_library'],
        },
      },
      message: `Publish material ${item.id} from ${bundle.recordId}`,
      skipLint: true,
    });
    if (!result.success) throw new Error(result.error ?? `Failed to create material ${item.id}`);
    createdRecordIds.push(item.id);
    createdMaterialIds.push(item.id);
  }

  const vendorItems = vendorCandidate ? candidateData<{ items?: Array<{ id: string; name: string; vendor: string; catalog_number: string; material_id: string; solvent?: string; package_sizes?: string[] }> }>(vendorCandidate).items ?? [] : [];
  for (const item of vendorItems) {
    const existing = await store.get(item.id);
    if (existing) continue;
    const result = await store.create({
      envelope: {
        recordId: item.id,
        schemaId: VENDOR_PRODUCT_SCHEMA_ID,
        payload: {
          kind: 'vendor-product',
          id: item.id,
          name: item.name,
          vendor: item.vendor,
          catalog_number: item.catalog_number,
          material_ref: createRecordRef(item.material_id, 'material', item.name),
          ...(item.package_sizes?.[0] ? { package_size: item.package_sizes[0] } : {}),
          ...(item.solvent ? { formulation: `1.0 mM in ${item.solvent}` } : {}),
        },
      },
      message: `Publish vendor product ${item.id} from ${bundle.recordId}`,
      skipLint: true,
    });
    if (!result.success) throw new Error(result.error ?? `Failed to create vendor product ${item.id}`);
    createdRecordIds.push(item.id);
    createdVendorProductIds.push(item.id);
  }

  for (const candidate of plateLayoutCandidates) {
    const payload = candidateData<{
      recordId: string;
      title: string;
      assignments: Array<{ well: string; contents: string; item_number?: string; material_id: string }>;
      default_concentration?: { value: number; unit: string };
    }>(candidate);
    const existing = await store.get(payload.recordId);
    if (existing) continue;
    const result = await store.create({
      envelope: {
        recordId: payload.recordId,
        schemaId: PLATE_LAYOUT_SCHEMA_ID,
        payload: {
          kind: 'plate-layout-template',
          recordId: payload.recordId,
          title: payload.title,
          labware_ref: createRecordRef(DEFAULT_LABWARE_ID, 'labware', 'Standard 96-well plate'),
          assignment_mode: 'explicit',
          assignments: payload.assignments.map((assignment) => ({
            selector: { kind: 'explicit', wells: [assignment.well] },
            inputs: [{
              source: 'material_ref',
              material_ref: createRecordRef(assignment.material_id, 'material', assignment.contents),
              role: 'treatment',
              ...(payload.default_concentration ? { concentration: { value: payload.default_concentration.value, unit: payload.default_concentration.unit } } : {}),
            }],
            notes: assignment.item_number ? `Cayman catalog ${assignment.item_number}` : undefined,
          })),
          tags: ['ingestion_generated', 'cayman_library'],
        },
      },
      message: `Publish plate layout ${payload.recordId} from ${bundle.recordId}`,
      skipLint: true,
    });
    if (!result.success) throw new Error(result.error ?? `Failed to create plate layout ${payload.recordId}`);
    createdRecordIds.push(payload.recordId);
    createdPlateLayoutTemplateIds.push(payload.recordId);
  }

  return {
    bundleId: bundle.recordId,
    createdRecordIds,
    createdMaterialIds,
    createdVendorProductIds,
    createdPlateLayoutTemplateIds,
    createdLabwareIds,
  };
}
