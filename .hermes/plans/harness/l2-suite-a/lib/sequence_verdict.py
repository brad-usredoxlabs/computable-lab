"""L2-SUITE-B — the driver's RE-ENCODED sequence-leg verdict — the SAME
discriminated verdict as lib/sequence-leg.ts (classifySequenceLegOutcome).

ONE implementation lives in TS (lib/sequence-leg.ts, the committed sequence-
leg classifier — OQ3 ruling: ONE TS implementation home per leg; the python
driver shells out to lib/sequence-leg-cli.ts as feed #2). THIS module is the
python re-encoding the driver uses in-line (feed #3). The pinned vitest parity
pin (server/src/ai/L2SuiteB.sequenceLeg.parity.test.ts) feeds ALL THREE the
same five sequence-leg fixtures and asserts identical verdicts — drift
between the encodings is a defect.

Structural only: reads the result's own channels, the turn's own frames, and
the probe's own id sets — zero operation vocabulary, zero revcomp vocabulary
(OQ3 (c)), zero name literals.
"""


class SequenceLegOutcomeError(Exception):
    """The turn is NONE of the three honest outcomes (or laundered a
    generic wall / an ungrounded ref through) — the delivered-channel
    dump rides the message."""


VERDICTS = ("proposal", "cards", "honest-failure")

# The error-text tokens that NAME a capability gap (BYTE-MIRROR of
# sequence-leg.ts CAPABILITY_CLASS_TOKENS): the sequence runtime's own
# error family (SequenceService.ts:141 + sequenceRuntime.ts inspectEndpoint),
# the orchestrator's sequence-channel walls, and the workspace_action
# COMPILE-REJECTION family (AgentOrchestrator.ts:3178-3182: success:true +
# the named refusal in notes — "success:false would ride the existing error
# surface and read as an endpoint failure. The corrective text rides the
# notes channel" — compileWorkspaceAction.ts:408's own text "did not resolve
# to any local term or workspace record"). The engine ids are ADDED from the
# probe's own request context (the contract menu) — never a hardcoded engine
# list.
CAPABILITY_CLASS_TOKENS = [
    "endpoint",
    "engine",
    "executable",
    "installed",
    "version",
    "sequence proposal",
    "sequence action",
    "did not resolve",
    "nothing was focused",
    "nothing was retrieved",
    "nothing was projected",
    # The compileWorkspaceAction structural-refusal family: every
    # "A <verb>-<thing> action requires a `<field>`" / "requires a target"
    # diagnostic names the exact gap the model's envelope left open
    # (compileWorkspaceAction.ts:650 missing-`surface`, :666 missing-target,
    # :479/:499 missing tab/recordId). Surfaced live 2026-10-27 (drive
    # L2SB-195104 P9, UNSUPPORTED_SURFACE on notes): the text NAMED the gap
    # but the token list never enumerated this family -> silent-shape raise.
    # Two keys, each a stable substring of the server's OWN diagnostic texts:
    # 'requires a `' covers the backticked-field refusals, 'requires a target'
    # the focus-family. Deliberately NOT a bare 'requires a' — a generic prose
    # line containing that phrase must stay a THROW (fixture (g) class).
    "requires a `",
    "requires a target",
]


def _channel_dump(result):
    channels = []
    for key, value in (result or {}).items():
        if isinstance(value, list):
            channels.append("%s: array(%d)" % (key, len(value)))
        elif isinstance(value, str):
            channels.append("%s: string(%d chars)" % (key, len(value)))
        else:
            channels.append("%s: %s" % (key, "null" if value is None else type(value).__name__))
    return ", ".join(sorted(channels))


def _collect_record_refs(value, out=None):
    """A record ref the proposal points at a mutable record: a dict with
    kind=='record', a non-empty string id, and type != 'record-revision'
    (revision pins carry REV-* ids — revision identities, not context
    members; excluded by shape, mirroring ref.schema.yaml)."""
    if out is None:
        out = []
    if isinstance(value, list):
        for v in value:
            _collect_record_refs(v, out)
        return out
    if isinstance(value, dict):
        if (value.get("kind") == "record"
                and isinstance(value.get("id"), str) and value.get("id")
                and value.get("type") != "record-revision"):
            out.append(value["id"])
        for v in value.values():
            _collect_record_refs(v, out)
    return out


