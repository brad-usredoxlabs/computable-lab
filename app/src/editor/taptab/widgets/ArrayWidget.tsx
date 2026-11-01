/**
 * ArrayWidget — renders repeatable item groups / repeaters.
 * Each item is a structured object, not collapsed to JSON text.
 *
 * WIDGET-R1 (D11/D18 + A3 data legs): when a typed item-hint is provided
 * (itemHint prop, forwarded from the projection slot), the widget becomes
 * AUTHORABLE — "+ Add item" seeds an item from the hint's field set (never
 * bare `{}`), and each item renders authorable sub-fields by REUSING the
 * existing ObjectWidget path (the item IS an ObjectWidget; editing a
 * sub-field commits the whole item back at its index).
 *
 * The seed is HINT-DRIVEN and GENERIC (no kind table, no field-name branch,
 * WIDGET-R1 A3): a `select`/`radio` sub-field whose hint declares EXACTLY
 * ONE option seeds that option's `value`; every other sub-field seeds `''`.
 * The merged knowledge ui.yaml item-hints declare the datatypes/ref `kind`
 * discriminator as a single-option select (value "record"), so a seeded ref
 * item GENUINELY carries `kind: "record"` before the author touches it — the
 * value is read FROM THE HINT (delete the option and the seed degrades; the
 * widget never hardcodes "record").
 *
 * Hint-LESS arrays keep today's behavior: "+ Add item" commits `{}` and the
 * projection keeps its loud UNSUPPORTED_WIDGET diagnostic (a hint-less array
 * is a spec defect marker — never silenced).
 *
 * All array-commit buttons (remove / add / done) carry an explicit
 * `type="button"`: inside the create `<form>` a button with no `type`
 * defaults to `type="submit"` and would submit the form on every array-item
 * commit (the fix-run-2 duplicate-POST defect). One submit per authored
 * payload.
 */

import { useState } from 'react';
import type { WidgetType, ArrayItemHintField, ObjectFieldConfig } from '../types';
import { isRefWidget } from '../refValue';
import { ObjectWidget } from './ObjectWidget';

/**
 * A declarative item-hint for an array widget — the projection's `items`
 * member (server `FieldHint`, app `FieldHint`). Mirrors the object-widget
 * shape (path + widget + fields) so the existing ObjectWidget can be
 * reused directly for each item.
 *
 * WIDGET-R1 fix-run 2 (D2 / ruling ARCHD2L1T1335 OPT-A): the field entries
 * are SELF-RECURSIVE (`ArrayItemHintField.fields?`, types.ts) — a field
 * whose hint declares its own `fields` is a nested object. The widget
 * forwards the nested `fields` through (recursive mapping, `mapHintFields
 * ToObjectFields` below) and the ObjectWidget renders that property
 * through another ObjectWidget. Recursion depth is data-driven. OPTIONAL —
 * a flat hint is byte-identical to the pre-change shape.
 */
export interface ArrayItemHint {
  /** Item JSONPath (e.g. `$.item`) — declarative, not addressable per-item. */
  path?: string;
  /** Item widget type (`object` in the merged knowledge ui.yaml). */
  widget?: string;
  /** Item label (display-only). */
  label?: string;
  /** Nested field hints (the item's sub-fields) — self-recursive. */
  fields?: ArrayItemHintField[];
}

export interface ArrayWidgetProps {
  value: unknown;
  widget: WidgetType;
  readOnly: boolean;
  onCommit: (newValue: unknown) => void;
  /**
   * WIDGET-R1: the item-hint forwarded from the projection slot's `items`
   * member. When present (with a non-empty `fields` list) the widget seeds
   * items from the hint's field set and renders each item through the
   * existing ObjectWidget. When absent the widget keeps today's bare-`{}`
   * behavior.
   *
   * WIDGET-R1 fix-run 1 (D3): declared `| null` because that is the ACTUAL
   * runtime contract — FieldRow's TipTap attr spec is `itemHint: { default:
   * null }` (the attr default stays null for JSON round-trip parity with the
   * other composite attrs), so a hint-less array slot reaches this widget
   * with `null`, not `undefined`. The widget treats null and undefined
   * IDENTICALLY (the `!= null` guard); the prop type now says so instead of
   * lying `undefined`-only.
   */
  itemHint?: ArrayItemHint | null;
}

