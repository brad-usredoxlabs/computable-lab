/**
 * LEG2a — record-lock predicate seam. Declared sets always arrive as
 * arguments (fetched per lifecycle); no state-id list, no policy.
 */
export function isContentLocked(
  payload: { state?: unknown } | null | undefined,
  contentLockedStates: readonly string[],
): boolean {
  const state = payload?.state
  return typeof state === 'string' && contentLockedStates.includes(state)
}

export function isRecordWriteLocked(
  payload: { state?: unknown } | null | undefined,
  contentLockedStates: readonly string[],
  terminalStates: readonly string[],
): boolean {
  if (isContentLocked(payload, contentLockedStates)) return true
  const state = payload?.state
  return typeof state === 'string' && terminalStates.includes(state)
}
