import { useEffect, useState } from 'react'

/**
 * Viewport-class detection for the event editor's mobile adaptations.
 *
 * - `isMobile`: viewport is narrow enough that the desktop three-pane
 *   layout doesn't fit. Drives the route-level / component-level forks
 *   that can't be expressed in CSS alone (e.g., rendering a different
 *   component tree, opening the Fix-it route in a new tab).
 * - `isTouch`: the primary pointer cannot hover. Used to switch tooltip
 *   semantics from hover-driven to tap-to-pin, and to enable long-press
 *   for the right-click context menu.
 *
 * Both signals are kept in React state and updated via `MediaQueryList`
 * listeners — switching between desktop and a narrow window mid-session
 * (devtools mobile emulation, window resize) re-renders the editor.
 *
 * Match the SSR-safe pattern: assume desktop on the very first render
 * when `window` isn't defined yet.
 */
export interface ViewportInfo {
  isMobile: boolean
  isTouch: boolean
}

const MOBILE_QUERY = '(max-width: 768px)'
const TOUCH_QUERY = '(hover: none)'

function read(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(query).matches
}

export function useViewport(): ViewportInfo {
  const [isMobile, setIsMobile] = useState(() => read(MOBILE_QUERY))
  const [isTouch, setIsTouch] = useState(() => read(TOUCH_QUERY))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mobile = window.matchMedia(MOBILE_QUERY)
    const touch = window.matchMedia(TOUCH_QUERY)
    const onMobile = () => setIsMobile(mobile.matches)
    const onTouch = () => setIsTouch(touch.matches)
    mobile.addEventListener('change', onMobile)
    touch.addEventListener('change', onTouch)
    return () => {
      mobile.removeEventListener('change', onMobile)
      touch.removeEventListener('change', onTouch)
    }
  }, [])

  return { isMobile, isTouch }
}
