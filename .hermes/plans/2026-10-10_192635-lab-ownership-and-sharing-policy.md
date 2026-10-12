# Lab Ownership & Sharing Policy — project-scoped protocols, lab-shared resources, AI-editable defaults

Plan date: 2026-10-10
Repo: `/mnt/vast/home/brad/git/computable-lab` (npm workspaces: `server/` Fastify + `app/` React/Vite, `schema/` YAML, `records/` YAML)

---

## Goal

Give a lab one **declarative document** (`ownership-policy`) that says, per record kind, who owns a new record, its default visibility, whether it files into the active project, which roles may edit it and which share targets are legal — read by the server at creation/share time and editable by the AI chat and by humans.

---

## Current context / assumptions (all verified by reading the code — do not re-derive)

The ownership substrate already exists. **Do not build a second one.** What exists:

| Thing | Where | Notes |
| --- | --- | --- |
| Per-record ACL record | `schema/identity/access-policy.schema.yaml` | `kind: access-policy`, `recordId: ACL-*`, `resourceRef`, `visibility: private\|shared\|public`, `ownerUserId: USR-*`, `grants[{principalType: user\|group, principalId, role}]`, roles `owner/admin/editor/operator/qa/viewer` |
| ACL evaluator (pure) | `server/src/security/AccessControlService.ts` | `canAccess({policy,userId,action})`; `ROLE_ACTIONS` maps role → {read,write,operate,quality-review,admin}; groups expanded via `groupContainsUser` |
| ACL orchestrator | `server/src/security/AuthorizationService.ts` | `canAccess`, `ensureOwnerPolicy` (stamps a **hardcoded `visibility: 'private'`** policy for every non-identity kind), `resolveEffectivePolicy` (direct policy, else inherit from parent via run/plannedRun/experiment/study links), `backfillOwnerPolicies`, `POLICY_ROOT_KINDS` (declared, unused) |
| Groups | `schema/identity/group.schema.yaml`, `AccessControlService.GroupRecord` | lab-local, `memberUserIds`, nested `memberGroupIds` |
| Compiler policy scopes | `server/src/policy/types.ts`, `PolicyProfileService.ts` | **the house pattern to copy**: scope order `organization → lab → project → run`, narrowest wins, every resolved setting carries an `origin` trace |
| Lab settings API | `server/src/api/handlers/LabSettingsHandlers.ts`, route `GET /settings/lab` (`server/src/api/routes.ts:590-593`), wired at `server/src/server.ts:846` | reads `appConfig.lab` + policy bundle service |
| Sharing API | `server/src/api/handlers/IdentityHandlers.ts` — `GET|PUT /records/:id/access-policy` (routes at `routes.ts:274-275`) | `PUT` requires `admin` on the record; validates principal prefix (`USR-`/`GRP-`) |
| Sharing UI | `app/src/shared/sharing/ShareRecordDialog.tsx`, `useRecordVisibility.ts`, `VisibilityBadge.tsx`, `policyRoots.ts` | full dialog: visibility select, grant add/remove, inherited read-only view |
| API client | `app/src/shared/api/client.ts` | `getAccessPolicy`, `putAccessPolicy`, `listGroups`, `listUsers`, `getLabSettings` already exist (client.ts:1957-1971, 2850) |
| AI tool pattern | `server/src/mcp/tools/dualRegister.ts`; aggregator `server/src/mcp/tools/index.ts` | `dualRegister(server, registry, name, desc, zodShape, handler)` registers with MCP **and** the in-process `ToolRegistry` |
| Creation/identity | `server/src/api/handlers/RecordHandlers.ts` (`createRecord`) | stamps `payload.createdBy` + `meta.createdBy` from the session user, then calls `ensureOwnerPolicy`; `CreateRecordRequest = {schemaId, payload, message?}` (`server/src/api/types.ts:34`) |
| Filing | `POST /records/:id/file` (`TreeHandlers.fileRecord`), link filter `GET /records?studyId=` (`RecordHandlers.ts:230-246`), `links.{studyId,experimentId,runId}` indexed (`IndexManager.ts:48-103`) | "project" == `study` record; `PathConvention` nests only `artifact` + `event-graph` |

What is **missing** and is therefore the work:

