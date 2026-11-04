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
    """The chat-host inventory entries (config/chat/chat-hosts.yaml): returns
    (ids, surfaces) IN FILE ORDER — ids[i] and surfaces[i] describe the SAME
    host. `surface` is the machine surface id the server reads (fix1 D3:
    every entry MUST name one; a missing/empty surface is a malformed
    inventory, raise so the caller fails closed). Raises on an absent /
    malformed inventory (no id, duplicate id, no surface)."""
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
                             "`surface` field (fix1 D3: the server-read "
                             "surface id must be declared per entry)"
                             % (path, h.get("id")))
        ids.append(h["id"])
        surfaces.append(surface)
    if len(ids) != len(set(ids)):
        raise ValueError("chat-host inventory %s has duplicate host ids" % path)
    return ids, surfaces


def alias_map(inventory_ids, surfaces):
    """fix1 D3: the surface->host-id alias table. A surface value is an
    accepted ALIAS for its host id ONLY when it names EXACTLY ONE host (a
    unique surface). Ambiguous surface values — the four-way 'analysis'
    collision (config/chat/chat-hosts.yaml: four hosts post `analysis`) — are
    NOT aliases: one key cannot stand for four hosts, so a table keyed on
    them is still graded per HOST (fail closed, unchanged). Pure (no I/O)."""
    if surfaces is None:
        return {}
    by_surface = {}
    for hid, s in zip(inventory_ids, surfaces):
        by_surface.setdefault(s, set()).add(hid)
    return {s: next(iter(hosts)) for s, hosts in by_surface.items()
            if len(hosts) == 1}


def _verdict_ok(v):
    """fix1 D7: an ACCEPT verdict is a VERDICT OBJECT carrying a per-host
    receipt reference — not a bare string. Shape: {"verdict":
    "accept"|"green", "receipts": "<non-empty path>"}; anything else (a
    verdict string alone, a missing/empty receipts path, a non-accept
    verdict) is not-accept. Pure (no I/O: the receipt FILE's existence is
    verified by the axis, which has the run dir)."""
    if isinstance(v, str):
        return False          # a verdict string alone = not-accept (D7)
    if not isinstance(v, dict):
        return False
    return (v.get("verdict") in ("accept", "green")
            and isinstance(v.get("receipts"), str) and v.get("receipts"))


def grade_chat_host_sweep(verdicts, inventory_ids, surfaces=None):
    """Grade a chat-host sweep verdict table against the inventory (Change 2,
    fix1 D3+D7). `verdicts` maps host id -> verdict; a UNIQUE surface value
    (surfaces[i] naming exactly one host) is also accepted as an ALIAS key
    for that host id (fix1 D3 — ambiguous surface values, e.g. the four-way
    'analysis' collision, are never aliases). A verdict is accept ONLY as an
    object with a non-empty `receipts` reference (fix1 D7: a verdict string
    alone is not-accept — the gate no longer trusts a self-declared string).
    Returns (ok, missing, not_accept, undeclared):
      missing    — inventory hosts with NO verdict (a strict-subset table, the
                   spec's RED case: a dropped host must go red);
      not_accept — hosts present but whose verdict is not an accept OBJECT
                   (no receipt reference, or a non-accept verdict);
      undeclared — hosts in the table (after alias resolution) that are NOT
                   in the inventory (N5 exact-set discipline: tamper
                   evidence, not coverage).
    ok is True ONLY when all three are empty (the full inventory swept, every
    host accept WITH a receipt reference, no undeclared host)."""
    inv = set(inventory_ids)
    alias = alias_map(inventory_ids, surfaces)
    norm = {alias.get(k, k): v for k, v in (verdicts or {}).items()}
    vkeys = set(norm.keys())
    missing = sorted(inv - vkeys)
    not_accept = sorted(k for k in vkeys if not _verdict_ok(norm.get(k)))
    undeclared = sorted(vkeys - inv)
    ok = not missing and not not_accept and not undeclared
    return ok, missing, not_accept, undeclared


