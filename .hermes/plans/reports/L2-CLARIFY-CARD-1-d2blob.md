# L2-CLARIFY-CARD-1 d2blobcloseout Report

## Commit Summary

Commit d41c1f5e: "CARD-1 D2: extract human label from mint blob for display seam"

+136/-3 across 2 files:
- server/src/ai/shorthandChat.ts                    | 68 +++++++++++++++++++++-
- server/src/ai/shorthandChat.mintBlobLabel.test.ts | 71 +++++++++++++++++++++++

## What Changed

Fix where structured token blobs like {mint:{label:clofibrate,domain:chemical}}
were rendered verbatim in clarification prompt, query, and mint label input.

Added extractHumanLabel() helper:
- Extracts inner label from structured token blobs
- Returns plain strings unchanged (byte-identical)
- Returns undefined for malformed blobs (fallback to reason)

Applied at three display seams:
1. Mintability decision (isMintableLabel)
2. Identity key derivation (canonicalLabelKey)
3. Loop escalation copy

Raw unresolvedFact.label stays verbatim (provenance contract).

## Gate Results (Orchestrator-run, not re-executed)
- vitest: 3/3 green
- tsc --noEmit: exit 0

L2-CLARIFY-CARD-1 UNIT d2blobcloseout DONE d41c1f5ec250256a7c8b683cfca01521e501ad05
