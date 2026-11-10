/**
 * Role binding clarification — the QUESTION half of the universal->local
 * binding seam. `proposeRoleBindings` already reports each declared role as
 * `proposed`, `ambiguous` or `unbound`; a role that matches more than one
 * record is served as a bare list today, with no statement of which candidates
 * exist and no question. This module turns exactly those `ambiguous` roles into
 * one clarification card each, so the proposal endpoint can hand the biologist
 * the choice instead of silently guessing.
 *
 * Pure: no store, no ids minted beyond the deterministic join id, no writes.
 * Candidate labels and record ids ride through verbatim from
 * `BindingCandidate`; no scores, snippets, ontology terms or default
 * selection are invented here.
 */

import type { AgentClarificationRequest } from '../ai/types.js';
import type { RoleBindingProposals, RoleProposal } from './roleBindingProposal.js';

function cardOf(protocolId: string, role: RoleProposal): AgentClarificationRequest {
  const labels = role.candidates.map((candidate) => candidate.label);
  return {
    // Derived from the role's own coordinates: two runs over the same store
    // produce byte-identical cards (no random or timestamped id).
    id: `role-binding-${protocolId}-${role.roleId}`,
    kind: role.roleKind,
    prompt: `Which candidate should bind role '${role.roleId}'? Candidates: ${labels.join(', ')}`,
    origin: 'harness',
    menuProvider: 'choice',
    roleId: role.roleId,
    // Already-resolved record ids, in the proposal order (sorted byRecordId).
    options: role.candidates.map((candidate) => ({ id: candidate.recordId, label: candidate.label })),
  };
}

/** One card per `ambiguous` role; `proposed` and `unbound` roles yield none. */
export function clarificationRequestsFor(proposals: RoleBindingProposals): AgentClarificationRequest[] {
  const cards: AgentClarificationRequest[] = [];
  for (const { protocolId, roles } of proposals.protocols) {
    for (const role of roles) {
      if (role.state === 'ambiguous') {
        cards.push(cardOf(protocolId, role));
      }
    }
  }
  return cards;
}
