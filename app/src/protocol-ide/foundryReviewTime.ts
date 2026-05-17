export function foundryReviewTimeAgo(iso: string | undefined | null, now: number = Date.now()): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const delta = Math.max(0, now - then)
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export function extractLastInnerLoopAt(humanReview: unknown): string | undefined {
  if (!humanReview || typeof humanReview !== 'object') return undefined
  const value = (humanReview as Record<string, unknown>)['lastInnerLoopAt']
  return typeof value === 'string' ? value : undefined
}
