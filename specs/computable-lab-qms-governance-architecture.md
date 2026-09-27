# Computable Lab QMS Governance Architecture

## Purpose

Computable Lab was originally designed as a flexible, Git-native experimental laboratory framework.

To support **test-your-food.com** and other regulated or quality-managed laboratory deployments, Computable Lab should gain a stronger **QMS governance layer** without sacrificing the loose, iterative scientific workflow that makes the platform useful.

The core design principle is:

> **Do not turn the scientific layer into bureaucracy. Add governance around the transitions that make records authoritative.**

This means preserving flexible experimentation while adding explicit controls for identity, authorization, versioning, approval, signatures, auditability, and controlled state transitions.

---

# 1. Two-layer architecture

Computable Lab should be thought of as two coupled layers.

```text
COMPUTABLE LAB
────────────────────────────────

Scientific layer
  flexible
  iterative
  experimental
  AI-assisted
  drafts
  ad-hoc analysis
  evolving protocols

             +

Governance / QMS layer
  identities
  roles
  permissions
  lifecycle states
  approvals
  e-signatures
  version control
  audit trail
  controlled release
  deviations / nonconformance
  retention
```

The scientific layer remains permissive.

The governance layer determines when something becomes an **official laboratory record**.

---

# 2. The central QMS concept: governed state transitions

The most important addition is lifecycle state.

A controlled method might move through:

```text
draft
  ↓
in_review
  ↓
approved
  ↓
effective
  ↓
superseded
  ↓
retired
```

A test run might move through:

```text
planned
  ↓
in_progress
  ↓
completed
  ↓
reviewed
  ↓
released
```

A report might move through:

```text
draft
  ↓
technical_review
  ↓
approved
  ↓
released
  ↓
amended
```

The QMS should not primarily be implemented as special UI behavior.

It should be implemented as **policy-controlled legal transitions**.

Example:

```yaml
record_type: analytical_method

transitions:

  draft -> approved:
    requires:
      role: method_reviewer
      signature: true

  approved -> effective:
    requires:
      role: quality_manager
      signature: true

  effective -> superseded:
    requires:
      replacement_version: true
      signature: true
```

This becomes the foundation of QMS behavior.

---

# 3. Roles should govern actions, not only files

Permissions should not be modeled only as:

```text
user A may edit document type X
```

Instead, model capabilities and authorizations.

Example:

```yaml
user: person:analyst_001

roles:
  - analyst

authorizations:
  - assay: gc_fid_fatty_acid_profile

permissions:
  - execute_run
  - enter_observations
  - sign_execution
```

A technical reviewer might have:

```yaml
roles:
  - technical_reviewer

permissions:
  - review_result
  - reject_result
  - approve_result
```

but not:

```text
alter_raw_observation
```

A quality manager might have:

```yaml
roles:
  - quality_manager

permissions:
  - approve_method
  - release_controlled_document
  - close_nonconformance
  - authorize_policy_change
```

This is more useful than simple ACLs because it matches how real laboratory authority is assigned.

---

# 4. Authorization should be method-specific where needed

A user may be generally an analyst but not authorized for every method.

Example:

```yaml
type: authorization
id: AUTH-2026-0018

person: person:analyst_001

scope:
  assay: gc_fid_fatty_acid_profile

status: active

effective_at: 2026-09-01

granted_by: person:quality_manager
```

This allows rules such as:

```text
Only users authorized for Method X may execute Method X.
```

This is preferable to over-broad global roles.

---

# 5. Versioned controlled objects

Git already gives Computable Lab a strong foundation for version history.

The QMS layer should add **semantic version state**.

For example:

```text
method.yaml @ commit ABC123
```

may represent:

```yaml
record_type: analytical_method
version: 3
state: effective
```

A later edit should not silently modify the effective record.

Instead:

```text
ABC123   Version 3 — effective
   |
   v
DEF456   Version 4 — draft
```

Version 3 remains authoritative until Version 4 is reviewed and approved.

The key distinction is:

> **Git history records every change. QMS state determines which version is authoritative.**

---

# 6. Never rewrite signed history

Once a record version has been signed or approved, it should remain addressable forever.

Do not conceptually overwrite:

```text
approved result
```

Instead create a new version, amendment, correction, or superseding record.

Example:

```text
RESULT-172 v1 — approved
        |
        +--> amendment
                |
                v
        RESULT-172 v2 — approved
```

The original remains intact.

This is especially important for:

- reports;
- analytical methods;
- deviations;
- validation records;
- results;
- training records;
- corrective actions.

---

# 7. Electronic signatures

An e-signature should be an explicit immutable record.

Example:

