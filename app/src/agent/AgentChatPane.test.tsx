import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AgentChatPane } from './AgentChatPane'

vi.mock('../event-editor/right-pane/ai/AiTabPanel', () => ({
  AiTabPanel: () => <div data-testid="ai-tab-panel">ai</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AgentChatPane', () => {
  it('renders the chat context header and the AI panel, with no tab strip', () => {
    render(<AgentChatPane />)
    expect(screen.getByTestId('chat-context-header')).toBeInTheDocument()
    expect(screen.getByTestId('ai-tab-panel')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})
