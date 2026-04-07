import { buildIngestionIssueEnvelope } from '../records.js';
import type { IngestionBundlePayload, IngestionCandidatePayload, IngestionIssuePayload, IngestionJobPayload } from '../types.js';

export function createIssue(
  job: IngestionJobPayload,
  bundle: IngestionBundlePayload,
  issue: {
    severity: IngestionIssuePayload['severity'];
    issueType: IngestionIssuePayload['issue_type'];
    title: string;
    detail?: string;
    suggestedAction?: string;
    evidenceRefs?: Array<Record<string, unknown>>;
    candidate?: IngestionCandidatePayload;
  },
) {
  return buildIngestionIssueEnvelope({
    job,
    bundle,
    severity: issue.severity,
    issueType: issue.issueType,
    title: issue.title,
    ...(issue.detail ? { detail: issue.detail } : {}),
    ...(issue.suggestedAction ? { suggestedAction: issue.suggestedAction } : {}),
    ...(issue.evidenceRefs ? { evidenceRefs: issue.evidenceRefs } : {}),
    ...(issue.candidate ? { candidate: issue.candidate } : {}),
  });
}
