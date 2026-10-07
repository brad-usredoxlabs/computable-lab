/**
 * PB-CH-6 — union pin, no drift: the generic stack's `AiStreamEvent` channel
 * members (types/ai.ts) must structurally mirror the wave-1 channel members
 * (assistStream.ts). Both unions are fed by the SAME server handler
 * (POST /ai/assist/stream — AgentOrchestrator emits {type:'workstate_proposal',
 * workstate} / {type:'agent_action', action}); two hand-maintained unions that
 * drift is exactly the defect class PB-CH-6 closes. This is a source-pin test:
 * it reads both files and asserts the member shapes match.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const aiTypesSrc = readFileSync(resolve(here, 'ai.ts'), 'utf8')
const assistSrc = readFileSync(resolve(here, '../event-editor/right-pane/ai/assistStream.ts'), 'utf8')

describe('AiStreamEvent ↔ AssistStreamEvent channel-member pin (PB-CH-6)', () => {
  it('types/ai.ts carries the workstate_proposal member with the verbatim wire shape', () => {
    expect(aiTypesSrc).toMatch(
      /export interface AiWorkstateProposalEvent \{\s*\n\s*type: 'workstate_proposal'\s*\n\s*workstate: Record<string, unknown>\s*\n\s*\}/,
    )
    expect(aiTypesSrc).toMatch(/\|\s*AiWorkstateProposalEvent/)
  })

  it('types/ai.ts carries the agent_action member with the verbatim wire shape', () => {
    expect(aiTypesSrc).toMatch(
      /export interface AiAgentActionEvent \{\s*\n\s*type: 'agent_action'\s*\n\s*action: AiAgentActionEnvelope\s*\n\s*\}/,
    )
    expect(aiTypesSrc).toMatch(/\|\s*AiAgentActionEvent/)
  })

  it('the envelope mirror matches assistStream.ts AgentActionEnvelope field-for-field', () => {
    // assistStream.ts (authority for the wire shape, mirrors agent-action.schema.yaml)
    expect(assistSrc).toMatch(
      /export interface AgentActionEnvelope \{\s*\n\s*action: 'focus' \| 'open-surface'\s*\n\s*target\?: AgentActionTargetEnvelope\s*\n\s*surface\?: string\s*\n\s*contextNote\?: string\s*\n\s*supportedBy\?: AgentActionTargetEnvelope\[\]\s*\n\s*\}/,
    )
    // types/ai.ts (generic-stack mirror)
    expect(aiTypesSrc).toMatch(
      /export interface AiAgentActionEnvelope \{\s*\n\s*action: 'focus' \| 'open-surface'\s*\n\s*target\?: AiAgentActionTargetEnvelope\s*\n\s*surface\?: string\s*\n\s*contextNote\?: string\s*\n\s*supportedBy\?: AiAgentActionTargetEnvelope\[\]\s*\n\s*\}/,
    )
  })

  it('the target mirror matches assistStream.ts AgentActionTargetEnvelope variants', () => {
    expect(assistSrc).toMatch(
      /export type AgentActionTargetEnvelope =\s*\n\s*\| \{ kind: 'protocol-step'; protocolId: string; stepId: string; label\?: string \}\s*\n\s*\| \{ kind: 'record'; id: string; type\?: string; label\?: string \}\s*\n\s*\| \{ kind: 'ontology'; id: string; namespace\?: string; label\?: string; uri\?: string \}/,
    )
    expect(aiTypesSrc).toMatch(
      /export type AiAgentActionTargetEnvelope =\s*\n\s*\| \{ kind: 'protocol-step'; protocolId: string; stepId: string; label\?: string \}\s*\n\s*\| \{ kind: 'record'; id: string; type\?: string; label\?: string \}\s*\n\s*\| \{ kind: 'ontology'; id: string; namespace\?: string; label\?: string; uri\?: string \}/,
    )
  })

  it('assistStream.ts still carries its own members (the pin is two-way)', () => {
    expect(assistSrc).toMatch(/\| \{ type: 'agent_action'; action: AgentActionEnvelope \}/)
    expect(assistSrc).toMatch(/\| \{ type: 'workstate_proposal'; workstate: Record<string, unknown> \}/)
  })
})
