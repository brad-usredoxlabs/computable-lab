# Customer and evidence integration v1

Website implementation only. The lab viewer and real evidence exports are external deliverables; fixtures do not enable production visualization. This document supersedes customer authentication and artifact delivery in the original lab-sync v1 document.

## Identity and events

Website owns accounts, verified email, sessions, orders and tube registration. Lab owns analytical records, receipt, accession and release. Stripe owns card data. Customer identity is `tyfcus_<32 random hex>` (`customer.id` in new events), never derived from email. Preserve existing lab CUST records: match the legacy normalized email once, attach the website ID as an alias, and retain the existing Git record ID. Ambiguous legacy matches require operator resolution; never silently create a duplicate or merge accounts. Website emits `customer.identity_assigned` on backfill and `customer.verified` at verification. Historical orders remain unowned until verification, then `order.updated` identifies the customer. Checkout cannot edit an existing profile; addresses on order events are transaction snapshots.

Existing event fields remain supported. Event IDs are opaque; cursor is the ordering key. `sample.registered` adds `sample_id`, `customer_id`, `line_id` (existing `tyforl_<order>_<ordinal>`), and one-based `slot`. One purchased kit is one slot. Globally unique issued TYF codes are assigned only at customer confirmation. Preserve registration separately from physical receipt. `sample.shipped` is per tube and never means received. Send `sample.received` and `sample.accessioned` with barcode and order_remote_id; accession may precede receipt in transport. Website keeps independent timestamps without regressing status. Never apply one tube's receipt to its siblings.

## Evidence export and release

Export one immutable document per sample and report revision, schema `tyf.evidence/1`, viewer API `1`. Include the complete relevant event history, linked records, source Git revisions, original data traces, exact analysis script and supporting calculation inputs. Export shared batch records with other customers' identities and samples removed. The lab must enforce this before upload; the website validates declared sample scope but cannot infer identifying information inside arbitrary scientific files.

Each document has `schema_version`, `viewer_version`, `sample_id` (website sample ID), `barcode`, `events`, `records`, `source_revisions`, `artifacts`. Events use `{id,type,occurred_at,sample_id,record_ids}`; records use `{id,type,sample_id,data}`. Artifact entries use `{id,kind,name,sha256,size}`. Required kinds: `graph`, `trace`, `script`, `inputs`, `zip`; `pdf` optional. Every record/event must belong to the exported sample; use redacted copies of shared records. ZIP is lab-produced and includes the same evidence. Scripts are text downloads, never executed.

All upload calls require X-LAB-TOKEN. POST `/api/lab-sync/artifacts` JSON `{action:"init",id,sample_id,size,sha256}` creates an immutable upload reservation (max 100 MiB). IDs match `[A-Za-z0-9_-]{1,64}`. Retry identical initialization safely. `{action:"status",id}` returns durable byte offset. `{action:"chunk",id,offset,data_base64}` appends at that offset, up to 1 MiB decoded; retries of matching bytes succeed. A different offset returns 409 with expected offset. `{action:"complete",id}` validates exact size and SHA-256; interrupted uploads resume using status. Files remain private and unavailable after completion alone.

Then send `report.released` with existing `order_remote_id`, `report_id`, positive `revision`, optional legacy PDF `artifact_base64`, plus `sample_id`, `barcode`, `evidence` (document above). Upload all evidence before release. Evidence with missing/incomplete artifacts is stored pending, invisible; complete uploads then retry the identical release event. A valid independent PDF remains accessible during this retry. A revision is immutable: conflicting payloads must use a new report revision and event ID. Old revisions remain accessible. Never associate historical order-only reports with a sample by guesswork.

GET `/api/evidence.php?sample_id=…` lists released revisions; add `report_id` and `revision` for a document. GET `/api/artifact.php?id=…&report_id=…&revision=…` resolves only an artifact referenced by a released owned revision. No direct filesystem/public artifact URLs. GET `/api/report.php?order_id=…&report_id=…&revision=…` preserves legacy PDFs with session authorization.

## Standalone viewer deliverable

Extract a read-only build from the existing React editor; do not fork it here. Deliver a versioned self-contained ES module plus license/build provenance, without editor, AI, writes, credentials or direct lab API calls. Export `apiVersion = 1` and `mount(element, {document, resolveArtifact})`, returning `{destroy()}`. `resolveArtifact(id)` returns an authorized same-origin URL for artifacts in this manifest only. Support selecting events and inspecting linked records. All text must be safely rendered. No dynamic execution of scripts or exported HTML. Schema/viewer version mismatches must fail closed with downloads still usable.

Website adapter: `src/lib/client/evidence-viewer.ts`. After the lab build passes fixtures, configure the reviewed same-origin module URL with `TYF_VIEWER_URL`; leave unset before validation. Example: `mountEvidence(node, evidence, resolver, '/lab-viewer/v1/viewer.js')`. Do not treat a fixture viewer as production.

