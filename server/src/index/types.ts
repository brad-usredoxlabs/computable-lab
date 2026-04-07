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
 */
export interface StudyTreeNode {
  recordId: string;
  title: string;
  shortSlug?: string;
  path: string;
  experiments: ExperimentTreeNode[];
}

/**
 * Tree node for experiment.
 */
export interface ExperimentTreeNode {
  recordId: string;
  title: string;
  shortSlug?: string;
  path: string;
  studyId: string;
  runs: RunTreeNode[];
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
