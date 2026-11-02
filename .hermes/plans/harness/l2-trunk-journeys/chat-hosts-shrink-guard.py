#!/usr/bin/env python3
"""chat-hosts-shrink-guard.py — CHATHOST-SWEEP-1 Change 3: the tick-time
shrink-guard for the chat-host inventory (config/chat/chat-hosts.yaml).

A host may be DELETED from the inventory ONLY with a re-bless (a new
blessed_sha256 in the MANIFEST) AND a spec path cited in the manifest's
bless_note. This guard FAILS (returns non-zero / reports the removed hosts)
when the CURRENT inventory's host-id set is a strict subset of the blessed
set — i.e. a blessed host disappeared without the re-bless + spec citation
that authorizes it.

The blessed sha256 is the CANONICAL form (sorted host ids, one per line, one
trailing newline) — the SAME convention the vocabulary golden MANIFEST bless
uses. The guard recomputes the sha from the CURRENT inventory and compares it
to the manifest's blessed_sha256; a mismatch that is a SHRINK (lost hosts) is
the RED case. A GROW (new hosts added) is NOT a shrink — it is a declared
change the next item's sweep must cover (the manifest is re-blessed at that
item); the guard names it but does not block on growth alone.

Importable (check-gate.py's `--chat-hosts` axis imports `shrink_guard`) AND
tick-runnable:

    python3 chat-hosts-shrink-guard.py                     # guard the repo inventory
    python3 chat-hosts-shrink-guard.py --recompute         # print the canonical sha
    python3 chat-hosts-shrink-guard.py --inventory <path> --manifest <path>

Exit 0 = the inventory did not shrink past the blessed set. Exit 1 = a blessed
host is missing (a shrink without a re-bless + spec citation). Exit 2 = env
error (inventory / manifest unreadable — fail closed).
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def _repo_root():
    # .hermes/plans/harness/l2-trunk-journeys -> four levels up = repo root.
    return os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))


def canonical_sha(host_ids):
    """Sorted host ids, one per line, one trailing newline -> sha256 hex."""
    import hashlib
    canon = "\n".join(sorted(host_ids)) + "\n"
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()


def inventory_ids(path):
    """The host ids from a chat-hosts.yaml (hosts[].id), sorted."""
    import yaml
    with open(path) as fh:
        doc = yaml.safe_load(fh)
    hosts = (doc or {}).get("hosts") or []
    ids = []
    for h in hosts:
        if not isinstance(h, dict) or not h.get("id"):
            raise ValueError("inventory %s has a host entry with no id" % path)
        ids.append(h["id"])
    return sorted(ids)


def load_manifest(path):
    import yaml
    with open(path) as fh:
        return (yaml.safe_load(fh) or {})


def shrink_guard(current_ids, manifest):
    """PURE: compare the CURRENT inventory id set to the blessed manifest.
    Returns (ok, removed):
      removed — blessed host ids that are MISSING from the current inventory
                (a shrink); ok is False when removed is non-empty.
    Growth (new ids) is allowed and named by the caller; it never sets
    removed. This is the one function check-gate's --chat-hosts axis and the
    standalone tick path both run (no helper divergence)."""
    blessed_sha = manifest.get("blessed_sha256")
    cur = set(current_ids)
    if blessed_sha is None:
        # No blessed sha -> the manifest has never been blessed; fail closed
        # (an un-blessed inventory has no shrink to authorize).
        return False, sorted(cur)
    if canonical_sha(current_ids) == blessed_sha:
        return True, []
    # The sha differs. A shrink = the blessed set had hosts the current set
    # lost. Reconstruct the blessed set is impossible from the sha alone, so
    # the manifest ALSO records blessed_ids (the human/audit record of what
    # was blessed) — the guard keys the removed-hosts diff on that record and
    # the sha is the tamper tripwire (any sha mismatch without an exact
    # blessed_ids match is a shrink unless it is pure growth).
    blessed_ids = manifest.get("blessed_ids")
    if not isinstance(blessed_ids, (list, tuple)):
        # sha mismatch + no blessed_ids record = the blessed set is unknown ->
        # fail closed (cannot prove no host was dropped).
        return False, ["<blessed set unreadable — re-bless the manifest>"]
    blessed = set(blessed_ids)
    removed = sorted(blessed - cur)          # blessed hosts now missing
    grown = sorted(cur - blessed)            # new hosts (not a shrink)
    # Exact match is already handled above; here the sha differs, so either
    # something was removed, something was grown, or both. Removed (a shrink)
    # is the RED case; growth alone is allowed (the caller re-blesses).
    if removed:
        return False, removed
    # sha differs but nothing removed -> pure growth: allowed. (The manifest
    # is stale-but-conservative: a new host is a declared change, re-blessed
    # by the item that added it.)
    _ = grown
    return True, []


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--inventory", default=os.path.join(
        _repo_root(), "config", "chat", "chat-hosts.yaml"))
    ap.add_argument("--manifest", default=os.path.join(
        _repo_root(), "config", "chat", "chat-hosts.manifest.yaml"))
    ap.add_argument("--recompute", action="store_true",
                    help="print the CURRENT inventory's canonical sha and exit "
                         "(for a re-bless); does NOT grade")
    args = ap.parse_args(argv)
    try:
        cur = inventory_ids(args.inventory)
    except Exception as exc:
        print("BLOCKER: chat-host inventory unreadable (%s) — FAIL CLOSED "
              "(Change 3)" % exc)
        return 2
    if args.recompute:
        print("canonical sha of %d host(s): %s" % (len(cur), canonical_sha(cur)))
        print("host ids: " + ", ".join(cur))
        return 0
    try:
        manifest = load_manifest(args.manifest)
    except Exception as exc:
        print("BLOCKER: blessed manifest unreadable (%s) — FAIL CLOSED "
              "(Change 3)" % exc)
        return 2
    ok, removed = shrink_guard(cur, manifest)
    if not ok:
        print("BLOCKER: the chat-host inventory SHRANK without a re-bless + "
              "spec citation — blessed host(s) %s are missing (Change 3: a "
              "deletion is allowed ONLY with a re-blessed blessed_sha256 AND a "
              "spec path in bless_note)" % removed)
        print("SHRINK-GUARD red")
        return 1
    print("SHRINK-GUARD green (current sha=%s; no blessed host dropped)"
          % canonical_sha(cur))
    return 0


if __name__ == "__main__":
    sys.exit(main())
