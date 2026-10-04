import { CheckIcon } from '@heroicons/react/24/solid'

export interface PolicyBundleView {
  id: string
  label: string
  level: number
  description?: string
}

interface LevelStyle {
  /** Card border / accent ink for the enforcement level. */
  accent: string
  /** Soft fill applied once the card is the active bundle. */
  activeBg: string
}

/**
 * Card styling derived from enforcement level rather than bundle identity.
 * Colors come from the active theme tokens (never a fixed light palette), so
 * a level reads the same in light and dark.
 *
 * Unknown levels fall back to the strictest (red) styling — unknown
 * strictness should render strict-styled and fail-visible.
 */
const LEVEL_STYLES: Record<number, LevelStyle> = {
  0: { accent: 'var(--cl-border-strong)', activeBg: 'var(--cl-bg-elev-2)' },
  1: { accent: 'var(--cl-accent)', activeBg: 'var(--cl-accent-soft)' },
  2: { accent: 'var(--cl-warn)', activeBg: 'var(--cl-warn-soft)' },
  3: { accent: 'var(--cl-danger)', activeBg: 'var(--cl-danger-soft)' },
}

const FALLBACK_LEVEL_STYLE: LevelStyle = {
  accent: 'var(--cl-danger)',
  activeBg: 'var(--cl-danger-soft)',
}

interface PolicyBundleSelectorProps {
  currentBundleId: string
  bundles: PolicyBundleView[]
  onBundleChanged: (bundleId: string) => void
}

export function PolicyBundleSelector({ currentBundleId, bundles, onBundleChanged }: PolicyBundleSelectorProps) {
  if (bundles.length === 0) {
    return (
      <div data-testid="policy-bundle-empty" className="text-sm" style={{ color: 'var(--cl-text-dim)' }}>
        No policy bundles reported by server
      </div>
    )
  }

  return (
    <div className="policy-bundle-selector">
      <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--cl-text-dim)' }}>
        Enforcement Level
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {bundles.map((bundle) => {
          const isActive = bundle.id === currentBundleId
          const style = LEVEL_STYLES[bundle.level] ?? FALLBACK_LEVEL_STYLE
          return (
            <button
              key={bundle.id}
              onClick={() => onBundleChanged(bundle.id)}
              className="policy-bundle-card border-2 rounded-lg p-4 text-left transition-colors"
              data-active={isActive ? 'true' : 'false'}
              style={{
                borderColor: style.accent,
                background: isActive ? style.activeBg : 'transparent',
                color: 'var(--cl-text)',
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono" style={{ color: 'var(--cl-text-dim)' }}>Level {bundle.level}</span>
                {isActive && <CheckIcon className="w-4 h-4" style={{ color: 'var(--cl-success)' }} />}
              </div>
              <h4 className="font-semibold" style={{ color: 'var(--cl-text)' }}>{bundle.label}</h4>
              <p className="text-xs mt-1" style={{ color: 'var(--cl-text-dim)' }}>{bundle.description}</p>
            </button>
          )
        })}
      </div>
      <style>{`
        .policy-bundle-card:not([data-active='true']):hover {
          background: var(--cl-bg-elev-2);
        }
      `}</style>
    </div>
  )
}

export default PolicyBundleSelector
