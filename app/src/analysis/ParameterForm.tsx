/**
 * ParameterForm — schema-driven parameter entry form (lane deliverable A).
 * A generic, closed-set renderer that turns an `analysis-revision.parameterSchema`
 * (JSON-Schema subset) into labeled controls. Pure component; no API.
 *
 * Doctrine (spec 2026-10-28 parameter-forms spec §A + CLAUDE.md): every
 * domain label, enum choice, group name and unit suffix comes from the schema
 * payload DATA — this file contains zero domain truth. The construct set is
 * CLOSED (spec table); anything outside it renders a visible named
 * unsupported block naming the JSON path + construct, and one bad node never
 * blanks the form (supported siblings still render).
 *
 * Closed construct set:
 *   number/integer → labeled number input (min/max/step from minimum/maximum/multipleOf)
 *   string         → text input
 *   boolean        → checkbox
 *   enum (any type)→ <select>; option texts verbatim; enumNames honored when length-matches
 *   object w/ properties → <fieldset> group (legend = title ?? property name), recurse
 *   array of scalar/enum items → add/remove row list
 *   array of object items      → repeatable row blocks (add seeds {}, remove per row)
 *   default at any node        → initial-value source only (never re-applied after edit)
 */
import { Fragment } from 'react'

export interface ParameterFormProps {
  schema: Record<string, unknown> | undefined
  value: Record<string, unknown>
  onChange(next: Record<string, unknown>): void
  disabled?: boolean
  testIdPrefix: string
}

type SchemaNode = Record<string, unknown>

export type ScalarKind = 'number' | 'string' | 'boolean'

type ClassifyResult =
  | { kind: 'scalar'; scalar: ScalarKind }
  | { kind: 'enum' }
  | { kind: 'group' }
  | { kind: 'array-scalar'; scalar: ScalarKind }
  | { kind: 'array-enum' }
  | { kind: 'array-object' }
  | { kind: 'unsupported'; construct: string }

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asStringArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Label for a leaf/group: title ?? description ?? property name, verbatim. */
function labelFor(node: SchemaNode, name: string): string {
  const t = node.title
  if (typeof t === 'string' && t.length > 0) return t
  const d = node.description
  if (typeof d === 'string' && d.length > 0) return d
  return name
}

function typeList(node: SchemaNode): string[] {
  const t = node.type
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return typeof t === 'string' ? [t] : []
}

/** Classify a subschema against the closed set. Returns the control kind or
 *  the unsupported-construct name (the actionable message names it).
 *  Exported: the submit gate in AnalysisPage consumes this SAME authority
 *  (D2/D9) so renderer and gate can never disagree about what is renderable. */
export function classify(node: SchemaNode): ClassifyResult {
  // $ref without a resolvable local target is unsupported (no ref store here).
  if ('$ref' in node) return { kind: 'unsupported', construct: '$ref' }
  // Combinators / conditional constructs are outside the closed set.
  for (const c of ['allOf', 'oneOf', 'anyOf', 'not', 'if', 'then', 'else', 'patternProperties', 'const']) {
    if (c in node) return { kind: 'unsupported', construct: c }
  }
  const types = typeList(node)
  if (types.length !== 1) return { kind: 'unsupported', construct: 'missing-or-multi-type' }
  const single = types[0]
  // enum wins over the base type (select with verbatim options).
  if (Array.isArray(node.enum) && node.enum.length > 0) return { kind: 'enum' }
  switch (single) {
    case 'number':
    case 'integer':
    case 'string':
    case 'boolean':
      return { kind: 'scalar', scalar: single === 'integer' ? 'number' : single }
    case 'object': {
      const props = asRecord(node.properties)
      if (!props) return { kind: 'unsupported', construct: 'object-without-properties' }
      return { kind: 'group' }
    }
    case 'array': {
      const items = node.items
      if (Array.isArray(items)) return { kind: 'unsupported', construct: 'tuple-items' }
      const itemRec = asRecord(items)
      if (!itemRec) return { kind: 'unsupported', construct: 'items-not-an-object-schema' }
      if (typeList(itemRec).includes('array')) return { kind: 'unsupported', construct: 'array-of-array' }
      const itemClass = classify(itemRec)
      if (itemClass.kind === 'scalar') return { kind: 'array-scalar', scalar: itemClass.scalar }
      if (itemClass.kind === 'enum') return { kind: 'array-enum' }
      if (itemClass.kind === 'group') return { kind: 'array-object' }
      if (itemClass.kind === 'unsupported') {
        // Items themselves carry an unsupported construct.
        return { kind: 'unsupported', construct: `items-${itemClass.construct}` }
      }
      return { kind: 'unsupported', construct: 'items-unknown' }
    }
    default:
      return { kind: 'unsupported', construct: `type:${single}` }
  }
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim().length === 0
  return false
}

