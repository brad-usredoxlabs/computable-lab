# RULING — which governed write path admits a noun created from a document

Lane 2 · architect · 2026-11-13 · answers cards/architect-card-governed-write-admission-20261113.md
(the ruling it calls "20261112b" never existed as a document; this one replaces it)
Status: BINDING for lane 2. Unblocks the port leg of L2-NOUN-FROM-DOC-1. Extraction itself is
already merged and verified (f4987dc7); this ruling concerns only where the write happens.

## The question that was asked

`L2-NOUN-FROM-DOC-1` ends with "the draft becomes a record on accept". Which handler / verb does
that write go through, so the port leg can be briefed instead of waiting?

## The ruling

**No new handler. The write is the record-store create route that every dictated mint already uses,
and the capability that names it must resolve against a declared registry.**

1. The capability that this leg needs is **one governed-write capability**, not an agent tool and
   not a side effect: "mint this noun from an accepted proposal". It declares two output ports —
   the material *concept* record id and the *vendor-product* record id, which points at the concept
   through `material_ref` — and it carries `effects: [domain_mutation]`. The schema already forces
   the rest: `schema/workflow/capability-descriptor.schema.yaml:114-124` requires any capability
   whose effects contain `domain_mutation` to be `handler_kind: governed_write`.
2. **`handler_ref` must resolve against declared data, not against a string a prompt invented.**
   Add one small data file — `config/journey/governed-writes.yaml` — a registry of the governed
   write paths this system admits, each entry naming: the route identity used in
   `server/src/api/routes.ts`, the record kinds it may write, and the guards it runs (Ajv
   validation, lint, ownership/ACL). The noun-create capability references the entry for the
   record-create route (`POST /records` → `RecordHandlers.create` → `RecordStoreImpl`), which is
   the same path a dictated mint takes today (`app/src/shared/api/client.ts:2701-2705`).
   Load-time refusal for any `handler_ref` that is not in the registry — the same shape as the
   catalogue's existing refusal of a handler id that is not in `AGENT_ALLOWED_TOOLS`.
3. **The extractor never writes.** Document reading produces a *proposal* (shorthand plus a passage
   per field); the person accepts; the accept path calls the registered governed write. This keeps
   the standing rule intact: a model-origin write needs its own acceptance, and "AI creates" means
   executing an already-accepted compiled batch.
4. The capability declares `reconciliation: receipt_required` and
   `evidence: [governed_write_receipt]`, because two records land per accept and the receipt must
   name both ids. One human task may produce both records (one decision, two writes) — the human
   task contract carries the cardinality, and its completion kind is `governed_write`, never
   `versioned_selection` (`humanTaskCompletion.ts:58` already refuses that confusion).

## Why not something cheaper

An agent tool that "happens to write" is exactly what `capability-descriptor.schema.yaml:112-113`
forbids ("a domain mutation must go through a governed write path; an agent tool that happens to
write is not that path"). Adding a second write seam for documents would give the lab two ways to
create the same noun, with only one of them linted — the pile-of-parts failure again.

## Consequences for open work (binding)

- **L2-NOUN-FROM-DOC-1 port leg**: brief it now against (1)-(4). Deliverable is the capability
  descriptor + the registry entry + the admission test; no new route and no new write code.
- **L2-JOURNEY-CAPABILITY-CATALOGUE-1**: the registry is additive data; the four existing read-only
  capabilities are untouched, and their `handler_kind: agent_tool` stays correct.
- **Tests**: an unknown `handler_ref` is refused at load with a named diagnostic; a capability with
  `domain_mutation` and `handler_kind: agent_tool` is refused (schema, already true — pin it);
  an accept writes exactly two records and the receipt names both; a reject writes none.

## Not in scope

No direct store writes from the extractor, no batch endpoint invented for documents, and no change
to the accept route's own guards. If the accept path is later generalised, that is a new ruling.
