import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../stores/notificationStore';
import { testSound, initializeAudio, type SoundType } from '../../utils/notificationSound';
import type { NotificationType } from '@shared/types';

// Notification types with their settings
const NOTIFICATION_TYPES: { type: NotificationType; labelKey: string; defaultSound: boolean }[] = [
  {
    type: 'permission_request',
    labelKey: 'notifications.types.permissionRequest',
    defaultSound: true,
  },
  { type: 'task_completed', labelKey: 'notifications.types.taskCompleted', defaultSound: false },
  { type: 'task_error', labelKey: 'notifications.types.taskError', defaultSound: true },
  { type: 'tool_blocked', labelKey: 'notifications.types.toolBlocked', defaultSound: false },
  {
    type: 'instance_started',
    labelKey: 'notifications.types.instanceStarted',
    defaultSound: false,
  },
  {
    type: 'instance_stopped',
    labelKey: 'notifications.types.instanceStopped',
    defaultSound: false,
  },
  {
    type: 'collaboration_alert',
    labelKey: 'notifications.types.collaborationAlert',
    defaultSound: false,
  },
  { type: 'system', labelKey: 'notifications.types.system', defaultSound: false },
];

export function NotificationSettings() {
  const { t } = useTranslation();
  const { preferences, loadPreferences, setPreferences } = useNotificationStore();

  useEffect(() => {
    void loadPreferences();
    // Initialize audio on mount
    void initializeAudio();
  }, [loadPreferences]);

  const handleToggle = async (
    key: 'enabled' | 'playSound' | 'showNativeNotifications' | 'showInAppNotifications'
  ) => {
    if (!preferences) return;
    await setPreferences({ [key]: !preferences[key] });
  };

  const handleVolumeChange = async (volume: number) => {
    await setPreferences({ soundVolume: volume });
  };

  const handleTypeToggle = async (
    type: NotificationType,
    setting: 'enabled' | 'native' | 'sound'
  ) => {
    if (!preferences) return;
    const currentTypePrefs = preferences.typePreferences[type] || {
      enabled: true,
      native: false,
      sound: false,
    };
    await setPreferences({
      typePreferences: {
        ...preferences.typePreferences,
        [type]: {
          ...currentTypePrefs,
          [setting]: !currentTypePrefs[setting],
        },
      },
    });
  };

  const handleTestSound = (soundType: SoundType) => {
    const volume = preferences?.soundVolume ?? 50;
    testSound(soundType, volume);
  };

  if (!preferences) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-claude-orange"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Master toggles */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('notifications.settings.general')}
        </h3>

        {/* Main notification toggle */}
        <ToggleRow
          label={t('notifications.settings.enableNotifications')}
          description={t('notifications.settings.enableNotificationsDesc')}
          checked={preferences.enabled}
          onChange={() => handleToggle('enabled')}
        />

        {/* In-app notifications */}
        <ToggleRow
          label={t('notifications.settings.inApp')}
          description={t('notifications.settings.inAppDesc')}
          checked={preferences.showInAppNotifications}
          onChange={() => handleToggle('showInAppNotifications')}
          disabled={!preferences.enabled}
        />

        {/* Native notifications */}
        <ToggleRow
          label={t('notifications.settings.native')}
          description={t('notifications.settings.nativeDesc')}
          checked={preferences.showNativeNotifications}
          onChange={() => handleToggle('showNativeNotifications')}
          disabled={!preferences.enabled}
        />
      </div>

      {/* Sound settings */}
      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('notifications.settings.sound')}
        </h3>

        {/* Enable sound */}
        <ToggleRow
          label={t('notifications.settings.enableSound')}
          description={t('notifications.settings.enableSoundDesc')}
          checked={preferences.playSound}
          onChange={() => handleToggle('playSound')}
          disabled={!preferences.enabled}
        />

        {/* Volume slider */}
        {preferences.playSound && (
          <div className="pl-4">
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
              {t('notifications.settings.volume')}: {preferences.soundVolume}%
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="100"
                value={preferences.soundVolume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-claude-orange"
              />
              <button
                onClick={() => handleTestSound('default')}
                className="px-3 py-1 text-xs bg-claude-orange/20 hover:bg-claude-orange/30 text-claude-orange rounded transition-colors"
              >
                {t('notifications.settings.testSound')}
              </button>
            </div>
          </div>
        )}

        {/* Sound preview buttons */}
        {preferences.playSound && (
          <div className="pl-4 pt-2">
            <p className="text-xs text-gray-500 dark:text-gray-500 mb-2">
              {t('notifications.settings.previewSounds')}
            </p>
            <div className="flex flex-wrap gap-2">
              <SoundPreviewButton
                type="default"
                label={t('notifications.sounds.default')}
                onTest={handleTestSound}
              />
              <SoundPreviewButton
                type="error"
                label={t('notifications.sounds.error')}
                onTest={handleTestSound}
              />
              <SoundPreviewButton
                type="permission"
                label={t('notifications.sounds.permission')}
                onTest={handleTestSound}
              />
              <SoundPreviewButton
                type="complete"
                label={t('notifications.sounds.complete')}
                onTest={handleTestSound}
              />
            </div>
          </div>
        )}
      </div>

      {/* Per-type settings */}
      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('notifications.settings.perType')}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          {t('notifications.settings.perTypeDesc')}
        </p>

        <div className="space-y-2">
          {NOTIFICATION_TYPES.map(({ type, labelKey }) => {
            const typePrefs = preferences.typePreferences[type] || {
              enabled: true,
              native: false,
              sound: false,
            };
            return (
              <div
                key={type}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">{t(labelKey)}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={typePrefs.enabled}
                      onChange={() => handleTypeToggle(type, 'enabled')}
                      className="rounded text-claude-orange focus:ring-claude-orange"
                      disabled={!preferences.enabled}
                    />
                    {t('notifications.settings.show')}
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={typePrefs.native}
                      onChange={() => handleTypeToggle(type, 'native')}
                      className="rounded text-claude-orange focus:ring-claude-orange"
                      disabled={!preferences.enabled || !typePrefs.enabled}
                    />
                    {t('notifications.settings.native')}
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={typePrefs.sound}
                      onChange={() => handleTypeToggle(type, 'sound')}
                      className="rounded text-claude-orange focus:ring-claude-orange"
                      disabled={
                        !preferences.enabled || !preferences.playSound || !typePrefs.enabled
                      }
                    />
                    <SpeakerIcon className="w-3.5 h-3.5" />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className={`flex items-center justify-between ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-claude-orange focus:ring-offset-2
          ${checked ? 'bg-claude-orange' : 'bg-gray-200 dark:bg-gray-700'}
          ${disabled ? 'cursor-not-allowed' : ''}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
            transition duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );
}

interface SoundPreviewButtonProps {
  type: SoundType;
  label: string;
  onTest: (type: SoundType) => void;
}

function SoundPreviewButton({ type, label, onTest }: SoundPreviewButtonProps) {
  return (
    <button
      onClick={() => onTest(type)}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
    >
      <SpeakerIcon className="w-3 h-3" />
      {label}
    </button>
  );
}

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
      />
    </svg>
  );
}
