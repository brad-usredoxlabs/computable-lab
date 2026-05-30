# AI overlays

computable-lab ships with **no AI features**. The deterministic compiler,
record browser, event editor, instrument control, and data collection all
work on their own. The LLM-driven features — the event-editor AI dock, the
fix-it loop, the chat panels, ingestion AI suggestions, and the AI settings
panel — are supplied by an **overlay**: a separate package that implements a
small public contract and is folded into the frontend at build time.

The reference overlay ships only with the [Computable Lab
Appliance](https://github.com/brad-usredoxlabs/cl-appliance). Anyone can write
their own overlay against the same contract to wire computable-lab to their
own model API.

This document is the authoring + integration reference.

---

## The boundary

Three pieces, three licenses:

| Piece | Where | License | Role |
|---|---|---|---|
| **Host** | this repo (`computable-lab`) | AGPL-3.0 | Declares named UI **slots** and a backend AI runtime that activates only when configured. Ships no overlay. |
| **Contract** | [`@cla-lab/ai-extension-api`](https://www.npmjs.com/package/@cla-lab/ai-extension-api) | MIT | Types only: `SlotName`, `ExtensionManifest`, `AiClient`. Both host and overlay depend on it. |
| **Overlay** | your package (e.g. cl-appliance's `@cla-lab/ai-overlay-appliance`) | yours | Implements the contract: a React component per slot, plus an optional `AiClient`. |

The contract package is MIT precisely so that **any** overlay — proprietary or
open-source — can implement it without inheriting the host's AGPL obligations.
An overlay never imports the host's source as a package; it borrows host
modules through the build-time `@cla-lab-host/*` alias (see
[Loading](#how-the-host-loads-an-overlay)), and ships as a separate lazy chunk
(aggregation, not a derivative work).

---

## The contract

Install the contract package:

```bash
npm install @cla-lab/ai-extension-api
```

It exports:

```ts
// Slot identifiers the host renders. An overlay maps any subset to components.
export type SlotName = /* see the slot reference below */

export type SlotComponentMap = Partial<Record<SlotName, ComponentType<any>>>

// The backend contract. Intentionally minimal in v1 — the host owns the
// chat runtime, so an overlay only needs to report health. Future versions
// may widen this.
export interface AiClient {
  getHealth(): Promise<AiHealthStatus>
}
export interface AiHealthStatus {
  available: boolean
  error?: string
  model?: string
  provider?: string
}
export class NullAiClient implements AiClient { /* returns { available:false } */ }

// What an overlay package exports as `manifest`.
export interface ExtensionManifest {
  slots: SlotComponentMap
  aiClient?: AiClient | null
}
export const NULL_MANIFEST: ExtensionManifest // { slots: {}, aiClient: null }
```

> **Why is `AiClient` so small?** In the appliance configuration the AI
> *backend* (agent orchestrator, MCP tool-calling, fix-it) stays inside the
> host and is activated by config (see [The AI backend](#the-ai-backend)). The
> chat UI talks to the host's own `/api/ai/*` routes. So an overlay's
> `AiClient` only needs to answer "is AI up?"; everything else flows through
> the host. An overlay that wants to drive a *different* backend can do so
> from inside its own slot components.

---

## Slot reference

`<Slot name="…"/>` mount points the host renders. A slot with no registered
component renders `<NullSlot>` ("AI feature unavailable"). Props listed are
what the host passes; an overlay's component receives them.

| Slot | Mounted in | Props from host |
|---|---|---|
| `event-editor.dock` | Event editor right dock | _(none — reads editor context)_ |
| `event-editor.fix-it-launcher` | Event editor (floating) | _(none)_ |
| `event-editor.fix-it-panel` | Event editor (drawer) | _(none)_ |
| `event-editor.fix-it-route` | `/event-editor/fixit` page | _(none)_ |
| `chat.panel.global` | Browser, Protocols, labware fixture | `aiContext`, `endpoint?` |
| `chat.panel.literature` | Literature page | `aiContext`, `endpoint?` |
| `chat.panel.materials` | Materials surface | `aiContext`, `endpoint?` |
| `chat.panel.formulations` | Formulations surface | `aiContext`, `endpoint?` |
| `chat.panel.ingestion` | Ingestion surface | `aiContext`, `endpoint?` |
| `chat.panel.protocol-ide` | Protocol IDE | `aiContext`, `endpoint?` |
| `chat.panel.run-workspace` | Run workspace | `aiContext`, `endpoint?` |
| `ingestion.ai-suggestion` | Ingestion upload modal | `suggestion`, `loading`, `onAccept` |
| `ingestion.ai-analysis` | Ingestion upload modal | `analysis`, `onReAnalyze`, `onConfirmAndRun`, `isRunning` |
| `run-workspace.claim-draft` | Run claims/results tabs | `runId`, `chat`, `onRefresh` |
| `settings.ai-section` | Settings page | `ai`, `aiStatus`, `editingSection`, `onEditChange`, `onSave`, `onTest`, `saving` |

Slots are typed loosely (`ComponentType<any>`) at the registry boundary; the
host forwards props through `<Slot {...props}/>`. Match the prop shapes above
in your components.

> The per-surface `chat.panel.*` slots all receive the same prop shape. They
> fan out so an overlay can differentiate chat behavior per surface; the
> reference overlay maps them all to one `AiChatPanel`.

---

## Authoring an overlay

An overlay is an ESM package exporting `manifest`:

```ts
// src/index.ts
import type { ExtensionManifest } from '@cla-lab/ai-extension-api'
import { MyDock } from './MyDock'
import { MyChatPanel } from './MyChatPanel'

export const manifest: ExtensionManifest = {
  slots: {
    'event-editor.dock': MyDock,
    'chat.panel.global': MyChatPanel,
    // …any subset of SlotName
  },
  aiClient: null,
}
export default manifest
```

Your slot components may borrow host modules (the event-editor context, the
API client, shell components, wire types) through the **`@cla-lab-host/*`**
import alias — it resolves to the host's `app/src/*`:

```ts
import { useEventEditor } from '@cla-lab-host/event-editor/EventEditorContext'
import { apiClient } from '@cla-lab-host/shared/api/client'
```

**Build config.** Mark everything the host provides as external so your bundle
stays thin and shares the host's singletons (React, the TipTap editor, host
contexts). With vite library mode:

```ts
// vite.config.ts
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: {
      external: [
        'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client',
        'react-router-dom', /^@tiptap\//,
        '@cla-lab/ai-extension-api',
        /^@cla-lab-host\//,   // ← host modules; the host re-resolves these
      ],
    },
  },
})
```

The resulting `dist/index.js` contains only your overlay-owned code with bare
imports for everything host-side. The host re-resolves those when it bundles
your dist (see below).

---

## How the host loads an overlay

The host build resolves the overlay through a vite virtual module
(`app/vite.config.ts` → `aiOverlayPlugin`). Set the `VITE_AI_OVERLAY`
environment variable to your overlay's package specifier (it must be installed
in the host's `node_modules`), then build the host frontend:

```bash
# in computable-lab/, with your overlay installed:
VITE_AI_OVERLAY=@your-scope/your-overlay npx vite build -w app
```

What happens:

1. `loadOverlay` dynamic-imports `virtual:cla-ai-overlay`.
2. The plugin re-exports your `manifest` from `VITE_AI_OVERLAY`.
3. Vite resolves your dist, re-resolves its bare `@cla-lab-host/*` / `react` /
   `@tiptap/*` imports against the host's own `src/` and `node_modules`
   (the `@cla-lab-host` alias + `resolve.dedupe` ensure single instances),
   and emits your overlay as a **lazy async chunk**.
4. At runtime the host loads that chunk on boot and renders your components in
   their slots.

**Install as a real copy, not a symlink.** `npm install <dir>` symlinks, whose
realpath sits outside the host tree and breaks resolution of bare deps. Pack
to a tarball and install that (`npm pack` → `npm install <tgz>`), or otherwise
ensure your package's files live physically under the host's `node_modules`.

**Bare host (no overlay).** With `VITE_AI_OVERLAY` unset, the virtual module
yields an empty manifest, every `<Slot>` renders `<NullSlot>`, and the host
tree-shakes the overlay away. Deterministic features are unaffected.

---

## MCP tool plugins

The host's MCP server (168 built-in tools) lives in computable-lab and is
**not** part of an overlay. An overlay author who wants to contribute extra
MCP tools (e.g. instrument control) registers them through a plugin:

```ts
// my-tools.js — default export implements McpToolPlugin
export default {
  name: 'my-instrument-tools',
  register(server, ctx, registry) {
    // server.tool(...) / registry.add(...)
  },
}
```

Point the host at it via a colon-separated env var; the host imports each and
calls `register()` after its own tools are registered:

```bash
CLA_MCP_TOOL_PLUGINS=/opt/my-overlay/my-tools.js node server/dist/server.js
```

Contract: `server/src/mcp/toolPlugin.ts`.

---

## The AI backend

The host's AI backend (agent orchestrator, MCP tool-calling, fix-it
coder/critic, AI handlers) ships **in computable-lab**, but stays dormant
until configured. Set an `ai.inference` block in `config.yaml`:

```yaml
ai:
  inference:
    provider: openai-compatible
    baseUrl: http://127.0.0.1:11434/v1   # any OpenAI-compatible endpoint
    model: your-model
  agent:
    maxTurns: 15
```

With no `ai:` block the host serves the deterministic-only handlers and
`/api/ai/*` reports unavailable. The overlay's chat UI talks to the host's
`/api/ai/*` routes on the same origin — no separate service required.

**Remote/third-party backend (advanced).** The host also honors a
`CLA_AI_GATEWAY_URL` environment variable: when set, every `/api/ai/*` request
is reverse-proxied there instead of running in-process. This is dormant
infrastructure for pointing the host at an external AI service that mirrors the
host's route shapes. The appliance leaves it unset and runs the backend
in-process against on-box Ollama.

---

## Worked example

The reference implementation is cl-appliance's
`packages/cla-lab-ai-overlay`. It maps all 15 slots to the AI components that
were originally part of computable-lab, externalizes every host module, and is
folded in by the appliance's `cla-lab-ai-overlay` ansible role. Read it as a
template.
