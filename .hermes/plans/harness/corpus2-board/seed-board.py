#!/usr/bin/env python3
"""Seed / verify / reset driver for the Corpus2 prompt-1 baseline board.

Modes:
  --check              POST /api/validate-full with the YAML payload; print summary
  --seed               seed_journey (idempotent — second run reuses existing record)
  --verify             GET the record, assert stored == YAML + timestamps
  --digest             dump the full record JSON to stdout
  --reset              teardown_journey (delete) + re-seed
  --workspace-reset    PUT the declared workspace state from the board YAML
  --verify-workspace   GET workspace, assert all tabs are declared
  --api-base           URL (default http://127.0.0.1:3093)
"""
import argparse
import importlib.util
import json
import os
import sys
import urllib.request
import urllib.error
import yaml

WORKTREE = os.environ.get("CL_WORKTREE",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.dirname(os.path.abspath(__file__)))))))
BOARD_YAML = os.path.join(WORKTREE,
    ".hermes/plans/harness/corpus2-board/c2p1-baseline.board.yaml")
JOURNEYS_PY = os.path.join(WORKTREE,
    ".hermes/plans/harness/l2-trunk-journeys/run-journeys.py")

# ── lazy import of run-journeys.py (has dashes in name) ──
_l2journeys = None
def _import_journeys():
    global _l2journeys
    if _l2journeys is None:
        spec = importlib.util.spec_from_file_location("l2journeys", JOURNEYS_PY)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _l2journeys = mod
    return _l2journeys

def load_board_yaml():
    with open(BOARD_YAML) as f:
        return yaml.safe_load(f)

# ── helpers ──
def api_call(api_base, method, path, body=None, user_id="USR-BRAD"):
    lj = _import_journeys()
    return lj._api(api_base, method, path, body, user_id=user_id)

def check(api_base):
    """POST /api/validate-full and print summary."""
    board = load_board_yaml()
    seed = board["seed"]["record"]
    st, body = api_call(api_base, "POST", "/api/validate-full",
        {"schemaId": seed["schemaId"], "payload": seed["payload"]})
    if st not in (200, 201):
        print(f"validate-full failed: {st} {json.dumps(body, indent=2)}", file=sys.stderr)
        sys.exit(1)
    payload = seed["payload"]
    evt_count = len(payload["events"])
    lw_count = len(payload["labwares"])
    wells_count = 0
    vol = 0
    for evt in payload["events"]:
        if "wells" in (evt.get("details") or {}):
            wells_count += len(evt["details"]["wells"])
        if "volume" in (evt.get("details") or {}):
            vol = evt["details"]["volume"]["value"]
    print(json.dumps(body))
    print(f"check: {evt_count} events, {lw_count} labware, {wells_count} wells, volume.value={vol}")

def do_seed(api_base):
    """Run seed_journey (idempotent)."""
    board = load_board_yaml()
    lj = _import_journeys()
    ok, note, ids = lj.seed_journey(board, api_base)
    if not ok:
        print(f"seed failed: {note}", file=sys.stderr)
        sys.exit(1)
    print(note)
    # Normalise workspace to the board's declared tab set
    do_workspace_reset(api_base)
    return note

def do_verify(api_base):
    """GET the record, assert stored == YAML + timestamps."""
    board = load_board_yaml()
    expected = board["seed"]["record"]["payload"]
    rid = expected["id"]
    st, body = api_call(api_base, "GET", f"/api/records/{rid}")
    if st != 200:
        print(f"verify: record {rid} not found (HTTP {st})", file=sys.stderr)
        sys.exit(1)
    stored = body["record"]["payload"]

    # stored must equal expected + {createdAt, updatedAt}, nothing extra
    # Server strips recordId from stored payload (keeps id only); allow that.
    stored_cmp = dict(stored)
    expected_cmp = dict(expected)
    for k in ("createdAt", "updatedAt", "recordId"):
        stored_cmp.pop(k, None)
        expected_cmp.pop(k, None)
    if stored_cmp != expected_cmp:
        print(f"verify: payload mismatch", file=sys.stderr)
        print(f"  stored keys: {sorted(stored_cmp.keys())}", file=sys.stderr)
        print(f"  expected keys: {sorted(expected_cmp.keys())}", file=sys.stderr)
        # show diff on events
        if stored_cmp.get("events") != expected_cmp.get("events"):
            print(f"  stored events: {json.dumps(stored_cmp.get('events'), indent=2)}", file=sys.stderr)
            print(f"  expected events: {json.dumps(expected_cmp.get('events'), indent=2)}", file=sys.stderr)
        sys.exit(1)

    # Assert shape
    evts = len(stored["events"])
    lws = len(stored["labwares"])
    vol = 0
    wells = 0
    labware_id = None
    for evt in stored["events"]:
        d = evt.get("details") or {}
        if "wells" in d:
            wells += len(d["wells"])
        if "volume" in d:
            vol = d["volume"]["value"]
        if "labwareId" in d:
            labware_id = d["labwareId"]
    print(f"events={evts} labwares={lws} volume.value={vol} wells={wells} labwareId={labware_id}")
    print(f"payload == fixture + {{createdAt,updatedAt}}: OK")

