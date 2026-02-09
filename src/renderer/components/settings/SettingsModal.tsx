import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/uiStore';
import {
  CheckIcon,
  MoonIcon,
  SunIcon,
  SettingsIcon,
  GlobeIcon,
  ShieldIcon,
  ServerIcon,
  BellIcon,
  WindowIcon,
  SpeedIcon,
  NetworkIcon,
  BeakerIcon,
  RefreshIcon,
  JiraIcon,
} from '@renderer/components/icons';
import { Modal } from '../common/Modal';
import { Tabs, type Tab } from '../common/Tabs';
import { RemoteAccessSettings } from './RemoteAccessSettings';
import { ClusterSettings } from './ClusterSettings';
import { SecuritySettings } from './SecuritySettings';
import { NotificationSettings } from './NotificationSettings';
import { ProxySettings } from './ProxySettings';
import { TerminalPoolSettings } from './TerminalPoolSettings';
import { SharedContextSettings } from './SharedContextSettings';
import { RepaintSettings } from './RepaintSettings';
import { UpdateChecker } from './UpdateChecker';
import { JiraSettings } from './JiraSettings';
import type { Language } from '@shared/types';
import type { TerminalFont } from '@shared/types/uiSettings';

interface SettingsModalProps {
  onClose: () => void;
}

const LANGUAGES: { value: Language; label: string; flag: string }[] = [
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
];

