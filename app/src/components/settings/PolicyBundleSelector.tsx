import { CheckIcon } from '@heroicons/react/24/solid'

const BUNDLES = [
  {
    id: 'POL-SANDBOX',
    label: 'Sandbox',
    level: 0,
    description: 'Zero friction. All QMS checks allow. For demos and exploration.',
    color: 'border-gray-300',
    activeColor: 'border-gray-500 bg-gray-50',
  },
  {
    id: 'POL-NOTEBOOK',
    label: 'Lab Notebook',
    level: 1,
    description: 'QMS issues are surfaced but never block. For labs wanting visibility.',
    color: 'border-blue-200',
    activeColor: 'border-blue-500 bg-blue-50',
  },
  {
    id: 'POL-TRACKED',
    label: 'Tracked',
    level: 2,
    description: 'Expired authorizations and stale calibrations need confirmation before execution.',
    color: 'border-amber-200',
    activeColor: 'border-amber-500 bg-amber-50',
  },
  {
    id: 'POL-REGULATED',
    label: 'Regulated',
    level: 3,
    description: 'Full QMS enforcement. Expired items block execution. Operator binding required.',
    color: 'border-red-200',
    activeColor: 'border-red-500 bg-red-50',
  },
] as const

interface PolicyBundleSelectorProps {
  currentBundleId: string
  onBundleChanged: (bundleId: string) => void
}

export function PolicyBundleSelector({ currentBundleId, onBundleChanged }: PolicyBundleSelectorProps) {
  return (
    <div className="policy-bundle-selector">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Enforcement Level</h3>
      <div className="grid grid-cols-2 gap-3">
        {BUNDLES.map((bundle) => {
          const isActive = bundle.id === currentBundleId
          return (
            <button
              key={bundle.id}
              onClick={() => onBundleChanged(bundle.id)}
              className={`border-2 rounded-lg p-4 text-left transition-colors ${
                isActive ? bundle.activeColor : `${bundle.color} hover:bg-gray-50`
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono text-gray-400">Level {bundle.level}</span>
                {isActive && <CheckIcon className="w-4 h-4 text-green-600" />}
              </div>
              <h4 className="font-semibold text-gray-900">{bundle.label}</h4>
              <p className="text-xs text-gray-500 mt-1">{bundle.description}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default PolicyBundleSelector