def do_digest(api_base):
    """Dump the full record JSON to stdout."""
    board = load_board_yaml()
    rid = board["seed"]["record"]["payload"]["id"]
    st, body = api_call(api_base, "GET", f"/api/records/{rid}")
    if st != 200:
        print(f"digest: record {rid} not found (HTTP {st})", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(body))


def do_workspace_reset(api_base):
    """PUT the declared workspace state from the board YAML and verify."""
    board = load_board_yaml()
    ws = board["workspace"]
    study_id = ws["studyId"]
    declared_ids = [t["id"] for t in ws["tabs"]]

    # PUT workspace state directly (body IS the state object, never wrapped)
    st, body = api_call(api_base, "PUT",
                        f"/api/studies/{study_id}/workspace", ws)
    if st not in (200, 201):
        print(f"workspace: PUT failed HTTP {st} {body}", file=sys.stderr)
        sys.exit(1)

    # Re-GET to assert (server silently drops mismatched kinds)
    st, body = api_call(api_base, "GET",
                        f"/api/studies/{study_id}/workspace")
    if st != 200:
        print(f"workspace: GET failed HTTP {st}", file=sys.stderr)
        sys.exit(1)
    state = body["state"]
    actual_ids = [t["id"] for t in state["tabs"]]
    if sorted(actual_ids) != sorted(declared_ids):
        print(f"workspace: PUT response mismatch — got {actual_ids}, expected {declared_ids}",
              file=sys.stderr)
        sys.exit(1)
    print(f"workspace: {len(actual_ids)} tabs, activeTabId={state['activeTabId']}")


def do_verify_workspace(api_base):
    """GET workspace and assert every tab is declared."""
    board = load_board_yaml()
    ws = board["workspace"]
    study_id = ws["studyId"]
    declared_ids = set(t["id"] for t in ws["tabs"])

    st, body = api_call(api_base, "GET",
                        f"/api/studies/{study_id}/workspace")
    if st != 200:
        print(f"workspace: GET failed HTTP {st}", file=sys.stderr)
        sys.exit(1)
    state = body["state"]
    ok = True
    for tab in state["tabs"]:
        tid = tab["id"]
        if tid not in declared_ids:
            print(f"workspace: UNDECLARED tab id={tid}", file=sys.stderr)
            ok = False
    if not ok:
        sys.exit(1)
    print(f"workspace: {len(state['tabs'])} tabs, activeTabId={state['activeTabId']} — all declared")

def do_reset(api_base):
    """Delete then re-seed the fixture."""
    board = load_board_yaml()
    lj = _import_journeys()
    # teardown (delete)
    ok = lj.teardown_journey(board, api_base)
    if not ok:
        print("reset: teardown failed", file=sys.stderr)
        sys.exit(1)
    rid = board["seed"]["record"]["recordId"]
    print(f"deleted {rid}")
    # re-seed
    ok, note, ids = lj.seed_journey(board, api_base)
    if not ok:
        print(f"reset re-seed failed: {note}", file=sys.stderr)
        sys.exit(1)
    print(note)
    # Normalise workspace to the board's declared tab set
    do_workspace_reset(api_base)

def main():
    parser = argparse.ArgumentParser(description="Seed/verify/reset Corpus2 board fixture")
    parser.add_argument("--check", action="store_true", help="Validate payload against schema")
    parser.add_argument("--seed", action="store_true", help="Seed the board (idempotent)")
    parser.add_argument("--verify", action="store_true", help="Verify stored == YAML + timestamps")
    parser.add_argument("--digest", action="store_true", help="Dump record JSON to stdout")
    parser.add_argument("--reset", action="store_true", help="Delete and re-seed")
    parser.add_argument("--workspace-reset", action="store_true",
                        help="PUT the declared workspace state")
    parser.add_argument("--verify-workspace", action="store_true",
                        help="GET workspace and assert all tabs declared")
    parser.add_argument("--api-base", default="http://127.0.0.1:3093",
                        help="API base URL")
    args = parser.parse_args()

    modes = [args.check, args.seed, args.verify, args.digest, args.reset,
             args.workspace_reset, args.verify_workspace]
    if not any(modes):
        parser.print_help()
        sys.exit(1)

    api_base = args.api_base.rstrip("/")
    if args.check:
        check(api_base)
    if args.seed:
        do_seed(api_base)
    if args.verify:
        do_verify(api_base)
    if args.digest:
        do_digest(api_base)
    if args.reset:
        do_reset(api_base)
    if args.workspace_reset:
        do_workspace_reset(api_base)
    if args.verify_workspace:
        do_verify_workspace(api_base)

if __name__ == "__main__":
    main()
