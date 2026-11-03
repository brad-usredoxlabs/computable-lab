#!/usr/bin/env python3
"""L2-TRUNK-JOURNEYS-1 — the ONE driver for the trunk journeys (spec 2026-10-31).

Journeys are DATA (journeys/J*.yaml). This driver:
  1. digests the data repo record tree (suite-a write-free fingerprint),
  2. shells out ui-drive.cjs per journey (real browser, REAL transport;
     request-body capture via request LISTENERS only — zero route handlers,
     zero interception of /api/ai/**, by construction),
  3. applies the YAML-declared channel assertions over the CAPTURED outgoing
     request bodies (assertions are pure functions over data — test-channel-
     selfcheck.py proves they catch a renamed channel),
  4. asserts the declared rendered-outcome evidence pair (ROUND-TRIP-GATE-1:
     request-body artifact + rendered-outcome evidence per journey),
  5. writes per-journey receipts + run-meta.json (verdict table, digest
     before/after) under <receipts>/<UTC-ts>/ and points `latest` at it.

Exit codes (suite-a convention): 0 = all journeys green; 1 = any journey RED
(incl. transport honest-red); 2 = environment error (no stack, driver crash).

Usage:
  python3 run-journeys.py --all [--journey J1] [--app-base http://localhost:5193]
Env: CL_JOURNEY_APP_BASE, CL_JOURNEY_API_BASE, CL_RECEIPTS, CL_DATA_REPO.
"""
import argparse
import datetime
import hashlib
import importlib  # noqa: F401  (kept for selfcheck import symmetry)
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
DEFAULT_APP_BASE = os.environ.get("CL_JOURNEY_APP_BASE", "http://localhost:5193")
DEFAULT_API_BASE = os.environ.get("CL_JOURNEY_API_BASE", "http://localhost:3093")
RECEIPTS_ROOT = os.environ.get("CL_RECEIPTS",
                               "/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS")
DATA_REPO = os.environ.get("CL_DATA_REPO", "/home/brad/.computable-lab/worktrees/main")
UI_DRIVER = os.path.join(HERE, "ui-drive.cjs")
APP_DIR = os.path.join(REPO_ROOT, "app")
TURN_TIMEOUT = int(os.environ.get("CL_JOURNEY_TIMEOUT", "660"))
FAKE_SERVER = os.path.join(HERE, "fake-inference.py")
FAKE_CANNED = os.path.join(HERE, "canned", "completions.yaml")

# N1 (ruling Q-D): the trunk FE identity is a LITERAL set. NO env derivation:
# CL_JOURNEY_APP_BASE (or --app-base) selects the run's target, but it can
# never MAKE a target count as trunk. A scratch vite on any other port is a
# scratch run, full stop. check-gate.py compares the SAME literal.
TRUNK_PORTS = {("localhost", 5193), ("127.0.0.1", 5193)}


def _hostport(u):
    from urllib.parse import urlparse
    p = urlparse(u or "")
    return (p.hostname or "", p.port)


def app_base_is_trunk(u):
    """A4: literal-set membership. run-meta must not be able to lie about
    which FE a run exercised (the cycle-1 D2 defect class)."""
    return _hostport(u) in TRUNK_PORTS

# ---------------------------------------------------------------------------
# LEG-C6-SWEEP-DEBT (spec §6): the chat-host sweep scope.
#
# The inventory is DATA (config/chat/chat-hosts.yaml) — read it, NEVER a
# hardcoded host list. A `--chat-hosts` run drives each inventory host ONCE
# through the EXISTING browser executor (run_journey -> ui-drive.cjs), writes
# ONE receipt per host (the outgoing request body + the rendered-answer
# screenshot) into the SAME run dir, and appends a `chat_host_verdicts` table
# to run-meta BEFORE the `latest` flip. There is no parallel harness: this is
# the ONE driver's run shape gaining a scope, the sweep rides the existing
# run_journey path, and the probe journeys are DATA built from the inventory
# (one generic step sequence + one shared canned prompt, no per-host code).
# ---------------------------------------------------------------------------

CHAT_HOSTS_INVENTORY = os.path.join(REPO_ROOT, "config", "chat", "chat-hosts.yaml")

# The shared probe prompt (DATA — one canned CHATHOST-SWEEP block keyed by
# prompt_contains serves all hosts; no per-host prompt strings in code).
CHATHOST_SWEEP_PROMPT = "CHATHOST-SWEEP probe round trip"

# The artifact record schema (the schemaId the artifact-host probe's REAL
# record materialises against, via the standard seed.record machinery). The
# id is the schema's own $id (schema/studies/artifact.schema.yaml).
ARTIFACT_SCHEMA = ("https://computable-lab.com/schema/computable-lab/"
                   "artifact.schema.yaml")


def _artifact_probe_seed(rid):
    """The payload for the REAL artifact record an artifact-host probe mounts.

    recordId == the probe's :artifactId token, so the page's
    getRecord(artifactId) resolves it. artifactKind: writeup + a minimal
    TipTap `body` (the document-viewer arm — the probe kind token is not
    'pdf'). studyId is a STU-shaped probe token (ProjectWorkspacePage
    validates /STU-.../; the WorkspaceProvider renders a graceful default
    for a missing study, so no study record is required). This is seed DATA
    materialised through the SAME seed/teardown machinery every journey
    uses (seed.record / teardown.delete_record) — not a special case and
    not a stubbed API."""
    return {
        "kind": "artifact",
        "recordId": rid,
        "id": rid,
        "title": "L2 chat-host sweep probe artifact",
        "studyId": "STU-%s" % rid,
        "artifactKind": "writeup",
        "state": "draft",
        "body": {"type": "doc", "content": [
            {"type": "paragraph", "content": [
                {"type": "text",
                 "text": "Probe artifact body for the L2 chat-host sweep "
                          "(harness seed data)."}]},
        ]},
    }


def load_chat_host_inventory(path=CHAT_HOSTS_INVENTORY):
    """The chat-host inventory entries (config/chat/chat-hosts.yaml): returns
    (ids, surfaces) IN FILE ORDER — ids[i] and surfaces[i] describe the SAME
    host. Mirrors check-gate.py's loader (id + surface required, no duplicate
    ids) so the sweep grades against the exact same set the gate uses. The
    inventory is the single source of truth: a missing/malformed file raises
    so the sweep fails closed."""
    import yaml
    with open(path) as fh:
        doc = yaml.safe_load(fh)
    hosts = (doc or {}).get("hosts") or []
    ids = []
    surfaces = []
    for h in hosts:
        if not isinstance(h, dict) or not h.get("id"):
            raise ValueError("chat-host inventory %s has a host entry with no id"
                             % path)
        surface = h.get("surface")
        if not isinstance(surface, str) or not surface:
            raise ValueError("chat-host inventory %s host %r has no machine "
                             "`surface` field" % (path, h.get("id")))
        ids.append(h["id"])
        surfaces.append(surface)
    if len(ids) != len(set(ids)):
        raise ValueError("chat-host inventory %s has duplicate host ids" % path)
    return ids, surfaces


def probe_nav_path(route):
    """Build the browser probe's nav path from the inventory `route` DATA (the
    first URL path of the entry). Generic over the DATA — no per-host code:
    each `:param` is substituted with a stable probe token (so the goto
    reaches a real host route, not a 404), EXCEPT an optional `:param?`
    which is dropped (the product makes it optional). `studyId` gets a
    `STU-`-shaped token because ProjectWorkspacePage validates
    `/^STU-[A-Za-z0-9_-]+$/`. The instance params resolve to the product's
    own honest fallback/empty state for a probe token — the probe asserts the
    UNIVERSAL chat round trip, never a host-specific content channel.
    (Whether each host renders its chat pane at a probe-token URL is the
    orchestrator's LIVE acceptance, §6.)"""
    m = re.search(r"[\"'`]?(/[^\s\"'`)]*)", route or "")
    base = m.group(1) if m else "/"
    def _sub(mm):
        name = mm.group(1)
        if name == "studyId":
            return "STU-CHATHOST-PROBE"
        return "CHATHOST-PROBE"
    # drop optional `:param?` segments FIRST (while the `?` marker is still
    # present — the product makes these params optional), then any residual
    # `?` (e.g. a query fragment), then substitute the remaining `:param`s.
    base = re.sub(r"/:[A-Za-z0-9_]+\?", "", base)
    base = base.split("?")[0]
    base = re.sub(r":([A-Za-z0-9_]+)", _sub, base)
    return base.rstrip("/") or "/"


