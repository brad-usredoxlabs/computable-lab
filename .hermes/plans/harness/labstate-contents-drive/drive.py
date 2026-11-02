#!/usr/bin/env python3
"""L2-LABSTATE-CONTENTS-1 — the LIVE NO-SEED multi-turn drive (spec §11).

Drives the ACTUAL wire path the deck surface rides (POST /api/ai/draft-events/
stream — the run-suite-a.py post_sse idiom) with ONE held session, byte-stable
surface + context identity (conversationKey = deriveContextCacheKey(surface,
context) is stable across turns — the SAME identity the LabStateCache is keyed
by). NO seeded state, NO cache priming, NO priorLabState fixture: the ONLY
inputs are the four spec §11 utterances (verbatim from the ruling), typed
exactly, hyphen and all — the model lowering to well-range form is part of
what the drive tests (OQ-2).

Turns (spec §11, OQ-1 ratified):
  A    "Place a 96-well plate on the deck."
  1    "add material A to A1-H1"
  1b   "add material B to A2-H2"
  2    "mix all wells that have material"
  X    (control) an unknown-plate add — never-guess leg (diagnostic + no
       contents; captured separately, after turn 2, same session).

Per-turn receipt evidence (receipts dir under /home/brad/.hermes/cl/receipts/
L2-LABSTATE-CONTENTS-1/<UTC ts>/):
  - the FULL raw done frame (the accepted compile's wire result: events,
    labwareAdditions, clarificationRequests, unresolvedRefs, notes, error)
    — the labStateDelta is NOT on the wire (the AgentResult carries no such
    field), so the per-turn committed ledger rides the backend ARM-LOG
    (LABSTATE_ARM_LOG=1, env-gated, the spec §11 'backend arm-log line'
    evidence): the drive captures the backend log window between turns and
    extracts the [lab_state ARM-LOG] line — prior_labware (the persistence
    proof: turn 1b's prior must ALREADY contain turn 1's contents) and
    after_labware (the contents this turn wrote).
  - the mix turn: the mix event's details carry the resolved union. The
    drive asserts the union is EXACTLY the wells A1..H1 + A2..H2 (the
    A1:H2 bounding union — 16 wells; ruling LABSTATE-TOKENSITE-gate-l2t2355
    Q2 harness-bookkeeping fix: the leg's old 'expected_48' label/note said
    48 while enumerating the same 16-well A1:H2 union — the COUNT reconciled
    to the actual ledger union, the enumerated set unchanged) computed BY THE
    COMMITTED LEDGER — a vacuous
    []==[] is an ACCEPTANCE FAILURE (WELLSET's #1 trap applies verbatim).

Exit codes: 0 = all acceptance legs met; 1 = one or more failed (each named).
The receipt is ALWAYS written (evidence is the deliverable, not the exit code).
"""
import hashlib
import json
import os
import sys
import time
import urllib.request
import urllib.error

BASE = os.environ.get("DRIVE_BASE", "http://localhost:3093")
RECEIPTS_ROOT = os.environ.get("DRIVE_RECEIPTS",
                               "/home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1")
BACKEND_LOG = os.environ.get("DRIVE_BACKEND_LOG",
                             "/mnt/vast/home/brad/git/cl-integration-2/.run/backend.log")
TURN_TIMEOUT = int(os.environ.get("DRIVE_TURN_TIMEOUT", "300"))