```yaml
type: signature
id: SIG-2026-00981

signed_by: person:brad

action: technical_approval

subject:
  record: RESULT-2026-00182
  version: git:4b712f9

meaning:
  code: approved
  statement: >
    I have reviewed this result and approve it for release.

signed_at: 2026-09-26T19:34:17-04:00

authentication:
  method: password_reauthentication
```

The critical relationship is:

```text
SIGNATURE
    |
    v
EXACT RECORD VERSION / HASH
```

not merely:

```text
SIGNATURE
    |
    v
MUTABLE RECORD ID
```

If the content changes, the old signature must still point to the exact content that was signed.

---

# 8. Signature semantics should be explicit

A signature should record what the signer meant.

Examples:

```text
executed
reviewed
approved
verified
released
witnessed
acknowledged
```

The system should not treat every signature as equivalent.

A technical approval is different from:

```text
I performed this step.
```

and both are different from:

```text
I acknowledge receipt of this training.
```

---

# 9. Re-authentication for significant signatures

For important controlled actions, require re-authentication at the time of signing.

Possible mechanisms:

```text
password re-entry
passkey
WebAuthn
hardware key
second-factor confirmation
```

The exact mechanism may vary by policy package.

The important point is that:

```text
being logged in
```

should not automatically equal:

```text
providing an electronic signature
```

for high-significance actions.

---

# 10. Audit events

Meaningful QMS actions should generate append-only audit events.

Example:

```yaml
type: audit_event
id: EVT-2026-019188

actor: person:brad

action: sample_accessioned

subject:
  type: sample
  id: SMP-2026-01231

occurred_at: 2026-09-29T09:14:22-04:00

source:
  system: computable-lab
```

Other examples:

```text
record_created
record_modified
record_reviewed
signature_applied
method_approved
sample_received
run_started
run_completed
result_rejected
report_released
deviation_opened
nonconformance_closed
```

Git provides repository history, but explicit audit events are still useful because they capture **domain meaning**.

---

# 11. Documents versus records

Computable Lab should distinguish **controlled documents** from **records**.

## Controlled documents

Describe how work should be performed.

Examples:

```text
method
SOP
policy
work instruction
validation protocol
quality manual
```

These typically need:

```text
revision
review
approval
effective date
supersession
retirement
```

## Records

Provide evidence of what actually happened.

Examples:

```text
sample receipt
assay run
instrument calibration
QC result
result review
training completion
report release
```

These normally need:

```text
creation
completion
locking
review
correction/amendment history
retention
```

Do not treat a historical execution record like a document that is casually revised.

---

# 12. Correction versus revision

For controlled documents:

```text
edit -> new revision
```

For execution records:

```text
mistake -> correction/amendment record
```

Example:

```yaml
type: record_correction
id: CORR-2026-0018

subject:
  record: SAMPLE-2026-1001
  version: git:abc123

field: received_weight

old_value: 10.2
new_value: 12.2

reason: transcription error

corrected_by: person:analyst_001
corrected_at: 2026-09-30T10:21:00-04:00
```

The original value should remain reconstructable.

---

# 13. Policy packages

Computable Lab should support deployment-specific policy packages.

The core should provide the governance primitives:

```text
identity
roles
permissions
authorizations
signatures
states
transitions
audit events
version references
```

Policy packages determine how strict those primitives are.

Possible layout:

```text
policies/
  research-lab/
  iso-17025/
  glp/
  gmp/
  test-your-food/
```

---

# 14. Research mode versus regulated mode

A flexible research deployment might use:

```yaml
policy_packages:
  - research-lab
```

A Test Your Food installation might use:

```yaml
policy_packages:
  - iso-17025
  - test-your-food
```

A stricter future environment might use:

```yaml
policy_packages:
  - gmp
  - electronic-records-strict
```

The schemas do not need to change dramatically.

The allowed actions and transitions change.

---

# 15. Example: method editing under different policies

## Research mode

```text
Edit method
    ↓
Save
    ↓
Use it
```

## ISO-style controlled mode

```text
Edit method
    ↓
New draft revision
    ↓
Review
    ↓
Approval + signature
    ↓
Effective
    ↓
Eligible for controlled use
```

The same record type can therefore behave differently under different policy packages.

---

# 16. QMS primitives

The following should be treated as foundational platform capabilities.

## 1. Identity

Every meaningful action is attributable to a user or system identity.

## 2. Roles and authorization

Users are permitted to perform specific governed actions.

Where appropriate, authorization is method-, assay-, instrument-, or scope-specific.

## 3. Versioned controlled objects

Every controlled object has immutable historical versions.

## 4. Lifecycle state machines

Each controlled record type has allowed states and transitions.

## 5. Electronic signatures