def build_chat_host_probe(host_id, surface, route):
    """One generic probe journey for a single chat host (DATA from the
    inventory). Reuses the existing step vocabulary (goto -> open_ai_tab ->
    ask -> screenshot) — the universal HarnessChatPane composer/affordances
    are host-generic, so there is NO per-host code and NO per-host prompt
    string.

    Seed: hosts whose route mounts a record-by-id page materialise a REAL
    record through the SAME seed.record / teardown.delete_record machinery
    every journey uses — DATA, not a special case, not a stubbed API. The
    route-shape rule (not a host-name comparison) is: an artifact route
    (/artifact/:kind/:artifactId) fetches its record by artifactId on mount,
    so the probe must mount the REAL host page with a REAL artifact record.
    recordId == the probe's :artifactId token (the same token the nav path
    carries), so getRecord(artifactId) resolves it. Every other host rides
    an honest fallback/empty state for a probe token and needs no record
    (seed stays {} for those)."""
    nav = probe_nav_path(route)
    seed = {}
    teardown = {}
    if re.match(r"^/artifact/", nav):
        # recordId == the :artifactId token (last path segment) the page
        # fetches by. Derived from the nav path the product declared — the
        # same token goto navigates to — so the read resolves. recordId
        # rides TOP-LEVEL (the seed.record contract: seed_journey reads
        # rec["recordId"]), exactly as every journey seed does (J1.yaml).
        rid = nav.rsplit("/", 1)[-1]
        seed = {"record": {"recordId": rid, "schemaId": ARTIFACT_SCHEMA,
                           "payload": _artifact_probe_seed(rid)}}
        teardown = {"delete_record": rid}
    return {
        "id": host_id,
        "title": "chat-host sweep probe: %s (%s)" % (host_id, surface),
        "file": "probe-%s.yaml" % host_id,
        "timeout_s": 300,
        "seed": seed,
        "teardown": teardown,
        "steps": [
            {"step": "goto", "path": nav},
            {"step": "open_ai_tab"},
            {"step": "ask", "text": CHATHOST_SWEEP_PROMPT},
            {"step": "screenshot", "tag": "rendered-answer"},
        ],
        "assert": {"rendered": [
            {"assistant_answer_visible": True},
            {"turns_at_least": 1},
            {"no_error_frame": True},
        ]},
    }


def emit_chat_host_verdicts(run_dir, host_ids, receipts=None):
    """THE EMITTER (spec §8.2 T-4 / §6, LEG-C6-SWEEP-DEBT): build the
    `chat_host_verdicts` table from the receipts that ACTUALLY exist in the
    run dir. PURE over the on-disk receipts (the gate re-verifies existence).
    Honest + fail-closed, mirroring the sweep's real outcome per host:
      - a host whose `<host>.json` receipt exists AND grades green
            -> {"verdict": "accept", "receipts": "<host>.json"};
      - a host that WAS swept but graded red/transport-error
            -> {"verdict": "red", ...} (a non-accept the gate grades RED);
      - a host NEVER swept (no receipt file)
            -> OMITTED (so the gate's strict-subset check names it).
    A strict-subset table (a dropped host) is the spec's RED case. Receipts
    default to the per-host `<host>.json` files that run_journey writes into
    `run_dir`."""
    verdicts = {}
    for hid in host_ids:
        rx = (receipts or {}).get(hid) or ("%s.json" % hid)
        p = os.path.join(run_dir, rx)
        if not os.path.isfile(p):
            continue                      # never swept -> omit -> gate names it
        with open(p) as fh:
            rec = json.load(fh)
        verdicts[hid] = {"verdict": "accept" if rec.get("verdict") == "green"
                         else "red",
                         "receipts": rx}
    return verdicts

# ---------------------------------------------------------------------------
# Channel assertions — PURE over the captured request-body artifact.
# Assertion dict keys: path (dot path), present|absent|equals|contains_any.
# Returns a list of violation strings ([] = channels satisfy every assertion).
# ---------------------------------------------------------------------------

def _dig(obj, dotted):
    cur = obj
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
            cur = cur[int(part)]
        else:
            return None, False
    return cur, True


def check_channel_assertions(body, assertions):
    violations = []
    for a in assertions:
        path = a["path"]
        val, found = _dig(body, path)
        if a.get("present"):
            if not found or val is None or val == "":
                violations.append("channel MISSING: %s (found=%r value=%r)" % (path, found, val))
        if a.get("absent"):
            if found:
                violations.append("channel must be ABSENT but PRESENT: %s (value=%r)" % (path, val))
        if "equals" in a:
            if not found or val != a["equals"]:
                violations.append("channel %s != expected (found=%r value=%r expected=%r)"
                                  % (path, found, val, a["equals"]))
        if "contains_any" in a:
            ok = found and isinstance(val, list) and any(w in val for w in a["contains_any"])
            if not ok:
                violations.append("channel %s does not carry any of %r (value=%r)"
                                  % (path, a["contains_any"], val))
        if "equals_set" in a:  # D5: exact set equality (order-insensitive)
            want = list(a["equals_set"])
            ok = (found and isinstance(val, list)
                  and sorted(map(str, val)) == sorted(map(str, want)))
            if not ok:
                violations.append("channel %s is not EXACTLY the set %r (value=%r)"
                                  % (path, want, val))
    return violations


# ---------------------------------------------------------------------------
# Rendered-outcome assertions — PURE over the ui-drive evidence dict.
# ---------------------------------------------------------------------------

def _reask_violations(evidence):
    """D3: a RE-ASK is the answered clarification's question appearing AGAIN
    after the answer. Two arms:
      (wire) an announcement whose prompt matches the answered card's captured
        prompt text, announced AFTER the clarificationAnswers request rode;
      (DOM) evidence.reask_new_cards — fresh cards still offering option
        buttons whose text repeats the answered prompt.
    Fails closed: neither arm capturable => violation."""
    anns = evidence.get("clarification_announcements") or []
    answers = evidence.get("answer_events") or []
    answered_prompt = (evidence.get("answered_prompt") or "").strip()
    if not answered_prompt:
        return ["rendered: answer_no_reask declared but the answered card's "
                "prompt text was not captured — cannot prove no re-ask"]
    if (evidence.get("reask_new_cards") or 0) > 0:
        return ["rendered: RED-BY-PRODUCT-DEFECT — %d NEW clarification "
                "card(s) still offer options repeating the ANSWERED prompt "
                "%r (D3 loop)" % (evidence["reask_new_cards"],
                                  answered_prompt[:90])]
    if not answers:
        return ["rendered: answer_no_reask declared but NO clarificationAnswers "
                "request was captured — cannot prove no re-ask"]
    # Wire arm: find the announcement(s) that match the answered card's
    # prompt (the client testid is a per-render id, so match on prompt text).
    def matches(a_prompt):
        if not a_prompt:
            return False
        ap = a_prompt.strip()
        return answered_prompt.startswith(ap[:min(60, len(ap))]) or \
            ap.startswith(answered_prompt[:min(60, len(answered_prompt))])
    answer_t = min(ev.get("captured_at_ms", 0) for ev in answers)
    reasked = [a for a in anns if matches(a.get("prompt"))
               and a.get("captured_at_ms", 0) > answer_t]
    if reasked:
        return ["rendered: RED-BY-PRODUCT-DEFECT — the answer turn RE-ASKED "
                "the SAME question on the wire (re-announced after the "
                "answer): %r" % (answered_prompt[:90],)]
    return []


