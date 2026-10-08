# Corpus moat relocation — private data remote + leak quarantine

Date: 2026-09-19. Owner: architect-q38. Predecessor work: `.hermes/plans/2026-09-18_204728-vendor-pdf-corpus-subgraph-proposals.md` (waves 1-5 complete, HEAD `e960fa8b`).

## Goal

Put moat material where the moat lives — a private, cl-appliance-owned git remote for the lab-data repo — and stop the public open-source repo (`github.com/brad-usredoxlabs/computable-lab`, confirmed public: raw.githubusercontent fetch returns 200) from tracking any derived corpus/training artifacts.

## Realization (Brad, 2026-09-19, verified against the repo)

- `computable-lab` is the open-source project. The corpus-intake *machinery* (schemas, extractors, `server/src/protocol-intake/`, review UI) legitimately lives there — it's the producer.
- The *output* of that machinery — decision trees, subgraph proposals, accepted event graphs, adoption/patch history — is the training moat and must not sit in the public repo.
- Brad's correction, binding: **"Don't move it just because I said. We really only need moat material in the moat."** Do not relocate things that are not moat material (public vendor PDFs, the pipeline's config, test fixtures). Moving non-moat stuff out of OSS would break the open-source project for no gain.

## Classification (decided — apply this table, do not re-litigate)

