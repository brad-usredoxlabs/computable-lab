import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'
import type { JsonSchema } from '../../types/kernel'
import type { UISpec } from '../../types/uiSpec'
import { SectionedForm } from '../../shared/forms/SectionedForm'

interface SchemaRecordFormProps {
  schema: JsonSchema
  uiSpec?: UISpec | null
  /** @deprecated Use uiSpec instead */
  uiHints?: UISpec | null
  formData: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  disabled?: boolean
  readOnly?: boolean
  compact?: boolean
  errors?: Map<string, string[]>
}

/** Convert legacy UISpec into RJSF UiSchema for fallback mode. */
function buildRjsfUiSchema(uiSpec?: UISpec | null): UiSchema {
  if (!uiSpec) return {}
  const parsed: UiSchema = {}
  // No legacy layout.order in UISpec; just return empty
  return parsed
}

/**
 * Dispatcher: renders SectionedForm when a UISpec with sections is available,
 * otherwise falls back to RJSF.
 */
export function SchemaRecordForm({
  schema,
  uiSpec,
  uiHints,
  formData,
  onChange,
  disabled = false,
  readOnly = false,
  compact = false,
  errors,
}: SchemaRecordFormProps) {
  const resolvedSpec = uiSpec ?? uiHints ?? null
  const hasSections = Boolean(resolvedSpec?.form?.sections?.length)

  if (hasSections && resolvedSpec) {
    return (
      <SectionedForm
        uiSpec={resolvedSpec}
        schema={schema as Record<string, unknown>}
        formData={formData}
        onChange={readOnly ? undefined : onChange}
        readOnly={readOnly}
        disabled={disabled}
        compact={compact}
        errors={errors}
      />
    )
  }

  // RJSF fallback
  if (readOnly) {
    return (
      <div className="schema-record-form">
        <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(formData, null, 2)}
        </pre>
      </div>
    )
  }

  const uiSchema = buildRjsfUiSchema(resolvedSpec)

  return (
    <div className="schema-record-form">
      <Form
        schema={schema as unknown as RJSFSchema}
        uiSchema={uiSchema}
        formData={formData}
        validator={validator}
        noHtml5Validate
        showErrorList={false}
        disabled={disabled}
        onChange={(event) => {
          const next = event.formData ?? {}
          onChange(next as Record<string, unknown>)
        }}
      >
        <></>
      </Form>
    </div>
  )
}
