/**
 * useMentionNavigation — bind a document-level click listener that
 * routes clicks on slash-menu mention pills to `/browser`.
 *
 * The pill is rendered by `MentionNode` as a plain `<span data-mention>`
 * tag with the mention payload serialised in the `data-mention` attribute.
 * A document-level delegate is the simplest way to wire navigation
 * without converting every mention into a React NodeView, and it works
 * across all surfaces (AI chat, TapTab) because every mention shares
 * the same DOM shape.
 *
 * Only mentions that carry a record id are clickable. Selection mentions
 * (source/target with empty `recordId`) fall through to the default
 * behaviour (no navigation).
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SlashMention } from './types'

export function useMentionNavigation(): void {
  const navigate = useNavigate()

  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Respect modifier-click conventions — let cmd/ctrl-click and
      // middle-click fall through to whatever the browser would do.
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const clickTarget = event.target as Element | null
      const node = clickTarget?.closest('[data-mention]') as HTMLElement | null
      if (!node) return

      const raw = node.getAttribute('data-mention')
      if (!raw) return
      let mention: SlashMention
      try {
        mention = JSON.parse(raw) as SlashMention
      } catch {
        return
      }

      const mentionRef = mentionTarget(mention)
      if (!mentionRef) return

      event.preventDefault()
      const params = new URLSearchParams()
      params.set('id', mentionRef.recordId)
      if (mentionRef.kind) params.set('type', mentionRef.kind)
      navigate(`/browser?${params.toString()}`)
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [navigate])
}

function mentionTarget(
  mention: SlashMention,
): { recordId: string; kind?: string } | null {
  if (mention.type === 'material' || mention.type === 'protocol') {
    if (!mention.id) return null
    return { recordId: mention.id, kind: mention.entityKind }
  }
  if (mention.type === 'labware') {
    if (!mention.id) return null
    return { recordId: mention.id, kind: 'labware' }
  }
  // selection mentions don't navigate — their target is wells, not a record.
  return null
}
