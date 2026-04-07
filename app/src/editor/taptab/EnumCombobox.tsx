import { useState, useRef, useEffect, KeyboardEvent, MouseEvent } from 'react';

export interface EnumComboboxProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onSelect: (value: string) => void;
  onCancel: () => void;
}

export function EnumCombobox({ options, value, onSelect, onCancel }: EnumComboboxProps) {
  const [filterText, setFilterText] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(0);
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

  // Reset highlight index when filter changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [filterText]);

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
      setHighlightIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions.length > 0 && highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
        onSelect(filteredOptions[highlightIndex].value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
  };

  const handleOptionClick = (optionValue: string) => {
    onSelect(optionValue);
  };

  const handleMouseDown = (e: MouseEvent<HTMLLIElement>) => {
    // Prevent blur from firing before selection
    e.preventDefault();
  };

  return (
    <div className="enum-combobox">
      <input
        ref={inputRef}
        type="text"
        value={filterText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        className="taptab-inline-input"
        onClick={(e) => e.stopPropagation()}
        placeholder="Type to filter..."
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