1. No declarative defaults document. `ensureOwnerPolicy` hardcodes `visibility: 'private'` for *every* kind — a policy decision in TypeScript (violates the repo's "no hardcoded domain logic" rule).
2. No way to say "new `local-protocol` is creator-private **and** files into the active project".
3. No "share with the other project members" principal — grants are user/group only. Worse: a direct private policy **shadows** the parent project policy (`resolveEffectivePolicy` returns the direct policy first), so project-filed records are invisible to project members today.
4. No "lab/global" concept distinct from "public to any user", and no per-kind statement of what belongs to the lab (materials/instruments) vs the creator (drafts).
5. No AI-addressable surface for any of the above.

Assumptions: single-lab, single-tenant deployment (so `visibility: 'public'` **is** "the whole lab"); `study` is the project (UI calls it Project; `app/src/collections/ProjectCollectionView.tsx`); `npm`/`pnpm` both work, use `npm` in the commands below.

---

## Architecture / proposed approach

One new **record kind** `ownership-policy` holds the declaration (per-kind defaults: owner, visibility, filing, edit roles, allowed share targets, plus the lab owner user id and a fallback rule), resolved by a new pure `OwnershipPolicyService` that copies the origin-trace pattern of `PolicyProfileService`. `AuthorizationService` (stamping + evaluating) and the record-create path consume it, so the hardcoded `'private'` and the "private shadows the project" behaviour become declarations. Sharing gains one new principal type `project` (a grant `{principalType: project, principalId: 'STU-xxx'}` = "members of that project"), and the AI edits the document through one dual-registered tool plus the existing ACL-admin gate.

Resolution order (mirrors `POLICY_SCOPE_ORDER`, v1 implements `lab` only):

```
kind-specific rule in the lab document
  └─ missing → document.fallback rule
       └─ missing → no document → ensureOwnerPolicy stamps nothing (today's "no policy = open")
```

---

## Pinned decisions (do not re-litigate; each is a deliberate, recorded choice)

- **D1 — Reuse `access-policy`.** No new ACL system, no `visibility` on every record payload. Record-level policy stays in `access-policy` records; the new document only supplies *defaults* and *allowed targets*.
- **D2 — "Lab/global" = `visibility: 'public'`.** In a single-tenant lab, public means every authenticated user may read; writes/operate still need grants. No new visibility enum value in v1. (Multi-lab later → add `'lab'` with an org/lab id.)
- **D3 — Project membership = the project record's own ACL.** A `project` grant means: the user is the study's owner, is listed in the study's grants (directly or via a nested group), or the study is `public`. No `members[]` field is added to `study.schema.yaml`.
- **D4 — Instrument exclusivity is expressible today.** "This grant-funded instrument is only for project A, only Dr. X may operate it" = the instrument record's `access-policy` with `visibility: private` + explicit `operate` grants. The document supplies the *default* for `instrument`; per-instance exceptions are ACL grants, not document entries. **No per-resource grants in the document.**
- **D5 — Busy/available ("centrifuge not already running") is OUT OF SCOPE.** That is scheduling/availability, not access. Recorded as an open question (§8), not built here.
- **D6 — The document is data, in git.** Lives in the record store as `OWN-LAB-DEFAULT` (seeded in `records/seed/identity/`), not in `config.yaml`, because the AI must be able to edit it as a record and it must be versioned/auditable.
- **D7 — Edits to the document require `admin` on the document record** (existing ACL semantics), never a role hardcoded in TypeScript.
- **D8 — `editRoles` in v1 is descriptive** (what the UI offers when sharing, what the AI is told, lint-validated) — enforcement keeps using `AccessControlService.ROLE_ACTIONS`. Making the role→action matrix itself data-driven is a follow-up (§8, question 2).
- **D9 — No silent behaviour change.** The seeded document mirrors today's effective behaviour for knowledge/protocol kinds (creator-private). Lab-shared kinds are a declaration Brad reviews; re-stamping existing records is an explicit, `--dry-run`-by-default migration (T12).
- **D10 — A project has MULTIPLE users, always.** Nothing in this plan may assume a single named person. "Project members" is a *set*: the project (study) ACL's owner **plus** every user grant, every group grant (nested groups included), and — when the project is public — every lab user. The `project` principal (D3) is the only correct way to say "the other project members"; never enumerate members into a grant list, and never write a per-member grant when the project grant will do.
- **D11 — Defaults are evaluated PER CREATING USER.** `owner: creator` means the specific session user, so two scientists creating the same kind get two separate private records, each owned by its author. There is no shared "the project's copy" unless someone shares it.
- **D12 — "Lab-owned" must not mean "one person owns everything shared".** `ownerUserId` is single-valued, so a lab-owned kind also stamps `defaultGrants` declared on the rule (e.g. the lab's admin group with role `admin`). Without that, the big centrifuge would be editable only by the lab owner user — a bottleneck in a multi-user lab. A grant naming a group that does not exist is inert (never fabricated).
- **D13 — Concurrent editing safety is the QMS revision contract, not locking.** ACL `editor` on a project record is what lets several members work on it; the shipped revision/signature contract (approved/effective content locked, edits via `POST /records/:id/draft-copy`) is what stops them clobbering each other. This plan adds no second concurrency mechanism.

---

## Step-by-step tasks

Conventions for every task:
- Run server tests with `npm run test:run -w server -- <path-fragment>` from the repo root.
- Write the failing test first, run it, see it fail, implement, run it green, then commit with the message given.
- Never `git add -A`; stage the exact files named in the task.

---

### T1 — New schema trio for `ownership-policy`

Files (new): `schema/identity/ownership-policy.schema.yaml`, `schema/identity/ownership-policy.lint.yaml`, `schema/identity/ownership-policy.ui.yaml`

`schema/identity/ownership-policy.schema.yaml`:

```yaml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml"
title: "Ownership Policy"
description: >
  Declarative lab policy for ownership, sharing and filing defaults. One document
  per scope (v1: one lab-scope document). It declares defaults only — per-record
  exceptions live in access-policy records. Record kinds not listed here use
  `fallback`.

type: object
unevaluatedProperties: false
allOf:
- $ref: "./common.schema.yaml#/$defs/FAIRCommon"  # AMENDED 2026-10-11 per architect decision 2026-10-11_own-1-fixcycle-decision.md (2a): ../core/ dangles in $id-URL space; identity siblings use ./ form

required: [kind, recordId, title, scope, labOwnerUserId, fallback]

properties:
  kind:
    const: "ownership-policy"

  recordId:
    type: string
    pattern: "^OWN-[A-Z0-9][A-Z0-9_-]*$"

  scope:
    type: object
    additionalProperties: false
    required: [type, id]
    properties:
      type:
        type: string
        enum: [lab, project]
      id:
        type: string
        description: "Scope identifier. 'lab' for the lab document; STU-* for a project override."

  labOwnerUserId:
    type: string
    pattern: "^USR-[A-Z0-9][A-Z0-9_-]*$"
    description: "Owner stamped on records whose rule says owner: lab (the lab admin/manager user)."

  fallback:
    $ref: "#/$defs/KindRule"
    description: "Applied to any record kind with no entry in kindRules."

  kindRules:
    type: array
    description: "Per-kind defaults. At most one entry per kind."
    items:
      allOf:
      - $ref: "#/$defs/KindRule"
      - type: object
        required: [kind]
        properties:
          kind:
            type: string
            description: "Record kind, exactly as it appears in payload.kind (e.g. local-protocol)."
    uniqueItems: false

$defs:
  KindRule:
    type: object
    additionalProperties: false
    required: [owner, visibility, filedTo, editRoles, shareTargets]
    properties:
      kind:
        type: string
      owner:
        type: string
        enum: [creator, lab]
        description: "creator = the session user who created the record; lab = labOwnerUserId."
      visibility:
        type: string
        enum: [private, shared, public]
        description: "public = whole lab may read (single-tenant lab)."
      filedTo:
        type: string
        enum: [none, active-project]
        description: "active-project = stamp links.studyId from the creating request's project when absent."
      editRoles:
        type: array
        items:
          type: string
          enum: [owner, admin, editor, operator, qa, viewer]
        description: "Roles the lab offers when sharing this kind (descriptive in v1; see plan D8)."
      shareTargets:
        type: array
        items:
          type: string
          enum: [user, group, project, lab]
        description: "Legal share targets for this kind. 'lab' maps to visibility: public."
      defaultGrants:
        type: array
        description: >
          Grants stamped onto the record's access-policy at creation, so a
          lab-owned kind is administered by a GROUP (multi-user) rather than by
          labOwnerUserId alone. A principalId that does not resolve is inert.
        items:
          type: object
          additionalProperties: false
          required: [principalType, principalId, role]
          properties:
            principalType:
              type: string
              enum: [user, group, project]
            principalId:
              type: string
              description: "USR-* / GRP-* / STU-* per principalType."
            role:
              type: string
              enum: [owner, admin, editor, operator, qa, viewer]
      publishRole:
        type: string
        enum: [owner, admin, editor, operator, qa, viewer]
        description: "Optional: role required to publish this kind lab-wide."
```

`schema/identity/ownership-policy.lint.yaml`:

```yaml
# Lint rules for Ownership Policy records
lintVersion: 1
schemaId: "https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml"
rules:
  - id: "ownership-policy-requires-kind-rules"
    title: "An ownership policy should declare at least one kind rule"
    severity: "warning"
    scope: "record"
    assert:
      op: "nonEmpty"
      path: "$.kindRules"
    message:
      template: "Ownership policy '{{$.recordId}}' declares no kindRules (only the fallback applies)"
      paths: ["$.recordId"]
  - id: "ownership-policy-fallback-must-be-safe"
    title: "Fallback owner must be creator so unlisted kinds stay private"
    severity: "error"
    scope: "record"
    assert:
      op: "equals"
      path: "$.fallback.owner"
      value: "creator"
    message:
      template: "Fallback owner for '{{$.recordId}}' must be 'creator'"
      paths: ["$.recordId"]
```

`schema/identity/ownership-policy.ui.yaml`:

```yaml
# UI specification for Ownership Policy records
uiVersion: 1
schemaId: "https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml"

display:
  titleField: "$.title"
  icon: "shield"

form:
  layout: "sections"
  sections:
  - title: "Identity"
    fields:
    - path: "$.recordId"
      widget: "text"
      label: "Record ID"
      readonly: true
    - path: "$.kind"
      widget: "text"
      label: "Kind"
      readonly: true
      hidden: true
    - path: "$.title"
      widget: "text"
      label: "Title"
      required: true
  - title: "Scope"
    fields:
    - path: "$.scope.type"
      widget: "select"
      label: "Scope Type"
    - path: "$.scope.id"
      widget: "text"
      label: "Scope ID"
    - path: "$.labOwnerUserId"
      widget: "text"
      label: "Lab Owner User"
  - title: "Fallback"
    fields:
    - path: "$.fallback.owner"
      widget: "select"
      label: "Owner"
    - path: "$.fallback.visibility"
      widget: "select"
      label: "Visibility"
    - path: "$.fallback.filedTo"
      widget: "select"
      label: "Filed To"
  - title: "Kind Rules"
    fields:
    - path: "$.kindRules"
      widget: "array"  # AMENDED 2026-10-11 per architect decision 2026-10-11_own-1-fixcycle-decision.md (1a): "json" fails UISpecLoader whitelist + ui-v1 enum; kindRules is type:array, ArrayWidget is repo precedent
      label: "Kind Rules"
```

**Verification** (schema loader auto-discovers `schema/**/*.schema.yaml` via `loadAllSchemas(schemaDir)` at `server/src/server.ts:355`, so no manifest edit is needed):

> **Convention, don't get this wrong:** identity schemas live in `schema/identity/` but their `$id` is **flat** — e.g. `access-policy.schema.yaml` has `$id: https://computable-lab.com/schema/computable-lab/access-policy.schema.yaml` (no `/identity/` segment). Keep the new `$id`, the lint/ui `schemaId`s and `OWNERSHIP_POLICY_SCHEMA_ID` all exactly `https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml`; only the file path carries `identity/`.

```bash
npm run test:run -w server -- src/schema/ 2>&1 | tail -20
```
Expected: all existing schema tests still pass (exit code 0). No new test here yet — the validator test arrives with T4's seed record.

> **YAML reload trap (lane rule):** `tsx --watch` does NOT reload schema/lint/ui YAML. After any `.schema.yaml` / `.lint.yaml` / `.ui.yaml` edit, restart the stack you are verifying against (lane stack: `cl-lane-stack.sh 1 restart`; main dev stack: restart by exact PID, never `pkill`). A green test that ran before a restart proves only that the old YAML is valid.

Commit: `schema: add ownership-policy record kind (schema + lint + ui)`

---

### T2 — Register the kind in the repo-wide record union

File: `schema/core/record.schema.yaml` — add one line next to the other identity refs (after line 37, `- $ref: "../identity/access-policy.schema.yaml"`):

```yaml
- $ref: "../identity/ownership-policy.schema.yaml"
```

**Verification:**
```bash
search_files "ownership-policy.schema.yaml" schema/core/record.schema.yaml   # or: grep -n ownership-policy schema/core/record.schema.yaml
```
Expected: exactly one match.

Commit: `schema: include ownership-policy in the record union`

---

### T3 — Seed the default lab document

File (new): `records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml`

(Seed records are plain record payloads; same shape as other `records/seed/**` files. `records/seed` is loaded as the read-only seed corpus; the store resolves records from the repo's `records/` dir — put the file here first, then copy it into the live records dir during deployment, exactly like the other seeds.)

```yaml
kind: ownership-policy
recordId: OWN-LAB-DEFAULT
title: Lab Ownership & Sharing Policy
description: >
  Default ownership/sharing rules for this lab. New drafts (protocols, local
  protocols, claims, sequences) belong to their creator and are private until
  shared. Shared resources (materials, instruments, labware, vendor products)
  belong to the lab: any member may read them, only the lab owner/grantees may
  write or operate. Local protocols created inside a project file into that
  project.
scope:
  type: lab
  id: lab
labOwnerUserId: USR-LOCAL-ADMIN
fallback:
  owner: creator
  visibility: private
  filedTo: none
  editRoles: [owner, editor]
  shareTargets: [user, group, project, lab]
kindRules:
  # ---- personal drafts: creator-private; local protocols file into the project
  - kind: local-protocol
    owner: creator
    visibility: private
    filedTo: active-project
    editRoles: [owner, editor]
    shareTargets: [project, lab, user, group]
  - kind: protocol
    owner: creator
    visibility: private
    filedTo: none
    editRoles: [owner, editor]
    shareTargets: [lab, project, user, group]
    publishRole: owner
  - kind: sequence
    owner: creator
    visibility: private
    filedTo: none
    editRoles: [owner, editor]
    shareTargets: [lab, user, group]
  - kind: claim
    owner: creator
    visibility: private
    filedTo: none
    editRoles: [owner, editor]
    shareTargets: [lab, project, user, group]
  # ---- lab-shared physical resources: readable lab-wide, written by owner/admin.
  # `defaultGrants` stamps the lab admin GROUP as admin on every lab-owned record,
  # so a multi-user lab is not bottlenecked on the single labOwnerUserId above.
  # Create GRP-LAB-ADMINS (with its members) first; an unresolved group is inert.
  - kind: material
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
  - kind: material-spec
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
  - kind: material-instance
    owner: creator
    visibility: private
    filedTo: active-project
    editRoles: [owner, admin]
    shareTargets: [project, user, group]
  - kind: aliquot
    owner: creator
    visibility: private
    filedTo: active-project
    editRoles: [owner, admin]
    shareTargets: [project, user, group]
  - kind: instrument
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
  - kind: equipment
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
  - kind: labware
    owner: lab
    visibility: public
    filedTo: none
    editRoles: [owner, admin]
    shareTargets: [user, group, lab]
    defaultGrants:
      - { principalType: group, principalId: GRP-LAB-ADMINS, role: admin }
```

**Verification:** run the validator over the seed by adding the schema test in T4 (below); for now:
```bash
npm run test:run -w server -- src/validation/ 2>&1 | tail -20
```
Expected: pass (no regression).

Commit: `records(seed): default lab ownership & sharing policy`

---

### T4 — Schema/validation test for the new kind (TDD anchor)

File (new): `server/src/schema/OwnershipPolicySchema.test.ts` — copy the harness from `server/src/schema/AgentActionSchema.test.ts:17-32`:

```ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'identity/ownership-policy.schema.yaml',
] as const;

const OWNERSHIP_SCHEMA = 'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml';
const SEED_PATH = 'records/seed/identity/OWN-LAB-DEFAULT__lab-ownership-and-sharing.yaml';

async function load() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  const loaded = await loadSchemasFromContent(contents);
  const registry = createSchemaRegistry();
  registry.addAll(loaded.entries);
  return registry;
}

describe('ownership-policy schema contract', () => {
  it('accepts the seeded lab document', async () => {
    const registry = await load();
    const validator = createValidator(registry);
    const raw = await readFile(join(process.cwd(), SEED_PATH), 'utf8');
    const { parse } = await import('yaml');
    const payload = parse(raw);
    const result = await validator.validate({ schemaId: OWNERSHIP_SCHEMA, payload });
    expect(result.valid, JSON.stringify(result.errors)).toBe(true);
  });

  it('rejects a document without a safe fallback', async () => {
    const registry = await load();
    const validator = createValidator(registry);
    const payload = {
      kind: 'ownership-policy',
      recordId: 'OWN-BAD',
      title: 'Bad',
      scope: { type: 'lab', id: 'lab' },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
      fallback: { owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: [], shareTargets: [] },
    };
    const result = await validator.validate({ schemaId: OWNERSHIP_SCHEMA, payload });
    expect(result.valid).toBe(false);
  });
});
```

**Verify RED then GREEN** (the second assertion must fail against the lint rule in T1 if lint is wired; if `validator.validate` does not run lint, keep only the schema-shape assertion `expect(result.errors.length).toBeGreaterThan(0)` for `kindRule` needing `kind`):

```bash
npm run test:run -w server -- src/schema/OwnershipPolicySchema.test.ts
```
Expected after T1 + T3: `2 passed`. If the exact registry API differs (`add`/`addAll`), read `server/src/schema/SchemaRegistry.ts` and use the real method — do not guess.

Commit: `test(server): ownership-policy schema contract`

---

### T5 — `OwnershipPolicyService` (pure resolver) + tests

Files: new `server/src/security/OwnershipPolicyService.ts`, new `server/src/security/OwnershipPolicyService.test.ts`, new `server/src/test-support/MemoryRecordStore.ts`.

First the test-support stub (extract the class verbatim from `server/src/security/LocalAuthorization.test.ts:17-77` into `server/src/test-support/MemoryRecordStore.ts`, exported as `MemoryRecordStore`). Do **not** rewrite the existing test to use it (avoid churn).

Then the failing test:

```ts
// server/src/security/OwnershipPolicyService.test.ts
import { describe, expect, it } from 'vitest';
import { MemoryRecordStore } from '../test-support/MemoryRecordStore.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import {
  OWNERSHIP_POLICY_SCHEMA_ID,
  OwnershipPolicyService,
} from './OwnershipPolicyService.js';

function docEnv(): RecordEnvelope {
  return {
    recordId: 'OWN-LAB-DEFAULT',
    schemaId: OWNERSHIP_POLICY_SCHEMA_ID,
    payload: {
      kind: 'ownership-policy',
      recordId: 'OWN-LAB-DEFAULT',
      title: 'Lab policy',
      scope: { type: 'lab', id: 'lab' },
      labOwnerUserId: 'USR-LOCAL-ADMIN',
      fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
      kindRules: [
        { kind: 'local-protocol', owner: 'creator', visibility: 'private', filedTo: 'active-project', editRoles: ['owner', 'editor'], shareTargets: ['project', 'lab'] },
        { kind: 'instrument', owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: ['owner', 'admin'], shareTargets: ['user', 'group', 'lab'], defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }] },
      ],
    },
  };
}

describe('OwnershipPolicyService', () => {
  it('resolves a kind rule with its origin', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const rule = await service.ruleFor('instrument');
    expect(rule?.owner).toBe('lab');
    expect(rule?.visibility).toBe('public');
    expect(rule?.origin).toEqual({ policyRecordId: 'OWN-LAB-DEFAULT', source: 'kind' });
  });

  it('falls back for an unlisted kind', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const rule = await service.ruleFor('claim');
    expect(rule?.visibility).toBe('private');
    expect(rule?.origin.source).toBe('fallback');
  });

  it('resolves create defaults: lab-owned kinds use the lab owner user', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'instrument', creatorUserId: 'USR-BRAD' });
    expect(defaults?.ownerUserId).toBe('USR-LOCAL-ADMIN');
    expect(defaults?.visibility).toBe('public');
  });

  it('resolves create defaults: creator-owned kinds file into the active project', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-BRAD' });
    expect(defaults?.ownerUserId).toBe('USR-BRAD');
    expect(defaults?.filedTo).toBe('active-project');
  });

  it('returns null when no document is installed (no declared defaults)', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([]));
    expect(await service.ruleFor('protocol')).toBeNull();
    expect(await service.defaultsForCreate({ kind: 'protocol', creatorUserId: 'USR-BRAD' })).toBeNull();
  });

  it('carries the declared default grants (multi-user: the lab admin group)', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const defaults = await service.defaultsForCreate({ kind: 'instrument', creatorUserId: 'USR-BRAD' });
    expect(defaults?.grants).toEqual([{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }]);
  });

  it('evaluates creator-owned defaults PER USER — two authors get two private records', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    const a = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-A' });
    const b = await service.defaultsForCreate({ kind: 'local-protocol', creatorUserId: 'USR-B' });
    expect(a?.ownerUserId).toBe('USR-A');
    expect(b?.ownerUserId).toBe('USR-B');
    expect(a?.grants).toEqual([]);
    expect(b?.grants).toEqual([]);
  });

  it('reports the allowed share targets for a kind', async () => {
    const service = new OwnershipPolicyService(new MemoryRecordStore([docEnv()]));
    expect(await service.shareTargetsFor('instrument')).toEqual(['user', 'group', 'lab']);
  });
});
```

Run RED:
```bash
npm run test:run -w server -- src/security/OwnershipPolicyService.test.ts
```
Expected: module-not-found / all fail.

Implement `server/src/security/OwnershipPolicyService.ts`:

```ts
/**
 * OwnershipPolicyService — resolves the lab's declared ownership/sharing
 * defaults for a record kind from `ownership-policy` documents.
 *
 * The document is DATA; this service only reads it. It decides nothing: it
 * resolves declarations and reports each answer's origin so the UI and the AI
 * can explain WHY a record was made private / lab-visible / project-filed.
 */
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { AccessGrant, Visibility } from './AccessControlService.js';

export const OWNERSHIP_POLICY_KIND = 'ownership-policy';
export const OWNERSHIP_POLICY_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml';
export const DEFAULT_OWNERSHIP_POLICY_RECORD_ID = 'OWN-LAB-DEFAULT';

export type OwnershipScope = 'creator' | 'lab';
export type ShareTarget = 'user' | 'group' | 'project' | 'lab';
export type FiledTo = 'none' | 'active-project';

export interface KindRule {
  owner: OwnershipScope;
  visibility: Visibility;
  filedTo: FiledTo;
  editRoles: string[];
  shareTargets: ShareTarget[];
  /**
   * Grants stamped onto the new record's access-policy. The multi-user lever:
   * lab-owned kinds name an admin GROUP here so shared resources are not
   * administered by the single labOwnerUserId. Empty for creator-private kinds
   * (a new draft is granted to nobody — sharing is explicit).
   */
  defaultGrants: AccessGrant[];
  publishRole?: string;
}

export interface ResolvedKindRule extends KindRule {
  origin: { policyRecordId: string; source: 'kind' | 'fallback' };
}

export interface OwnershipPolicyDoc {
  recordId: string;
  scope: { type: 'lab' | 'project'; id: string };
  labOwnerUserId: string;
  fallback: KindRule;
  kindRules: Record<string, KindRule>;
}

export interface CreateDefaults {
  ownerUserId: string;
  visibility: Visibility;
  filedTo: FiledTo;
  /** Grants to stamp on the access-policy at creation (may be empty). */
  grants: AccessGrant[];
  origin: ResolvedKindRule['origin'];
}

const VISIBILITIES: Visibility[] = ['private', 'shared', 'public'];
const SHARE_TARGETS: ShareTarget[] = ['user', 'group', 'project', 'lab'];
const ACL_ROLES: string[] = ['owner', 'admin', 'editor', 'operator', 'qa', 'viewer'];

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Coerce one declared default grant; anything malformed is dropped, never guessed. */
function coerceGrant(raw: unknown): AccessGrant | null {
  const g = asRecord(raw);
  const principalType = g.principalType;
  if (principalType !== 'user' && principalType !== 'group' && principalType !== 'project') return null;
  const principalId = asString(g.principalId);
  if (!principalId) return null;
  const role = asString(g.role);
  if (!role || !ACL_ROLES.includes(role)) return null;
  return { principalType, principalId, role: role as AccessGrant['role'] };
}

function coerceKindRule(raw: unknown): KindRule | null {
  const r = asRecord(raw);
  const owner = r.owner === 'lab' ? 'lab' : r.owner === 'creator' ? 'creator' : null;
  const visibility = VISIBILITIES.includes(r.visibility as Visibility) ? (r.visibility as Visibility) : null;
  if (!owner || !visibility) return null;
  const filedTo: FiledTo = r.filedTo === 'active-project' ? 'active-project' : 'none';
  const publishRole = asString(r.publishRole);
  return {
    owner,
    visibility,
    filedTo,
    editRoles: asArray(r.editRoles).filter((x): x is string => typeof x === 'string'),
    shareTargets: asArray(r.shareTargets).filter((x): x is ShareTarget => SHARE_TARGETS.includes(x as ShareTarget)),
    defaultGrants: asArray(r.defaultGrants).map(coerceGrant).filter((g): g is AccessGrant => g !== null),
    ...(publishRole !== undefined ? { publishRole } : {}),
  };
}

/** Coerce a stored record into a policy document. Returns null for anything malformed. */
export function coerceOwnershipPolicy(env: RecordEnvelope | null | undefined): OwnershipPolicyDoc | null {
  const payload = asRecord(env?.payload);
  if (payload.kind !== OWNERSHIP_POLICY_KIND) return null;
  const recordId = asString(payload.recordId);
  const labOwnerUserId = asString(payload.labOwnerUserId);
  const fallback = coerceKindRule(payload.fallback);
  if (!recordId || !labOwnerUserId || !fallback) return null;

  const scopeRaw = asRecord(payload.scope);
  const kindRules: Record<string, KindRule> = {};
  for (const entry of asArray(payload.kindRules)) {
    const kind = asString(asRecord(entry).kind);
    const rule = coerceKindRule(entry);
    if (kind && rule) kindRules[kind] = rule;
  }

  return {
    recordId,
    scope: { type: scopeRaw.type === 'project' ? 'project' : 'lab', id: asString(scopeRaw.id) ?? 'lab' },
    labOwnerUserId,
    fallback,
    kindRules,
  };
}

export class OwnershipPolicyService {
  constructor(private readonly store: RecordStore) {}

  /** The active lab-scope document, else the first document, else null. */
  async activeLabPolicy(): Promise<OwnershipPolicyDoc | null> {
    const records = await this.store.list({ kind: OWNERSHIP_POLICY_KIND, limit: 100 });
    const docs = records
      .map(coerceOwnershipPolicy)
      .filter((doc): doc is OwnershipPolicyDoc => doc !== null);
    return docs.find((doc) => doc.scope.type === 'lab') ?? docs[0] ?? null;
  }

  /** The rule that governs `kind`, with the origin of the answer. */
  async ruleFor(kind: string): Promise<ResolvedKindRule | null> {
    const doc = await this.activeLabPolicy();
    if (!doc) return null;
    const rule = doc.kindRules[kind];
    if (rule) return { ...rule, origin: { policyRecordId: doc.recordId, source: 'kind' } };
    return { ...doc.fallback, origin: { policyRecordId: doc.recordId, source: 'fallback' } };
  }

  /** Defaults applied when creating a record of `kind`. Null = nothing declared. */
  async defaultsForCreate(input: { kind: string; creatorUserId: string }): Promise<CreateDefaults | null> {
    const doc = await this.activeLabPolicy();
    const rule = await this.ruleFor(input.kind);
    if (!doc || !rule) return null;
    return {
      ownerUserId: rule.owner === 'lab' ? doc.labOwnerUserId : input.creatorUserId,
      visibility: rule.visibility,
      filedTo: rule.filedTo,
      grants: rule.defaultGrants,
      origin: rule.origin,
    };
  }

  /** Legal share targets for `kind`. Null = nothing declared (UI falls back to all). */
  async shareTargetsFor(kind: string): Promise<ShareTarget[] | null> {
    const rule = await this.ruleFor(kind);
    return rule ? rule.shareTargets : null;
  }
}
```

Run GREEN:
```bash
npm run test:run -w server -- src/security/OwnershipPolicyService.test.ts
```
Expected: `8 passed`.

Also export `Visibility` from `AccessControlService.ts` (change its inline union in `AccessPolicyRecord` to use the exported type):
```ts
export type Visibility = 'private' | 'shared' | 'public';
// ...and in AccessPolicyRecord:
  visibility: Visibility;
```
Then: `npm run typecheck -w server` → expected clean.

Commit: `feat(server): OwnershipPolicyService resolves declared ownership defaults`

---

### T6 — Add the `project` principal to the ACL evaluator

Files: `server/src/security/AccessControlService.ts` (+ test), `server/src/security/AuthorizationService.ts` (+ `IdentityHandlers.sanitizeGrants` prefix validation).

Failing test first — append to `server/src/security/AccessControlService.test.ts`:

```ts
  it('propagates a project grant to EVERY project member, and to nobody else', () => {
    const projectPolicy = {
      kind: 'access-policy' as const,
      recordId: 'ACL-STU-A',
      visibility: 'private' as const,
      ownerUserId: 'USR-OWNER',
      grants: [
        { principalType: 'group' as const, principalId: 'GRP-MITO', role: 'editor' as const },
        { principalType: 'user' as const, principalId: 'USR-MEMBER-2', role: 'editor' as const },
      ],
    };
    const target = {
      kind: 'access-policy' as const,
      recordId: 'ACL-PRT-1',
      visibility: 'private' as const,
      ownerUserId: 'USR-OWNER',
      grants: [{ principalType: 'project' as const, principalId: 'STU-A', role: 'editor' as const }],
    };
    const index = { get: (id: string) => (id === 'STU-A' ? projectPolicy : null) };
    const groups = [
      { kind: 'group' as const, recordId: 'GRP-MITO', memberUserIds: ['USR-MEMBER-1'] },
      { kind: 'group' as const, recordId: 'GRP-NESTED', memberUserIds: ['USR-MEMBER-3'] },
    ];
    const svc = new AccessControlService(groups);

    // Every route into project membership: owner, group member, directly-granted user.
    expect(svc.canAccess({ policy: target, userId: 'USR-OWNER', action: 'write', projectPolicies: index })).toBe(true);
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-1', action: 'write', projectPolicies: index })).toBe(true);
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-2', action: 'write', projectPolicies: index })).toBe(true);
    // Not a member => no access, and an unresolved project id never opens up.
    expect(svc.canAccess({ policy: target, userId: 'USR-STRANGER', action: 'write', projectPolicies: index })).toBe(false);
    expect(svc.canAccess({ policy: target, userId: 'USR-MEMBER-1', action: 'write', projectPolicies: { get: () => null } })).toBe(false);
  });
```

Implementation in `AccessControlService.ts`:

```ts
export type Visibility = 'private' | 'shared' | 'public';
export type AccessPrincipalType = 'user' | 'group' | 'project';

export interface AccessGrant {
  principalType: AccessPrincipalType;
  principalId: string;
  role: AccessRole;
}

/** Read-only view of project (study) policies, used to resolve project grants. */
export interface ProjectPolicyIndex {
  get(projectId: string): AccessPolicyRecord | null;
}

export interface CanAccessInput {
  policy: AccessPolicyRecord | null | undefined;
  userId: string | null | undefined;
  action: AccessAction;
  /** Required only when a policy carries a `project` grant. */
  projectPolicies?: ProjectPolicyIndex;
}
```

and in `canAccess` replace the grant loop body:

```ts
    const { projectPolicies } = input; // destructure as well
    for (const grant of policy.grants) {
      if (!ROLE_ACTIONS[grant.role].has(action)) continue;
      if (grant.principalType === 'user' && grant.principalId === userId) return true;
      if (grant.principalType === 'group' && this.groupContainsUser(grant.principalId, userId)) return true;
      if (grant.principalType === 'project') {
        const projectPolicy = projectPolicies?.get(grant.principalId);
        if (projectPolicy && this.principalIsMember(projectPolicy, userId)) return true;
      }
    }
```

plus the helper (nested project principals deliberately do not chain):

```ts
  /** Project membership = the project policy's owner, a listed user/group, or a public project. */
  private principalIsMember(projectPolicy: AccessPolicyRecord, userId: string): boolean {
    if (projectPolicy.ownerUserId === userId) return true;
    if (projectPolicy.visibility === 'public') return true;
    return projectPolicy.grants.some((grant) => {
      if (grant.principalType === 'user') return grant.principalId === userId;
      if (grant.principalType === 'group') return this.groupContainsUser(grant.principalId, userId);
      return false;
    });
  }
```

`AuthorizationService.canAccess` passes the index:

```ts
  async canAccess(userId: string | null | undefined, action: AccessAction, record: RecordEnvelope): Promise<boolean> {
    const effectivePolicy = await this.resolveEffectivePolicy(record);
    const groups = await this.loadGroups();
    const projectPolicies = await this.loadProjectPolicies();
    return new AccessControlService(groups).canAccess({ policy: effectivePolicy, userId, action, projectPolicies });
  }

  /** resourceRef id -> policy, for resolving `project` grants (study records). */
  private async loadProjectPolicies(): Promise<ProjectPolicyIndex> {
    const policies = await this.store.list({ kind: 'access-policy', limit: 10000 });
    const byResource = new Map<string, AccessPolicyRecord>();
    for (const env of policies) {
      const coerced = coercePolicy(env);
      const resourceId = getResourceRefId(env);
      if (coerced && resourceId) byResource.set(resourceId, coerced);
    }
    return { get: (projectId: string) => byResource.get(projectId) ?? null };
  }
```

Schema widening — `schema/identity/access-policy.schema.yaml` line ~53: `principalType` enum becomes `[user, group, project]`, and add to the description: `project = members of the project (study) named by principalId (STU-*)`.

API gate — `server/src/api/handlers/IdentityHandlers.ts:343`: the prefix check becomes
```ts
        const ok = g.principalType === 'user' ? g.principalId.startsWith('USR-')
          : g.principalType === 'group' ? g.principalId.startsWith('GRP-')
          : g.principalId.startsWith('STU-');
```
and `sanitizeGrants` must accept `'project'` in its principalType whitelist (read the function and extend its guard).

Client type — `app/src/shared/api/client.ts:1882`: `principalType: 'user' | 'group' | 'project'`.

**Verify:**
```bash
npm run test:run -w server -- src/security/AccessControlService.test.ts src/security/LocalAuthorization.test.ts
npm run typecheck
```
Expected: all pass, typecheck clean (the client type change is additive).

Commit: `feat(security): project principal — share with project members via the project's own ACL`

---

### T7 — `ensureOwnerPolicy` uses the declared defaults

File: `server/src/security/AuthorizationService.ts` (+ tests). No call-site churn: the service is injected.

```ts
export class AuthorizationService {
  constructor(
    private readonly store: RecordStore,
    private readonly ownershipPolicy?: OwnershipPolicyService,
  ) {}
```

Inside `ensureOwnerPolicy`, replace `visibility: 'private'` / `ownerUserId` with:

```ts
    const defaults = this.ownershipPolicy
      ? await this.ownershipPolicy.defaultsForCreate({ kind: resourceKind, creatorUserId: ownerUserId })
      : null;
    const visibility: Visibility = defaults?.visibility ?? 'private';
    const resolvedOwnerUserId = defaults?.ownerUserId ?? ownerUserId;
    const grants: AccessGrant[] = defaults?.grants ?? [];
```
then use `visibility`, `resolvedOwnerUserId` and `grants` in the payload — i.e. replace the current `grants: []` with `grants` — and keep the no-document fallback honest:
```ts
    // Fallback when no ownership-policy document is installed mirrors the
    // pre-existing behaviour (creator-private, no grants) so a bare repo never
    // widens access. The document is the authority; see plan D9.
```

Wiring — `server/src/server.ts:507`:

```ts
  const ownershipPolicyService = new OwnershipPolicyService(store);
  const authorizationService = new AuthorizationService(store, ownershipPolicyService);
```
(add the import next to the other `./security/...` imports).

Failing test first — append to `server/src/security/LocalAuthorization.test.ts` (the store fixture must also hold `GRP-LAB-ADMINS` with `memberUserIds: ['USR-ADMIN-2']`, plus `USR-ADMIN-2` and `USR-STRANGER` user records):

```ts
  it('stamps the declared visibility and owner for lab-shared kinds', async () => {
    const store = new MemoryRecordStore([
      user('USR-BRAD'),
      user('USR-LOCAL-ADMIN'),
      {
        recordId: 'OWN-LAB-DEFAULT',
        schemaId: 'https://computable-lab.com/schema/computable-lab/ownership-policy.schema.yaml',
        payload: {
          kind: 'ownership-policy',
          recordId: 'OWN-LAB-DEFAULT',
          title: 'Lab policy',
          scope: { type: 'lab', id: 'lab' },
          labOwnerUserId: 'USR-LOCAL-ADMIN',
          fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: ['owner'], shareTargets: ['user'] },
          kindRules: [
            { kind: 'instrument', owner: 'lab', visibility: 'public', filedTo: 'none', editRoles: ['owner', 'admin'], shareTargets: ['user', 'group', 'lab'], defaultGrants: [{ principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' }] },
          ],
        },
      } as RecordEnvelope,
    ]);
    const authorization = new AuthorizationService(store, new OwnershipPolicyService(store));
    const instrument = {
      recordId: 'INS-MITO-SPECIAL',
      schemaId: 'https://computable-lab.com/schema/computable-lab/instrument.schema.yaml',
      payload: { kind: 'instrument', id: 'INS-MITO-SPECIAL', name: 'Grant-funded imager' },
    } as RecordEnvelope;

    const stamped = await authorization.ensureOwnerPolicy(instrument, 'USR-BRAD');

    expect((stamped?.payload as Record<string, unknown>).visibility).toBe('public');
    expect((stamped?.payload as Record<string, unknown>).ownerUserId).toBe('USR-LOCAL-ADMIN');
    // Declared lab-visible => a stranger can read it.
    expect(await authorization.canAccess('USR-STRANGER', 'read', instrument)).toBe(true);
    // MULTI-USER: the declared admin GROUP administers it — not just labOwnerUserId.
    expect((stamped?.payload as Record<string, unknown>).grants).toEqual([
      { principalType: 'group', principalId: 'GRP-LAB-ADMINS', role: 'admin' },
    ]);
    expect(await authorization.canAccess('USR-ADMIN-2', 'admin', instrument)).toBe(true);   // member of GRP-LAB-ADMINS
    expect(await authorization.canAccess('USR-STRANGER', 'admin', instrument)).toBe(false); // not a member
  });
```

**Verify RED → GREEN:**
```bash
npm run test:run -w server -- src/security/LocalAuthorization.test.ts
```
Expected before wiring: the new test fails (`visibility` is `'private'`, `ownerUserId` is `USR-BRAD`). After: all pass, including the pre-existing private-by-default tests (they use a store with no policy document).

Commit: `feat(security): owner-policy stamping follows the ownership-policy document`

---

### T8 — Creation-time defaults: file into the active project

Files: `server/src/api/types.ts`, `server/src/api/handlers/RecordHandlers.ts` (+ wire in `server/src/server.ts`).

`server/src/api/types.ts` — extend:
```ts
export interface CreateRecordRequest {
  schemaId: string;
  payload: unknown;
  message?: string;
  /**
   * Active project for this creation. When the ownership policy for this kind
   * says filedTo: active-project and the payload carries no studyId, the record
   * is filed into this study (links.studyId) at creation time.
   */
  studyId?: string;
}
```

`RecordHandlerSecurityOptions` — add:
```ts
  ownershipPolicyService?: OwnershipPolicyService;
```
(injected in `server/src/server.ts` inside the `createRecordHandlers(...)` options object at line 733-746: `ownershipPolicyService,`)

Inside `createRecord`, immediately before `store.create(...)` (after the existing `createdBy` stamping), insert:

```ts
        // Declarative filing: a kind whose ownership rule says filedTo:
        // active-project lands in the caller's project unless it already has one.
        const activeOwner = await resolveRequestUser(request, reply);
        if (security?.ownershipPolicyService && activeOwner?.userId && request.body.studyId) {
          const kind = payloadKind(request.body.payload);
          if (kind) {
            const defaults = await security.ownershipPolicyService.defaultsForCreate({
              kind,
              creatorUserId: activeOwner.userId,
            });
            const p = payloadObject(request.body.payload);
            const links = p.links && typeof p.links === 'object' ? { ...(p.links as Record<string, unknown>) } : {};
            if (defaults?.filedTo === 'active-project' && !links.studyId && typeof p.studyId !== 'string') {
              request.body.payload = { ...p, links: { ...links, studyId: request.body.studyId } };
            }
          }
        }
```
(Reuse the handler's own user resolution if one already happened earlier in the function — check and avoid a second `resolveRequestUser` call; if a `user` variable is already in scope, use it.)

Failing test first — new file `server/src/api/handlers/RecordHandlers.filing.test.ts`, built on the `MemoryRecordStore` + `createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, { identityService, authorizationService, ownershipPolicyService })` pattern from `LocalAuthorization.test.ts:254-265`:

```ts
  it('files a new local-protocol into the active project when the policy says so', async () => {
    // store seeded with: user USR-BRAD, OWN-LAB-DEFAULT (local-protocol rule
    // filedTo: active-project), study STU-MITO
    const handlers = createRecordHandlers(store, undefined, undefined, undefined, undefined, undefined, {
      identityService: new LocalIdentityService(store),
      authorizationService: new AuthorizationService(store, ownershipPolicyService),
      ownershipPolicyService,
    });
    const reply1 = reply();
    const res = await handlers.createRecord(
      request<{ Body: { schemaId: string; payload: unknown; studyId?: string } }>({
        body: {
          schemaId: 'https://computable-lab.com/schema/computable-lab/workflow/local-protocol.schema.yaml',
          payload: { kind: 'local-protocol', recordId: 'LPR-1', title: 'My draft', inherits_from: { kind: 'record', id: 'PRT-1', type: 'protocol' } },
          studyId: 'STU-MITO',
        },
        headers: {},
      }),
      reply1,
    );
    expect(reply1.statusCode).toBe(201);
    const created = await store.get('LPR-1');
    const links = (created?.payload as Record<string, unknown>).links as Record<string, unknown>;
    expect(links.studyId).toBe('STU-MITO');
  });
```
(Adjust the `local-protocol` payload to satisfy its schema by reading `schema/workflow/local-protocol.schema.yaml` required fields — `inherits_from` is required; `recordId` may be generated by the handler, in which case assert via the returned `record.recordId`.)

**Verify:**
```bash
npm run test:run -w server -- src/api/handlers/RecordHandlers.filing.test.ts
```
Expected: pass, and no other RecordHandlers test regresses:
```bash
npm run test:run -w server -- src/api/ 2>&1 | tail -20
```

Commit: `feat(api): default filing to the active project from the ownership policy`

---

### T9 — Read/write API for the document

Files: new `server/src/api/handlers/OwnershipPolicyHandlers.ts`, `server/src/api/routes.ts`, `server/src/server.ts`, new test `server/src/api/handlers/OwnershipPolicyHandlers.test.ts`.

Handlers:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { LocalIdentityService } from '../../security/LocalIdentityService.js';
import type { AuthorizationService } from '../../security/AuthorizationService.js';
import {
  DEFAULT_OWNERSHIP_POLICY_RECORD_ID,
  OWNERSHIP_POLICY_SCHEMA_ID,
  OwnershipPolicyService,
} from '../../security/OwnershipPolicyService.js';

export interface OwnershipPolicyHandlers {
  getOwnershipPolicy(request: FastifyRequest, reply: FastifyReply): Promise<unknown>;
  putOwnershipPolicy(request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply): Promise<unknown>;
}

export function createOwnershipPolicyHandlers(deps: {
  store: RecordStore;
  service: OwnershipPolicyService;
  identityService: LocalIdentityService;
  authorizationService: AuthorizationService;
}): OwnershipPolicyHandlers {
  const { store, service, identityService, authorizationService } = deps;

  async function resolveDocument() {
    const doc = await service.activeLabPolicy();
    if (doc) return store.get(doc.recordId);
    return store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);
  }

  return {
    /** GET /settings/ownership-policy */
    async getOwnershipPolicy(_request, reply) {
      const record = await resolveDocument();
      const doc = await service.activeLabPolicy();
      if (!record) {
        reply.status(200);
        return { record: null, resolved: null, defaults: null };
      }
      // Defaults for the kinds the UI asks about (kind list comes from the client).
      return { record, resolved: doc };
    },

    /** PUT /settings/ownership-policy — replaces the document body (admin only). */
    async putOwnershipPolicy(request, reply) {
      const user = await identityService.resolveRequestUser(request);
      const record = await resolveDocument();
      if (!record) {
        reply.status(404);
        return { error: 'NOT_FOUND', message: 'No ownership-policy document installed' };
      }
      if (!(await authorizationService.canAccess(user.userId, 'admin', record))) {
        reply.status(403);
        return { error: 'ACCESS_DENIED', message: `User ${user.userId ?? '(unknown)'} cannot edit the ownership policy` };
      }
      const validation = await store.validate({ schemaId: OWNERSHIP_POLICY_SCHEMA_ID, payload: request.body });
      if (!validation.valid) {
        reply.status(422);
        return { error: 'INVALID_POLICY', validation };
      }
      const result = await store.update({
        envelope: { ...record, payload: request.body },
        message: 'Update ownership-policy',
      });
      if (!result.success) {
        reply.status(422);
        return { error: result.error ?? 'UPDATE_FAILED', validation: result.validation };
      }
      return { success: true, record: result.envelope ?? await store.get(record.recordId) };
    },
  };
}
```

Routes (`server/src/api/routes.ts`, inside the `labSettingsHandlers` block at line 590-593):

```ts
  const { ownershipPolicyHandlers } = options;
  if (ownershipPolicyHandlers) {
    fastify.get('/settings/ownership-policy', ownershipPolicyHandlers.getOwnershipPolicy.bind(ownershipPolicyHandlers));
    fastify.put('/settings/ownership-policy', ownershipPolicyHandlers.putOwnershipPolicy.bind(ownershipPolicyHandlers));
  }
```
plus `ownershipPolicyHandlers?: OwnershipPolicyHandlers;` in the options interface and the handler creation + registration in `server/src/server.ts` (next to `labSettingsHandlers` at line 846 and in the object passed to `registerRoutes` around line 1447).

Test: drive `createOwnershipPolicyHandlers` directly with a `MemoryRecordStore` (mirrors `LocalAuthorization.test.ts`): GET returns the seeded document; PUT as a non-admin returns 403; PUT as the document's owner/admin returns 200 and the store holds the new payload; a malformed body returns 422.

**Verify:**
```bash
npm run test:run -w server -- src/api/handlers/OwnershipPolicyHandlers.test.ts
npm run typecheck -w server
```

Commit: `feat(api): GET/PUT /settings/ownership-policy (admin-gated)`

---

### T10 — AI tool: the chat can read and edit the document

Files: new `server/src/mcp/tools/ownershipPolicyTools.ts`, edit `server/src/mcp/tools/index.ts`, new test `server/src/mcp/tools/OwnershipPolicyTools.test.ts`.

```ts
/**
 * MCP/AI tools for the lab ownership & sharing policy.
 *
 * The document is DATA; the AI edits it like any other record. Writes are gated
 * by the document's own ACL (admin), never by a role baked into this file.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppContext } from '../../server.js';
import type { ToolRegistry } from '../../ai/ToolRegistry.js';
import { dualRegister } from './dualRegister.js';
import { jsonResult, errorResult } from '../helpers.js';
import {
  DEFAULT_OWNERSHIP_POLICY_RECORD_ID,
  OWNERSHIP_POLICY_SCHEMA_ID,
} from '../../security/OwnershipPolicyService.js';

const KindRuleSchema = z.object({
  kind: z.string().describe('Record kind this rule applies to (e.g. local-protocol)'),
  owner: z.enum(['creator', 'lab']),
  visibility: z.enum(['private', 'shared', 'public']),
  filedTo: z.enum(['none', 'active-project']),
  editRoles: z.array(z.enum(['owner', 'admin', 'editor', 'operator', 'qa', 'viewer'])),
  shareTargets: z.array(z.enum(['user', 'group', 'project', 'lab'])),
  publishRole: z.enum(['owner', 'admin', 'editor', 'operator', 'qa', 'viewer']).optional(),
});

export function registerOwnershipPolicyTools(server: McpServer, ctx: AppContext, registry?: ToolRegistry): void {
  dualRegister(server, registry,
    'ownership_policy_get',
    'Read the lab ownership & sharing policy: per-kind defaults for owner, visibility, project filing, edit roles and share targets. Call this before proposing a change.',
    {},
    async () => {
      try {
        const doc = await ctx.ownershipPolicyService?.activeLabPolicy();
        if (!doc) return errorResult(`No ownership-policy document installed (expected ${DEFAULT_OWNERSHIP_POLICY_RECORD_ID}).`);
        const record = await ctx.store.get(doc.recordId);
        return jsonResult({ record, resolved: doc });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );

  dualRegister(server, registry,
    'ownership_policy_update',
    'Replace the lab ownership & sharing policy document. Requires admin on the document. Describe the change to the user and get confirmation before calling this.',
    {
      kindRules: z.array(KindRuleSchema).describe('Full replacement list of per-kind rules'),
      fallback: KindRuleSchema.omit({ kind: true }).describe('Rule for kinds not listed'),
      labOwnerUserId: z.string().describe('USR-* id that owns lab-owned records'),
      reason: z.string().optional().describe('Why this change is being made (recorded in the commit message)'),
    },
    async (args) => {
      try {
        const doc = await ctx.ownershipPolicyService?.activeLabPolicy();
        const current = doc ? await ctx.store.get(doc.recordId) : await ctx.store.get(DEFAULT_OWNERSHIP_POLICY_RECORD_ID);
        if (!current) return errorResult('No ownership-policy document installed; create OWN-LAB-DEFAULT first.');
        const payload = {
          ...(current.payload as Record<string, unknown>),
          labOwnerUserId: args.labOwnerUserId,
          fallback: args.fallback,
          kindRules: args.kindRules,
        };
        const validation = await ctx.store.validate({ schemaId: OWNERSHIP_POLICY_SCHEMA_ID, payload });
        if (!validation.valid) return errorResult(`Invalid policy: ${JSON.stringify(validation.errors)}`);
        const result = await ctx.store.update({
          envelope: { ...current, payload },
          message: args.reason ? `Update ownership-policy: ${args.reason}` : 'Update ownership-policy',
        });
        return jsonResult({ success: result.success, record: result.envelope ?? await ctx.store.get(current.recordId), validation: result.validation });
      } catch (err) {
        return errorResult(`Tool error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  );
}
```

`ctx.ownershipPolicyService` — add the field to the `AppContext` interface in `server/src/server.ts` and assign it where the service is constructed (T7):
```ts
  ctx.ownershipPolicyService = ownershipPolicyService;
```
Guard the AI write with the ACL: in `ownership_policy_update`, resolve the session user from the MCP request context if available; if not available in the tool context, do the admin check in the API layer instead — **read `server/src/mcp/tools/materialsAiTools.ts` for how an existing write-capable tool obtains the actor, and follow that exact pattern.** Do not invent an identity path.

`index.ts`: import + call `registerOwnershipPolicyTools(server, ctx, registry);` after `registerRecordTools`.

Test — copy the harness from `server/src/mcp/tools/MaterialsAiTools.test.ts:17-45` (`initializeApp(repoRoot, { recordsDir: 'tmp/ownership-policy-tools-test/records', logLevel: 'silent' })`, `new ToolRegistry()`, `registerOwnershipPolicyTools(new McpServer({...}), ctx, registry)`), then:
```ts
  it('reads the policy and refuses an invalid update', async () => {
    const created = await ctx.store.create({ envelope: { recordId: 'OWN-LAB-DEFAULT', schemaId: OWNERSHIP_POLICY_SCHEMA_ID, payload: seedPayload } });
    expect(created.success).toBe(true);
    const get = registry.get('ownership_policy_get');
    const read = await get!.handler({});
    const text = read.content[0] && 'text' in read.content[0] ? read.content[0].text : '';
    expect(JSON.parse(text).resolved.kindRules['local-protocol'].filedTo).toBe('active-project');

    const update = registry.get('ownership_policy_update');
    const bad = await update!.handler({ kindRules: [{ kind: 'protocol' }], fallback: { owner: 'creator', visibility: 'private', filedTo: 'none', editRoles: [], shareTargets: [] }, labOwnerUserId: 'USR-LOCAL-ADMIN' });
    const badText = bad.content[0] && 'text' in bad.content[0] ? bad.content[0].text : '';
    expect(badText).toMatch(/Invalid policy|Invalid/);
  });
```

**Verify:**
```bash
npm run test:run -w server -- src/mcp/tools/OwnershipPolicyTools.test.ts
```

Commit: `feat(mcp): AI tools to read and edit the ownership policy`

---

### T11 — App: policy section in Settings

Files: `app/src/shared/api/client.ts`, new `app/src/components/settings/OwnershipPolicySection.tsx`, `app/src/shell/SettingsPage.tsx`, new `app/src/components/settings/OwnershipPolicySection.test.tsx`.

Client (next to `getLabSettings`, client.ts:2850):
```ts
  async getOwnershipPolicy(): Promise<{ record: RecordEnvelope | null; resolved: unknown }> {
    return request<{ record: RecordEnvelope | null; resolved: unknown }>('/settings/ownership-policy')
  },
  async putOwnershipPolicy(payload: Record<string, unknown>): Promise<WriteResponse> {
    return request<WriteResponse>('/settings/ownership-policy', { method: 'PUT', body: JSON.stringify(payload) })
  },
```
(`RecordEnvelope` and `WriteResponse` are already imported in that file — confirm before adding imports.)

Component: a read-first section listing the kind rules as a table (`kind | owner | visibility | filed to | share targets`) plus a raw-YAML editor for advanced edits (reuse the existing pattern for YAML editing — check how `PolicyBundleSelector.tsx` renders and how any CodeMirror YAML component is mounted in `app/src/editor/RawRecordEditor.tsx`; reuse that component rather than adding an editor dependency). Save calls `putOwnershipPolicy`.

Mount it in `app/src/shell/SettingsPage.tsx` next to `<PolicyBundleSelector />` with a heading "Ownership & Sharing".

Test: render with a mocked `apiClient.getOwnershipPolicy` (mirror `app/src/shared/sharing/useRecordVisibility.test.tsx`), assert the `local-protocol` row shows `private` + `active-project`.

**Verify:**
```bash
npm run test:unit -w app
npm run typecheck -w app
```
Expected: pass / clean.

**Browser verification is mandatory for this task (repo rule 12):** with the dev stack up (`./start-app.sh`; main dev instance :5174 → :3001 — do not kill his servers, target PIDs by port), open `http://localhost:5174/settings`, confirm the section renders, edit a rule, save, reload, and confirm the value persisted. Report the exact URL + the observed before/after values.

Commit: `feat(app): ownership & sharing policy section in settings`

---

### T12 — App: share-target presets in the share dialog

File: `app/src/shared/sharing/ShareRecordDialog.tsx` (+ its test if present).

Add a preset row above the grants list, driven by `apiClient.getOwnershipPolicy()`:

- **Share with whole lab** → `visibility: 'public'` (keep grants untouched).
- **Share with project members** → append a grant `{ principalType: 'project', principalId: <active project studyId>, role: 'editor' }` (get the active project from the existing `activeProjectFromTabs` helper in `app/src/shared/shell/activeProject.ts`; disable the button when there is no active project or when the record has no `links.studyId`).
- **Private to me** → `visibility: 'private'`, drop `project` and `lab`-style grants, keep explicit user/group grants.

Render only the targets the document allows for this record's kind (`shareTargetsFor(kind)`); when the fetch fails, show all three (never hide capability because a config is missing — but say so in the UI: "policy unavailable — showing all targets").

Update the grants type usage: the "Add principal" `<select>` gains a `Project` option only when `shareTargets` includes `project`; the option list shows the active project's title.

**Verify:**
```bash
npm run test:unit -w app
```
plus the same browser check as T11 (open a protocol, share it with project members, confirm the grant shows as a project principal, then verify with `curl` against the API that `visibility`/`grants` persisted — the record's `GET /api/records/<id>/access-policy`).

Commit: `feat(app): share targets driven by the ownership policy (lab / project members / private)`

---

### T13 — Documented model + opt-in migration for existing records

Files: new `server/src/scripts/applyOwnershipDefaults.ts`, `docs/agent/DATA_MODEL.md`, `CLAUDE.md`.

Migration script (idempotent, **dry-run by default**, never guesses an owner):
```ts
// server/src/scripts/applyOwnershipDefaults.ts
// Usage:
//   npx tsx src/scripts/applyOwnershipDefaults.ts           # dry run (prints planned changes)
//   npx tsx src/scripts/applyOwnershipDefaults.ts --apply   # writes
```
It lists every `access-policy` record whose `resourceRef` kind has a document rule differing from the stamped `visibility`/`ownerUserId`, prints `ACL-x: visibility private -> public (kind instrument, rule OWN-LAB-DEFAULT)`, and only writes with `--apply`. Add an npm script `"apply:ownership-defaults": "npx tsx src/scripts/applyOwnershipDefaults.ts"` to `server/package.json`.

> **Run it per data dir, deliberately.** The migration reads whatever the server instance resolves: main dev = `~/.computable-lab`, lane 1 = `/home/brad/.computable-lab-lane1`, and the lane keeps its data repo as embedded git under the data dir. Set `CL_DATA_DIR` explicitly for each run and print the resolved dir before touching anything. Never run it against a dir you did not name.

Docs:
- `docs/agent/DATA_MODEL.md`: add `OwnershipPolicy` to the core entity table (`OWN-*`, scope lab|project, kindRules, fallback) and a new subsection under "Material Hierarchy"-style blocks describing the three ownership levels (personal → project → lab) and the resolution order.
- `CLAUDE.md`: extend the "Non-Negotiable Rules" list with rule 9 — *Ownership and sharing defaults are declared in `ownership-policy` records, not in TypeScript; when the document is missing, the system falls back to creator-private and says so.*

**Verify:**
```bash
npm run apply:ownership-defaults -w server        # prints planned changes, exit 0, writes nothing
git status --porcelain records/ | head            # expect empty for a dry run
```

Commit: `docs+tooling: ownership model documented; opt-in defaults migration`

---

## Tests / validation (aggregate)

Run from `/mnt/vast/home/brad/git/computable-lab`:

```bash
npm run test:run -w server          # expect: all suites pass, including the 6 new/updated files
npm run typecheck                   # expect: exit 0 for both workspaces
npm run test:unit -w app            # expect: all app unit tests pass
```

Per-feature acceptance (must all hold):
1. `OwnershipPolicyService.ruleFor('instrument')` → `{owner: 'lab', visibility: 'public', origin.source: 'kind'}` (unit test).
2. Creating an `instrument` by `USR-BRAD` stamps an `access-policy` with `visibility: public`, `ownerUserId: <labOwnerUserId>` (unit test).
3. A stranger can read a lab-visible instrument; cannot write it (unit test).
4. A `local-protocol` created with `studyId: STU-x` and no `links.studyId` lands with `links.studyId: STU-x` (unit test).
5. A record granted to `{principalType: project, principalId: STU-x, role: editor}` is writable by a member of `STU-x` and not by a non-member (unit test).
6. `PUT /settings/ownership-policy` as a non-admin → 403; as admin → 200 and the store holds the new body (unit test).
7. The AI tool `ownership_policy_get` returns the resolved document; `ownership_policy_update` rejects a malformed body (unit test).
8. Browser: settings section renders and round-trips an edit; share dialog offers lab / project-members / private per the document (manual, with the observed values quoted in the commit/PR).
9. **Multi-user:** two different users creating the same kind each get their own creator-owned record (`USR-A` and `USR-B` cases in T5) — no shared project copy appears by accident.
10. **Multi-user:** a `project` grant opens the record to *every* route into membership — the project's owner, a member via group, a directly-granted user — and to nobody else (T6 test); a member of the declared `GRP-LAB-ADMINS` can `admin` a lab-owned record while a non-member cannot (T7 test).

## Reconciliation with the lane-1 QMS campaign (verified first-hand 2026-10-10)

Lane 1's campaign is `light-qms-records-browser` on trunk `cl/integration-1` @ `14637f6d`
(worktree `/mnt/vast/home/brad/git/cl-integration-1`, stack :3092/:5192, data dir
`/home/brad/.computable-lab-lane1`). THE LIST lives at `~/.hermes/cl/lanes/1/task-list.md`;
the current in-flight items are `QMS-8-POLICY-BUNDLE-SWITCH` (in progress, coder commit
`c3cb9a39`, adversarial review verdict **fix**) and `EDITOR-9-EMPTY-OPTIONAL-SAVE` (claimed,
queued behind QMS-8 — the fleet has ONE coder slot). Brad approved both on 2026-10-10.

**Layer map — this plan is a different layer, not a competing one:**

| Layer | Where it lives | Question it answers |
| --- | --- | --- |
| Policy bundle (`POL-SANDBOX/NOTEBOOK/TRACKED/REGULATED`) | `config.yaml` `lab.policyBundleId` + `schema/core/policy-bundles/*` | How strict is the compiler/QMS runtime for the whole lab? |
| Lifecycle + guards + signatures | `schema/core/lifecycles/*.lifecycle.yaml`, `LifecycleEngine`, signature service, `role-grant` + `RoleResolver` | May this record change state, and who must sign? |
| **`access-policy` ACL** | `access-policy` records + `AuthorizationService` | Who may read / write / operate / admin THIS record? |
| **`ownership-policy` (this plan)** | one `OWN-LAB-DEFAULT` record | What are a NEW record's starting owner, visibility, filing and legal share targets? |

The ownership document only *feeds* the ACL layer. It never overrides lifecycle: a lab-visible
protocol in `regulated` mode still cannot reach `approved` without the signature the lifecycle
demands. Lane 1 already exercises the ACL layer heavily and by hand —
`ACL-DOC-DEMO-SOP` granting `{user USR-QMS-ADMIN, editor}`, `BUD-DEMO-LANE1` needing the same
fix, `ACL-CAL-DEMO-GC` re-granted to `{user USR-QMS-ADMIN, viewer}` — which is precisely the
toil this plan removes: those defaults become declarative once, not three manual
`PUT /records/:id/access-policy` calls per fixture.

Authorisation gating is consistent: QMS-8's ruling requires the mode-switch to be gated via
`AuthorizationService`; T9 gates the ownership document the same way (`admin` on the record).
One gate mechanism, two consumers.

**Role vocabulary — the one real seam.** Two role systems already coexist: `role-grant` +
`RoleResolver` (QMS lifecycle roles, optionally scoped to a `lifecycleId`) and ACL grants
(`owner/admin/editor/operator/qa/viewer`). This plan introduces no third: `editRoles` and
`shareTargets` reuse the ACL enum verbatim. When documenting the model (T13), state that the
document speaks ACL roles and that QMS lifecycle roles remain the `role-grant` domain.

**File-level divergence and sequencing (do not ignore):**

- **Identical on both trunks — this plan's core patches apply cleanly either way:**
  `server/src/security/AuthorizationService.ts`, `server/src/security/AccessControlService.ts`,
  `server/src/api/handlers/IdentityHandlers.ts`, `schema/identity/access-policy.schema.yaml`,
  `server/src/api/routes.ts`, `server/src/api/handlers/RecordHandlers.ts`, `server/src/mcp/tools/index.ts`.
- **Diverged main @ `455232cf` ↔ lane trunk @ `14637f6d` — re-verify every line anchor before
  patching:** `app/src/shell/SettingsPage.tsx` (155 lines differ — lane's version has the
  `apiClient.patchLabSettings` call at :96 that main does not), `app/src/shared/api/client.ts`
  (33), `server/src/api/handlers/LabSettingsHandlers.ts` (5), `server/src/server.ts` (68),
  `server/src/security/LocalAuthorization.test.ts` (54; lane deleted the header-trust pins).
  `MemoryRecordStore` still lives in that test file — T5 still extracts it from there.
- **Being edited right now by unmerged QMS-8 (`c3cb9a39`):** `routes.ts` (+3),
  `server/src/server.ts` (+21), `client.ts` (+16), `LabSettingsHandlers.ts` (+200),
  `SettingsPage.tsx`. T9 and T11 will conflict with it textually.
- **Prerequisite:** T11's browser round-trip edits a record through the editor save path, which
  is the defect `EDITOR-9-EMPTY-OPTIONAL-SAVE` fixes (untouched optionals serialized as `''` →
  validation failure). **Land EDITOR-9 before T11 is browser-verified**, or the settings edit
  will fail for reasons unrelated to this plan.
- **Do not dispatch this plan into lane 1 while QMS-8 or EDITOR-9 is live.** The fleet has one
  coder slot; the lane rule is that only the orchestrator marks items done and new queue items
  need Brad's approval. Correct sequence: QMS-8 fix cycle → EDITOR-9 → re-anchor this plan to
  lane trunk `cl/integration-1` → enqueue as new THE-LIST items (T1–T4, T5–T7, T8–T10, T11–T13
  are natural item boundaries) → Brad approves → dispatch.
- **Rebase note:** this plan's anchors were read on main @ `455232cf`. If implementation happens
  in the lane worktree (recommended — that is where the QMS/ACL surfaces live), re-read each
  named file/line there first.

---

## Risks, tradeoffs, and open questions

- **Git is the real ACL boundary.** A `visibility: private` record is still readable by anyone with repo access; the ACL only governs the API/UI. Brad's AI suggestion flagged this and it is true here. State it in the docs rather than imply encryption. (Future: per-user encrypted storage or repo-per-project.)
- **Performance:** `AuthorizationService` already lists every `access-policy` per check; T6 adds one more such listing. Acceptable at lab scale (thousands), wrong at millions. Flag before any bulk importer runs.
- **`editRoles` is descriptive in v1 (D8).** It cannot yet *restrict* edits — `ROLE_ACTIONS` in `AccessControlService.ts` remains the enforcement matrix (itself a hardcoded policy). Making the matrix data-driven is the obvious next step and is deliberately not in this plan.
- **`visibility: 'public'` = the whole lab (D2).** Correct for a single-tenant deployment, wrong the moment two labs share a deployment. Adding `'lab'` + org/lab ids later is additive but touches the schema enum and the evaluator.
- **Behaviour change is opt-in.** The seeded document changes access only for the kinds it declares lab-visible; existing records are untouched until T13's migration runs with `--apply`.
- **`local-protocol` filing needs a project on the request.** Nothing files automatically when the caller doesn't pass `studyId` — the UI must pass the active project (T8 leaves this to the client; the AI chat tool path must do the same).
- **Open question 1 (Brad):** should the lab-visible defaults be `material`, `material-spec`, `instrument`, `equipment`, `labware` as seeded, or start fully creator-private and let the lab opt in kind by kind? (One-line change in `OWN-LAB-DEFAULT`.)
- **Open question 2 (Brad):** should `editRoles` become *enforced* (data-driven role→action matrix replacing `ROLE_ACTIONS`), or stay descriptive metadata?
- **Open question 3 (Brad):** instrument "not already running" = availability/reservation, explicitly out of scope (D5). Build a reservation/lease model next, or is ACL exclusivity enough for now?
- **Open question 4 (Brad):** personal-vs-project scope for *drafts* — should a private draft that is filed to a project remain visible to project members (shared) or stay invisible until explicitly shared? The plan implements the latter (private by default, share explicitly), which is what was asked; confirm that project members should see nothing until shared.
- **Open question 5 (Brad):** when a record is *filed* into a project (`filedTo: active-project`), should the project members automatically get a `project` grant on it (making filing = sharing-with-the-project), or is filing purely a filing (private until someone shares)? The plan does the latter and keeps sharing explicit; the former needs a small declared template (e.g. a grant whose principalId resolves to the filing project) — deliberately not invented here.
- **Open question 6 (Brad):** `GRP-LAB-ADMINS` is referenced by the seed but does not exist yet. Either create it during T3 (with its members) or drop the `defaultGrants` from the seed until the lab has an admin group — a grant naming a group that does not exist is inert, so nothing breaks, but lab-owned records would then be administered only by `USR-LOCAL-ADMIN`.