const TERMINAL_FONTS: { value: TerminalFont; label: string; fontFamily: string }[] = [
  {
    value: 'embedded',
    label: 'JetBrains Mono (Built-in)',
    fontFamily: '"JetBrains Mono Embedded", monospace',
  },
  {
    value: 'system',
    label: 'System (Cascadia/JetBrains/Fira)',
    fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace',
  },
  {
    value: 'cascadia',
    label: 'Cascadia Code',
    fontFamily: '"Cascadia Code", "Cascadia Mono", monospace',
  },
  { value: 'jetbrains', label: 'JetBrains Mono', fontFamily: '"JetBrains Mono", monospace' },
  { value: 'fira', label: 'Fira Code', fontFamily: '"Fira Code", monospace' },
  {
    value: 'consolas',
    label: 'Consolas',
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
  },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { t } = useTranslation();
  const {
    language,
    setLanguage,
    theme,
    setTheme,
    terminalFont,
    setTerminalFont,
    tmuxMode,
    setTmuxMode,
  } = useUIStore(
    useShallow((s) => ({
      language: s.language,
      setLanguage: s.setLanguage,
      theme: s.theme,
      setTheme: s.setTheme,
      terminalFont: s.terminalFont,
      setTerminalFont: s.setTerminalFont,
      tmuxMode: s.tmuxMode,
      setTmuxMode: s.setTmuxMode,
    }))
  );
  const isWebVersion = (window as unknown as { __WEB_VERSION__?: boolean }).__WEB_VERSION__;

  // Define tabs - Security, Cluster, and Proxy only visible in desktop version
  const tabs: Tab[] = [
    {
      id: 'general',
      label: t('settings.tabs.general'),
      icon: <SettingsIcon className="w-4 h-4" />,
    },
    {
      id: 'notifications',
      label: t('settings.tabs.notifications'),
      icon: <BellIcon className="w-4 h-4" />,
    },
    {
      id: 'context',
      label: t('settings.tabs.context', 'Context'),
      icon: <NetworkIcon className="w-4 h-4" />,
    },
    ...(!isWebVersion
      ? [
          {
            id: 'remote',
            label: t('settings.tabs.remoteAccess'),
            icon: <GlobeIcon className="w-4 h-4" />,
          },
          {
            id: 'proxy',
            label: t('settings.tabs.proxy', 'Proxy'),
            icon: <WindowIcon className="w-4 h-4" />,
          },
          {
            id: 'pool',
            label: t('settings.tabs.pool', 'Pool'),
            icon: <SpeedIcon className="w-4 h-4" />,
          },
          {
            id: 'jira',
            label: t('settings.tabs.jira', 'Jira'),
            icon: <JiraIcon className="w-4 h-4" />,
          },
          {
            id: 'security',
            label: t('settings.tabs.security'),
            icon: <ShieldIcon className="w-4 h-4" />,
          },
          {
            id: 'cluster',
            label: t('settings.tabs.cluster'),
            icon: <ServerIcon className="w-4 h-4" />,
          },
          {
            id: 'experimental',
            label: t('settings.tabs.experimental', 'Experimental'),
            icon: <BeakerIcon className="w-4 h-4" />,
          },
          {
            id: 'updates',
            label: t('settings.tabs.updates', 'Updates'),
            icon: <RefreshIcon className="w-4 h-4" />,
          },
        ]
      : []),
  ];

  const [activeTab, setActiveTab] = useState('general');

  return (
    <Modal title={t('settings.title')} onClose={onClose} width="3xl">
      {/* Layout with vertical tabs on left and content on right */}
      <div className="flex gap-4">
        {/* Vertical Tabs */}
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} vertical />

        {/* Tab Content */}
        <div className="flex-1 min-h-[400px] max-h-[500px] overflow-y-auto">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Two column layout for general settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Language Section */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    {t('settings.language')}
                  </h3>
                  <div className="space-y-2">
                    {LANGUAGES.map((lang) => (
                      <label
                        key={lang.value}
                        className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                          language === lang.value
                            ? 'bg-sky-500/20 border border-sky-500'
                            : 'bg-white/50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-600 hover:bg-white/70 dark:hover:bg-neutral-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="language"
                          value={lang.value}
                          checked={language === lang.value}
                          onChange={(e) => setLanguage(e.target.value as Language)}
                          className="sr-only"
                        />
                        <span className="text-xl">{lang.flag}</span>
                        <span className="text-sm text-gray-800 dark:text-white">{lang.label}</span>
                        {language === lang.value && (
                          <CheckIcon className="w-4 h-4 text-sky-500 ml-auto" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Theme Section */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    {t('settings.theme')}
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTheme('dark')}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded transition-colors ${
                        theme === 'dark'
                          ? 'bg-sky-500/20 border border-sky-500'
                          : 'bg-white/50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-600 hover:bg-white/70 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <MoonIcon className="w-4 h-4" />
                      <span className="text-sm">{t('settings.dark')}</span>
                    </button>
                    <button
                      onClick={() => setTheme('light')}
                      className={`flex-1 flex items-center justify-center gap-2 p-3 rounded transition-colors ${
                        theme === 'light'
                          ? 'bg-sky-500/20 border border-sky-500'
                          : 'bg-white/50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-600 hover:bg-white/70 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <SunIcon className="w-4 h-4" />
                      <span className="text-sm">{t('settings.light')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Terminal Font Section */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('settings.terminalFont', 'Terminal Font')}
                </h3>
                <div className="space-y-2">
                  {TERMINAL_FONTS.map((font) => (
                    <label
                      key={font.value}
                      className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
                        terminalFont === font.value
                          ? 'bg-sky-500/20 border border-sky-500'
                          : 'bg-white/50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-600 hover:bg-white/70 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <input
                        type="radio"
                        name="terminalFont"
                        value={font.value}
                        checked={terminalFont === font.value}
                        onChange={(e) => setTerminalFont(e.target.value as TerminalFont)}
                        className="sr-only"
                      />
                      <span
                        className="text-sm text-gray-800 dark:text-white flex-1"
                        style={{ fontFamily: font.fontFamily }}
                      >
                        {font.label}
                      </span>
                      {terminalFont === font.value && (
                        <CheckIcon className="w-4 h-4 text-sky-500" />
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                  {t(
                    'settings.terminalFontHint',
                    'Built-in font is always available. Other fonts require system installation.'
                  )}
                </p>
              </div>

              {/* Tmux Mode Toggle */}
              <div className="flex items-center justify-between p-4 bg-white/50 dark:bg-neutral-800/50 rounded border border-gray-200 dark:border-neutral-600">
                <div>
                  <h4 className="text-sm font-medium text-gray-800 dark:text-white">
                    {t('settings.tmuxMode', 'tmux mode')}
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t(
                      'settings.tmuxModeDescription',
                      'Use tmux-safe terminal options and debounce resize'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={tmuxMode}
                  onClick={() => setTmuxMode(!tmuxMode)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${
                    tmuxMode ? 'bg-sky-500' : 'bg-gray-200 dark:bg-neutral-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      tmuxMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Info */}
              <div className="pt-4 border-t border-gray-200 dark:border-neutral-700">
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  {t('settings.savedAutomatically')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && <NotificationSettings />}

          {activeTab === 'context' && <SharedContextSettings />}

          {activeTab === 'remote' && <RemoteAccessSettings />}

          {activeTab === 'proxy' && <ProxySettings />}

          {activeTab === 'pool' && <TerminalPoolSettings />}

          {activeTab === 'jira' && <JiraSettings />}

          {activeTab === 'security' && <SecuritySettings />}

          {activeTab === 'cluster' && <ClusterSettings />}

          {activeTab === 'experimental' && <RepaintSettings />}

          {activeTab === 'updates' && <UpdateChecker />}
        </div>
      </div>

      {/* Close Button */}
      <div className="flex justify-end mt-4 pt-4 border-t border-gray-200 dark:border-neutral-700">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors"
        >
          {t('common.done')}
        </button>
      </div>
    </Modal>
  );
}
