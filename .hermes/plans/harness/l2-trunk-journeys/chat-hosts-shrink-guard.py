#!/usr/bin/env python3
"""chat-hosts-shrink-guard.py — CHATHOST-SWEEP-1 Change 3: the tick-time
shrink-guard for the chat-host inventory (config/chat/chat-hosts.yaml).

A host may be DELETED from the inventory ONLY with a re-bless (a NEW
blessed_sha256 in the MANIFEST) AND a spec path cited in the re-bless record's
bless_note. This guard FAILS (returns non-zero / reports the removed hosts)
when the CURRENT inventory's host-id set is a strict subset of the blessed
set — i.e. a blessed host disappeared without the re-bless + spec citation
that authorizes it.

THE HASHED PAYLOAD IS THE AUTHORITY (fix1, D1+D2), and the FIRST-BLESS ANCHOR
IS A TRIPWIRE (fix2 D2 + CONSOLIDATE-1 OBS-B option (i)). The top-level
`blessed_sha256`/`blessed_ids` is the record of the ORIGINAL bless; the guard
ASSERTS the manifest invariant

    canonical_sha(blessed_ids) == blessed_sha256

before trusting any part of the manifest. The FIRST-BLESS anchor
(`first_blessed_sha256` + `first_blessed_ids`) is DATA carried in the same
writable manifest (not a guard constant). The guard uses it as a TRIPWIRE: an
accidental or uncited rewrite of the blessed set goes RED. A deliberate
rewrite that moves the anchor together with the blessed set is NOT stopped by
this guard; that class is policed by adversarial review and the trunk merge
(decisions/CHATHOST-SWEEP-c3-cyclecap-l2t1805.md). There is NO immutability
enforcement here — the anchor is data, exactly like the top-level bless, and a
tamper-capable actor can rewrite the anchor too (honesty: this is a tripwire,
not an authority). The guard ALSO asserts the anchor invariant

    canonical_sha(first_blessed_ids) == first_blessed_sha256

so the anchor set is self-checking, and it derives the REMOVED-SET FROM THE
ANCHOR SET (first_blessed_ids - current inventory ids), NOT from the top-level
record. That is what lets the dropped host be NAMED on every path — including
a deliberate authorized rewrite that the top-level set already forgets (c3 D3,
probe P-1). A missing first_blessed_sha256 fails closed (reason "no-anchor");
a missing or empty first_blessed_ids fails closed (reason "no-anchor-set");
an anchor-set / anchor-sha mismatch fails closed (reason "anchor-invariant").

The top-level bless_note is prose and is NEVER read as authorization; the same
record must be APPENDED to blessed_records AND its bless_note must cite a spec
that EXISTS under one of the three real spec trees (OBS-C: `.hermes/plans/
*-spec.md` top level, `specifications/**`, `docs/**` — a harness README, a
decisions/, handoffs/, reviews/ or config/ path is NOT a spec citation even
when the file exists). A re-bless does NOT overwrite the top-level or the
anchor; it APPENDS a blessed_records entry. Any inventory-sha mismatch that is
a SHRINK is RED unless a newer consistent bless record authorizes the current
set (blessed_sha256 == current inventory sha, blessed_ids reproduce it, and a
spec that exists in the repo is cited). Pure growth (no host removed) is
allowed and is re-blessed by the item that added the host.

Importable (check-gate.py's `--chat-hosts` axis imports `shrink_guard`) AND
tick-runnable:

    python3 chat-hosts-shrink-guard.py                     # guard the repo inventory
    python3 chat-hosts-shrink-guard.py --recompute         # print the canonical sha
    python3 chat-hosts-shrink-guard.py --inventory <path> --manifest <path>

Exit 0 = the inventory did not shrink past the blessed set (or the shrink is
authorized by a consistent re-bless record with a spec that exists).
Exit 1 = a blessed host is missing / the blessed set changed WITHOUT an
authorizing re-bless record (includes: invariant failure, anchor-invariant
failure, missing first-bless anchor / anchor set, mismatch without a consistent
newer record, and a re-bless record whose cited spec is not in a real spec
tree).
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


def spec_cited(bless_note, repo_root):
    """A bless_note cites a spec when it names a path that EXISTS under
    repo_root AND lives in one of the three real spec trees
    (CONSOLIDATE-1 OBS-C). Returns (cited, path-or-None):
      - `.hermes/plans/<name>-spec.md` — TOP LEVEL ONLY (no further `/` after
        `.hermes/plans/`), basename ending `-spec.md`;
      - `specifications/**` (any depth under the tree);
      - `docs/**` (any depth under the tree).
    A token that merely looks path-ish but sits OUTSIDE those three roots is
    NOT a spec citation even when the file exists: `.hermes/plans/harness/**`,
    `.hermes/plans/decisions/**`, `.hermes/plans/handoffs/**`,
    `.hermes/plans/reviews/**`, `config/**`, and any bare `.md` elsewhere.
    (Probe P-3: a citation of this harness's own README.md must not authorize
    a deletion.) File existence stays the backstop. A bare note names no spec
    (the RED case, D2)."""
    if not isinstance(bless_note, str):
        return False, None
    for tok in bless_note.split():
        t = tok.rstrip(".,;:)]}'\u201d")   # trailing punctuation only — a
                                           # leading '.' (e.g. .hermes/) is a
                                           # path component, NOT punctuation
        if not t or " " in t:
            continue
        if os.path.isabs(t):
            continue                       # only repo-relative citations
        cand = os.path.join(repo_root, t)
        if not os.path.isfile(cand):
            continue                       # existence is the backstop
        parts = t.split("/")
        # .hermes/plans/<basename>-spec.md — top level only (exactly 3 parts).
        if (len(parts) == 3 and parts[0] == ".hermes" and parts[1] == "plans"
                and parts[2].endswith("-spec.md")):
            return True, t
        # specifications/** and docs/** — at least one path component under.
        if len(parts) >= 2 and parts[0] in ("specifications", "docs"):
            return True, t
    return False, None


def shrink_guard(current_ids, manifest, repo_root=None):
    """PURE (no I/O beyond the spec-existence check, which takes an explicit
    repo_root so callers — check-gate's axis and the selfcheck — stay
    deterministic). Compares the CURRENT inventory id set to the blessed
    manifest. Returns (ok, removed, reason, authorized):
      ok         — False => RED (the guard blocks the tick).
      removed    — blessed host ids MISSING from the current inventory (a
                   shrink), derived FROM THE FIRST-BLESS ANCHOR SET so the
                   dropped host is named even when the top-level set already
                   forgets it; [] when there is no shrink.
      reason     — None when ok; otherwise a short machine-readable cause
                   ("un-blessed", "invariant", "anchor-invariant",
                   "no-anchor", "no-anchor-set", or "no-consistent-record"),
                   for the gate's BLOCKER line.
      authorized — the spec path cited by the authorizing re-bless record,
                   when one exists (ok, an authorized shrink); None otherwise.

    THE HASHED PAYLOAD IS THE AUTHORITY (fix1, D1+D2) and the FIRST-BLESS
    ANCHOR IS A TRIPWIRE (fix2 D2 + CONSOLIDATE-1 OBS-B option (i)). The
    manifest's TOP-LEVEL blessed_sha256/blessed_ids is the record of the
    ORIGINAL bless: the guard ASSERTS the manifest invariant

        canonical_sha(blessed_ids) == blessed_sha256

    and fails closed if it does not hold (trimming blessed_ids while the sha
    stays breaks it -> RED; the full drain hosts:[]/blessed_ids:[] with a
    stale sha breaks it too). The guard ALSO asserts the anchor invariant

        canonical_sha(first_blessed_ids) == first_blessed_sha256

    (OBS-B option (i): the anchor set is self-checking; a mismatch fails
    closed, reason "anchor-invariant"), and derives the removed-set FROM THE
    ANCHOR SET (first_blessed_ids - current inventory ids) — NEVER from the
    mutable top-level record — so a dropped host is named on every path
    including a deliberate rewrite the top level already forgets (c3 D3).
    The anchor is DATA in the writable manifest (a tripwire, not an
    immutability authority): a missing first_blessed_sha256 fails closed
    (reason "no-anchor"), a missing or empty first_blessed_ids fails closed
    (reason "no-anchor-set"). The top-level bless_note is prose and is NEVER
    read as authorization. Any inventory-sha mismatch (the current inventory
    differs from the blessed set) that is a SHRINK is RED unless a NEWER
    consistent bless record authorizes it: a blessed_records entry whose
    blessed_sha256 is the "new sha" (== the current inventory sha), whose
    blessed_ids reproduce that sha ("hashes consistently"), and whose
    bless_note cites a spec path that EXISTS in one of the three real spec
    trees (OBS-C: no citation -> no deletion). Pure growth (no host removed)
    off the first bless (blessed_sha256 == the anchor) is allowed and is
    re-blessed by the item that added the host.
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
    # MANIFEST INVARIANT (fix1, D1): the sha is the authority. The top-level
    # blessed_ids record MUST reproduce blessed_sha256. If it does not —
    # trimmed/edited while the sha stays, or a drained list with a stale sha —
    # the manifest is untrusted and the guard fails closed BEFORE trusting any
    # part of it. This is exactly the case that killed the D1 drain.
    if canonical_sha(blessed_ids) != blessed_sha:
        return False, ["<manifest invariant broken: blessed_sha256 != "
                       "canonical_sha(blessed_ids)>"], "invariant", None
    # FIRST-BLESS ANCHOR (fix2 D2 + CONSOLIDATE-1 OBS-B option (i)): the sha
    # AND id set of the ORIGINAL bless, carried as DATA in the manifest
    # (a tripwire, not a guard constant and not an immutability authority).
    anchor_sha = manifest.get("first_blessed_sha256")
    anchor_ids = manifest.get("first_blessed_ids")
    if not isinstance(anchor_sha, str) or not anchor_sha:
        return False, ["<first-bless anchor missing: no first_blessed_sha256 "
                       "to tripwire the top-level bless>"], "no-anchor", None
    if not isinstance(anchor_ids, (list, tuple)) or not anchor_ids:
        return False, ["<first-bless anchor set missing: no first_blessed_ids "
                       "to derive the removed-set>"], "no-anchor-set", None
    # ANCHOR INVARIANT (OBS-B option (i), §4.3.2): the anchor set must
    # reproduce the anchor sha — the anchor set is self-checking.
    if canonical_sha(anchor_ids) != anchor_sha:
        return False, ["<anchor invariant broken: first_blessed_sha256 != "
                       "canonical_sha(first_blessed_ids)>"], "anchor-invariant", None
    anchor = set(anchor_ids)
    # removed is derived FROM THE ANCHOR SET (OBS-B option (i), §4.3.4), not
    # from the mutable top-level record — so a dropped host is named on every
    # path, including a deliberate rewrite the top level already forgets.
    removed = sorted(anchor - set(cur))
    if blessed_sha == anchor_sha:
        if cur_sha == anchor_sha:
            # The current inventory IS the first-bless set (invariant-checked
            # above). No change -> green.
            return True, [], None, None
        if not removed:
            # Pure GROWTH off the first bless (the top-level is untouched):
            # not a shrink. Allowed (the item that added the host re-blesses).
            return True, [], None, None
    # HERE (and ONLY here): the blessed set changed — the top-level
    # blessed_sha256 deviates from the first-bless anchor, and/or the current
    # inventory differs from the top-level blessed set (a SHRINK: blessed
    # hosts missing, or a CONSISTENT top-level rewrite the inventory now
    # matches). RED unless a NEWER consistent bless record authorizes the
    # CURRENT set:
    #   blessed_records entry whose blessed_sha256 is the "new sha" == the
    #   current inventory sha, whose blessed_ids reproduce that sha (hashes
    #   consistently), and whose bless_note cites a spec that EXISTS in one
    #   of the three real spec trees (OBS-C: no citation -> no deletion).
    for rec in _bless_records(manifest):
        rec_ids = rec.get("blessed_ids")
        rec_sha = rec.get("blessed_sha256")
        if not isinstance(rec_ids, (list, tuple)):
            continue
        if rec_sha is None or rec_sha != cur_sha:
            continue          # the record's "new sha" must match the current set
        if canonical_sha(rec_ids) != rec_sha:
            continue          # record does not hash consistently
        cited, path = spec_cited(rec.get("bless_note"), repo_root)
        if cited:
            return True, removed, None, path
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
            "anchor-invariant": "the anchor invariant FAILED "
                         "(canonical_sha(first_blessed_ids) != "
                         "first_blessed_sha256 — the first-bless anchor set "
                         "does not reproduce the anchor sha)",
            "un-blessed": "the manifest is un-blessed (no blessed_sha256)",
            "no-anchor": "the manifest carries no first-bless anchor sha "
                         "(first_blessed_sha256) — the tripwire cannot pin the "
                         "top-level bless to the original first bless",
            "no-anchor-set": "the manifest carries no first-bless anchor set "
                         "(first_blessed_ids) — the removed-set cannot be "
                         "derived from the anchor",
            "no-consistent-record": "no NEWER consistent re-bless record "
                         "(a blessed_records entry whose blessed_sha256 "
                         "equals the current inventory sha, whose blessed_ids "
                         "reproduce that sha, and whose bless_note cites a "
                         "spec path that EXISTS in one of the three real spec "
                         "trees) authorizes this state",
        }.get(cause_key, cause_key)
        print("BLOCKER: the chat-host inventory changed without an authorized "
              "re-bless — %s (Change 3: a deletion is allowed ONLY with a "
              "re-blessed blessed_sha256 whose id record reproduces it AND a "
              "spec path in the re-bless record's bless_note that exists in "
              "a real spec tree)" % cause)
        if removed:
            print("  removed/changed host(s): %s" % removed)
        print("SHRINK-GUARD red")
        return 1
    if removed:
        print("SHRINK-GUARD green (current sha=%s; %d blessed host(s) removed "
              "— authorized by re-bless record citing spec %s)"
              % (canonical_sha(cur), len(removed), authorized))
    else:
        print("SHRINK-GUARD green (current sha=%s; no blessed host dropped)"
              % canonical_sha(cur))
    return 0


if __name__ == "__main__":
    sys.exit(main())
