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
export interface ProjectProtocolLibrary {
  protocols: IndexEntry[]
  localProtocols: IndexEntry[]
  plannedRuns: IndexEntry[]
  inventory: IndexEntry[]
}

export interface StudyTreeNode {
  recordId: string
  title: string
  shortSlug?: string
  path: string
  experiments: ExperimentTreeNode[]
  /**
   * Runs linked to this study WITHOUT an experiment (via studyId or
   * projectIds[]). Experiments are optional grouping per the run schema.
   * Absent on tree responses emitted before the field landed.
   */
  runs?: RunTreeNode[]
  artifacts?: ArtifactSummary[]
  protocolLibrary?: ProjectProtocolLibrary
}

/**
 * Tree node for experiment.
 *
 * `artifacts` is the subset of artifacts whose `links.experimentId`
 * matches this experiment AND has no `links.runId` (run-scoped
 * artifacts are pushed to `RunTreeNode.artifacts` instead). Optional
 * for back-compat with v1 tree responses.
 */
export interface ExperimentTreeNode {
  recordId: string
  title: string
  shortSlug?: string
  path: string
  studyId: string
  runs: RunTreeNode[]
  artifacts?: ArtifactSummary[]
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
  experimentId?: string
  /** Projects this run is linked to (multi-project linking, spec §2.2). */
  projectIds?: string[]
  recordCounts: {
    eventGraphs: number
    plates: number
    contexts: number
    claims: number
    materials: number
    attachments: number
    other: number
  }
  /**
   * Artifacts whose `links.runId` matches this run. Populated by Phase
   * 12's tree-handler upgrade; older tree responses leave this absent
   * and the Find tab falls back to client-side scoping.
   */
  artifacts?: ArtifactSummary[]
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
  experimentId?: string
  /** Projects this run is linked to (multi-project linking, spec §2.2). */
  projectIds?: string[]
  runTitle: string
}