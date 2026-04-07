/**
 * Pure helper functions for schema-driven forms.
 * Ported from computable-lab/src/ui/FormBuilder.ts.
 */

import type { FieldHint, VisibilityCondition } from '../../types/uiSpec'
import { formatConcentration, type ConcentrationValue } from '../../types/material'

/** Remove $. prefix from a JSONPath string. */
export function stripJsonPath(path: string): string {
  return path.startsWith('$.') ? path.slice(2) : path
}

/** Get a value at a dotted path (e.g. "context.measurement"). */
export function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = stripJsonPath(path).split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** Immutably set a value at a dotted path. Returns a new top-level object. */
export function setValueAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = stripJsonPath(path).split('.')
  if (parts.length === 0) return obj

  const result = { ...obj }
  let current = result

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {}
    } else {
      current[part] = { ...(current[part] as Record<string, unknown>) }
    }
    current = current[part] as Record<string, unknown>
  }

  const lastPart = parts[parts.length - 1]!
  current[lastPart] = value
  return result
}

/** Evaluate a visibility condition against current form values. */
export function evaluateVisibility(
  condition: VisibilityCondition | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!condition) return true

  const controlValue = getValueAtPath(values, condition.when)

  switch (condition.operator) {
    case 'equals':
      return controlValue === condition.value
    case 'notEquals':
      return controlValue !== condition.value
    case 'in':
      return Array.isArray(condition.value) ? condition.value.includes(controlValue) : false
    case 'notIn':
      return Array.isArray(condition.value) ? !condition.value.includes(controlValue) : true
    case 'exists':
      return controlValue !== undefined && controlValue !== null
    case 'notExists':
      return controlValue === undefined || controlValue === null
    default:
      return true
  }
}

/** Check if a field hint says the field is hidden. */
export function isFieldHidden(field: FieldHint): boolean {
  return field.hidden === true || field.widget === 'hidden'
}

/** Check if a field hint says the field is read-only (handles both YAML conventions). */
export function isFieldReadonly(field: FieldHint): boolean {
  return field.readOnly === true || field.readonly === true || field.widget === 'readonly'
}

/** Extract the JSON Schema fragment at a dotted path. */
export function getSchemaFragment(
  schema: Record<string, unknown>,
  path: string,
): Record<string, unknown> | undefined {
  const parts = stripJsonPath(path).split('.')
  let current: Record<string, unknown> | undefined = schema

  for (const part of parts) {
    if (!current) return undefined
    const properties = current.properties as Record<string, unknown> | undefined
    if (properties && properties[part]) {
      current = properties[part] as Record<string, unknown>
      continue
    }
    // Check array items
    if (current.items) {
      const items = current.items as Record<string, unknown>
      const itemProps = items.properties as Record<string, unknown> | undefined
      if (itemProps && itemProps[part]) {
        current = itemProps[part] as Record<string, unknown>
        continue
      }
    }
    return undefined
  }

  return current
}

/** Infer a human-readable label from a camelCase/kebab path segment. */
export function inferLabel(path: string): string {
  const last = stripJsonPath(path).split('.').pop() || path
  return last
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

export function formatComputedConcentration(
  concentration?: ConcentrationValue | null,
  unknown = false,
): string | null {
  if (unknown) return 'unknown'
  return formatConcentration(concentration)
}

export function formatComputedCount(count?: number | null): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(count)} count`
}

export function formatScientificStateSummary(componentCount: number, totalVolumeLabel: string): string {
  return `${componentCount} component${componentCount === 1 ? '' : 's'} · ${totalVolumeLabel} total`
}
