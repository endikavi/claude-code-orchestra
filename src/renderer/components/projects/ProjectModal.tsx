import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useConversationStore } from '../../stores/conversationStore';
import { useClusterStore } from '../../stores/clusterStore';
import { Modal } from '../common/Modal';
import { ImportSessionsModal } from '../conversations/ImportSessionsModal';
import { AgentFormModal } from './AgentFormModal';
import type {
  AvailableShell,
  HookTemplate,
  HookTemplateType,
  CustomAgent,
  CustomAgentsConfig,
  AgentDeliveryMethod,
} from '@shared/types';
import type { ProjectClusterPermissions } from '@shared/types/clusterPermissions';

const PROJECT_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#ec4899',
];

interface ProjectModalProps {
  onClose: () => void;
}

export function ProjectModal({ onClose }: ProjectModalProps) {
  const { t } = useTranslation();
  const { projects, createProject, updateProject } = useProjectStore();
  const { editingProject } = useUIStore();
  const { isClusterEnabled, config: clusterConfig } = useClusterStore();

  const existingProject = editingProject ? projects.find((p) => p.id === editingProject) : null;
  const isEditing = !!existingProject;

  const [name, setName] = useState(existingProject?.name || '');
  const [path, setPath] = useState(existingProject?.path || '');
  const [description, setDescription] = useState(existingProject?.description || '');
  const [color, setColor] = useState(existingProject?.color || PROJECT_COLORS[0]);
  const [skipPermissions, setSkipPermissions] = useState(existingProject?.skipPermissions || false);
  const [enableMcp, setEnableMcp] = useState(existingProject?.enableMcp || false);
  const [autoReview, setAutoReview] = useState(existingProject?.autoReview ?? true); // Default enabled
  const [preferredShell, setPreferredShell] = useState(existingProject?.preferredShell || '');
  const [availableShells, setAvailableShells] = useState<AvailableShell[]>([]);
  const [isLoadingShells, setIsLoadingShells] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Cluster permissions state
  const [clusterShareWithCluster, setClusterShareWithCluster] = useState<boolean | null>(
    existingProject?.clusterPermissions?.shareWithCluster ?? null
  );
  const [clusterAllowRemoteCreation, setClusterAllowRemoteCreation] = useState<boolean | null>(
    existingProject?.clusterPermissions?.allowRemoteInstanceCreation ?? null
  );

  // Hooks integration state
  const [enableHooksIntegration, setEnableHooksIntegration] = useState(!isEditing);
  const [hookTemplates, setHookTemplates] = useState<HookTemplate[]>([]);
  const [selectedHookTemplate, setSelectedHookTemplate] = useState<HookTemplateType>('monitored');
  const [showHookOptions, setShowHookOptions] = useState(false);
  const [hasExistingHooks, setHasExistingHooks] = useState(false);

  // Additional directories state
  const [additionalDirs, setAdditionalDirs] = useState<string[]>(
    existingProject?.additionalDirs || []
  );

  // Custom agents state
  const [agentDeliveryMethod, setAgentDeliveryMethod] = useState<AgentDeliveryMethod>(
    existingProject?.agentDeliveryMethod || 'skill'
  );
  const [agents, setAgents] = useState<CustomAgentsConfig>(existingProject?.agents || {});
  const [showAgentForm, setShowAgentForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<{ name: string; agent: CustomAgent } | null>(
    null
  );
  const [showAgentsSection, setShowAgentsSection] = useState(
    Object.keys(existingProject?.agents || {}).length > 0
  );
  const [showDirsSection, setShowDirsSection] = useState(
    (existingProject?.additionalDirs?.length || 0) > 0
  );

  const { loadConversations } = useConversationStore();

  // Load available shells on mount
  useEffect(() => {
    const loadShells = async () => {
      try {
        const shells = await window.electronAPI.shell.getAvailable();
        setAvailableShells(shells);
        // Set default shell if not already set
        if (!preferredShell) {
          const defaultShell = shells.find((s) => s.isDefault);
          if (defaultShell) {
            setPreferredShell(defaultShell.path);
          }
        }
      } catch (err) {
        console.error('Failed to load available shells:', err);
      } finally {
        setIsLoadingShells(false);
      }
    };
    void loadShells();
    // Only run once on mount - preferredShell is read but we don't want to re-run when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load hook templates
  useEffect(() => {
    const loadHookTemplates = async () => {
      try {
        const templates = await window.electronAPI.hook.getTemplates();
        setHookTemplates(templates);
      } catch (err) {
        console.error('Failed to load hook templates:', err);
      }
    };
    void loadHookTemplates();
  }, []);

  // Check existing hooks when editing
  useEffect(() => {
    const checkExistingHooks = async () => {
      if (isEditing && path) {
        try {
          const hasHooks = await window.electronAPI.hook.hasConfigured(path);
          setHasExistingHooks(hasHooks);
          setEnableHooksIntegration(hasHooks);
        } catch (err) {
          console.error('Failed to check existing hooks:', err);
        }
      }
    };
    void checkExistingHooks();
  }, [isEditing, path]);

  const handleSelectDirectory = async () => {
    const selectedPath = await window.electronAPI.dialog.selectDirectory();
    if (selectedPath) {
      setPath(selectedPath);
      // Auto-fill name from directory name if empty
      if (!name) {
        const dirName = selectedPath.split(/[\\/]/).pop() || '';
        setName(dirName);
      }
    }
  };

  // Additional directories handlers
  const handleAddAdditionalDir = async () => {
    const selectedPath = await window.electronAPI.dialog.selectDirectory();
    if (selectedPath && !additionalDirs.includes(selectedPath)) {
      setAdditionalDirs([...additionalDirs, selectedPath]);
    }
  };

  const handleRemoveAdditionalDir = (dirToRemove: string) => {
    setAdditionalDirs(additionalDirs.filter((d) => d !== dirToRemove));
  };

  // Agent handlers
  const handleSaveAgent = (name: string, agent: CustomAgent) => {
    const newAgents = { ...agents };
    // If editing and name changed, remove old entry
    if (editingAgent && editingAgent.name !== name) {
      delete newAgents[editingAgent.name];
    }
    newAgents[name] = agent;
    setAgents(newAgents);
    setShowAgentForm(false);
    setEditingAgent(null);
  };

  const handleEditAgent = (name: string) => {
    setEditingAgent({ name, agent: agents[name] });
    setShowAgentForm(true);
  };

  const handleDeleteAgent = (name: string) => {
    const newAgents = { ...agents };
    delete newAgents[name];
    setAgents(newAgents);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('project.nameRequired'));
      return;
    }

    if (!path.trim()) {
      setError(t('project.pathRequired'));
      return;
    }

    setIsSubmitting(true);

    try {
      const projectPath = path.trim();

      // Build cluster permissions if cluster is enabled
      const clusterPermissions: ProjectClusterPermissions | undefined =
        isClusterEnabled() && clusterConfig?.role !== 'standalone'
          ? {
              shareWithCluster: clusterShareWithCluster,
              allowRemoteInstanceCreation: clusterAllowRemoteCreation,
            }
          : undefined;

      if (isEditing && existingProject) {
        await updateProject({
          ...existingProject,
          name: name.trim(),
          path: projectPath,
          description: description.trim() || undefined,
          color,
          skipPermissions,
          enableMcp,
          autoReview,
          preferredShell: preferredShell || undefined,
          clusterPermissions,
          additionalDirs: additionalDirs.length > 0 ? additionalDirs : undefined,
          agentDeliveryMethod,
          agents: Object.keys(agents).length > 0 ? agents : undefined,
        });

        // Handle hooks integration changes
        if (enableHooksIntegration && !hasExistingHooks) {
          // Enable hooks for existing project
          await window.electronAPI.hook.setupProject(
            projectPath,
            {
              enabled: true,
              enableNotifications: true,
              enableToolTracking: true,
              enablePermissionCheck: true,
              enableMetrics: true,
            },
            selectedHookTemplate
          );
        } else if (!enableHooksIntegration && hasExistingHooks) {
          // Remove hooks from project
          await window.electronAPI.hook.removeProject(projectPath);
        }

        // Set up AGENT.md for orchestration if MCP is enabled (idempotent - won't overwrite existing)
        if (enableMcp) {
          await window.electronAPI.orchestration.setupAgentMd(projectPath);
        }
      } else {
        await createProject({
          name: name.trim(),
          path: projectPath,
          description: description.trim() || undefined,
          color,
          skipPermissions,
          enableMcp,
          autoReview,
          preferredShell: preferredShell || undefined,
          clusterPermissions,
          additionalDirs: additionalDirs.length > 0 ? additionalDirs : undefined,
          agentDeliveryMethod,
          agents: Object.keys(agents).length > 0 ? agents : undefined,
        });

        // Set up hooks for new project if enabled
        if (enableHooksIntegration) {
          await window.electronAPI.hook.setupProject(
            projectPath,
            {
              enabled: true,
              enableNotifications: true,
              enableToolTracking: true,
              enablePermissionCheck: true,
              enableMetrics: true,
            },
            selectedHookTemplate
          );
        }

        // Set up AGENT.md for orchestration if MCP is enabled
        if (enableMcp) {
          await window.electronAPI.orchestration.setupAgentMd(projectPath);
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('project.failedToSave'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title={isEditing ? t('project.editProject') : t('project.addProject')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('project.name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
            placeholder={t('project.namePlaceholder')}
            autoFocus
          />
        </div>

        {/* Path */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('project.path')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
              placeholder={t('project.pathPlaceholder')}
            />
            <button
              type="button"
              onClick={handleSelectDirectory}
              className="px-3 py-2 bg-claude-tan/30 dark:bg-gray-600 hover:bg-claude-tan/50 dark:hover:bg-gray-500 rounded-md text-gray-800 dark:text-white transition-colors"
            >
              {t('common.browse')}
            </button>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('project.description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent resize-none"
            placeholder={t('project.descriptionPlaceholder')}
            rows={2}
          />
        </div>

        {/* Color */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('project.color')}
          </label>
          <div className="flex gap-2 flex-wrap">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full transition-transform ${
                  color === c
                    ? 'ring-2 ring-gray-800 dark:ring-white ring-offset-2 ring-offset-claude-beige dark:ring-offset-gray-800 scale-110'
                    : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Preferred Shell */}
        <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('project.preferredShell')}
          </label>
          {isLoadingShells ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {t('project.loadingShells')}
            </div>
          ) : (
            <>
              <select
                value={preferredShell}
                onChange={(e) => setPreferredShell(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
              >
                {availableShells.map((shell) => (
                  <option key={shell.id} value={shell.path}>
                    {shell.name}
                    {shell.isDefault ? ` (${t('project.systemDefault')})` : ''}
                    {shell.canRunClaude ? '' : ` - ${t('project.cannotRunClaude')}`}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('project.preferredShellDescription')}
              </p>
            </>
          )}
        </div>

        {/* Skip Permissions */}
        <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={skipPermissions}
              onChange={(e) => setSkipPermissions(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-claude-tan/50 dark:border-gray-600 bg-white dark:bg-gray-700 text-orange-500 focus:ring-orange-500 focus:ring-offset-claude-beige dark:focus:ring-offset-gray-800"
            />
            <div>
              <span className="text-sm font-medium text-orange-500 dark:text-orange-400">
                {t('project.skipPermissions')}
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {t('project.skipPermissionsDescription')}
              </p>
            </div>
          </label>
        </div>

        {/* MCP Server Integration */}
        <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableMcp}
              onChange={(e) => setEnableMcp(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-claude-tan/50 dark:border-gray-600 bg-white dark:bg-gray-700 text-purple-500 focus:ring-purple-500 focus:ring-offset-claude-beige dark:focus:ring-offset-gray-800"
            />
            <div>
              <span className="text-sm font-medium text-purple-500 dark:text-purple-400">
                {t('project.enableMcp', 'Enable MCP Server')}
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {t(
                  'project.enableMcpDescription',
                  'Allows Claude to use orchestration tools, access git status, and interact with Orchestra via MCP protocol'
                )}
              </p>
            </div>
          </label>
        </div>

        {/* Auto Review on Task Completion */}
        <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoReview}
              onChange={(e) => setAutoReview(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-claude-tan/50 dark:border-gray-600 bg-white dark:bg-gray-700 text-green-500 focus:ring-green-500 focus:ring-offset-claude-beige dark:focus:ring-offset-gray-800"
            />
            <div>
              <span className="text-sm font-medium text-green-500 dark:text-green-400">
                {t('project.autoReview', 'Auto-Review on Task Completion')}
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {t(
                  'project.autoReviewDescription',
                  'Automatically run typecheck and lint:fix when Claude completes a task. Uses economical Haiku model.'
                )}
              </p>
            </div>
          </label>
        </div>

        {/* Additional Working Directories */}
        <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setShowDirsSection(!showDirsSection)}
            className="flex items-center gap-2 w-full text-left"
          >
            <ChevronIcon
              className={`w-4 h-4 text-gray-500 transition-transform ${showDirsSection ? 'rotate-90' : ''}`}
            />
            <FolderPlusIcon className="w-4 h-4 text-cyan-500" />
            <span className="text-sm font-medium text-gray-800 dark:text-white">
              {t('project.additionalDirs', 'Additional Working Directories')}
            </span>
            {additionalDirs.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({additionalDirs.length})
              </span>
            )}
          </button>

          {showDirsSection && (
            <div className="mt-3 ml-6 space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('project.additionalDirsDesc', 'Extra directories Claude can access (--add-dir)')}
              </p>

              {additionalDirs.map((dir, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={dir}
                    readOnly
                    className="flex-1 px-2 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveAdditionalDir(dir)}
                    className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
                    title={t('common.remove', 'Remove')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddAdditionalDir}
                className="flex items-center gap-1 text-sm text-claude-orange hover:text-claude-orange-dark transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                {t('project.addDirectory', 'Add directory')}
              </button>
            </div>
          )}
        </div>

        {/* Custom Agents */}
        <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setShowAgentsSection(!showAgentsSection)}
            className="flex items-center gap-2 w-full text-left"
          >
            <ChevronIcon
              className={`w-4 h-4 text-gray-500 transition-transform ${showAgentsSection ? 'rotate-90' : ''}`}
            />
            <BotIcon className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-medium text-gray-800 dark:text-white">
              {t('project.customAgents', 'Custom Agents')}
            </span>
            {Object.keys(agents).length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({Object.keys(agents).length})
              </span>
            )}
          </button>

          {showAgentsSection && (
            <div className="mt-3 ml-6 space-y-3">
              {/* Delivery Method */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('project.agentDeliveryMethod', 'Agent Delivery Method')}
                </label>
                <select
                  value={agentDeliveryMethod}
                  onChange={(e) => setAgentDeliveryMethod(e.target.value as AgentDeliveryMethod)}
                  className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="skill">
                    {t('project.deliverAsSkills', 'Install as Skills (recommended)')}
                  </option>
                  <option value="args">
                    {t('project.deliverViaFlag', 'Pass via --agents flag')}
                  </option>
                </select>
              </div>

              {/* Agents List */}
              {Object.keys(agents).length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                  {t('project.noAgents', 'No custom agents configured')}
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(agents).map(([agentName, agent]) => (
                    <div
                      key={agentName}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-md"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 dark:text-white truncate">
                            {agentName}
                          </span>
                          {agent.model && (
                            <span className="text-xs px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">
                              {agent.model}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {agent.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          type="button"
                          onClick={() => handleEditAgent(agentName)}
                          className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                          title={t('project.editAgent', 'Edit agent')}
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAgent(agentName)}
                          className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors"
                          title={t('project.deleteAgent', 'Delete agent')}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Agent Button */}
              <button
                type="button"
                onClick={() => {
                  setEditingAgent(null);
                  setShowAgentForm(true);
                }}
                className="flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                {t('project.addAgent', 'Add agent')}
              </button>
            </div>
          )}
        </div>

        {/* Dashboard Hooks Integration */}
        <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={enableHooksIntegration}
              onChange={(e) => setEnableHooksIntegration(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-claude-tan/50 dark:border-gray-600 bg-white dark:bg-gray-700 text-claude-orange focus:ring-claude-orange focus:ring-offset-claude-beige dark:focus:ring-offset-gray-800"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-800 dark:text-white">
                {t('project.enableHooksIntegration', 'Enable Dashboard Integration')}
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {t(
                  'project.enableHooksIntegrationDescription',
                  'Receive notifications and track activity from Claude instances in this project'
                )}
              </p>
            </div>
          </label>

          {/* Hook Options (expanded when enabled) */}
          {enableHooksIntegration && (
            <div className="mt-3 ml-7">
              <button
                type="button"
                onClick={() => setShowHookOptions(!showHookOptions)}
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronIcon
                  className={`w-3 h-3 transition-transform ${showHookOptions ? 'rotate-90' : ''}`}
                />
                {t('project.advancedOptions', 'Advanced options')}
              </button>

              {showHookOptions && (
                <div className="mt-2 space-y-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                    {t('project.hookTemplate', 'Integration template')}
                  </label>
                  <select
                    value={selectedHookTemplate}
                    onChange={(e) => setSelectedHookTemplate(e.target.value as HookTemplateType)}
                    className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
                  >
                    {hookTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  {hookTemplates.find((t) => t.id === selectedHookTemplate)?.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {hookTemplates.find((t) => t.id === selectedHookTemplate)?.description}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Warning about existing hooks */}
          {isEditing && hasExistingHooks && !enableHooksIntegration && (
            <div className="mt-2 ml-7 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                {t(
                  'project.hooksWillBeRemoved',
                  'Warning: Disabling this will remove existing dashboard hooks from the project.'
                )}
              </p>
            </div>
          )}
        </div>

        {/* Cluster Sharing - Only show when cluster is enabled and not standalone */}
        {isClusterEnabled() && clusterConfig?.role !== 'standalone' && (
          <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <GlobeIcon className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-800 dark:text-white">
                {t('project.clusterSharing')}
              </span>
            </div>

            <div className="space-y-3 ml-6">
              {/* Visibility */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('project.clusterVisibility')}
                </label>
                <select
                  value={
                    clusterShareWithCluster === null
                      ? 'default'
                      : clusterShareWithCluster
                        ? 'share'
                        : 'private'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'default') setClusterShareWithCluster(null);
                    else if (e.target.value === 'share') setClusterShareWithCluster(true);
                    else setClusterShareWithCluster(false);
                  }}
                  className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="default">{t('project.useNodeDefault')}</option>
                  <option value="share">{t('project.shareWithCluster')}</option>
                  <option value="private">{t('project.dontShare')}</option>
                </select>
              </div>

              {/* Allow Remote Instances */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {t('project.allowRemoteInstances')}
                </label>
                <select
                  value={
                    clusterAllowRemoteCreation === null
                      ? 'default'
                      : clusterAllowRemoteCreation
                        ? 'yes'
                        : 'no'
                  }
                  onChange={(e) => {
                    if (e.target.value === 'default') setClusterAllowRemoteCreation(null);
                    else if (e.target.value === 'yes') setClusterAllowRemoteCreation(true);
                    else setClusterAllowRemoteCreation(false);
                  }}
                  className="w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="default">{t('project.useNodeDefault')}</option>
                  <option value="yes">{t('common.yes', 'Yes')}</option>
                  <option value="no">{t('common.no', 'No')}</option>
                </select>
              </div>

              {/* Privacy indicator */}
              {clusterShareWithCluster === false && (
                <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                  <LockIcon className="w-4 h-4 text-gray-500" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {t(
                      'project.privateProjectNote',
                      'This project will not be visible to other cluster nodes'
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Load Session History - Only show when editing */}
        {isEditing && existingProject && (
          <div className="pt-2 border-t border-claude-tan/30 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-lg transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              {t('project.loadSessionHistory')}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 text-center">
              {t('project.loadSessionHistoryDescription')}
            </p>
          </div>
        )}

        {/* Error */}
        {error && <div className="text-red-500 dark:text-red-400 text-sm">{error}</div>}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting
              ? t('common.saving')
              : isEditing
                ? t('project.saveChanges')
                : t('project.addProject')}
          </button>
        </div>
      </form>

      {/* Import Sessions Modal */}
      {showImportModal && existingProject && (
        <ImportSessionsModal
          projectId={existingProject.id}
          projectPath={existingProject.path}
          onClose={() => setShowImportModal(false)}
          onImported={() => {
            void loadConversations(existingProject.id);
          }}
        />
      )}

      {/* Agent Form Modal */}
      {showAgentForm && (
        <AgentFormModal
          agent={editingAgent?.agent}
          agentName={editingAgent?.name}
          existingAgentNames={Object.keys(agents).filter((n) => n !== editingAgent?.name)}
          onSave={handleSaveAgent}
          onClose={() => {
            setShowAgentForm(false);
            setEditingAgent(null);
          }}
        />
      )}
    </Modal>
  );
}

// Icon components
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

function FolderPlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
      />
    </svg>
  );
}

function BotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}
