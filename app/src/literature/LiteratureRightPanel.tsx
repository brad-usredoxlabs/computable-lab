/**
 * LiteratureRightPanel — right-hand panel for the protocol-builder view.
 *
 * Two tabs:
 * - Search: Search for protocols/PDFs from bio-sources
 * - AI: Chat with the AI to discuss/extract/adapt protocols
 */

import { useState } from 'react'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'

export interface LiteratureRightPanelProps {
  aiChat: UseAiChatReturn
}

export function LiteratureRightPanel({ aiChat }: LiteratureRightPanelProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'ai'>('ai')

  return (
    <div className="lit-right-panel">
      {/* Tab bar */}
      <div className="lit-right-panel__tabs">
        <button
          className={`lit-right-panel__tab${activeTab === 'search' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search
        </button>
        <button
          className={`lit-right-panel__tab${activeTab === 'ai' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          AI Chat
        </button>
      </div>

      {/* Tab content */}
      <div className="lit-right-panel__content">
        {activeTab === 'search' ? (
          <SearchTab />
        ) : (
          <AiChatTab aiChat={aiChat} />
        )}
      </div>

      <style>{styles}</style>
    </div>
  )
}

/**
 * Search tab — search for protocols/PDFs
 */
function SearchTab() {
  const [query, setQuery] = useState('')

  return (
    <div className="lit-search-tab">
      <div className="lit-search-tab__header">
        <h3>Search Protocols</h3>
      </div>
      <input
        type="text"
        className="lit-search-tab__input"
        placeholder="Search for protocols, kits, methods..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="lit-search-tab__results">
        <p className="lit-search-tab__hint">
          Search functionality coming soon. You can also paste a PDF URL in the
          main viewer panel to get started.
        </p>
      </div>
    </div>
  )
}

/**
 * AI Chat tab — chat with the AI about protocols
 */
interface AiChatTabProps {
  aiChat: UseAiChatReturn
}

function AiChatTab({ aiChat }: AiChatTabProps) {
  return (
    <div className="lit-ai-tab">
      {/* Chat messages */}
      <div className="lit-ai-tab__messages">
        {aiChat.messages.map((msg) => (
          <div
            key={msg.id}
            className={`lit-ai-tab__message lit-ai-tab__message--${msg.role}`}
          >
            <div className="lit-ai-tab__message-role">
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>
            <div className="lit-ai-tab__message-content">
              {msg.isStreaming ? (
                <span className="lit-ai-tab__streaming">
                  {msg.content}
                  <span className="lit-ai-tab__cursor" />
                </span>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {aiChat.messages.length === 0 && (
          <div className="lit-ai-tab__welcome">
            <p>
              <strong>Protocol Builder</strong>
            </p>
            <p>
              I can help you adapt vendor protocols to your lab's specific
              equipment and reagents.
            </p>
            <p className="lit-ai-tab__hint">
              Select text from the PDF on the left and click "Send to AI" to
              start, or type a message below.
            </p>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="lit-ai-tab__input-area">
        <textarea
          className="lit-ai-tab__input"
          placeholder="Ask about the protocol or request changes..."
          rows={3}
          disabled={aiChat.isStreaming}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              const input = (e.target as HTMLTextAreaElement).value.trim()
              if (input) {
                aiChat.sendPrompt(input)
                ;(e.target as HTMLTextAreaElement).value = ''
              }
            }
          }}
        />
        <button
          className="lit-ai-tab__send-btn"
          onClick={() => {
            const input = document.querySelector(
              '.lit-ai-tab__input',
            ) as HTMLTextAreaElement
            if (input && input.value.trim()) {
              aiChat.sendPrompt(input.value.trim())
              input.value = ''
            }
          }}
          disabled={aiChat.isStreaming}
        >
          Send
        </button>
      </div>
    </div>
  )
}

const styles = `
.lit-right-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.lit-right-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--cl-border);
  background: var(--cl-bg-elev);
}

.lit-right-panel__tab {
  flex: 1;
  padding: 10px;
  font-size: 0.9em;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--cl-text-dim);
  transition: all 150ms ease;
}

.lit-right-panel__tab:hover {
  color: var(--cl-text);
  background: rgba(0, 0, 0, 0.03);
}

.lit-right-panel__tab.is-active {
  color: var(--cl-accent);
  border-bottom-color: var(--cl-accent);
  font-weight: 500;
}

.lit-right-panel__content {
  flex: 1;
  overflow: auto;
}

/* Search tab */
.lit-search-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}

.lit-search-tab__header h3 {
  margin: 0 0 12px 0;
  font-size: 1em;
  font-weight: 600;
}

.lit-search-tab__input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--cl-border);
  border-radius: 6px;
  font-size: 0.9em;
  outline: none;
  margin-bottom: 12px;
}

.lit-search-tab__input:focus {
  border-color: var(--cl-accent);
}

.lit-search-tab__results {
  flex: 1;
  overflow: auto;
}

.lit-search-tab__hint {
  color: var(--cl-text-dim);
  font-size: 0.85em;
  text-align: center;
  padding: 24px;
}

/* AI Chat tab */
.lit-ai-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.lit-ai-tab__messages {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.lit-ai-tab__message {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--cl-bg-elev);
}

.lit-ai-tab__message--user {
  background: rgba(34, 139, 230, 0.1);
}

.lit-ai-tab__message-role {
  font-size: 0.75em;
  font-weight: 600;
  color: var(--cl-text-dim);
  margin-bottom: 4px;
  text-transform: uppercase;
}

.lit-ai-tab__message-content {
  font-size: 0.9em;
  line-height: 1.5;
  white-space: pre-wrap;
}

.lit-ai-tab__streaming {
  display: inline;
}

.lit-ai-tab__cursor {
  display: inline-block;
  width: 1px;
  height: 1em;
  background: currentColor;
  animation: lit-blink 1s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes lit-blink {
  50% { opacity: 0; }
}

.lit-ai-tab__welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--cl-text-dim);
  padding: 24px;
}

.lit-ai-tab__welcome p {
  margin: 4px 0;
  font-size: 0.9em;
}

.lit-ai-tab__hint {
  font-size: 0.8em;
  margin-top: 12px;
  font-style: italic;
}

.lit-ai-tab__input-area {
  border-top: 1px solid var(--cl-border);
  padding: 12px;
  display: flex;
  gap: 8px;
}

.lit-ai-tab__input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--cl-border);
  border-radius: 6px;
  font-size: 0.9em;
  font-family: inherit;
  resize: none;
  outline: none;
}

.lit-ai-tab__input:focus {
  border-color: var(--cl-accent);
}

.lit-ai-tab__send-btn {
  padding: 8px 16px;
  background: var(--cl-accent);
  color: var(--cl-on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  align-self: flex-end;
}

.lit-ai-tab__send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`
