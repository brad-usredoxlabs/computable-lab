# computable-lab — Specification

## Purpose

computable-lab is a declarative, schema-driven laboratory information and knowledge system.

Its core goals are:
- All domain meaning is expressed as data, not code
- Records are stored in Git and versioned transparently
- Validation, UI, and business rules are schema-defined
- JSON-LD provides graph semantics and search glue
- Code exists only to interpret, validate, render, and derive from data

This repository is the **source of truth** for both data and structure.

---

## Core Concepts

### Record
A record is a versioned YAML/JSON document stored in Git.

Each record:
- Has a canonical `recordId`
- Is governed by a single schema
- May reference other records
- Has derived identifiers and graph metadata

### Record Identity
- `recordId` is canonical and human-authored
- `@id` is **always derived**, never authored
- `@context` and `@type` are derived from schema + namespace configuration

### Schema Triplet
Every schema consists of three coordinated specifications:

1. `*.schema.yaml` — structural validation (JSON Schema)
2. `*.ui.yaml` — UI rendering hints (forms, widgets, layout)
3. `*.lint.yaml` — business rules and cross-field constraints

Business logic must live in lint specifications, not code.

### Git as Source of Truth
- Records are created, edited, and versioned via GitHub API
- No separate authoritative database exists
- Derived artifacts (indices, graphs) must be rebuildable from Git

### JSON-LD
JSON-LD is used as:
- A semantic interchange format
- A graph-building mechanism
- A search and reasoning substrate

Records are converted deterministically into JSON-LD.

---

## Non-Goals

- No hard-coded workflows
- No domain logic in UI components
- No hidden mutable state
- No opaque databases as authorities
- No imperative “business services”

---

## Security Model

- Secrets (API keys, tokens) are never committed
- Settings are split into committed and local-only files
- All derived data must be reproducible

---

## Stability Promise

This document describes **what computable-lab is**.
Implementation details may evolve, but these concepts are stable.
