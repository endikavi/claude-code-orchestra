import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../../stores/uiStore';
import {
  SunIcon,
  MoonIcon,
  MinimizeIcon,
  MaximizeIcon,
  CloseIcon,
  LogoutIcon,
  SettingsIcon,
  MenuIcon,
} from '@renderer/components/icons';
import { IconButton } from '../common/IconButton';
import { useInstanceStore } from '../../stores/instanceStore';
import { useProjectStore } from '../../stores/projectStore';
import { useTaskStore } from '../../stores/taskStore';
import { useTeamStore } from '../../stores/teamStore';
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
    rightPanelMode,
    toggleRightPanel,
  } = useUIStore(
    useShallow((s) => ({
      theme: s.theme,
      toggleTheme: s.toggleTheme,
      setShowSettingsModal: s.setShowSettingsModal,
      setSidebarMobileOpen: s.setSidebarMobileOpen,
      toggleSidebar: s.toggleSidebar,
      sidebarCollapsed: s.sidebarCollapsed,
      showNotificationPanel: s.showNotificationPanel,
      setShowNotificationPanel: s.setShowNotificationPanel,
      rightPanelMode: s.rightPanelMode,
      toggleRightPanel: s.toggleRightPanel,
    }))
  );
  const { selectInstance, selectShell } = useInstanceStore(
    useShallow((s) => ({
      selectInstance: s.selectInstance,
      selectShell: s.selectShell,
    }))
  );
  const { selectProject } = useProjectStore(
    useShallow((s) => ({
      selectProject: s.selectProject,
    }))
  );
  const { getTotalTasks, getTotalInProgress: getTotalTasksInProgress } = useTaskStore(
    useShallow((s) => ({
      getTotalTasks: s.getTotalTasks,
      getTotalInProgress: s.getTotalInProgress,
    }))
  );
  const { getTeamCount } = useTeamStore(
    useShallow((s) => ({
      getTeamCount: s.getTeamCount,
    }))
  );
  const isMobile = useIsMobile();

  const totalTasks = getTotalTasks();
  const tasksInProgress = getTotalTasksInProgress();
  const teamCount = getTeamCount();

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
    <div className="h-10 bg-[var(--color-bg-subtle)] border-b border-[var(--color-border-default)] shadow-xs flex items-center justify-between px-2 sm:px-3 drag-region">
      {/* Logo and title */}
      <div className="flex items-center gap-2 sm:gap-2 no-drag">
        {/* Hamburger menu for mobile */}
        {isMobile && (
          <IconButton onClick={() => setSidebarMobileOpen(true)} title={t('sidebar.openMenu')}>
            <MenuIcon className="w-5 h-5" />
          </IconButton>
        )}
        {/* Sidebar toggle for desktop/tablet */}
        {!isMobile && (
          <IconButton
            onClick={toggleSidebar}
            title={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            <SidebarIcon className="w-5 h-5" collapsed={sidebarCollapsed} />
          </IconButton>
        )}
        <img src="/favicon.png" alt="Logo" className="w-6 h-6 rounded-sm" />
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200 hidden sm:inline">
          {t('titleBar.title')}
        </span>
        {/* Home button - always visible */}
        <IconButton onClick={handleGoHome} title={t('titleBar.home')} className="ml-2">
          <HomeIcon className="w-4 h-4" />
        </IconButton>
      </div>

      {/* Center controls */}
      <div className="flex items-center gap-1 sm:gap-2 no-drag">
        {/* Theme toggle */}
        <IconButton
          onClick={toggleTheme}
          title={theme === 'dark' ? t('titleBar.switchToLight') : t('titleBar.switchToDark')}
        >
          {theme === 'dark' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
        </IconButton>

        {/* Notifications */}
        <div className="relative">
          <NotificationBadge onClick={() => setShowNotificationPanel(!showNotificationPanel)} />
          <NotificationPanel
            isOpen={showNotificationPanel}
            onClose={() => setShowNotificationPanel(false)}
          />
        </div>

        {/* Settings button */}
        <IconButton onClick={() => setShowSettingsModal(true)} title={t('titleBar.settings')}>
          <SettingsIcon className="w-4 h-4" />
        </IconButton>

        {/* Separator */}
        <div className="w-px h-4 bg-gray-300 dark:bg-neutral-600" />

        {/* Files toggle */}
        <IconButton
          onClick={() => toggleRightPanel('files')}
          title={t('files.title')}
          active={rightPanelMode === 'files'}
        >
          <FilesIcon className="w-4 h-4" />
        </IconButton>

        {/* Teams toggle */}
        <IconButton
          onClick={() => toggleRightPanel('teams')}
          title={t('teams.title')}
          active={rightPanelMode === 'teams'}
          className="gap-1"
        >
          <TeamsIcon className="w-4 h-4" />
          {teamCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-semibold bg-primary text-white rounded-full">
              {teamCount}
            </span>
          )}
        </IconButton>

        {/* Tasks toggle */}
        <IconButton
          onClick={() => toggleRightPanel('tasks')}
          title={t('tasks.title')}
          active={rightPanelMode === 'tasks'}
          className="gap-1"
        >
          <TasksIcon className="w-4 h-4" />
          {totalTasks > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[9px] font-semibold bg-primary text-white rounded-full">
              {tasksInProgress > 0 ? tasksInProgress : totalTasks}
            </span>
          )}
        </IconButton>
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

function TeamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}

function FilesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

function TasksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  );
}