def check_rendered_assertions(evidence, assertions):
    violations = []
    for a in assertions:
        if "assistant_answer_visible" in a:
            n = evidence.get("assistant_turns", 0)
            nonempty = evidence.get("last_assistant_text_nonempty", False)
            want = a["assistant_answer_visible"]
            if want and not (n >= 1 and nonempty):
                violations.append("rendered: no visible non-empty assistant answer "
                                  "(turns=%d nonempty=%r)" % (n, nonempty))
        if "no_error_frame" in a and a["no_error_frame"]:
            if evidence.get("error_frames", 0) > 0:
                violations.append("rendered: error frame(s) surfaced (%d)" % evidence["error_frames"])
        if "turns_at_least" in a:
            if evidence.get("turns_completed", 0) < a["turns_at_least"]:
                violations.append("rendered: turns_completed=%d < %d"
                                  % (evidence.get("turns_completed", 0), a["turns_at_least"]))
        if "clarification_answered" in a and a["clarification_answered"]:
            if not evidence.get("clarification_answered"):
                violations.append("rendered: no clarification card was answered")
        if "clarification_no_loop" in a and a["clarification_no_loop"]:
            if not evidence.get("clarification_answer_no_loop"):
                violations.append("rendered: after answering, clarification cards "
                                  "STILL offer options (loop) — cards_offering=%r"
                                  % evidence.get("cards_still_offering"))
        if "answer_no_reask" in a and a["answer_no_reask"]:  # D3
            viols = _reask_violations(evidence)
            violations.extend(viols)
        if "answer_intent_id_same" in a and a["answer_intent_id_same"]:  # D3
            ids = [x for x in (evidence.get("intent_ids") or []) if x]
            if len(ids) < 2:
                violations.append("rendered: answer-turn intentId cannot be "
                                  "compared — intent cards seen: %r" % (evidence.get("intent_ids"),))
            elif ids[0] != ids[-1]:
                violations.append("rendered: RED-BY-PRODUCT-DEFECT — spec J2 "
                                  "\"the folded answer turn produces a "
                                  "user-visible answer with the same "
                                  "intentId\": pre-answer intentId %r != "
                                  "answer-turn intentId %r (intent cards: %r)"
                                  % (ids[0], ids[-1], evidence.get("intent_ids")))
        if "proposal_accepted" in a and a["proposal_accepted"]:
            if not evidence.get("proposal_accepted"):
                violations.append("rendered: no proposal diff was accepted (ChangesPanel Accept)")
        if "text_contains" in a:
            hay = json.dumps(evidence.get("assistant_texts", [])) + " " + \
                (evidence.get("body_text_tail") or "")
            needles = a["text_contains"]
            needles = needles if isinstance(needles, list) else [needles]
            if not any(str(n) in hay for n in needles):
                violations.append("rendered: assistant texts carry none of %r" % (needles,))
    return violations


# ---------------------------------------------------------------------------
# Write-free digest (suite-a pattern): relpath+size fingerprint of the tree.
# ---------------------------------------------------------------------------

def digest_repo(root, subdir="records"):
    """D8 fix: content-hash fingerprint (sha256 per file, folded into one
    digest) — a same-size content change is caught, not just a size change."""
    base = os.path.join(root, subdir)
    if not os.path.isdir(base):
        return None
    import hashlib
    entries = []
    for dirpath, _dirs, files in os.walk(base):
        for f in files:
            p = os.path.join(dirpath, f)
            try:
                with open(p, "rb") as fh:
                    fh_hash = hashlib.sha256(fh.read()).hexdigest()
            except OSError:
                continue
            entries.append("%s:%s" % (os.path.relpath(p, root), fh_hash))
    entries.sort()
    return hashlib.sha256("\n".join(entries).encode()).hexdigest()[:16]


def declared_ids(js_dir):
    """D2 helper: the journey ids DECLARED by the journeys/ directory — the
    complete set a green tick claim must cover."""
    import yaml
    ids = set()
    for f in sorted(os.listdir(js_dir)):
        if not f.endswith(".yaml"):
            continue
        with open(os.path.join(js_dir, f)) as fh:
            y = yaml.safe_load(fh)
        if y and y.get("id"):
            ids.add(y["id"])
    return ids


def latest_run_dir():
    link = os.path.join(RECEIPTS_ROOT, "latest")
    return os.path.realpath(link) if os.path.islink(link) else None


# ---------------------------------------------------------------------------
# A1/A2 — the model-layer fake lifecycle (ruling Q-A/Q-B).
# The fake is pointed at the backend ONLY through the shipped config surface
# (the AI-profile lifecycle: save -> activate -> [run] -> restore). Every wire
# stays REAL: browser -> :3093 /api/ai/** (untouched), backend -> fake (real
# HTTP). The browser never intercepts (the ban + self-check are untouched).
# ---------------------------------------------------------------------------

def health_ai(api_base):
    import urllib.request
    with urllib.request.urlopen(api_base + "/api/health", timeout=10) as r:
        return (json.load(r).get("components") or {}).get("ai") or {}


def active_ai_profile(api_base):
    import urllib.request
    with urllib.request.urlopen(api_base + "/api/config/ai/profiles",
                                timeout=15) as r:
        return json.load(r).get("activeProfile")


def start_fake_server(log_path, timeout=60):
    """Launch fake-inference.py on a dedicated free port (port 0 = OS picks).
    Returns (proc, fake_base). Raises on bring-up failure (the new seed-
    failure shape N3 names)."""
    cmd = ["python3", FAKE_SERVER, "--port", "0",
           "--canned", FAKE_CANNED, "--log", log_path]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    out_pipe = proc.stdout or sys.stderr
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            out = out_pipe.read() or ""
            raise RuntimeError("fake server exited during bring-up: %s"
                               % out[-400:])
        line = out_pipe.readline()
        if not line:
            continue
        if line.startswith("FAKE-READY port="):
            port = int(line.split("port=")[1].split()[0])
            return proc, "http://127.0.0.1:%d/api/v1" % port
        print("[fake] %s" % line.strip(), file=sys.stderr)
    proc.terminate()
    raise RuntimeError("fake server did not report FAKE-READY within %ds"
                       % timeout)


def fake_point(api_base, fake_base, run_dir):
    """Point the backend's OWN inference config at the fake via the shipped
    profile surface. Saves a fresh 'l2trunkj-fake' profile, activates it, and
    PROVES (A2) /api/health.ai.inferenceUrl now reports the fake. Returns
    (live_profile, live_url, fake_url) for the restore + receipt record."""
    live_profile = active_ai_profile(api_base)
    if not live_profile:
        raise RuntimeError("cannot snapshot the live AI profile — refusing to "
                           "point the backend at the fake without a restore "
                           "target (A2)")
    live_url = health_ai(api_base).get("inferenceUrl")
    if not live_url:
        raise RuntimeError("health reports no live inferenceUrl — no A2 "
                           "restore target")
    # The profile lifecycle is the seam: activate() copies the profile's
    # inference into the effective config and re-runs initializeAiRuntime
    # (server.ts:1449). No product test-mode branch anywhere.
    st, body = _api(api_base, "PUT", "/api/config/ai/profiles/l2trunkj-fake",
                    {"inference": {"provider": "openai-compatible",
                                   "baseUrl": fake_base,
                                   "model": "l2trunkj-fake"},
                     "agent": {}})
    if st not in (200, 201):
        raise RuntimeError("fake profile save failed %s -> %s" % (st, body))
    st, body = _api(api_base, "POST",
                    "/api/config/ai/profiles/l2trunkj-fake/activate")
    if st not in (200, 201):
        # Never leave a half-pointed backend: roll the profile back.
        _api(api_base, "POST",
             "/api/config/ai/profiles/%s/activate" % live_profile)
        raise RuntimeError("fake profile activate failed %s -> %s" % (st, body))
    time.sleep(1.5)  # let the probe (GET fake/models) + runtime init settle
    url_now = health_ai(api_base).get("inferenceUrl")
    if url_now != fake_base.rstrip("/"):
        # A2: a leaked fake pointer would poison every lane-2 surface — if the
        # point did not take, restore now and fail loud.
        _api(api_base, "POST",
             "/api/config/ai/profiles/%s/activate" % live_profile)
        raise RuntimeError("inferenceUrl did not follow the fake: %r (want %r)"
                           % (url_now, fake_base))
    with open(os.path.join(run_dir, "fake-config.json"), "w") as fh:
        json.dump({"mode": "fake", "live_profile": live_profile,
                   "live_url": live_url, "fake_base": fake_base,
                   "pointed_url": url_now}, fh, indent=2)
    return live_profile, live_url, url_now