| Item | Location today | Moat? | Action |
|---|---|---|---|
| PDT/SGP/EVG intake records | data worktree `~/.computable-lab/worktrees/main/records/` (already) | YES | Stay there; push worktree to new private remote |
| Intake run report `artifacts/foundry/intake/latest-run.json` + crawl PDFs + sidecars | worktree `artifacts/foundry/` (untracked in data repo — `git ls-files artifacts` = 0) | The PDFs are re-downloadable vendor docs (NOT moat); the run report + record set are | Leave PDFs on disk as cache; never commit them anywhere; records carry the moat via the remote push |
| `artifacts/**` derived foundry output in the **public code repo** (adoption, patch-specs, patch-reports, patch-critic, code-patches, event-graphs, execution-scale, review-index, rerun, stalled, stalls, manifests, segments, text, metrics, queues, architect, assumptions, browser-review, compiler, material-context, event-editor-fixit) | tracked, ~540 files | YES (our correction/fix history = training signal) + it is lab data, not code | **Untrack** with `git rm -r --cached` (files stay on disk for the other live session), gitignore `artifacts/`. Do NOT migrate legacy kanban-era files to the data repo — they reference dead `computable-foundry` paths; local disk copy is enough (YAGNI) |
| `artifacts/pdfs/*.pdf` (10 tracked copies duplicating `resources/vendor_pdfs/`) | tracked in public repo | No (public vendor manuals) | Untrack in the same sweep (it's under `artifacts/`) |
| `resources/vendor_pdfs/` (10 PDFs incl. Zymo golden used by 9 test files, Bulletin_6816 used by extractionE2E) | tracked in public repo | No — public vendor manuals; tests depend on them | **KEEP in public repo** (Brad's call). `resources/` untouched |
| `config/corpus-intake/topics.yaml` | tracked in public repo | No — the pipeline is OSS and needs its data file to run at all (canon: business logic is data; hard boundary: no hidden config) | **KEEP** |
| Journal-article junk (doi.org/PMC/Springer PDFs + sidecars + their zero-axis PDTs) from the mis-crawled first nightly | worktree `artifacts/foundry/pdfs/` + `records/protocol-decision-tree/PDT-vendor-protocol-doi-org-*` etc. | No — copyrighted paywalled content, and dead weight | **DELETE** (this discharges the cleanup decision left pending in the 2026-09-19 05:33 session) |
| `corpus-service` (prompt→confirmed-EVG pairs, "THE MOAT" service in `../cl-appliance/services/corpus-service/`) | exists, Python/FastAPI, not deployed, no ansible wiring | YES | **No code changes this plan** (Brad chose "private git remote, cheapest path, no service code"). It stays as designed; the git remote is the durability mechanism for now |

## Current context (verified 2026-09-19 ~10:00)

- Public repo HEAD: `e960fa8b fix(schema): PDT sourcePdf carries the vendor manual version`. Working tree **shared with Brad's other live session** (intake/equipment workstream) — many files show as modified; do not touch anything outside the listed paths, and never run state-changing git (`stash`/`reset`/`checkout`) beyond the exact commands below.
- Lab data = embedded-git worktree `/home/brad/.computable-lab/worktrees/main`, origin = local bare `/home/brad/.computable-lab/repos/main.git`. No second remote. 25 PDT + 84 SGP records on disk.
- Nightly: Hermes cron `corpus-intake-nightly` (job 334934efd080, 03:00, no_agent) → `~/.hermes/profiles/architect-q38/scripts/corpus-intake-nightly.sh` → `npm run corpus:intake -w server`. Last full run ended `ok:false` (3 `tree_validation_failed` since fixed by `e960fa8b`).
- GitHub: `gh` CLI is NOT authenticated on this box (`gh repo view` refused). `brad-usredoxlabs/cl-appliance` is already private (raw fetch 404); `brad-usredoxlabs/computable-lab` is public (raw fetch 200).
- Data repo has **no** `.gitignore` and tracks nothing under `artifacts/` — the crawl PDFs are untracked working files there.

## Architecture

Three moves, no schema/service/TS behavior changes:

1. **Private moat remote.** Create private repo `brad-usredoxlabs/cl-corpus` (sibling of cl-appliance in the org). Add it as remote `moat` to the data worktree; push after every successful nightly. The bare repo `main.git` stays the app's origin (app behavior untouched).
2. **Public repo goes code-only.** Untrack everything under `artifacts/` (one `git rm -r --cached` sweep + `.gitignore` entry). Tests are unaffected — every test fixture reads `resources/vendor_pdfs/`, not `artifacts/` (verified: grep of test files shows only `resources/vendor_pdfs/...` paths).
3. **Junk purge + green run.** Delete the mis-crawled journal-article PDFs, sidecars, and their zero-axis PDTs from the worktree, then re-run the nightly to a demonstrably `ok:true` result and push.

## Prerequisite (Brad does this — 2 minutes, hard blocker for Wave 1)

Create the private repo (or authenticate gh: `gh auth login`, then the implementer can do it):

```
gh repo create brad-usredoxlabs/cl-corpus --private
```

Do not fabricate a substitute location if this is missing — stop and ask (hard boundary).

---

## Wave 1 — private moat remote + push-on-green nightly

### Task 1.1 — add the remote and push the existing corpus

```bash
cd /home/brad/.computable-lab/worktrees/main
git remote add moat git@github.com:brad-usredoxlabs/cl-corpus.git
git push moat main
```

Expected: new branch `main` on the remote. Note: the worktree currently has ~173 uncommitted changes (mostly `D records/access-policy/ACL-*` deletions from the other session's work). Commit them first with a neutral message so the pushed snapshot is clean:

```bash
git add -A && git commit -m "Checkpoint before moat remote cutover"
```

Verify:

```bash
git -C /home/brad/.computable-lab/worktrees/main ls-remote moat
# expected: one refs/heads/main line
```

### Task 1.2 — push after green nightly (script only, no TS)

Edit `~/.hermes/profiles/architect-q38/scripts/corpus-intake-nightly.sh`. Replace the final two lines

```bash
npm run corpus:intake -w server 2>&1 | tail -40
exit "${PIPESTATUS[0]}"
```

with:

```bash
npm run corpus:intake -w server 2>&1 | tail -40
rc="${PIPESTATUS[0]}"
# Moat durability: lab-data records (PDT/SGP/EVG) pushed to the private
# cl-corpus remote only on a green crawl — a red run must not pollute the moat.
if [ "$rc" -eq 0 ]; then
  ( cd /home/brad/.computable-lab/worktrees/main \
    && git add -A \
    && git diff --cached --quiet || git commit -m "corpus-intake nightly $(date -u +%F)" \
    ; git push moat main ) \
    || echo "corpus-intake: moat push FAILED (records local only)"
fi
exit "$rc"
```

Verify (syntax + dry logic, no push): `bash -n ~/.hermes/profiles/architect-q38/scripts/corpus-intake-nightly.sh` → exit 0, no output.

### Task 1.3 — commit pointer in the code repo? No.

Nothing in `computable-lab` references the moat remote — the app's git config for the data repo is unchanged (`origin` = local bare repo). The remote lives only in the worktree's git config. This is deliberate: an OSS deployment has no business knowing the moat URL. Verify: `grep -rn cl-corpus /mnt/vast/home/brad/git/computable-lab --exclude-dir=.git` → no matches.

---

## Wave 2 — public repo goes code-only (untrack artifacts)

### Task 2.1 — RED: prove tests don't read artifacts/

Before untracking, prove the assertion the whole wave rests on:

```bash
cd /mnt/vast/home/brad/git/computable-lab
grep -rn "artifacts/" server/src --include='*.test.ts' | grep -v artifacts/foundry | head
```

Expected: **no lines** (all test fixture paths are `resources/vendor_pdfs/...`; crawl paths are runtime-relative, never literals in tests). If lines appear, STOP — those fixtures must move to `resources/` or become `it.skipIf(!existsSync(...))`, and that becomes a sub-task before proceeding.

### Task 2.2 — untrack, keep on disk

```bash
cd /mnt/vast/home/brad/git/computable-lab
git rm -r --cached artifacts
```

Expected: ~540 `rm 'artifacts/...'` lines. Files remain on disk (the other live session's working copies are untouched).

### Task 2.3 — gitignore

Append to `.gitignore` (after the existing `server/artifacts/` line at :25):

```
# Lab/corpus data never belongs in the code repo — it lives in the embedded-git
# data worktree, mirrored to the private cl-corpus remote (the moat).
artifacts/
```

Verify: `git status --short -- artifacts | head` → empty (not even `??`).

### Task 2.4 — GREEN: full suite still passes

```bash
npm run typecheck -w server
npm run test:run -w server
```

Expected: both pass exactly as they did before the sweep (the Zymo golden tests load `resources/vendor_pdfs/_d4302_d4306_d4308_zymobiomics-96_magbead_dna_kit.pdf`, untouched). If anything regresses it means a non-test consumer reads `artifacts/` at import time — find it with the failing path, do NOT re-track the file; fix the consumer to resolve against the workspace root.

Commit: `git add -A && git commit -m "chore: stop tracking lab artifacts in the OSS repo (data lives in the worktree; moat mirrored privately)"`

### Task 2.5 — confirm the public repo surface

```bash
git ls-files | grep -c '^artifacts/'   # expected: 0
git ls-files resources/vendor_pdfs | wc -l   # expected: 10
git ls-files config/corpus-intake | wc -l    # expected: 1
```

---

## Wave 3 — journal-article junk purge + demonstrably green nightly

### Task 3.1 — enumerate the junk (read-only first)

Junk = anything the pre-fix crawl pulled from journal hosts instead of vendor-manual hosts: file/record names containing `doi-org`, `pmc-ncbi-nlm-nih-gov`, `link-springer`.

```bash
cd /home/brad/.computable-lab/worktrees/main
ls artifacts/foundry/pdfs/ | grep -cE 'doi-org|pmc-ncbi|link-springer'          # expect: odd multiple of 3 (pdf + .download.yaml + .procurement.yaml each)
ls records/protocol-decision-tree/ | grep -cE 'doi-org|pmc-ncbi|link-springer'  # expect: ~13 (zero-axis trees from journal docs)
ls records/subgraph-proposal/ | grep -E 'doi-org|pmc-ncbi|link-springer' | wc -l # expect: 0 (they yielded no proposals)
ls /mnt/vast/home/brad/git/computable-lab/artifacts/foundry/pdfs/ | wc -l        # stale pre-relocation crawl copies in the CODE repo
```

Record the three worktree counts in your final report — they're the numbers the purge is judged on.

### Task 3.2 — purge (journal hosts only; vendor trees are NOT junk)

```bash
cd /home/brad/.computable-lab/worktrees/main
find artifacts/foundry/pdfs -name '*.pdf*' \( -name '*doi-org*' -o -name '*pmc-ncbi-nlm-nih-gov*' -o -name '*link-springer*' \) -delete
git rm -- records/protocol-decision-tree/ 2>/dev/null; git ls-files records/protocol-decision-tree | grep -E 'doi-org|pmc-ncbi|link-springer' | xargs -r git rm --
git add -A && git commit -m "chore(intake): purge mis-crawled journal-article corpus material"
git push moat main
```

Also delete the stale code-repo crawl dir (untracked, pre-relocation, journal junk):

```bash
rm -rf /mnt/vast/home/brad/git/computable-lab/artifacts/foundry
```

Verify:

```bash
ls /home/brad/.computable-lab/worktrees/main/records/protocol-decision-tree | grep -cE 'doi-org|pmc-ncbi|link-springer'   # expected: 0
ls /home/brad/.computable-lab/worktrees/main/artifacts/foundry/pdfs | grep -cE 'doi-org|pmc-ncbi|link-springer'            # expected: 0
ls /home/brad/.computable-lab/worktrees/main/artifacts/foundry/pdfs | wc -l   # expected: vendor-manual PDFs only
```

### Task 3.3 — force the 3 previously-failed docs to re-propose, then nightly green

The fix (`e960fa8b`, PDT sourcePdf version) went in after those docs' PDTs were written; a plain re-run would `tree_exists`-skip them and prove nothing. Delete exactly the three PDTs whose run reported `tree_validation_failed` (identify by: PDTs whose `sourcePdf` lacks `version`):

```bash
cd /home/brad/.computable-lab/worktrees/main
grep -rL '^  version:' records/protocol-decision-tree/*.yaml | grep vendor-protocol   # these are the version-less ones — eyeball the list, then:
xargs -a /tmp/pdt-list.txt git rm --    # after saving the eyeballed list to /tmp/pdt-list.txt
git commit -m "chore(intake): drop version-less PDTs so the schema fix re-materializes them"
```

Then run the nightly end-to-end (this also exercises Task 1.2's push path for real):

```bash
bash ~/.hermes/profiles/architect-q38/scripts/corpus-intake-nightly.sh; echo "rc=$?"
```

Expected: `rc=0`; the JSON report shows `"ok": true` and `proposals>0`; `artifacts/foundry/intake/latest-run.json` has `"ok": true`; a new commit exists on the moat remote (`git -C /home/brad/.computable-lab/worktrees/main log moat/main -1 --oneline` shows the nightly commit). Per the intake-pipeline skill, verify by **records on disk, not the report**: the three re-materialized `PDT-*.yaml` must exist with non-empty `activeStepIds` in their SGP children.

---

## Out of scope (explicit)

- No corpus-service code, no ansible/roles wiring, no deployment of port 8790 (Brad's "no service code" call; the service's docstring already defines the future POST seam).
- No git history purge on the public repo. `artifacts/` content stays visible in past commits on GitHub. **Open question for Brad:** if the historical foundry artifacts (adoption decisions, patch specs) matter as moat on GitHub-history terms too, that's a separate force-push-plus-rewrite operation on `computable-lab` with a coordination freeze (other live session, kanban pipeline, any forks). The PDFs in history are public vendor manuals; not a leak.
- No relocation of intake machinery code into `../cl-appliance` (producer stays in OSS — that's the point of the split).
- Do NOT touch anything the intake/equipment session has modified in the working tree; the only git operations allowed are the exact ones listed.

## Risks

1. **Shared working tree** (memory: HEAD advances mid-session). Re-run `git log --oneline -1` and `git status --short -- artifacts` immediately before Task 2.2; if another session re-added artifacts, re-enumerate the sweep.
2. `git rm -r --cached artifacts` while the other session's tooling writes under `artifacts/` — safe (`--cached` only untracks; disk untouched), but the other session may re-`git add` some files; re-check after commit.
3. SSH push from this box to GitHub — verify `ssh -T git@github.com` early; if HTTPS-only, use `https://github.com/brad-usredoxlabs/cl-corpus.git` with whatever credential helper exists. If neither works, that's a blocker to report, not a reason to pick a different remote.
4. Nightly cron fires at 03:00 with the *edited* script — Task 1.2's `bash -n` gate plus the real manual run in Task 3.3 must both pass before the turn ends, or the cron gets a broken script overnight.
5. Task 3.3's `grep -rL '^  version:'` heuristic could catch a legitimately version-less vendor manual; eyeball the printed list before deleting (command intentionally pauses there).
