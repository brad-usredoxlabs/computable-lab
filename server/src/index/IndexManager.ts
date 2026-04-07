/**
 * IndexManager — Manages the record index for fast tree navigation and search.
 * 
 * The index is derived from YAML record files and stored as JSONL.
 * It is NOT the source of truth - records are authoritative.
 */

import { createHash } from 'crypto';
import type { RepoAdapter } from '../repo/types.js';
import { parseRecord } from '../store/RecordParser.js';
import type {
  IndexEntry,
  RecordIndex,
  StudyTreeNode,
  ExperimentTreeNode,
  RunTreeNode,
  IndexQuery,
} from './types.js';

const INDEX_VERSION = 1;
const INDEX_PATH = 'records/_index/records.jsonl';

/**
 * Configuration for IndexManager.
 */
export interface IndexManagerConfig {
  /** Base directory for records (default: 'records') */
  baseDir?: string;
  /** Path for the index file (default: 'records/_index/records.jsonl') */
  indexPath?: string;
}

/**
 * IndexManager — Build and query the record index.
 */
export class IndexManager {
  private readonly repo: RepoAdapter;
  private readonly baseDir: string;
  private readonly indexPath: string;
  
  // In-memory index cache
  private entries: Map<string, IndexEntry> = new Map();
  private loaded = false;
  
  constructor(repo: RepoAdapter, config: IndexManagerConfig = {}) {
    this.repo = repo;
    this.baseDir = config.baseDir || 'records';
    this.indexPath = config.indexPath || INDEX_PATH;
  }
  
  /**
   * Load the index from disk into memory.
   */
  async load(): Promise<RecordIndex | null> {
    try {
      const file = await this.repo.getFile(this.indexPath);
      if (!file) {
        return null;
      }
      
      // Parse JSONL format
      const lines = file.content.split('\n').filter(line => line.trim());
      const entries: IndexEntry[] = [];
      
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as IndexEntry;
          entries.push(entry);
          this.entries.set(entry.recordId, entry);
        } catch {
          // Skip malformed lines
          console.warn('Skipping malformed index line:', line);
        }
      }
      
      this.loaded = true;
      