def restore_ok(live_url, restored_url):
    """A2: the restore is graded by EXACT equality with the live sampler URL.
    A leaked fake pointer (restored != live) must be caught, not waved through —
    the shared :3093 stack must never be left pointed at the fake. Pure so the
    self-check can exercise the grading arm without a live server."""
    return bool(live_url) and restored_url == live_url


def fake_restore(api_base, live_profile, live_url):
    """A2: graded restoration, not a promise. Delete the fake profile,
    re-activate the live profile, and ASSERT /api/health.ai.inferenceUrl is
    back to the live sampler URL. Returns the (restored_url, ok) pair."""
    _api(api_base, "DELETE", "/api/config/ai/profiles/l2trunkj-fake")
    st, _body = _api(api_base, "POST",
                     "/api/config/ai/profiles/%s/activate" % live_profile)
    if st not in (200, 201):
        raise RuntimeError("live profile re-activate failed %s" % st)
    time.sleep(1.5)
    url_now = health_ai(api_base).get("inferenceUrl")
    ok = restore_ok(live_url, url_now)
    return url_now, ok


# ---------------------------------------------------------------------------

def _api(api_base, method, path, body=None, timeout=30, user_id="USR-BRAD"):
    import urllib.request
    import urllib.error
    data = json.dumps(body).encode() if body is not None else None
    headers = {"x-user-id": user_id}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(api_base + path, data=data, method=method,
                                 headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except Exception as e:
        return -1, {"error": str(e)}


def seed_journey(journey, api_base):
    """Materialise journey `seed` (idempotent): record create or scratch copy.
    Returns (ok, note, seeded_ids)."""
    seed = journey.get("seed") or {}
    uid = journey.get("acting_user_id", "USR-BRAD")  # D11: user rides the YAML
    ids = []
    if "record" in seed:
        rec = seed["record"]
        rid = rec["recordId"]
        st, _ = _api(api_base, "GET", "/api/records/" + rid, user_id=uid)
        if st == 200:
            ids.append(rid)
            return True, "record exists (reused): %s" % rid, ids
        st, body = _api(api_base, "POST", "/api/records",
                        {"schemaId": rec["schemaId"], "payload": rec["payload"],
                         "message": "L2-TRUNK-JOURNEYS seed"}, user_id=uid)
        if st not in (200, 201):
            return False, "seed create failed %s -> %s %s" % (rid, st, body), ids
        ids.append(rid)
        return True, "record created: %s" % rid, ids
    if "copy_record" in seed:
        c = seed["copy_record"]
        st, body = _api(api_base, "GET", "/api/records/" + c["from"], user_id=uid)
        if st != 200:
            return False, "copy source missing: %s -> %s" % (c["from"], st), ids
        payload = (body.get("record") or body).get("payload") or body.get("payload")
        payload = dict(payload)
        payload["recordId"] = c["to"]
        if payload.get("id"):
            payload["id"] = c["to"]
        if "source_artifact_id" in c:
            sa = dict(payload.get("source_artifact") or {})
            sa["id"] = c["source_artifact_id"]
            payload["source_artifact"] = sa
        if c.get("join_via_newer_createdAt"):
            # findSemanticDraft joins the NEWEST draft per source_artifact.id
            # (semanticDraft.ts takesBest); stamp now so the copy wins.
            payload["createdAt"] = datetime.datetime.now(
                datetime.timezone.utc).isoformat()
        if c.get("set_status"):
            # Scratch-record test-data prep (the live fixture drifted to
            # 'promoted', which findSemanticDraft skips AND whose candidate
            # lock (XDR_CANDIDATE_LOCKED) refuses chat-accepted writes; the
            # merged fixture was born status:'pending_review' with NO
            # per-candidate status — e2e/fixtures/w28-said-meant/xdr.json).
            payload["status"] = c["set_status"]
            for cand in payload.get("candidates") or []:
                if isinstance(cand, dict) and "status" in cand:
                    del cand["status"]
        st2, _ = _api(api_base, "GET", "/api/records/" + c["to"], user_id=uid)
        if st2 == 200:
            st3, _ = _api(api_base, "PUT", "/api/records/" + c["to"],
                          {"payload": payload, "message": "L2-TRUNK-JOURNEYS re-seed"},
                          user_id=uid)
            if st3 not in (200, 201):
                return False, "re-seed PUT failed %s -> %s" % (c["to"], st3), ids
            ids.append(c["to"])
            return True, "scratch copy reset: %s" % c["to"], ids
        if not c.get("schemaId"):  # D11: the copy's schema is DECLARED in YAML
            return False, ("copy seed missing schemaId in journey YAML (D11: "
                           "the driver hardcodes no schema)"), ids
        st3, body3 = _api(api_base, "POST", "/api/records",
                          {"schemaId": c["schemaId"],
                           "payload": payload, "message": "L2-TRUNK-JOURNEYS scratch copy"},
                          user_id=uid)
        if st3 not in (200, 201):
            return False, "copy seed failed %s -> %s %s" % (c["to"], st3, body3), ids
        ids.append(c["to"])
        return True, "scratch copy created: %s" % c["to"], ids
    return True, "no seed", ids


def teardown_journey(journey, api_base):
    td = journey.get("teardown") or {}
    uid = journey.get("acting_user_id", "USR-BRAD")
    if "delete_record" in td:
        st, _ = _api(api_base, "DELETE", "/api/records/" + td["delete_record"],
                     user_id=uid)
        return st in (200, 204, 404)
    return True


# ---------------------------------------------------------------------------
# Interception-ban ATTESTATION grading (N4) — PURE over the ui receipt dict.
# The construction ban (ui-drive never CALLS route APIs) has two runtime
# tripwires: the counter (route_handlers_used) and the wrapper-identity
# snapshot (attestations.route_api_wrapped, re-evaluated at receipt write).
# Pre-N4 the driver read only the counter — the DELETE-variant prototype-chain
# detour misses it, so the attestation is the remaining tripwire and MUST be
# enforced: missing/false = RED, never silently green. Scope stated honestly:
# the snapshot catches only the delete/replace variant; a no-delete
# prototype-chain call (own wrapper intact) leaves this flag TRUE and is a
# named undetectable residual defended by the construction ban + the
# real-transport receipt (ui-drive.cjs comment block, gap (d)). Pure so the
# self-check drives THE SAME FUNCTION the driver runs (no helper divergence).
# ---------------------------------------------------------------------------

def attestation_violations(ui):
    violations = []
    if ui.get("route_handlers_used", 0) != 0:
        violations.append("BANNED: %d route handler(s) touched /api/ai/**"
                          % ui["route_handlers_used"])
    att = ui.get("attestations") or {}
    if att.get("route_api_wrapped") is not True:
        violations.append(
            "ATTESTATION-RED: attestations.route_api_wrapped is %r (want "
            "true) — the route-registration wrappers were NOT verifiably "
            "live at receipt time (missing = pre-N4 receipt shape; false = "
            "the own-property wrapper was deleted or swapped so the "
            "prototype-chain resolution no longer lands on it — the delete/"
            "replace variant only; a no-delete prototype-chain call leaves "
            "this flag true and is a NAMED UNDETECTABLE residual, see the "
            "ui-drive.cjs comment block)"
            % (att.get("route_api_wrapped"),))
    return violations


def grade_write_proof(journey, ui, api_base):
    """D4 fix: the write evidence LANDS IN THE RECEIPT and absence is RED.

    Returns (violations, proof_record). Rules:
      - if the UI captured ANY write body but the journey declares no
        write_proof block -> RED (silently deleting `write_proof:` can no
        longer yield green);
      - expectedSha cross-check: the captured write body's expectedSha must
        equal the context.attachedProtocol.sha the assistant request rode;
      - persisted read-back: GET the record, record status + label_found +
        payload digest in the proof_record.
    """
    proof = journey.get("write_proof")
    writes = [w for w in ui.get("write_request_bodies", [])
              if w.get("method") in ("PUT", "POST")]
    if not proof:
        seed = journey.get("seed") or {}
        # D4's anti-silent-deletion teeth: a write to the SCRATCH COPY (or an
        # explicitly declared write_target) IS the journey's declared write —
        # deleting `write_proof:` from the YAML must go RED, not silent-green.
        intentional = set()
        if "copy_record" in seed:
            intentional.add(seed["copy_record"]["to"])
        if journey.get("write_target"):
            intentional.add(journey["write_target"])
        # the deck pane AUTOSAVES its own event-graph record on every edit —
        # that PUT is incidental UI plumbing, not the journey's write.
        deck_autosave = {seed["record"]["recordId"]} if "record" in seed else set()
        for w in writes:
            ep = str(w.get("endpoint", ""))
            if any(r in ep for r in intentional):
                return (["write-proof: journey wrote to %r but declares NO "
                         "write_proof block — write evidence must be graded "
                         "and persisted (D4)" % ep], None)
            if not any(r in ep for r in deck_autosave | intentional):
                # an AI write must not leak outside the fixture sandbox
                return (["write-proof: write request to a record OUTSIDE the "
                         "journey's fixture sandbox: %s" % ep], None)
        return [], None
    rec = {"record": proof["record"], "captured_writes": len(writes)}
    # expectedSha == the attachedProtocol.sha the AI request carried.
    exp_sha = None
    for w in writes:
        if proof["record"] in str(w.get("endpoint", "")):
            exp_sha = (w.get("body") or {}).get("expectedSha")
            rec["write_endpoint"] = w.get("endpoint")
            rec["write_method"] = w.get("method")
            rec["expected_sha"] = exp_sha
            rec["write_body_sha256_12"] = hashlib.sha256(
                json.dumps(w.get("body"), sort_keys=True).encode()).hexdigest()[:12]
            break
    ai_sha = None
    for b in ui.get("ai_request_bodies", []):
        s = ((((b.get("body") or {}).get("context") or {})
              .get("attachedProtocol") or {}).get("sha"))
        if s:
            ai_sha = s
    rec["attached_protocol_sha"] = ai_sha
    violations = []
    if writes and not exp_sha:
        violations.append("write-proof: no captured write body carries "
                          "expectedSha for %s" % proof["record"])
    elif exp_sha and ai_sha and exp_sha != ai_sha:
        violations.append("write-proof: expectedSha %r != the request's "
                          "context.attachedProtocol.sha %r" % (exp_sha, ai_sha))
    st, body = _api(api_base, "GET", "/api/records/" + proof["record"],
                    user_id=journey.get("acting_user_id", "USR-BRAD"))
    rec["readback_status"] = st
    if st != 200:
        violations.append("write-proof: record unreadable (%s)" % st)
        return violations, rec
    payload = (body.get("record") or body).get("payload") or body.get("payload") or {}
    hay = json.dumps(payload)
    rec["payload_sha256_12"] = hashlib.sha256(hay.encode()).hexdigest()[:12]
    label_found = (proof.get("label_contains") or "") in hay
    rec["label_found"] = label_found
    if proof.get("label_contains") and not label_found:
        violations.append("write-proof: accepted label %r NOT found in the record — the "
                          "expectedSha round trip did not land the write" % proof["label_contains"])
    return violations, rec


def write_stub_receipt(run_dir, jid, verdict, violations, failure, note=None,
                       stderr_tail=None):
    """N3 (ruling Q-D): a per-journey receipt is written on EVERY path —
    including seed/exec failure — carrying the failure text and the stderr
    tail. A red journey with no receipt is a receipt-honesty defect (D4's
    spirit): the tick artefact must show WHY it is red."""
    receipt = {
        "journey": jid,
        "verdict": verdict,
        "violations": violations,
        "failure": failure,
        "seed_note": note,
        "stderr_tail": stderr_tail,
    }
    with open(os.path.join(run_dir, "%s.json" % jid), "w") as fh:
        json.dump(receipt, fh, indent=2)
    return receipt


def run_journey(journey, run_dir, app_base, api_base):
    """Run one journey via ui-drive.cjs, then grade its receipt. Returns
    (journey_id, verdict, dict) with verdict in green/red/transport-error."""
    jid = journey["id"]
    ok, note, seeded = seed_journey(journey, api_base)
    if not ok:
        verdict = "transport-error" if note.startswith("copy source") else "red"
        failure = {"failure": "seed: " + note}
        write_stub_receipt(run_dir, jid, verdict, ["seed failure: " + note],
                           failure, note=note)
        return jid, verdict, failure
    out_path = os.path.join(run_dir, "%s-ui.json" % jid)
    cmd = ["node", UI_DRIVER,
           "--journey", os.path.join(HERE, "journeys", journey["file"]),
           "--out", out_path,
           "--app-base", app_base,
           "--api-base", api_base]
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, cwd=APP_DIR, capture_output=True, text=True,
                              timeout=TURN_TIMEOUT)
    except subprocess.TimeoutExpired:
        failure = {"failure": "ui-drive timeout after %ds" % TURN_TIMEOUT}
        write_stub_receipt(run_dir, jid, "red",
                           ["ui-drive timeout after %ds" % TURN_TIMEOUT],
                           failure, note=note)
        return jid, "red", failure
    if proc.returncode == 2:
        failure = {"failure": "env error from ui-drive",
                   "stderr_tail": (proc.stderr or "")[-800:]}
        write_stub_receipt(run_dir, jid, "transport-error",
                           ["ui-drive env error (rc=2)"], failure, note=note,
                           stderr_tail=failure["stderr_tail"])
        return jid, "transport-error", failure
    try:
        with open(out_path) as fh:
            ui = json.load(fh)
    except Exception as exc:
        failure = {"failure": "ui-drive receipt unreadable: %s" % exc,
                   "stderr_tail": (proc.stderr or "")[-800:]}
        write_stub_receipt(run_dir, jid, "red",
                           ["ui-drive receipt unreadable: %s" % exc], failure,
                           note=note, stderr_tail=failure["stderr_tail"])
        return jid, "red", failure

    violations = []
    if ui.get("failure"):
        violations.append("ui: %s" % ui["failure"])
    # Interception-free guarantee (belt AND construction): ui-drive declares
    # zero route handlers; the receipt records the counter AND the
    # wrapper-identity attestation. N4: BOTH are graded here (missing/false
    # route_api_wrapped = RED — never silently green).
    violations.extend(attestation_violations(ui))

    bodies = ui.get("ai_request_bodies", [])
    expected_endpoints = journey.get("expected_wire", {}).get("endpoints", [])
    if expected_endpoints:
        seen = {b.get("endpoint") for b in bodies}
        if not any(e in seen for e in expected_endpoints):
            violations.append("wire: no outgoing request to %r (saw %r)"
                              % (expected_endpoints, sorted(seen)))
    # Channel assertions grade ONLY the bodies riding the declared wire
    # endpoints (the thread-persistence POSTs share /api/ai/ but carry no
    # context). ONE captured body on that endpoint must satisfy ALL
    # assertions (per-turn bodies differ; the deck channel regression is
    # caught on the turn that carries the selection).
    wire_bodies = [b for b in bodies if b.get("endpoint") in (expected_endpoints or
                   {bb.get("endpoint") for bb in bodies})]
    ch = journey.get("assert", {}).get("request_body_channels", [])
    if ch:
        per_turn = [check_channel_assertions(b.get("body"), ch) for b in wire_bodies]
        best = min(per_turn, key=len) if per_turn else ["no AI request on the declared endpoint"]
        if best:
            violations.extend(best)

    ev = ui.get("rendered_evidence", {})
    # D3: the wire-level clarification announcements + answer events ride the
    # evidence dict so the rendered-assertion check (pure over evidence) can
    # detect a post-answer RE-ASK.
    ev["clarification_announcements"] = ui.get("clarification_announcements", [])
    ev["answer_events"] = ui.get("answer_events", [])
    violations.extend(check_rendered_assertions(ev, journey.get("assert", {}).get("rendered", [])))
    wp_viol, wp_rec = grade_write_proof(journey, ui, api_base)
    violations.extend(wp_viol)

    teardown_ok = teardown_journey(journey, api_base)

    receipt = {
        "journey": jid,
        "title": journey.get("title", ""),
        "app_base": app_base,
        "api_base": api_base,
        "verdict": "green" if not violations else "red",
        "violations": violations,
        "seed_note": note,
        "teardown_ok": teardown_ok,
        "selection_affordance": (ui.get("attestations") or {}).get("selection_affordance"),
        "ai_request_bodies": bodies,          # the ROUND-TRIP-GATE-1 artifact
        "write_request_bodies": ui.get("write_request_bodies", []),  # D4: the write rides IN the receipt
        "write_proof": wp_rec,                # D4: persisted read-back + expectedSha evidence
        "rendered_evidence": ev,              # the paired rendered outcome
        "screenshots": ui.get("screenshots", []),
        "ui_attestations": ui.get("attestations", {}),
        "duration_s": round(time.time() - t0, 1),
        "ui_receipt_path": out_path,
    }
    with open(os.path.join(run_dir, "%s.json" % jid), "w") as fh:
        json.dump(receipt, fh, indent=2)
    return jid, ("green" if not violations else "red"), receipt


