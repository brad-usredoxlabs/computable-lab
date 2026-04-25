/**
 * TapTab feature barrel exports.
 */

export type {
  FieldRowAttrs,
  SectionAttrs,
  TapTabEditorProps,
  TapTabEditorHandle,
  WidgetType,
  ArrayItemConfig,
  ObjectFieldConfig,
  ObjectWidgetConfig,
  ReflistConfig,
  MultiselectConfig,
} from './types';

export { Section, SectionHeading } from './extensions/Section';
export { FieldRow } from './extensions/FieldRow';
export { TapTabEditor, ProjectionTapTabEditor } from './TapTabEditor';
export { RecordRefPicker } from './RecordRefPicker';
export { buildDocument, buildProjectionDocument } from './documentMapper';
export { serializeDocument, isDirty } from './recordSerializer';

// Composite widget exports
export {
  ReadonlyWidget,
  DatetimeWidget,
  MultiselectWidget,
  ReflistWidget,
  ArrayWidget,
  ObjectWidget,
} from './widgets';
export type {
  ReadonlyWidgetProps,
  DatetimeWidgetProps,
  MultiselectWidgetProps,
  ReflistWidgetProps,
  ReflistEntry,
  ArrayWidgetProps,
  ObjectWidgetProps,
} from './widgets';

import './taptab.css';