/**
 * Format a single array item for display.
 * - object → formatted key-value pairs
 * - primitive → formatted string
 */
function formatItem(item: unknown): string {
  if (item === null || item === undefined) return '—';
  if (typeof item === 'object' && !Array.isArray(item)) {
    const entries = Object.entries(item as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => `  ${k}: ${formatItem(v)}`)
      .join('\n');
  }
  if (Array.isArray(item)) {
    return item.map(formatItem).join('\n');
  }
  return String(item);
}

/**
 * WIDGET-R1 A3 (generic, hint-driven, no kind table / no field-name branch):
 * seed one item from the hint's field set. A `select`/`radio` sub-field whose
 * hint declares EXACTLY ONE option seeds that option's `value` (the
 * datatypes/ref `kind` discriminator is declared that way in the merged
 * knowledge ui.yaml — the value is read FROM THE HINT); every other
 * sub-field seeds `''`.
 *
 * W2 part 2 (C2): a `ref` / `record-ref` sub-field is seeded ABSENT (its key
 * is NOT present in the seed), never `''`. A ref position holds a structured
 * ref OBJECT (datatypes/ref.schema.yaml) or is absent — `''` into a ref slot
 * is schema-invalid (the QMS-6E "Expected type: object" 422). The branch is
 * on the DECLARED widget type (the isRefWidget discriminator from refValue
 * — the single source of truth for which widget types hold a ref object),
 * never on a field name.
 */
function seedItemFromHint(hint: ArrayItemHint): Record<string, unknown> {
  const seed: Record<string, unknown> = {};
  for (const field of hint.fields ?? []) {
    if (!field || typeof field.path !== 'string' || field.path.length === 0) continue;
    // Ref sub-fields are seeded absent (never ''), per the ref value
    // emission contract.
    if (isRefWidget(field.widget)) continue;
    const isSingleOptionSelect =
      (field.widget === 'select' || field.widget === 'radio') &&
      Array.isArray(field.options) &&
      field.options.length === 1;
    seed[field.path] = isSingleOptionSelect ? (field.options![0]?.value ?? '') : '';
  }
  return seed;
}

/**
 * WIDGET-R1 fix-run 2 (D2 / ruling ARCHD2L1T1335 OPT-A): map hint field
 * entries to ObjectWidget property configs — RECURSIVE (same pattern as
 * the existing options map). A hint field that declares its own `fields`
 * is a nested object: its nested `fields` are mapped the same way and
 * forwarded as `fields` on the ObjectFieldConfig, so the ObjectWidget
 * renders that property through another ObjectWidget. Fields WITHOUT
 * `fields` map to the pre-change entry shape EXACTLY (no `fields` member
 * is added — the flat path renders byte-identically). No widget-name or
 * field-name branch anywhere: the branch is purely on the presence of a
 * non-empty `fields` member in the hint data.
 */
function mapHintFieldsToObjectFields(
  fields: ArrayItemHintField[],
): ObjectFieldConfig[] {
  return fields.map((f) => ({
    name: f.path,
    widget: f.widget as WidgetType,
    label: f.label ?? f.path,
    help: f.help,
    required: f.required ?? false,
    ...(f.options !== undefined && {
      options: f.options?.map((o) => ({
        value: String(o.value),
        label: o.label,
      })),
    }),
    // W2 part 2: forward the declared refKind + suggestion props so the
    // ObjectWidget can render a ref/record-ref sub-field through the
    // EXISTING picker machinery (RefCombobox / RecordRefPicker) with the
    // same suggestion plan the top-level slot would get. Absent for flat
    // sub-fields (byte-identical).
    ...(f.refKind !== undefined && { refKind: f.refKind }),
    ...(f.props !== undefined && { props: f.props }),
    ...(Array.isArray(f.fields) && f.fields.length > 0
      ? { fields: mapHintFieldsToObjectFields(f.fields) }
      : {}),
  }));
}