def overall_verdict(reds, terr, complete, trunk, advisory, fake_mode):
    """D1/D2 (fix4): the run-verdict ladder, PURE — no I/O, so the
    self-check can pin every rung and the gate can re-derive the same
    outcome from run-meta. A complete trunk run clears ONLY as
    ALL-GREEN when it ran on the deterministic model-layer fake (D2: the
    gate's hard set is J1+J2(fake)+J3 — a live-sampler lottery green is
    never a trunk claim); otherwise it is GREEN-NOT-GATING (fake not
    required for the record, but a live green can never own `latest`).
    Advisory (A3) suffixes its honest verdict; it never gates."""
    if reds or terr:
        v = "ENV-ERROR" if (terr and reds == 0) else "RED"
    elif not complete or not trunk:
        v = "INCOMPLETE" if not complete else "GREEN-NOT-TRUNK"
    elif not fake_mode:
        v = "GREEN-NOT-GATING"
    else:
        v = "ALL-GREEN"
    if advisory:
        v = v + "-ADVISORY"
    return v


def flips_latest(complete, trunk, advisory, fake_mode):
    """D1/D2 (fix4): `latest` ownership is PURE over the same flags the
    verdict ladder uses — a complete trunk claim run on the fake (and
    never advisory). A failed A2 restore is folded in AFTER this flip:
    _downgrade_restore_failure un-owns the run (D1)."""
    return complete and trunk and fake_mode and not advisory


