import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon, CloseIcon } from '@renderer/components/icons';

interface FileSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export const FileSearchInput = forwardRef<HTMLInputElement, FileSearchInputProps>(
  ({ value, onChange, onClear, onKeyDown }, ref) => {
    const { t } = useTranslation();

    return (
      <div className="relative px-3 py-2">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-2 w-3.5 h-3.5 text-gray-400" />
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('files.filterPlaceholder')}
            className="w-full pl-7 pr-7 py-1.5 text-xs bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 focus:ring-1 focus:ring-sky-500/20"
          />
          {value && (
            <button
              onClick={onClear}
              className="absolute right-1.5 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
              title={t('files.clearFilter')}
            >
              <CloseIcon className="w-3 h-3 text-gray-400" />
            </button>
          )}
        </div>
      </div>
    );
  }
);
