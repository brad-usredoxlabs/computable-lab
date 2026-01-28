/**
 * Core record types for computable-lab
 * Contains only type definitions and minimal utilities
 * No business logic, no defaults, no hard-coded semantics
 */

import type { 
  RecordId, 
  RecordEnvelope, 
  RecordEvent, 
  EventHandler, 
  EventEmitter 
} from '../types/common';

/**
 * Meta type extracted from RecordEnvelope for better type compatibility
 */
type MetaType = {
  /** Record creation timestamp (ISO 8601) */
  createdAt?: string;
  /** Last modified timestamp (ISO 8601) */
  updatedAt?: string;
  /** Creator (user or agent identifier) */
  createdBy?: string;
};

/**
 * Utility functions for record envelopes
 * These are pure functions that don't add metadata or make assumptions
 */
export class RecordEnvelopeUtils {
  /**
   * Create a new record envelope (pure function)
   */
  static create(
    recordId: RecordId,
    schemaId: string,
    data: unknown,
    meta?: MetaType
  ): RecordEnvelope {
    const envelope: RecordEnvelope = {
      recordId,
      schemaId,
      data
    };

    if (meta !== undefined) {
      envelope.meta = meta;
    }

    return envelope;
  }

  /**
   * Update record envelope data (pure function)
   */
  static update(
    envelope: RecordEnvelope,
    data: unknown,
    meta?: MetaType
  ): RecordEnvelope {
    const updated: RecordEnvelope = {
      ...envelope,
      data
    };

    if (meta !== undefined) {
      updated.meta = meta;
    }

    return updated;
  }

  /**
   * Clone record envelope (pure function)
   */
  static clone(envelope: RecordEnvelope): RecordEnvelope {
    const cloned: RecordEnvelope = {
      ...envelope,
      data: envelope.data
    };

    if (envelope.meta !== undefined) {
      cloned.meta = { ...envelope.meta };
    }

    return cloned;
  }

  /**
   * Canonicalize object for stable comparison
   */
  private static canonicalize(obj: unknown): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.canonicalize(item));
    }

    const canonical: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    
    for (const key of keys) {
      canonical[key] = this.canonicalize((obj as Record<string, unknown>)[key]);
    }
    
    return canonical;
  }

  /**
   * Check if two record envelopes are equal (excluding meta timestamps)
   * Uses canonical comparison for deterministic object comparison
   */
  static equals(a: RecordEnvelope, b: RecordEnvelope): boolean {
    return (
      a.recordId === b.recordId &&
      a.schemaId === b.schemaId &&
      JSON.stringify(this.canonicalize(a.data)) === JSON.stringify(this.canonicalize(b.data))
    );
  }

  /**
   * Get record envelope as plain object
   */
  static toJSON(envelope: RecordEnvelope): any {
    const result: any = {
      recordId: envelope.recordId,
      schemaId: envelope.schemaId,
      data: envelope.data
    };

    if (envelope.meta !== undefined) {
      result.meta = envelope.meta;
    }

    return result;
  }

  /**
   * Create record envelope from plain object
   */
  static fromJSON(data: any): RecordEnvelope {
    const envelope: RecordEnvelope = {
      recordId: data.recordId,
      schemaId: data.schemaId,
      data: data.data
    };

    if (data.meta !== undefined) {
      envelope.meta = data.meta;
    }

    return envelope;
  }
}