function parseNumberInput(raw: string): number | '' {
  if (raw.trim() === '') return ''
  const n = Number(raw)
  return Number.isFinite(n) ? n : NaN
}

function OverrideBadge({ prefix, path }: { prefix: string; path: string }) {
  return (
    <span className="paramform__override" data-testid={`${prefix}-${path}-overridden`}>
      overridden
    </span>
  )
}

function ResetButton({ prefix, path, onClick, disabled }: { prefix: string; path: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="paramform__reset" data-testid={`${prefix}-${path}-reset`} onClick={onClick} disabled={disabled}>
      reset
    </button>
  )
}

function UnsupportedBlock({ prefix, path, construct }: { prefix: string; path: string; construct: string }) {
  return (
    <div className="paramform__unsupported" role="alert" data-testid={`${prefix}-unsupported`}>
      Cannot render "{path}" ({construct}) — this construct is not supported by the parameter form; edit it via Advanced JSON below
    </div>
  )
}

interface LeafProps {
  testIdPrefix: string
  path: string
  name: string
  node: SchemaNode
  value: unknown
  required: boolean
  disabled?: boolean
  onValue(name: string, next: unknown): void
}

function ScalarControl(props: LeafProps & { scalar: ScalarKind }) {
  const { testIdPrefix, path, name, node, value, required, disabled, onValue, scalar } = props
  const label = labelFor(node, name)
  const missing = required && isEmptyValue(value)
  const unit = typeof node['x-unit'] === 'string' ? (node['x-unit'] as string) : null
  const id = `${testIdPrefix}-${path}`
  let control: React.ReactNode
  if (scalar === 'boolean') {
    control = (
      <input
        id={id}
        data-testid={id}
        type="checkbox"
        disabled={disabled}
        checked={value === true}
        {...(missing ? { 'aria-invalid': true } : {})}
        onChange={(e) => onValue(name, e.target.checked)}
      />
    )
  } else if (scalar === 'number') {
    const min = asNumber(node.minimum)
    const max = asNumber(node.maximum)
    const step = asNumber(node.multipleOf)
    const raw = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : typeof value === 'string' ? value : ''
    control = (
      <input
        id={id}
        data-testid={id}
        type="number"
        value={raw}
        disabled={disabled}
        {...(missing ? { 'aria-invalid': true } : {})}
        {...(min !== null ? { min } : {})}
        {...(max !== null ? { max } : {})}
        {...(step !== null ? { step } : {})}
        onChange={(e) => {
          const parsed = parseNumberInput(e.target.value)
          onValue(name, parsed)
        }}
      />
    )
  } else {
    control = (
      <input
        id={id}
        data-testid={id}
        type="text"
        value={typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)}
        disabled={disabled}
        {...(missing ? { 'aria-invalid': true } : {})}
        onChange={(e) => onValue(name, e.target.value)}
      />
    )
  }
  return (
    <div className="paramform__field">
      <label htmlFor={id}>{label}</label>
      {control}
      {unit ? <span className="paramform__unit">{unit}</span> : null}
      {missing ? <span className="paramform__missing" data-testid={`${testIdPrefix}-${path}-missing`}>required</span> : null}
    </div>
  )
}

