import type { UISpec } from '../../types/uiSpec'
import { FormSection } from './FormSection'
import { FieldRenderer } from './FieldRenderer'
import {
  getValueAtPath,
  setValueAtPath,
  evaluateVisibility,
  stripJsonPath,
  getSchemaFragment,
} from '../lib/formHelpers'

interface SectionedFormProps {
  uiSpec: UISpec
  schema?: Record<string, unknown> | null
  formData: Record<string, unknown>
  onChange?: (next: Record<string, unknown>) => void
  readOnly?: boolean
  disabled?: boolean
  compact?: boolean
  errors?: Map<string, string[]>
}

export function SectionedForm({
  uiSpec,
  schema,
  formData,
  onChange,
  readOnly = false,
  disabled = false,
  compact = false,
  errors,
}: SectionedFormProps) {
  const sections = uiSpec.form?.sections
  if (!sections?.length) {
    return <p className="text-gray-400 text-sm italic">No form sections defined.</p>
  }

  const handleFieldChange = (path: string, value: unknown) => {
    if (!onChange) return
    const cleanPath = stripJsonPath(path)
    const next = setValueAtPath(formData, cleanPath, value)
    onChange(next)
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {sections.map((section, sIdx) => {
        if (section.visible && !evaluateVisibility(section.visible, formData)) {
          return null
        }

        return (
          <FormSection
            key={section.id || section.title || sIdx}
            title={section.title}
            description={section.description}
            collapsible={section.collapsible}
            defaultCollapsed={section.collapsed}
            compact={compact}
          >
            {section.fields.map((field) => {
              if (field.visible && !evaluateVisibility(field.visible, formData)) {
                return null
              }

              const cleanPath = stripJsonPath(field.path)
              const value = getValueAtPath(formData, cleanPath)
              const fieldSchema = schema ? getSchemaFragment(schema, cleanPath) : undefined
              const fieldErrors = errors?.get(cleanPath)

              return (
                <FieldRenderer
                  key={field.path}
                  field={field}
                  value={value}
                  onChange={(v) => handleFieldChange(field.path, v)}
                  readOnly={readOnly}
                  disabled={disabled}
                  errors={fieldErrors}
                  schema={fieldSchema}
                  compact={compact}
                />
              )
            })}
          </FormSection>
        )
      })}
    </div>
  )
}
