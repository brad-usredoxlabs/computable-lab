#!/usr/bin/env python3
"""check-gate.py — the TICK-FACING contract of the trunk-journeys harness.

The lane tick runs this BEFORE claiming any new item:

    python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py
    exit 0 = trunk journeys GREEN (or no run yet — never gate a virgin lane)
    exit 1 = at least one journey RED, OR the latest run is not a fake-mode
             run (D2: hard set J1+J2(fake)+J3), OR its A2 restore failed
             (D1: fake_restore.restore_ok), OR its verdicts table is
             incomplete, OR its app_base is non-trunk, OR it is advisory —
             the ready set is EMPTY this tick and the printed BLOCKER line
             names the cause
    exit 2 = the receipt root itself is unreadable (env error, fail closed
             on claiming too: a broken receipts trail proves nothing green)

Reads receipts-root `latest` -> run-meta.json `verdicts` (the machine table).
"""
import json
import os
import sys

RECEIPTS_ROOT = os.environ.get(
    "CL_RECEIPTS", "/home/brad/.hermes/cl/receipts/L2-TRUNK-JOURNEYS")

# N1 (ruling Q-D): the SAME literal trunk set the driver compares
# (run-journeys.py TRUNK_PORTS). NO env derivation — a scratch vite on any
# other port can never be a trunk run, and the gate re-derives it from the
# run's app_base independently of the run-meta flag.
TRUNK_PORTS = {("localhost", 5193), ("127.0.0.1", 5193)}


def _hostport(u):
    from urllib.parse import urlparse
    p = urlparse(u or "")
    return (p.hostname or "", p.port)


def app_base_is_trunk(u):
    return _hostport(u) in TRUNK_PORTS


def newest_restore_record(root):
    """D1 (fix4): the NEWEST run in `root` that carries an A2 restore
    record (run-meta.json's fake_restore or top-level restore_ok, or the
    fake-restore.json sidecar — either one). The graded flip means a
    failed restore never OWNS `latest`, so the poisoned state (the shared
    :3093 backend may still point at the just-killed fake) must be caught
    by the run trail itself — and the NEWEST restore record is the newest
    known state of the shared backend. A newer run (successful restore, or
    a non-fake run that proves the backend answered) supersedes an older
    failed record: once the trail moves on past the failure, the gate
    clears again. Returns (name, dir, restore_ok) for the newest record,
    else None."""
    newest = None
    try:
        entries = os.listdir(root)
    except OSError:
        return None
    for name in entries:
        if name == "latest" or name == "latest.new":
            continue
        d = os.path.join(root, name)
        if not os.path.isdir(d):
            continue
        ok = None
        for fn in ("run-meta.json", "fake-restore.json"):
            p = os.path.join(d, fn)
            if not os.path.isfile(p):
                continue
            try:
                with open(p) as fh:
                    j = json.load(fh)
            except Exception:
                continue
            if not isinstance(j, dict):
                continue
            fr = j.get("fake_restore")
            if isinstance(fr, dict) and "restore_ok" in fr:
                ok = bool(fr.get("restore_ok"))
                break
            if "restore_ok" in j:
                ok = bool(j.get("restore_ok"))
                break
        if ok is not None:
            if newest is None or name > newest[0]:
                newest = (name, d, ok)
    return newest


