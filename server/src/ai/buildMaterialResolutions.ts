/**
 * buildMaterialResolutions — derive per-material MaterialResolution[] from the
 * signals already in-scope inside runChatbotCompile.
 *
 * Maps: bound reused mentions -> resolved (tier 1), minted mentions ->
 * new_local_proposed, unresolved refs -> unresolved. This is the Phase 0 bridge
 * between the compiler's existing evidence and the assurance module.
 */

import type { PromptMention } from './promptMentions.js';
import type { OntologyMentionBinding } from './mentions/bindOntologyMentions.js';
import type { MaterialResolution } from './MaterialResolution.js';

interface UnresolvedRefLike {
  kind?: string;
  label?: string;
  reason?: string;
}

export interface BuildMaterialResolutionsArgs {
  mentions: PromptMention[];
  /** Result of bindOntologyMentions (reused vs minted bindings). */
  ontologyBindings: OntologyMentionBinding[];
  /** Compiler unresolvedRefs (compound/ontology hits that fell through). */
  unresolvedRefs: UnresolvedRefLike[];
}

function isMaterialMention(m: PromptMention): boolean {
  return (
    m.type === 'material'
    || m.type === 'tube'
    || (m.entityKind === 'material'
      || m.entityKind === 'material-spec'
      || m.entityKind === 'material-instance'
      || m.entityKind === 'aliquot'
      || m.entityKind === 'vendor-product')
  );
}

export function buildMaterialResolutions(args: BuildMaterialResolutionsArgs): MaterialResolution[] {
  const { mentions, ontologyBindings, unresolvedRefs } = args;
  const resolutions: MaterialResolution[] = [];

  // Map CURIE -> binding for quick lookup by mention id.
  const bindingByCurie = new Map<string, OntologyMentionBinding>();
  for (const b of ontologyBindings) {
    if (b.curie) bindingByCurie.set(b.curie, b);
  }

  // Unresolved refs -> unresolved outcomes. Keep a set so a mention we later
  // classify as unresolved isn't double-counted via binding scan.
  const unresolvedLabels = new Set<string>();
  for (const ref of unresolvedRefs) {
    const label = ref.label?.trim();
    if (!label) continue;
    unresolvedLabels.add(label.toLowerCase());
    resolutions.push({ status: 'unresolved', mention: label });
  }

  // Material mentions -> resolved / new_local_proposed / unresolved.
  for (const m of mentions) {
    if (!isMaterialMention(m)) continue;
    const label = m.label?.trim();
    const id = m.id?.trim();
    const key = label?.toLowerCase() ?? id?.toLowerCase();

    // If it was left unresolved by the compiler, we already emitted it above.
    if (key && unresolvedLabels.has(key)) continue;

    const binding = id ? bindingByCurie.get(id) : undefined;

    if (binding) {
      if (binding.minted) {
        resolutions.push({
          status: 'new_local_proposed',
          mention: binding.label ?? label ?? id,
          ...(binding.recordId ? { proposalId: binding.recordId } : {}),
        });
      } else {
        resolutions.push({
          status: 'resolved',
          localId: binding.recordId,
          tier: 1, // reuse of an existing local record is a tier-1 resolution
          score: 1.0,
          ...(binding.label ? { mention: binding.label } : {}),
        });
      }
    } else if (id && /^[A-Z]+:/.test(id)) {
      // A CURIE-bearing mention that did NOT go through bindOntologyMentions
      // (no store / bare caller) — we cannot verify it, treat as unresolved.
      resolutions.push({ status: 'unresolved', mention: label ?? id });
    }
    // Else: a plain-text label mention with no binding — the deterministic
    // precompile either resolved it into an event's material_ref or left it as
    // an unresolvedRef; if neither, we have no evidence of a hard problem, so
    // we omit it (it will not contribute to grounded score).
  }

  return resolutions;
}