def downgrade_restore_failure(run_dir, meta, restore):
    """D1 (fix4): fold a FAILED A2 restore grade into the run verdict.
    The restore is the last grade — a fake run whose restore failed is
    RED, blocks claims, and must NOT own `latest` (the shared :3093
    backend may still point at the just-killed fake). Steps, all idempotent:
      1. if this run flipped `latest`, restore it to `latest_was` (or
         remove it if the run was the first) — the SIGKILL-window poison
         (cycle-3 D1 aggravator (a)) dies here;
      2. verdict -> RED-RESTORE-FAILED (advisory suffix preserved),
         red_blocks_claims -> True, `restore_ok` surfaced top-level,
         `latest_was` persisted for the audit trail;
      3. the mutated meta is written back.
    Returns (mutated meta, latest_note)."""
    restore = restore or {}
    link = os.path.join(RECEIPTS_ROOT, "latest")
    latest_note = ""
    if os.path.islink(link) and \
            os.path.realpath(link) == os.path.realpath(run_dir):
        was = meta.get("latest_was")
        if was and os.path.exists(was):
            os.symlink(was, link + ".new")
            os.replace(link + ".new", link)
            latest_note = "latest UNDONE -> %s (restore failed, D1)" % was
        else:
            os.remove(link)
            latest_note = "latest REMOVED (restore failed, D1)"
        meta["latest_undone"] = True
    # The D1 grade is a RUN grade: a failed restore makes the run RED,
    # overriding the journey-level verdict (a run whose journeys were all
    # green but whose restore leaked the pointer is still a failed run).
    # The -ADVISORY marker survives (the downgrade is a grade, not a
    # rewrite of the run's mode). Idempotent: never double-apply.
    prev = meta.get("verdict") or ""
    if not prev.endswith("-RESTORE-FAILED"):
        adv = prev.endswith("-ADVISORY")
        meta["verdict"] = "RED-RESTORE-FAILED" + ("-ADVISORY" if adv else "")
    meta["red_blocks_claims"] = True
    meta["restore_ok"] = bool(restore.get("restore_ok"))
    meta["latest_was"] = meta.get("latest_was")
    with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    return meta, latest_note


def commit_latest_flip(run_dir):
    """D1 (fix4): the ATOMIC `latest` flip. Called ONLY after the A2
    restore grades OK (the restore is LAST) — a failed restore never owns
    `latest`, and a run that flipped and then failed to restore is
    un-owned by downgrade_restore_failure (defense in depth)."""
    link = os.path.join(RECEIPTS_ROOT, "latest")
    tmp = link + ".new"
    if os.path.islink(tmp) or os.path.exists(tmp):
        os.remove(tmp)
    os.symlink(run_dir, tmp)
    os.replace(tmp, link)  # atomic flip of `latest`


