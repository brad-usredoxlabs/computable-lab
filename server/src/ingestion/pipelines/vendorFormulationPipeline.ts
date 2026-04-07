import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import { buildIngestionBundleEnvelope, buildIngestionCandidateEnvelope, createSourceRef } from '../records.js';
import type { VendorFormulationExtraction } from '../adapters/vendorFormulationHtml.js';
import { MaterialMatchService } from '../matching/MaterialMatchService.js';
import { createIssue } from '../issues/IssueBuilder.js';
import type {
  IngestionArtifactPayload,
  IngestionBundlePayload,
  IngestionCandidatePayload,
  IngestionIssuePayload,
  IngestionJobPayload,
} from '../types.js';

const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';
const RECIPE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml';

function slug(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'INGEST';
}

function outputMaterialId(label: string): string {
  return `MAT-${slug(label)}`;
}

function roleId(name: string, index: number): string {
  const core = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return core ? `${core}-${index + 1}` : `component-${index + 1}`;
}

export interface VendorFormulationPipelineResult {
  bundle: RecordEnvelope<IngestionBundlePayload>;
  candidates: Array<RecordEnvelope<IngestionCandidatePayload>>;
  issues: Array<RecordEnvelope<IngestionIssuePayload>>;
}

export async function buildVendorFormulationBundle(args: {
  store: RecordStore;
  job: IngestionJobPayload;
  artifact: IngestionArtifactPayload;
  extraction: VendorFormulationExtraction;
}): Promise<VendorFormulationPipelineResult> {
  const { store, job, artifact, extraction } = args;
  const matchService = new MaterialMatchService(store);
  const fileName = artifact.file_ref && typeof artifact.file_ref === 'object' && typeof (artifact.file_ref as Record<string, unknown>).file_name === 'string'
    ? ((artifact.file_ref as Record<string, unknown>).file_name as string)
    : extraction.title;
  const sourceRef = createSourceRef(artifact.id, fileName);

  const bundle = buildIngestionBundleEnvelope({
    job,
    title: extraction.title,
    bundleType: 'formulation_family',
    summary: `${extraction.variants.length} formulation variants found from ${extraction.vendor}.`,
    metrics: {
      variants_detected: extraction.variants.length,
    },
    publishPlan: {
      target_kinds: ['material', 'material-spec', 'recipe'],
      requires_review: true,
    },
  });

  const candidates: Array<RecordEnvelope<IngestionCandidatePayload>> = [];
  const issues: Array<RecordEnvelope<IngestionIssuePayload>> = [];
  const uniqueMaterials = new Map<string, {
    id: string;
    name: string;
    domain: string;
    confidence: number;
    matches: Array<Record<string, unknown>>;
  }>();

  if (extraction.variants.length === 0) {
    issues.push(createIssue(job, bundle.payload, {
      severity: 'error',
      issueType: 'publish_blocker',
      title: 'No formulation variants detected',
      detail: 'The HTML source did not yield any publishable formulation variants.',
      suggestedAction: 'Review the source URL or upload a saved HTML snapshot for parsing.',
      evidenceRefs: [{ ...sourceRef }],
    }));
  }

  const variantLabels = new Set<string>();
  for (const variant of extraction.variants) {
    if (variantLabels.has(variant.label.toLowerCase())) {
      issues.push(createIssue(job, bundle.payload, {
        severity: 'warning',
        issueType: 'variant_grouping_uncertain',
        title: `Duplicate variant label ${variant.label}`,
        detail: 'Multiple sections collapsed to the same variant label.',
        suggestedAction: 'Review variant grouping before publish.',
        evidenceRefs: [{ ...sourceRef }],
      }));
    }
    variantLabels.add(variant.label.toLowerCase());

    if (variant.ingredients.length === 0) {
      issues.push(createIssue(job, bundle.payload, {
        severity: 'error',
        issueType: 'publish_blocker',
        title: `Variant ${variant.label} has no ingredients`,
        detail: 'A variant section was detected without any extractable ingredient rows.',
        suggestedAction: 'Review the source HTML structure before publish.',
        evidenceRefs: [{ ...sourceRef }],
      }));
      continue;
    }

    const outputName = variant.label;
    const outputMaterial = {
      id: outputMaterialId(outputName),
      name: outputName,
      domain: 'media',
      confidence: 0.95,
      matches: [] as Array<Record<string, unknown>>,
    };
    if (!uniqueMaterials.has(outputMaterial.id)) uniqueMaterials.set(outputMaterial.id, outputMaterial);

    const composition = [];
    const inputRoles = [];

    for (const [index, ingredient] of variant.ingredients.entries()) {
      const materialId = outputMaterialId(ingredient.componentName);
      if (!uniqueMaterials.has(materialId)) {
        const matches = await matchService.findMatches(ingredient.componentName);
        uniqueMaterials.set(materialId, {
          id: materialId,
          name: ingredient.componentName,
          domain: 'chemical',
          confidence: matches[0]?.score ?? 0.6,
          matches: matches.map((match) => ({
            namespace: 'local',
            term_id: match.id,
            label: match.label,
            match_type: match.matchType,
            score: match.score,
          })),
        });
        if (matches.length === 0) {
          issues.push(createIssue(job, bundle.payload, {
            severity: 'warning',
            issueType: 'ontology_match_ambiguous',
            title: `No local match for ${ingredient.componentName}`,
            detail: `The ingredient "${ingredient.componentName}" will publish as a new local material unless matched manually.`,
            suggestedAction: 'Review ontology-backed naming before publish.',
            evidenceRefs: [{ ...sourceRef, row_label: `${variant.label} row ${ingredient.rowIndex + 1}` }],
          }));
        }
      }
      if (/hydrate|anhydrous|salt/i.test(ingredient.componentName)) {
        issues.push(createIssue(job, bundle.payload, {
          severity: 'warning',
          issueType: 'name_ambiguity',
          title: `Check chemical form for ${ingredient.componentName}`,
          detail: 'Salt or hydrate naming often needs scientific review.',
          suggestedAction: 'Confirm the exact ontology-backed material form before publish.',
          evidenceRefs: [{ ...sourceRef, row_label: `${variant.label} row ${ingredient.rowIndex + 1}` }],
        }));
      }
      if (!ingredient.concentration) {
        issues.push(createIssue(job, bundle.payload, {
          severity: 'warning',
          issueType: 'other',
          title: `Unparsed quantity for ${ingredient.componentName}`,
          detail: `The amount "${ingredient.amountText}" could not be mapped to a supported concentration unit.`,
          suggestedAction: 'Review this ingredient amount before publish.',
          evidenceRefs: [{ ...sourceRef, row_label: `${variant.label} row ${ingredient.rowIndex + 1}` }],
        }));
      }
      composition.push({
        component_id: materialId,
        component_name: ingredient.componentName,
        role: ingredient.role,
        ...(ingredient.concentration ? { concentration: ingredient.concentration } : {}),
      });
      inputRoles.push({
        role_id: roleId(ingredient.componentName, index),
        role_type: ingredient.role === 'solvent' ? 'solvent' : ingredient.role,
        material_id: materialId,
        quantity_text: ingredient.amountText,
        ...(ingredient.concentration ? { quantity: ingredient.concentration } : {}),
      });
    }

    const materialSpecId = `MSP-${slug(outputName)}`;
    const recipeId = `RCP-${slug(outputName)}`;

    candidates.push(buildIngestionCandidateEnvelope({
      job,
      bundle: bundle.payload,
      candidateType: 'formulation',
      title: outputName,
      confidence: 0.9,
      normalizedName: outputName,
      sourceRefs: [{ ...sourceRef }],
      proposedRecordKind: 'material-spec',
      proposedSchemaId: MATERIAL_SPEC_SCHEMA_ID,
      payload: {
        recordId: materialSpecId,
        material_id: outputMaterial.id,
        name: outputName,
        variant_label: variant.label,
        output: {
          composition,
          notes: `Imported from ${extraction.vendor} formulation source`,
        },
        provenance_summary: {
          vendor: extraction.vendor,
          source_section: variant.sourceSection,
        },
      },
    }));

    candidates.push(buildIngestionCandidateEnvelope({
      job,
      bundle: bundle.payload,
      candidateType: 'recipe',
      title: `Prepare ${outputName}`,
      confidence: 0.88,
      normalizedName: outputName,
      sourceRefs: [{ ...sourceRef }],
      proposedRecordKind: 'recipe',
      proposedSchemaId: RECIPE_SCHEMA_ID,
      payload: {
        recordId: recipeId,
        name: `Prepare ${outputName}`,
        variant_label: variant.label,
        output_material_spec_id: materialSpecId,
        output_material_id: outputMaterial.id,
        output: {
          composition,
          notes: `Imported from ${extraction.vendor} formulation source`,
        },
        input_roles: inputRoles,
        steps: [
          {
            order: 1,
            instruction: `Prepare ${outputName} using the vendor-listed formulation components.`,
          },
        ],
      },
    }));
  }

  candidates.unshift(buildIngestionCandidateEnvelope({
    job,
    bundle: bundle.payload,
    candidateType: 'material',
    title: `${extraction.title} materials`,
    confidence: 0.9,
    sourceRefs: [{ ...sourceRef }],
    proposedRecordKind: 'material',
    proposedSchemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      items: Array.from(uniqueMaterials.values()),
    },
  }));

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
    materials_detected: uniqueMaterials.size,
    issues_open: issues.length,
    issues_blocking: issues.filter((issue) => issue.payload.severity === 'error').length,
  };

  return { bundle, candidates, issues };
}
