#!/usr/bin/env python3
"""chat-hosts-shrink-guard.py — CHATHOST-SWEEP-1 Change 3: the tick-time
shrink-guard for the chat-host inventory (config/chat/chat-hosts.yaml).

A host may be DELETED from the inventory ONLY with a re-bless (a NEW
blessed_sha256 in the MANIFEST) AND a spec path cited in the re-bless record's
bless_note. This guard FAILS (returns non-zero / reports the removed hosts)
when the CURRENT inventory's host-id set is a strict subset of the blessed
set — i.e. a blessed host disappeared without the re-bless + spec citation
that authorizes it.

THE HASHED PAYLOAD IS THE AUTHORITY (fix1, D1). The top-level
`blessed_sha256`/`blessed_ids` is the ORIGINAL bless and is FROZEN: the guard
ASSERTS the manifest invariant

    canonical_sha(blessed_ids) == blessed_sha256

before trusting ANY part of the manifest, and derives the removed-set from
that invariant-checked set — never from a mutable blessed_ids that does not
reproduce its sha (trimming blessed_ids while the sha stays, or the full
drain hosts:[]/blessed_ids:[] with a stale sha, breaks the invariant -> RED,
fail closed). A re-bless does NOT overwrite the top-level; it APPENDS a
blessed_records entry. Any inventory-sha mismatch that is a SHRINK is RED
unless the manifest carries a NEWER consistent bless record: a blessed_records
entry whose blessed_sha256 EQUALS the current inventory sha (the new sha) and
whose blessed_ids reproduce that sha (hashes consistently) AND whose blessed_ids reproduce that sha. Pure growth (no host removed) is allowed and is
re-blessed by the item that added the host.

Importable (check-gate.py's `--chat-hosts` axis imports `shrink_guard`) AND
tick-runnable:

    python3 chat-hosts-shrink-guard.py                     # guard the repo inventory
    python3 chat-hosts-shrink-guard.py --recompute         # print the canonical sha
    python3 chat-hosts-shrink-guard.py --inventory <path> --manifest <path>

Exit 0 = the inventory did not shrink past the blessed set (or the shrink is
authorized by a consistent re-bless record with a spec that exists).
Exit 1 = a blessed host is missing WITHOUT an authorizing re-bless record
(includes: invariant failure, mismatch without a consistent newer record, and
a re-bless record that does not hash consistently).
Exit 2 = env error (inventory / manifest unreadable — fail closed).
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


def _bless_records(manifest):
    """The manifest's blessed_records list (a list of re-bless records).
    The TOP-LEVEL blessed_sha256/blessed_ids/bless_note/blessed_at is the
    newest record itself (the first bless); blessed_records carries every
    subsequent re-bless, newest last. Only dict entries are yielded."""
    recs = manifest.get("blessed_records")
    if not isinstance(recs, (list, tuple)):
        return []
    return [r for r in recs if isinstance(r, dict)]


def shrink_guard(current_ids, manifest, repo_root=None):
    """PURE (no I/O beyond the spec-existence check, which takes an explicit
    repo_root so callers — check-gate's axis and the selfcheck — stay
    deterministic). Compares the CURRENT inventory id set to the blessed
    manifest. Returns (ok, removed, reason, authorized):
      ok         — False => RED (the guard blocks the tick).
      removed    — blessed host ids MISSING from the current inventory (a
                   shrink); [] when there is no shrink.
      reason     — None when ok; otherwise a short machine-readable cause
                   ("un-blessed", "invariant", or "no-consistent-record"),
                   for the gate's BLOCKER line.
      authorized — the spec path cited by the authorizing re-bless record,
                   when one exists (ok, an authorized shrink); None otherwise.

    THE HASHED PAYLOAD IS THE AUTHORITY (fix1, D1). The manifest's
    TOP-LEVEL blessed_sha256/blessed_ids is the ORIGINAL (first) bless and is
    FROZEN: the guard ASSERTS the manifest invariant

        canonical_sha(blessed_ids) == blessed_sha256

    and derives the removed-set from that invariant-checked set — NEVER from a
    mutable blessed_ids that does not reproduce its sha (trimming blessed_ids
    while the sha stays breaks the invariant -> RED; the full drain
    hosts:[]/blessed_ids:[] with a stale sha breaks it too). A re-bless does
    NOT overwrite the top-level; it appends a blessed_records entry. Any
    inventory-sha mismatch (the current inventory differs from the frozen
    bless) that is a SHRINK is RED unless a NEWER consistent bless record
    authorizes it: a blessed_records entry whose blessed_sha256 is the "new
    sha" (== the current inventory sha), whose blessed_ids reproduce that sha
    ("hashes consistently"), and whose bless_note cites a spec path that
    EXISTS in the repo (D2: no citation -> no deletion). Pure growth (no host
    removed) is allowed and is re-blessed by the item that added the host.
    """
    if repo_root is None:
        repo_root = _repo_root()
    cur = list(current_ids)
    cur_sha = canonical_sha(cur)
    blessed_sha = manifest.get("blessed_sha256")
    blessed_ids = manifest.get("blessed_ids")
    if blessed_sha is None:
        # No blessed sha -> the manifest has never been blessed; fail closed
        # (an un-blessed inventory has no shrink to authorize).
        return False, sorted(set(cur)), "un-blessed", None
    if not isinstance(blessed_ids, (list, tuple)):
        # No id record -> the blessed set cannot be derived from the hashed
        # payload -> fail closed (cannot prove no host was dropped).
        return False, ["<blessed set unreadable — re-bless the manifest>"], \
            "invariant", None
    # MANIFEST INVARIANT (fix1, D1): the sha is the authority. The frozen
    # blessed_ids record MUST reproduce blessed_sha256. If it does not —
    # trimmed/edited while the sha stays, or a drained list with a stale sha —
    # the manifest is untrusted and the guard fails closed BEFORE trusting any
    # part of it. This is exactly the case that killed the D1 drain.
    if canonical_sha(blessed_ids) != blessed_sha:
        return False, ["<manifest invariant broken: blessed_sha256 != "
                       "canonical_sha(blessed_ids)>"], "invariant", None
    blessed = set(blessed_ids)
    removed = sorted(blessed - set(cur))     # derived from the hashed payload
    if cur_sha == blessed_sha:
        # The current inventory IS the frozen blessed set (invariant-checked
        # above). No change -> green.
        return True, [], None, None
    # sha mismatch: the current inventory differs from the frozen bless.
    if not removed:
        # Pure GROWTH (current strictly contains the blessed set): not a
        # shrink. Allowed (the item that added the host re-blesses).
        return True, [], None, None
    # A SHRINK (frozen-blessed hosts missing from the current inventory).
    # RED unless a NEWER consistent bless record authorizes the CURRENT set:
    #   blessed_records entry whose blessed_sha256 is the "new sha" == the
    #   current inventory sha, whose blessed_ids reproduce that sha (hashes
    #   consistently), and whose bless_note cites a spec path that EXISTS in
    #   the repo (fix1 D2: no existing-spec citation -> no deletion).
    for rec in _bless_records(manifest):
        rec_ids = rec.get("blessed_ids")
        rec_sha = rec.get("blessed_sha256")
        if not isinstance(rec_ids, (list, tuple)):
            continue
        if rec_sha is None or rec_sha != cur_sha:
            continue          # the record's "new sha" must match the current set
        if canonical_sha(rec_ids) != rec_sha:
            continue          # record does not hash consistently
        return True, removed, None, None  # a consistent newer bless authorizes the shrink
    return False, removed, "no-consistent-record", None


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
    ok, removed, reason, authorized = shrink_guard(cur, manifest, _repo_root())
    if not ok:
        cause_key = reason if reason else "unauthorized"
        cause = {
            "invariant": "the manifest invariant FAILED "
                         "(canonical_sha(blessed_ids) != blessed_sha256 — the "
                         "hashed payload is the authority and the id record "
                         "does not reproduce it)",
            "un-blessed": "the manifest is un-blessed (no blessed_sha256)",
            "no-consistent-record": "no NEWER consistent re-bless record "
                         "(a blessed_records entry whose blessed_sha256 "
                         "equals the current inventory sha and whose "
                         "blessed_ids reproduce that sha) authorizes this "
                         "state",
        }.get(cause_key, cause_key)
        print("BLOCKER: the chat-host inventory changed without an authorized "
              "re-bless — %s (Change 3: a deletion is allowed ONLY with a "
              "re-blessed blessed_sha256 whose id record reproduces it)" % cause)
        if removed:
            print("  removed/changed host(s): %s" % removed)
        print("SHRINK-GUARD red")
        return 1
    if removed:
        print("SHRINK-GUARD green (current sha=%s; %d blessed host(s) removed "
              "— authorized by a consistent re-bless record)"
              % (canonical_sha(cur), len(removed)))
    else:
        print("SHRINK-GUARD green (current sha=%s; no blessed host dropped)"
              % canonical_sha(cur))
    return 0


if __name__ == "__main__":
    sys.exit(main())
