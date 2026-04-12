import type { RecordEnvelope } from '../../store/types.js';
import { buildIngestionBundleEnvelope, buildIngestionCandidateEnvelope, buildIngestionIssueEnvelope, createSourceRef } from '../records.js';
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
import type { SpecDrivenExtractionOutput } from '../adapters/specDrivenExtractor.js';

/**
 * Build ingestion candidates and issues from AI-assisted extraction results
 */
export async function buildAiAssistedBundle(
  extraction: SpecDrivenExtractionOutput,
  _spec: Record<string, unknown>,
  matchService: MaterialMatchService,
  _materialMatchService: MaterialMatchService,
  ontologyMatchService: OntologyMatchService,
  _jobId: string,
  job: IngestionJobPayload,
  artifact: IngestionArtifactPayload,
): Promise<{
  bundle: RecordEnvelope<IngestionBundlePayload>;
  candidates: Array<RecordEnvelope<IngestionCandidatePayload>>;
  issues: Array<RecordEnvelope<IngestionIssuePayload>>;
}> {
  const candidates: Array<RecordEnvelope<IngestionCandidatePayload>> = [];
  const issues: Array<RecordEnvelope<IngestionIssuePayload>> = [];
  const ontologyPreferences = Array.isArray(job.ontology_preferences) ? job.ontology_preferences : [];

  // Create source ref from artifact
  const fileName = artifact.file_ref && typeof artifact.file_ref === 'object' && typeof (artifact.file_ref as Record<string, unknown>).file_name === 'string'
    ? ((artifact.file_ref as Record<string, unknown>).file_name as string)
    : 'unknown';
  const sourceRef = createSourceRef(artifact.id, fileName);

  // First, create the bundle so we can reference it in issues and candidates
  const bundleTitle = `AI-assisted extraction from ${fileName}`;
  const bundle = buildIngestionBundleEnvelope({
    job,
    title: bundleTitle,
    bundleType: 'other',
    summary: `Extracted ${extraction.totalRows} rows with ${extraction.totalIssues} issues from AI analysis.`,
    metrics: {
      rows_extracted: extraction.totalRows,
      issues_found: extraction.totalIssues,
      candidates_created: 0, // Will be updated after candidates are created
    },
    publishPlan: {
      target_kinds: Array.from(new Set(extraction.results.map(r => r.recordKind))),
      requires_review: true,
    },
  });

  // Process each extraction result
  for (const result of extraction.results) {
    const { targetSchema, recordKind, rows, issues: extractionIssues } = result;

    // Add extraction issues
    for (const issue of extractionIssues) {
      issues.push(buildIngestionIssueEnvelope({
        job,
        bundle: bundle.payload,
        severity: issue.severity,
        issueType: 'other',
        title: `Extraction issue: ${issue.type}`,
        detail: issue.message,
        suggestedAction: 'Review the extraction result and adjust the spec if needed.',
      }));
    }

    // Check if this target is for lab/material schema (needs ontology matching)
    const isMaterialTarget = targetSchema.includes('material') || recordKind === 'material';

    // Group rows by their key fields for deduplication
    const rowGroups = new Map<string, Array<{ row: typeof rows[0]; index: number }>>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      // Create a key from the main identifier field(s)
      const keyParts: string[] = [];
      
      // Look for common identifier fields
      if (row.fields.name) keyParts.push(String(row.fields.name));
      if (row.fields.id) keyParts.push(String(row.fields.id));
      if (row.fields.catalog_number) keyParts.push(String(row.fields.catalog_number));
      
      const key = keyParts.length > 0 ? keyParts.join('|') : `row-${i}`;
      
      if (!rowGroups.has(key)) {
        rowGroups.set(key, []);
      }
      rowGroups.get(key)!.push({ row, index: i });
    }

    // Create candidates for each group
    for (const [key, group] of rowGroups) {
      const firstRow = group[0]!.row;
      const payload: Record<string, unknown> = { ...firstRow.fields };

      // Run ontology matching for material targets
      if (isMaterialTarget && firstRow.fields.name) {
        const name = String(firstRow.fields.name);
        const [localMatches, ontologyMatches] = await Promise.all([
          matchService.findMatches(name),
          ontologyMatchService.findMatches(name, ontologyPreferences),
        ]);

        payload.local_matches = localMatches.map((match) => ({
          namespace: 'local',
          term_id: match.id,
          label: match.label,
          match_type: match.matchType,
          score: match.score,
        }));

        payload.ontology_matches = ontologyMatches.map((match) => ({
          namespace: match.namespace,
          ontology: match.ontology,
          term_id: match.id,
          label: match.label,
          uri: match.uri,
          description: match.description,
          synonyms: match.synonyms,
          match_type: match.matchType,
          score: match.score,
        }));

        // Add issue if no ontology match found
        if (ontologyMatches.length === 0) {
          issues.push(createIssue(job, bundle.payload, {
            severity: 'warning',
            issueType: 'other',
            title: `No ontology match found for ${name}`,
            detail: `No ontology match was found for "${name}" using preferences ${ontologyPreferences.join(', ') || 'none'}.`,
            suggestedAction: 'Review the parsed name or add a local material override before publish.',
            evidenceRefs: [sourceRef],
          }));
        } else if (ontologyMatches.length > 1 && ontologyMatches[0] && ontologyMatches[1] && ontologyMatches[0].score - ontologyMatches[1].score < 0.05) {
          issues.push(createIssue(job, bundle.payload, {
            severity: 'warning',
            issueType: 'ontology_match_ambiguous',
            title: `Ontology match needs review for ${name}`,
            detail: `Top ontology matches were close in score for "${name}". Preferred result: ${ontologyMatches[0].id}.`,
            suggestedAction: 'Confirm the preferred ontology term before publish.',
            evidenceRefs: [sourceRef],
          }));
        }
      }

      // Determine candidate type based on record kind
      let candidateType: 'material' | 'vendor_product' | 'formulation' | 'recipe' | 'plate_layout' | 'labware_instance' | 'well_assignment' = 'other' as any;
      
      if (recordKind === 'material') candidateType = 'material';
      else if (recordKind === 'vendor-product') candidateType = 'vendor_product';
      else if (recordKind === 'formulation') candidateType = 'formulation';
      else if (recordKind === 'recipe') candidateType = 'recipe';
      else if (recordKind === 'plate-layout-template') candidateType = 'plate_layout';
      else if (recordKind === 'labware') candidateType = 'labware_instance';
      else if (recordKind === 'well-assignment') candidateType = 'well_assignment';

      const candidateTitle = `${recordKind}: ${payload.name || payload.id || key}`;

      candidates.push(buildIngestionCandidateEnvelope({
        job,
        bundle: bundle.payload,
        candidateType,
        title: candidateTitle,
        confidence: 0.85,
        sourceRefs: [sourceRef],
        proposedRecordKind: recordKind,
        proposedSchemaId: targetSchema,
        payload,
      }));
    }
  }

  // Update bundle metrics with actual candidate count
  bundle.payload.metrics = {
    ...bundle.payload.metrics,
    candidates_created: candidates.length,
  };

  // Link candidates and issues to the bundle
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

  return {
    bundle,
    candidates,
    issues,
  };
}

export default buildAiAssistedBundle;
