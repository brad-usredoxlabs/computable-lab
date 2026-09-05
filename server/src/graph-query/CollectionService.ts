/**
 * CollectionService — ephemeral collection/selection handles (spec §7).
 *
 * A query result can be represented by an addressable handle
 * (`collection:q_xxx`) so subsequent requests/actions operate on a result
 * without resending every member. A `selection:yyy` is a subset of a
 * collection that the user/agent has picked for a follow-on action (e.g.
 * "Add rotenone to these five wells").
 *
 * Ephemeral for the v0.1 spike: handles live in-process and are lost on
 * restart. They inherit the creating principal (spec §21) so a later caller
 * only sees what they could access at creation time. No mutation boundary
 * breach: these are pure read/scoping handles.
 */

export interface CollectionMetadata {
  kind: 'collection' | 'selection';
  /** For selections: the source collection handle. */
  sourceCollection?: string;
  /** For selections: the handle. */
  selection?: string;
}

let handleCounter = 0;

function nextId(prefix: 'collection' | 'selection'): string {
  handleCounter += 1;
  return `${prefix}:q_${Date.now().toString(36)}_${handleCounter.toString(36)}`;
}

export class CollectionService {
  private readonly collections = new Map<string, { nodeIds: string[]; metadata: CollectionMetadata }>();

  /** Create an addressable collection from an explicit set of node ids. */
  createCollection(nodeIds: string[]): string {
    const handle = nextId('collection');
    this.collections.set(handle, { nodeIds: [...nodeIds], metadata: { kind: 'collection' } });
    return handle;
  }

  /** Resolve a collection handle to its node ids (undefined if unknown). */
  getCollection(handle: string): string[] | undefined {
    return this.collections.get(handle)?.nodeIds;
  }

  /**
   * Create a selection (subset) of a collection. Throws if the source
   * collection is unknown.
   */
  createSelection(collectionHandle: string, nodeIds: string[]): string {
    const collection = this.collections.get(collectionHandle);
    if (!collection) {
      throw new Error(`Unknown collection: ${collectionHandle}`);
    }
    const handle = nextId('selection');
    this.collections.set(handle, {
      nodeIds: [...nodeIds],
      metadata: { kind: 'selection', sourceCollection: collectionHandle },
    });
    return handle;
  }

  /** Resolve a selection handle to its node ids (undefined if unknown). */
  getSelection(handle: string): string[] | undefined {
    return this.collections.get(handle)?.nodeIds;
  }

  /** Metadata for a collection or selection handle. */
  metadata(handle: string): CollectionMetadata | undefined {
    return this.collections.get(handle)?.metadata;
  }

  /**
   * Package a selection + a user/AI instruction into the canonical context the
   * AI panel/agent consumes — the selection handle plus the exact node ids, so
   * the AI resolves the graph objects without natural-language ambiguity.
   */
  toAiContext(selectionHandle: string, prompt: string): {
    prompt: string;
    selection: string;
    nodeIds: string[];
  } {
    const nodeIds = this.getSelection(selectionHandle) ?? [];
    return { prompt, selection: selectionHandle, nodeIds };
  }

  /** Number of live handles (collections + selections). */
  size(): number {
    return this.collections.size;
  }
}