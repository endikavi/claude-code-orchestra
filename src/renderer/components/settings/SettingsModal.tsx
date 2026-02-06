import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
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
  } = useUIStore();
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
      />
    </svg>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

function WindowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
      />
    </svg>
  );
}

function SpeedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  );
}

function NetworkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
      />
    </svg>
  );
}

function BeakerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function JiraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );
}