function EnumControl(props: LeafProps) {
  const { testIdPrefix, path, name, node, value, required, disabled, onValue } = props
  const label = labelFor(node, name)
  const enumVals = (Array.isArray(node.enum) ? node.enum : []) as unknown[]
  const enumNames = asStringArray(node.enumNames)
  const missing = required && isEmptyValue(value)
  const id = `${testIdPrefix}-${path}`
  // D5: the DOM select value is a string by nature; map it back to the
  // matching enum member (strict identity, then serialized identity) so the
  // emitted value keeps the schema's ORIGINAL JSON type (number/boolean),
  // not a stringified form.
  const serializeMember = (m: unknown): string => (typeof m === 'string' ? m : JSON.stringify(m) ?? String(m))
  const currentMember = enumVals.find((ev) => ev === value)
  const selectValue = currentMember !== undefined ? serializeMember(currentMember) : ''
  return (
    <div className="paramform__field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        data-testid={id}
        disabled={disabled}
        value={selectValue}
        {...(missing ? { 'aria-invalid': true } : {})}
        onChange={(e) => {
          const raw = e.target.value
          const member =
            enumVals.find((ev) => ev === raw) ??
            enumVals.find((ev) => serializeMember(ev) === raw) ??
            raw
          onValue(name, member)
        }}
      >
        <option value="" disabled>
          {'—'}
        </option>
        {enumVals.map((ev, i) => (
          <option key={`${String(ev)}-${i}`} value={String(ev)}>
            {enumNames && enumNames.length === enumVals.length ? enumNames[i] : String(ev)}
          </option>
        ))}
      </select>
      {missing ? <span className="paramform__missing" data-testid={`${testIdPrefix}-${path}-missing`}>required</span> : null}
    </div>
  )
}

/** Renders one schema node at `path`. `value` is the node's current value;
 *  writes flow up through `onSet(segment, next)` where `segment` is the node's
 *  own property name (for top-level) or a leaf name (for grouped rows). */
function NodeRenderer(props: {
  testIdPrefix: string
  path: string
  name: string
  node: SchemaNode
  value: unknown
  required: boolean
  disabled?: boolean
  defaults: Record<string, unknown>
  onSet(segment: string, next: unknown): void
}): React.ReactNode {
  const { testIdPrefix, path, name, node, value, required, disabled, defaults, onSet } = props
  const cls = classify(node)
  if (cls.kind === 'unsupported') {
    return <UnsupportedBlock prefix={testIdPrefix} path={path} construct={cls.construct} />
  }
  if (cls.kind === 'enum') {
    return <EnumControl testIdPrefix={testIdPrefix} path={path} name={name} node={node} value={value} required={required} disabled={disabled} onValue={(n, v) => onSet(n, v)} />
  }
  if (cls.kind === 'scalar') {
    const def = defaults[name]
    const overridden = def !== undefined && value !== def
    return (
      <>
        <ScalarControl testIdPrefix={testIdPrefix} path={path} name={name} node={node} value={value} required={required} disabled={disabled} scalar={cls.scalar} onValue={(n, v) => onSet(n, v)} />
        {overridden ? (
          <span className="paramform__field-actions">
            <OverrideBadge prefix={testIdPrefix} path={path} />
            <ResetButton prefix={testIdPrefix} path={path} disabled={disabled} onClick={() => onSet(name, def)} />
          </span>
        ) : null}
      </>
    )
  }
  if (cls.kind === 'group') {
    const props_ = asRecord(node.properties) ?? {}
    const reqArr = asStringArray(node.required) ?? []
    const obj = asRecord(value) ?? {}
    // D1 fix: children resolve their `default` against the GROUP'S OWN default
    // map — `defaults[name]` (this node's collected default, from its explicit
    // `default` keyword or built from its children's defaults), NOT the parent
    // map keyed by child names (the pre-fix lookup was a level off and the
    // nested override badge/reset never rendered).
    const groupDefaults = asRecord(defaults[name]) ?? {}
    return (
      <fieldset className="paramform__group">
        <legend>{labelFor(node, name)}</legend>
        {Object.entries(props_).map(([childName, childNode]) => (
          <Fragment key={childName}>
            <NodeRenderer
              testIdPrefix={testIdPrefix}
              path={`${path}-${childName}`}
              name={childName}
              node={childNode as SchemaNode}
              value={obj[childName]}
              required={reqArr.includes(childName)}
              disabled={disabled}
              defaults={groupDefaults}
              onSet={(seg, next) => {
                const copy = { ...obj }
                copy[seg] = next
                onSet(name, copy)
              }}
            />
          </Fragment>
        ))}
      </fieldset>
    )
  }
  // Array arms (array-scalar / array-enum / array-object): row list chrome.
  const itemsNode = asRecord(node.items) ?? {}
  const arr = Array.isArray(value) ? value : []
  const rowLabel = labelFor(node, name)
  const setRow = (index: number, next: unknown) => {
    const copy = [...arr]
    copy[index] = next
    onSet(name, copy)
  }
  const removeRow = (index: number) => {
    onSet(name, arr.filter((_, i) => i !== index))
  }
  const addRow = () => {
    onSet(name, [...arr, cls.kind === 'array-object' ? {} : ''])
  }
  return (
    <div className="paramform__list">
      <span className="paramform__list-label">{rowLabel}</span>
      {arr.map((row, i) => (
        <div key={`${path}-row-${i}`} className="paramform__row" data-testid={`${testIdPrefix}-${path}-row-${i}`}>
          {cls.kind === 'array-object' ? (
            <NodeRenderer
              testIdPrefix={testIdPrefix}
              path={`${path}-${i}`}
              name={`#${i}`}
              node={itemsNode}
              value={row}
              required={false}
              disabled={disabled}
              defaults={{}}
              onSet={(_seg, next) => {
                // The group arm above has already assembled the full row
                // object; replace the row at this index (never key by the
                // dummy `#i` segment name).
                setRow(i, asRecord(next) ?? {})
              }}
            />
          ) : cls.kind === 'array-enum' ? (
            <EnumControl
              testIdPrefix={testIdPrefix}
              path={`${path}-${i}`}
              name={`#${i}`}
              node={itemsNode}
              value={row}
              required={false}
              disabled={disabled}
              onValue={(_n, v) => setRow(i, v)}
            />
          ) : (
            <ScalarControl
              testIdPrefix={testIdPrefix}
              path={`${path}-${i}`}
              name={`#${i}`}
              node={itemsNode}
              value={row}
              required={false}
              disabled={disabled}
              scalar={cls.scalar}
              onValue={(_n, v) => setRow(i, v)}
            />
          )}
          <button type="button" className="paramform__remove" data-testid={`${testIdPrefix}-${path}-remove-${i}`} onClick={() => removeRow(i)} disabled={disabled}>
            remove
          </button>
        </div>
      ))}
      <button type="button" className="paramform__add" data-testid={`${testIdPrefix}-${path}-add`} onClick={addRow} disabled={disabled}>
        add
      </button>
    </div>
  )
}