def run_chat_host_sweep(args, run_dir):
    """LEG-C6-SWEEP-DEBT (spec §6): drive each inventory chat host ONCE
    through the EXISTING browser executor (run_journey -> ui-drive.cjs) inside
    the SAME run dir, writing one receipt per host (outgoing request body +
    the rendered-answer screenshot). The inventory is DATA (chat-hosts.yaml) —
    a single shared prompt + generic step sequence serves every host; there is
    no per-host code and no second harness. Returns the `chat_host_verdicts`
    table (the emitter over the receipts this run just wrote).

    The probe journey YAMLs are written into `run_dir` (NOT `journeys/`, so the
    no-flag gate's exact-set journey check is untouched); each is passed to
    run_journey as an ABSOLUTE file path so the existing executor runs it
    unmodified. A host that fails to seed/drive still leaves a receipt (the
    stub receipt), so the emitter records an honest non-accept (or omits a
    host that was never swept) — never a fabricated green."""
    import yaml  # probe journeys are YAML by design
    try:
        host_ids, surfaces = load_chat_host_inventory()
    except Exception as exc:
        print("ENV ERROR: cannot load the chat-host inventory (DATA) — %s"
              % exc, file=sys.stderr)
        return None
    if not host_ids:
        print("ENV ERROR: chat-host inventory is empty — cannot sweep",
              file=sys.stderr)
        return None
    print("== chat-host sweep: %d inventory host(s) (DATA: %s)"
          % (len(host_ids), os.path.relpath(CHAT_HOSTS_INVENTORY, REPO_ROOT)),
          flush=True)
    # Per-host route DATA (the `route:` field) for probe navigation — read
    # alongside the id/surface the loader already validated, in file order.
    routes = []
    with open(CHAT_HOSTS_INVENTORY) as fh:
        _doc = yaml.safe_load(fh) or {}
    for _h in _doc.get("hosts") or []:
        routes.append(_h.get("route") or "")
    ids, surs = host_ids, surfaces
    results = {}
    for idx, hid in enumerate(ids):
        probe = build_chat_host_probe(ids[idx], surs[idx], routes[idx])
        probe_yaml = os.path.join(run_dir, "probe-%s.yaml" % hid)
        with open(probe_yaml, "w") as fh:
            yaml.safe_dump(probe, fh, sort_keys=False)
        probe["file"] = probe_yaml          # ABSOLUTE path -> run_journey verbatim
        print("== chat-host %s (%s) nav=%s"
              % (hid, surs[idx], probe["steps"][0]["path"]), flush=True)
        jid, verdict, _info = run_journey(probe, run_dir, args.app_base,
                                          args.api_base)
        results[hid] = verdict
        print("   -> %s" % verdict.upper(), flush=True)
    verdicts = emit_chat_host_verdicts(run_dir, ids)
    print("chat-host sweep: %d/%d host(s) swept, %d verdict(s) emitted"
          % (len(results), len(ids), len(verdicts)), flush=True)
    return verdicts


