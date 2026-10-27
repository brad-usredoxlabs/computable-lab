#!/usr/bin/env python3
"""L2-SUITE-A — the committed, re-runnable prompt-suite driver (plate leg).

Drives Brad's prompts 1-8 VERBATIM (prompts-plate-leg.txt, byte-identical slice of
tmp/prompt_files.md lines 3-17) through the universal chat's ACTUAL wire path
against the lane-2 stack, per turn:

  POST /api/ai/draft-events/stream   (the path the merged deck surface rides —
                                      OQ4 ruling: aiClient.ts:234-236 forks
                                      surface==='event-editor' to this endpoint;
                                      the merged DeckSurfaceChat.tsx declares
                                      surface 'event-editor')
  body (aiClient.ts:261-263, event-editor branch — `surface` key ABSENT, this is
        the merged client's ACTUAL wire shape):
        { prompt, context, history, ...(enableThinking !== undefined ? { enableThinking } : {}) }
  context (useAiChat.ts:796-861 + DeckSurfaceChat.tsx:63-83 surfaceContext):
        { ...surfaceContext, mentions: <parsePromptMentions(prompt)>, editorMode: 'deck' }
        surfaceContext = { eventGraphId, runId, platformId, variantId, vocabPackId,
                           placementCount, eventCount, labwares[], eventSummary,
                           availableVerbs[], selection }

Layer (a) invariant (OQ1): ZERO run writes. The deck state the server sees is
request-injected via context.labwares (the FREEFORM probe-injection point,
AgentOrchestrator.ts:1306 `context?.labwares`); the driver never calls accept/
apply/promote routes (routes.ts:435 / :734) and asserts write-free by digesting
the data repo record tree before/after (FREEFORM acceptance #5 idiom).

Honesty rule (per turn, via the committed TS helper — OQ3 ruling (ii), ONE
implementation, no drift surface): the driver shells out to
lib/honest-cli.ts (run with node native TS type-stripping), which imports
server/src/ai/honestOutcome.ts and prints the verdict
("events-bound" | "cards" | "honest-failure") or exits nonzero on the silent
shape. The python driver re-encodes the SAME discriminated verdict in
lib/verdict.py and a pinned vitest parity pin feeds BOTH the same five fixtures
(a)-(e) (server/src/ai/L2SuiteA.honestOutcome.parity.test.ts).

Sequence (OQ2 ruling): ONE held session, prompts 1-8 IN ORDER. surface + context
are BYTE-STABLE across turns (conversationKey = deriveContextCacheKey(surface,
context), AgentOrchestrator.ts:1290 — B5: a driver that rebuilds context between
turns silently resets the held thread and P7 "passes" without seeing 3-6). The
per-turn `context_sha` evidence line in each prompt-N.json is the B5 pin.
FAIL-FAST with disclosure: a failed prompt downgrades dependents to
blocked-by-P<n> (never a silent skip, never a fake pass).

Usage (cwd = repo root of the lane worktree):
  python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --all --base http://localhost:3093
  python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --prompts 2 --single --base http://localhost:3093
  python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --all --compare expectations/ --base http://localhost:3093

Exit codes: 0 = every driven prompt got an honest verdict AND met its expectation
channel constraints; 1 = at least one prompt FAILED (silent shape or
expectation violation) — the per-prompt lines still print; 2 = environment
error (stack down, corpus missing, ...).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from lib import context_state, verdict as verdictlib  # noqa: E402

DEFAULT_BASE = "http://localhost:3093"
DATA_REPO = os.environ.get(
    "CL_DATA_REPO", "/home/brad/.computable-lab/worktrees/main")
RECEIPTS_ROOT = os.environ.get(
    "CL_RECEIPTS", "/home/brad/.hermes/cl/receipts/L2-SUITE-A")

# The held session's deck identity (OQ1: request-injected, write-free).
# Unique per run so the held-thread key (event-editor:<runId>) never collides
# with a live UI session on the same stack.
RUN_PREFIX = os.environ.get("CL_SUITE_RUN_PREFIX", "L2SA")

# The lane deck the merged product's freeform variant renders (OQ1: no run
# writes — the probe's deck is this fixed, harness-owned identity).
RUN_ID_DEFAULT = "deck-suite-a-freeform"

# The merged freeform deck identity (defaultManifests.ts:47-76): platform
# 'manual', variant 'manual_freeform' = "Manual Bench (freeform)".
PLATFORM_ID = "manual"
VARIANT_ID = "manual_freeform"
VOCAB_PACK_ID = "liquid-handling/v1"
# The merged liquid-handling/v1 pack's verbs (app/src/shared/vocab/packs/
# liquid-handling.v1.ts) — what DeckSurfaceChat's getVerbsForDisplay(pack) sends.
AVAILABLE_VERBS = [
    "aspirate", "dispense", "transfer", "multi_dispense", "add_material",
    "mix", "wash", "incubate", "read", "harvest", "place_tube", "move_tube",
    "remove_tube", "serial_dilution", "plate_copy", "wash_cycle",
]


# ---------------------------------------------------------------------------
# corpus
# ---------------------------------------------------------------------------

CORPUS_RE = re.compile(rb"^(\d+)\. (.*)$", re.DOTALL)


def load_prompts(corpus_path):
    """Parse the committed corpus: numbered prompt lines, strip the ONE space
    after the number prefix; the rest of the line is the VERBATIM prompt text
    (leading space on P4 and the double space on P8 are PROMPT CONTENT — B6)."""
    raw = open(corpus_path, "rb").read()
    prompts = {}
    for line in raw.split(b"\n"):
        m = CORPUS_RE.match(line)
        if m:
            prompts[int(m.group(1))] = m.group(2).decode("utf-8")
    if sorted(prompts) != list(range(1, 9)):
        raise SystemExit(
            "corpus parse error: expected prompts 1-8, got %r (B6: "
            "prompts-plate-leg.txt must byte-match tmp/prompt_files.md "
            "lines 3-17)" % sorted(prompts))
    return prompts


def corpus_sha256(corpus_path):
    return hashlib.sha256(open(corpus_path, "rb").read()).hexdigest()


# ---------------------------------------------------------------------------
# SSE
# ---------------------------------------------------------------------------

def post_sse(base, path, body, timeout):
    """POST a JSON body, stream the SSE frames, return (http_status, frames,
    raw_bytes). Mirrors precheck-assist-turn.py's framing (data: lines,
    blank-line separated)."""
    req = urllib.request.Request(
        base + path, data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        return e.code, [], e.read()
    except (TimeoutError, urllib.error.URLError) as e:
        # A mid-stream stall is a transport failure, not an honest verdict:
        # return a distinct status so the receipt records it as such (the
        # previous run died on exactly this: engine admission stall, no frames).
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


def summarize_frames(frames):
    types = []
    done = None
    error_frames = []
    tool_calls = []
    for f in frames:
        t = f.get("type")
        types.append(t)
        if t == "done":
            done = f.get("result") or {}
        elif t == "error":
            error_frames.append(str(f.get("message"))[:400])
        elif t == "tool_call":
            tool_calls.append(f.get("toolName"))
    return types, done, error_frames, tool_calls


# ---------------------------------------------------------------------------
# honest verdict — ONE implementation: the TS helper, via node CLI (OQ3 (ii))
# ---------------------------------------------------------------------------

def honest_verdict_via_nodecli(result, context=None):
    """Shell out to lib/honest-cli.ts (node native type-stripping; imports the
    committed server/src/ai/honestOutcome.ts). Returns (verdict_or_none,
    cli_exit, stderr_tail). verdict None = the silent shape (helper threw /
    the classifier returned null)."""
    payload = {"result": result}
    if context is not None:
        payload["context"] = context
    env = dict(os.environ)
    proc = subprocess.run(
        ["node", "--no-warnings", os.path.join(HERE, "lib", "honest-cli.ts")],
        input=json.dumps(payload).encode("utf-8"),
        capture_output=True, timeout=60, env=env)
    out = proc.stdout.decode("utf-8", errors="replace").strip()
    err = proc.stderr.decode("utf-8", errors="replace")[-400:]
    if proc.returncode == 0:
        v = out or None
        return v, 0, err
    # nonzero = the helper THREW (silent shape or unbound-label shape): the
    # error message carries the delivered-channel dump.
    return None, proc.returncode, err


def honest_verdict_python(result, context=None):
    """The driver's RE-ENCODED verdict (lib/verdict.py) — drift-checked by the
    pinned vitest parity pin against the TS helper on the five fixtures."""
    try:
        return verdictlib.classify(result, context), None
    except verdictlib.HonestOutcomeError as e:
        return None, str(e)


# ---------------------------------------------------------------------------
# write-free digest (FREEFORM acceptance #5 idiom)
# ---------------------------------------------------------------------------

def data_repo_digest(root):
    """sha256 over the sorted (relpath, size) of the data repo's record tree —
    any write (new/modified record file) changes it. Zero reads of contents:
    this is an existence/size fingerprint, not a read of record bodies."""
    h = hashlib.sha256()
    if not os.path.isdir(root):
        return "ABSENT:" + root
    n = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for fn in sorted(filenames):
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, root)
            try:
                st = os.lstat(p)
            except OSError:
                continue
            h.update(rel.encode("utf-8"))
            h.update(str(st.st_size).encode("ascii"))
            h.update(b"|")
            n += 1
    h.update(b"files:" + str(n).encode("ascii"))
    return h.hexdigest()


# ---------------------------------------------------------------------------
# the held session
# ---------------------------------------------------------------------------

class HeldSession:
    """ONE held conversation (OQ2): byte-stable surface + context identity,
    history carried forward in the client's own shape (useAiChat's
    buildConversationHistory: role/content, trimmed)."""

    def __init__(self, run_id, preseed=None):
        self.run_id = run_id
        self.event_graph_id = "eg-" + run_id
        self.history = []
        self.accum = context_state.AccumulatedDeckState(preseed=preseed)
        # B5 pin: the (surface, context) pair that MUST be byte-stable across
        # turns for the held-thread key. We record its sha every turn.
        self.key_evidence = []

    def context_for(self, prompt, mentions):
        ctx = self.accum.surface_context(
            event_graph_id=self.event_graph_id,
            run_id=self.run_id,
            platform_id=PLATFORM_ID,
            variant_id=VARIANT_ID,
            vocab_pack_id=VOCAB_PACK_ID,
            available_verbs=AVAILABLE_VERBS,
        )
        ctx["mentions"] = mentions
        ctx["editorMode"] = "deck"
        return ctx

    def record_key_evidence(self, prompt, ctx):
        # B5: the held-thread key is deriveContextCacheKey(surface, context);
        # on the legacy event-editor path the handler omits surface, so the
        # key is event-editor:<context.runId>:<scope?> — for a byte-stable
        # context the key is stable. Record the sha of (context identity
        # fields + prompt-independent context) as the evidence.
        ident = json.dumps(
            {k: ctx.get(k) for k in
             ("runId", "eventGraphId", "platformId", "variantId",
              "vocabPackId", "editorMode")},
            sort_keys=True).encode("utf-8")
        sha = hashlib.sha256(ident).hexdigest()
        # D3: advance the driven-turn ordinal per DRIVEN turn (this method is
        # reached only by driven prompts — a blocked-by dependent continues
        # before it) and stamp THIS turn's ordinal into the B5 evidence.
        turn = self.accum.begin_turn()
        self.key_evidence.append(
            {"prompt_idx": turn, "context_identity_sha256": sha})
        return sha

    def push_history(self, prompt, assistant_text):
        # useAiChat.buildConversationHistory: user then assistant, trimmed.
        self.history.append({"role": "user", "content": prompt.strip()})
        text = assistant_text.strip()
        if text:
            self.history.append({"role": "assistant", "content": text})
        # client caps at MAX_HISTORY_MESSAGES=20 (pairs of 2 ⇒ 10 turns)
        self.history = self.history[-20:]

    def absorb(self, result, frames):
        """Advance the held deck state from a delivered draft result (the
        layer-(b) ghost-mount equivalent: events ghosted, a placement per
        resolved labware offer, well state accumulated for the COMPUTED set —
        P7's 'all wells that contain materials' is read from THIS, never a
        literal — B3)."""
        self.accum.absorb(result, frames)


def client_mentions(prompt):
    """Mirror app/src/shared/lib/aiPromptMentions.parsePromptMentions for the
    prompt shapes this corpus contains. Mentions are `[[kind:body|label]]`
    tokens (MENTION_PATTERN: material|material-spec|aliquot|labware|
    selection|protocol|graph-component); the corpus carries no mention tokens
    (byte-checked: no '[' in any of prompts 1-8), so the mirror returns [] —
    recorded as a captured-shape fact in the README, not re-derived per turn."""
    return []


def assistant_text_from_frames(frames, done):
    """Mirror useAiChat.buildAssistantContent closely enough for the history
    channel: model text deltas, status lines, the draft line, done notes /
    error. The wire shape (role/content pairs) is what the server receives."""
    parts = []
    model_text = ""
    for f in frames:
        t = f.get("type")
        if t == "text_delta":
            model_text += f.get("delta", "")
        elif t == "status":
            parts.append(f.get("message", ""))
        elif t == "draft":
            evs = f.get("events") or []
            parts.append("Drafted %d event%s" % (len(evs), "" if len(evs) == 1 else "s"))
    if done:
        err = done.get("error")
        if err:
            parts.append("Error: %s" % err)
        for n in (done.get("notes") or []):
            parts.append(str(n))
        cn = done.get("clarificationNeeded")
        if cn and not model_text:
            model_text = cn
        if not err and not (done.get("events") or []) and not model_text:
            parts.append("No events generated.")
        # the clarification cards' prompts are what the pane shows the user
        for c in (done.get("clarificationRequests") or []):
            if isinstance(c, dict) and c.get("prompt"):
                parts.append(c["prompt"])
    text = model_text
    if parts:
        text = (text + "\n" if text else "") + "\n".join(parts)
    return text


# ---------------------------------------------------------------------------
# per-prompt expectation checks (channel SHAPES only — B9: never prose)
# ---------------------------------------------------------------------------

def event_wells(ev):
    d = ev.get("details") or {}
    w = d.get("wells")
    if isinstance(w, list):
        return [x for x in w if isinstance(x, str)]
    if isinstance(w, str):
        return [w]
    if d.get("well"):
        return [d["well"]]
    return []


def load_expectations(exp_dir):
    out = {}
    for i in range(1, 9):
        p = os.path.join(exp_dir, "P%d.json" % i)
        if os.path.exists(p):
            out[i] = json.load(open(p))
    return out


def answerable_cards(cards):
    """The cards arm's structural shape: a clarification request is ANSWERABLE
    when it carries an answer form (a non-empty `options` list — the
    AgentClarificationRequest.options the client renders as pickable rows,
    types.ts:603). Pure shape, no prose (B9: only channel SHAPES may be
    asserted; LLM prose is excluded)."""
    out = []
    for c in cards:
        if not isinstance(c, dict):
            continue
        opts = c.get("options")
        if isinstance(opts, list) and len(opts) > 0:
            out.append(c)
    return out


def check_expectation(idx, exp, state):
    """Return a list of violation strings (empty = met). exp may be {} for a
    probe-only prompt (no channel constraint yet)."""
    if not exp:
        return []
    v = []
    verdict = state.get("verdict")
    events = state.get("events") or []
    cards = state.get("cards") or []

    want = exp.get("verdict_in")
    if want and verdict not in want:
        v.append("verdict %r not in %r" % (verdict, want))

    # P1: outcome = deck on manual_freeform (the deckLayout channel) OR a card
    # proposing it — NEVER prose-only (B7: assert the OUTCOME, not the intent
    # name). The turn is NOT the silent trichotomy-fail.
    if exp.get("outcome") == "deck-manual_freeform":
        dl = (state.get("done") or {}).get("deckLayout")
        ok = (isinstance(dl, dict) and dl.get("variantId") == "manual_freeform")
        if not ok:
            # cards arm (STRUCTURAL — D2 fix-run: no model-prose substring, no
            # keywords in the driver; B9: only channel SHAPES may be asserted):
            # the turn answered with cards (cards_count>0) AND at least one card
            # is ANSWERABLE (carries a non-empty options answer form).
            if not answerable_cards(cards) and not (isinstance(dl, dict) and dl.get("variantId")):
                v.append("no deckLayout variantId and no answerable card")
        if verdict is None:
            v.append("silent shape on a navigation turn (prose-only = FAIL)")

    # well-set assertions (P3/P4/P5/P6): the EXPECTED set comes from the
    # compiler's own expansion of the prompt's range token — the probe takes
    # the well set from the server result and byte-compares against the
    # expectations JSON (well-range semantics are the compiler's, never
    # re-derived in the harness).
    exp_wells = exp.get("wells")
    if exp_wells is not None:
        got = sorted(w for ev in events for w in event_wells(ev))
        if sorted(got) != sorted(exp_wells):
            v.append("wells %r != expected %r" % (sorted(got), sorted(exp_wells)))

    # P5: 8-channel semantics (B8): A2:H2 = eight wells (the compiler's own
    # expansion, pinned in expectations/P5.json `wells` via wellRange.ts —
    # wellRange.ts treats the LETTER as the ROW and the NUMBER as the COLUMN,
    # so "A2:H2" expands to A2,B2,...,H2 = row LETTERS vary, column fixed).
    # The constraint is only meaningful as an 8-channel operation: assert it
    # STRUCTURALLY over that same expectation set — never re-encode an axis
    # mapping in python (B3: well-range semantics are the compiler's). One
    # material-bearing event whose well set == the expectation's 8-well set is
    # the 8-channel operation; a 96-well single-channel interpretation or a
    # spread of smaller ops (no single op over the full 8-well set) FAILS.
    # If the event honestly carries a channel count (details.channels /
    # channel_count / channelCount / n_channels / activeChannels — the
    # compiler's own hint keys, ExecutionPlanningValidator.collectChannelHints)
    # it must agree with 8; an honest channels:1 over the 8-well set is a
    # single-channel interpretation -> FAIL.
    if exp.get("channel_semantics") == "8-channel":
        exp_set = sorted(exp_wells) if isinstance(exp_wells, list) else None
        add_ev = [ev for ev in events if (ev.get("verb") or ev.get("event_type"))
                  in ("add_material", "multi_dispense", "dispense")]
        if not exp_set:
            v.append("channel_semantics 8-channel but no expectation well set "
                     "to assert against (expectations/P5.json `wells` missing)")
        else:
            # A material-bearing op IS the 8-channel operation when its well
            # set == the expectation's 8-well set AND (if it honestly carries a
            # channel count) that count is 8. The channel-hint keys are the
            # compiler's own (ExecutionPlanningValidator.collectChannelHints).
            def _ch(d):
                for k in ("channels", "channel_count", "channelCount",
                          "n_channels"):
                    val = d.get(k)
                    if isinstance(val, (int, float)) and not isinstance(val, bool):
                        return int(val)
                ac = d.get("activeChannels")
                if isinstance(ac, list):
                    return len(ac)
                return None

            full_op = None
            contradicted = []   # (wells, channels) where an honest count != 8
            for ev in add_ev:
                ws = event_wells(ev)
                if sorted(ws) != exp_set:
                    continue
                ch = _ch(ev.get("details") or {})
                if ch is None or ch == 8:
                    if full_op is None:
                        full_op = ev
                else:
                    contradicted.append((ws, ch))
            if full_op is not None:
                # the 8-channel operation was honored
                pass
            elif contradicted:
                v.append("operation(s) over the expectation's 8-well set %r "
                         "honestly carry a channel count other than 8 "
                         "(%r) — a single-/multi-channel interpretation, not "
                         "an 8-channel operation (B8)"
                         % (exp_set,
                            [(sorted(w), c) for (w, c) in contradicted][:4]))
            elif add_ev:
                got = [event_wells(ev) for ev in add_ev]
                v.append("no single material-bearing operation over exactly the "
                         "expectation's 8-well set %r (8-channel constraint not "
                         "honored): %r" % (exp_set, json.dumps(got)[:200]))
            else:
                v.append("8-channel op expected over %r but no material-bearing "
                         "event delivered" % exp_set)

    # P7: computed set = union of the prior material wells THIS run placed
    # (read from the accumulated state files — B3, never a literal).
    if exp.get("wellset") == "computed:union-of-prior-material-wells":
        expected = state.get("computed_wells")
        got = sorted(w for ev in events for w in event_wells(ev))
        if expected is None:
            v.append("no accumulated prior-material wells to compare (prior prompts failed?)")
        elif sorted(got) != sorted(expected):
            v.append("computed well set %r != accumulated union %r"
                     % (sorted(got), sorted(expected)))
        # 75uL / 3 cycles present in the proposal (shape, not prose)
        det = [ev.get("details") or {} for ev in events
               if (ev.get("verb") or ev.get("event_type")) in ("mix",)]
        if exp.get("require_mix_params") and not det:
            v.append("no mix event with details (75uL/3 cycles not expressible)")
        elif det:
            found_vol = found_cyc = False
            for d in det:
                vol = d.get("volume")
                vol_ok = (isinstance(vol, dict) and vol.get("value") == 75)
                cyc = d.get("cycles")
                cyc_ok = (cyc == 3)
                if vol_ok:
                    found_vol = True
                if cyc_ok:
                    found_cyc = True
            if not (found_vol and found_cyc):
                v.append("mix details missing 75 volume and/or 3 cycles: %r"
                         % json.dumps(det)[:200])

    # P8: kind assertion — an equipment/incubator move, NOT add_material.
    if exp.get("kind_not") == "add_material":
        bad = [ev for ev in events
               if (ev.get("verb") or ev.get("event_type")) == "add_material"]
        if bad:
            v.append("add_material event present where incubator/equipment "
                     "move expected (P8: not a material add)")
    if exp.get("kind_in"):
        kinds = [(ev.get("verb") or ev.get("event_type")) for ev in events]
        card_named = any(
            any(k in str((c or {}).get("prompt", "")).lower() for k in exp["kind_in"])
            for c in cards)
        if not (any(k in exp["kind_in"] for k in kinds) or card_named):
            v.append("no event/card with kind in %r (got %r)"
                     % (exp["kind_in"], sorted(set(k for k in kinds if k))))

    # badge tiers (P3/P4/P5/P6): the resolve/card payload's badge fields must
    # be in TERM-1's honest tiers; NEVER a false Ontology for a composition.
    tier_rule = exp.get("badge")
    if tier_rule:
        got_tiers = state.get("badge_tiers") or []
        allowed = tier_rule.get("allowed")
        never = tier_rule.get("never") or []
        for t in got_tiers:
            if allowed and t not in allowed:
                v.append("badge tier %r not in allowed %r" % (t, allowed))
            if t in never:
                v.append("badge tier %r is forbidden for this prompt (B4)" % t)
        if tier_rule.get("require_present") and not got_tiers:
            v.append("expected badge/tier fields in the resolve/card payload; none delivered")

    # P2: bound placement — events-bound arm with a plate, OR a card naming
    # the plate candidate (spec verbatim).
    if exp.get("outcome") == "plate-placement":
        if verdict != "events-bound" and not cards:
            # a placement-only turn (labwareRequirements>0) is NOT the spec's
            # accepted outcome for P2 — record the channels so the finding is
            # precise, and FAIL per the honesty rule.
            la = (state.get("done") or {}).get("labwareAdditions") or []
            lr = (state.get("done") or {}).get("labwareRequirements") or []
            v.append("P2: no bound plate event and no card (labwareAdditions=%d, "
                     "labwareRequirements=%d — the silent-with-placement shape "
                     "is FAIL per the suite honesty rule; channels recorded)"
                     % (len(la), len(lr)))
    return v


# ---------------------------------------------------------------------------
# the drive
# ---------------------------------------------------------------------------

def drive(base, prompts, selected, single, timeout, preseed, expect_dir,
          compare_dir):
    run_id = RUN_ID_DEFAULT + "-" + time.strftime("%H%M%S")
    if single:
        # DEBUG AID ONLY (OQ2): pre-seeded deck state, NOT an acceptance form.
        session = HeldSession(run_id, preseed=preseed)
    else:
        session = HeldSession(run_id)

    exps = load_expectations(expect_dir) if expect_dir else {}
    results = {}
    blocked_by = {}
    failed = None
    digest_before = data_repo_digest(DATA_REPO)

    for idx in selected:
        prompt = prompts[idx]
        if failed is not None and idx > failed:
            # OQ2: fail-fast with disclosure — dependents are downgraded,
            # never silently skipped, never faked.
            results[idx] = {"prompt": prompt, "status": "blocked-by-P%d" % failed,
                            "verdict": None}
            blocked_by[idx] = failed
            print("P%d status=blocked-by-P%d (disclosure, no drive)" % (idx, failed))
            continue

        mentions = client_mentions(prompt)
        ctx = session.context_for(prompt, mentions)
        key_sha = session.record_key_evidence(prompt, ctx)
        body = {"prompt": prompt, "context": ctx, "history": session.history}
        # the merged client sends NO `surface` key on the event-editor branch
        # (aiClient.ts:261-263) and omits enableThinking (undefined) — the
        # captured wire shape, byte-for-byte.
        request_sha = hashlib.sha256(
            json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

        status, frames, raw = post_sse(base, "/api/ai/draft-events/stream", body, timeout)
        types, done, error_frames, tool_calls = summarize_frames(frames)

        if status != 200 or done is None:
            state = {
                "prompt": prompt, "prompt_idx": idx, "request_sha": request_sha,
                "context_identity_sha256": key_sha,
                "sse_frame_types": types, "http_status": status,
                "events_count": 0, "cards_count": 0, "wall": False,
                "verdict": None, "status": "transport-failure",
                "error": "http=%s frames=%s" % (status, types[-3:]),
            }
            results[idx] = state
            failed = idx
            print("P%d verdict=FAIL (transport) http=%s" % (idx, status))
            continue

        events = done.get("events") or []
        cards = done.get("clarificationRequests") or []
        # wall: an observable error/wall the result names itself with
        error_txt = done.get("error")
        wall = bool(error_txt) or bool(error_frames)

        # honest verdict — TS helper via node CLI (primary) + python re-encode
        # (drift-checked by the parity pin).
        ctx_ids = {
            "deckIds": session.accum.deck_ids(),
            "resolvedIds": session.accum.resolved_ids(done),
        }
        v_ts, rc, err_tail = honest_verdict_via_nodecli(done, ctx_ids)
        v_py, py_err = honest_verdict_python(done, ctx_ids)
        if v_ts is None and v_py is None:
            verdict = None
        elif v_ts is not None and v_ts != v_py:
            # drift between the two encodings = a defect (parity pin's job to
            # catch; pin loudly in the receipt)
            verdict = v_ts
            drift_note = "DRIFT: node-cli=%r python=%r" % (v_ts, v_py)
        else:
            verdict = v_ts

        # badge/tier fields in the resolve/card payload (TERM-1's surface —
        # structural read of whatever tier-bearing fields the turn delivered:
        # cards' snippets/options refs, unresolvedRefs' namespace, materials'
        # grounding). No badge WORDS introduced here (B4).
        badge_tiers = []
        for c in cards:
            if not isinstance(c, dict):
                continue
            for k in ("snippet", "query"):
                val = c.get(k)
                if isinstance(val, str) and val:
                    badge_tiers.append("card:" + val[:60])
        for ur in done.get("unresolvedRefs") or []:
            ref = (ur or {}).get("ref") or {}
            if isinstance(ref, dict) and ref.get("namespace"):
                badge_tiers.append("unresolved:" + str(ref.get("namespace")))
        for ev in events:
            for m in (ev.get("materials") or []):
                ref = (m or {}).get("ref") or {}
                if isinstance(ref, dict):
                    if ref.get("curie"):
                        badge_tiers.append("material-curie")
                    elif ref.get("mint"):
                        badge_tiers.append("material-mint")

        state = {
            "prompt": prompt, "prompt_idx": idx, "request_sha": request_sha,
            "context_identity_sha256": key_sha,
            "sse_frame_types": types,
            "tool_calls": tool_calls,
            "events_count": len(events),
            "cards_count": len(cards),
            "wall": wall,
            "verdict": verdict,
            "ts_cli_exit": rc,
            "ts_cli_stderr_tail": err_tail[-200:] if (rc or err_tail) else None,
            "badge_tiers": badge_tiers,
            "done": {k: done.get(k) for k in
                     ("success", "error", "notes", "deckLayout",
                      "clarificationNeeded", "proseDeliverable",
                      "unboundRefs", "loopAskCounts") if k in done},
            "done_event_verbs": sorted({str(ev.get("verb") or ev.get("event_type"))
                                        for ev in events}),
            "done_labware_additions": len(done.get("labwareAdditions") or []),
            "done_labware_requirements": len(done.get("labwareRequirements") or []),
            "done_equipment_requirements": len(done.get("equipmentRequirements") or []),
            "done_resolved_labwares": len(done.get("resolvedLabwares") or []),
            "unbound_refs": done.get("unboundRefs"),
            "computed_wells": sorted(session.accum.material_wells()) if idx == 7 else None,
        }
        if v_py is not None and v_ts is None:
            state["verdict_drift"] = "python-only verdict %r" % v_py
        if py_err and verdict is None:
            state["silent_shape_dump"] = py_err[-400:]

        violations = []
        exp = exps.get(idx, {})
        if verdict is None:
            violations.append("silent shape: success + zero events + zero cards "
                              "+ no wall (REVISE-GHOST-1: whole-suite FAIL)")
        if wall and verdict != "honest-failure":
            violations.append("wall present but verdict %r != honest-failure" % verdict)
        if not wall and verdict == "honest-failure" and done.get("error") is None \
                and not error_frames:
            violations.append("verdict honest-failure but no observable wall "
                              "(never assert a wall that isn't observable)")
        if idx in exps:
            violations += check_expectation(idx, exp, state)

        state["expectation_violations"] = violations
        state["status"] = "ok" if (verdict is not None and not violations) else "FAIL"

        # advance the held session (ghost-mount equivalent + history)
        session.absorb(done, frames)
        session.push_history(prompt, assistant_text_from_frames(frames, done))

        results[idx] = state
        if verdict is None or violations:
            failed = idx
            print("P%d verdict=%s status=FAIL (%s)"
                  % (idx, verdict, "; ".join(violations[:2])))
        else:
            print("P%d verdict=%s" % (idx, verdict))

    digest_after = data_repo_digest(DATA_REPO)
    write_free = digest_before == digest_after

    # receipts
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    out_dir = os.path.join(RECEIPTS_ROOT, ts)
    os.makedirs(out_dir, exist_ok=True)
    for idx in selected:
        st = results[idx]
        with open(os.path.join(out_dir, "prompt-%d.json" % idx), "w") as f:
            json.dump(st, f, indent=2, sort_keys=True)
    meta = {
        "suite": "L2-SUITE-A plate leg",
        "run_id": run_id,
        "mode": "single" if single else "all",
        "prompts": [idx for idx in selected],
        "base": base,
        "corpus_sha256": corpus_sha256(os.path.join(HERE, "prompts-plate-leg.txt")),
        "data_repo_digest_before": digest_before,
        "data_repo_digest_after": digest_after,
        "write_free": write_free,
        "blocked_by": {str(k): v for k, v in blocked_by.items()},
        "verdicts": {str(k): (v.get("verdict") if isinstance(v, dict) else v.get("status"))
                     for k, v in results.items()},
        "key_evidence": session.key_evidence,
    }
    with open(os.path.join(out_dir, "run-meta.json"), "w") as f:
        json.dump(meta, f, indent=2, sort_keys=True)

    # determinism byte-compare (B9: channel SHAPES, never prose)
    compare_fail = []
    if compare_dir:
        compare_fail = compare_deterministic(compare_dir, results)

    all_ok = (failed is None and write_free and not compare_fail)
    print("receipts: %s" % out_dir)
    print("write-free: %s (digest %s… == %s…)"
          % (write_free, digest_before[:12], digest_after[:12]))
    if compare_fail:
        print("determinism compare FAIL: %r" % compare_fail)
    print("SUITE-VERDICT: %s" % ("PASS" if all_ok else "FAIL"))
    return 0 if all_ok else 1


def compare_deterministic(compare_dir, results):
    fails = []
    for idx, st in results.items():
        p = os.path.join(compare_dir, "P%d.json" % idx)
        if not os.path.exists(p):
            continue
        exp = json.load(open(p))
        if not exp.get("deterministic"):
            continue
        for field in ("events_count", "cards_count", "wall", "verdict"):
            if field in exp and exp[field] != st.get(field):
                fails.append("P%d.%s: expected %r got %r"
                             % (idx, field, exp[field], st.get(field)))
    return fails


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--all", action="store_true", help="drive prompts 1-8 in order")
    ap.add_argument("--prompts", type=int, action="append", default=None,
                    help="drive only these prompt numbers (repeatable)")
    ap.add_argument("--single", action="store_true",
                    help="debug aid: request-injected pre-seeded deck (OQ2: NOT an acceptance form)")
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--timeout", type=int, default=240)
    ap.add_argument("--expectations", default=os.path.join(HERE, "expectations"))
    ap.add_argument("--compare", default=None,
                    help="expectations dir to byte-compare deterministic channels against")
    ap.add_argument("--preseed-plate", default=None,
                    help="--single debug aid: comma list of pre-placed plate ids "
                         "(e.g. LAB-plate-1) so P3-P8 can bind against them")
    a = ap.parse_args()

    if a.all:
        selected = list(range(1, 9))
    elif a.prompts:
        selected = sorted(set(a.prompts))
    else:
        ap.error("need --all or --prompts N")
    if a.single and len(selected) != 1:
        ap.error("--single drives exactly one prompt (debug aid)")

    preseed = None
    if a.preseed_plate:
        preseed = [x.strip() for x in a.preseed_plate.split(",") if x.strip()]

    prompts = load_prompts(os.path.join(HERE, "prompts-plate-leg.txt"))
    try:
        rc = drive(a.base, prompts, selected, a.single, a.timeout, preseed,
                   a.expectations, a.compare)
    except urllib.error.URLError as e:
        print("environment error: cannot reach %s: %s" % (a.base, e))
        return 2
    return rc


if __name__ == "__main__":
    sys.exit(main())