export function ParameterForm({ schema, value, onChange, disabled, testIdPrefix }: ParameterFormProps): React.ReactNode {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null
  const props_ = asRecord(schema.properties) ?? {}
  const reqArr = asStringArray(schema.required) ?? []
  const rootDefaults = collectDefaults(schema)
  return (
    <div className="paramform">
      {Object.entries(props_).map(([name, node]) => (
        <NodeRenderer
          key={name}
          testIdPrefix={testIdPrefix}
          path={name}
          name={name}
          node={node as SchemaNode}
          value={value[name]}
          required={reqArr.includes(name)}
          disabled={disabled}
          defaults={rootDefaults}
          onSet={(seg, next) => onChange({ ...value, [seg]: next })}
        />
      ))}
    </div>
  )
}

/** Drop undefined/null/empty-string leaves AND any container that prunes to
 *  nothing, so the submitted payload never carries a poisoned `key: undefined`,
 *  a `''`-as-number, an emptied nested object (`g: {}`), or an empty-string
 *  array element (D6). Pure data walk. */
export function pruneEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const pruneArray = (arr: unknown[]): unknown[] =>
    arr
      .map((el) => {
        if (typeof el === 'string' && el.trim() === '') return undefined
        if (el !== null && typeof el === 'object' && !Array.isArray(el)) return pruneEmpty(el as Record<string, unknown>)
        return el
      })
      .filter((el) => el !== undefined)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (Array.isArray(v)) {
      const prunedArr = pruneArray(v)
      if (prunedArr.length > 0) out[k] = prunedArr
      continue
    }
    if (typeof v === 'object') {
      const pruned = pruneEmpty(v as Record<string, unknown>)
      if (Object.keys(pruned).length > 0) out[k] = pruned
      continue
    }
    out[k] = v
  }
  return out
}

/** A numeric/integer leaf holds a value that is not a finite number (D9: the
 *  NaN/empty gate arm; '' is handled by the required/empty arm first). */
