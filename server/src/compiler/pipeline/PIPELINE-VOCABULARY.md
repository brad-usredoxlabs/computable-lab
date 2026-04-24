# Pipeline vocabulary

This document fixes the vocabulary used across pipeline YAMLs,
loader code, schema, runner, and specs.

## Conditional activation: `when`

The only sanctioned field name for conditional pass activation is
**`when`**. Do not introduce `shouldRun`, `enabled`, `activate`,
`if`, or any synonym.

- Shape: `when?: string` — optional, dotted path into the runner's
  state (e.g. `outputs.ai_precompile.directives`).
- Current semantics: parsed and preserved on the `PassSpec`, but
  not yet evaluated at runtime. Passes run unconditionally today.
- Target semantics: the pipeline runner evaluates the path and
  skips the pass (emits a diagnostic at `info` severity) when the
  resolved value is falsy, an empty array, or an empty object.
  Evaluation logic lands in spec-041 (Phase K, chatbot pipeline
  wire-up).

## Why one term

Earlier drafts in `specifications/` occasionally said `shouldRun`.
Mixing terms creates spec drift. `when` is short, aligns with
GitHub Actions and similar YAML ecosystems, and reads naturally
in pass declarations.

See `specifications/compile-pipeline-universals-plan.md` for
where this vocabulary was chosen.