      return {
        version: INDEX_VERSION,
        generatedAt: new Date().toISOString(),
        entries,
      };
    } catch (error) {
      console.error('Failed to load index:', error);
      return null;
    }
  }
  
  /**
   * Rebuild the entire index by scanning all YAML files.
   */
  async rebuild(): Promise<RecordIndex> {
    console.log('Rebuilding record index...');
    
    const files = await this.repo.listFiles({
      directory: this.baseDir,
      pattern: '*.yaml',
      recursive: true,
    });
    
    this.entries.clear();
    const entries: IndexEntry[] = [];
    
    for (const filePath of files) {
      // Skip the index directory itself
      if (filePath.includes('_index/')) {
        continue;
      }
      
      const entry = await this.extractEntry(filePath);
      if (entry) {
        entries.push(entry);
        this.entries.set(entry.recordId, entry);
      }
    }
    
    this.loaded = true;
    
    // Save to disk
    await this.save(entries);
    
    console.log(`Index rebuilt: ${entries.length} records`);
    
    return {
      version: INDEX_VERSION,
      generatedAt: new Date().toISOString(),
      entries,
    };
  }
  
  /**
   * Extract an IndexEntry from a record file.
   */
  private async extractEntry(filePath: string): Promise<IndexEntry | null> {
    try {
      const file = await this.repo.getFile(filePath);
      if (!file) {
        return null;
      }
      
      const result = parseRecord(file.content, filePath);
      if (!result.success || !result.envelope) {
        return null;
      }
      
      const { envelope } = result;
      const payload = envelope.payload as Record<string, unknown>;
      
      // Extract links - handle both flat and nested formats
      // Build links object only with defined values (exactOptionalPropertyTypes)
      const rawStudyId = (payload.links as Record<string, unknown> | undefined)?.studyId 
        ?? payload.studyId;
      const rawExperimentId = (payload.links as Record<string, unknown> | undefined)?.experimentId 
        ?? payload.experimentId;
      const rawRunId = (payload.links as Record<string, unknown> | undefined)?.runId 
        ?? payload.runId;
      
      const hasLinks = rawStudyId || rawExperimentId || rawRunId;
      
      // Determine status
      let status: IndexEntry['status'] = 'draft';
      if (payload.status === 'inbox' || payload.status === 'filed' || payload.status === 'draft') {
        status = payload.status;
      } else if (rawRunId) {
        status = 'filed';
      } else if (filePath.includes('_inbox/')) {
        status = 'inbox';
      }
      
      // Compute content hash
      const hash = createHash('sha256').update(file.content).digest('hex').slice(0, 16);
      
      // Build entry with conditional properties (exactOptionalPropertyTypes)
      const kind = payload.kind as string | undefined;
      const title = (payload.title || payload.name || payload.label) as string | undefined;
      const createdAt = payload.createdAt as string | undefined;
      const updatedAt = payload.updatedAt as string | undefined;
      
      // Build links object conditionally
      const links: IndexEntry['links'] = hasLinks ? {
        ...(rawStudyId ? { studyId: rawStudyId as string } : {}),
        ...(rawExperimentId ? { experimentId: rawExperimentId as string } : {}),
        ...(rawRunId ? { runId: rawRunId as string } : {}),
      } : undefined;
      
      return {
        recordId: envelope.recordId,
        schemaId: envelope.schemaId,
        status,
        path: filePath,
        hash,
        ...(kind !== undefined ? { kind } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(links !== undefined ? { links } : {}),
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(updatedAt !== undefined ? { updatedAt } : {}),
      };
    } catch (error) {
      console.warn(`Failed to extract entry from ${filePath}:`, error);
      return null;
    }
  }
  
  /**
   * Save the index to disk in JSONL format.
   */
  private async save(entries: IndexEntry[]): Promise<void> {
    // Sort by recordId for deterministic output
    const sorted = [...entries].sort((a, b) => a.recordId.localeCompare(b.recordId));
    
    // Convert to JSONL
    const content = sorted.map(e => JSON.stringify(e)).join('\n') + '\n';
    
    // Ensure directory exists and write file
    try {
      const exists = await this.repo.fileExists(this.indexPath);
      if (exists) {
        const file = await this.repo.getFile(this.indexPath);
        if (file) {
          await this.repo.updateFile({
            path: this.indexPath,
            content,
            sha: file.sha,
            message: 'Update record index',
          });
        }
      } else {
        await this.repo.createFile({
          path: this.indexPath,
          content,
          message: 'Create record index',
        });
      }
    } catch (error) {
      console.error('Failed to save index:', error);
    }
  }
  
  /**
   * Update a single entry in the index.
   */
  async updateEntry(entry: IndexEntry): Promise<void> {
    this.entries.set(entry.recordId, entry);
    
    // Save to disk
    await this.save(Array.from(this.entries.values()));
  }
  
  /**
   * Remove an entry from the index.
   */
  async removeEntry(recordId: string): Promise<void> {
    this.entries.delete(recordId);
    
    // Save to disk
    await this.save(Array.from(this.entries.values()));
  }
  
  /**
   * Get an entry by recordId.
   */
  async getByRecordId(recordId: string): Promise<IndexEntry | null> {
    if (!this.loaded) {
      await this.load();
    }
    return this.entries.get(recordId) || null;
  }
  
  /**
   * Query entries with filters.
   */
  async query(query: IndexQuery): Promise<IndexEntry[]> {
    if (!this.loaded) {
      await this.load();
    }
    
    let results = Array.from(this.entries.values());
    
    if (query.kind) {
      results = results.filter(e => e.kind === query.kind);
    }
    
    if (query.schemaId) {
      results = results.filter(e => e.schemaId === query.schemaId);
    }
    
    if (query.status) {
      results = results.filter(e => e.status === query.status);
    }
    
    if (query.studyId) {
      results = results.filter(e => e.links?.studyId === query.studyId);
    }
    
    if (query.experimentId) {
      results = results.filter(e => e.links?.experimentId === query.experimentId);
    }
    
    if (query.runId) {
      results = results.filter(e => e.links?.runId === query.runId);
    }
    
    if (query.titleContains) {
      const search = query.titleContains.toLowerCase();
      results = results.filter(e => e.title?.toLowerCase().includes(search));
    }
    
    return results;
  }
  
  /**
   * Get inbox records (status = inbox).
   */
  async getInbox(): Promise<IndexEntry[]> {
    return this.query({ status: 'inbox' });
  }
  
  /**
   * Get all records linked to a specific run.
   */
  async getByRunId(runId: string): Promise<IndexEntry[]> {
    return this.query({ runId });
  }
  
  /**
   * Search records by query string.
   * Searches across recordId, title, and kind.
   * Returns results sorted by relevance.
   */
  async search(searchQuery: string, limit = 50): Promise<IndexEntry[]> {
    if (!this.loaded) {
      await this.load();
    }
    
    if (!searchQuery || searchQuery.trim().length === 0) {
      return [];
    }
    
    const query = searchQuery.toLowerCase().trim();
    const terms = query.split(/\s+/).filter(t => t.length > 0);
    
    // Score each entry based on matches
    const scored: Array<{ entry: IndexEntry; score: number }> = [];
    
    for (const entry of this.entries.values()) {
      let score = 0;
      
      // Check recordId (exact match is best)
      const recordIdLower = entry.recordId.toLowerCase();
      if (recordIdLower === query) {
        score += 100;
      } else if (recordIdLower.includes(query)) {
        score += 30;
      }
      
      // Check title
      const titleLower = (entry.title || '').toLowerCase();
      if (titleLower === query) {
        score += 80;
      } else if (titleLower.includes(query)) {
        score += 40;
      } else {
        // Check individual terms
        for (const term of terms) {
          if (titleLower.includes(term)) {
            score += 15;
          }
        }
      }
      
      // Check kind
      const kindLower = (entry.kind || '').toLowerCase();
      if (kindLower === query) {
        score += 20;
      } else if (kindLower.includes(query)) {
        score += 10;
      }
      
      // Check path (lower weight)
      if (entry.path.toLowerCase().includes(query)) {
        score += 5;
      }
      
      if (score > 0) {
        scored.push({ entry, score });
      }
    }
    
    // Sort by score descending and limit
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, limit).map(s => s.entry);
  }
  
  /**
   * Build the study hierarchy tree.
   */
  async getStudyTree(): Promise<StudyTreeNode[]> {
    if (!this.loaded) {
      await this.load();
    }
    
    // Get all studies
    const studies = await this.query({ kind: 'study' });
    
    // Get all experiments
    const experiments = await this.query({ kind: 'experiment' });
    
    // Get all runs
    const runs = await this.query({ kind: 'run' });
    
    // Get all other records for counting
    const allEntries = Array.from(this.entries.values());
    
    // Build tree
    const tree: StudyTreeNode[] = [];
    
    for (const study of studies) {
      // Get experiments for this study
      const studyExperiments = experiments.filter(
        e => e.links?.studyId === study.recordId
      );
      
      const experimentNodes: ExperimentTreeNode[] = [];
      
      for (const exp of studyExperiments) {
        // Get runs for this experiment
        const expRuns = runs.filter(
          r => r.links?.experimentId === exp.recordId
        );
        
        const runNodes: RunTreeNode[] = [];
        
        for (const run of expRuns) {
          // Count records linked to this run
          const runRecords = allEntries.filter(
            e => e.links?.runId === run.recordId && e.kind !== 'run'
          );
          
          const counts = {
            eventGraphs: runRecords.filter(r => r.kind === 'event-graph' || r.schemaId.includes('event-graph')).length,
            plates: runRecords.filter(r => r.kind === 'plate' || r.schemaId.includes('plate')).length,
            contexts: runRecords.filter(r => r.kind === 'context' || r.schemaId.includes('context')).length,
            claims: runRecords.filter(r => r.kind === 'claim' || r.schemaId.includes('claim')).length,
            materials: runRecords.filter(r => r.kind === 'material' || r.schemaId.includes('material')).length,
            attachments: runRecords.filter(r => r.kind === 'attachment' || r.schemaId.includes('attachment')).length,
            other: 0,
          };
          counts.other = runRecords.length - Object.values(counts).reduce((a, b) => a + b, 0);
          
          runNodes.push({
            recordId: run.recordId,
            title: run.title || run.recordId,
            path: run.path,
            studyId: study.recordId,
            experimentId: exp.recordId,
            recordCounts: counts,
          });
        }
        
        experimentNodes.push({
          recordId: exp.recordId,
          title: exp.title || exp.recordId,
          path: exp.path,
          studyId: study.recordId,
          runs: runNodes,
        });
      }
      
      tree.push({
        recordId: study.recordId,
        title: study.title || study.recordId,
        path: study.path,
        experiments: experimentNodes,
      });
    }
    
    return tree;
  }
  
  /**
   * Check if the index is loaded.
   */
  isLoaded(): boolean {
    return this.loaded;
  }
  
  /**
   * Get the number of entries in the index.
   */
  size(): number {
    return this.entries.size;
  }
}

/**
 * Create a new IndexManager instance.
 */
export function createIndexManager(
  repo: RepoAdapter,
  config?: IndexManagerConfig
): IndexManager {
  return new IndexManager(repo, config);
}
