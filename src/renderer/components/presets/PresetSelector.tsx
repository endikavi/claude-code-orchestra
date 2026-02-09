import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstancePreset } from '@shared/types/presets';
import { ChevronDownIcon, SaveIcon } from '@renderer/components/icons';

interface PresetSelectorProps {
  presets: InstancePreset[];
  selectedId: string | null;
  onSelect: (preset: InstancePreset | null) => void;
  onSaveNew: () => void;
  disabled?: boolean;
}

export function PresetSelector({
  presets,
  selectedId,
  onSelect,
  onSaveNew,
  disabled = false,
}: PresetSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredPreset, setHoveredPreset] = useState<InstancePreset | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedPreset = selectedId ? presets.find((p) => p.id === selectedId) : null;
  const globalPresets = presets.filter((p) => p.isGlobal);
  const projectPresets = presets.filter((p) => !p.isGlobal);

  const handleSelect = (preset: InstancePreset | null) => {
    onSelect(preset);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {t('preset.selectPreset')}
      </label>

      <div className="flex gap-2">
        {/* Main dropdown button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`flex-1 flex items-center justify-between px-3 py-2 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-sm text-left ${
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:border-sky-600 dark:hover:border-neutral-600'
          }`}
        >
          <span
            className={`text-sm ${selectedPreset ? 'text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {selectedPreset ? selectedPreset.name : t('preset.noPreset')}
          </span>
          <ChevronDownIcon className="w-4 h-4 text-gray-400" />
        </button>

        {/* Save as preset button */}
        <button
          type="button"
          onClick={onSaveNew}
          disabled={disabled}
          className="px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-700 dark:text-gray-300 hover:border-sky-600 dark:hover:border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('preset.saveAsPreset')}
        >
          <SaveIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-600 rounded-sm shadow-lg max-h-80 overflow-auto">
          {/* No preset option */}
          <button
            type="button"
            onClick={() => handleSelect(null)}
            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-neutral-800 ${
              !selectedId ? 'bg-sky-500/10 text-sky-500' : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {t('preset.noPreset')}
          </button>

          {/* Global presets section */}
          {globalPresets.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-neutral-800/50 border-t border-gray-200 dark:border-neutral-600">
                {t('preset.globalPresets')}
              </div>
              {globalPresets.map((preset) => (
                <PresetOption
                  key={preset.id}
                  preset={preset}
                  isSelected={selectedId === preset.id}
                  onClick={() => handleSelect(preset)}
                  onHover={() => setHoveredPreset(preset)}
                  onLeave={() => setHoveredPreset(null)}
                />
              ))}
            </>
          )}

          {/* Project presets section */}
          {projectPresets.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-neutral-800/50 border-t border-gray-200 dark:border-neutral-600">
                {t('preset.projectPresets')}
              </div>
              {projectPresets.map((preset) => (
                <PresetOption
                  key={preset.id}
                  preset={preset}
                  isSelected={selectedId === preset.id}
                  onClick={() => handleSelect(preset)}
                  onHover={() => setHoveredPreset(preset)}
                  onLeave={() => setHoveredPreset(null)}
                />
              ))}
            </>
          )}

          {/* Empty state */}
          {presets.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('preset.noPresets')}
            </div>
          )}
        </div>
      )}

      {/* Preset preview tooltip */}
      {hoveredPreset && isOpen && <PresetTooltip preset={hoveredPreset} />}
    </div>
  );
}

interface PresetOptionProps {
  preset: InstancePreset;
  isSelected: boolean;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function PresetOption({ preset, isSelected, onClick, onHover, onLeave }: PresetOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-neutral-800 ${
        isSelected ? 'bg-sky-500/10' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-sm ${isSelected ? 'text-sky-500 font-medium' : 'text-gray-700 dark:text-gray-300'}`}
        >
          {preset.name}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">{preset.model}</span>
      </div>
      {preset.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
          {preset.description}
        </p>
      )}
    </button>
  );
}

interface PresetTooltipProps {
  preset: InstancePreset;
}

function PresetTooltip({ preset }: PresetTooltipProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute left-full ml-2 top-0 z-50 w-64 p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-600 rounded-sm shadow-lg">
      <h4 className="font-medium text-gray-800 dark:text-white text-sm">{preset.name}</h4>
      {preset.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{preset.description}</p>
      )}

      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">{t('instance.model')}:</span>
          <span className="text-gray-700 dark:text-gray-300 capitalize">{preset.model}</span>
        </div>

        {preset.planMode && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">{t('instance.planMode')}:</span>
            <span className="text-green-600 dark:text-green-400">{t('common.yes')}</span>
          </div>
        )}

        {preset.verbose && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">{t('instance.verbose')}:</span>
            <span className="text-green-600 dark:text-green-400">{t('common.yes')}</span>
          </div>
        )}

        {preset.agentFile && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">{t('instance.agentFile')}:</span>
            <span
              className="text-gray-700 dark:text-gray-300 truncate max-w-[120px]"
              title={preset.agentFile}
            >
              {preset.agentFile.split('/').pop()}
            </span>
          </div>
        )}

        {preset.initialPrompt && (
          <div className="text-xs mt-2">
            <span className="text-gray-500 dark:text-gray-400">{t('preset.initialPrompt')}:</span>
            <p className="text-gray-700 dark:text-gray-300 mt-0.5 line-clamp-2">
              {preset.initialPrompt}
            </p>
          </div>
        )}

        {preset.tags && preset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {preset.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
