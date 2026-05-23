import type { FixItSkill } from './types.js';

export const eventStateDebug: FixItSkill = {
  name: 'event-state-debug',
  triggersWhen:
    'individual events look right per-event but interactions across events are wrong — wrong '
    + 'ordering, missing dependency, downstream events reference wrong state, labStateDelta is off, '
    + 'resolvedRefs/resolvedLabwareRefs misroute. (Events carry NO explicit dep edges in this '
    + 'codebase; ordering is array-position; deps are implicit through labStateDelta + resolved refs.)',
  tools: ['inspect_events', 'probe_pass', 'probe', 'verify'],
  promptText: [
    'SKILL: event-state-debug',
    '  1. inspect_events(failing-prompt) — list mode. Skim the sequence; note which position is',
    '     wrong (out of order, missing, extra, or referencing the wrong labware).',
    '  2. inspect_events(failing-prompt, position: N) — detail mode on the offending event. The',
    '     colocated labStateDelta + resolvedLabwareRefs + resolvedRefs are your dep proxy:',
    '       - what this event READS comes from resolvedRefs / resolvedLabwareRefs',
    '       - what this event PRODUCES (or consumes) shows up in labStateDelta entries',
    '       - cross-reference manually; there are no explicit edges to follow.',
    '  3. probe_pass(failing-prompt, "lab_state") — see how state is folded across events. A wrong',
    '     downstream snapshot points at a state-folding bug. probe_pass on "resolve_references" /',
    '     "resolve_labware" / "lower_protocol_intent" to see where the ref or event was produced.',
    '  4. If the bug is in event-emitting code (not state-folding), open the pass identified in (3)',
    '     and read its event-construction logic.',
    '  5. After every edit: re-verify.',
  ].join('\n'),
};
