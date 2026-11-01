/**
 * ObjectWidget — renders grouped nested slots for object values.
 * Does NOT collapse to raw JSON text.
 */

import { useState } from 'react';
import type { WidgetType, ObjectFieldConfig } from '../types';
import { isRefWidget, isDisplayOnlyRefValue } from '../refValue';
import { buildSuggestionPlanFromFieldHint } from '../../../shared/forms/suggestionPlan';
import { RefCombobox } from '../RefCombobox';
import { RecordRefPicker, type RecordRefSelection } from '../RecordRefPicker';
import { commitRefSelection } from '../refSelectionValue';

export interface ObjectWidgetProps {
  value: unknown;
  widget: WidgetType;
  properties: ObjectFieldConfig[];
  readOnly: boolean;
  onCommit: (newValue: unknown) => void;
}

/**
 * Get a value at a dotted path from an object.
 */
function getValueAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a value at a dotted path immutably.
 */
function setValueAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split('.');
  const result = { ...obj };
  let current = result;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    } else {
      current[part] = { ...(current[part] as Record<string, unknown>) };
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  current[lastPart] = value;
  return result;
}

/**
 * W2 part 2 (OPT-B C2): the ref-picker SEED text for a ref sub-field's
 * current value — what RefCombobox / RecordRefPicker show before the user
 * re-searches. A ref OBJECT displays its label (or its id when label-less);
 * a legacy plain string displays verbatim; absent/null/'' display ''.
 * Display-only (the picker's initial query) — the COMMIT is always the
 * canonical ref OBJECT (commitRefSelection / the record picker's own
 * object), never this string.
 */
function refPickerDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    // A placeholder/'—'/empty string is the TRUE empty for a ref position
    // (isDisplayOnlyRefValue / normalizeRefFieldValue contract) — the
    // picker's seed query starts empty, never re-echoing the placeholder.
    return isDisplayOnlyRefValue(value) ? '' : value;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.label === 'string' && o.label.length > 0) return o.label;
    if (typeof o.id === 'string') return o.id;
  }
  return '';
}

