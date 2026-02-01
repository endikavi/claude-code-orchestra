import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../../stores/instanceStore';
import { useClusterStore } from '../../stores/clusterStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { Modal } from '../common/Modal';
import { PresetSelector } from '../presets/PresetSelector';
import { PresetFormModal } from '../presets/PresetFormModal';
import type { ClaudeModel, InstanceMode, DiscoveredAgent } from '@shared/types';
import type { InstancePreset, CreatePresetInput, UpdatePresetInput } from '@shared/types/presets';

interface InstanceModalProps {
  projectId: string;
  onClose: () => void;
}

const MODELS: { value: ClaudeModel; label: string }[] = [
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'opus', label: 'Claude Opus' },
  { value: 'haiku', label: 'Claude Haiku' },
];

export function InstanceModal({ projectId, onClose }: InstanceModalProps) {
  const { t } = useTranslation();
  const { createInstance, createPendingInstance } = useInstanceStore();
  const { isClusterEnabled, config: clusterConfig, privacy } = useClusterStore();
  const { projects } = useProjectStore();
  const viewMode = useUIStore((state) => state.viewMode);

  // Find the project to check if skipPermissions is allowed
  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [planMode, setPlanMode] = useState(false);
  const [verbose, setVerbose] = useState(false);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Agent file selection
  const [availableAgents, setAvailableAgents] = useState<DiscoveredAgent[]>([]);
  const [selectedAgentFile, setSelectedAgentFile] = useState<string>('');
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);

  // Cluster privacy settings (use node defaults)
  const [shareWithCluster, setShareWithCluster] = useState(
    privacy?.shareInstancesByDefault ?? true
  );
  const [allowRemoteInput, setAllowRemoteInput] = useState(
    privacy?.allowRemoteInstanceInput ?? true
  );

  // Preset state
  const [presets, setPresets] = useState<InstancePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);

  // Initial prompt from preset
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);

  // Load presets when project changes
  useEffect(() => {
    const loadPresets = async () => {
      setIsLoadingPresets(true);
      try {
        const loadedPresets = await window.electronAPI.preset.getByProject(projectId);
        setPresets(loadedPresets);
      } catch (err) {
        console.error('Failed to load presets:', err);
      } finally {
        setIsLoadingPresets(false);
      }
    };
    void loadPresets();
  }, [projectId]);

  // Load available agents when project changes
  useEffect(() => {
    const loadAgents = async () => {
      if (!project?.path) return;
      setIsLoadingAgents(true);
      try {
        const agents = await window.electronAPI.agent.discover(project.path);
        setAvailableAgents(agents);

        // Pre-select claude-code-orchestrator if available and no agent already selected
        const orchestrator = agents.find((a) => a.name === 'claude-code-orchestrator');
        if (orchestrator && !selectedAgentFile) {
          setSelectedAgentFile(orchestrator.path);
        }
      } catch (err) {
        console.error('Failed to load agents:', err);
      } finally {
        setIsLoadingAgents(false);
      }
    };
    void loadAgents();
  }, [project?.path, selectedAgentFile]);

  // Mode depends on view: stream-json for structured view, interactive for terminal
  const mode: InstanceMode = viewMode === 'structured' ? 'stream-json' : 'interactive';
  const clusterIsActive = isClusterEnabled() && clusterConfig?.role !== 'standalone';

  // Only show skipPermissions option if project allows it
  const projectAllowsSkipPermissions = project?.skipPermissions === true;

  // Apply preset to form
  const handleApplyPreset = (preset: InstancePreset | null) => {
    if (!preset) {
      setSelectedPresetId(null);
      // Reset to defaults
      setModel('sonnet');
      setPlanMode(false);
      setVerbose(false);
      setSelectedAgentFile('');
      setInitialPrompt(undefined);
      return;
    }

    setSelectedPresetId(preset.id);
    setModel(preset.model);
    setPlanMode(preset.planMode ?? false);
    setVerbose(preset.verbose ?? false);
    setSelectedAgentFile(preset.agentFile ?? '');
    setInitialPrompt(preset.initialPrompt);
  };

  // Save preset
  const handleSavePreset = async (
    data: CreatePresetInput | { id: string; updates: UpdatePresetInput }
  ) => {
    if ('id' in data) {
      // Update existing preset
      await window.electronAPI.preset.update(data.id, data.updates);
    } else {
      // Create new preset
      await window.electronAPI.preset.create(data);
    }
    // Refresh presets list
    const loadedPresets = await window.electronAPI.preset.getByProject(projectId);
    setPresets(loadedPresets);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // For structured view: create pending instance (no Claude process yet)
      // User will type first message in the chat input to activate it
      // For terminal view: start Claude immediately as before
      const isStructuredView = viewMode === 'structured';

      const instanceConfig = {
        projectId,
        model,
        mode,
        planMode,
        verbose,
        // Only pass skipPermissions if project allows it and user enabled it
        ...(projectAllowsSkipPermissions && skipPermissions ? { skipPermissions: true } : {}),
        // Pass selected agent file if not auto-detect
        ...(selectedAgentFile ? { agentFile: selectedAgentFile } : {}),
        // Note: usePermissionPromptTool disabled - MCP tool not yet implemented
      };

      let instance;
      if (isStructuredView) {
        // Deferred flow: create pending instance, user will activate with first message
        instance = await createPendingInstance(instanceConfig);
      } else {
        // Terminal flow: start Claude immediately with optional initial prompt
        instance = await createInstance({
          ...instanceConfig,
          ...(initialPrompt ? { prompt: initialPrompt } : {}),
        });
      }

      // Set cluster permissions if cluster is active
      if (clusterIsActive && instance && window.electronAPI?.cluster?.setInstancePermissions) {
        await window.electronAPI.cluster.setInstancePermissions(instance.id, {
          shareWithCluster,
          allowRemoteInput,
        });
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('instance.failedToCreate'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal title={t('instance.newInstance')} onClose={onClose}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Preset Selector */}
          <PresetSelector
            presets={presets}
            selectedId={selectedPresetId}
            onSelect={handleApplyPreset}
            onSaveNew={() => setShowPresetModal(true)}
            disabled={isLoadingPresets}
          />

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('instance.model')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {MODELS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setModel(m.value)}
                  className={`px-3 py-2 text-sm rounded-sm border transition-colors ${
                    model === m.value
                      ? 'bg-sky-500/20 border-sky-500 text-gray-800 dark:text-white'
                      : 'bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Agent Instructions */}
          {availableAgents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('instance.agentFile', 'Agent Instructions')}
              </label>
              <select
                value={selectedAgentFile}
                onChange={(e) => setSelectedAgentFile(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                disabled={isLoadingAgents}
              >
                <option value="">
                  {t('instance.autoDetectAgent', 'Auto-detect (AGENT.md if present)')}
                </option>
                {availableAgents.map((agent) => (
                  <option key={agent.path} value={agent.path}>
                    {agent.name}
                    {agent.source === 'global' ? ' (global)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t(
                  'instance.agentFileDesc',
                  'Select agent instructions file to use for orchestration'
                )}
              </p>
            </div>
          )}

          {/* Instance Options */}
          <div className="space-y-3">
            {/* Plan Mode */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={planMode}
                onChange={(e) => setPlanMode(e.target.checked)}
                className="w-4 h-4 text-sky-500 bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 rounded focus:ring-sky-500 focus:ring-2"
              />
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {t('instance.planMode')}
                </span>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {t('instance.planModeDesc')}
                </p>
              </div>
            </label>

            {/* Verbose Mode */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={verbose}
                onChange={(e) => setVerbose(e.target.checked)}
                className="w-4 h-4 text-sky-500 bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 rounded focus:ring-sky-500 focus:ring-2"
              />
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {t('instance.verbose')}
                </span>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {t('instance.verboseDesc')}
                </p>
              </div>
            </label>

            {/* Skip Permissions - Only show if project allows it */}
            {projectAllowsSkipPermissions && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipPermissions}
                  onChange={(e) => setSkipPermissions(e.target.checked)}
                  className="w-4 h-4 text-orange-500 bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 rounded focus:ring-orange-500 focus:ring-2"
                />
                <div>
                  <span className="text-sm font-medium text-orange-500 dark:text-orange-400">
                    {t('instance.skipPermissions')}
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {t('instance.skipPermissionsDesc')}
                  </p>
                </div>
              </label>
            )}
          </div>

          {/* Initial Prompt (if preset has one) */}
          {initialPrompt && (
            <div className="p-3 bg-gray-50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-600 rounded-sm">
              <div className="flex items-center gap-2 mb-1">
                <PromptIcon className="w-4 h-4 text-sky-500" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {t('preset.initialPrompt')}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {initialPrompt}
              </p>
            </div>
          )}

          {/* Cluster Privacy - Only show when cluster is active */}
          {clusterIsActive && (
            <div className="pt-2 border-t border-gray-200 dark:border-neutral-700">
              <div className="flex items-center gap-2 mb-3">
                <GlobeIcon className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-800 dark:text-white">
                  {t('instance.clusterPrivacy')}
                </span>
              </div>

              <div className="space-y-3 ml-6">
                {/* Share with cluster */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shareWithCluster}
                    onChange={(e) => setShareWithCluster(e.target.checked)}
                    className="w-4 h-4 text-blue-500 bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('instance.shareWithCluster')}
                  </span>
                </label>

                {/* Allow remote input */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowRemoteInput}
                    onChange={(e) => setAllowRemoteInput(e.target.checked)}
                    className="w-4 h-4 text-blue-500 bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-600 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('instance.allowRemoteInput')}
                  </span>
                </label>
              </div>
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
              className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  {t('common.starting')}
                </>
              ) : (
                <>
                  <PlayIcon className="w-4 h-4" />
                  {t('instance.startInstance')}
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Preset Form Modal */}
      {showPresetModal && (
        <PresetFormModal
          onClose={() => setShowPresetModal(false)}
          onSave={handleSavePreset}
          projectId={projectId}
          initialConfig={{
            model,
            planMode,
            verbose,
            agentFile: selectedAgentFile,
            agents: project?.agents,
            additionalDirs: project?.additionalDirs,
          }}
          availableAgents={availableAgents}
        />
      )}
    </>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
      />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
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

function PromptIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
      />
    </svg>
  );
}
