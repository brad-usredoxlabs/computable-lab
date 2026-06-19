# Computable-Foundry AI Loop Status Summary

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Document the current state of the computable-foundry AI loop, assess viability of reviving it with Hermes, and compare it to Hermes' `/goal` system.

**Architecture:** Analysis document — no code to implement. The deliverable is understanding.

**Tech Stack:** TypeScript (server/src/ai/), YAML specs (compiler-specs/), Hermes Agent

---

## 1. What Is the "AI Loop"?

The **Protocol Foundry** (the "AI loop") is the breadth-first improvement system for the computable-lab compiler pipeline. Defined in `docs/protocol-foundry-live-pipeline-spec.md` (updated 2026-05-11).

### The Pipeline Stages

```
PDF Collection → PDF Intake → Compiler → Event Graph Review → Architect → Human+AI Review → Coder/Critic/Retry Runner
```

| Stage | Role | Status |
|-------|------|--------|
| Collector | Turns vendor doc search results into durable PDF inputs | Scripted (`foundry:collect`) |
| PDF Intake | Extracts text, creates segment/material-context YAML | Scripted (`foundry:compile`) |
| Compiler | Converts protocol text to event graph proposals | Live code (`server/src/compiler/`) |
| Architect | Reviews compiler output, produces narrow improvement specs | **Not implemented as standalone tool** |
| Human+AI Review | Reviews specs in Protocol IDE inbox | UI exists, review flow partial |
| Coder/Critic | Executes reviewed specs through bounded coding loop | **Not implemented** (`foundry:reviewed-spec-run` script exists but tool file missing) |
| Loop Control | Orchestrates the full loop | Script exists (`foundry:loop-control`), tool file missing |

### Current State of the Foundry Scripts

The npm scripts in `server/package.json` reference tool files that **do not exist on disk**:

| Script | Target File | Exists? |
|--------|-------------|---------|
| `foundry:collect` | `src/tools/protocolFoundryCollect.ts` | **NO** |
| `foundry:compile` | `src/tools/protocolFoundryCompile.ts` | **NO** |
| `foundry:ledger` | `src/tools/protocolFoundryLedger.ts` | **NO** |
| `foundry:loop` | `src/tools/protocolFoundryLoop.ts` | **NO** |
| `foundry:loop-control` | `src/tools/protocolFoundryLoopControl.ts` | **NO** |
| `foundry:reviewed-spec-run` | `src/tools/protocolFoundryReviewedSpecRun.ts` | **NO** |
| `foundry:small-batch` | `src/tools/protocolFoundrySmallBatch.ts` | **NO** |

**Conclusion:** The Foundry pipeline is **designed but not implemented**. The spec describes the architecture, the npm scripts are stubs, but the actual tool code was never written. It is deprecated in the sense that it was planned, then work pivoted to other priorities.

---

## 2. What IS Working (the Active AI Infrastructure)

The **AgentOrchestrator** (`server/src/ai/AgentOrchestrator.ts`, 1875 lines) is live, tested, and functional. It is NOT the Foundry pipeline — it is the **in-editor AI assistant** that helps a user compile protocol text into event graphs.

### What AgentOrchestrator Does Today

```
User types natural language prompt
  → AgentOrchestrator builds system prompt + context
  → LLM inference endpoint (OpenAI-compatible)
  → Multi-turn tool-calling loop (max 15 turns, max 5 tools/turn)
  → Returns validated event graph fragments for preview
```

- **Live code:** `server/src/ai/AgentOrchestrator.ts` (1875 lines)
- **Tests:** 7 test files (~2000+ lines combined)
- **Wired into:** `server.ts` lines 834-860 (created on server startup)
- **Configuration:** `server/src/config/types.ts` — `AIConfig` with `inference` + `agent` profiles
- **Draft flow modes:** `forced-tool` (default), `preflight-deterministic`, `preflight-llm`
- **AI Handlers:** Multiple handler sets (AIHandlers, KnowledgeAIHandlers, IngestionAIHandlers, MaterialAIHandlers)
- **Gateway support:** Can route to remote AI gateway (`aiGatewayUrl`) or local orchestrator

### The Compiler Pipeline (Deterministic)

The deterministic compiler is partially implemented and well-specified:

