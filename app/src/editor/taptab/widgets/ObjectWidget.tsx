/**
 * ObjectWidget — renders grouped nested slots for object values.
 * Does NOT collapse to raw JSON text.
 */

import { useState } from 'react';
import type { WidgetType, ObjectFieldConfig } from '../types';

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
          return (
            <div key={prop.name} className="taptab-object-field">
              <label className="taptab-object-field-label">
                {prop.label}
                {prop.required && <span className="taptab-object-required">*</span>}
              </label>
              <input
                type="text"
                value={String(propValue ?? '')}
                onChange={(e) => handleFieldChange(prop.name, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="taptab-object-field-input"
              />
              {prop.help && <span className="taptab-object-field-help">{prop.help}</span>}
            </div>
          );
        })}
        <button
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
