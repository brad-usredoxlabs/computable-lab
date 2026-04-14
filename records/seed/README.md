# Seed Records

This directory contains records that ship with computable-lab as out-of-box defaults.

## Purpose

These records provide a baseline set of labware, materials, and other entities that
are available even when a user hasn't connected a lab. This improves the out-of-box
experience and allows the deterministic compiler to resolve references without
requiring a connected lab.

## How It Works

At index time, seed records are merged with the connected lab's records. The merge
follows these rules:

1. **Connected-lab records always win**: If a connected-lab record has the same
   `recordId` as a seed record, the connected-lab version is used.
2. **Seed records are fallback**: Seed records appear in the index only if no
   connected-lab record with the same `recordId` exists.

## Directory Structure

```
records/seed/
  README.md              # This file
  labware/               # Seed labware records (*.yaml)
  materials/             # Seed material records (*.yaml)
  protocols/             # Seed protocol records (*.yaml) - future
  studies/               # Seed study records (*.yaml) - future
```

## Customization

**Do not edit seed records to customize them.** If you need to modify a seed record
for your lab:

1. Fork the record into your connected lab's records directory
2. Update the `recordId` to avoid collisions
3. Modify the forked version as needed

Seed records are meant to be immutable defaults. Changes to seed records affect
all users of computable-lab.

## Adding New Seed Records

To add a new seed record:

1. Create a YAML file in the appropriate subdirectory (e.g., `labware/`, `materials/`)
2. Ensure the record is valid according to the schema
3. Use a unique `recordId` that won't collide with common lab record IDs
4. Consider prefixing seed record IDs (e.g., `lbw-seed-*`, `mat-seed-*`)

## Verification

Seed records are automatically included in the index when `IndexManager.rebuild()`
is called. The index will log how many seed records were merged.