export function ObjectWidget({
  value,
  widget,
  properties,
  readOnly,
  onCommit,
}: ObjectWidgetProps) {
  const [editing, setEditing] = useState(false);

  const objValue = (value as Record<string, unknown>) ?? {};

  const handleFieldChange = (propName: string, newValue: unknown) => {
    onCommit(setValueAtPath(objValue, propName, newValue));
  };

  if (readOnly) {
    return (
      <span className="taptab-widget-value taptab-object-value" data-widget={widget}>
        {properties.length > 0 ? (
          <ul className="taptab-object-properties" style={{ margin: 0, paddingLeft: '1.2em' }}>
            {properties.map((prop) => {
              const propValue = getValueAtPath(objValue, prop.name);
              return (
                <li key={prop.name} className="taptab-object-property">
                  <span className="taptab-object-property-label">{prop.label}:</span>{' '}
                  <span className="taptab-object-property-value">
                    {propValue === null || propValue === undefined
                      ? '—'
                      : typeof propValue === 'object'
                        ? JSON.stringify(propValue)
                        : String(propValue)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <span className="taptab-object-empty">Empty object</span>
        )}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="taptab-object-editor" data-widget={widget}>
        {properties.map((prop) => {
          const propValue = getValueAtPath(objValue, prop.name);
          // WIDGET-R1 fix-run 2 (D2 / ruling ARCHD2L1T1335 OPT-A): a
          // property whose config carries NON-EMPTY `fields` is a nested
          // object — render it under the existing label through ANOTHER
          // ObjectWidget (recursion; the nested editor's onCommit commits
          // the nested object back at `prop.name` via the SAME
          // handleFieldChange path, and setValueAtPath walks/creates the
          // path immutably, so nested commits compose with zero plumbing).
          // The branch is on NON-EMPTY `fields` ONLY — never on widget
          // names or field names — and the flat input path below renders
          // EXACTLY as before for properties without nested fields.
          const nestedFields = Array.isArray(prop.fields) ? prop.fields : [];
          const hasNestedFields = nestedFields.length > 0;
          // W2 part 2 (OPT-B C2): a FLAT sub-field whose DECLARED widget is a
          // ref/record-ref (the isRefWidget discriminator from refValue —
          // the single source of truth for which widget types hold a ref
          // object; the branch is on the declared widget, NEVER on a field
          // name / kind name) renders the EXISTING picker machinery instead
          // of the flat text input: RefCombobox over the /resolve spine for
          // `ref` (the suggestion plan built from the ui.yaml-declared
          // props — the ontology-ref pattern: the 'ols' source turns on the
          // spine, valueShape ontology-ref commits the canonical ref OBJECT
          // via the shared commitRefSelection), RecordRefPicker for
          // `record-ref` scoped to the declared refKind (it commits its own
          // canonical {kind:'record',...} object). A placeholder/'—' string
          // (isDisplayOnlyRefValue) is the TRUE empty for a ref position and
          // commits null (normalizeRefFieldValue) — never a stored ''.
          const isRefSubField = !hasNestedFields && isRefWidget(prop.widget);
          // GATE-FIX-1 D2 (gate-l1t1520): a FLAT sub-field whose DECLARED
          // widget is `select` with NON-EMPTY `options` data renders a native
          // <select> offering exactly those options — the same data-driven
          // dispatch discipline as the ref/fields branches above (the branch
          // is on the declared widget + options members, never on field names
          // or option values). A select WITHOUT options falls through to the
          // text input, exactly as before.
          const isSelectSubField =
            !hasNestedFields &&
            prop.widget === 'select' &&
            Array.isArray(prop.options) &&
            prop.options.length > 0;
          return (
            <div key={prop.name} className="taptab-object-field">
              <label className="taptab-object-field-label">
                {prop.label}
                {prop.required && <span className="taptab-object-required">*</span>}
              </label>
              {hasNestedFields ? (
                <ObjectWidget
                  value={getValueAtPath(objValue, prop.name)}
                  widget="object"
                  properties={nestedFields}
                  readOnly={false}
                  onCommit={(v) => handleFieldChange(prop.name, v)}
                />
              ) : isRefSubField ? (
                prop.widget === 'record-ref' ? (
                  <RecordRefPicker
                    value={refPickerDisplayValue(propValue)}
                    refKind={prop.refKind || 'default'}
                    onSelect={(ref: RecordRefSelection) =>
                      handleFieldChange(prop.name, ref)
                    }
                    onCancel={() => undefined}
                  />
                ) : (
                  <RefCombobox
                    value={refPickerDisplayValue(propValue)}
                    refKind={prop.refKind || 'default'}
                    suggestionPlan={
                      prop.widget === 'ref'
                        ? buildSuggestionPlanFromFieldHint(
                            prop.widget,
                            prop.props,
                            prop.refKind,
                            prop.options,
                          )
                        : undefined
                    }
                    onSelect={(v, s, t) =>
                      handleFieldChange(prop.name, commitRefSelection(v, s, t))
                    }
                    onCancel={() => undefined}
                  />
                )
              ) : isSelectSubField ? (
                (() => {
                  // The current value as a declared option's VALUE (the stored
                  // value is a flat token; an object-shaped value falls back to
                  // its label/id — the same display derivation the ref pickers
                  // use).
                  const raw = propValue;
                  const current =
                    typeof raw === 'string'
                      ? raw
                      : raw !== null && typeof raw === 'object'
                        ? (typeof (raw as Record<string, unknown>).label === 'string'
                            ? String((raw as Record<string, unknown>).label)
                            : typeof (raw as Record<string, unknown>).id === 'string'
                              ? String((raw as Record<string, unknown>).id)
                              : '')
                        : '';
                  const matched = prop.options!.find((o) => o.value === current);
                  // GATE-FIX-2 N1 (adv-l1t1730): a stored value that names NO
                  // declared option (absent / '' / an unrecognized token)
                  // renders the control in an explicit UNSET state — a
                  // selectable empty placeholder option (value "") FIRST —
                  // instead of coercing to options[0] (the editor must not
                  // display a value the record does not hold; absent =
                  // unknown, never a default). The matching case keeps the
                  // exactly-the-declared-options render with that option
                  // selected (the D2 contract). The placeholder TEXT is the
                  // field's own declared label (data-derived, never a
                  // hardcoded string).
                  const isUnset = matched === undefined;
                  return (
                    <select
                      className="taptab-object-field-select"
                      value={matched ? matched.value : ''}
                      onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isUnset && (
                        <option value="">{prop.label}</option>
                      )}
                      {prop.options!.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  );
                })()
              ) : (
                <input
                  type="text"
                  value={String(propValue ?? '')}
                  onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="taptab-object-field-input"
                />
              )}
              {prop.help && <span className="taptab-object-field-help">{prop.help}</span>}
            </div>
          );
        })}
        <button
          type="button"
          className="taptab-object-done"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(false);
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <span
      className="taptab-widget-value taptab-object-value"
      data-widget={widget}
      onClick={() => setEditing(true)}
    >
      {properties.length > 0 ? (
        <ul className="taptab-object-properties" style={{ margin: 0, paddingLeft: '1.2em' }}>
          {properties.map((prop) => {
            const propValue = getValueAtPath(objValue, prop.name);
            return (
              <li key={prop.name} className="taptab-object-property">
                <span className="taptab-object-property-label">{prop.label}:</span>{' '}
                <span className="taptab-object-property-value">
                  {propValue === null || propValue === undefined
                    ? '—'
                    : typeof propValue === 'object'
                      ? JSON.stringify(propValue)
                      : String(propValue)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="taptab-object-empty">Click to edit</span>
      )}
    </span>
  );
}