- **CompilerKernel:** `server/src/compiler/CompilerKernel.ts` — exists, extended
- **Pipeline passes:** `extract_entities`, `tag_prompt`, `ai_precompile`, `expand_biology_verbs`, `resolve_labware`, `apply_directives`, `expand_patterns`, `expand_protocol`, `resolve_roles`, `mint_materials`, `compute_volumes`, `compute_resources`, `derive_execution_scale_plan`, `plan_deck_layout`, `validate`
- **Spec:** `compiler-specs/60-compiler.md` — authoritative
- **AI pre-compiler:** `compiler-specs/80-ai-pre-compiler.md` — describes extraction-draft flow

---

## 3. The Deprecated Documents

The old `specifications/` directory contains deprecated documents, superseded by the `compiler-specs/` suite:

| Deprecated File | Status | Replaced By |
|-----------------|--------|-------------|
| `specifications/biology-compiler.md` | Deprecated | `compiler-specs/10-charter.md` through `80-ai-pre-compiler.md` |
| `specifications/specification.md` | Deprecated | Same suite + CLAUDE.md |
| `specifications/workflow-and-datatypes-manifesto.md` | Deprecated | Same suite |
| `specifications/material-identity-and-resolution.md` | Deprecated (content preserved) | Referenced from `30-context.md`, `80-ai-pre-compiler.md` |
| `specifications/api-and-mcp-reference.md` | Deprecated | Regenerated from compiler metadata |

The authority map (`compiler-specs/00-authority-map.md`) declares which spec owns which concept. The `compiler-specs/` suite is the current authoritative source.

---

## 4. Could Hermes Replace the Foundry Loop?

**Yes, but with a fundamental architecture difference.**

### The Foundry Loop (as designed)

```
Breadth-first, multi-agent, artifact-driven pipeline:
  PDFs → Text → Compiler → Architect → Human Review → Coder → Critic → Rerun
```

- **Artifacts-first:** Every stage writes durable YAML artifacts to disk
- **Multi-model:** Different models for review (thunderbeast:8000), coding (thunderbeast:8000), loop control (thunderbeast:8888)
- **Bounded coder/critic:** The coder gets a narrow spec, attempts a patch, a critic reviews, retry on failure
- **Evidence-chain:** PDF → text → segment → material-context → compiler output → event graph → architect verdict → patch spec → human review → code patch → critic report → rerun result

### Hermes /goal System

```
Standing goal → Persistent agent works across turns until achieved
```

From the Hermes `/goal` command:
- Sets a standing goal that Hermes works on across turns
- Persists across conversation turns
- Subcommands: `status`, `pause`, `resume`, `clear`
- The agent pursues the goal incrementally, using its full toolset

### Comparison

| Dimension | Foundry Loop | Hermes /goal |
|-----------|-------------|--------------|
| **Scope** | Compiler improvement pipeline | Any standing task |
| **Artifacts** | Writes durable YAML at every stage | No artifact discipline built-in |
| **Multi-agent** | Separate roles (Collector, Architect, Coder, Critic) | Single agent, or subagent via `delegate_task` |
| **Boundedness** | Bounded coder/critic/retry loop | No built-in bounds — agent decides |
| **Human-in-the-loop** | Explicit review gates per protocol/variant | Implicit (user can steer mid-turn) |
| **Evidence chain** | Full provenance from PDF to code patch | Session transcripts only |
| **Breadth-first** | One spec per PDF, iterate across many | Depth-first on one goal |
| **Durability** | YAML artifacts survive process restart | Goal survives turns, but no external artifact |

### Key Insight: Hermes Could Run the Foundry, But Differently

The Foundry as designed is an **artifact pipeline** — each stage produces durable state. Hermes `/goal` is a **conversation-driven pursuit** — the agent uses tools to work toward a goal.

**To revive the Foundry with Hermes**, you'd need to:

1. **Keep the artifact discipline.** The Foundry's strength is that every decision is recorded as YAML. Hermes agents should write to `artifacts/` just as the original design intended.

2. **Use Hermes as the executor, not the pipeline.** Instead of writing `protocolFoundryLoop.ts` (which would be another orchestrator in TypeScript), use Hermes as the orchestrator — either via `/goal` or via `cronjob` with a scripted workflow.

3. **Map Foundry roles to Hermes capabilities:**
   - **Collector** → `hermes chat -q` with web search + file write
   - **Architect** → `delegate_task` with compiler output context
   - **Coder** → `delegate_task` with codex/claude-code, or Hermes itself
   - **Critic** → `delegate_task` with code review instructions
   - **Loop control** → `cronjob` or `/goal` with status tracking

