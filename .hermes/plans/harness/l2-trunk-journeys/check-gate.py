#!/usr/bin/env python3
"""check-gate.py — the TICK-FACING contract of the trunk-journeys harness.

The lane tick runs this BEFORE claiming any new item:

    python3 .hermes/plans/harness/l2-trunk-journeys/check-gate.py
    exit 0 = trunk journeys GREEN (or no run yet — never gate a virgin lane)
    exit 1 = at least one journey RED, OR the latest run is not a fake-mode
             run (D2: hard set J1+J2(fake)+J3), OR its A2 restore failed
             (D1: fake_restore.restore_ok), OR its verdicts table does not
             EXACTLY match the declared journeys (N5: superset OR missing
             both block, naming the diff), OR its app_base is non-trunk, OR
             it is advisory —
             the ready set is EMPTY this tick and the printed BLOCKER line
             names the cause
    exit 2 = the receipt root itself is unreadable (env error, fail closed
             on claiming too: a broken receipts trail proves nothing green)

CHATHOST-SWEEP-1 (Change 2) — a SECOND scope axis on the SAME script
(`--chat-hosts`, a separate scope axis — no parallel harness): grade a
chat-host sweep run's `chat_host_verdicts` table against the DATA inventory
(config/chat/chat-hosts.yaml). A table that is a STRICT SUBSET of the
inventory (an inventory host never swept) exits RED; so do not-accept
verdicts, undeclared hosts, and an un-blessed inventory shrink (Change 3).

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


# ---------------------------------------------------------------------------
# CHATHOST-SWEEP-1 — the chat-host sweep scope axis (Change 2).
# The inventory is DATA (config/chat/chat-hosts.yaml); a chat-host sweep
# verdict table is graded AGAINST it. A verdict table that is a STRICT
# SUBSET of the inventory (an inventory host was never swept) goes RED —
# that is the spec's RED case (a dropped host must not clear the gate).
# ALL PURE (no I/O) so test-channel-selfcheck.py can pin them non-vacuously.
# ---------------------------------------------------------------------------

def canonical_sha(host_ids):
    """The blessed-MANIFEST canonical form of a host-id set (the same
    convention the vocabulary golden MANIFEST bless uses): sorted ascending,
    one per line, a single trailing newline -> sha256 hex."""
    import hashlib
    canon = "\n".join(sorted(host_ids)) + "\n"
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def load_chat_host_inventory(path):
    """The host ids declared in the chat-host inventory YAML (hosts[].id),
    sorted. Raises on an absent / malformed inventory (the caller fails
    closed)."""
    import yaml
    with open(path) as fh:
        doc = yaml.safe_load(fh)
    hosts = (doc or {}).get("hosts") or []
    ids = []
    for h in hosts:
        if not isinstance(h, dict) or not h.get("id"):
            raise ValueError("chat-host inventory %s has a host entry with no id"
                             % path)
        ids.append(h["id"])
    if len(ids) != len(set(ids)):
        raise ValueError("chat-host inventory %s has duplicate host ids" % path)
    return sorted(ids)


def grade_chat_host_sweep(verdicts, inventory_ids):
    """Grade a chat-host sweep verdict table against the inventory (Change 2).
    `verdicts` is {host_id: verdict}; verdict 'accept'/'green' = swept with a
    request-body receipt + rendered answer, anything else = not-accept.
    Returns (ok, missing, not_accept, undeclared):
      missing    — inventory hosts with NO verdict (a strict-subset table, the
                   spec's RED case: a dropped host must go red);
      not_accept — hosts present but whose verdict is not accept/green;
      undeclared — hosts in the table that are NOT in the inventory (N5
                   exact-set discipline: tamper evidence, not coverage).
    ok is True ONLY when all three are empty (the full inventory swept, every
    host accept, no undeclared host)."""
    inv = set(inventory_ids)
    vkeys = set((verdicts or {}).keys())
    missing = sorted(inv - vkeys)
    not_accept = sorted(k for k in vkeys
                        if (verdicts or {}).get(k) not in ("accept", "green"))
    undeclared = sorted(vkeys - inv)
    ok = not missing and not not_accept and not undeclared
    return ok, missing, not_accept, undeclared


def _repo_root():
    # .hermes/plans/harness/l2-trunk-journeys -> four levels up = repo root.
    return os.path.abspath(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))


def _load_shrink_guard():
    """Change 3: load the standalone tick-time shrink-guard script by path
    (hyphenated name -> importlib, the same way test-channel-selfcheck loads
    the driver). Returns the module, or None if it cannot be loaded (the
    caller then fails closed rather than silently skipping the guard)."""
    import importlib.util
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "chat-hosts-shrink-guard.py")
    spec = importlib.util.spec_from_file_location("chat_hosts_shrink_guard", p)
    if spec is None or spec.loader is None:
        return None
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception:
        return None
    return mod


def chat_host_axis():
    """CHATHOST-SWEEP-1 Change 2: grade a run's chat-host sweep verdict table
    against the DATA inventory (and run the Change 3 shrink-guard). A SEPARATE
    scope axis from the journey tick gate (no flag = the journey gate,
    UNCHANGED).
    Exit 0 = the full inventory is swept, every host accept, no undeclared
             host, and no un-blessed shrink.
    Exit 1 = a strict-subset table (a dropped host), any not-accept, any
             undeclared host, OR an un-blessed inventory shrink (BLOCKER).
    Exit 2 = env error (inventory / run-meta / shrink-guard unreadable —
             fail closed).
    The run is read from CL_RECEIPTS/latest (or `--run <name>`); the inventory
    from CL_CHAT_HOSTS (default: the repo's config/chat/chat-hosts.yaml); the
    blessed manifest from CL_CHAT_HOSTS_MANIFEST (default: the repo's
    config/chat/chat-hosts.manifest.yaml)."""
    inv_path = os.environ.get(
        "CL_CHAT_HOSTS",
        os.path.join(_repo_root(), "config", "chat", "chat-hosts.yaml"))
    try:
        inventory = load_chat_host_inventory(inv_path)
    except Exception as exc:
        print("BLOCKER: chat-host inventory unreadable (%s) — FAIL CLOSED "
              "(Change 2)" % exc)
        print("GATE-VERDICT env-error")
        return 2
    # locate the run to grade (CL_RECEIPTS/latest or --run <name>)
    run_dir = None
    if "--run" in sys.argv:
        i = sys.argv.index("--run")
        name = sys.argv[i + 1] if i + 1 < len(sys.argv) else ""
        cand = os.path.join(RECEIPTS_ROOT, name)
        if name and os.path.isdir(cand):
            run_dir = cand
    if run_dir is None:
        link = os.path.join(RECEIPTS_ROOT, "latest")
        if os.path.exists(link):
            run_dir = os.path.realpath(link)
    if run_dir is None:
        print("BLOCKER: no chat-host sweep run to grade (CL_RECEIPTS=%s has no "
              "run/latest)" % RECEIPTS_ROOT)
        print("GATE-VERDICT env-error")
        return 2
    meta_path = os.path.join(run_dir, "run-meta.json")
    try:
        with open(meta_path) as fh:
            meta = json.load(fh)
    except Exception as exc:
        print("BLOCKER: run-meta unreadable for the chat-host sweep (%s) — "
              "FAIL CLOSED" % exc)
        print("GATE-VERDICT env-error")
        return 2
    verdicts = meta.get("chat_host_verdicts")
    if not isinstance(verdicts, dict) or not verdicts:
        print("BLOCKER: run %s declares no chat_host_verdicts table — a "
              "chat-host sweep run must be graded against the inventory "
              "(Change 2: fail closed)" % run_dir)
        print("GATE-VERDICT blocking")
        return 1
    ok, missing, not_accept, undeclared = grade_chat_host_sweep(verdicts,
                                                                inventory)
    print("chat-host sweep: %s (inventory = %d host(s))" % (run_dir, len(inventory)))
    for h in sorted(verdicts):
        print("  %s: %s" % (h, verdicts[h]))
    for h in missing:
        print("  %s: MISSING (no verdict)" % h)
    # Change 3: the shrink-guard (the standalone tick-time script, imported by
    # this axis so the SAME logic grades the tick).
    import yaml as _yaml
    man_path = os.environ.get(
        "CL_CHAT_HOSTS_MANIFEST",
        os.path.join(_repo_root(), "config", "chat", "chat-hosts.manifest.yaml"))
    sg = _load_shrink_guard()
    if sg is None:
        print("BLOCKER: the Change 3 shrink-guard script could not be loaded — "
              "FAIL CLOSED (an un-gradable shrink-guard may not clear the gate)")
        print("GATE-VERDICT env-error")
        return 2
    try:
        with open(man_path) as fh:
            manifest = _yaml.safe_load(fh) or {}
        sg_ok, sg_removed = sg.shrink_guard(inventory, manifest)
    except Exception as exc:
        print("BLOCKER: the Change 3 shrink-guard failed to run (%s) — FAIL "
              "CLOSED" % exc)
        print("GATE-VERDICT env-error")
        return 2
    if not sg_ok:
        print("BLOCKER: the chat-host inventory SHRANK without a spec citing it "
              "— blessed host(s) %s are missing (Change 3: a deletion is "
              "allowed ONLY with a re-bless + a spec path in the bless note)"
              % sg_removed)
        print("GATE-VERDICT blocking")
        return 1
    if not ok:
        if missing:
            print("BLOCKER: the chat-host sweep is a STRICT SUBSET of the "
                  "inventory — host(s) %s were never swept (Change 2: a "
                  "dropped host is RED; every host needs one live round trip "
                  "with a request-body receipt, or the verdict is not-accept)"
                  % missing)
        if not_accept:
            print("BLOCKER: chat-host sweep verdict(s) not-accept for %s (no "
                  "request-body receipt + rendered answer)" % not_accept)
        if undeclared:
            print("BLOCKER: the chat-host sweep names UNDECLARED host(s) %s "
                  "(not in the inventory — N5 exact-set discipline: tamper "
                  "evidence, not coverage)" % undeclared)
        print("GATE-VERDICT blocking")
        return 1
    print("GATE-VERDICT green (chat-host sweep covers the full inventory; "
          "shrink-guard clean)")
    return 0


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
    # N5: EXACT-SET equality between declared journeys and the verdicts
    # table. Pre-N5 only INCOMPLETENESS blocked (missing = declared -
    # verdicts), so a SUPERSET table — an extra bogus journey declared green
    # by a tampered run-meta — cleared the gate. Superset OR missing both
    # BLOCK, naming the diff in each direction.
    declared_minus_verdicts = sorted(declared - set(verdicts))
    verdicts_minus_declared = sorted(set(verdicts) - declared)
    if declared_minus_verdicts or verdicts_minus_declared:
        if declared_minus_verdicts and verdicts_minus_declared:
            print("BLOCKER: latest verdicts table does not EXACTLY match the "
                  "declared journeys — MISSING %s never ran AND UNDECLARED %s "
                  "appear in the table (N5: exact-set equality; a superset "
                  "table is tamper evidence, an incomplete one cannot prove "
                  "coverage)" % (declared_minus_verdicts,
                                 verdicts_minus_declared))
        elif declared_minus_verdicts:
            print("BLOCKER: latest verdicts table is INCOMPLETE — journeys %s "
                  "never ran (D2/N5: an incomplete run may not clear the "
                  "gate)" % declared_minus_verdicts)
        else:
            print("BLOCKER: latest verdicts table is a SUPERSET of the "
                  "declared journeys — UNDECLARED %s appear in the table "
                  "(N5: exact-set equality; extra verdict keys are tamper "
                  "evidence, not coverage)" % verdicts_minus_declared)
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
    # CHATHOST-SWEEP-1 Change 2: `--chat-hosts` grades a chat-host sweep run
    # against the DATA inventory (the sweep scope axis). NO flag = the
    # journey tick gate, byte-for-byte unchanged.
    if "--chat-hosts" in sys.argv:
        sys.exit(chat_host_axis())
    sys.exit(main())
