import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import type {
  InstancePreset,
  CreatePresetInput,
  UpdatePresetInput,
  PresetCategory,
} from '@shared/types/presets';
import { PRESET_CATEGORIES } from '@shared/types/presets';
import type { ClaudeModel, CustomAgentsConfig, DiscoveredAgent } from '@shared/types';

interface PresetFormModalProps {
  onClose: () => void;
  onSave: (data: CreatePresetInput | { id: string; updates: UpdatePresetInput }) => Promise<void>;
  projectId?: string;
  // For editing an existing preset
  preset?: InstancePreset;
  // For prefilling from current instance config
  initialConfig?: {
    model: ClaudeModel;
    planMode?: boolean;
    verbose?: boolean;
    agentFile?: string;
    agents?: CustomAgentsConfig;
    additionalDirs?: string[];
  };
  availableAgents?: DiscoveredAgent[];
}

const MODELS: { value: ClaudeModel; label: string }[] = [
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'opus', label: 'Claude Opus' },
  { value: 'haiku', label: 'Claude Haiku' },
];

export function PresetFormModal({
  onClose,
  onSave,
  projectId,
  preset,
  initialConfig,
  availableAgents = [],
}: PresetFormModalProps) {
  const { t } = useTranslation();
  const isEditing = !!preset;

  // Form state
  const [name, setName] = useState(preset?.name ?? '');
  const [description, setDescription] = useState(preset?.description ?? '');
  const [category, setCategory] = useState<PresetCategory | ''>(
    (preset?.category as PresetCategory) ?? ''
  );
  const [tags, setTags] = useState<string[]>(preset?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [isGlobal, setIsGlobal] = useState(preset?.isGlobal ?? false);

  // Instance config
  const [model, setModel] = useState<ClaudeModel>(
    preset?.model ?? initialConfig?.model ?? 'sonnet'
  );
  const [planMode, setPlanMode] = useState(preset?.planMode ?? initialConfig?.planMode ?? false);
  const [verbose, setVerbose] = useState(preset?.verbose ?? initialConfig?.verbose ?? false);
  const [agentFile, setAgentFile] = useState(preset?.agentFile ?? initialConfig?.agentFile ?? '');
  const [initialPrompt, setInitialPrompt] = useState(preset?.initialPrompt ?? '');

  // UI state
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('preset.nameRequired'));
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && preset) {
        // Update existing preset
        await onSave({
          id: preset.id,
          updates: {
            name: name.trim(),
            description: description.trim() || undefined,
            category: category || undefined,
            tags: tags.length > 0 ? tags : undefined,
            isGlobal,
            model,
            planMode,
            verbose,
            agentFile: agentFile || undefined,
            initialPrompt: initialPrompt.trim() || undefined,
          },
        });
      } else {
        // Create new preset
        const data: CreatePresetInput = {
          name: name.trim(),
          description: description.trim() || undefined,
          category: category || undefined,
          tags: tags.length > 0 ? tags : undefined,
          isGlobal,
          projectId: isGlobal ? undefined : projectId,
          model,
          planMode,
          verbose,
          agentFile: agentFile || undefined,
          agents: initialConfig?.agents,
          additionalDirs: initialConfig?.additionalDirs,
          initialPrompt: initialPrompt.trim() || undefined,
        };
        await onSave(data);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <Modal title={isEditing ? t('preset.editPreset') : t('preset.createPreset')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic Info Section */}
        <div className="space-y-3">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('preset.name')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('preset.namePlaceholder')}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('preset.description')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('preset.descriptionPlaceholder')}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('preset.category')}
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PresetCategory | '')}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
            >
              <option value="">-</option>
              {PRESET_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`preset.categories.${cat}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('preset.tags')}
            </label>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-claude-orange/10 text-claude-orange text-xs rounded"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-500"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                placeholder={t('preset.tagsPlaceholder')}
                className="flex-1 px-3 py-1.5 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-sm text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500"
              >
                {t('common.add')}
              </button>
            </div>
          </div>

          {/* Global toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isGlobal}
              onChange={(e) => setIsGlobal(e.target.checked)}
              className="w-4 h-4 text-claude-orange bg-white dark:bg-gray-700 border-claude-tan/50 dark:border-gray-600 rounded focus:ring-claude-orange focus:ring-2"
            />
            <div>
              <span className="text-sm font-medium text-gray-800 dark:text-white">
                {t('preset.isGlobal')}
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400">{t('preset.isGlobalDesc')}</p>
            </div>
          </label>
        </div>

        {/* Separator */}
        <div className="border-t border-claude-tan/30 dark:border-gray-700" />

        {/* Instance Configuration Section */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('instance.model')}
          </h4>

          {/* Model */}
          <div className="grid grid-cols-3 gap-2">
            {MODELS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setModel(m.value)}
                className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                  model === m.value
                    ? 'bg-claude-orange/20 border-claude-orange text-gray-800 dark:text-white'
                    : 'bg-white dark:bg-gray-700 border-claude-tan/50 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-claude-tan dark:hover:border-gray-500'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Agent File */}
          {availableAgents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('instance.agentFile')}
              </label>
              <select
                value={agentFile}
                onChange={(e) => setAgentFile(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
              >
                <option value="">{t('instance.autoDetectAgent')}</option>
                {availableAgents.map((agent) => (
                  <option key={agent.path} value={agent.path}>
                    {agent.name}
                    {agent.source === 'global' ? ' (global)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Plan Mode */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={planMode}
              onChange={(e) => setPlanMode(e.target.checked)}
              className="w-4 h-4 text-claude-orange bg-white dark:bg-gray-700 border-claude-tan/50 dark:border-gray-600 rounded focus:ring-claude-orange focus:ring-2"
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

          {/* Verbose */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={verbose}
              onChange={(e) => setVerbose(e.target.checked)}
              className="w-4 h-4 text-claude-orange bg-white dark:bg-gray-700 border-claude-tan/50 dark:border-gray-600 rounded focus:ring-claude-orange focus:ring-2"
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
        </div>

        {/* Separator */}
        <div className="border-t border-claude-tan/30 dark:border-gray-700" />

        {/* Initial Prompt Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('preset.initialPrompt')}
          </label>
          <textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder={t('preset.initialPromptPlaceholder')}
            rows={3}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent resize-none"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('preset.initialPromptDesc')}
          </p>
        </div>

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
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