def _is_named_wall(text, context=None):
    lower = text.lower()
    tokens = list((context or {}).get("engineIds") or []) + CAPABILITY_CLASS_TOKENS
    return any(t and t.lower() in lower for t in tokens)


def _has_nav_frame(frames):
    if not isinstance(frames, list):
        return False
    for f in frames:
        if not isinstance(f, dict):
            continue
        if f.get("type") != "agent_action":
            continue
        action = f.get("action")
        if isinstance(action, dict) and action:
            return True
    return False


def _named_wall_texts(result, frames):
    """The turn's OWN named-wall text on channels OTHER than 'error': the
    done result's 'notes' (the workspace_action compile-rejection arm rides
    its corrective text there with success:true —
    AgentOrchestrator.ts:3178-3182) and the 'pipeline_diagnostics' frames'
    diagnostic messages (outcome 'gap', pass_id
    'workspace-action-compile'). Read as strings; no parsing of any prose
    meaning. (BYTE-MIRROR of sequence-leg.ts namedWallTexts.)"""
    texts = []
    notes = result.get("notes") if isinstance(result, dict) else None
    if isinstance(notes, list):
        for n in notes:
            if isinstance(n, str):
                texts.append(n)
    if isinstance(frames, list):
        for f in frames:
            if not isinstance(f, dict):
                continue
            if f.get("type") != "pipeline_diagnostics":
                continue
            diags = f.get("diagnostics")
            if isinstance(diags, list):
                for d in diags:
                    if isinstance(d, dict) and isinstance(d.get("message"), str):
                        texts.append(d["message"])
    return texts


def classify(result, frames=None, context=None):
    """Classify a delivered sequences-surface turn against the sequence
    trichotomy. Returns one of 'proposal' | 'cards' | 'honest-failure', or
    raises SequenceLegOutcomeError on the forbidden shapes (BYTE-MIRROR of
    lib/sequence-leg.ts: ungrounded-ref proposal — B2; generic failure wall
    — B6; the silent success-with-nothing)."""
    res = result if isinstance(result, dict) else {}
    # BYTE-MIRROR of the TS classifier / honestOutcome.ts: `typeof error ===
    # 'string' && error.length > 0` — NOT .strip(): a whitespace-only error
    # string is "errored" (the parity pin catches a drift here).
    errored = isinstance(res.get("error"), str) and len(res["error"]) > 0
    cards = res.get("clarificationRequests")
    cards = len(cards) if isinstance(cards, list) else 0
    proposal = res.get("sequenceProposal")
    proposal = proposal if isinstance(proposal, dict) else None

    # H4 mirror: the error outranks the cards.
    if errored:
        wall = res["error"]
        if _is_named_wall(wall, context):
            return "honest-failure"
        raise SequenceLegOutcomeError(
            "NOT an honest outcome — an error wall that does NOT name the gap "
            "(B6: a generic model-failure line is not a named wall). wall=%r. "
            "Delivered channels: %s" % (wall[:300], _channel_dump(res)))

    if proposal is not None:
        refs = _collect_record_refs(proposal)
        record_ids = (context or {}).get("recordIds")
        if record_ids is not None:
            bound = set(record_ids)
            ungrounded = [r for r in refs if r not in bound]
            if ungrounded:
                raise SequenceLegOutcomeError(
                    "NOT an honest outcome — a sequenceProposal with UNGrounded "
                    "record ref(s) %s not in the request's context.records (B2: "
                    "an ungrounded ref is not a proposal — the server guidance "
                    "forbids invented ids). Delivered channels: %s"
                    % (ungrounded, _channel_dump(res)))
        return "proposal"

    if _has_nav_frame(frames):
        return "proposal"

    if cards > 0:
        return "cards"

    # The workspace_action compile-rejection arm: success:true with NO
    # agent_action frame and the NAMED refusal riding the notes channel (or
    # the pipeline_diagnostics messages) — AgentOrchestrator.ts:3178-3182.
    # A NAMED wall here is an honest-failure; only a notes/diagnostics text
    # that NAMES the gap qualifies (a generic line does not — B6).
    for text in _named_wall_texts(res, frames):
        if _is_named_wall(text, context):
            return "honest-failure"

    raise SequenceLegOutcomeError(
        "NOT an honest outcome — success with no sequence proposal, no "
        "navigation frame, no clarification cards, no named wall (the silent "
        "success-with-nothing; REVISE-GHOST-1 in sequence form). Delivered "
        "channels: %s" % _channel_dump(res))
