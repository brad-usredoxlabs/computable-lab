/**
 * Types for the Record Index system.
 * 
 * The index provides fast queries for tree navigation and search
 * without needing to parse all YAML files.
 */

/**
 * Minimal record header for index entries.
 * Contains only fields needed for tree navigation and search.
 */
export interface IndexEntry {
  /** Stable record identifier */
  recordId: string;

  /** Schema ID for type identification */
  schemaId: string;

  /** Record kind (study, experiment, run, event-graph, etc.) */
  kind?: string;

  /**
   * Polymorphic subtype for `kind: 'artifact'` records (Phase 8):
   * pdf / protocol / writeup / training / saved-prompt / conclusion.
   * Populated by `buildIndexEntry` so the Find tab can render artifact
   * kind labels without re-fetching each record payload.
   */
  artifactKind?: string;

  /** Human-readable title */
  title?: string;
  
  /** Filing status */
  status: 'inbox' | 'filed' | 'draft';
  
  /** Hierarchical links to parent records */
  links?: {
    studyId?: string;
    experimentId?: string;
    runId?: string;
  };
  
  /** Creation timestamp */
  createdAt?: string;
  
  /** Last modification timestamp */
  updatedAt?: string;
  
  /** Relative file path in repo */
  path: string;
  
  /** Content hash for staleness detection */
  hash?: string;
}

/**
 * Full record index structure.
 */
export interface RecordIndex {
  /** Index format version */
  version: number;
  
  /** When the index was generated */
  generatedAt: string;
  
  /** All index entries */
  entries: IndexEntry[];
}

/**
 * Tree node for study hierarchy.
 *
 * `artifacts` carries the study-scoped supporting records (PDFs, protocols,
 * writeups, training, saved prompts, conclusions). Optional because tree
 * responses emitted before the artifact concept landed don't include it.
 */
export interface StudyTreeNode {
  recordId: string;
  title: string;
  shortSlug?: string;
  path: string;
  experiments: ExperimentTreeNode[];
  artifacts?: ArtifactSummaryEntry[];
}

/**
 * Lightweight artifact header for tree responses. Avoids loading TipTap
 * bodies / extracted text when only listing under a study.
 */
export interface ArtifactSummaryEntry {
  recordId: string;
  title: string;
  artifactKind: string;
  studyId: string;
  experimentId?: string;
  path: string;
  updatedAt?: string;
  size?: number;
}

/**
 * Tree node for experiment.
 *
 * `artifacts` carries artifacts whose `links.experimentId` matches this
 * experiment but whose `links.runId` is absent (run-scoped artifacts
 * are pushed down to `RunTreeNode.artifacts` instead). Phase 12 Find
 * tab renders these inline under the experiment row so the user sees
 * exactly which experiment a given protocol / write-up belongs to.
 */
export interface ExperimentTreeNode {
  recordId: string;
  title: string;
  shortSlug?: string;
  path: string;
  studyId: string;
  runs: RunTreeNode[];
  artifacts?: ArtifactSummaryEntry[];
}

/**
 * Tree node for run.
 */
export interface RunTreeNode {
  recordId: string;
  title: string;
  shortSlug?: string;
  path: string;
  studyId: string;
  experimentId: string;
  recordCounts: {
    eventGraphs: number;
    plates: number;
    contexts: number;
    claims: number;
    materials: number;
    attachments: number;
    other: number;
  };
  /**
   * Artifacts whose `links.runId` matches this run — typically PDFs
   * ingested during the run, attachments scoped to it, or saved prompts
   * authored against it. Optional for backward-compat with v1 tree
   * responses (Phase 8 only carried artifacts on the study node).
   */
  artifacts?: ArtifactSummaryEntry[];
}

/**
 * Query options for index lookups.
 */
export interface IndexQuery {
  /** Filter by kind */
  kind?: string;
  
  /** Filter by schema ID */
  schemaId?: string;
  
  /** Filter by status */
  status?: 'inbox' | 'filed' | 'draft';
  
  /** Filter by linked study */
  studyId?: string;
  
  /** Filter by linked experiment */
  experimentId?: string;
  
  /** Filter by linked run */
  runId?: string;
  
  /** Search in title */
  titleContains?: string;
}
