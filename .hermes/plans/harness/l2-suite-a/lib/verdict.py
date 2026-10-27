"""The driver's RE-ENCODED honest-outcome verdict — the SAME discriminated
verdict as server/src/ai/honestOutcome.ts (L2-FREEFORM-1's committed helper).

ONE implementation lives in TS (honestOutcome.ts, consumed by the driver via
lib/honest-cli.ts — OQ3 ruling (ii), no drift surface); THIS module is the
python re-encoding the driver uses in-line. The pinned vitest parity pin
(server/src/ai/L2SuiteA.honestOutcome.parity.test.ts) feeds BOTH the same
eleven fixture rows (FREEFORM acceptance #2 (a)-(e) verbatim, extended by
the D-1 ruling's RED-SHAPE (f)-(i) [L2-FREEFORM-1F] and the (j) null
anti-ghost pin [fix run 1, advc D5]; (g) is two rows, g1/g2) and asserts identical
verdicts — drift between the two encodings is a defect (B-pair: the driver
must not silently classify where the helper throws).

Structural only: reads the result's own channels and the probe's own id sets —
zero vocabulary, zero name literals.
"""


class HonestOutcomeError(Exception):
    """The result is NONE of the four honest outcomes (the trichotomy + the
    action-delivered arm, L2-FREEFORM-1F; or an unbound event rode through) —
    the delivered-channel dump rides the message."""


VERDICTS = ("events-bound", "cards", "honest-failure", "action-delivered")


def _channel_dump(result):
    channels = {}
    for key, value in (result or {}).items():
        if isinstance(value, list):
            channels[key] = "array(%d)" % len(value)
        elif isinstance(value, str):
            channels[key] = "string(%d chars)" % len(value)
        else:
            channels[key] = value
    return str(sorted(channels.items()))


def _event_labware_id(event):
    if not isinstance(event, dict):
        return None
    labware_id = event.get("labwareId")
    if isinstance(labware_id, str) and labware_id:
        return labware_id
    return None


def classify(result, context=None):
    """Classify a delivered draft result against the trichotomy.

    Returns one of 'events-bound' | 'cards' | 'honest-failure' |
    'action-delivered', or raises HonestOutcomeError on the silent shape /
    the unbound raw-label shape
    (mirror of assertHonestOutcome's throw contract; the driver treats the
    raise as verdict None + the recorded dump).
    """
    result = result or {}
    cards = result.get("clarificationRequests") or []
    cards = cards if isinstance(cards, list) else []
    # BYTE-MIRROR of honestOutcome.ts: `typeof error === 'string' &&
    # error.length > 0` — NOT .strip(): a whitespace-only error string is
    # "errored" in the TS helper (the parity pin would catch a drift here).
    errored = isinstance(result.get("error"), str) and len(result["error"]) > 0
    events = result.get("events") or []
    events = events if isinstance(events, list) else []

    if len(events) > 0:
        bound = set()
        if context:
            bound |= set(context.get("deckIds") or [])
            bound |= set(context.get("resolvedIds") or [])
        for event in events:
            labware_id = _event_labware_id(event)
            # An event with no labware identity carries nothing to bind. A
            # string labwareId outside the bound sets (when the probe supplies
            # them) is the shipped defect: raise (H1 post-merge contract).
            if labware_id is not None and context is not None and labware_id not in bound:
                raise HonestOutcomeError(
                    "assertHonestOutcome: NOT an honest outcome — events>0 with an "
                    "UNBOUND raw-label labwareId (%r) and no cards, no error. "
                    "Delivered channels: %s" % (labware_id, _channel_dump(result)))
        return "events-bound"

    # H4: the error outranks the cards — the escalation shape (error + the
    # standing question) is the honest failure, not an answerable cards turn.
    # The error also outranks the action arm: the server's emit site makes
    # error and deckLayout mutually exclusive (defensive order, D-1 ruling).
    if errored:
        return "honest-failure"

    # L2-FREEFORM-1F (D-1): the action-delivered arm — BYTE-MIRROR of
    # honestOutcome.ts's structural predicate:
    #   `deckLayout !== null && typeof deckLayout === 'object' &&
    #    !Array.isArray(deckLayout)` + `typeof platformId === 'string' &&
    #    platformId.length > 0` + `typeof variantId === 'string' &&
    #    variantId.length > 0`. In python a JSON object is a dict (a non-null,
    # non-array object); null arrives as None and an array as list — both
    # fail the isinstance check, matching the TS expression-for-expression.
    # Structural only: no registry lookup, no id literals (zero-vocabulary
    # contract). {deckLayout:{}}, empty ids, or null stay the silent shape
    # (the anti-ghost pins) and fall through to the raise.
    deck_layout = result.get("deckLayout")
    if isinstance(deck_layout, dict):
        platform_id = deck_layout.get("platformId")
        variant_id = deck_layout.get("variantId")
        if (
            isinstance(platform_id, str) and len(platform_id) > 0
            and isinstance(variant_id, str) and len(variant_id) > 0
        ):
            return "action-delivered"

    if len(cards) > 0:
        return "cards"
    raise HonestOutcomeError(
        "assertHonestOutcome: NOT an honest outcome — success with zero bound "
        "events, zero cards, no error (the silent success-with-zero-mountable). "
        "Delivered channels: %s" % _channel_dump(result))
