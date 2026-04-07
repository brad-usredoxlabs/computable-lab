# Changelog

All notable changes to computable-lab will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-28

### 🎉 Initial Stable Release

This release marks the **stable kernel** of computable-lab. The API is now frozen and UI development can proceed independently.

### Architecture

The system follows the **Prime Directive**: *If something can be expressed as data, it must be expressed as data.*

- **Schema-First**: All structural constraints live in `*.schema.yaml`
- **Lint-First**: All business rules live in `*.lint.yaml`
- **UI-First**: All rendering hints live in `*.ui.yaml`
- **No Schema-Specific Code**: Code is generic; all domain logic is in specs

### Test Coverage

- **302 tests passing**
- **10 test files**
- All layers tested: schema, validation, lint, repo, store, jsonld, ui, api

### Schema Inventory

**30 schemas loaded:**

| Domain | Schemas |
|--------|---------|
| Core | common, record, datatypes (amount, file-ref, ref) |
| Studies | study, experiment, experiment-narrative, run, run-timeline |
| Lab | instrument, labware, labware-instance, material |
| Knowledge | claim, assertion, evidence, well-context |
| Workflow | protocol, plate-event.* (8 event types) |
| Meta | lint-v1, ui-v1 |

**14 complete schema triplets** (schema + lint + ui)

### API Endpoints

| Category | Endpoints |
|----------|-----------|
| Health | `GET /health` |
| Records | `GET/POST /records`, `GET/PUT/DELETE /records/:id` |
| Schemas | `GET /schemas`, `GET /schemas/:id`, `GET /schemas/by-path/:path` |
| Validation | `POST /validate`, `POST /lint`, `POST /validate-full` |
| UI | `GET /ui/specs`, `GET /ui/schema/:schemaId`, `GET /ui/record/:recordId` |

### Documentation

- `API.md` - Complete API reference
- `specification.md` - System specification
- `.clinerules` - Agent development rules

### Breaking Changes

None - this is the initial stable release.

---

## Stability Lock

As of v1.0.0, the kernel is **feature-frozen**:

1. **No new API endpoints** will be added without major version bump
2. **No schema-specific code** will be added to the kernel
3. **All future domain logic** must go in `*.lint.yaml` or `*.ui.yaml`
4. **UI development** can proceed independently using the API

### What Can Change in 1.x

- Bug fixes
- Performance improvements
- New lint predicate operators (backwards compatible)
- New UI widget types (backwards compatible)
- Additional schema triplets

### What Requires 2.0

- Breaking API changes
- Schema format changes
- Envelope structure changes
