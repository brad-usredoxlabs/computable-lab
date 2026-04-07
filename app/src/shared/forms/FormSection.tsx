import { useState } from 'react'
import type { ReactNode } from 'react'

interface FormSectionProps {
  title?: string
  description?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  compact?: boolean
  children: ReactNode
}

export function FormSection({
  title,
  description,
  collapsible = false,
  defaultCollapsed = false,
  compact = false,
  children,
}: FormSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className={compact ? 'mb-1' : 'mb-3 last:mb-0'}>
      {title && (
        <div
          className={`flex items-center gap-1.5 ${compact ? 'mb-1' : 'mb-1.5'} ${collapsible ? 'cursor-pointer select-none' : ''}`}
          onClick={collapsible ? () => setCollapsed((c) => !c) : undefined}
        >
          {collapsible && (
            <svg
              className={`w-3 h-3 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-90'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          <h3 className={`${compact
            ? 'text-[10px] font-semibold text-gray-400 uppercase tracking-wider'
            : 'text-xs font-semibold text-gray-500 uppercase tracking-wide'
          }`}>
            {title}
          </h3>
          <div className="flex-1 border-b border-gray-100 ml-2" />
        </div>
      )}
      {description && !collapsed && (
        <p className="text-gray-400 text-xs mb-1.5">{description}</p>
      )}
      {!collapsed && (
        <div className={compact ? 'space-y-0' : 'space-y-0'}>
          {children}
        </div>
      )}
    </div>
  )
}
