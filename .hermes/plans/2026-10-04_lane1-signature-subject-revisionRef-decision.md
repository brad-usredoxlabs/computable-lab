# Lane-1 architect decision — `subject.revisionRef` / `subject.contentHash` undeclared in signature.schema.yaml

- **Date**: 2026-10-04 (EDT)
- **Task**: QMS-6B (integrated browser gate) — last gate of the lane-1 QMS campaign
- **Request**: `.hermes/plans/2026-10-04_lane1-signature-subject-revisionRef-decision-request.md`
- **Trunk state verified**: `cl/integration-1` @ `e4c76142`
- **Decision**: **Option A — declare the two fields**, with ONE correction to the drafted edit shape
  (the `$ref` path in the request is wrong and does not compile; see §2).

---

## 1. Verification of the cited facts (all confirmed by reading the trunk)

| Request claim | Verified |
|---|---|
| Handler writes the fields | `server/src/api/handlers/SignatureHandlers.ts:95` — `const signedRevision = { revisionRef: revisionRef(revision.recordId), contentHash: revision.payload.contentHash };`, spread into `subject` at `:117-123` alongside `recordId`, optional `gitCommit`/`lifecycleId`/`targetState`. Reauth (`:86-90`) precedes validation, so the live 422 is genuinely the schema check. |
| `revisionRef(id)` shape | `server/src/revisions/RecordRevisionService.ts:36` — `{kind:'record', type:'record-revision', id}` — exactly `schema/core/datatypes/revision-ref.schema.yaml` (which additionally constrains `id: ^REV-[A-F0-9]+$`; the generator at `:65` is `REV-` + uppercase hex, so every minted ref satisfies the datatype). |
| `contentHash` shape | `RecordRevisionService.ts:23` — `createHash('sha256').update(canonical(value)).digest('hex')` → **raw lowercase 64-hex**, no `sha256:` prefix. |
| Schema declares neither | `schema/governance/signature.schema.yaml:50-63` — `subject` has `additionalProperties: false` and only `recordId`, `gitCommit`, `lifecycleId`, `targetState`. Confirmed the 422 mechanism. |
| Provenance | `git log -- schema/governance/signature.schema.yaml` = only `56740422`; the integrity merge `81454a4e` touched `SignatureHandlers.ts` (+20) and not the schema. Same shape as the draft-copy defect I ruled in-scope on 2026-10-04. |
| Word of record | `docs/qms-manual-testing-cheatsheet.md:145-147` — "New signatures carry `subject.revisionRef` and `subject.contentHash`; `subject.gitCommit` is populated only after comparing…". The fields are the signed-content evidence; this is a missing **declaration**, not a design choice. `:149-150` adds: "Existing signatures are preserved" — which bears on requiredness (§2) and legacy rows (§5). |

## 2. The EXACT edit shape (chosen Option A, corrected)

Add to `schema/governance/signature.schema.yaml`, inside `subject.properties` (after `targetState`, keeping
`additionalProperties: false` and `required: [recordId]` exactly as they are — the two new fields are
**optional**, not required):

```yaml
      revisionRef:
        $ref: "./datatypes/revision-ref.schema.yaml"
      contentHash:
        type: string
        pattern: "^[a-f0-9]{64}$"
```

**CRITICAL correction to the request's draft**: the request proposed `$ref: ../core/datatypes/revision-ref.schema.yaml`
(file-relative from `schema/governance/`). **That path does not work.** Every schema in this repo carries an
absolute `$id` in a flat namespace — signature is
`https://computable-lab.com/schema/computable-lab/signature.schema.yaml`, the datatype is
`https://computable-lab.com/schema/computable-lab/datatypes/revision-ref.schema.yaml`. Ajv resolves `$ref`
against the **`$id`**, not the file location, so the correct relative ref is `./datatypes/revision-ref.schema.yaml`.
I compiled both variants against the repo's own toolchain (Ajv2020 strict + ajv-formats, schemas registered by
`$id` exactly as `server.ts:348-375` and `governanceSchemas.test.ts:22-34` do):

- `$ref: "../core/datatypes/revision-ref.schema.yaml"` → **compile error**: `can't resolve reference … from id https://computable-lab.com/schema/computable-lab/signature.schema.yaml`. The fix as drafted would have broken every signature validation worse than the current bug (compile-time instead of write-time).
- `$ref: "./datatypes/revision-ref.schema.yaml"` + the `contentHash` pattern → **compiles; the handler's exact subject payload validates clean**.

`./datatypes/…` is also the established cross-directory convention: `schema/services/request.schema.yaml:73`
references `./datatypes/ref.schema.yaml` the same way, and `SchemaRegistry.normalizeRef`
(`server/src/schema/SchemaRegistry.ts:27-60`) resolves deps against `entry.id` (the `$id`), so the topological
load order (`server.ts:369`) adds the datatype before the signature — the dependency graph sees the edge correctly.

`contentHash` pattern **confirmed** as `^[a-f0-9]{64}$` (raw sha256 hex), matching the two existing declarations
of the same value: `schema/governance/record-revision.schema.yaml:13` and
`schema/core/form-draft-request.schema.yaml:20`. NOT a `sha256:`-prefixed form — nothing in the codebase emits
a prefixed hash. Verified negative: a `sha256:`-prefixed and an uppercase hash are both rejected.

