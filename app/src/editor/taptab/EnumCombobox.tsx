import { useState, useRef, useEffect, KeyboardEvent, MouseEvent } from 'react';
import { focusAdjacentTapTabField } from './tabNavPlugin';

export interface EnumComboboxProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (value: string) => void;
  onCancel: () => void;
}

export function EnumCombobox({ options, value, onSelect, onCancel }: EnumComboboxProps) {
  // Start with an empty filter so the full option list shows on open (the stored
  // value is a code like "CC-BY-4.0" that doesn't match any human label, so
  // pre-filling it would render "No matches"). The current value is highlighted
  // instead, so type→arrow→select reads the same as the chips field.
  const [filterText, setFilterText] = useState('');
  const initialIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [highlightIndex, setHighlightIndex] = useState(initialIndex);
  // Whether the user has actively navigated this field (typed or arrowed). Tab
  // only commits when they have — so tabbing straight through an already-set
  // field leaves its value untouched instead of re-committing the highlight.
  const [interacted, setInteracted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Auto-focus the input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Filter options case-insensitively by label
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(filterText.toLowerCase())
  );

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && highlightIndex < filteredOptions.length && listRef.current) {
      const highlightedItem = listRef.current.children[highlightIndex] as HTMLElement;
      if (highlightedItem) {
        highlightedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex, filteredOptions]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setInteracted(true);
      setHighlightIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setInteracted(true);
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0 && highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
        onSelect(filteredOptions[highlightIndex].value);
      }
    } else if (e.key === 'Tab') {
      // Single-select Tab: commit the highlighted option, then advance to the
      // next field (unlike the multi-select chips, which stay open for more).
      // Keydowns inside this React widget never reach the outer tab-nav plugin,
      // so advance focus explicitly. Only commit when the user actually
      // navigated the field — otherwise tabbing through a set field would
      // overwrite its value with the highlight.
      e.preventDefault();
      e.stopPropagation();
      const from = e.currentTarget as HTMLElement;
      if (interacted && filteredOptions.length > 0 && highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
        onSelect(filteredOptions[highlightIndex].value);
      } else {
        // Nothing changed — leave the value as-is and just close the editor.
        onCancel();
      }
      focusAdjacentTapTabField(from, e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInteracted(true);
    setFilterText(e.target.value);
    setHighlightIndex(0);
  };

  const handleOptionClick = (optionValue: string) => {
    onSelect(optionValue);
  };

  const handleMouseDown = (e: MouseEvent<HTMLLIElement>) => {
    // Prevent blur from firing before selection
    e.preventDefault();
  };

  // Close (without committing) when focus leaves the field — e.g. the user
  // clicks another field. Without this the combobox lingers open, and because
  // an open combobox renders no .taptab-widget-value it drops out of the
  // tab-nav field list, so Tab silently skips the license field afterwards.
  const handleBlur = () => {
    onCancel();
  };

  // Show the current selection as placeholder text so an opened-but-empty filter
  // still tells the user what the field is set to (the value is a code like
  // "CC-BY-4.0", so display the friendly label).
  const currentLabel = options.find((o) => o.value === value)?.label;

  return (
    <div className="enum-combobox">
      <input
        ref={inputRef}
        type="text"
        value={filterText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="taptab-inline-input"
        onClick={(e) => e.stopPropagation()}
        placeholder={currentLabel ? `${currentLabel} — type to change…` : 'Type to filter…'}
      />
      <ul className="enum-dropdown" ref={listRef}>
        {filteredOptions.length === 0 ? (
          <li className="no-match">No matches</li>
        ) : (
          filteredOptions.map((option, index) => (
            <li
              key={option.value}
              className={index === highlightIndex ? 'highlighted' : ''}
              onClick={() => handleOptionClick(option.value)}
              onMouseDown={handleMouseDown}
            >
              {option.label}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
