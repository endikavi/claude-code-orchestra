import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useInstanceStore } from '../../stores/instanceStore';
import { useUIStore } from '../../stores/uiStore';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { ProjectList } from '../projects/ProjectList';
import { CollapsedProjectList } from '../projects/CollapsedProjectList';

export function Sidebar() {
  const { t } = useTranslation();
  const { setShowProjectModal, sidebarCollapsed, sidebarMobileOpen, setSidebarMobileOpen } =
    useUIStore();
  const { projects } = useProjectStore();
  const { instances } = useInstanceStore();
  const isMobile = useIsMobile();

  const runningCount = instances.filter(
    (i) => i.status === 'running' || i.status === 'starting' || i.status === 'tool_executing'
  ).length;

  // Close sidebar on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarMobileOpen) {
        setSidebarMobileOpen(false);
      }
    },
    [sidebarMobileOpen, setSidebarMobileOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close mobile sidebar when navigating away
  const closeMobileSidebar = useCallback(() => {
    if (isMobile && sidebarMobileOpen) {
      setSidebarMobileOpen(false);
    }
  }, [isMobile, sidebarMobileOpen, setSidebarMobileOpen]);

  // Determine if sidebar is collapsed (only on desktop/tablet)
  const isCollapsed = !isMobile && sidebarCollapsed;

  // Collapsed sidebar (icons only)
  if (isCollapsed) {
    return (
      <aside className="w-16 bg-claude-beige dark:bg-gray-800 border-r border-claude-tan/30 dark:border-gray-700 flex flex-col transition-all duration-300">
        {/* Collapsed Header */}
        <div className="p-2 border-b border-claude-tan/30 dark:border-gray-700 flex flex-col items-center gap-2">
          <button
            onClick={() => setShowProjectModal(true)}
            className="p-2 rounded-md bg-claude-orange hover:bg-claude-tan transition-colors flex items-center justify-center"
            title={t('sidebar.addProject')}
          >
            <PlusIcon className="w-4 h-4 text-white" />
          </button>
          {runningCount > 0 && (
            <div
              className="flex items-center gap-1"
              title={t('sidebar.running', { count: runningCount })}
            >
              <div className="w-2 h-2 rounded-full bg-green-500 status-pulse" />
              <span className="text-xs text-gray-600 dark:text-gray-400">{runningCount}</span>
            </div>
          )}
        </div>

        {/* Collapsed Project list */}
        <div className="flex-1 overflow-y-auto">
          <CollapsedProjectList />
        </div>
      </aside>
    );
  }

  // Mobile overlay sidebar
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {sidebarMobileOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 animate-fadeIn"
            onClick={() => setSidebarMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 bg-claude-beige dark:bg-gray-800 border-r border-claude-tan/30 dark:border-gray-700 flex flex-col transition-transform duration-300 ease-in-out ${
            sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarContent
            t={t}
            projects={projects}
            runningCount={runningCount}
            setShowProjectModal={setShowProjectModal}
            onProjectSelect={closeMobileSidebar}
          />
        </aside>
      </>
    );
  }

  // Desktop/Tablet expanded sidebar
  return (
    <aside className="w-72 bg-claude-beige dark:bg-gray-800 border-r border-claude-tan/30 dark:border-gray-700 flex flex-col transition-all duration-300">
      <SidebarContent
        t={t}
        projects={projects}
        runningCount={runningCount}
        setShowProjectModal={setShowProjectModal}
      />
    </aside>
  );
}

interface SidebarContentProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  projects: { id: string; name: string }[];
  runningCount: number;
  setShowProjectModal: (show: boolean) => void;
  onProjectSelect?: () => void;
}

function SidebarContent({
  t,
  projects,
  runningCount,
  setShowProjectModal,
  onProjectSelect,
}: SidebarContentProps) {
  return (
    <>
      {/* Header */}
      <div className="p-4 border-b border-claude-tan/30 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('sidebar.projects')}
          </h2>
          <button
            onClick={() => setShowProjectModal(true)}
            className="p-1.5 rounded-md bg-claude-orange hover:bg-claude-tan transition-colors flex items-center justify-center"
            title={t('sidebar.addProject')}
          >
            <PlusIcon className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <FolderIcon className="w-3.5 h-3.5 text-gray-500 dark:text-gray-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {t('sidebar.projectsCount', { count: projects.length })}
            </span>
          </div>
          {runningCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 status-pulse" />
              <span className="text-gray-600 dark:text-gray-400">
                {t('sidebar.running', { count: runningCount })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        <ProjectList onProjectSelect={onProjectSelect} />
      </div>
    </>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
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
