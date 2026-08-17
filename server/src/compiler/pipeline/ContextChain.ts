/**
 * ContextChain — protocol chaining primitives (Plan 2, Phase A).
 *
 * The handoff between an upstream and a downstream protocol is a CONTEXT,
 * not a material-instance/aliquot. A downstream protocol declares input
 * context role(s) it consumes (protocol.inputContexts); a run binds each role
 * to a promoted source context (planned-run.sourceBindings -> CTX /
 * context-snapshot). CONSUMPTION IS AN EXPLICIT GATE: the downstream's first
 * action is a transfer OFF the bound source context's plate.
 *
 * Pure, deterministic — no store access. The caller (run compile) interleaves
 * the returned gate events as the downstream's opening actions.
 */

export interface InputContextLike {
  role: string;
  description?: string;
  sourceKind?: string;
  /** Whether the run should emit an explicit transfer-off-the-source. */
  consumesByDefault?: boolean;
}

export interface ContextRefLike {
  kind: string;
  type: string;
  id: string;
}

export interface SourceBindingLike {
  role: string;
  contextRef: ContextRefLike;
}

export interface ConsumptionEvent {
  eventId: string;
  event_type: 'transfer';
  details: {
    sourceContextRef: ContextRefLike;
    source_wells?: string[];
    dest?: { role: string; carrier?: string };
  };
  notes: string;
  role: string;
}

function contextSubjectType(kind?: string): string {
  return kind === 'plate-context' || kind === 'context-snapshot' ? 'plate' : 'context';
}

/**
 * Build the explicit consumption-gate events for a run's source bindings.
 * One transfer-off-the-source per binding whose input context consumes by
 * default. Returns [] when there are no bindings or all are declared not to
 * consume. Never throws — an unknown role simply yields no event.
 */
export function buildConsumptionEvents(
  bindings: SourceBindingLike[],
  inputContexts: InputContextLike[],
): ConsumptionEvent[] {
  const byRole = new Map(inputContexts.map((c) => [c.role, c]));
  const events: ConsumptionEvent[] = [];

  for (const binding of bindings) {
    const input = byRole.get(binding.role);
    // Only declared input contexts with consumption enabled emit a gate; an
    // unknown/undeclared role yields no event (no contract declared).
    if (!input || input.consumesByDefault === false) continue;
    const { role, contextRef } = binding;
    const subjectType = contextSubjectType(input?.sourceKind);
    events.push({
      eventId: `consume-${role}`,
      event_type: 'transfer',
      details: {
        sourceContextRef: contextRef,
        source_wells: [],
        dest: { role, carrier: subjectType },
      },
      notes: `Consume source ${subjectType} context ${contextRef.id} (role ${role}).`,
      role,
    });
  }

  return events;
}