Signatures bind a person, action meaning, timestamp, and exact record version.

## 6. Immutable audit events

Meaningful QMS actions generate append-only events.

## 7. Policy packages

Installations select governance rules appropriate to their environment.

These seven capabilities form the QMS governance runtime.

---

# 17. Higher-order QMS features become ordinary records

Once the primitives above exist, many traditional QMS modules can be implemented as normal Computable Lab records and workflows.

Examples:

```text
training
competency
deviation
nonconforming_work
CAPA
equipment_calibration
document_control
internal_audit
management_review
supplier_qualification
method_validation
change_control
```

Each of these uses the same platform primitives:

```text
record
+ lifecycle
+ permissions
+ review
+ signature
+ audit trail
+ Git history
```

This avoids creating a separate monolithic "QMS subsystem."

---

# 18. Example deviation workflow

A deviation can be a first-class record.

```yaml
type: deviation
id: DEV-2026-0019

subject:
  run: RUN-2026-00918

description: >
  Incubation exceeded specified time by 11 minutes.

state: open

opened_by: person:analyst_001
opened_at: 2026-09-29T14:12:00-04:00
```

Possible lifecycle:

```text
open
  ↓
under_review
  ↓
impact_assessed
  ↓
approved
  ↓
closed
```

Policy may require:

```text
analyst can open
technical reviewer can assess
quality manager can close
```

No special QMS application architecture is required beyond the shared governance primitives.

---

# 19. Example training / competency model

Training and competency should also be records.

Example:

```yaml
type: competency
id: COMP-2026-0042

person: person:analyst_001

scope:
  method: gc_fid_fatty_acid_profile

evidence:
  - training: TRAIN-2026-0091
  - observed_run: RUN-2026-00812
  - proficiency_result: PROF-2026-0017

decision: authorized

approved_by: person:quality_manager
```

This can feed directly into authorization logic.

For example:

```text
Can person X execute Method Y?
```

becomes a graph/policy query rather than a manually maintained spreadsheet.

---

# 20. Example controlled-use enforcement

Before a controlled assay run starts, Computable Lab can evaluate:

```text
Is the selected method effective?

Is the operator authorized?

Is the required instrument in valid calibration?

Are required controls defined?

Are required reagents within validity?

Is the sample in an allowed state?
```

If policy requires all conditions to be true, the run cannot transition from:

```text
planned
```

to:

```text
in_progress
```

until they pass.

This is where the QMS becomes active rather than simply documentary.

---

# 21. Policy engine concept

The policy engine should answer questions such as:

```text
Can this actor perform this action on this record now?
```

Conceptually:

```yaml
action: start_run

actor: person:analyst_001

subject:
  type: assay_run
  id: RUN-2026-00918
```

Policy evaluation may inspect:

```text
actor roles
actor method authorization
record state
method state
equipment calibration state
sample state
required approvals
installed policy packages
```

Result:

```yaml
allowed: false

reasons:
  - instrument calibration expired
```

The UI can then explain the blocked transition.

---

# 22. AI must operate through the same governance layer

AI-generated actions should not bypass QMS controls.

An AI agent may propose:

```text
create draft method
create analysis
prepare report
open deviation
suggest corrective action
```

But governed state transitions should still pass through the same policy engine.

For example:

```text
AI generates report draft
        ↓
report state = draft
        ↓
human technical review
        ↓
human signature
        ↓
released
```

This is important for preserving the existing AI-driven Computable Lab architecture without allowing agents to silently create authoritative laboratory records.

---

# 23. Git-native implementation

Git remains useful for:

```text
version history
content hashes
diffs
branching
backup
replication
provenance
```

But Git does not by itself provide:

```text
approval semantics
effective state
role authorization
signature meaning
record lifecycle
QMS policy
```

Therefore:

> **Git provides the immutable-ish history substrate. The governance layer provides regulatory meaning.**

---

# 24. Recommended record metadata

Controlled records should have a common governance envelope.

Example:

```yaml
governance:

  state: approved

  created_by: person:analyst_001
  created_at: 2026-09-29T10:00:00-04:00

  version:
    git_commit: abc123

  approvals:
    - SIG-2026-00182

  policy:
    packages:
      - iso-17025
      - test-your-food
```

Not every record needs every field physically embedded in YAML; these relationships may be represented separately in the graph.

The important requirement is that the information is queryable.

---

# 25. Recommended architecture

```text
                    COMPUTABLE LAB

                 Scientific Record Graph
                          |
                          v
                 Governance Runtime
                  /       |       \
                 /        |        \
                v         v         v
          Policy Engine  Roles   Signatures
                |
                v
         State Transitions
                |
                v
         Audit Event Stream
                |
                v
             Git History
```

