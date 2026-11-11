/**
 * Composed schema property walk — pure function that resolves allOf branches
 * and local $refs to determine which properties a schema accepts.
 *
 * Used by getSchemaProperties (server.ts) to decide provenance injection.
 */

export interface ComposedPropertiesResult {
  hasCreatedAt: boolean;
  hasUpdatedAt: boolean;
  hasCreatedBy: boolean;
  allowsAny: boolean;
}

/**
 * Walk the composition tree (top-level + allOf branches, following local $refs)
 * and return which provenance fields are declared plus whether extra properties
 * are permitted.
 *
 * @param schema - Root JSON Schema object
 * @param lookup - Resolves a local $ref id to its schema object; returns undefined
 *                 when the id is not found
 * @returns ComposedPropertiesResult
 */
export function getComposedProperties(
  schema: Record<string, unknown>,
  lookup: (id: string) => Record<string, unknown> | undefined,
): ComposedPropertiesResult {
  // Guard by resolved object identity — works for nodes with or without $id.
  // A $defs node reached by #/... pointer carries no $id, so $id-keyed guards
  // were inert on the one ref shape production can resolve.
  const visited = new Set<Record<string, unknown>>();

  let hasCreatedAt = false;
  let hasUpdatedAt = false;
  let hasCreatedBy = false;
  let foundStrict = false;

  function walk(obj: Record<string, unknown>) {
    if (visited.has(obj)) {
      // Cycle detected — skip this branch
      return;
    }
    visited.add(obj);

    // Check top-level properties of this node
    const props = obj.properties as Record<string, unknown> | undefined;
    if (props) {
      if (Object.prototype.hasOwnProperty.call(props, 'createdAt')) {
        hasCreatedAt = true;
      }
      if (Object.prototype.hasOwnProperty.call(props, 'updatedAt')) {
        hasUpdatedAt = true;
      }
      if (Object.prototype.hasOwnProperty.call(props, 'createdBy')) {
        hasCreatedBy = true;
      }
    }

    // Check strictness — additionalProperties: false OR unevaluatedProperties: false
    if (obj.additionalProperties === false || obj.unevaluatedProperties === false) {
      foundStrict = true;
    }

    // Follow allOf branches
    const allOf = obj.allOf as Record<string, unknown>[] | undefined;
    if (Array.isArray(allOf)) {
      for (const branch of allOf) {
        if (typeof branch !== 'object' || branch === null) continue;
        const ref = branch.$ref as string | undefined;
        if (ref !== undefined) {
          // Resolve local $ref — only follow if lookup provides it
          const resolved = lookup(ref);
          if (resolved) {
            walk(resolved as Record<string, unknown>);
          }
        } else {
          // Inline allOf branch
          walk(branch);
        }
      }
    }
  }

  walk(schema);

  return {
    hasCreatedAt,
    hasUpdatedAt,
    hasCreatedBy,
    allowsAny: !foundStrict,
  };
}

/**
 * Resolve a $ref against a base URI, agreeing with SchemaRegistry.ts:27
 * normalizeRef().  Handles fragment-only refs, relative paths, and absolute
 * URIs.  Returns a [docUri, fragment | undefined] tuple.
 */
function resolveRef(ref: string, baseUri: string): [string, string | undefined] {
  // Fragment-only: pointer into the current document
  if (ref.startsWith('#')) {
    const hashIndex = baseUri.indexOf('#');
    const base = hashIndex >= 0 ? baseUri.slice(0, hashIndex) : baseUri;
    return [base, ref.substring(1) as string | undefined];
  }
  // Already absolute
  if (ref.includes('://')) {
    const hashIndex = ref.indexOf('#');
    return hashIndex >= 0
      ? [ref.slice(0, hashIndex), ref.substring(hashIndex + 1) as string | undefined]
      : [ref, undefined];
  }
  // Relative path — use URL resolution (agrees with SchemaRegistry.ts:41-43)
  const url = new URL(ref, baseUri);
  const hashIndex = url.href.indexOf('#');
  return hashIndex >= 0
    ? [url.href.slice(0, hashIndex), url.href.substring(hashIndex + 1) as string | undefined]
    : [url.href, undefined];
}

/**
 * Resolve a JSON Pointer fragment against a schema object, unescaping
 * ~1 → / and ~0 → ~.  Handles leading / in the pointer (e.g., /$defs/X).
 * Returns the sub-object or undefined.
 */
function pointerResolve(schema: Record<string, unknown>, pointer: string): Record<string, unknown> | undefined {
  if (pointer === '') return schema;
  // JSON Pointer: strip leading / then split, unescape ~1/~0
  const raw = pointer.startsWith('/') ? pointer.substring(1) : pointer;
  const segments = raw.split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = schema;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'object' && current !== null
    ? current as Record<string, unknown>
    : undefined;
}

// ---------------------------------------------------------------------------
// Factory: produces the lookup closure that server.ts wires into RecordHandlers
// ---------------------------------------------------------------------------

// Minimal registry interface so composedProperties.ts does not depend on
// SchemaRegistry.ts types beyond what the factory needs at runtime.
interface SchemaRegistry {
  getById(id: string): { id: string; schema: Record<string, unknown> } | undefined;
}

/**
 * Factory that creates a `getSchemaProperties` function wired to the
 * production SchemaRegistry.  Resolves $refs the way the registry does:
 * normalise against the schema's own $id, then fragment-pointer-resolve.
 *
 * D3 fix: the previous code passed the raw ref to getById, so 96 of 205
 * schemas whose provenance arrives through relative refs were invisible to
 * the walk.
 */
export function makeGetSchemaProperties(registry: SchemaRegistry) {
  return function getSchemaProperties(schemaId: string): ComposedPropertiesResult | undefined {
    const entry = registry.getById(schemaId);
    if (!entry) return undefined;

    const rootSchema = entry.schema as Record<string, unknown>;
    const baseUri = (rootSchema.$id as string) ?? schemaId;

    const lookup = (ref: string): Record<string, unknown> | undefined => {
      const [docUri, fragment] = resolveRef(ref, baseUri);
      // Fragment-only: pointer into the current document
      if (docUri === baseUri) {
        return fragment !== undefined
          ? pointerResolve(rootSchema, fragment)
          : rootSchema;
      }
      // Cross-document: resolve by docUri, then fragment
      const target = registry.getById(docUri);
      if (!target) return undefined;
      if (fragment !== undefined) {
        return pointerResolve(target.schema as Record<string, unknown>, fragment);
      }
      return target.schema as Record<string, unknown>;
    };

    return getComposedProperties(rootSchema, lookup);
  };
}
