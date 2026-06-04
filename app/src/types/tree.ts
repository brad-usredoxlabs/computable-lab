/**
 * Types for the record browser tree navigation.
 */

import type { ArtifactSummary } from './artifact'

/**
 * Tree node for study hierarchy.
 *
 * `artifacts` carries the study-scoped supporting records (PDFs, protocols,
 * writeups, training, saved prompts, conclusions). It is populated by the
 * tree handler when artifacts exist for the study; older trees emitted
 * before the artifact concept landed will see an empty array.
 */
export interface StudyTreeNode {
  recordId: string
  title: string
  shortSlug?: string
  path: string
  experiments: ExperimentTreeNode[]
  artifacts?: ArtifactSummary[]
}

/**
 * Tree node for experiment.
 */
export interface ExperimentTreeNode {
  recordId: string
  title: string
  shortSlug?: string
  path: string
  studyId: string
  runs: RunTreeNode[]
}

/**
 * Tree node for run.
 */
export interface RunTreeNode {
  recordId: string
  title: string
  shortSlug?: string
  path: string
  studyId: string
  experimentId: string
  recordCounts: {
    eventGraphs: number
    plates: number
    contexts: number
    claims: number
    materials: number
    attachments: number
    other: number
  }
}

/**
 * Minimal record header from the index.
 */
export interface IndexEntry {
  recordId: string
  schemaId: string
  kind?: string
  title?: string
  status: 'inbox' | 'filed' | 'draft'
  links?: {
    studyId?: string
    experimentId?: string
    runId?: string
  }
  createdAt?: string
  updatedAt?: string
  path: string
}

/**
 * Selected node in the browser tree.
 */
export type SelectedNode =
  | { type: 'study'; recordId: string }
  | { type: 'experiment'; recordId: string }
  | { type: 'run'; recordId: string }
  | { type: 'inbox' }
  | null

/**
 * Run context for linking records to a run.
 */
export interface RunContext {
  runId: string
  studyId: string
  experimentId: string
  runTitle: string
}
