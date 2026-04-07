import type { FieldHint } from '../../../types/uiSpec'

export interface WidgetProps {
  field: FieldHint
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
  disabled?: boolean
  errors?: string[]
  schema?: Record<string, unknown>
  compact?: boolean
}
