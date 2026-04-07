import type { ComponentType } from 'react'
import type { WidgetProps } from './types'
import { TextWidget } from './TextWidget'
import { TextareaWidget } from './TextareaWidget'
import { NumberWidget } from './NumberWidget'
import { SelectWidget } from './SelectWidget'
import { CheckboxWidget } from './CheckboxWidget'
import { ArrayWidget } from './ArrayWidget'
import { RefWidget } from './RefWidget'
import { MarkdownWidget } from './MarkdownWidget'
import { ComboboxWidget } from './ComboboxWidget'

const registry: Record<string, ComponentType<WidgetProps>> = {
  text: TextWidget,
  date: TextWidget,
  datetime: TextWidget,
  readonly: TextWidget,
  custom: TextWidget,
  textarea: TextareaWidget,
  number: NumberWidget,
  select: SelectWidget,
  multiselect: SelectWidget,
  radio: SelectWidget,
  checkbox: CheckboxWidget,
  array: ArrayWidget,
  reflist: ArrayWidget,
  ref: RefWidget,
  markdown: MarkdownWidget,
  combobox: ComboboxWidget,
}

/** Look up a widget component by type string. Falls back to TextWidget. */
export function getWidget(widgetType: string): ComponentType<WidgetProps> {
  return registry[widgetType] || TextWidget
}

export type { WidgetProps } from './types'
