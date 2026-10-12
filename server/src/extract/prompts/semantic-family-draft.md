---
target_kind: protocol
version: "1"
description: >-
  W2-6 semantic family draft: turn the FULL vendor-protocol-candidate record
  into a protocol payload of intent steps. Prompt text is DATA — editing it
  needs no code change. No model name, no endpoint, no thresholds live here.
---

You are given the COMPLETE vendor-protocol-candidate record as JSON, followed by
an ID INDEX naming the candidate's own record id and its step/section/table ids.

Produce exactly ONE JSON object (no prose, no code fences) shaped as:

{
  "steps": [ <one intent step per input step> ]
}

Rules:

1. MIRROR THE FULL STEP SET. Emit exactly one step per input step, keeping the
   input step's `stepId` verbatim and its document order. NEVER drop, merge,
   reorder, or split a step. `ordinal` follows document order (1-based). `kind`
   is one of: add_material, transfer, mix, wash, incubate, read, harvest, other.
   `label` is a short human-readable name for the step.

2. Each step is an INTENT step: it carries an `intent` object and NO literal
   vendor execution parameters (no volumes, no temperatures, no well lists).
   `intent` contains:
   - `semanticVerb`: a verb-definition record ref
     `{ "ref": { "kind": "record", "type": "verb-definition", "id": "VERB-..." }, "canonical": "<verb>" }`
     naming what the step MEANS (lyse, bind, wash, elute, incubate, ...).
   - `materialNeeds` (optional): symbolic role needs only.
   - `constraints` (optional): typed constraints copied from the input's own
     quantities (class + bindingKind + typed bound).
   - `provenance` (optional): evidence anchors into the SAID — see rule 3.

3. PROVENANCE REFS ARE COPIED, NEVER INVENTED. A provenance ref is exactly:
   `{ "kind": "record", "type": "vendor-protocol-candidate", "id": "<the candidate record id from the ID INDEX>", "pageStart": <n>, "pageEnd": <n?>, "sectionId": "<an existing candidate section id>", "spanStart": <n?>, "spanEnd": <n?> }`
   — every anchor value COPIED from the input record's own provenance objects
   (the step's, its section's, or its table's). If a conclusion has no such
   copyable anchor, OMIT `provenance` entirely: an omitted anchor is correct
   behavior; a fabricated anchor is data corruption. Never point at another
   document's id, a page beyond the document's page count, or a section that
   does not exist in the input.

4. NEVER emit `branch_axes`, `questions`, or any step-filter / branch-selection
   key. Branch axes are derived and bound server-side from the input's own
   branch sentences. You ask nothing.

5. The input is the whole document: sections (including specifications),
   tables, materials, equipment, labware, notes, outputs, per-step provenance,
   confidences and uncertainty are all present and all may inform the intent
   steps. Do not summarize or filter them.
