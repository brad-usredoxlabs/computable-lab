# L2-CLARIFY-CARD-1 m2blobfix1 - Unit Report

## Defects Fixed (from advc c1 review)

### D1: unwrapMintBlob rejects QUOTED-KEY JSON blobs
- File: `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx`
- Change: Inserted JSON.parse-first arm after `startsWith('{')` gate in `unwrapMintBlob`.
- Mirrors server's `extractHumanLabel` and same-file `mintNounFromQuery` parse arm.
- Handles `{"mint":{"label":"Nile Red stain"}}` by extracting `.mint.label` or `.mint.name`.
- Falls through to DSL scan on parse failure; returns null for valid JSON without mint block.

### D2: Non-discriminating pins (fixture query byte-equal to inner label)
- Changed fixture inner labels to human case `'Nile Red stain'` with query `'nile red stain'`.
- Added JSON.stringify-form fixture/leg for quoted-key JSON blobs.
- Neuter mutation (`if (unwrapped && false)`) correctly produced 5 failures (>=1 required).

### D3: Report + DONE marker
- This report file.

## Verification Log

| Check | Command | Result |
|-------|---------|--------|
| Baseline | `npx vitest run ...mintblob.card1.test.tsx` | 5 passed (5) |
| RED (fixture change) | same | 1 failed (new JSON leg) |
| GREEN (product fix) | same | 6 passed (6) |
| Neuter mutation | same | 5 failed (>=1 required) |
| Regression | `npx vitest run ...mintseed.card1.test.tsx` | 0 failed (6 passed) |

## Changed Files
- `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` - unwrapMintBlob body only
- `app/src/event-editor/right-pane/ai/ClarificationPicker.mintblob.card1.test.tsx` - human-case fixtures + JSON leg
- `.hermes/plans/reports/L2-CLARIFY-CARD-1-m2blobseed.md` - this report

## Commits
1. `5e93f380` - m2blobfix1: discriminating fixtures + JSON-leg pin (RED)
2. `e0285169` - m2blobfix1: unwrap quoted-key JSON mint blobs (GREEN 6/6)

L2-CLARIFY-CARD-1-m2blobfix1 UNIT m2blobfix1 DONE e028516917fe1d5fae96c69a7b7bb3c44ee4b7e3