---

## 5. Practical Assessment: What Would It Take?

### Option A: Implement the Foundry Scripts (Original Plan)

Write the 7 missing TypeScript tool files (`protocolFoundry*.ts`). Each would be a CLI script that:
- Reads YAML queue files
- Calls the LLM endpoint (InferenceClient)
- Writes artifact YAML
- Updates queue status

**Effort:** ~2-3 weeks of focused work, 7 scripts, each 200-500 lines.

**Risk:** The existing AgentOrchestrator already does multi-turn LLM interaction. The Foundry scripts would duplicate some of that logic or need to call through the existing API.

### Option B: Use Hermes as the Foundry Engine

Replace the TypeScript scripts with Hermes-driven execution:

1. Write a Foundry orchestrator skill for Hermes
2. Define the pipeline stages as skill steps
3. Use `/goal` or `cronjob` to drive the loop
4. Keep artifact YAML as the state machine

**Effort:** ~1 week for skill + pipeline definition, then ongoing execution.

**Advantage:** No TypeScript to maintain. Hermes already handles LLM calls, file I/O, tool execution, error recovery.

**Disadvantage:** Less deterministic control over the pipeline. The Foundry was designed for reproducible batch processing; Hermes is conversational.

### Option C: Hybrid

Keep the existing AgentOrchestrator for in-editor AI assistance. Use Hermes to implement the Foundry pipeline stages that are missing (Architect, Coder/Critic, Loop Control) as external scripts that call the existing API.

**Effort:** ~2 weeks. Best of both worlds — the server API handles compilation and validation, Hermes orchestrates the improvement loop externally.

---

## 6. Recommendation

**Start with Option C (Hybrid).** Reasons:

1. **The AgentOrchestrator works.** Don't reinvent it — use it as the compilation/validation engine.
2. **The Foundry scripts don't exist.** Writing them from scratch is a clean slate — you can design them to call the existing API rather than duplicating logic.
3. **Hermes is already your orchestrator.** You're pairing with me on this codebase right now. Using Hermes to drive the Foundry loop means you get the agent's reasoning, error recovery, and tool access for the parts that need judgment (Architect review, Coder/Critic loop).

### First Steps

1. **Implement the Architect tool** — the narrowest missing piece. It reads compiler output + event graph + browser review, writes a `verdict.yaml` + `patch-spec.yaml`. This is the bottleneck that blocks the rest of the loop.
2. **Implement the Reviewed-Spec Runner** — the coder/critic/retry loop. This is what actually produces code changes.
3. **Wire up the Ledger** — status tracking across the pipeline.

### Files to Touch (Phase 1)

```
server/src/tools/protocolFoundryArchitect.ts     (new — architect review)
server/src/tools/protocolFoundryReviewedSpecRun.ts (new — coder/critic loop)
server/src/tools/protocolFoundryLedger.ts         (new — status tracking)
server/src/ai/InferenceClient.ts                  (existing — reuse for LLM calls)
server/src/ai/AgentOrchestrator.ts                (existing — reuse compilation)
server/src/compiler/pipeline/PipelineRunner.ts     (existing — compilation)
```

---

## 7. Risks and Tradeoffs

| Risk | Mitigation |
|------|-----------|
| Model endpoint unavailable | The spec already handles this — failures become data |
| Architect specs too broad | Enforce narrow specs: one fix per spec, explicit acceptance criteria |
| Coder touches wrong files | Critic stage catches scope violations |
| Foundry loop runs forever | `max-specs` and `max-attempts` flags bound execution |
| Artifact drift | Ledger tracks state; `foundry:ledger status` shows current state |

| Tradeoff | Note |
|----------|------|
| Foundry is breadth-first, not depth-first | You get many small improvements, not one big one |
| Human review is the gate | The loop can't advance past Architect without human review |
| Artifacts accumulate | `artifacts/` grows over time — need a retention/cleanup policy eventually |

---

## 8. Verification

To verify the current state of working vs. non-working components:

```bash
# Check what compiles
npm run typecheck -w server

# Check what tests pass
npm run test:run -w server

# Check if foundry scripts actually work (they won't — files missing)
npm run foundry:ledger -w server -- status --artifact-root artifacts

# Verify the AI orchestrator works
curl http://localhost:3001/api/ai/draft -- ... (needs running server)
```
