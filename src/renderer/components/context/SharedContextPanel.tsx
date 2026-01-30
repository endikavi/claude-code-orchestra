import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useContextStore } from '../../stores/contextStore';
import { useProjectStore } from '../../stores/projectStore';
import type { SharedInstanceContext, InstanceWorkStatus } from '@shared/types/sharedContext';

interface SharedContextPanelProps {
  className?: string;
  onClose?: () => void;
}

export function SharedContextPanel({ className = '', onClose }: SharedContextPanelProps) {
  const { t } = useTranslation();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    instances: true,
    knowledge: true,
    conventions: false,
    warnings: false,
  });

  const getSelectedProject = useProjectStore((state) => state.getSelectedProject);
  const selectedProject = getSelectedProject();
  const { contextsByProject, knowledgeByProject, isLoading, refreshContext } = useContextStore();

  // Get data for selected project
  const projectId = selectedProject?.id;
  const contexts = projectId ? contextsByProject[projectId] || [] : [];
  const knowledge = projectId ? knowledgeByProject[projectId] : null;

  // Refresh context when project changes
  useEffect(() => {
    if (projectId) {
      refreshContext(projectId);
    }
  }, [projectId, refreshContext]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const getStatusIcon = (status: InstanceWorkStatus) => {
    switch (status) {
      case 'implementing':
        return <CodeIcon className="h-4 w-4 text-green-500" />;
      case 'exploring':
        return <SearchIcon className="h-4 w-4 text-blue-500" />;
      case 'testing':
        return <TestIcon className="h-4 w-4 text-purple-500" />;
      case 'reviewing':
        return <ReviewIcon className="h-4 w-4 text-orange-500" />;
      case 'planning':
        return <PlanIcon className="h-4 w-4 text-yellow-500" />;
      case 'waiting':
        return <WaitIcon className="h-4 w-4 text-gray-400" />;
      case 'idle':
      default:
        return <IdleIcon className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: InstanceWorkStatus) => {
    switch (status) {
      case 'implementing':
        return t('context.status.implementing', 'Implementing');
      case 'exploring':
        return t('context.status.exploring', 'Exploring');
      case 'testing':
        return t('context.status.testing', 'Testing');
      case 'reviewing':
        return t('context.status.reviewing', 'Reviewing');
      case 'planning':
        return t('context.status.planning', 'Planning');
      case 'waiting':
        return t('context.status.waiting', 'Waiting');
      case 'idle':
      default:
        return t('context.status.idle', 'Idle');
    }
  };

  const formatTimeAgo = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return t('context.time.justNow', 'just now');
    if (seconds < 3600)
      return t('context.time.minsAgo', '{{m}}m ago', { m: Math.floor(seconds / 60) });
    if (seconds < 86400)
      return t('context.time.hoursAgo', '{{h}}h ago', { h: Math.floor(seconds / 3600) });
    return t('context.time.daysAgo', '{{d}}d ago', { d: Math.floor(seconds / 86400) });
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-neutral-950 z-10 px-4 py-3 border-b border-gray-200 dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <NetworkIcon className="h-5 w-5 text-sky-500" />
            {t('context.title', 'Shared Context')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => projectId && refreshContext(projectId)}
              disabled={isLoading || !projectId}
              className="p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
              title={t('context.refresh', 'Refresh')}
            >
              <RefreshIcon className={`h-4 w-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-sm hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                aria-label={t('common.close', 'Close')}
              >
                <XIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Project indicator */}
        {selectedProject && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <FolderIcon className="h-3.5 w-3.5" />
            <span className="truncate">{selectedProject.name}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!selectedProject ? (
          <EmptyState
            icon={<FolderIcon className="h-12 w-12" />}
            title={t('context.noProject', 'No project selected')}
            description={t('context.noProjectDesc', 'Select a project to view shared context')}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
          </div>
        ) : (
          <>
            {/* Active Instances Section */}
            <CollapsibleSection
              title={t('context.sections.instances', 'Active Instances')}
              count={contexts.length}
              icon={<UsersIcon className="h-4 w-4" />}
              isExpanded={expandedSections.instances}
              onToggle={() => toggleSection('instances')}
              colorClass="text-blue-600 dark:text-blue-400"
            >
              {contexts.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                  {t('context.noInstances', 'No active instances sharing context')}
                </p>
              ) : (
                <div className="space-y-2">
                  {contexts.map((ctx) => (
                    <InstanceContextCard
                      key={ctx.instanceId}
                      context={ctx}
                      getStatusIcon={getStatusIcon}
                      getStatusLabel={getStatusLabel}
                      formatTimeAgo={formatTimeAgo}
                    />
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* Project Knowledge Section */}
            {knowledge && (
              <>
                {/* Architecture */}
                {knowledge.architectureSummary && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-neutral-800 rounded">
                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase mb-2">
                      {t('context.architecture', 'Architecture')}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {knowledge.architectureSummary}
                    </p>
                  </div>
                )}

                {/* Tech Stack */}
                {knowledge.techStack && knowledge.techStack.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase mb-2">
                      {t('context.techStack', 'Tech Stack')}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {knowledge.techStack.map((tech, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conventions */}
                {knowledge.conventions && knowledge.conventions.length > 0 && (
                  <CollapsibleSection
                    title={t('context.sections.conventions', 'Conventions')}
                    count={knowledge.conventions.length}
                    icon={<BookIcon className="h-4 w-4" />}
                    isExpanded={expandedSections.conventions}
                    onToggle={() => toggleSection('conventions')}
                    colorClass="text-green-600 dark:text-green-400"
                    className="mt-4"
                  >
                    <div className="space-y-2">
                      {knowledge.conventions.map((conv, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-gray-50 dark:bg-neutral-800 rounded text-sm"
                        >
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            {conv.type}
                          </span>
                          <p className="text-gray-700 dark:text-gray-300 mt-0.5">
                            {conv.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Warnings */}
                {knowledge.warnings && knowledge.warnings.length > 0 && (
                  <CollapsibleSection
                    title={t('context.sections.warnings', 'Warnings')}
                    count={knowledge.warnings.length}
                    icon={<WarningIcon className="h-4 w-4" />}
                    isExpanded={expandedSections.warnings}
                    onToggle={() => toggleSection('warnings')}
                    colorClass="text-yellow-600 dark:text-yellow-400"
                    className="mt-4"
                  >
                    <div className="space-y-2">
                      {knowledge.warnings.map((warn, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded text-sm ${
                            warn.severity === 'critical'
                              ? 'bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500'
                              : warn.severity === 'warning'
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-l-2 border-yellow-500'
                                : 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500'
                          }`}
                        >
                          <p className="text-gray-700 dark:text-gray-300">{warn.description}</p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}

                {/* Important Files */}
                {knowledge.importantFiles && knowledge.importantFiles.length > 0 && (
                  <CollapsibleSection
                    title={t('context.sections.importantFiles', 'Important Files')}
                    count={knowledge.importantFiles.length}
                    icon={<FileIcon className="h-4 w-4" />}
                    isExpanded={false}
                    onToggle={() => toggleSection('files')}
                    colorClass="text-purple-600 dark:text-purple-400"
                    className="mt-4"
                  >
                    <div className="space-y-1">
                      {knowledge.importantFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-gray-50 dark:bg-neutral-800 rounded text-sm"
                        >
                          <code className="text-xs text-purple-600 dark:text-purple-400">
                            {file.path}
                          </code>
                          <p className="text-gray-600 dark:text-gray-400 text-xs mt-0.5">
                            {file.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
              </>
            )}

            {/* No knowledge yet */}
            {!knowledge && contexts.length === 0 && (
              <EmptyState
                icon={<NetworkIcon className="h-12 w-12" />}
                title={t('context.empty', 'No shared context yet')}
                description={t(
                  'context.emptyDesc',
                  'Context will appear when instances share information about their work'
                )}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Helper Components

interface CollapsibleSectionProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  colorClass: string;
  className?: string;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  count,
  icon,
  isExpanded,
  onToggle,
  colorClass,
  className = '',
  children,
}: CollapsibleSectionProps) {
  return (
    <div className={className}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={colorClass}>{icon}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${colorClass} bg-current bg-opacity-10`}
          >
            {count}
          </span>
        </div>
        <ChevronIcon
          className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>
      {isExpanded && <div className="mt-2 px-1">{children}</div>}
    </div>
  );
}

interface InstanceContextCardProps {
  context: SharedInstanceContext;
  getStatusIcon: (status: InstanceWorkStatus) => React.ReactNode;
  getStatusLabel: (status: InstanceWorkStatus) => string;
  formatTimeAgo: (timestamp: number) => string;
}

function InstanceContextCard({
  context,
  getStatusIcon,
  getStatusLabel,
  formatTimeAgo,
}: InstanceContextCardProps) {
  return (
    <div className="p-3 bg-white dark:bg-neutral-800 rounded border border-gray-200 dark:border-neutral-700 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon(context.workStatus)}
          <span className="text-xs font-mono text-gray-600 dark:text-gray-400">
            {context.instanceId.slice(0, 8)}
          </span>
          {context.isSubagent && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
              subagent
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">{formatTimeAgo(context.updatedAt)}</span>
      </div>

      {/* Status */}
      <div className="mt-2">
        <span
          className={`text-sm font-medium ${
            context.workStatus === 'implementing'
              ? 'text-green-600 dark:text-green-400'
              : context.workStatus === 'exploring'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          {getStatusLabel(context.workStatus)}
        </span>
        {context.currentTask && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{context.currentTask}</p>
        )}
      </div>

      {/* Current Files */}
      {context.currentFiles && context.currentFiles.length > 0 && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1">
            {context.currentFiles.slice(0, 3).map((file, idx) => (
              <code
                key={idx}
                className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-400 rounded truncate max-w-[150px]"
              >
                {file.split('/').pop()}
              </code>
            ))}
            {context.currentFiles.length > 3 && (
              <span className="text-xs text-gray-500">+{context.currentFiles.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* Notes for others */}
      {context.notesForOthers && context.notesForOthers.length > 0 && (
        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-800 dark:text-yellow-200">
          {context.notesForOthers[0]}
        </div>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="text-gray-300 dark:text-gray-600 mb-3">{icon}</div>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{description}</p>
    </div>
  );
}

// Icons
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

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function TestIcon({ className }: { className?: string }) {
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

function ReviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function PlanIcon({ className }: { className?: string }) {
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

function WaitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function IdleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
