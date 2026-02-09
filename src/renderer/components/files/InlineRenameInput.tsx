import { useState, useRef, useEffect, useCallback } from 'react';

interface InlineRenameInputProps {
  initialName: string;
  onSubmit: (newName: string) => void;
  onCancel: () => void;
  selectNameOnly?: boolean; // Select just the name part (not extension)
}

export function InlineRenameInput({
  initialName,
  onSubmit,
  onCancel,
  selectNameOnly = true,
}: InlineRenameInputProps) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();

    if (selectNameOnly && initialName.includes('.')) {
      const dotIndex = initialName.lastIndexOf('.');
      input.setSelectionRange(0, dotIndex);
    } else {
      input.select();
    }
  }, [initialName, selectNameOnly]);

  const handleSubmit = useCallback(() => {
    if (submittedRef.current) return;
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('/')) {
      onCancel();
      return;
    }
    if (trimmed === initialName) {
      onCancel();
      return;
    }
    submittedRef.current = true;
    onSubmit(trimmed);
  }, [value, initialName, onSubmit, onCancel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    e.stopPropagation();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleSubmit}
      className="text-xs bg-white dark:bg-neutral-800 border border-primary rounded px-1 py-0.5 text-gray-700 dark:text-gray-200 outline-none focus:ring-1 focus:ring-primary w-full min-w-0"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    />
  );
}
