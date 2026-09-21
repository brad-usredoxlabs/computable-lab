/**
 * Which submit call wins when a turn carries more than one.
 *
 * The emission contract is explicit (submitSuggestionTool.ts): "You MUST finish
 * this turn by calling the agent_intent tool exactly once." Models break that
 * contract — observed live 2026-09-20:
 *
 *   turn 1 finish=tool_calls toolCalls=2 [agent_intent,agent_intent]
 *
 * and the old selection took the FIRST match and ignored the rest in silence. So a
 * turn that emitted a create_record call and then a real event-graph draft lost the
 * draft: the biologist saw "create 1: material HepG2 cells" and no proposal, with
 * nothing in the log to say a draft had been thrown away.
 *
 * Rules, in order:
 *   1. a call that actually carries DRAFT EVENTS wins — it is the experiment the
 *      biologist asked for, and the alternative is ordinarily a side-errand;
 *   2. otherwise the first call wins (the model's own ordering);
 *   3. everything not chosen is reported, never dropped in silence.
 */

export interface SubmitCallLike {
  function: { name: string; arguments: string };
}

export interface SubmitCallSelection<T extends SubmitCallLike> {
  chosen: T | null;
  /** Calls the model also emitted, in the order it emitted them. */
  ignored: Array<{ name: string; reason: string }>;
}

const SUBMIT_TOOL_NAMES = new Set(['agent_intent', 'submit_suggestion', 'compile_event_graph_draft']);

function eventCountOf(call: SubmitCallLike): number {
  try {
    const args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
    const events = args['events'];
    return Array.isArray(events) ? events.length : 0;
  } catch {
    return 0;
  }
}

export function selectSubmitCall<T extends SubmitCallLike>(
  toolCalls: readonly T[] | undefined,
): SubmitCallSelection<T> {
  const submits = (Array.isArray(toolCalls) ? toolCalls : []).filter((call) =>
    SUBMIT_TOOL_NAMES.has(call?.function?.name ?? ''),
  );
  if (submits.length === 0) return { chosen: null, ignored: [] };
  if (submits.length === 1) return { chosen: submits[0]!, ignored: [] };

  const withEvents = submits.filter((call) => eventCountOf(call) > 0);
  const chosen = withEvents[0] ?? submits[0]!;
  const ignored = submits
    .filter((call) => call !== chosen)
    .map((call) => ({
      name: call.function.name,
      reason:
        eventCountOf(call) > 0
          ? 'a second draft in the same turn'
          : 'no draft events in it',
    }));
  return { chosen, ignored };
}