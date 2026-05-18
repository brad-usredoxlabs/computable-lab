import { useCallback, useEffect, useRef } from 'react'

/**
 * Touch + mouse long-press handler. Returns a set of event-listener
 * props the caller spreads onto the target element.
 *
 * Use case: phones don't have right-click, so any UI that summons a
 * context menu via `onContextMenu` needs an alternate trigger. Holding
 * a finger down for `delayMs` fires `onLongPress` with the original
 * pointer event so the caller can position a menu at the touch point.
 *
 * Cancels on movement past `cancelOnMoveThresholdPx` (typically a scroll
 * gesture) or on pointer release before the timer fires. On desktop, a
 * right-click on the same element is still handled normally — the
 * caller's `onContextMenu` runs alongside this hook.
 */
export interface LongPressOptions {
  delayMs?: number
  cancelOnMoveThresholdPx?: number
}

export interface LongPressHandlers {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerCancel: (e: React.PointerEvent) => void
  onPointerLeave: (e: React.PointerEvent) => void
}

export interface LongPressResult {
  handlers: LongPressHandlers
  /**
   * Set to `true` for ~one event loop after `onLongPress` fires. Read it
   * from your `onClick` handler to suppress the synthesized click that
   * follows a long-press touch sequence:
   *
   * ```ts
   * onClick: (e) => {
   *   if (longPress.consumeDidFire()) return
   *   ...
   * }
   * ```
   */
  consumeDidFire: () => boolean
}

export function useLongPress(
  onLongPress: (event: React.PointerEvent) => void,
  options: LongPressOptions = {},
): LongPressResult {
  const { delayMs = 500, cancelOnMoveThresholdPx = 8 } = options
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)

  // `clear` is called from pointerup/cancel/leave. It cancels the long-press
  // timer but DOES NOT reset `firedRef` — the click event fires *after*
  // pointerup, so the caller still needs to be able to read the firedRef
  // via `consumeDidFire()` in their onClick. firedRef is instead reset on
  // the next pointerdown, or by `consumeDidFire()`.
  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
  }, [])

  useEffect(() => clear, [clear])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle touch / pen — desktop right-click goes through the
    // existing onContextMenu path.
    if (e.pointerType === 'mouse') return
    clear()
    firedRef.current = false
    startRef.current = { x: e.clientX, y: e.clientY }
    // Capture a copy so the timer callback can still access the event
    // after React's synthetic-event pooling would normally null it out.
    const capturedEvent = e
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true
      onLongPress(capturedEvent)
    }, delayMs)
  }, [clear, delayMs, onLongPress])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startRef.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (dx * dx + dy * dy > cancelOnMoveThresholdPx * cancelOnMoveThresholdPx) {
      clear()
    }
  }, [cancelOnMoveThresholdPx, clear])

  const onPointerUp = useCallback(() => {
    // If long-press already fired we still clear; if it hadn't fired,
    // clearing the timer cancels the long-press in favor of a tap.
    clear()
  }, [clear])

  const consumeDidFire = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false
      return true
    }
    return false
  }, [])

  return {
    handlers: {
      onPointerDown,
      onPointerUp,
      onPointerMove,
      onPointerCancel: onPointerUp,
      onPointerLeave: onPointerUp,
    },
    consumeDidFire,
  }
}
