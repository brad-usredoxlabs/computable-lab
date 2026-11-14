# AI deliverable channels are declared data, and every declared channel must have a treatment

Status: BINDING for the chat/agent surface. Architect decision, 2026-11-14, after the legacy-panel
audit (delegation batch deleg_08e3f846, every anchor re-verified in the trunk by grep).

## The problem this closes

A draft turn can deliver eleven different things (events, clarification requests, record creations,
labware additions, labware requirements, equipment requirements, deck layout, sequence proposals,
protocol edits, prose deliverables, instrument appliance jobs). The universal chat pane renders two of
them — events and clarifications — and silently drops the rest. The hook still accepts the callbacks
(`useAiChat.ts:743`, `onDeckLayout` declared at `:524`), but nothing under `app/src/agent/` registers or
renders them: three greps for `onDeckLayout`, `recordCreations`, `labwareAdditions` return zero hits.

The old pane (`AiTabPanel.tsx` at `ebbf5d4a8^`) rendered all five non-event channels with their own arms
(`:527`, `:535`, `:599`, `:600`, `:609`, `:611`, `:621`, `:622`, `:624`, `:625`, `:679`, `:680`, `:681`,
`:786`, `:787`, `:789`, `:790`, `:798`, `:799`). When it was deleted, the arms were not ported and
nothing noticed, because "does every channel have somewhere to go?" was never written down anywhere a
test could read it.

Result: prompt-1's sentence produces "No events generated" while a record proposal sits underneath,
invisible, and Accept writes it. Two gates graded this; both called it an empty turn.

## The rule

1. **The set of deliverable channels is DATA.** One declaration lists every channel a draft can carry,
   what it means, and how the surface must treat it. It lives under `schema/registry/` beside
   `surfaces.yaml`, which already declares the surfaces in exactly this way.
2. **Every declared channel has a declared treatment**, one of: `card` (rendered as a reviewable card),
   `mount` (applied to the editor as a ghost/preview), `navigate` (routes the person elsewhere),
   `wall` (reported as a named failure), or `answer` (prose, rendered as the message). There is no
   "ignore" state.
3. **An undeclared or unhandled channel is a NAMED failure, never silence.** If a turn delivers a
   channel with no treatment, the pane says which channel it could not show. A silent gap is the defect
   this decision exists to prevent.
4. **The emptiness rule derives from the declaration.** "The draft produced nothing" means *every
   declared channel was absent* — computed from the same data, not from a hand-maintained list in a
   predicate. One rule, one source.
5. **A tripwire enforces coverage.** A test fails when a channel is declared without a treatment, or
   when a channel arrives in code and is not declared. This is the mechanism that makes the class
   impossible to reintroduce by deleting a component.
6. **Port arms, not chrome.** The legacy sub-tab strip, the sidebar state machine and the warm-cache
   indicator were retired deliberately; they are not part of this. The protocol-edit diff arm already
   has a home (`ReviewAiPanel`).

## Where each consumer lives

- declaration: `schema/registry/ai-deliverable-channels/` (YAML + schema, validated by Ajv)
- renderer: the universal pane iterates the declaration; it holds no channel-name literals
- emptiness: the predicate reads the declaration
- tripwire: a client test asserting declared ⇄ handled, plus the lane's gate smoke

## Consequences

- Adding a channel (a new draft output) requires one data entry and one treatment implementation; the
  tripwire fails until both exist.
- Deleting a surface component can no longer silently drop a channel: coverage fails first.
- "Empty turn" becomes a message that names what the turn delivered, which is what the legacy wall did
  and what gate 6 and gate 7 both asked for.
