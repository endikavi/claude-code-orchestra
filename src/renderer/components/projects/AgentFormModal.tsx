import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import type { CustomAgent, ClaudeModel } from '@shared/types';

// Available tools that can be assigned to agents
const AVAILABLE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'Task',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
];

interface AgentFormModalProps {
  agent?: CustomAgent;
  agentName?: string;
  existingAgentNames: string[];
  onSave: (name: string, agent: CustomAgent) => void;
  onClose: () => void;
}

export function AgentFormModal({
  agent,
  agentName,
  existingAgentNames,
  onSave,
  onClose,
}: AgentFormModalProps) {
  const { t } = useTranslation();
  const isEditing = !!agent;

  const [name, setName] = useState(agentName || '');
  const [description, setDescription] = useState(agent?.description || '');
  const [prompt, setPrompt] = useState(agent?.prompt || '');
  const [model, setModel] = useState<ClaudeModel | ''>(agent?.model || '');
  const [tools, setTools] = useState<string[]>(agent?.tools || []);
  const [error, setError] = useState('');

  // Validate name on change
  useEffect(() => {
    setError('');
  }, [name, description, prompt]);

  const handleToolToggle = (tool: string) => {
    setTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate name
    if (!name.trim()) {
      setError(t('agent.nameRequired', 'Agent name is required'));
      return;
    }

    // Check for spaces/special characters
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setError(
        t('agent.nameInvalid', 'Name can only contain letters, numbers, hyphens, and underscores')
      );
      return;
    }

    // Check for duplicates (only when creating or renaming)
    if (!isEditing || name !== agentName) {
      if (existingAgentNames.includes(name)) {
        setError(t('agent.nameDuplicate', 'An agent with this name already exists'));
        return;
      }
    }

    if (!description.trim()) {
      setError(t('agent.descriptionRequired', 'Description is required'));
      return;
    }

    if (!prompt.trim()) {
      setError(t('agent.promptRequired', 'Instructions/prompt is required'));
      return;
    }

    const agentData: CustomAgent = {
      description: description.trim(),
      prompt: prompt.trim(),
      tools: tools.length > 0 ? tools : undefined,
      model: model || undefined,
    };

    onSave(name.trim(), agentData);
  };

  return (
    <Modal
      title={isEditing ? t('project.editAgent', 'Edit Agent') : t('project.addAgent', 'Add Agent')}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Agent Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('agent.name', 'Agent Name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
            placeholder="my-agent"
            autoFocus
            disabled={isEditing}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('agent.nameHint', 'Unique identifier (no spaces)')}
          </p>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('agent.description', 'Description')}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
            placeholder={t(
              'agent.descriptionPlaceholder',
              'A short description of what this agent does'
            )}
          />
        </div>

        {/* Prompt/Instructions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('agent.prompt', 'Instructions/Prompt')}
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent resize-none font-mono text-sm"
            placeholder={t('agent.promptPlaceholder', 'Instructions for the agent...')}
            rows={6}
          />
        </div>

        {/* Model Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('agent.model', 'Model (optional)')}
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ClaudeModel | '')}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-claude-tan/50 dark:border-gray-600 rounded-md text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
          >
            <option value="">{t('agent.useDefaultModel', 'Use default model')}</option>
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
        </div>

        {/* Tools Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('agent.tools', 'Allowed Tools')}
          </label>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_TOOLS.map((tool) => (
              <button
                key={tool}
                type="button"
                onClick={() => handleToolToggle(tool)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  tools.includes(tool)
                    ? 'bg-claude-orange text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {tool}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {tools.length === 0
              ? t('agent.allToolsAllowed', 'No restrictions - all tools allowed')
              : t('agent.selectedTools', '{{count}} tool(s) selected', { count: tools.length })}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-500 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-claude-tan/30 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-claude-orange hover:bg-claude-orange-dark text-white rounded-md transition-colors"
          >
            {isEditing ? t('common.save', 'Save') : t('common.add', 'Add')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