Higher-order QMS workflows sit on top:

```text
training
deviations
CAPA
document control
calibration
validation
internal audit
management review
```

---

# 26. Test-Your-Food deployment

For test-your-food.com, a deployment might look like:

```text
Computable Lab Core

    +

ISO-17025 policy package

    +

Test-Your-Food domain package

    +

Test-Your-Food workflow policies
```

Result:

```text
customer order
   ↓
sample registration
   ↓
sample receipt
   ↓
contract / request review
   ↓
authorized assay execution
   ↓
QC
   ↓
technical review
   ↓
signed report release
```

Computable Lab becomes the local authoritative QMS/execution system while test-your-food.com remains the customer-facing commerce and reporting portal.

---

# 27. Architectural recommendation

Do not build a separate giant "QMS module."

Instead, add a **governance runtime** to Computable Lab.

The runtime should provide:

```text
identity
roles
permissions
scope-specific authorization
state machines
policy evaluation
version references
electronic signatures
audit events
record locking
correction/amendment semantics
```

Then build QMS concepts as ordinary records and workflows using those primitives.

This preserves the flexible architecture while allowing strict installations to behave like controlled laboratory systems.

The desired outcome is:

```text
Loose research lab:
Computable Lab + permissive policy

Test Your Food:
Computable Lab + ISO-17025-style policy + Test-Your-Food package

Future regulated deployment:
Computable Lab + stricter policy packages
```

The core platform remains the same.

Only the **governance rules governing when records become authoritative** change.

---

# Implementation status (2026-09-27)

Implemented via `.hermes/plans/2026-09-26_203123-qms-governance-gap-plan.md`. Verified by `server/src/governance/governanceStrictness.test.ts` (the §15 claim, executable) plus per-feature suites named below.

| Spec § | Capability | Status | Where |
|---|---|---|---|
| §1–2 | Two-layer + governed state transitions | DONE (pre-existing + hardened) | `server/src/lifecycle/` (XState engine, YAML lifecycles), gate in `RecordHandlers`/`MaterialLifecycleHandlers` |
| §3–4 | Roles govern actions; method-specific authorization | DONE | `role-grant` records + `RoleResolver`; method/assay scoping pre-existing via `competency-authorization` |
| §5 | Git history vs authoritative version | PARTIAL | lifecycle `state` + policy bundle; semantic version pinning rides on transition audit events (`data.commitSha`) |
| §6 | Never rewrite signed history | DONE | `server.appendOnlyKinds` → 405 `APPEND_ONLY` on update/delete of `signature`/`audit-event` |
| §7–8 | E-signatures with explicit semantics | DONE | `signature` record (SIG-, action enum, binds `subject.gitCommit`); `requires_signature` guard fails closed unless `signatureAction` declared in YAML |
| §9 | Re-authentication at signing | DONE (password only) | `POST /signatures` step-up via CredentialStore; passkey/WebAuthn mechanisms DEFERRED |
| §10 | Audit events | DONE (core hooks) | `audit-event` record + `AuditEventService`; emitted on governed transitions + signature application. login/run_started hooks DEFERRED |
| §11–12 | Documents vs records; correction vs revision | PARTIAL | lifecycles split the two classes; `record_correction` schema DEFERRED |
| §13–15 | Policy packages; research vs regulated mode | DONE | `enforceTransitionRoles` bundle setting (sandbox/notebook allow, tracked/regulated deny); same schemas, different strictness — proved by `governanceStrictness.test.ts` |
| §16 | Seven QMS primitives | DONE | identity (pre-existing auth), roles+grants, versioned objects (git), state machines, signatures, audit events, policy bundles |
| §17–20 | QMS features as ordinary records; controlled-use enforcement | PARTIAL | deviation/competency/calibration records pre-existed; controlled-use preconditions on planned→in_progress not yet wired to the new policy engine |
| §21 | Policy engine queries | PARTIAL | transition-time evaluation implemented; general "can this actor do X" query API DEFERRED |
| §22 | AI operates through governance | DONE by construction | AI writes flow through `RecordHandlers.updateRecord` → same gate; agent identities are user records |
| §23–24 | Git substrate; governance envelope | PARTIAL | git commits recorded in audit-event data; no embedded `governance:` block (queryable via graph, per §24's own allowance) |
| §25–27 | Runtime architecture; TYF deployment | DONE (core) | deployment-specific TYF package DEFERRED (own spec drop) |

Deliberately deferred, not faked: `record_correction`, retention rules, WebAuthn/passkey re-auth, TYF domain package, general policy-query API, lifecycle-state bypass audit of non-RecordHandlers `store.update` callers.