def _run_journeys_and_finish(args, journeys, run_dir, ts, results,
                             fake_info=None, advisory=False, health=None):
    """Run the selected journeys, write run-meta + the `latest` flip. Returns
    the overall verdict string (the exit-code source). `advisory` (A3) records
    the real verdict but NEVER flips `latest` and sets red_blocks_claims so an
    advisory run can never clear the gate. `fake_info`/restore records ride in
    run-meta for A1/A2 grading."""
    d_before = digest_repo(DATA_REPO)
    failures = {}
    for j in journeys:
        print("== %s %s" % (j["id"], j.get("title", "")), flush=True)
        jid, verdict, info = run_journey(j, run_dir, args.app_base, args.api_base)
        results[jid] = verdict
        if verdict != "green" and isinstance(info, dict):
            failures[jid] = info        # N3: the failure dict is persisted
        print("   -> %s" % verdict.upper(), flush=True)
    # LEG-C6-SWEEP-DEBT (spec §6): the chat-host sweep rides the SAME run dir
    # and the EXISTING executor — run it BEFORE run-meta is built so the
    # `chat_host_verdicts` table lands in the SAME run-meta.json write that
    # records `app_base` (the gate re-derives trunk from that app_base), and
    # therefore strictly BEFORE the `latest` flip (which happens later, in
    # main's A2-restore finally). The sweep's host receipts + verdicts never
    # touch the journey `verdicts` table (the no-flag gate's exact-set check).
    chat_host_verdicts = None
    if getattr(args, "chat_hosts", False):
        chat_host_verdicts = run_chat_host_sweep(args, run_dir)
    d_after = digest_repo(DATA_REPO)

    reds = sum(1 for v in results.values() if v == "red")
    terr = sum(1 for v in results.values() if v == "transport-error")
    # D2 + N1: an ALL-GREEN claim requires a COMPLETE run (every declared
    # journey file) against the TRUNK app base — the TRUNK identity is the
    # LITERAL set TRUNK_PORTS (no env derivation; CL_JOURNEY_APP_BASE can
    # select the target but never make a scratch FE 'trunk').
    trunk = app_base_is_trunk(args.app_base)
    complete = set(results) == declared_ids(os.path.join(HERE, "journeys"))
    # D2 (fix4): the gate's hard set is J1+J2(fake)+J3 — a complete trunk
    # green that ran on the LIVE sampler is a lottery, not a trunk claim:
    # GREEN-NOT-GATING, and it must never own `latest` (the pure ladder).
    fake_mode = fake_info is not None
    verdict_all = overall_verdict(reds, terr, complete, trunk, advisory,
                                  fake_mode)
    run_meta = {
        "run": ts,
        "harness": "L2-TRUNK-JOURNEYS-1",
        "app_base": args.app_base,
        "api_base": args.api_base,
        "verdicts": results,            # the tick reads THIS table
        "verdict": verdict_all,
        "advisory": advisory,           # A3: advisory runs never gate
        "fake_mode": fake_mode,         # D2 (fix4): first-class in EVERY run —
                                        # the gate requires it for a clearing
                                        # verdict; live-sampler greens cannot
                                        # own the tick
        "journeys_run": list(results),
        "journeys_declared": sorted(declared_ids(os.path.join(HERE, "journeys"))),
        "complete": complete,           # D2: verdicts cover EVERY journey file
        "app_base_is_trunk": trunk,     # D2/N1: literal trunk set, not env-derived
        "failures": failures,           # N3: reds carry their failure dicts
        "digest_before": d_before,
        "digest_after": d_after,
        "digest_clean": (d_before == d_after),
        "backend_health_ai": (health or {}).get("components", {}).get("ai", {}),
        "red_blocks_claims": (verdict_all != "ALL-GREEN") or advisory,
    }
    if fake_info is not None:
        run_meta["fake"] = fake_info
    # D1 (fix4): remember what `latest` pointed at BEFORE this run flips it,
    # so a FAILED A2 restore can UNDO the flip after the restore grades.
    link = os.path.join(RECEIPTS_ROOT, "latest")
    if os.path.islink(link):
        run_meta["latest_was"] = os.path.realpath(link)
    # LEG-C6-SWEEP-DEBT (spec §6): append the chat-host sweep verdict table to
    # the SAME run-meta.json that records app_base, strictly BEFORE the
    # `latest` flip. Absent (not set) when --chat-hosts was not requested, so
    # a plain journey run's run-meta is byte-unchanged in shape.
    if chat_host_verdicts is not None:
        run_meta["chat_host_verdicts"] = chat_host_verdicts
    with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
        json.dump(run_meta, fh, indent=2)
    # D1/D2 (fix4): `latest` eligibility is DECIDED here (a complete trunk
    # claim run on the fake — a scratch/partial run, a live-sampler green
    # (GREEN-NOT-GATING) and every advisory run are never eligible), but the
    # FLIP ITSELF happens only AFTER the A2 restore grades OK (main's
    # finally — the restore is LAST). A failed restore therefore never owns
    # `latest`; a crashed run never flips at all.
    flip_eligible = flips_latest(complete, trunk, advisory, fake_mode)
    if flip_eligible:
        latest_note = "latest PENDING — flips only if the A2 restore grades OK (D1)"
    elif advisory:
        latest_note = "latest NOT moved (advisory run — verdict recorded only, A3)"
    else:
        latest_note = ("latest NOT moved (complete=%s app_base_is_trunk=%s "
                       "fake_mode=%s — D2: a live-sampler green is "
                       "GREEN-NOT-GATING and never owns `latest`)"
                       % (complete, trunk, fake_mode))

    for jid in sorted(results):
        print("%s %s" % (jid, results[jid]))
    print("run-meta: %s verdict=%s digest_clean=%s (%s)"
          % (run_dir, verdict_all, d_before == d_after, latest_note))
    if args.json:
        print("JOURNEYS-JSON " + json.dumps({"run": ts, "dir": run_dir,
                                             "verdict": verdict_all,
                                             "advisory": advisory,
                                             "fake_mode": fake_mode,
                                             "flip_eligible": flip_eligible,
                                             "verdicts": results}))
    return verdict_all, flip_eligible


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--journey", action="append", default=[],
                    help="run one journey id (repeatable); implies selection mode")
    ap.add_argument("--app-base", default=DEFAULT_APP_BASE)
    ap.add_argument("--api-base", default=DEFAULT_API_BASE)
    ap.add_argument("--json", action="store_true", help="machine-readable summary line last")
    # A1: point the BACKEND's own inference config at the harness-owned
    # deterministic model-layer fake (canned/completions.yaml) for this run.
    # The browser wire is untouched — the fake sits on the BACKEND side of
    # /api/ai/**. A2: the live inference URL is restored + asserted after.
    ap.add_argument("--fake", action="store_true",
                    help="run the journeys against the deterministic model-layer "
                         "fake (points the backend's inference config at it, "
                         "restores + asserts the live URL afterwards)")
    # A3: advisory live-sampler variant — an honest verdict, but it NEVER flips
    # `latest` and does NOT gate claims while the live-drift product defect
    # (L2-INTENTID-REDRAFT-1) is open. Use `--journey J2 --advisory`.
    ap.add_argument("--advisory", action="store_true",
                    help="record the verdict but NEVER flip `latest` (advisory "
                         "live-sampler runs — J2-live shape)")
    # LEG-C6-SWEEP-DEBT (spec §6): ALSO drive every inventory chat host once
    # through the existing executor, in the SAME run dir, and append a
    # `chat_host_verdicts` table to run-meta BEFORE the `latest` flip. The
    # inventory is DATA (config/chat/chat-hosts.yaml).
    ap.add_argument("--chat-hosts", action="store_true",
                    help="sweep the chat-host inventory (one receipt per host, "
                         "appended to run-meta as chat_host_verdicts before the "
                         "`latest` flip)")
    args = ap.parse_args()

    import yaml  # stdlib-only except this; journeys are YAML by design
    js_dir = os.path.join(HERE, "journeys")
    declared = sorted(f for f in os.listdir(js_dir) if f.endswith(".yaml"))
    journeys = []
    for f in declared:
        with open(os.path.join(js_dir, f)) as fh:
            y = yaml.safe_load(fh)
        y["file"] = f
        journeys.append(y)
    if args.journey:
        want = set(args.journey)
        journeys = [j for j in journeys if j["id"] in want]
        if not journeys:
            print("ENV ERROR: no journey matches %r" % sorted(want), file=sys.stderr)
            return 2
    elif not args.all:
        print("usage: --all or --journey J1", file=sys.stderr)
        return 2

    # Environment gate: stack must answer (exit 2 territory, never a fake red).
    import urllib.request
    try:
        with urllib.request.urlopen(args.api_base + "/api/health", timeout=10) as r:
            health = json.load(r)
        if health.get("status") != "ok":
            raise RuntimeError("health not ok")
    except Exception as exc:
        print("ENV ERROR: backend :%s unreachable — %s" % (args.api_base, exc), file=sys.stderr)
        return 2

    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = os.path.join(RECEIPTS_ROOT, ts)
    os.makedirs(run_dir, exist_ok=True)
    results = {}

    # A1/A2: fake-mode lifecycle. The fake is brought up and pointed at the
    # backend BEFORE any journey runs; the live inference URL is restored and
    # ASSERTED afterwards (finally: on crash/timeout too — a leaked fake
    # pointer would poison every lane-2 surface sharing :3093).
    restore = None
    if args.fake:
        try:
            fake_proc, fake_base = start_fake_server(os.path.join(run_dir, "fake-server.log"))
        except Exception as exc:
            print("ENV ERROR: fake endpoint bring-up failed: %s" % exc, file=sys.stderr)
            return 2
        try:
            live_profile, live_url, pointed_url = fake_point(args.api_base, fake_base, run_dir)
        except Exception as exc:
            fake_proc.terminate()
            print("ENV ERROR: could not point the backend at the fake: %s" % exc, file=sys.stderr)
            return 2
        fake_info = {"fake_proc_pid": fake_proc.pid, "fake_base": fake_base,
                     "live_profile": live_profile, "live_url": live_url,
                     "pointed_url": pointed_url}
        print("FAKE-MODE on: backend inferenceUrl -> %s (live was %s)"
              % (pointed_url, live_url), flush=True)
        flip_eligible = False  # set by _run_journeys_and_finish; the finally
                               # must not flip if that call crashed
        try:
            verdict_all, flip_eligible = _run_journeys_and_finish(
                args, journeys, run_dir, ts, results,
                fake_info=fake_info, advisory=args.advisory, health=health)
        finally:
            # A2 restore runs on EVERY path (crash/timeout included).
            try:
                restored_url, restore_ok = fake_restore(args.api_base,
                                                        live_profile, live_url)
            except Exception as exc:
                restored_url, restore_ok = None, False
                print("RESTORE ERROR: %s" % exc, file=sys.stderr)
            restore = {"restored_url": restored_url, "restore_ok": restore_ok,
                       "live_url": live_url, "pointed_url": pointed_url}
            fake_proc.terminate()
            try:
                fake_proc.wait(timeout=10)
            except Exception:
                fake_proc.kill()
            print("FAKE-MODE off: inferenceUrl restored -> %s (ok=%s, live was %s)"
                  % (restored_url, restore_ok, live_url), flush=True)
            if not restore_ok:
                print("RESTORE FAILED: inferenceUrl is %r, expected live %r — "
                      "MANUAL restore required (A2)" % (restored_url, live_url),
                      file=sys.stderr)
            with open(os.path.join(run_dir, "fake-restore.json"), "w") as fh:
                json.dump({"pointed_url": pointed_url, "live_url": live_url,
                           "restored_url": restored_url, "restore_ok": restore_ok},
                          fh, indent=2)
            # Persist the A2 restore record INTO the run-meta the tick reads.
            meta_path = os.path.join(run_dir, "run-meta.json")
            if os.path.exists(meta_path):
                with open(meta_path) as fh:
                    meta = json.load(fh)
                meta["fake_mode"] = True
                meta["fake"] = fake_info
                meta["fake_restore"] = restore
                with open(meta_path, "w") as fh:
                    json.dump(meta, fh, indent=2)
                # D1 (fix4): the `latest` flip is GRADED — it happens only
                # here, AFTER the A2 restore grades (the restore is LAST).
                # A failed restore therefore NEVER owns `latest`: the run
                # is folded to RED-RESTORE-FAILED, red_blocks_claims=true,
                # exit 1, and the previous `latest` (or none) stands.
                if restore_ok and flip_eligible:
                    commit_latest_flip(run_dir)
                    print("latest -> this run (A2 restore graded OK — the "
                          "flip runs AFTER the restore, D1)", flush=True)
                elif restore_ok:
                    pass  # not flip-eligible (advisory / non-claim run)
                # D1 (fix4): the restore grade is a CONSUMER, not a
                # bystander. A fake run whose restore failed is RED, blocks
                # claims, and must NOT own `latest` — folded into the
                # verdict + exit code AFTER the restore grades.
                if not restore_ok:
                    meta, latest_note = downgrade_restore_failure(
                        run_dir, meta, restore)
                    verdict_all = meta["verdict"]
                    print("D1: run folded to %s (restore failed — "
                          "red_blocks_claims=true, %s)"
                          % (verdict_all, latest_note or "`latest` untouched"),
                          file=sys.stderr)
    else:
        verdict_all, _ = _run_journeys_and_finish(
            args, journeys, run_dir, ts, results,
            fake_info=None, advisory=args.advisory, health=health)
    return 0 if verdict_all == "ALL-GREEN" else 1


if __name__ == "__main__":
    sys.exit(main())