`subject` **stays** `additionalProperties: false` — verified an unknown subject property is still rejected after
the edit.

## 3. Scope ruling: IN-SCOPE lane-1 repair — no Brad amendment

Identical class to the draft-copy defect ruled in-scope (Option B) in my 2026-10-04 decision: a merged server
contract (integrity merge `81454a4e`) writes fields the schema never declared, and the closed leaf schema makes
Ajv reject every write. The fix is **data-only** (one schema file), adds no policy (the word of record at
cheatsheet:145-147 already mandates exactly these fields), touches no product code, and does not weaken any
contract. This restores the declared contract to the approved one; it is not a change of intent. **No amendment needed.**

## 4. Rejected alternatives

- **(B) Drop `additionalProperties: false` on `subject`** — rejected, same as the draft-copy ruling: it is an
  escape that loosens a deliberately closed governance contract. Signatures are immutable GxP evidence; an open
  `subject` would let arbitrary payloads ride into signed records. Verified the closed form still works post-fix.
- **(C) Change `SignatureHandlers.ts` to stop writing the fields** — rejected on three grounds: the word of
  record names `subject.revisionRef`/`subject.contentHash` as *the* signed-content evidence (cheatsheet:145-147);
  removing them severs the signature→snapshot chain that `RecordRevisionService.read` (`:54-61`) uses to verify
  signed content; and it is product code, outside this lane's authority for this defect class.

## 5. Additional consequences found (beyond the request)

1. **Optional, never required.** Do NOT add `revisionRef`/`contentHash` to `subject.required`. Cheatsheet:149-150
   ("Existing signatures are preserved, but signatures without a verifiable snapshot cannot authorize new
   transitions") means pre-existing SIG rows without the fields must remain readable/valid. Verified: the legacy
   minimal subject `{recordId, gitCommit}` still validates after the edit. The staleness enforcement belongs where
   it already lives (transition authorization), not in the schema.
2. **The request's fix spec must be RED-first against real Ajv**, mirroring QMS-6C: a test that mints a signature
   payload with the handler's exact `subject` shape through `AjvValidator` + the registry-loaded schema set and
   asserts zero errors — the existing `governanceSchemas.test.ts` (`:66-75`) only exercises the legacy shape,
   which is precisely why this shipped broken. The spec should extend that suite: accept the new subject shape;
   reject a `sha256:`-prefixed `contentHash`; reject a lowercase `REV-` id (the datatype's `^REV-[A-F0-9]+$` does
   this for free — do not restate the pattern inline); keep rejecting unknown subject properties.
3. **Latent repo-wide convention hazard, flagged, NOT in scope**: `schema/ingestion/extraction-spec.schema.yaml:11`
   (and any sibling using `../core/…`) uses the same file-relative style that just proved unresolvable under
   `$id`-relative resolution — its ref resolves to `…/schema/core/common.schema.yaml`, which is not the
   registered `$id` (`…/computable-lab/common.schema.yaml`). It survives only because that schema's refs are
   evidently never compiled on any exercised path. Do not fix it under QMS-6B; it deserves its own lane task
   (audit all cross-directory `$ref` strings against `$id`-relative resolution).
4. **No migration needed**: the handler already writes the fields; existing records lack them and stay valid. The
   only runtime effect of the schema change is that `POST /api/signatures` stops 422ing — unblocking surfaces
   6-9 and the three D6-D9 probes as the request states.

## Verification record (this decision)

- Read on trunk `e4c76142`: `signature.schema.yaml` (full), `revision-ref.schema.yaml` (full),
  `SignatureHandlers.ts:70-139`, `RecordRevisionService.ts:1-61`, `record-revision.schema.yaml`,
  `form-draft-request.schema.yaml`, cheatsheet `:140-150`, `SchemaRegistry.ts` (full), `SchemaLoader.ts` (full),
  `AjvValidator.ts` (full), `server.ts:330-400`, `governanceSchemas.test.ts`, git provenance of the two commits.
- Empirical compile/validate runs (Node + repo's Ajv2020, schemas registered by `$id` as the server does):
  drafted `../core/…` ref → compile error; final `./datatypes/…` + `^[a-f0-9]{64}$` shape → handler payload
  valid, negatives (prefixed hash, uppercase hash, lowercase REV id, unknown subject prop) rejected, legacy
  signature valid.
- No schema, code, or main-repo files were modified by this decision. `computable-lab` main checkout and
  ports :3001/:5174 untouched.

**Handoff**: orchestrator writes the RED-first fix spec per §2 + §5.2 and dispatches ONE cl-senior. If the spec's
RED probe contradicts anything compiled here on the served candidate, stop and re-escalate — do not improvise a
different `$ref` form.

DECISION: A — declare `revisionRef: {$ref: "./datatypes/revision-ref.schema.yaml"}` ($id-relative, NOT the drafted `../core/...` path, which fails Ajv compilation) and `contentHash: {type: string, pattern: "^[a-f0-9]{64}$"}` as optional properties in `subject`, keeping `additionalProperties: false`; in-scope lane-1 repair, no Brad amendment.
