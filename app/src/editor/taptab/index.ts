/**
 * TapTab feature barrel exports.
 */

export type {
  FieldRowAttrs,
  SectionAttrs,
  TapTabEditorProps,
  TapTabEditorHandle,
} from './types';

export { Section, SectionHeading } from './extensions/Section';
export { FieldRow } from './extensions/FieldRow';
export { TapTabEditor } from './TapTabEditor';
export { buildDocument } from './documentMapper';
export { serializeDocument, isDirty } from './recordSerializer';

import './taptab.css';