export function isInvalidNumber(node: SchemaNode, value: unknown): boolean {
  const types = typeList(node)
  return types.length === 1 && (types[0] === 'number' || types[0] === 'integer') && (typeof value !== 'number' || !Number.isFinite(value))
}

/** THE single classification/traversal authority (D2/D9). Yields every
 *  unsupported JSON path (including array-item subtrees — the pre-fix gate
 *  fork in AnalysisPage never descended into `array.items`), every missing
 *  required leaf (at ANY depth — the pre-fix gate stopped one object deep),
 *  and every invalid numeric leaf, walking the SAME nodes the renderer walks.
 *  The AnalysisPage submit gate consumes exactly this; the forked
 *  pClassify/pUnsupportedPaths are gone. */
export interface GateIssues {
  missing: string[]
  invalidNumbers: string[]
  unsupported: string[]
}

export function collectGateIssues(schema: Record<string, unknown> | undefined, values: Record<string, unknown>): GateIssues {
  const issues: GateIssues = { missing: [], invalidNumbers: [], unsupported: [] }
  if (!schema) return issues
  const walk = (node: SchemaNode, path: string, value: unknown, required: boolean): void => {
    const cls = classify(node)
    if (cls.kind === 'unsupported') {
      issues.unsupported.push(path)
      return
    }
    if (cls.kind === 'scalar' || cls.kind === 'enum') {
      if (required && isEmptyValue(value)) {
        issues.missing.push(path)
      } else if (value !== undefined && value !== null && isInvalidNumber(node, value)) {
        issues.invalidNumbers.push(path)
      }
      return
    }
    if (cls.kind === 'group') {
      const props_ = asRecord(node.properties) ?? {}
      const reqArr = asStringArray(node.required) ?? []
      const obj = asRecord(value) ?? {}
      for (const [k, v] of Object.entries(props_)) {
        walk(v as SchemaNode, `${path}.${k}`, obj[k], reqArr.includes(k))
      }
      return
    }
    // Array arms (array-scalar / array-enum / array-object).
    const itemsNode = asRecord(node.items) ?? {}
    const reqArr = asStringArray(node.required) ?? []
    const arr = Array.isArray(value) ? value : []
    // A required array that is absent entirely is a missing control (the
    // pre-fork gate flagged this too; rows below only cover present rows).
    if (required && !Array.isArray(value)) issues.missing.push(path)
    arr.forEach((row, i) => {
      if (cls.kind === 'array-object') {
        walk(itemsNode, `${path}[${i}]`, row, reqArr.length > 0)
      } else {
        const scalar = cls.kind === 'array-scalar' ? cls.scalar : 'string'
        if (isEmptyValue(row)) {
          if (reqArr.length > 0) issues.missing.push(`${path}[${i}]`)
        } else if (scalar === 'number') {
          const types = typeList(itemsNode)
          if (types.length === 1 && (types[0] === 'number' || types[0] === 'integer') && isInvalidNumber(itemsNode, row)) {
            issues.invalidNumbers.push(`${path}[${i}]`)
          }
        }
      }
    })
  }
  const props = asRecord(schema.properties) ?? {}
  const reqArr = asStringArray(schema.required) ?? []
  for (const [k, v] of Object.entries(props)) {
    walk(v as SchemaNode, k, values[k], reqArr.includes(k))
  }
  return issues
}

/** Deep-collect `default` keywords from a schema subtree (deliverable C
 *  pre-fill source). Pure data walk — no domain knowledge. For each property
 *  that declares `default` the value lands verbatim; a group without its own
 *  default inherits the object built from its children's defaults. */
export function collectDefaults(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!schema) return {}
  const defaultFor = (node: SchemaNode): unknown => {
    if ('default' in node && node.default !== undefined) return node.default
    const types = typeList(node)
    if (types.length === 1 && types[0] === 'object') {
      const props = asRecord(node.properties)
      if (!props) return undefined
      const nested: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(props)) {
        const d = defaultFor(v as SchemaNode)
        if (d !== undefined) nested[k] = d
      }
      return Object.keys(nested).length > 0 ? nested : undefined
    }
    return undefined
  }
  const props = asRecord(schema.properties)
  if (!props) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    const d = defaultFor(v as SchemaNode)
    if (d !== undefined) out[k] = d
  }
  return out
}
