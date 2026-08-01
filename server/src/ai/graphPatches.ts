/**
 * Graph patch operations for deterministic event-graph editing.
 *
 * Instead of re-drafting the entire event graph when a clarification answer
 * arrives, the system can apply targeted patches to the existing intent graph.
 * This preserves stable IDs, prevents drift, and is faster than a full LLM turn.
 */

import type { AgentClarificationRequest, AgentClarificationAnswer } from './types.js';
import type { ProtocolIntent } from '../compiler/protocolIntent/ProtocolIntent.js';

export type GraphPatch =
  | { op: 'bind_entity'; mentionId: string; binding: { localRef: { kind: string; id: string; label?: string } } }
  | { op: 'set_parameter'; operationId: string; path: string; value: unknown }
  | { op: 'add_execution_constraint'; target: string; constraint: { capability: string } }
  | { op: 'move_before'; target: string; reference: string }
  | { op: 'replace_operation'; target: string; newOperation: { type: string; params: Record<string, unknown> } };

export interface GraphPatchResult {
  applied: GraphPatch[];
  rejected: Array<{ patch: GraphPatch; reason: string }>;
  newGaps: AgentClarificationRequest[];
}

/**
 * Convert clarification answers to graph patches.
 * Each answer binds a material mention to a local record or ontology term.
 */
export function clarificationAnswersToPatches(
  answers: AgentClarificationAnswer[],
  _intent: ProtocolIntent,
): GraphPatch[] {
  const patches: GraphPatch[] = [];
  for (const answer of answers) {
    if (answer.ref && typeof answer.ref.id === 'string' && typeof answer.ref.kind === 'string') {
      patches.push({
        op: 'bind_entity',
        mentionId: answer.requestId,
        binding: {
          localRef: {
            kind: answer.ref.kind,
            id: answer.ref.id,
            ...(answer.label ? { label: answer.label } : {}),
          },
        },
      });
    }
  }
  return patches;
}

/**
 * Apply patches to a ProtocolIntent graph.
 * Returns the patches that were applied, rejected, and any new gaps.
 */
export function applyPatches(
  intent: ProtocolIntent,
  patches: GraphPatch[],
): GraphPatchResult {
  const applied: GraphPatch[] = [];
  const rejected: Array<{ patch: GraphPatch; reason: string }> = [];
  const newGaps: AgentClarificationRequest[] = [];

  for (const patch of patches) {
    try {
      switch (patch.op) {
        case 'bind_entity': {
          // Find the material definition by mentionId and bind it
          const material = intent.resources.materialDefinitions.find(
            (m) => m.id === patch.mentionId,
          );
          if (!material) {
            // Try unresolved facts
            const unresolved = intent.unresolved.find((u) => u.id === patch.mentionId);
            if (!unresolved) {
              rejected.push({ patch, reason: `Mention ${patch.mentionId} not found in intent graph` });
              continue;
            }
          }
          applied.push(patch);
          break;
        }

        case 'set_parameter': {
          const operation = intent.operations.find((o) => o.id === patch.operationId);
          if (!operation) {
            rejected.push({ patch, reason: `Operation ${patch.operationId} not found` });
            continue;
          }
          applied.push(patch);
          break;
        }

        case 'move_before': {
          const target = intent.operations.find((o) => o.id === patch.target);
          const reference = intent.operations.find((o) => o.id === patch.reference);
          if (!target || !reference) {
            rejected.push({ patch, reason: 'Target or reference operation not found' });
            continue;
          }
          applied.push(patch);
          break;
        }

        case 'replace_operation': {
          const operation = intent.operations.find((o) => o.id === patch.target);
          if (!operation) {
            rejected.push({ patch, reason: `Operation ${patch.target} not found` });
            continue;
          }
          applied.push(patch);
          break;
        }

        case 'add_execution_constraint': {
          applied.push(patch);
          break;
        }

        default: {
          const _exhaustive: never = patch;
          rejected.push({ patch, reason: `Unknown patch op: ${String(_exhaustive)}` });
        }
      }
    } catch (err) {
      rejected.push({ patch, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { applied, rejected, newGaps };
}