# ---------------------------------------------------------------------------
# The architect-ratified utterances — VERBATIM from
# .hermes/plans/decisions/LABSTATE-MATERIALNOUN-gate-l2t0310-ruling.md §Q2
# (resolvable nouns; ':' well-range form per the OQ-2 ratification). Edited
# by orch as the ruling-Q4 evidence-collection step before the acceptance
# re-drive; bare single-letter nouns ("material A"/"material B") are barred
# by the INTENDED material-noun gate (ruling §Q1) and never reached the fold.
# ---------------------------------------------------------------------------
# Swap applied per ruling §Q2 pre-flight (orch authority, 2026-10-30): the
# ruling's suggested labels FAILED the live single-candidate probe —
# 'acetonitrile' returns 13 tier-1 bind:pass candidates (aliquot/spec noise;
# /api/resolve + live compile card, receipts /tmp/probe-receipts/2026-10-30
# T145457Z), 'clofibrate 1mM' compiles normalized to 'clofibrate 1 mM' ->
# unknown-noun. The swap labels below each probe EXACTLY ONE tier-1 candidate
# and 'bench bead beater' is live-accepted (events=1) in the probe receipts.
# UTTERANCE SWAP 2026-10-30T17:10 EDT (orch, ruling Q4 swap authority;
# AS-L2T1415-EQUIP-RECLASS-UTTERANCE): 'bench bead beater' is reclassified as
# BENCH EQUIPMENT by the shorthand sampler (receipts 20261030T193551Z +
# 20261030T203317Z: note 'never assigned a deck slot', add_material never
# emitted) and 'lysis-reagent' (hyphenated) holds an unknown-noun card.
# Swap nouns are MATERIAL-class and compile-proven resolvable: 'beads' ->
# EXACTLY ONE tier-1 (MagBinding Beads) via /api/resolve at 17:05 EDT
# (post-223a7910); 'lysis reagent' (unhyphenated, as the prior model lowering
# emitted) has a tier-1 'lysis-reagent' design. The well ranges, turn
# structure, and never-guess shape are UNCHANGED.
# UTTERANCE VARIANT 2026-10-30T19:00 EDT (orch l2t1830, ruling Q4 swap
# authority; AS-L2T1651-DRIVE-SAMPLER-ATTRIB-VARIANCE): the 5-receipt matrix
# shows the shorthand sampler nondeterministically emits add/mix WITHOUT the
# labwareId binding when the utterance names no deck carrier. This variant
# PINS the carrier explicitly ("the plate") in the add turns so the sampler
# has a resolvable deck noun every turn; well ranges/structure/never-guess
# shape UNCHANGED. If legs still don't co-occur green -> architect packet
# (drive-vs-sampler determinism contract).
TURNS = [
    ("A", "Place a 96-well plate on the deck."),
    ("1", "add beads to the plate A1:H1"),
    ("1b", "add ethanol to the plate A2:H2"),
    ("2", "mix all wells that have material"),
]
# The never-guess control (spec §11 failure-arm). SWAP 2026-10-31T12:25 EDT
# (orch, ruling Q-B decisions/LABSTATE-REDRIVE-legs-l2t1050-ruling.md: the
# ghost-plate utterance bars at resolve_nouns BEFORE the lab_state fold ever
# runs — arm_lines=0 makes the D3 non-vacuous form unfireable; ratified shape
# = DECK-ABSENT, STORE-RESOLVABLE label, never placed on the deck so the fold
# runs and no-ops honestly. Pre-flight probe 12:23 EDT
# receipts/labstate-control-preflight-l2t1130/: 'Test Tube Racks from Globe
# Scientific' -> EXACTLY ONE tier-1 bind:pass candidate, ghost plate -> zero
# (tier-5 mint only). The labware resolves as a STORE record but never maps
# onto a placed instance -> fold ran, no-op'd, lab_state unresolved code.)
CONTROL_TURN = ("X", "add beads to the Test Tube Racks from Globe Scientific well C1")

# The held-session identity constants (run-suite-a.py values — the deck
# surface's byte-stable wire shape).
PLATFORM_ID = "manual"
VARIANT_ID = "manual_freeform"
VOCAB_PACK_ID = "liquid-handling/v1"
AVAILABLE_VERBS = [
    "aspirate", "dispense", "transfer", "multi_dispense", "add_material",
    "mix", "wash", "incubate", "read", "harvest", "place_tube", "move_tube",
    "remove_tube", "serial_dilution", "plate_copy", "wash_cycle",
]


def sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def context_for(run_id, labwares, events, placement_count):
    """The DeckSurfaceChat surfaceContext (run-suite-a context_state.py —
    the same 11 fields, same key order). The held session's NO-SEED contract:
    the deck starts EMPTY. labwares/events accumulate from delivered results
    (the product's ghost-mount equivalent) — this mirrors the browser's
    post-accept accumulation, never a seeded prior."""
    return {
        "eventGraphId": "eg-" + run_id,
        "runId": run_id,
        "platformId": PLATFORM_ID,
        "variantId": VARIANT_ID,
        "vocabPackId": VOCAB_PACK_ID,
        "placementCount": placement_count,
        "eventCount": len(events),
        "labwares": labwares,
        "eventSummary": ("No events yet." if not events
                         else "; ".join(_summary(e) for e in events[-20:])),
        "availableVerbs": list(AVAILABLE_VERBS),
        "selection": None,
    }


def _event_wells(ev):
    d = ev.get("details") or {}
    w = d.get("wells")
    if isinstance(w, list):
        return [x for x in w if isinstance(x, str)]
    if isinstance(w, str):
        return [w]
    if isinstance(d.get("well"), str):
        return [d["well"]]
    return []


def _summary(ev):
    verb = str(ev.get("verb") or ev.get("event_type") or "event")
    wells = _event_wells(ev)
    well_str = "" if not wells else ("(%s)" % wells[0] if len(wells) == 1
                                     else ("(%s)" % ", ".join(wells) if len(wells) <= 6
                                           else "(%d wells)" % len(wells)))
    mats = []
    for m in (ev.get("materials") or []):
        if isinstance(m, dict):
            ref = m.get("ref")
            label = None
            if isinstance(ref, dict):
                mint = ref.get("mint")
                if isinstance(mint, dict) and mint.get("label"):
                    label = str(mint["label"])
                elif isinstance(ref.get("curie"), str):
                    label = ref["curie"]
            if label:
                mats.append(label)
    vol = ""
    d = ev.get("details") or {}
    if isinstance(d.get("volumeUl"), (int, float)):
        vol = "%s uL" % d["volumeUl"]
    return " ".join(p for p in (verb, (mats[0] if mats else ""), vol, well_str) if p)


