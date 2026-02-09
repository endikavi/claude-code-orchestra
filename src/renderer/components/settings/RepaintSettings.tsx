import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/uiStore';
import { CheckIcon, WarningIcon, InfoIcon } from '@renderer/components/icons';
import type { RepaintMode } from '@shared/types/uiSettings';

interface RepaintOption {
  mode: RepaintMode;
  labelKey: string;
  descKey: string;
  intensity: 'low' | 'medium' | 'high';
}

const REPAINT_OPTIONS: RepaintOption[] = [
  {
    mode: 'disabled',
    labelKey: 'settings.repaint.disabled',
    descKey: 'settings.repaint.disabledDesc',
    intensity: 'low',
  },
  {
    mode: 'manual',
    labelKey: 'settings.repaint.manual',
    descKey: 'settings.repaint.manualDesc',
    intensity: 'low',
  },
  {
    mode: 'interval',
    labelKey: 'settings.repaint.interval',
    descKey: 'settings.repaint.intervalDesc',
    intensity: 'medium',
  },
  {
    mode: 'frame',
    labelKey: 'settings.repaint.frame',
    descKey: 'settings.repaint.frameDesc',
    intensity: 'high',
  },
  {
    mode: 'fake-resize',
    labelKey: 'settings.repaint.fakeResize',
    descKey: 'settings.repaint.fakeResizeDesc',
    intensity: 'medium',
  },
  {
    mode: 'ansi-clear',
    labelKey: 'settings.repaint.ansiClear',
    descKey: 'settings.repaint.ansiClearDesc',
    intensity: 'low',
  },
];

const INTERVAL_OPTIONS = [100, 200, 500, 1000, 2000, 5000];

export function RepaintSettings() {
  const { t } = useTranslation();
  const { repaintSettings, setRepaintSettings } = useUIStore(
    useShallow((s) => ({
      repaintSettings: s.repaintSettings,
      setRepaintSettings: s.setRepaintSettings,
    }))
  );

  const handleModeChange = (mode: RepaintMode) => {
    setRepaintSettings({ mode });
  };

  const handleIntervalChange = (intervalMs: number) => {
    setRepaintSettings({ intervalMs });
  };

  const getIntensityColor = (intensity: 'low' | 'medium' | 'high') => {
    switch (intensity) {
      case 'low':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'high':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    }
  };

  const getIntensityLabel = (intensity: 'low' | 'medium' | 'high') => {
    switch (intensity) {
      case 'low':
        return t('settings.repaint.intensityLow', 'Low');
      case 'medium':
        return t('settings.repaint.intensityMedium', 'Medium');
      case 'high':
        return t('settings.repaint.intensityHigh', 'High');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('settings.repaint.title', 'Terminal Repaint (Experimental)')}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t(
            'settings.repaint.description',
            'Experimental options to fix visual glitches in Claude Code TUI. Try different modes if you experience display issues.'
          )}
        </p>
      </div>

      {/* Warning Banner */}
      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded">
        <div className="flex items-start gap-2">
          <WarningIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t(
              'settings.repaint.warning',
              'These are experimental options that may affect performance. "Frame" mode uses significant CPU. Start with "disabled" and only enable if you experience visual issues.'
            )}
          </p>
        </div>
      </div>

      {/* Mode Selection */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
          {t('settings.repaint.mode', 'Repaint Mode')}
        </label>
        <div className="grid grid-cols-1 gap-2">
          {REPAINT_OPTIONS.map((option) => (
            <label
              key={option.mode}
              className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                repaintSettings.mode === option.mode
                  ? 'bg-sky-500/20 border border-sky-500'
                  : 'bg-white/50 dark:bg-neutral-700/50 border border-gray-200 dark:border-neutral-600 hover:bg-white/70 dark:hover:bg-neutral-700'
              }`}
            >
              <input
                type="radio"
                name="repaintMode"
                value={option.mode}
                checked={repaintSettings.mode === option.mode}
                onChange={() => handleModeChange(option.mode)}
                className="sr-only"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800 dark:text-white">
                    {t(option.labelKey, option.mode)}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${getIntensityColor(option.intensity)}`}
                  >
                    {getIntensityLabel(option.intensity)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t(option.descKey, '')}
                </p>
              </div>
              {repaintSettings.mode === option.mode && (
                <CheckIcon className="w-4 h-4 text-sky-500 flex-shrink-0" />
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Interval Slider (only shown when mode is 'interval') */}
      {repaintSettings.mode === 'interval' && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            {t('settings.repaint.intervalMs', 'Repaint Interval')}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={100}
              max={5000}
              step={100}
              value={repaintSettings.intervalMs}
              onChange={(e) => handleIntervalChange(parseInt(e.target.value))}
              className="flex-1 accent-sky-500"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-16 text-right">
              {repaintSettings.intervalMs}ms
            </span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{t('settings.repaint.faster', 'Faster')}</span>
            <span>{t('settings.repaint.slower', 'Slower')}</span>
          </div>
          {/* Quick select buttons */}
          <div className="flex gap-2 flex-wrap">
            {INTERVAL_OPTIONS.map((ms) => (
              <button
                key={ms}
                onClick={() => handleIntervalChange(ms)}
                className={`px-2 py-1 text-xs rounded ${
                  repaintSettings.intervalMs === ms
                    ? 'bg-sky-500 text-white'
                    : 'bg-gray-100 dark:bg-neutral-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-600'
                }`}
              >
                {ms}ms
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Info about manual mode */}
      {repaintSettings.mode === 'manual' && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
          <div className="flex items-start gap-2">
            <InfoIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {t(
                'settings.repaint.manualInfo',
                'A repaint button will appear in the terminal toolbar. Click it to force a terminal refresh when you see visual glitches.'
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