def main():
    # D1 (fix4): the poisoned-backend check comes FIRST. A failed A2
    # restore never owns `latest` (the flip is graded — the driver only
    # flips after the restore grades OK), so `latest` alone can no longer
    # reveal that the shared :3093 backend may still point at the
    # just-killed fake. The gate scans the run trail for the NEWEST
    # restore record: if it graded FAILED, the gate is BLOCKED until the
    # trail moves past the failure (a newer run — with a successful
    # restore, or a non-fake run that proves the backend answered —
    # supersedes it) or the record is re-graded after a manual restore.
    rr = newest_restore_record(RECEIPTS_ROOT)
    if rr is not None and not rr[2]:
        print("BLOCKER: newest A2 restore record FAILED (run %s; "
              "fake_restore.restore_ok=False) — the shared :3093 backend "
              "may still point at the (now-dead) fake. MANUAL restore "
              "required, then re-run or re-grade (D1/A2: the restore "
              "grade gates the tick; a failed restore never owns `latest`, "
              "so the trail itself is checked)" % rr[0])
        print("GATE-VERDICT blocking")
        return 1
    link = os.path.join(RECEIPTS_ROOT, "latest")
    if not os.path.exists(link):
        print("GATE: no trunk-journeys run yet at %s — no verdict, not blocking"
              % RECEIPTS_ROOT)
        print("GATE-VERDICT green (never-ran)")
        return 0
    meta_path = os.path.join(os.path.realpath(link), "run-meta.json")
    try:
        with open(meta_path) as fh:
            meta = json.load(fh)
    except Exception as exc:
        print("GATE: latest run-meta unreadable (%s) — FAIL CLOSED" % exc)
        print("GATE-VERDICT env-error")
        return 2
    verdicts = meta.get("verdicts") or {}
    reds = [j for j, v in sorted(verdicts.items()) if v != "green"]
    print("latest: %s verdict=%s" % (os.path.realpath(link), meta.get("verdict")))
    for j in sorted(verdicts):
        print("  %s: %s" % (j, verdicts[j]))
    # D2: fail closed unless the verdict table is a COMPLETE trunk claim.
    # The declared set is read from the harness's own journeys/ directory.
    import os as _os
    js_dir = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "journeys")
    declared = set()
    try:
        import yaml
        for f in sorted(_os.listdir(js_dir)):
            if f.endswith(".yaml"):
                with open(_os.path.join(js_dir, f)) as fh:
                    y = yaml.safe_load(fh)
                if y and y.get("id"):
                    declared.add(y["id"])
    except Exception as exc:
        print("GATE: journeys/ unreadable (%s) — FAIL CLOSED" % exc)
        print("GATE-VERDICT env-error")
        return 2
    missing = sorted(declared - set(verdicts))
    if missing:
        print("BLOCKER: latest verdicts table is INCOMPLETE — journeys %s never "
              "ran (D2: an incomplete run may not clear the gate)" % missing)
        print("GATE-VERDICT blocking")
        return 1
    # N1: the app_base must be the LITERAL trunk FE (same set the driver uses).
    # check-gate re-derives this from the run's recorded app_base, so a run-meta
    # flag alone can never make a scratch frontend pass.
    if not app_base_is_trunk(meta.get("app_base")):
        print("BLOCKER: latest run targeted a NON-TRUNK app_base %r (D2/N1: "
              "scratch frontend runs may not clear the gate)"
              % meta.get("app_base"))
        print("GATE-VERDICT blocking")
        return 1
    # A3: an advisory live-sampler run (J2-live shape) records an honest
    # verdict but never gates — and it never flips `latest`, so if one is
    # found here the gate blocks rather than clears on advisory data.
    if meta.get("advisory"):
        print("BLOCKER: latest is an ADVISORY run (A3: advisory verdicts never "
              "clear the gate while the live-drift product defect is open)")
        print("GATE-VERDICT blocking")
        return 1
    # D1 (fix4): the A2 restore grade is RE-DERIVED from the restore record —
    # a fake run whose restore did not take the live URL back may still point
    # the shared :3093 backend at the (now-dead) fake. The gate trusts
    # fake_restore.restore_ok (the graded evidence), never the run's verdict
    # string: a tampered/stale verdict cannot clear the gate on a failed
    # restore. Runs WITHOUT fake_restore are non-fake runs — the D2 check
    # below already blocks those.
    fr = meta.get("fake_restore")
    if fr is not None:
        if not fr.get("restore_ok"):
            print("BLOCKER: latest's A2 restore FAILED (fake_restore.restore_ok "
                  "=%r; restored_url=%r vs live_url=%r) — the shared backend "
                  "may still point at the fake; MANUAL restore required "
                  "(D1/A2: the restore grade gates the tick)"
                  % (fr.get("restore_ok"), fr.get("restored_url"),
                     fr.get("live_url")))
            print("GATE-VERDICT blocking")
            return 1
    # D2 (fix4): the gate's hard set is J1+J2(fake)+J3 — a clearing verdict
    # requires fake_mode recorded in the run-meta (first-class field the
    # driver writes in EVERY run since fix-run-4). A complete ALL-GREEN run
    # made on the LIVE sampler is a lottery win, not a trunk claim, and must
    # never clear the gate (cycle-3 D2; historically receipt
    # 20261101T034018Z cleared exactly this way).
    if not meta.get("fake_mode"):
        print("BLOCKER: latest is NOT a --fake run (fake_mode missing/false; "
              "verdict=%s) — the gate's hard set is J1+J2(fake)+J3, a "
              "live-sampler green is GREEN-NOT-GATING and never clears the "
              "tick (D2)" % meta.get("verdict"))
        print("GATE-VERDICT blocking")
        return 1
    if reds:
        for j in reds:
            print("BLOCKER: trunk journey %s is RED (verdict=%s) — "
                  "ready set EMPTY this tick; repair trunk before claiming"
                  % (j, verdicts[j]))
        print("GATE-VERDICT blocking")
        return 1
    print("GATE-VERDICT green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