def post_sse(base, path, body, timeout):
    """POST a JSON body, stream the SSE frames (run-suite-a post_sse idiom:
    data: lines, blank-line separated). Returns (http_status, frames, raw)."""
    req = urllib.request.Request(
        base + path, data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        return e.code, [], e.read()
    except (TimeoutError, urllib.error.URLError) as e:
        return -1, [], str(e).encode("utf-8", errors="replace")
    with resp:
        buf = b""
        frames = []
        while True:
            chunk = resp.read(1)
            if not chunk:
                break
            buf += chunk
            if buf.endswith(b"\n\n"):
                frame = buf.decode("utf-8", errors="replace")
                buf = b""
                for line in frame.splitlines():
                    if not line.startswith("data:"):
                        continue
                    try:
                        frames.append(json.loads(line[5:].strip()))
                    except Exception:
                        continue
        if buf.strip():
            for line in buf.decode("utf-8", errors="replace").splitlines():
                if line.startswith("data:"):
                    try:
                        frames.append(json.loads(line[5:].strip()))
                    except Exception:
                        pass
        return resp.status, frames, buf


def log_offset():
    try:
        return os.path.getsize(BACKEND_LOG)
    except OSError:
        return 0


def arm_log_since(offset):
    """Extract the [lab_state ARM-LOG] lines from the backend log since
    `offset` (the per-turn committed-ledger evidence the wire frame does not
    carry)."""
    try:
        with open(BACKEND_LOG, "rb") as f:
            f.seek(offset)
            data = f.read().decode("utf-8", errors="replace")
    except OSError:
        return []
    return [ln for ln in data.splitlines() if "lab_state ARM-LOG" in ln]


_ARM_TOKENS = ("turn=", "prior_labware=", "after_labware=", "unresolved_codes=")


def _depth0_markers(line):
    """FIX RUN 2 (l2t0915, N1 BLOCKER): the (position, token) pairs of the
    emitter's field separators that sit OUTSIDE any JSON payload — i.e. at
    brace/bracket depth 0. A token occurrence INSIDE a payload's JSON
    string (e.g. a materialId that happens to contain 'turn=9') is a
    payload content, not a separator: the pre-fix rfind/rest split had no
    such notion and handed the whole rest of the line to json.loads (only
    the last token could ever parse). A marker counts only at depth 0 and
    only when preceded by start-of-line or whitespace (the emitter's line
    shape: '<token><json> <token><json> ...')."""
    markers = []
    depth = 0
    in_str = False
    esc = False
    i = 0
    while i < len(line):
        ch = line[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            i += 1
            continue
        if ch == '"':
            in_str = True
            i += 1
            continue
        if ch in "{[":
            depth += 1
            i += 1
            continue
        if ch in "}]":
            depth -= 1
            i += 1
            continue
        if depth == 0 and (i == 0 or line[i - 1] in " \t"):
            for token in _ARM_TOKENS:
                if line.startswith(token, i):
                    markers.append((i, token))
                    break
        i += 1
    return markers


def _bounded_payload(line, start):
    """FIX RUN 2 (l2t0915, N1 BLOCKER): the JSON payload starting at
    `start` (a '{' or '['), closed by its OWN balanced braces/brackets —
    not the rest of the line. The pre-fix `rest` hand-off to json.loads
    only ever worked for the LAST token: once 60db0a3a appended
    unresolved_codes= AFTER after_labware=, after_labware's tail carried
    ' unresolved_codes=[...]' and json.loads raised 'Extra data', degrading
    the field to a raw string (LEG1/LEG2/LEG3/LEG4 False forever). JSON
    string contents are respected (double quotes + backslash escapes) so a
    brace inside a JSON string cannot terminate the slice early."""
    if start >= len(line) or line[start] not in "{[":
        return None
    depth = 0
    in_str = False
    esc = False
    for k in range(start, len(line)):
        ch = line[k]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                return line[start:k + 1]
    return None


def parse_arm(log_line):
    """Parse one ARM-LOG line into {turn, prior_labware, after_labware,
    unresolved_codes} — tolerant of the compact JSON payloads. D3 (advc
    fix-run 1): the line carries the turn's §7 lab_state diagnostic CODES
    (unresolved_codes) — the captured channel the never-guess control leg
    asserts on (the wire done frame does not carry diagnostics).
    FIX RUN 2 (l2t0915, N1 BLOCKER): each payload is parsed from its OWN
    bounded slice (depth-0 marker scan + brace-balanced), so BOTH the
    pre-60db0a3a 3-token and the current 4-token emitter forms parse into
    dicts/lists, in either token order, and a line with no well-formed
    ARM-LOG fields yields all-None (no exception). test_parse_arm.py is
    the committed fixture that pins the round-trip against the emitter's
    exact line format (ChatbotCompilePasses.ts:1895)."""
    out = {"turn": None, "prior_labware": None, "after_labware": None,
           "unresolved_codes": None}
    markers = _depth0_markers(log_line)
    if not markers:
        return out
    for idx, (pos, token) in enumerate(markers):
        j = pos + len(token)
        if token == "turn=":
            # The turn tag is the bounded run up to the NEXT depth-0
            # marker (pre-fix `rest.strip()` captured the WHOLE rest of
            # the line — turn= garbage).
            end = markers[idx + 1][0] if idx + 1 < len(markers) else len(log_line)
            tag = log_line[j:end].strip()
            out["turn"] = tag if tag else None
        else:
            payload = _bounded_payload(log_line, j)
            if payload is not None:
                try:
                    out[token.rstrip("=")] = json.loads(payload)
                except Exception:
                    out[token.rstrip("=")] = None
    return out


def wellset_of(ev):
    """The mix event's resolved well union (details.wells / details.well)."""
    d = ev.get("details") or {}
    w = d.get("wells")
    if isinstance(w, list):
        return sorted(x for x in w if isinstance(x, str))
    if isinstance(w, str):
        return [w]
    if isinstance(d.get("well"), str):
        return [d["well"]]
    return []


def material_wells(ev):
    """A material-bearing event's well addresses (its own details)."""
    d = ev.get("details") or {}
    out = []
    w = d.get("wells")
    if isinstance(w, list):
        out = [x for x in w if isinstance(x, str)]
    elif isinstance(w, str):
        out = [w]
    if not out and isinstance(d.get("well"), str):
        out = [d["well"]]
    return out


def main():
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    receipt = os.path.join(RECEIPTS_ROOT, ts)
    os.makedirs(receipt, exist_ok=True)
    run_id = "labstate-" + ts

    # The held session (ONE conversation, byte-stable identity).
    labwares, events, placement_count = [], [], 0
    history = []
    results = {}
    failures = []

    print("DRIVE run_id=%s base=%s" % (run_id, BASE))

    def drive_turn(label, prompt, control=False):
        ctx = context_for(run_id, labwares, events, placement_count)
        body = {"prompt": prompt, "context": ctx, "history": history}
        request_sha = sha(json.dumps(body, sort_keys=True, separators=(",", ":")))
        key_sha = sha(json.dumps(
            {k: ctx.get(k) for k in ("runId", "eventGraphId", "platformId",
                                     "variantId", "vocabPackId", "editorMode")},
            sort_keys=True))
        off = log_offset()
        t0 = time.time()
        status, frames, raw = post_sse(BASE, "/api/ai/draft-events/stream",
                                       body, TURN_TIMEOUT)
        wall = round(time.time() - t0, 1)
        types = [f.get("type") for f in frames if isinstance(f, dict)]
        done = next((f for f in frames
                     if isinstance(f, dict) and f.get("type") == "done"), None)
        diag_frames = [f for f in frames
                       if isinstance(f, dict) and f.get("type") == "pipeline_diagnostics"]
        error_frames = [f for f in frames
                        if isinstance(f, dict) and f.get("type") == "error"]
        arm = arm_log_since(off)

        # Advance the session from the delivered result (ghost-mount
        # equivalent — the product's post-accept accumulation, never a seed).
        nonlocal_lab = {"labwares": labwares, "events": events,
                        "placement_count": placement_count, "history": history}
        if isinstance(done, dict):
            res = done.get("result") or {}
            if isinstance(res.get("events"), list):
                for ev in res["events"]:
                    if isinstance(ev, dict):
                        nonlocal_lab["events"].append(ev)
            for offer in (res.get("resolvedLabwares") or []):
                rid = offer.get("recordId") if isinstance(offer, dict) else None
                if isinstance(rid, str) and not any(
                        l["labwareId"] == rid for l in nonlocal_lab["labwares"]):
                    nonlocal_lab["labwares"].append({
                        "labwareId": rid,
                        "labwareType": str(offer.get("title") or offer.get("hint") or rid),
                        "name": str(offer.get("title") or offer.get("hint") or rid),
                    })
                    nonlocal_lab["placement_count"] += 1
            for add in (res.get("labwareAdditions") or []):
                rid = add.get("recordId") if isinstance(add, dict) else None
                if isinstance(rid, str) and not any(
                        l["labwareId"] == rid for l in nonlocal_lab["labwares"]):
                    nonlocal_lab["labwares"].append({
                        "labwareId": rid, "labwareType": str(add.get("reason") or rid),
                        "name": str(add.get("reason") or rid)})
                nonlocal_lab["placement_count"] += 1
            # history (the client's own shape — useAiChat buildConversationHistory)
            nonlocal_lab["history"].append({"role": "user", "content": prompt.strip()})
            if isinstance(res.get("notes"), list) and res["notes"]:
                nonlocal_lab["history"].append({"role": "assistant",
                                                "content": " ".join(map(str, res["notes"]))[:4000]})
            nonlocal_lab["history"] = nonlocal_lab["history"][-20:]

        state = {
            "label": label, "prompt": prompt, "control": control,
            "http_status": status, "sse_frame_types": types,
            "done_frame": done, "done_frame_sha": sha(json.dumps(done, sort_keys=True)) if done else None,
            "request_sha": request_sha, "context_identity_sha256": key_sha,
            "arm_log": [parse_arm(ln) for ln in arm],
            "arm_log_raw": arm,
            "pipeline_diagnostics": diag_frames,
            "error_frames": error_frames,
            "wall_s": wall,
            "raw_tail": raw[-4000:].decode("utf-8", errors="replace"),
        }
        results[label] = state
        print("turn %-3s http=%s frames=%s wall=%ss arm_lines=%d" %
              (label, status, [t for t in types if t in ("draft", "done", "error", "pipeline_diagnostics")],
               wall, len(arm)))
        return state

    # ---- the four spec §11 turns ------------------------------------------
    for label, prompt in TURNS:
        drive_turn(label, prompt)

    # ---- the never-guess control turn (spec §11 failure-arm) ---------------
    drive_turn(*CONTROL_TURN, control=True)

    # -----------------------------------------------------------------------
    # Acceptance legs (each named; a vacuous pass is a FAILURE).
    # -----------------------------------------------------------------------
    leg = {}

    # LEG 1 (turn 1): accepted add leaves snapshotAfter.labware populated —
    # the arm-log after_labware has >=1 instance with non-empty wells over
    # the A1..H1 addresses; the materialId/kind seen are captured.
    t1 = results.get("1") or {}
    t1_after = (t1.get("arm_log") or [{}])[-1].get("after_labware") if t1.get("arm_log") else None
    leg["turn1_contents"] = {
        "ok": isinstance(t1_after, dict) and any(
            isinstance(w, dict) and w for w in t1_after.values() if isinstance(w, dict)),
        "after_labware": t1_after,
        "note": "turn 1 accepted add leaves snapshotAfter.labware populated (A1..H1); the seen materialId/kind ride the payload above.",
    }

    # LEG 2 (turn 1b PERSISTENCE PROOF): turn 1b's PRIOR (the cache read leg)
    # ALREADY contains turn 1's contents — captured, not asserted-by-
    # construction.
    t1b = results.get("1b") or {}
    t1b_prior = (t1b.get("arm_log") or [{}])[-1].get("prior_labware") if t1b.get("arm_log") else None
    t1b_after = (t1b.get("arm_log") or [{}])[-1].get("after_labware") if t1b.get("arm_log") else None
    # turn 1's contents must be present in 1b's prior (any non-empty well on
    # any instance with materialId 'A' — the seen id from turn 1).
    def _has_material(pay, mid):
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
    leg["turn1b_persistence"] = {
        "ok": bool(mid_a) and _has_material(t1b_prior, mid_a),
        "material_id_from_turn1": mid_a,
        "turn1b_prior_labware": t1b_prior,
        "turn1b_after_labware": t1b_after,
        "note": "turn 1b's compile read a prior that ALREADY contains turn 1's contents (the cache write leg fired) — the persistence proof, captured from the arm-log.",
    }

    # LEG 3 (turn 2 MIX): the mix event's details carry the resolved union
    # EXACTLY A1..H1 + A2..H2 (the A1:H2 bounding union — 16 wells; the leg's
    # historical "48" label was harness bookkeeping, reconciled per ruling
    # LABSTATE-TOKENSITE-gate-l2t2355 Q2: the enumerated union is 16 wells),
    # computed by the committed ledger. Vacuous []==[] is an ACCEPTANCE FAILURE.
    t2 = results.get("2") or {}
    t2_done = t2.get("done_frame") or {}
    t2_res = t2_done.get("result") or {} if isinstance(t2_done, dict) else {}
    t2_events = t2_res.get("events") or []
    mix_events = [e for e in t2_events
                  if isinstance(e, dict)
                  and (e.get("event_type") == "mix" or e.get("verb") == "mix"
                       or e.get("event_type") == "multi_dispense" or e.get("verb") == "multi_dispense")]
    mix_wells = []
    for e in mix_events:
        mix_wells.extend(wellset_of(e))
    mix_wells = sorted(set(mix_wells))
    expected_union = sorted(
        ["%s%d" % (r, c) for r in "ABCDEFGH" for c in range(1, 3)])
    t2_after = (t2.get("arm_log") or [{}])[-1].get("after_labware") if t2.get("arm_log") else None
    ledger_populated = isinstance(t2_after, dict) and any(
        isinstance(w, dict) and w for w in t2_after.values() if isinstance(w, dict))
    leg["turn2_mix_union"] = {
        "ok": mix_wells == expected_union and bool(expected_union),
        "mix_event_count": len(mix_events),
        "mix_wells": mix_wells,
        "mix_well_count": len(mix_wells),
        "expected_union": expected_union,
        "turn2_ledger_populated": ledger_populated,
        "note": "the mix event's details carry the resolved union EXACTLY A1..H1 + A2..H2 (the A1:H2 bounding union, 16 wells — count reconciled per ruling LABSTATE-TOKENSITE-gate-l2t2355 Q2) BY THE COMMITTED LEDGER. Vacuous []==[] = ACCEPTANCE FAILURE (named, not hidden).",
    }

    # LEG 4 (control X): unknown plate -> no contents written (the fold
    # no-ops) + a lab_state diagnostic in the captured payload/log (never-
    # guess). D3 (advc fix-run 1): the leg is NON-VACUOUS — the pre-fix
    # `ok = arm_log is not None and (tx_prior == tx_after or tx_after is None)`
    # was asserted-by-construction when the fold never ran (arm_log empty,
    # tx_prior == tx_after == None => None == None => ok True) and the
    # computed `tx_diag` was never used. The leg now requires:
    #   (1) a NON-EMPTY arm_log for the control turn (the fold PROVABLY ran —
    #       the backend lab_state pass fired this turn),
    #   (2) after_labware == prior_labware with BOTH non-None (the no-op wrote
    #       nothing — the fold never half-writes for an unmappable hint), and
    #   (3) >=1 lab_state UNRESOLVED diagnostic in the captured payload/log
    #       (the §7 never-guess surface: the pass diagnostic frame OR the
    #       env-gated ARM-LOG unresolved_codes — the wire done frame does not
    #       carry diagnostics, so both captured channels are counted).
    tx = results.get("X") or {}
    tx_arm = tx.get("arm_log") or []
    tx_after = tx_arm[-1].get("after_labware") if tx_arm else None
    tx_prior = tx_arm[-1].get("prior_labware") if tx_arm else None
    # (3) the captured diagnostic channels: (a) the wire pipeline_diagnostics
    # frames (the §7 codes ride there when the compile outcome surfaces them)
    # and (b) the ARM-LOG unresolved_codes (the env-gated log line the drive
    # captures per turn — always present for a control turn on a restarted
    # stack with LABSTATE_ARM_LOG=1).
    tx_diag_wire = [
        d for fr in (tx.get("pipeline_diagnostics") or [])
        if isinstance(fr, dict)
        for d in (fr.get("diagnostics") or [])
        if isinstance(d, dict)
        and str(d.get("pass_id") or "") == "lab_state"
        and str(d.get("code") or "").startswith("lab_state_unresolved")
    ]
    tx_diag_arm_codes = [
        c for c in (tx_arm[-1].get("unresolved_codes") or []) if isinstance(c, str)
        and c.startswith("lab_state_unresolved")
    ] if tx_arm else []
    tx_diag_count = len(tx_diag_wire) + len(tx_diag_arm_codes)
    # TWO-FORM honesty evaluation per ruling decisions/LABSTATE-CONTROLLEG-
    # l2t1125-ruling.md (END-RULING; orch harness rider 2026-11-02 l2t1400).
    # Honest outcomes: form N (no-op: after == prior) OR form C (create:
    # a create_container event fired AND every PRE-EXISTING instance's
    # well-map is byte-identical to its prior). Only a GUESS fails: a
    # add_material onto a prior instance with no create, a mutated prior
    # ledger, an empty arm_log (fold never ran), or zero unresolved
    # diagnostics.
    x_events = [
        e for e in ((tx.get("done_frame") or {}).get("result") or {}).get("events") or []
        if isinstance(e, dict)
    ]
    def _verb(e):
        return str(e.get("event_type") or e.get("verb") or "")
    created = [e for e in x_events if _verb(e) == "create_container"]
    created_ids = sorted(
        str((e.get("details") or {}).get("labwareInstanceId")
            or (e.get("details") or {}).get("labwareId") or e.get("recordId") or "unknown")
        for e in created
    )
    tx_prior_ids = set((tx_prior or {}).keys())
    ledger_of_prior = {k: (tx_after or {}).get(k) for k in tx_prior_ids}
    noop_form = tx_after == tx_prior
    create_form = bool(created) and tx_after is not None and ledger_of_prior == tx_prior
    ok_control = (
        tx_diag_count >= 1 and bool(tx_arm)
        and tx_prior is not None and tx_after is not None
        and (noop_form or create_form)
    )
    control_form = "noop" if ok_control and noop_form else ("create" if ok_control else "fail")
    leg["control_never_guess"] = {
        "ok": ok_control,
        "control_form": control_form,
        "created_instance_ids": created_ids,
        "x_events_compact": [
            {
                "verb": _verb(e),
                "labwareId": (e.get("details") or {}).get("labwareId"),
                "labwareInstanceId": (e.get("details") or {}).get("labwareInstanceId"),
                "well": (e.get("details") or {}).get("well"),
                "material": (e.get("details") or {}).get("materialId") or (e.get("details") or {}).get("material"),
            }
            for e in x_events
        ],
        "arm_log_lines": len(tx_arm),
        "arm_prior": tx_prior, "arm_after": tx_after,
        "unresolved_diag_wire": tx_diag_wire,
        "unresolved_diag_arm_codes": tx_diag_arm_codes,
        "pipeline_diagnostics_frames": tx.get("pipeline_diagnostics"),
        "note": "unknown-plate control (NON-VACUOUS, D3; two-form per ruling LABSTATE-CONTROLLEG-l2t1125): the lab_state fold provably ran (non-empty arm_log) AND EITHER no-op'd (form N: after == prior, both captured) OR created a NEW instance from the store record with the PRE-EXISTING ledger byte-identical (form C: create_container drafted + ledger_of(prior_ids) == prior) — and surfaced a lab_state unresolved diagnostic (never-guess). A GUESS (write onto a prior instance with no create, mutated prior ledger, empty arm_log, or zero diagnostics) fails. A turn where the fold never executed cannot pass this leg.",
    }

    report = {
        "item": "L2-LABSTATE-CONTENTS-1",
        "drive": "live no-seed multi-turn (spec §11)",
        "run_id": run_id,
        "base": BASE,
        "ts": ts,
        "turns": results,
        "legs": leg,
        "all_legs_ok": all(v.get("ok") for v in leg.values()),
    }
    for name, v in leg.items():
        print("LEG %-22s ok=%s" % (name, v.get("ok")))
        if not v.get("ok"):
            failures.append(name)

    with open(os.path.join(receipt, "drive-receipt.json"), "w") as f:
        json.dump(report, f, indent=2)
    print("RECEIPT=%s" % receipt)
    print("ALL_LEGS_OK=%s" % report["all_legs_ok"])
    sys.exit(0 if report["all_legs_ok"] else 1)


if __name__ == "__main__":
    main()
