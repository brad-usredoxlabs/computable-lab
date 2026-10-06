# AI drafting, declarative page invocation, and native UI projection

Status: implementation contract for [Foundational Principles, principle 12](computable-lab-principles.md#12-declarative-page-invocation-ai-proposes-the-compiler-projects-the-scientist-accepts). Applies to every AI-driven workflow, including navigation and page composition. First form adapter: sequence/oligo authoring; universal adoption is an architectural requirement, not a claim that every surface is already implemented.

## Boundary

A user describes the desired outcome. A model proposes structured, declarative page
and workflow intent: the page or pages to invoke, context, layout, proposed values,
and operations. It can select and compose the screens needed by the request,
independently of the currently open page. The deterministic compiler resolves,
normalizes, validates, evaluates policy, and projects that intent onto the native UI.
The scientist reviews the actual editable fields, composed page, or established
graph/diff surface. Only explicit acceptance can commit the invocation, materialize
canonical records, or execute the proposed work. A schema-valid model response is
not a compiled draft or permission to render an actionable proposal or save.

Use the existing CompilerKernel, CompilationResult, diagnostics, provenance, and YAML
compile-pipeline runner. Domain adapters supply normalization, binding, projection,
and ordinary persistence; do not introduce a second validation or policy authority.
Action vocabulary, field contracts, and domain rules live in schema/lint/UI YAML.

## Declarative page invocation

Page selection, composition, context binding, and action invocation belong to the
same declarative contract. The compiler validates the complete invocation before
the renderer redraws the page as a ghosted proposal. UI and operation definitions
are extensible so requests can span workflows and pages. Unsupported capabilities
or missing context produce diagnostics; the model cannot claim they were invoked.

The preview must identify the requested context and effects and expose Accept,
Reject, and revision through chat. Reject restores the previous working page,
selection/context, and unsaved values. Direct edits recompile without inference;
AI revisions include those edits and compiler diagnostics and are compiled again
before projection. Neither preview rendering nor navigation into a preview executes
the proposed work. Acceptance applies the reviewed invocation without another AI
call, subject to the ordinary policy and concurrency checks.

The lifecycle below is the first form adapter's implementation of this universal
contract. Its endpoints and sequence-specific fields do not limit the page
invocation model or require other editors to replace their existing review surfaces.

## Draft lifecycle

1. Capture the target and its version plus the current unsaved working form as a
   separate baseline. Submit the structured proposal to `POST /api/drafts/compile`.
2. Compile without canonical writes, revision captures, tool execution, or inference.
   Draft/session history may be persisted. Return CompilationResult plus draft ID,
   revision, review hash, field projection, dependencies, and pipeline trace.
3. Project the proposal into native controls. Mark proposed fields with borders and
   labels, never low-opacity text. Keep Accept and save / Reject visible. Diagnostics
   belong beside the review; raw YAML is optional collapsed inspection.
4. A direct field edit deterministically recompiles. Pending or blocked drafts cannot
   be accepted. Follow-up chat receives the current working proposal and diagnostics
   and revises the same draft. Discard superseded responses; switching targets
   invalidates pending responses. Reject restores the unsaved baseline exactly.
5. Accept sends draft ID, revision, and reviewed hash. The server rechecks actor,
   source versions, policy, and the deterministic plan. Prevalidate the entire write
   set before the first canonical write. No additional AI call is permitted.
6. Commit exactly the reviewed values. Creation retries reuse stable IDs and receipts;
   concurrent duplicate Accept cannot duplicate records. A partial storage failure
   remains incomplete and retryable, never successful. Do not describe a multi-record
   filesystem commit as atomic. After success, show the saved object in the editor,
   remove proposal styling, and refresh the library.

Drafts are bound to their authenticated actor. Client-provided identity, success flags,
write plans, and policy decisions are never trusted. A stale source requires explicit
reload/review; never silently rebase or re-propose. Existing authorization, immutable
revision, lifecycle, and regulated signoff gates remain authoritative.

## Sequence adapter

`save_sequence` and `create_oligo` project into sequence name, alphabet, topology,
residues, modification position/label/role/base index, and vendor. Sequence edits
create a new sequence with an immutable parent revision; they never rewrite a sequence
used by prior analyses. All modified fields and preserved provenance are inspectable.
A combined oligo proposal plans its sequence, immutable sequence revision, oligo,
oligo revision, and receipt together. FAM/QSY chemical modifications belong on the
oligo; primer/probe meaning and instrument channel relationships remain contextual
assay assignments. No fabricated chemistry, assay role, or detection evidence.

The latest user request accompanies an AI authoring proposal through compilation
and persisted review history. A new oligo does not inherit the selected record's
parent revision, bases, or modifications. Explicit revisions may preserve those
fields; selection alone is not a derivation request. The sequence adapter checks
unambiguous literal bases against that request using its declared fidelity rule.
A mismatch blocks acceptance and is eligible for bounded AI correction before
projection. Direct user edits supersede the earlier request and recompile.

The adapter uses a staging store to run the existing authoring implementation without
I/O writes. The staging store exposes only reads and validated staged creates;
unsupported mutations fail closed. Only YAML-registered authoring operations may run
there. This keeps normalization and persisted values identical to manual authoring.

## Adoption and parallel work

| Surface | Adoption |
| --- | --- |
| Sequence/oligo authoring | First native form application, compile/accept API |
| Event graph drafting | Existing draft preview and accept/discard are the reference pattern |
| Protocol edits (lane 2 PROTO-AI) | Existing ChangesPanel remains the review surface; no new per-op rail approvals |
| Cross-page invocation and composition | Universal contract specified; runtime adoption must be tracked by surface and is not supplied by the first form adapter |
| Generic AiDraftBar / record drafting | Legacy; migrate through a registered adapter in a later change |
| Sequence assays, analysis, endpoints, imports, knowledge | Existing explicit structured review/manual controls; native projection is later work |

Lane 2's approved decisions are binding: ordinary write paths, expectedSha, identical
human/AI gates, and “Someone changed this protocol - reload and try again.” No automatic
re-proposal. Protocol roles remain reusable; concrete instances belong to run bindings.
This contract does not change the lane's router spike, deployment, or approval scope.
QMS approval is distinct from accepting an editor draft; acceptance does not confer a
regulated signature or authorize a lifecycle transition.

## Required verification

Prove no canonical records or revisions change before accept or on reject. Verify
exact FAM/QSY fields, direct-edit recompilation and acceptance without inference,
actor isolation, stale draft/source rejection, superseded responses, partial failure
and retry, retained unsaved baseline, visible review controls, keyboard operation,
and readable light/dark inputs. For page invocation adapters, also prove compilation
precedes the redraw, the requested context is visible, previewing a workflow does
not execute it, rejection restores the previous working page, and revised page
invocations recompile before rendering. Report unimplemented adapters as such.
