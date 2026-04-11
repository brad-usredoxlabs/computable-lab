import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import { buildIngestionBundleEnvelope, buildIngestionCandidateEnvelope, createSourceRef } from '../records.js';
import type { CaymanPlateExtraction } from '../adapters/caymanPlateMapPdf.js';
import { MaterialMatchService } from '../matching/MaterialMatchService.js';
import { OntologyMatchService } from '../matching/OntologyMatchService.js';
import { createIssue } from '../issues/IssueBuilder.js';
import type {
  IngestionArtifactPayload,
  IngestionBundlePayload,
  IngestionCandidatePayload,
  IngestionIssuePayload,
  IngestionJobPayload,
} from '../types.js';

const PLATE_LAYOUT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/plate-layout-template.schema.yaml';

function slug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export interface CaymanPipelineResult {
  bundle: RecordEnvelope<IngestionBundlePayload>;
  candidates: Array<RecordEnvelope<IngestionCandidatePayload>>;
  issues: Array<RecordEnvelope<IngestionIssuePayload>>;
}

export interface CaymanPipelineProgressUpdate {
  phase: 'normalize' | 'match' | 'build_candidates';
  current: number;
  total: number;
  unit: string;
  message: string;
}

export async function buildCaymanLibraryBundle(args: {
  store: RecordStore;
  job: IngestionJobPayload;
  artifact: IngestionArtifactPayload;
  extraction: CaymanPlateExtraction;
  onProgress?: (progress: CaymanPipelineProgressUpdate) => Promise<void>;
}): Promise<CaymanPipelineResult> {
  const { store, job, artifact, extraction, onProgress } = args;
  const matchService = new MaterialMatchService(store);
  const ontologyMatchService = new OntologyMatchService();
  const ontologyPreferences = Array.isArray(job.ontology_preferences) ? job.ontology_preferences : [];
  const metadataByItemNumber = new Map(
    (extraction.materialMetadata ?? [])
      .filter((entry) => entry.itemNumber)
      .map((entry) => [entry.itemNumber!, entry]),
  );
  const metadataByNormalizedName = new Map(
    (extraction.materialMetadata ?? []).map((entry) => [entry.normalizedName.toLowerCase(), entry]),
  );
  const fileName = artifact.file_ref && typeof artifact.file_ref === 'object' && typeof (artifact.file_ref as Record<string, unknown>).file_name === 'string'
    ? ((artifact.file_ref as Record<string, unknown>).file_name as string)
    : extraction.title;
  const sourceRef = createSourceRef(artifact.id, fileName);

  const bundle = buildIngestionBundleEnvelope({
    job,
    title: extraction.title,
    bundleType: 'screening_library',
    summary: `${extraction.uniquePlateNumbers.length} plates detected, ${extraction.uniqueMaterialCount} compounds parsed, ${extraction.unusedWellCount} unused wells preserved.`,
    metrics: {
      plates_detected: extraction.uniquePlateNumbers.length,
      wells_detected: extraction.entries.length,
      unused_wells_detected: extraction.unusedWellCount,
      materials_detected: extraction.uniqueMaterialCount,
    },
    publishPlan: {
      target_kinds: ['material', 'vendor-product', 'plate-layout-template', 'labware'],
      requires_review: true,
    },
  });

  const candidates: Array<RecordEnvelope<IngestionCandidatePayload>> = [];
  const issues: Array<RecordEnvelope<IngestionIssuePayload>> = [];

  const uniqueMaterials = new Map<string, {
    id: string;
    name: string;
    domain: string;
    source_name: string;
    item_number?: string;
    page_number: number;
    well: string;
    confidence?: number;
    local_matches?: Array<Record<string, unknown>>;
    ontology_matches?: Array<Record<string, unknown>>;
    definition?: string;
    synonyms?: string[];
    molecular_weight?: { value: number; unit: 'g/mol' };
    chemical_properties?: Record<string, unknown>;
  }>();

  const uniqueVendorProducts = new Map<string, {
    id: string;
    name: string;
    vendor: string;
    catalog_number: string;
    material_id: string;
    solvent: string;
    package_sizes: string[];
  }>();

  for (const entry of extraction.entries) {
    if (entry.normalizationChanges.length > 0) {
      issues.push(createIssue(job, bundle.payload, {
        severity: 'info',
        issueType: 'symbol_normalization_changed',
        title: `Normalized symbols for ${entry.rawContents}`,
        detail: `Stored as "${entry.normalizedContents}" after symbol normalization.`,
        evidenceRefs: [{ ...sourceRef, page: entry.pageNumber, row_label: entry.well }],
      }));
    }
    if (entry.unused) continue;

    const materialKey = entry.normalizedContents.toLowerCase();
    if (!uniqueMaterials.has(materialKey)) {
      const spreadsheetMetadata = (entry.itemNumber ? metadataByItemNumber.get(entry.itemNumber) : undefined)
        ?? metadataByNormalizedName.get(entry.normalizedContents.toLowerCase());
      uniqueMaterials.set(materialKey, {
        id: `MAT-${slug(entry.normalizedContents)}`,
        name: entry.normalizedContents,
        domain: 'chemical',
        source_name: entry.rawContents,
        page_number: entry.pageNumber,
        well: entry.well,
        ...(entry.itemNumber ? { item_number: entry.itemNumber } : {}),
        ...(spreadsheetMetadata?.definition ? { definition: spreadsheetMetadata.definition } : {}),
        ...(spreadsheetMetadata?.synonyms?.length ? { synonyms: spreadsheetMetadata.synonyms } : {}),
        ...(spreadsheetMetadata?.molecularWeight ? { molecular_weight: spreadsheetMetadata.molecularWeight } : {}),
        ...(spreadsheetMetadata?.chemicalProperties ? { chemical_properties: spreadsheetMetadata.chemicalProperties } : {}),
      });
    }
    if (entry.itemNumber && !uniqueVendorProducts.has(entry.itemNumber)) {
      uniqueVendorProducts.set(entry.itemNumber, {
        id: `VPR-CAYMAN-${entry.itemNumber}`,
        name: entry.normalizedContents,
        vendor: 'Cayman Chemical',
        catalog_number: entry.itemNumber,
        material_id: `MAT-${slug(entry.normalizedContents)}`,
        solvent: extraction.solvent,
        package_sizes: extraction.packageSizes,
      });
    }
    if (!entry.itemNumber) {
      issues.push(createIssue(job, bundle.payload, {
        severity: 'warning',
        issueType: 'missing_vendor_identifier',
        title: `Missing item number for ${entry.normalizedContents}`,
        detail: `Plate ${entry.plateNumber} ${entry.well} did not include a Cayman catalog number.`,
        evidenceRefs: [{ ...sourceRef, page: entry.pageNumber, row_label: entry.well }],
      }));
    }
  }

  if (onProgress) {
    await onProgress({
      phase: 'normalize',
      current: uniqueMaterials.size,
      total: uniqueMaterials.size,
      unit: 'compounds',
      message: `Prepared ${uniqueMaterials.size} unique compounds for matching`,
    });
  }

  const uniqueMaterialEntries = Array.from(uniqueMaterials.entries());
  const matchBatchSize = 12;
  let matchedCount = 0;
  for (let index = 0; index < uniqueMaterialEntries.length; index += matchBatchSize) {
    const batch = uniqueMaterialEntries.slice(index, index + matchBatchSize);
    await Promise.all(batch.map(async ([materialKey, material]) => {
      const [localMatches, ontologyMatches] = await Promise.all([
        matchService.findMatches(material.name),
        ontologyMatchService.findMatches(material.name, ontologyPreferences),
      ]);
      uniqueMaterials.set(materialKey, {
        ...material,
        confidence: ontologyMatches[0]?.score ?? localMatches[0]?.score ?? 0.7,
        local_matches: localMatches.map((match) => ({
          namespace: 'local',
          term_id: match.id,
          label: match.label,
          match_type: match.matchType,
          score: match.score,
        })),
        ontology_matches: ontologyMatches.map((match) => ({
          namespace: match.namespace,
          ontology: match.ontology,
          term_id: match.id,
          label: match.label,
          uri: match.uri,
          description: match.description,
          synonyms: match.synonyms,
          match_type: match.matchType,
          score: match.score,
        })),
      });
      if (ontologyMatches.length === 0) {
          issues.push(createIssue(job, bundle.payload, {
            severity: 'warning',
            issueType: 'other',
            title: `No ontology match found for ${material.name}`,
            detail: `No ontology match was found for "${material.name}" using preferences ${ontologyPreferences.join(', ') || 'none'}.`,
            suggestedAction: 'Review the parsed name or add a local material override before publish.',
            evidenceRefs: [{ ...sourceRef, page: material.page_number, row_label: material.well }],
          }));
      } else if (ontologyMatches.length > 1 && ontologyMatches[0] && ontologyMatches[1] && ontologyMatches[0].score - ontologyMatches[1].score < 0.05) {
        issues.push(createIssue(job, bundle.payload, {
          severity: 'warning',
          issueType: 'ontology_match_ambiguous',
          title: `Ontology match needs review for ${material.name}`,
          detail: `Top ontology matches were close in score for "${material.name}". Preferred result: ${ontologyMatches[0].id}.`,
          suggestedAction: 'Confirm the preferred ontology term before publish.',
          evidenceRefs: [{ ...sourceRef, page: material.page_number, row_label: material.well }],
        }));
      }
    }));
    matchedCount += batch.length;
    if (onProgress) {
      await onProgress({
        phase: 'match',
        current: matchedCount,
        total: uniqueMaterialEntries.length,
        unit: 'compounds',
        message: `Matched ${matchedCount} of ${uniqueMaterialEntries.length} compounds`,
      });
    }
  }

  candidates.push(buildIngestionCandidateEnvelope({
    job,
    bundle: bundle.payload,
    candidateType: 'material',
    title: `${extraction.title} parsed materials`,
    confidence: 0.92,
    sourceRefs: [{ ...sourceRef, page: 1 }],
    proposedRecordKind: 'material',
    proposedSchemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      items: Array.from(uniqueMaterials.values()),
    },
  }));
  if (onProgress) {
    await onProgress({
      phase: 'build_candidates',
      current: 1,
      total: 2 + (extraction.uniquePlateNumbers.length * 2),
      unit: 'candidates',
      message: 'Built material candidate set',
    });
  }

  candidates.push(buildIngestionCandidateEnvelope({
    job,
    bundle: bundle.payload,
    candidateType: 'vendor_product',
    title: `${extraction.title} vendor catalog members`,
    confidence: 0.95,
    sourceRefs: [{ ...sourceRef, page: 1 }],
    proposedRecordKind: 'vendor-product',
    proposedSchemaId: 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml',
    payload: {
      items: Array.from(uniqueVendorProducts.values()),
      declared_concentration: extraction.defaultConcentration,
    },
  }));
  if (onProgress) {
    await onProgress({
      phase: 'build_candidates',
      current: 2,
      total: 2 + (extraction.uniquePlateNumbers.length * 2),
      unit: 'candidates',
      message: 'Built vendor product candidate set',
    });
  }

  let builtCandidateCount = 2;
  for (const plateNumber of extraction.uniquePlateNumbers) {
    const plateEntries = extraction.entries.filter((entry) => entry.plateNumber === plateNumber);
    const assigned = plateEntries.filter((entry) => !entry.unused);
    const unusedWells = plateEntries.filter((entry) => entry.unused).map((entry) => entry.well).sort();

    candidates.push(buildIngestionCandidateEnvelope({
      job,
      bundle: bundle.payload,
      candidateType: 'well_assignment',
      title: `${extraction.title} — Plate ${plateNumber} well assignments`,
      confidence: 0.98,
      sourceRefs: [{ ...sourceRef, page: plateEntries[0]?.pageNumber ?? 1 }],
      payload: {
        plate_number: plateNumber,
        items: assigned.map((entry) => ({
          well: entry.well,
          item_number: entry.itemNumber,
          contents: entry.normalizedContents,
          material_id: `MAT-${slug(entry.normalizedContents)}`,
        })),
        unused_wells: unusedWells,
      },
    }));
    builtCandidateCount += 1;
    if (onProgress) {
      await onProgress({
        phase: 'build_candidates',
        current: builtCandidateCount,
        total: 2 + (extraction.uniquePlateNumbers.length * 2),
        unit: 'candidates',
        message: `Built plate ${plateNumber} well assignments`,
      });
    }

    candidates.push(buildIngestionCandidateEnvelope({
      job,
      bundle: bundle.payload,
      candidateType: 'plate_layout',
      title: `${extraction.title} — Plate ${plateNumber}`,
      confidence: 0.95,
      sourceRefs: [{ ...sourceRef, page: plateEntries[0]?.pageNumber ?? 1 }],
      proposedRecordKind: 'plate-layout-template',
      proposedSchemaId: PLATE_LAYOUT_SCHEMA_ID,
      payload: {
        kind: 'plate-layout-template',
        recordId: `PLT-CAYMAN-${plateNumber}`,
        title: `${extraction.title} — Plate ${plateNumber}`,
        labware_record_id: 'LBW-96-WELL-PLATE-STANDARD',
        plate_number: plateNumber,
        solvent: extraction.solvent,
        default_concentration: extraction.defaultConcentration,
        unused_wells: unusedWells,
        assignments: assigned.map((entry) => ({
          well: entry.well,
          item_number: entry.itemNumber,
          contents: entry.normalizedContents,
          material_id: `MAT-${slug(entry.normalizedContents)}`,
        })),
      },
    }));
    builtCandidateCount += 1;
    if (onProgress) {
      await onProgress({
        phase: 'build_candidates',
        current: builtCandidateCount,
        total: 2 + (extraction.uniquePlateNumbers.length * 2),
        unit: 'candidates',
        message: `Built plate ${plateNumber} layout candidate`,
      });
    }

    if (plateEntries.length !== 96) {
      issues.push(createIssue(job, bundle.payload, {
        severity: 'warning',
        issueType: 'table_parse_gap',
        title: `Plate ${plateNumber} did not resolve to 96 wells`,
        detail: `Parsed ${plateEntries.length} wells for plate ${plateNumber}.`,
        suggestedAction: 'Review the source PDF rows before publish.',
        evidenceRefs: [{ ...sourceRef, page: plateEntries[0]?.pageNumber ?? 1 }],
      }));
    }
  }

  if (extraction.uniquePlateNumbers.length !== 13) {
    issues.push(createIssue(job, bundle.payload, {
      severity: 'warning',
      issueType: 'table_parse_gap',
      title: 'Expected 13 plates in Cayman library',
      detail: `Parsed ${extraction.uniquePlateNumbers.length} distinct plates instead of 13.`,
      suggestedAction: 'Review missing or malformed pages before publish.',
      evidenceRefs: [{ ...sourceRef, page: 1 }],
    }));
  }

  bundle.payload.candidate_refs = candidates.map((candidate) => ({
    kind: 'record',
    id: candidate.recordId,
    type: 'ingestion-candidate',
    label: candidate.payload.title,
  }));
  bundle.payload.issue_refs = issues.map((issue) => ({
    kind: 'record',
    id: issue.recordId,
    type: 'ingestion-issue',
    label: issue.payload.title,
  }));
  bundle.payload.metrics = {
    ...(bundle.payload.metrics ?? {}),
    issues_open: issues.length,
    issues_blocking: issues.filter((issue) => issue.payload.severity === 'error').length,
  };

  return { bundle, candidates, issues };
}