export function ArrayWidget({ value, widget, readOnly, onCommit, itemHint }: ArrayWidgetProps) {
  const [editing, setEditing] = useState(false);

  const items = Array.isArray(value) ? value : value ? [value] : [];
  // WIDGET-R1: an item-hint is only AUTHORABLE-driving when it declares a
  // non-empty sub-field set. A hint that merely names a widget but lists no
  // fields is treated as hint-less (the loud-fallback path stays honest).
  //
  // WIDGET-R1 fix-run 1 (D3, A7b browser-gate defect): FieldRow's TipTap
  // extension declares `itemHint: { default: null }`, so a hint-less array
  // slot reaches this widget with `itemHint === null`, NOT undefined — the
  // guard must be `!= null` (null and undefined are IDENTICAL at this
  // boundary) or `itemHint.fields` throws `TypeError: Cannot read properties
  // of null (reading 'fields')` and blows up the ENTIRE editor via the error
  // boundary (reproduced live on /record/ILOG-000001 $.entries and
  // /record/MSR-000001 $.channels). The two `itemHint!` non-null assertions
  // below (addItem + the per-item ObjectWidget render) sit strictly behind
  // this guard, so the narrowing here is what keeps them sound: once
  // `hintActive` is true, `itemHint` is a non-null object with a non-empty
  // `fields` array, and no other code path reads it.
  const hintActive =
    itemHint != null && Array.isArray(itemHint.fields) && itemHint.fields.length > 0;

  const removeItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    onCommit(updated);
  };

  const addItem = () => {
    if (hintActive) {
      onCommit([...items, seedItemFromHint(itemHint!)]);
    } else {
      // Hint-LESS fallback (loud, unchanged): bare {} commit.
      onCommit([...items, {}]);
    }
  };

  if (readOnly) {
    return (
      <span className="taptab-widget-value taptab-array-value" data-widget={widget}>
        {items.length > 0 ? (
          <ul className="taptab-array-items" style={{ margin: 0, paddingLeft: '1.2em' }}>
            {items.map((item, i) => (
              <li key={i} className="taptab-array-item">
                <pre className="taptab-array-item-content" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {formatItem(item)}
                </pre>
              </li>
            ))}
          </ul>
        ) : (
          <span className="taptab-array-empty">Empty array</span>
        )}
      </span>
    );
  }

  if (editing) {
    return (
      <div className="taptab-array-editor" data-widget={widget}>
        {items.map((item, i) => (
          <div key={i} className="taptab-array-entry">
            {hintActive ? (
              // WIDGET-R1: each item renders authorable sub-fields by REUSING
              // the existing ObjectWidget path. Editing a sub-field commits
              // the WHOLE item object; the array splices it back at `i`.
              //
              // WIDGET-R1 fix-run 2 (D2 / ruling ARCHD2L1335 OPT-A): the
              // mapping is RECURSIVE — a hint field that declares its own
              // `fields` is a nested object and its `fields` are forwarded
              // through (same pattern as the options map), so the
              // ObjectWidget renders that property through another
              // ObjectWidget. Branch purely on non-empty `fields` in the
              // hint data — no widget-name / field-name branch.
              <ObjectWidget
                value={item}
                widget="object"
                properties={mapHintFieldsToObjectFields(itemHint!.fields ?? [])}
                readOnly={false}
                onCommit={(newValue) => {
                  const updated = [...items];
                  updated[i] = newValue;
                  onCommit(updated);
                }}
              />
            ) : (
              <pre className="taptab-array-entry-content" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {formatItem(item)}
              </pre>
            )}
            <button
              type="button"
              className="taptab-array-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeItem(i);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="taptab-array-add"
          onClick={(e) => {
            e.stopPropagation();
            addItem();
          }}
        >
          + Add item
        </button>
        <button
          type="button"
          className="taptab-array-done"
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
      className="taptab-widget-value taptab-array-value"
      data-widget={widget}
      onClick={() => setEditing(true)}
    >
      {items.length > 0 ? (
        <ul className="taptab-array-items" style={{ margin: 0, paddingLeft: '1.2em' }}>
          {items.map((item, i) => (
            <li key={i} className="taptab-array-item">
              <pre className="taptab-array-item-content" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {formatItem(item)}
              </pre>
            </li>
          ))}
        </ul>
      ) : (
        <span className="taptab-array-empty">Click to add items</span>
      )}
    </span>
  );
}
