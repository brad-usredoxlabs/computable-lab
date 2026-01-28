/**
 * RecordDetailController — Controller for record detail views.
 * 
 * This controller manages state and logic for displaying a single record.
 * It's framework-agnostic — just pure data/logic.
 */

import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { RecordStore } from '../../store/types.js';
import type { UISpec } from '../types.js';
import type { GraphBuilder } from '../../jsonld/GraphBuilder.js';
import type { JsonLdGenerator } from '../../jsonld/JsonLdGenerator.js';
import type {
  DetailViewState,
  RelatedRecordSummary,
} from './types.js';
import { getValueAtPath } from '../FormBuilder.js';

/**
 * Configuration for RecordDetailController.
 */
export interface DetailControllerConfig {
  /** Store to fetch records from */
  store: RecordStore;
  /** Graph builder for related records (optional) */
  graphBuilder?: GraphBuilder;
  /** JSON-LD generator (optional) */
  jsonLdGenerator?: JsonLdGenerator;
  /** UI spec loader function (optional) */
  getUISpec?: (schemaId: string) => UISpec | undefined;
}

/**
 * RecordDetailController — Manages detail view state and operations.
 */
export class RecordDetailController {
  private config: DetailControllerConfig;
  private state: DetailViewState;
  private stateListeners: Array<(state: DetailViewState) => void> = [];
  
  constructor(config: DetailControllerConfig) {
    this.config = config;
    this.state = this.createInitialState();
  }
  
  /**
   * Create initial state.
   */
  private createInitialState(): DetailViewState {
    return {
      envelope: null,
      related: [],
      isLoading: false,
    };
  }
  
  /**
   * Get current state.
   */
  getState(): DetailViewState {
    return this.state;
  }
  
  /**
   * Subscribe to state changes.
   */
  subscribe(listener: (state: DetailViewState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      this.stateListeners = this.stateListeners.filter(l => l !== listener);
    };
  }
  
  /**
   * Update state and notify listeners.
   */
  private setState(partial: Partial<DetailViewState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }
  
  /**
   * Load a record by ID.
   */
  async load(recordId: string): Promise<void> {
    this.setState({ isLoading: true });
    
    try {
      const envelope = await this.config.store.get(recordId);
      
      if (!envelope) {
        this.setState({
          envelope: null,
          isLoading: false,
          error: `Record not found: ${recordId}`,
        });
        return;
      }
      
      // Get UI spec if available
      let uiSpec: UISpec | undefined;
      if (this.config.getUISpec && envelope.schemaId) {
        uiSpec = this.config.getUISpec(envelope.schemaId);
      }
      
      // Get related records if graph builder available
      let related: RelatedRecordSummary[] = [];
      if (this.config.graphBuilder) {
        related = await this.loadRelatedRecords(envelope);
      }
      
      // Generate JSON-LD if generator available
      let jsonLd: Record<string, unknown> | undefined;
      if (this.config.jsonLdGenerator) {
        const result = this.config.jsonLdGenerator.generate(envelope);
        if (result.success && result.document) {
          jsonLd = result.document;
        }
      }
      
      this.setState({
        envelope,
        related,
        isLoading: false,
        ...(uiSpec ? { uiSpec } : {}),
        ...(jsonLd ? { jsonLd } : {}),
      });
    } catch (err) {
      this.setState({
        isLoading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  
  /**
   * Load related records from graph.
   */
  private async loadRelatedRecords(
    envelope: RecordEnvelope
  ): Promise<RelatedRecordSummary[]> {
    const related: RelatedRecordSummary[] = [];
    
    if (!this.config.graphBuilder) {
      return related;
    }
    
    // Get outgoing edges (this record references others)
    const outgoing = this.config.graphBuilder.getOutgoingEdges(envelope.recordId);
    for (const edge of outgoing) {
      const targetNode = this.config.graphBuilder.getNode(edge.to);
      if (targetNode) {
        related.push({
          recordId: edge.to,
          kind: targetNode.kind,
          title: await this.getRecordTitle(edge.to),
          predicate: edge.predicate,
          direction: 'outgoing',
        });
      }
    }
    
    // Get incoming edges (other records reference this)
    const incoming = this.config.graphBuilder.getIncomingEdges(envelope.recordId);
    for (const edge of incoming) {
      const sourceNode = this.config.graphBuilder.getNode(edge.from);
      if (sourceNode) {
        related.push({
          recordId: edge.from,
          kind: sourceNode.kind,
          title: await this.getRecordTitle(edge.from),
          predicate: edge.predicate,
          direction: 'incoming',
        });
      }
    }
    
    return related;
  }
  
  /**
   * Get title for a record.
   */
  private async getRecordTitle(recordId: string): Promise<string> {
    try {
      const envelope = await this.config.store.get(recordId);
      if (envelope) {
        const payload = envelope.payload as Record<string, unknown>;
        // Try common title fields
        for (const field of ['title', 'name', 'statement', 'description']) {
          const value = payload[field];
          if (typeof value === 'string' && value.length > 0) {
            return value.length > 60 ? value.slice(0, 57) + '...' : value;
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return recordId;
  }
  
  /**
   * Reload current record.
   */
  async reload(): Promise<void> {
    if (this.state.envelope) {
      await this.load(this.state.envelope.recordId);
    }
  }
  
  /**
   * Get a specific field value from the payload.
   */
  getFieldValue(path: string): unknown {
    if (!this.state.envelope) return undefined;
    const payload = this.state.envelope.payload as Record<string, unknown>;
    return getValueAtPath(payload, path);
  }
  
  /**
   * Get display title for current record.
   */
  getDisplayTitle(): string {
    if (!this.state.envelope) return '';
    const payload = this.state.envelope.payload as Record<string, unknown>;
    return (payload.title as string) || 
           (payload.name as string) || 
           this.state.envelope.recordId;
  }
  
  /**
   * Get record kind.
   */
  getKind(): string {
    if (!this.state.envelope) return '';
    const payload = this.state.envelope.payload as Record<string, unknown>;
    return (payload.kind as string) || this.state.envelope.meta?.kind || 'unknown';
  }
  
  /**
   * Get metadata from envelope.
   */
  getMeta(): Record<string, unknown> {
    return (this.state.envelope?.meta || {}) as Record<string, unknown>;
  }
  
  /**
   * Get related records by direction.
   */
  getRelatedByDirection(direction: 'incoming' | 'outgoing'): RelatedRecordSummary[] {
    return this.state.related.filter(r => r.direction === direction);
  }
  
  /**
   * Get related records by kind.
   */
  getRelatedByKind(kind: string): RelatedRecordSummary[] {
    return this.state.related.filter(r => r.kind === kind);
  }
}

/**
 * Create a new RecordDetailController.
 */
export function createRecordDetailController(
  config: DetailControllerConfig
): RecordDetailController {
  return new RecordDetailController(config);
}
