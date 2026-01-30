import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useProjectStore } from '../../stores/projectStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { NotificationBadge, NotificationPanel } from '../notifications';

// Helper to check if running in web mode (must be called at render time, not module load time)
const getIsWebMode = () => !!(window as unknown as { __WEB_VERSION__?: boolean }).__WEB_VERSION__;

export function TitleBar() {
  const isWebMode = getIsWebMode();
  const { t } = useTranslation();
  const {
    theme,
    toggleTheme,
    setShowSettingsModal,
    setSidebarMobileOpen,
    toggleSidebar,
    sidebarCollapsed,
    showNotificationPanel,
    setShowNotificationPanel,
  } = useUIStore();
  const { selectInstance, selectShell } = useInstanceStore();
  const { selectProject } = useProjectStore();
  const isMobile = useIsMobile();

  const handleGoHome = () => {
    selectInstance(null);
    selectShell(null);
    selectProject(null);
  };

  const handleMinimize = () => window.electronAPI.window.minimize();
  const handleMaximize = () => window.electronAPI.window.maximize();
  const handleClose = () => window.electronAPI.window.close();

  const handleLogout = () => {
    // Dispatch custom event that WebApp listens to
    window.dispatchEvent(new CustomEvent('web:logout'));
  };

  return (
    <div className="h-10 bg-gray-50 dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-700 flex items-center justify-between px-2 sm:px-3 drag-region">
      {/* Logo and title */}
      <div className="flex items-center gap-2 sm:gap-2 no-drag">
        {/* Hamburger menu for mobile */}
        {isMobile && (
          <button
            onClick={() => setSidebarMobileOpen(true)}
            className="p-1 rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center"
            title={t('sidebar.openMenu')}
          >
            <MenuIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          </button>
        )}
        {/* Sidebar toggle for desktop/tablet */}
        {!isMobile && (
          <button
            onClick={toggleSidebar}
            className="p-1 rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center"
            title={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            <SidebarIcon
              className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
              collapsed={sidebarCollapsed}
            />
          </button>
        )}
        <img src="/favicon.png" alt="Logo" className="w-6 h-6 rounded-sm" />
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200 hidden sm:inline">
          {t('titleBar.title')}
        </span>
        {/* Home button - always visible */}
        <button
          onClick={handleGoHome}
          className="ml-2 p-1 rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center"
          title={t('titleBar.home')}
        >
          <HomeIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
        </button>
      </div>

      {/* Center controls */}
      <div className="flex items-center gap-1 sm:gap-2 no-drag">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1 rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center"
          title={theme === 'dark' ? t('titleBar.switchToLight') : t('titleBar.switchToDark')}
        >
          {theme === 'dark' ? (
            <SunIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
          ) : (
            <MoonIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
          )}
        </button>

        {/* Notifications */}
        <div className="relative">
          <NotificationBadge onClick={() => setShowNotificationPanel(!showNotificationPanel)} />
          <NotificationPanel
            isOpen={showNotificationPanel}
            onClose={() => setShowNotificationPanel(false)}
          />
        </div>

        {/* Settings button */}
        <button
          onClick={() => setShowSettingsModal(true)}
          className="p-1 rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center"
          title={t('titleBar.settings')}
        >
          <SettingsIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
        </button>
      </div>

      {/* Window controls (Electron) or Logout (Web) */}
      <div className="flex items-center gap-1 no-drag">
        {isWebMode ? (
          <button
            onClick={handleLogout}
            className="px-2 py-1 text-xs font-medium bg-gray-200 dark:bg-neutral-800 hover:bg-gray-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded-sm transition-colors flex items-center gap-1.5"
            title={t('titleBar.logout')}
          >
            <LogoutIcon className="w-4 h-4" />
            <span className="hidden sm:inline">{t('titleBar.logout')}</span>
          </button>
        ) : (
          <>
            <button
              onClick={handleMinimize}
              className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <MinimizeIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            </button>
            <button
              onClick={handleMaximize}
              className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-800 transition-colors"
            >
              <MaximizeIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            </button>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-red-600 transition-colors"
            >
              <CloseIcon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Icons
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

function MinimizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}

function MaximizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
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

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}

function SidebarIcon({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {collapsed ? (
        // Expand icon (sidebar with arrow pointing right)
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4v16" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 12l3 3m0-6l-3 3"
          />
        </>
      ) : (
        // Collapse icon (sidebar with arrow pointing left)
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4v16" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 12l-3-3m0 6l3-3"
          />
        </>
      )}
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  );
}
