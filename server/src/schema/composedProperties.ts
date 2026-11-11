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
  const visited = new Set<string>();

  let hasCreatedAt = false;
  let hasUpdatedAt = false;
  let hasCreatedBy = false;
  let foundStrict = false;

  function walk(obj: Record<string, unknown>) {
    const id = (obj.$id as string) ?? undefined;
    if (id !== undefined && visited.has(id)) {
      // Cycle detected — skip this branch
      return;
    }
    if (id !== undefined) {
      visited.add(id);
    }

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

    // Check additionalProperties
    if (obj.additionalProperties === false) {
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
