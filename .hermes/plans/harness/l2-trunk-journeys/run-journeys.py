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
                violations.append("rendered: spec J2 — the folded answer turn "
                                  "must carry the SAME intentId, but pre-answer "
                                  "intentId %r != answer-turn intentId %r" % (ids[0], ids[-1]))
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


def run_journey(journey, run_dir, app_base, api_base):
    """Run one journey via ui-drive.cjs, then grade its receipt. Returns
    (journey_id, verdict, dict) with verdict in green/red/transport-error."""
    jid = journey["id"]
    ok, note, seeded = seed_journey(journey, api_base)
    if not ok:
        return jid, "transport-error" if note.startswith("copy source") else "red", \
               {"failure": "seed: " + note}
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
        with open(os.path.join(run_dir, "%s.json" % jid), "w") as fh:
            json.dump({"journey": jid, "verdict": "red",
                       "violations": ["ui-drive timeout after %ds" % TURN_TIMEOUT],
                       "seed_note": note}, fh, indent=2)
        return jid, "red", {"failure": "ui-drive timeout after %ds" % TURN_TIMEOUT}
    if proc.returncode == 2:
        return jid, "transport-error", {"failure": "env error from ui-drive",
                                        "stderr_tail": proc.stderr[-800:]}
    try:
        with open(out_path) as fh:
            ui = json.load(fh)
    except Exception as exc:
        return jid, "red", {"failure": "ui-drive receipt unreadable: %s" % exc,
                            "stderr_tail": proc.stderr[-800:]}

    violations = []
    if ui.get("failure"):
        violations.append("ui: %s" % ui["failure"])
    # Interception-free guarantee (belt AND construction): ui-drive declares
    # zero route handlers; the receipt records that attestation.
    if ui.get("route_handlers_used", 0) != 0:
        violations.append("BANNED: %d route handler(s) touched /api/ai/**" % ui["route_handlers_used"])

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--journey", action="append", default=[],
                    help="run one journey id (repeatable); implies selection mode")
    ap.add_argument("--app-base", default=DEFAULT_APP_BASE)
    ap.add_argument("--api-base", default=DEFAULT_API_BASE)
    ap.add_argument("--json", action="store_true", help="machine-readable summary line last")
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

    d_before = digest_repo(DATA_REPO)
    results = {}
    for j in journeys:
        print("== %s %s" % (j["id"], j.get("title", "")), flush=True)
        jid, verdict, _ = run_journey(j, run_dir, args.app_base, args.api_base)
        results[jid] = verdict
        print("   -> %s" % verdict.upper(), flush=True)
    d_after = digest_repo(DATA_REPO)

    greens = sum(1 for v in results.values() if v == "green")
    reds = sum(1 for v in results.values() if v == "red")
    terr = sum(1 for v in results.values() if v == "transport-error")
    # D2: an ALL-GREEN claim requires a COMPLETE run (every declared journey
    # file) against the TRUNK app base. Partial/scratch runs record their
    # REAL per-journey verdicts but NEVER own a latest-blocking green claim.
    from urllib.parse import urlparse
    def _hostport(u):
        p = urlparse(u)
        return (p.hostname or "", p.port)
    trunk_ports = {_hostport(DEFAULT_APP_BASE), ("127.0.0.1", 5193)}
    app_base_is_trunk = _hostport(args.app_base) in trunk_ports
    complete = set(results) == declared_ids(os.path.join(HERE, "journeys"))
    if reds or terr:
        verdict_all = "ENV-ERROR" if (terr and reds == 0) else "RED"
    elif not complete or not app_base_is_trunk:
        # D2: per-journey greens are recorded truthfully, but this run does
        # NOT own a trunk green claim: verdict is informational only and the
        # red_blocks_claims flag stays true so a tick can never read it as
        # green; `latest` is not moved either.
        verdict_all = "INCOMPLETE" if not complete else "GREEN-NOT-TRUNK"
    else:
        verdict_all = "ALL-GREEN"
    run_meta = {
        "run": ts,
        "harness": "L2-TRUNK-JOURNEYS-1",
        "app_base": args.app_base,
        "api_base": args.api_base,
        "verdicts": results,            # the tick reads THIS table
        "verdict": verdict_all,
        "journeys_run": list(results),
        "journeys_declared": sorted(declared_ids(os.path.join(HERE, "journeys"))),
        "complete": complete,           # D2: verdicts cover EVERY journey file
        "app_base_is_trunk": app_base_is_trunk,  # D2: not a scratch frontend
        "digest_before": d_before,
        "digest_after": d_after,
        "digest_clean": (d_before == d_after),
        "backend_health_ai": health.get("components", {}).get("ai", {}),
        "red_blocks_claims": verdict_all != "ALL-GREEN",
    }
    with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
        json.dump(run_meta, fh, indent=2)
    # D2: `latest` flips ONLY for a complete trunk run — a scratch/partial
    # run must never displace the trunk verdict the tick reads.
    if complete and app_base_is_trunk:
        link = os.path.join(RECEIPTS_ROOT, "latest")
        tmp = link + ".new"
        if os.path.islink(tmp) or os.path.exists(tmp):
            os.remove(tmp)
        os.symlink(run_dir, tmp)
        os.replace(tmp, link)  # atomic flip of `latest`
        latest_note = "latest -> this run"
    else:
        latest_note = ("latest NOT moved (complete=%s app_base_is_trunk=%s)"
                       % (complete, app_base_is_trunk))

    for jid in sorted(results):
        print("%s %s" % (jid, results[jid]))
    print("run-meta: %s verdict=%s digest_clean=%s (%s)"
          % (run_dir, verdict_all, d_before == d_after, latest_note))
    if args.json:
        print("JOURNEYS-JSON " + json.dumps({"run": ts, "dir": run_dir,
                                             "verdict": verdict_all, "verdicts": results}))
    return 0 if verdict_all == "ALL-GREEN" else 1


if __name__ == "__main__":
    sys.exit(main())
