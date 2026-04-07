/**
 * Context components for displaying derived subject state.
 * 
 * "Context" is the generalized term for "WellContext" — it represents
 * the computed state of any subject (well, tube, mouse, etc.) after
 * event graph replay.
 */

export {
  ContextPanel,
  useContextData,
  // Backwards compatibility
  WellContextPanelV2,
  type SelectedSubject,
  type SelectedWell,
} from './ContextPanel'
