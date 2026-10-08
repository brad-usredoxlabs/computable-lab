import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types/ai'

interface SequenceChatProps {
  messages: ChatMessage[]
  isStreaming: boolean
  prompt: string
  onPromptChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
  onReview: (proposal: Record<string, unknown>, userRequest?: string) => void
}

export function SequenceChat({ messages, isStreaming, prompt, onPromptChange, onSend, onCancel, onReview }: SequenceChatProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const viewportRef = useRef({ width: 0, height: 0 })
  const [following, setFollowing] = useState(true)
  const latestUserId = [...messages].reverse().find(message => message.role === 'user')?.id
  const previousUserId = useRef(latestUserId)

  const followLatest = useCallback(() => {
    followingRef.current = true
    setFollowing(true)
    const scroller = scrollerRef.current
    if (scroller) {
      viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
      scroller.scrollTop = scroller.scrollHeight
    }
  }, [])

  // Includes hydration, new messages, and text updates to an existing streaming reply.
  useLayoutEffect(() => {
    const sentPrompt = latestUserId !== previousUserId.current
    previousUserId.current = latestUserId
    if (followingRef.current || sentPrompt) followLatest()
  }, [messages, latestUserId, followLatest])

  // Pane resizing and line wrapping can move the bottom without changing messages.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (followingRef.current) followLatest()
      else viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
    })
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [followLatest])

  function onScroll() {
    const scroller = scrollerRef.current
    if (!scroller) return
    // Resizing can emit a scroll event before ResizeObserver runs. That event
    // must not be mistaken for the reader deliberately leaving the bottom.
    const resized = viewportRef.current.width !== scroller.clientWidth || viewportRef.current.height !== scroller.clientHeight
    if (followingRef.current && resized) {
      followLatest()
      return
    }
    viewportRef.current = { width: scroller.clientWidth, height: scroller.clientHeight }
    const atBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 32
    followingRef.current = atBottom
    setFollowing(atBottom)
  }

  return <aside className="sequences-page sequence-chat">
    <h2>AI Chat</h2>
    <p className="sequence-hint">Describe a sequence edit, assay, analysis or tool setup. Review proposed actions before applying them.</p>
    <div className="sequence-chat-messages" ref={scrollerRef} onScroll={onScroll} role="log" aria-label="Conversation" aria-live="polite" tabIndex={0}>
      <div className="sequence-chat-content" ref={contentRef}>
        {messages.map((message, index) => <div key={message.id}>
          <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
          <p>{message.content}</p>
          {message.sequenceProposal && <button onClick={() => onReview(message.sequenceProposal!, message.sequenceProposalRequest ?? messages.slice(0, index).reverse().find(m => m.role === 'user')?.content)}>Review action</button>}
        </div>)}
      </div>
    </div>
    {!following && <button className="sequence-chat-latest" onClick={followLatest}>Latest messages <span aria-hidden="true">↓</span></button>}
    <label>Message<textarea rows={4} value={prompt} onChange={event => onPromptChange(event.target.value)}/></label>
    <button disabled={isStreaming || !prompt.trim()} onClick={onSend}>Send</button>
    {isStreaming && <button onClick={onCancel}>Cancel</button>}
  </aside>
}
