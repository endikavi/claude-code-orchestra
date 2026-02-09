import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/uiStore';
import { InfoIcon } from '@renderer/components/icons';

export function SharedContextSettings() {
  const { t } = useTranslation();
  const { sharedContext, setSharedContext } = useUIStore(
    useShallow((s) => ({
      sharedContext: s.sharedContext,
      setSharedContext: s.setSharedContext,
    }))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-gray-800 dark:text-white">
          {t('settings.context.title', 'Shared Context')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t(
            'settings.context.description',
            'Configure how Claude instances share context with each other within the same project.'
          )}
        </p>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-neutral-800/50 rounded border border-gray-200 dark:border-neutral-700">
        <div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-white">
            {t('settings.context.enabled', 'Enable Shared Context')}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t(
              'settings.context.enabledDesc',
              'Allow instances to share what they are working on and project knowledge.'
            )}
          </p>
        </div>
        <ToggleSwitch
          checked={sharedContext.enabled}
          onChange={(enabled) => setSharedContext({ enabled })}
        />
      </div>

      {/* Auto-publish */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-neutral-800/50 rounded border border-gray-200 dark:border-neutral-700">
        <div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-white">
            {t('settings.context.autoPublish', 'Auto-publish Context')}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t(
              'settings.context.autoPublishDesc',
              'Automatically detect and share context based on tool usage (Read, Write, Bash).'
            )}
          </p>
        </div>
        <ToggleSwitch
          checked={sharedContext.autoPublish}
          onChange={(autoPublish) => setSharedContext({ autoPublish })}
          disabled={!sharedContext.enabled}
        />
      </div>

      {/* Inject on Start */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-neutral-800/50 rounded border border-gray-200 dark:border-neutral-700">
        <div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-white">
            {t('settings.context.injectOnStart', 'Inject Context on Start')}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t(
              'settings.context.injectOnStartDesc',
              'Automatically inject context summary when a new instance starts.'
            )}
          </p>
        </div>
        <ToggleSwitch
          checked={sharedContext.injectOnStart}
          onChange={(injectOnStart) => setSharedContext({ injectOnStart })}
          disabled={!sharedContext.enabled}
        />
      </div>

      {/* Show Panel */}
      <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-neutral-800/50 rounded border border-gray-200 dark:border-neutral-700">
        <div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-white">
            {t('settings.context.showPanel', 'Show Context Panel')}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t(
              'settings.context.showPanelDesc',
              'Display the shared context panel in the UI sidebar.'
            )}
          </p>
        </div>
        <ToggleSwitch
          checked={sharedContext.showPanel}
          onChange={(showPanel) => setSharedContext({ showPanel })}
          disabled={!sharedContext.enabled}
        />
      </div>

      {/* Retention Days */}
      <div className="p-4 bg-white/50 dark:bg-neutral-800/50 rounded border border-gray-200 dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-800 dark:text-white">
              {t('settings.context.retentionDays', 'Knowledge Retention')}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t(
                'settings.context.retentionDaysDesc',
                'Number of days to retain project knowledge in the database.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="365"
              value={sharedContext.retentionDays}
              onChange={(e) =>
                setSharedContext({
                  retentionDays: Math.max(1, Math.min(365, parseInt(e.target.value) || 30)),
                })
              }
              disabled={!sharedContext.enabled}
              className="w-20 px-3 py-1.5 text-sm bg-white dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white disabled:opacity-50"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('settings.context.days', 'days')}
            </span>
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
        <div className="flex gap-3">
          <InfoIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {t('settings.context.infoTitle', 'How Shared Context Works')}
            </h4>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              {t(
                'settings.context.infoDesc',
                'When enabled, Claude instances can see what other instances are working on, share discovered patterns and conventions, and contribute to a shared knowledge base about the project. This helps multiple agents coordinate their work more effectively.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