def receipt_teardown_grade(receipt):
    """O-1 (advc c8, CHATHOST-CONSOLIDATE-1 FIX2): CONSUME the probe
    receipt's OWN teardown claim. A receipt that carries `teardown_ok:
    false`, or a `side_teardown` with any `*_deleted` flag false, is
    NOT-ACCEPT at the chat gate — the honest receipt is graded, not just
    file-checked (the pre-O-1 hole: the gate accepted a probe whose
    receipt said teardown_ok: false / side_teardown.acl_record_deleted:
    false). Returns a list of reason strings when the claim is
    not-accept, else None (honest claim, or NO claim — a receipt without
    `teardown_ok`/`side_teardown`, the non-probe J1/J2/J3 shape, is graded
    unchanged). Pure (no I/O). Fail closed: a malformed claim (non-bool
    `teardown_ok`, non-object `side_teardown`) is not-accept — a claim
    that cannot be verified honest may not clear the gate."""
    if not isinstance(receipt, dict):
        return ["receipt is not a JSON object (%r) — its teardown claim "
                 "cannot be verified honest (fail closed)"
                % type(receipt).__name__]
    reasons = []
    if "teardown_ok" in receipt:
        if receipt["teardown_ok"] is not True:
            reasons.append("teardown_ok: %r (false/malformed — the probe "
                           "did not prove it left nothing behind; a not-"
                           "accept receipt may not clear the gate)"
                           % (receipt["teardown_ok"],))
    st = receipt.get("side_teardown")
    if st is not None:
        if not isinstance(st, dict):
            reasons.append("side_teardown is not an object (%r) — the "
                           "per-path claim cannot be verified honest "
                           "(fail closed)" % (st,))
        else:
            for k in sorted(st):
                if k.endswith("_deleted") and st[k] is not True:
                    reasons.append("side_teardown.%s: %r (flag false — the "
                                   "probe side record was NOT observed "
                                   "removed; it may still exist)"
                                   % (k, st[k]))
    return reasons or None


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
    Exit 0 = the full inventory is swept, every host accept WITH a per-host
             receipt reference (fix1 D7) that exists, no undeclared host, the
             run targeted the TRUNK FE (fix1 D6 / N1), and no un-authorized
             inventory change (Change 3).
    Exit 1 = a strict-subset table (a dropped host), any not-accept verdict
             (a bare verdict string or a missing/empty receipts path — D7),
             any undeclared host, a NON-TRUNK app_base (N1/D6), a receipt
             reference that does not exist (D7), an accepted receipt whose
             OWN teardown claim is not-accept — teardown_ok: false or any
             side_teardown *_deleted flag false (O-1, advc c8; a receipt
             without the claim is graded unchanged), OR an un-authorized
             inventory shrink (BLOCKER).
    Exit 2 = env error (inventory / run-meta / shrink-guard unreadable —
             fail closed).
    Verdict keys: a host `id` is primary; a UNIQUE `surface:` value (one that
    names exactly one host) is also accepted as an ALIAS key (fix1 D3).
    Ambiguous surface values (the four-way 'analysis' collision) are NOT
    aliases — a table keyed on them is still graded per host (fail closed).
    The run is read from CL_RECEIPTS/latest (or `--run <name>`); the inventory
    from CL_CHAT_HOSTS (default: the repo's config/chat/chat-hosts.yaml); the
    blessed manifest from CL_CHAT_HOSTS_MANIFEST (default: the repo's
    config/chat/chat-hosts.manifest.yaml)."""
    inv_path = os.environ.get(
        "CL_CHAT_HOSTS",
        os.path.join(_repo_root(), "config", "chat", "chat-hosts.yaml"))
    try:
        inventory, surfaces = load_chat_host_inventory(inv_path)
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
    # N1 (fix1 D6): the chat axis applies the SAME trunk rule the journey
    # gate uses — a sweep run targeted at a NON-TRUNK app_base (a scratch
    # vite) may never clear the gate, full accept table or not. Re-derived
    # from the run's recorded app_base (app_base_is_trunk), never from a
    # flag: the exact "green gate over the wrong build" class the N1 arm
    # exists to stop, now on the chat axis too.
    if not app_base_is_trunk(meta.get("app_base")):
        print("BLOCKER: the chat-host sweep run targeted a NON-TRUNK "
              "app_base %r (N1: a scratch frontend sweep may not clear the "
              "chat gate — re-derive the sweep against the trunk FE)"
              % meta.get("app_base"))
        print("GATE-VERDICT blocking")
        return 1
    # fix1 D7: every ACCEPT verdict must be an OBJECT carrying a per-host
    # receipt reference, and that receipt FILE must exist (under the run dir
    # or the receipts root). A verdict string alone, or a receipts path that
    # does not exist, is not-accept — the gate no longer trusts a
    # self-declared verdict without a request-body receipt artefact.
    for h in sorted(verdicts):
        v = verdicts[h]
        if isinstance(v, dict) and isinstance(v.get("receipts"), str):
            rp = v["receipts"]
            if rp and not (os.path.isfile(os.path.join(run_dir, rp))
                           or os.path.isfile(rp)
                           or os.path.isfile(os.path.join(
                               RECEIPTS_ROOT, rp))):
                print("BLOCKER: chat-host %s verdict references receipt %r "
                      "that does not exist (fix1 D7: a verdict without a "
                      "request-body receipt artefact is not-accept)"
                      % (h, rp))
                print("GATE-VERDICT blocking")
                return 1
            # O-1 (advc c8, CHATHOST-CONSOLIDATE-1 FIX2): CONSUME the
            # ACCEPTED receipt's own teardown claim. A receipt that says
            # teardown_ok: false, or a side_teardown with a *_deleted flag
            # false, is NOT-ACCEPT — the honest receipt is graded, not just
            # file-checked. A receipt WITHOUT the claim (no teardown_ok /
            # no side_teardown — the non-probe J1/J2/J3 shape) is graded
            # unchanged (the helper returns None). The receipt file was
            # just proven to exist above, so this read cannot fail closed.
            try:
                with open(os.path.join(run_dir, rp)
                          if os.path.isfile(os.path.join(run_dir, rp))
                          else (rp if os.path.isfile(rp)
                                else os.path.join(RECEIPTS_ROOT, rp)),
                          ) as _rxf:
                    _rx = json.load(_rxf)
            except Exception as exc:
                print("BLOCKER: chat-host %s verdict references receipt %r "
                      "that CANNOT be read as a receipt (%s; O-1: a "
                      "not-gradable teardown claim is not-accept — FAIL "
                      "CLOSED)" % (h, rp, exc))
                print("GATE-VERDICT blocking")
                return 1
            _o1_reasons = receipt_teardown_grade(_rx)
            if _o1_reasons:
                print("BLOCKER: chat-host %s receipt %r is NOT-ACCEPT on "
                      "its OWN teardown claim (O-1 advc c8: the honest "
                      "receipt is graded — %s)"
                      % (h, rp, "; ".join(_o1_reasons)))
                print("GATE-VERDICT blocking")
                return 1
    ok, missing, not_accept, undeclared = grade_chat_host_sweep(verdicts,
                                                                inventory,
                                                                surfaces)
    print("chat-host sweep: %s (inventory = %d host(s))" % (run_dir, len(inventory)))
    for h in sorted(verdicts):
        v = verdicts[h]
        if isinstance(v, dict):
            shown = "%s (receipts=%s)" % (v.get("verdict"), v.get("receipts"))
        else:
            shown = str(v)
        print("  %s: %s" % (h, shown))
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
        sg_ok, sg_removed, sg_reason, _sg_auth = sg.shrink_guard(
            inventory, manifest, os.path.join(_repo_root()))
    except Exception as exc:
        print("BLOCKER: the Change 3 shrink-guard failed to run (%s) — FAIL "
              "CLOSED" % exc)
        print("GATE-VERDICT env-error")
        return 2
    if not sg_ok:
        print("BLOCKER: the chat-host inventory changed without an authorized "
              "re-bless (Change 3: a deletion is allowed ONLY with a re-bless "
              "whose blessed_ids reproduce blessed_sha256 AND a spec path in "
              "the re-bless record's bless_note that exists in the repo) — "
              "cause: %s" % (sg_reason or "unauthorized"))
        if sg_removed:
            print("  removed/changed host(s): %s" % sg_removed)
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