## Rollout and acceptance

Back up the existing database and reports. Run `php scripts/migrate.php` once with deployment traffic paused (MySQL DDL is not transactional). Migrations preserve payment/order/report/event rows and old sample associations; old samples have no invented line/slot. Test SQLite and MySQL against restored copies first. Move old PDF files outside document root and update stored paths before switching traffic. Runtime configuration, database, sessions, mail capture and artifacts must live in the persistent private directory. Never copy development state during deployment.

Production defaults to authentication disabled. Configure `TYF_AUTH_KEY` (at least 32 random bytes), HTTPS `TYF_SITE_URL`, SMTP host/port/user/password/from and TLS; install Composer dependencies. Send a test with `php scripts/mail-test.php address@example.com`; after receipt, configure `TYF_SMTP_VERIFIED=1`. Local development explicitly uses `TYF_ENV=development`, `TYF_MAIL_TRANSPORT=capture`; captured mail stays private. Sessions last 30 days; codes expire in ten minutes with five attempts. Monitor delivery, API errors and pending evidence before rollout. No live payment-mode change or production deployment is part of this implementation.

Run `python3 tests/integration.py`, `npm run build`, PHP lint, and browser acceptance. The test runner uses disposable private storage and signed Stripe test webhook fixtures; a real Stripe test Checkout run, SMTP delivery and physical phone-camera testing remain environment-dependent release gates.

## Operator commands and storage migration

For existing SQLite: with traffic paused, set the private destination, then run
`php scripts/migrate.php --import-legacy /absolute/path/to/old/dev.sqlite`.
The source is retained; SQLite VACUUM INTO includes committed WAL contents.
Migration v3 copies existing readable PDFs into private reports storage and updates
paths. Verify counts and file checksums before archiving old runtime files; old
public `api/var` access is now denied. Missing legacy PDFs need operator recovery.

Inventory: `php scripts/barcodes.php generate 100 > /private/codes.json`,
`node scripts/barcode-labels.mjs /private/codes.json /private/labels.html https://test-your-food.com`.
Print the generated HTML at actual size. Supplier import accepts one code per line:
`php scripts/barcodes.php import supplier.txt`; duplicate imports never reactivate
claimed or retired codes. `retire CODE...` affects only unused issued codes.

Fixture files live in `tests/fixtures/evidence-v1/`. Events and records both carry
`sample_id`; cross-sample references fail validation. Unknown viewer versions keep
released downloads accessible, but the adapter refuses to mount them. Unknown
evidence schemas remain pending. Unresolved lifecycle events can be retried with
the identical event ID and payload after registration is available. Pending evidence
retries also require byte-equivalent JSON field ordering; retain the original event.

Historical samples without a known line/slot remain visible, but block further
registration on that order until support reconciles the association. Migration
recognizes explicit paid status and recorded Stripe payment events; fulfillment
status alone does not establish payment. Unknown legacy payments require review.

The contract test double `tests/fixtures/viewer-v1.mjs` is served only by the test
router. Browser acceptance exercises event selection, linked-record display,
artifact scope, unsupported viewer fallback, and revision switching with this
fixture. It does not certify the future lab-produced viewer.

## Website account API

| Endpoint | Input / response |
| --- | --- |
| POST `auth_request.php` | `{email}`; generic code-sent response, 60-second resend delay, 5 sends/email/hour and 20/IP/hour |
| POST `auth_verify.php` | `{email,code}`; consumes code, claims matching historical guest orders, rotates session cookie, returns `csrf` and customer identity |
| GET `session.php` | `authenticated`, `signin_enabled`, `customer`, `csrf`; no session secret in JSON |
| POST `logout.php` | `{}`; revokes current server-side session and clears cookie |
| GET `orders.php` | All owned orders; `?order_id=N` returns one owned order with lines, sample counts, samples and report revisions |
| POST `sample_register.php` | `{barcode,order_item_id,slot,description,customer_label?}`; returns stable `sample_id`; slot is one-based; type comes from purchased line |
| POST `sample_shipped.php` | `{sample_ids:[...]}`; all-or-nothing ownership check, one event per previously unmailed tube |

All mutation calls require an exact configured Origin and application/json.
Authenticated mutations also require `X-CSRF-Token` returned by session/verify.
Verification is capped at five attempts/code, 30/email/hour and 60/IP/hour.
IP means REMOTE_ADDR; do not trust arbitrary forwarded headers. A reverse proxy
must establish the real client address at the web-server layer. Customer email
changes, merges and confirmed sample corrections remain support operations.

After validation, store the lab-supplied viewer under `public/lab-viewer/v1/`
so it is included in the normal reviewed build and deployment. The deployment
copies tracked API files only and never synchronizes the private runtime directory.
