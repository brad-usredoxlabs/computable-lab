import { apiClient } from '../../shared/api/client'
import type { Ref } from '../../types/ref'

/**
 * Ground a material ref before it's written into an `add_material` event: an
 * ontology ref is replaced with the local (proposed) material record it grounds
 * to, so the in-editor event never holds a bare ontology ref. Record refs pass
 * through unchanged.
 *
 * On failure the original ref is returned — accept-time normalization
 * (`normalizeEventGraphMaterialUsage`) remains the final enforcement net, so a
 * transient grounding error never blocks the user's edit.
 */
export async function groundMaterialRef(ref: Ref): Promise<Ref> {
  if (ref.kind !== 'ontology') return ref
  try {
    const res = await apiClient.groundOntologyMaterial({
      ontologyRef: ref,
      ...(ref.label ? { sourceLabel: ref.label } : {}),
    })
    return res.materialRef as unknown as Ref
  } catch {
    return ref
  }
}
