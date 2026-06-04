export function eventEditorGraphPath(eventGraphId: string, runId: string | null | undefined): string {
  const encodedGraphId = encodeURIComponent(eventGraphId)
  if (runId) return `/runs/${encodeURIComponent(runId)}/event-editor?id=${encodedGraphId}`
  return `/event-editor/${encodedGraphId}`
}

export function shortEventGraphId(eventGraphId: string): string {
  if (eventGraphId.length <= 14) return eventGraphId
  return `${eventGraphId.slice(0, 10)}...`
}
