import type { FixItSkill } from './types.js';

export const loweringDebug: FixItSkill = {
  name: 'lowering-debug',
  triggersWhen:
    'the right EVENTS are emitted but their parameters are wrong — wrong volume, wrong source/dest '
    + 'slot, wrong well address, wrong direction, wrong t_offset. The bug is in how a high-level '
    + 'intent lowers to primitives, not in noun resolution or event-graph structure.',
  tools: ['probe', 'probe_pass', 'inspect_events', 'verify'],
  promptText: [
    'SKILL: lowering-debug',
    '  1. probe(failing-prompt) — confirm events ARE emitted but one or more parameter values',
    '     diverge from expected.',
    '  2. probe_pass(failing-prompt) — list every pass that ran. Identify the pass that produces',
    '     your event type (lower_protocol_intent, expand_protocol, compute_volumes, apply_directives,',
    '     etc.). Lowering bugs are usually in one of these.',
    '  3. probe_pass(failing-prompt, "<suspected-pass>") — read its intermediate output. Compare',
    '     against the next pass downstream: the boundary where the param value first goes wrong is',
    '     the file that owns the bug.',
    '  4. inspect_events(failing-prompt, position: N) on the offending event — its colocated',
    '     resolvedRefs/resolvedLabwareRefs may show that the param was wrong from the inputs (push',
    '     diagnosis upstream) or right at the inputs and wrong at the event (pass logic).',
    '  5. Cap reading at 2 source files; re-probe and re-verify after each edit.',
  ].join('\n'),
};
