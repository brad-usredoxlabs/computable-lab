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
    return violations


# ---------------------------------------------------------------------------
# Rendered-outcome assertions — PURE over the ui-drive evidence dict.
# ---------------------------------------------------------------------------

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
    base = os.path.join(root, subdir)
    if not os.path.isdir(base):
        return None
    entries = []
    for dirpath, _dirs, files in os.walk(base):
        for f in files:
            p = os.path.join(dirpath, f)
            try:
                st = os.stat(p)
            except OSError:
                continue
            entries.append("%s:%d" % (os.path.relpath(p, root), st.st_size))
    entries.sort()
    import hashlib
    return hashlib.sha256("\n".join(entries).encode()).hexdigest()[:16]


def latest_run_dir():
    link = os.path.join(RECEIPTS_ROOT, "latest")
    return os.path.realpath(link) if os.path.islink(link) else None


# ---------------------------------------------------------------------------

def _api(api_base, method, path, body=None, timeout=30):
    import urllib.request
    import urllib.error
    data = json.dumps(body).encode() if body is not None else None
    headers = {"x-user-id": "USR-BRAD"}
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
    ids = []
    if "record" in seed:
        rec = seed["record"]
        rid = rec["recordId"]
        st, _ = _api(api_base, "GET", "/api/records/" + rid)
        if st == 200:
            ids.append(rid)
            return True, "record exists (reused): %s" % rid, ids
        st, body = _api(api_base, "POST", "/api/records",
                        {"schemaId": rec["schemaId"], "payload": rec["payload"],
                         "message": "L2-TRUNK-JOURNEYS seed"})
        if st not in (200, 201):
            return False, "seed create failed %s -> %s %s" % (rid, st, body), ids
        ids.append(rid)
        return True, "record created: %s" % rid, ids
    if "copy_record" in seed:
        c = seed["copy_record"]
        st, body = _api(api_base, "GET", "/api/records/" + c["from"])
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
        st2, _ = _api(api_base, "GET", "/api/records/" + c["to"])
        if st2 == 200:
            st3, _ = _api(api_base, "PUT", "/api/records/" + c["to"],
                          {"payload": payload, "message": "L2-TRUNK-JOURNEYS re-seed"})
            if st3 not in (200, 201):
                return False, "re-seed PUT failed %s -> %s" % (c["to"], st3), ids
            ids.append(c["to"])
            return True, "scratch copy reset: %s" % c["to"], ids
        st3, body3 = _api(api_base, "POST", "/api/records",
                          {"schemaId": "https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml",
                           "payload": payload, "message": "L2-TRUNK-JOURNEYS scratch copy"})
        if st3 not in (200, 201):
            return False, "copy seed failed %s -> %s %s" % (c["to"], st3, body3), ids
        ids.append(c["to"])
        return True, "scratch copy created: %s" % c["to"], ids
    return True, "no seed", ids


def teardown_journey(journey, api_base):
    td = journey.get("teardown") or {}
    if "delete_record" in td:
        st, _ = _api(api_base, "DELETE", "/api/records/" + td["delete_record"])
        return st in (200, 204, 404)
    return True


def check_write_proof(proof, api_base):
    if not proof:
        return []
    st, body = _api(api_base, "GET", "/api/records/" + proof["record"])
    if st != 200:
        return ["write-proof: record unreadable (%s)" % st]
    payload = (body.get("record") or body).get("payload") or body.get("payload") or {}
    hay = json.dumps(payload)
    if proof.get("label_contains") and proof["label_contains"] not in hay:
        return ["write-proof: accepted label %r NOT found in the record — the "
                "expectedSha round trip did not land the write" % proof["label_contains"]]
    return []


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
    violations.extend(check_rendered_assertions(ev, journey.get("assert", {}).get("rendered", [])))
    violations.extend(check_write_proof(journey.get("write_proof"), api_base))

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
        "selection_affordance": ui.get("selection_affordance"),
        "ai_request_bodies": bodies,          # the ROUND-TRIP-GATE-1 artifact
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
    verdict_all = ("ALL-GREEN" if reds == 0 and terr == 0 and results
                   else "ENV-ERROR" if terr and reds == 0 else "RED")
    run_meta = {
        "run": ts,
        "harness": "L2-TRUNK-JOURNEYS-1",
        "app_base": args.app_base,
        "api_base": args.api_base,
        "verdicts": results,            # the tick reads THIS table
        "verdict": verdict_all,
        "journeys_run": list(results),
        "digest_before": d_before,
        "digest_after": d_after,
        "digest_clean": (d_before == d_after),
        "backend_health_ai": health.get("components", {}).get("ai", {}),
        "red_blocks_claims": verdict_all != "ALL-GREEN",
    }
    with open(os.path.join(run_dir, "run-meta.json"), "w") as fh:
        json.dump(run_meta, fh, indent=2)
    link = os.path.join(RECEIPTS_ROOT, "latest")
    tmp = link + ".new"
    if os.path.islink(tmp) or os.path.exists(tmp):
        os.remove(tmp)
    os.symlink(run_dir, tmp)
    os.replace(tmp, link)  # atomic flip of `latest`

    for jid in sorted(results):
        print("%s %s" % (jid, results[jid]))
    print("run-meta: %s verdict=%s digest_clean=%s" % (run_dir, verdict_all, d_before == d_after))
    if args.json:
        print("JOURNEYS-JSON " + json.dumps({"run": ts, "dir": run_dir,
                                             "verdict": verdict_all, "verdicts": results}))
    return 0 if verdict_all == "ALL-GREEN" else 1


if __name__ == "__main__":
    sys.exit(main())
