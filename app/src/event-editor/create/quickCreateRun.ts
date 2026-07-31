/**
 * quickCreateRun — creates a run record via POST /api/records and returns
 * the recordId + default title. Bypasses the TapTab RecordCreatePanel.
 *
 * The default name is date-based: "2026-07-30 Run" (recency sortable).
 * If a protocolName is provided, it becomes "2026-07-30 <protocolName>".
 *
 * The recordId follows the existing convention: RUN-<slug>-<rand4>.
 */

import { apiClient } from '../../shared/api/client'

const RUN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/run.schema.yaml'

function slugify(text: string, max: number): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, max)
}

function generateRunId(title: string): string {
  const slug = slugify(title, 24) || 'untitled'
  const rand = Math.random().toString(36).slice(2, 6)
  return `RUN-${slug}-${rand}`
}

function todayDateStr(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export interface QuickCreateRunResult {
  recordId: string
  title: string
}

export async function quickCreateRun(options: {
  studyId: string
  experimentId?: string
  protocolName?: string
}): Promise<QuickCreateRunResult> {
  const dateStr = todayDateStr()
  const title = options.protocolName
    ? `${dateStr} ${options.protocolName}`
    : `${dateStr} Run`

  const recordId = generateRunId(title)
  const shortSlug = slugify(title, 30)

  const payload: Record<string, unknown> = {
    kind: 'run',
    recordId,
    studyId: options.studyId,
    status: 'planned',
    title,
    shortSlug,
  }

  // experimentId is optional — only include if provided (exactOptionalPropertyTypes)
  if (options.experimentId) {
    payload.experimentId = options.experimentId
  }

  await apiClient.createRecord(RUN_SCHEMA_ID, payload)

  return { recordId, title }
}
