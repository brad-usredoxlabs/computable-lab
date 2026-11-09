#!/usr/bin/env python3
"""L2-LABSTATE-CONTENTS-1 — COMMITTED FIXTURE TEST for drive.py's parse_arm
(FIX RUN 2, l2t0915 — closes advc2 N1 BLOCKER + D3 MAJOR).

WHY THIS FILE EXISTS
--------------------
parse_arm (the drive's capture parser) and the emitter it parses
(createLabStatePass, ChatbotCompilePasses.ts:1895) drifted silently: the
pre-fix parser handed the WHOLE REST OF THE LINE to json.loads per token,
which only ever worked for the LAST token. Commit 60db0a3a appended
unresolved_codes= AFTER after_labware=, so after_labware degraded to a raw
string and the drive's four acceptance legs could never pass. The absent
emitter<->parser test is why that drifted — this fixture pins the
EMITTER'S EXACT LINE FORMAT round-tripping through parse_arm into
dicts/lists, and it is FORM-AGNOSTIC: it pins the parse of emitter-shaped
lines, never the drive's TURNS strings (orch owns the TURNS edit with the
re-drive, ruling Q4).

THE EMITTER TEMPLATE (python port of ChatbotCompilePasses.ts:1895)
------------------------------------------------------------------
    [lab_state ARM-LOG] turn=${snapshot.turnIndex}
      prior_labware=${JSON.stringify(summarize(prior))}
      after_labware=${JSON.stringify(summarize(snapshot))}
      unresolved_codes=${JSON.stringify([...new Set(unresolvedCodes)].sort())}

JSON.stringify emits COMPACT JSON (no spaces) -> python json.dumps(x,
separators=(",", ":")). `turn=` is a raw number (NOT JSON.stringify'd).
summarize() mirrors ChatbotCompilePasses.ts:1875-1885: labware id -> well
id -> [{materialId, kind?}] with EMPTY wells dropped and `kind` omitted
when undefined. (Cross-language JSON byte-identity is NOT claimed — the
fixture pins the SHAPE: token order, compactness, bounded JSON payloads.)

The PRE-FIX (pre-60db0a3a) emitter form is the SAME template WITHOUT the
trailing unresolved_codes= token — the 3-token line the captured receipts
(20261030T063626Z) still carry. parse_arm must tolerate BOTH forms.

RUN:  python3 test_parse_arm.py     (plain python3, no deps; exit 0 = pass)
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import drive  # noqa: E402  (the harness under test — parse_arm lives here)

PASS = 0


def check(name, cond):
    global PASS
    if not cond:
        print("FAIL %s" % name)
        sys.exit(1)
    PASS += 1
    print("ok   %s" % name)


# ---------------------------------------------------------------------------
# The emitter (python port of the TS template above).
# ---------------------------------------------------------------------------
def summarize(snapshot_labware):
    """ChatbotCompilePasses.ts:1875-1885: labwareId -> {wellId: [{materialId,
    kind?}]} — empty wells dropped, kind omitted when undefined."""
    out = {}
    for iid, inst in snapshot_labware.items():
        wells = {}
        for wid, mats in inst.items():
            if len(mats) > 0:
                wells[wid] = [
                    dict({"materialId": m["materialId"]},
                         **({"kind": m["kind"]} if m.get("kind") is not None else {}))
                    for m in mats]
        out[iid] = wells
    return out


def compact(x):
    """JSON.stringify compact (the emitter's serialization)."""
    return json.dumps(x, separators=(",", ":"))


def emit_arm(turn, prior, after, codes):
    """The EMITTER's exact line (ChatbotCompilePasses.ts:1895), 4-token form
    (current, post-60db0a3a). compact JSON, fixed token order."""
    return ("[lab_state ARM-LOG] turn=%d prior_labware=%s after_labware=%s "
            "unresolved_codes=%s" % (
                turn, compact(summarize(prior)), compact(summarize(after)),
                compact(sorted(set(codes)))))


def emit_arm_prefix(turn, prior, after):
    """The PRE-FIX (pre-60db0a3a) 3-token form — the same template without
    the trailing unresolved_codes= token."""
    return ("[lab_state ARM-LOG] turn=%d prior_labware=%s after_labware=%s" % (
        turn, compact(summarize(prior)), compact(summarize(after))))


# The REAL captured receipts line (20261030T063626Z, turn A — pre-fix 3-token
# form, verbatim from the receipt). Historical fixture, not a TURNS string.
REAL_RECEIPTS_LINE = (
    '[lab_state ARM-LOG] turn=1 prior_labware={} after_labware={"LWI-1":{}}'
)

# ---------------------------------------------------------------------------
# The drive's LEG predicates, VERBATIM from drive.py (so the probes below run
# on REAL parse_arm output, not hand-built dicts).
# ---------------------------------------------------------------------------
def leg1_pred(t1_after):
    # drive.py LEG 1 turn1_contents
    return isinstance(t1_after, dict) and any(
        isinstance(w, dict) and w for w in t1_after.values() if isinstance(w, dict))


def _has_material(pay, mid):
    # drive.py LEG 2 helper (verbatim)
    if not isinstance(pay, dict):
        return False
    for wmap in pay.values():
        if not isinstance(wmap, dict):
            continue
        for mats in wmap.values():
            if isinstance(mats, list):
                for m in mats:
                    if isinstance(m, dict) and m.get("materialId") == mid:
                        return True
    return False


def leg3_pred(t2_after):
    # drive.py LEG 3 turn2_ledger_populated
    return isinstance(t2_after, dict) and any(
        isinstance(w, dict) and w for w in t2_after.values() if isinstance(w, dict))


def leg4_pred(tx_arm, tx_diag_wire=None):
    """drive.py LEG 4 control_never_guess (verbatim core), on a per-turn
    arm_log list (each entry a parse_arm result)."""
    tx_arm = tx_arm or []
    tx_after = tx_arm[-1].get("after_labware") if tx_arm else None
    tx_prior = tx_arm[-1].get("prior_labware") if tx_arm else None
    tx_diag_wire = [
        d for fr in (tx_diag_wire or [])
        if isinstance(fr, dict)
        for d in (fr.get("diagnostics") or [])
        if isinstance(d, dict)
        and str(d.get("pass_id") or "") == "lab_state"
        and str(d.get("code") or "").startswith("lab_state_unresolved")]
    tx_diag_arm_codes = [
        c for c in (tx_arm[-1].get("unresolved_codes") or []) if isinstance(c, str)
        and c.startswith("lab_state_unresolved")] if tx_arm else []
    tx_diag_count = len(tx_diag_wire) + len(tx_diag_arm_codes)
    return (bool(tx_arm) and tx_prior is not None and tx_after is not None
            and tx_after == tx_prior and tx_diag_count >= 1), tx_diag_count


# ---------------------------------------------------------------------------
# 1. THE ROUND-TRIP: emitter line -> parse_arm -> dicts/lists (the pin that
#    was missing). Form-agnostic: shapes only, never the TURNS strings.
# ---------------------------------------------------------------------------
def test_round_trip():
    prior = {"LWI-1": {"A1": [{"materialId": "mat-x", "kind": "raw"}]}}
    after = {"LWI-1": {"A1": [{"materialId": "mat-x", "kind": "raw"}],
                       "A2": [{"materialId": "mat-y"}]},
             "LWI-2": {}}
    codes = ["lab_state_unresolved_labware_reference", "lab_state_unresolved_labware_reference"]

    line = emit_arm(2, prior, after, codes)
    p = drive.parse_arm(line)
    check("rt4.turn tag only", p["turn"] == "2")
    check("rt4.prior dict", isinstance(p["prior_labware"], dict))
    check("rt4.after dict", isinstance(p["after_labware"], dict))
    check("rt4.codes list", isinstance(p["unresolved_codes"], list))
    check("rt4.prior round-trips", p["prior_labware"] == summarize(prior))
    check("rt4.after round-trips", p["after_labware"] == summarize(after))
    check("rt4.codes sorted-unique", p["unresolved_codes"]
          == ["lab_state_unresolved_labware_reference"])

    # EMPTY-payload round trip (the plate-placement turn: after gains an
    # EMPTY-wells instance — summarize keeps the instance, drops no wells).
    line2 = emit_arm(1, {}, {"LWI-1": {}}, [])
    p2 = drive.parse_arm(line2)
    check("rt4.empty prior {} stays dict", p2["prior_labware"] == {})
    check("rt4.empty after dict", p2["after_labware"] == {"LWI-1": {}})
    check("rt4.empty codes [] stays list", p2["unresolved_codes"] == [])


# ---------------------------------------------------------------------------
# 2. PRE-FIX 3-TOKEN FORM (the receipts' format) — after_labware is a dict,
#    unresolved_codes absent -> None.
# ---------------------------------------------------------------------------
def test_pre_fix_form():
    p = drive.parse_arm(REAL_RECEIPTS_LINE)
    check("pre.turn tag only", p["turn"] == "1")
    check("pre.prior dict", p["prior_labware"] == {})
    check("pre.after dict (NOT a string)", isinstance(p["after_labware"], dict)
          and p["after_labware"] == {"LWI-1": {}})
    check("pre.codes absent->None", p["unresolved_codes"] is None)

    # a non-trivial 3-token line (not just the empty-wells receipts shape)
    line = emit_arm_prefix(3, {"LWI-9": {"B4": [{"materialId": "m", "kind": "raw"}]}},
                           {"LWI-9": {"B4": [{"materialId": "m", "kind": "raw"}]}})
    p2 = drive.parse_arm(line)
    check("pre.nontrivial after dict",
          p2["after_labware"] == {"LWI-9": {"B4": [{"materialId": "m", "kind": "raw"}]}})
    check("pre.nontrivial codes None", p2["unresolved_codes"] is None)
    check("pre.nontrivial turn", p2["turn"] == "3")


# ---------------------------------------------------------------------------
# 3. turn= parses to the TURN TAG ONLY (pre-fix `rest.strip()` captured the
#    whole tail — the named pre-existing breakage).
# ---------------------------------------------------------------------------
def test_turn_tag_only():
    line = emit_arm(7, {"L": {"A1": [{"materialId": "m"}]}},
                    {"L": {"A1": [{"materialId": "m"}]}}, [])
    p = drive.parse_arm(line)
    check("turn.tag is the bare number", p["turn"] == "7")
    check("turn.no token bleed into tag",
          "prior_labware=" not in p["turn"] and "after_labware=" not in p["turn"])


# ---------------------------------------------------------------------------
# 4. TOKENS INSIDE JSON PAYLOADS ARE NOT SEPARATORS (the depth-0 rule).
# ---------------------------------------------------------------------------
def test_token_in_payload():
    prior = {"L": {"A1": [{"materialId": "turn=9", "kind": "after_labware={nope"}]}}
    line = emit_arm(5, prior, prior, ["c1"])
    p = drive.parse_arm(line)
    check("inpay.turn is the REAL tag", p["turn"] == "5")
    check("inpay.after dict intact", p["after_labware"]
          == {"L": {"A1": [{"materialId": "turn=9", "kind": "after_labware={nope"}]}})
    check("inpay.codes intact", p["unresolved_codes"] == ["c1"])
    # a brace + escaped quote INSIDE a JSON string cannot terminate the
    # bounded slice early (the payload is built by the SAME compact
    # serializer the emitter uses, so the escaping is emitter-identical):
    tricky = {"L": {"A1": [{"materialId": 'a"b}c'}]}}
    check("inpay.escaped-quote payload",
          drive.parse_arm(
              "[lab_state ARM-LOG] turn=1 prior_labware=%s after_labware=%s "
              "unresolved_codes=[]" % (compact({}), compact(tricky)))["after_labware"]
          == {"L": {"A1": [{"materialId": 'a"b}c'}]}})


# ---------------------------------------------------------------------------
# 5. MALFORMED LINES -> all-None per field, NO exception (garbage tolerance).
# ---------------------------------------------------------------------------
def test_garbage():
    for line in ("totally not an arm log line",
                 "",
                 "[lab_state ARM-LOG]"):            # prefix only
        p = drive.parse_arm(line)
        check("garbage all-None %r" % line[:30],
              p["turn"] is None and p["prior_labware"] is None
              and p["after_labware"] is None and p["unresolved_codes"] is None)
    # unbalanced / non-JSON payload: no exception; the well-formed fields
    # still parse, the broken one degrades to None (partial salvage).
    p = drive.parse_arm("turn=1 after_labware={oops")
    check("garbage.no exception (unbalanced)", p["after_labware"] is None)
    check("garbage.partial salvage turn", p["turn"] == "1")
    p2 = drive.parse_arm("turn=1 after_labware=not-json unresolved_codes=[]")
    check("garbage.not-json degrades to None", p2["after_labware"] is None)
    check("garbage.well-formed neighbor survives", p2["unresolved_codes"] == [])
    check("garbage.turn salvage", p2["turn"] == "1")


# ---------------------------------------------------------------------------
# 6. D3 (MAJOR) — the LEG predicates run on REAL parse_arm output (NOT
#    hand-built dicts — the exact data path the legs consume in production).
#    Mutation-style probes on emitter-shaped lines:
#    - no-op control (after == prior, both captured) + unresolved code
#      -> LEG4 TRUE (the pre-N1 parser could NEVER yield this);
#    - no-op control WITHOUT a code -> LEG4 False (condition 3 unsatisfied);
#    - WROTE-turn (after != prior) -> LEG4 False (the no-op proof must bite);
#    - PRE-FIX 3-token no-op line -> LEG4 False (condition 3 is
#      unsatisfiable on that form — the codes channel does not exist yet);
#    - garbage line -> LEG4 False (no exception).
#    Plus the LEG1/LEG2/LEG3 satisfiability probes (N1 made all four
#    unreachable).
# ---------------------------------------------------------------------------
def test_leg_probes():
    # no-op control: the deck already holds LWI-1 with contents; the
    # ghost-plate add no-ops (after == prior) and the fold emits the
    # never-guess diagnostic code.
    held = {"LWI-1": {"A1": [{"materialId": "mat-seed", "kind": "raw"}]}}
    noop_line = emit_arm(4, held, held,
                         ["lab_state_unresolved_labware_reference"])
    ok, cnt = leg4_pred([drive.parse_arm(noop_line)])
    check("d3.noop control LEG4 TRUE (mutation probe: real parse_arm)",
          ok is True and cnt >= 1)

    # mutant: same no-op but the fold emitted NO diagnostic codes ->
    # the never-guess surface is absent -> the leg must FAIL.
    ok2, _ = leg4_pred([drive.parse_arm(emit_arm(4, held, held, []))])
    check("d3.noop without code LEG4 False", ok2 is False)

    # mutant: a turn that WROTE contents (after != prior) -> not a no-op ->
    # the leg must FAIL (the after == prior equality has teeth).
    wrote = {"LWI-1": {"A1": [{"materialId": "mat-seed", "kind": "raw"}],
                       "C9": [{"materialId": "mat-ghost"}]}}
    ok3, _ = leg4_pred([drive.parse_arm(
        emit_arm(4, held, wrote, ["lab_state_unresolved_labware_reference"]))])
    check("d3.wrote turn LEG4 False", ok3 is False)

    # pre-fix form: the 3-token line CANNOT carry the codes channel ->
    # condition (3) unsatisfiable -> False even when prior == after.
    pre_noop = emit_arm_prefix(4, held, held)
    ok4, cnt4 = leg4_pred([drive.parse_arm(pre_noop)])
    check("d3.pre-fix form LEG4 False (no codes channel)",
          ok4 is False and cnt4 == 0)

    # the REAL receipts line (3-token, prior {} vs after {"LWI-1":{}}) —
    # it is a WROTE turn (plate placement) on the pre-fix form: both the
    # no-op equality AND the codes channel fail -> False.
    ok5, _ = leg4_pred([drive.parse_arm(REAL_RECEIPTS_LINE)])
    check("d3.real receipts line LEG4 False (wrote turn)", ok5 is False)

    # garbage: an arm_log that parses to nothing must FAIL the leg without
    # raising.
    ok6, _ = leg4_pred([drive.parse_arm("garbage line")])
    check("d3.garbage LEG4 False (no exception)", ok6 is False)

    # empty arm_log (the fold never ran) -> the original D3 vacuous path
    # (None == None) must STILL be False (the pre-fix vacuity is gone).
    ok7, _ = leg4_pred([])
    check("d3.empty arm_log LEG4 False (vacuity gone)", ok7 is False)

    # N1 consequence probes: the other three legs, satisfiable through the
    # REAL parse_arm output.
    add_line = emit_arm(1, {"LWI-1": {}},
                        {"LWI-1": {"A1": [{"materialId": "mat-A", "kind": "raw"}],
                                   "A2": [{"materialId": "mat-A", "kind": "raw"}]}},
                        [])
    p1 = drive.parse_arm(add_line)
    check("n1.LEG1 satisfiable (after is a dict, populated)",
          leg1_pred(p1["after_labware"]) is True)

    # LEG 2: turn 1b's prior must already contain turn 1's contents.
    t1_after = drive.parse_arm(add_line)["after_labware"]
    mid_a = None
    if isinstance(t1_after, dict):
        for wmap in t1_after.values():
            if isinstance(wmap, dict):
                for mats in wmap.values():
                    if isinstance(mats, list) and mats and isinstance(mats[0], dict):
                        mid_a = mats[0].get("materialId")
                        break
            if mid_a:
                break
    t1b_prior = drive.parse_arm(emit_arm(
        2, t1_after, t1_after, []))["prior_labware"]
    check("n1.LEG2 satisfiable (prior carries turn-1 materialId)",
          bool(mid_a) and _has_material(t1b_prior, mid_a))

    check("n1.LEG3 satisfiable (ledger populated)",
          leg3_pred(drive.parse_arm(add_line)["after_labware"]) is True)

    # the counter-prove that PROVES N1: under the pre-fix parser semantics
    # (whole-rest json.loads per token), the same 4-token line yielded a
    # STRING after_labware — the isinstance-dict checks above would be
    # False forever. Reproduced inline (the old code path, for the record):
    line = add_line
    i = line.find("after_labware=")
    rest = line[i + len("after_labware="):]
    try:
        json.loads(rest)
        old_degraded = False
    except Exception:
        old_degraded = True   # 'Extra data' — exactly the N1 probe
    check("n1.old-parser repro (rest-of-line json.loads raises)",
          old_degraded is True)


def main():
    test_round_trip()
    test_pre_fix_form()
    test_turn_tag_only()
    test_token_in_payload()
    test_garbage()
    test_leg_probes()
    print("PARSE_ARM FIXTURE: %d checks passed (exit 0)" % PASS)


if __name__ == "__main__":
    main()
