import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import i18n from 'i18next';
import { usePermissionStore } from '../../stores/permissionStore';
import { Spinner } from '../common/Spinner';
import {
  PlusIcon,
  ShieldIcon,
  ListIcon,
  EyeIcon,
  EyeOffIcon,
  EditIcon,
  TrashIcon,
  CloseIcon,
} from '@renderer/components/icons';
import type {
  PermissionRule,
  PermissionDecision,
  PermissionCondition,
  PermissionLogEntry,
} from '@shared/types';

export function PermissionRulesPanel() {
  const { t } = useTranslation();
  const {
    config,
    log,
    stats,
    isLoading,
    loadConfig,
    setConfig,
    addRule,
    updateRule,
    removeRule,
    loadLog,
    loadStats,
    clearLog,
  } = usePermissionStore(
    useShallow((s) => ({
      config: s.config,
      log: s.log,
      stats: s.stats,
      isLoading: s.isLoading,
      loadConfig: s.loadConfig,
      setConfig: s.setConfig,
      addRule: s.addRule,
      updateRule: s.updateRule,
      removeRule: s.removeRule,
      loadLog: s.loadLog,
      loadStats: s.loadStats,
      clearLog: s.clearLog,
    }))
  );

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRule, setEditingRule] = useState<PermissionRule | null>(null);
  const [activeTab, setActiveTab] = useState<'rules' | 'log'>('rules');

  useEffect(() => {
    void loadConfig();
    void loadStats();
  }, [loadConfig, loadStats]);

  useEffect(() => {
    if (activeTab === 'log') {
      void loadLog({ limit: 50 });
    }
  }, [activeTab, loadLog]);

  const handleToggleEnabled = async () => {
    if (config) {
      await setConfig({ enabled: !config.enabled });
    }
  };

  const handleToggleRule = async (rule: PermissionRule) => {
    await updateRule(rule.id, { enabled: !rule.enabled });
  };

  const handleDeleteRule = async (rule: PermissionRule) => {
    if (confirm(t('permissions.confirmDeleteRule', 'Are you sure you want to delete this rule?'))) {
      await removeRule(rule.id);
    }
  };

  if (isLoading && !config) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-800 dark:text-white">
            {t('permissions.title', 'Permission Rules')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {t('permissions.description', 'Configure auto-approval rules for Claude tool usage')}
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {config?.enabled
              ? t('permissions.enabled', 'Enabled')
              : t('permissions.disabled', 'Disabled')}
          </span>
          <div className="relative">
            <input
              type="checkbox"
              checked={config?.enabled || false}
              onChange={handleToggleEnabled}
              className="sr-only"
            />
            <div
              className={`w-10 h-6 rounded-full transition-colors ${
                config?.enabled ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  config?.enabled ? 'translate-x-4' : ''
                }`}
              />
            </div>
          </div>
        </label>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded p-3">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.allowed}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400">
              {t('permissions.allowed', 'Allowed')}
            </div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded p-3">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.denied}</div>
            <div className="text-xs text-red-600 dark:text-red-400">
              {t('permissions.denied', 'Denied')}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-neutral-800 rounded p-3">
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
              {stats.totalChecks}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {t('permissions.totalChecks', 'Total Checks')}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-neutral-700">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'rules'
              ? 'text-sky-500 border-b-2 border-sky-500'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          {t('permissions.rulesTab', 'Rules')} ({config?.globalRules.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('log')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'log'
              ? 'text-sky-500 border-b-2 border-sky-500'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          {t('permissions.logTab', 'Activity Log')}
        </button>
      </div>

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="space-y-3">
          {/* Add Rule Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-200 dark:border-neutral-600 rounded text-gray-600 dark:text-gray-400 hover:border-sky-500 hover:text-sky-500 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            {t('permissions.addRule', 'Add Rule')}
          </button>

          {/* Rules List */}
          {config?.globalRules.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <ShieldIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {t('permissions.noRules', 'No permission rules configured')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {config?.globalRules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onToggle={() => handleToggleRule(rule)}
                  onEdit={() => setEditingRule(rule)}
                  onDelete={() => handleDeleteRule(rule)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Log Tab */}
      {activeTab === 'log' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => clearLog()}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
            >
              {t('permissions.clearLog', 'Clear log')}
            </button>
          </div>

          {log.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <ListIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{t('permissions.noLog', 'No activity recorded yet')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {log.map((entry) => (
                <LogEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Rule Modal */}
      {(showAddModal || editingRule) && (
        <RuleModal
          rule={editingRule}
          onClose={() => {
            setShowAddModal(false);
            setEditingRule(null);
          }}
          onSave={async (ruleData) => {
            if (editingRule) {
              await updateRule(editingRule.id, ruleData);
            } else {
              await addRule(ruleData);
            }
            setShowAddModal(false);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}

// Rule Card Component
interface RuleCardProps {
  rule: PermissionRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function RuleCard({ rule, onToggle, onEdit, onDelete }: RuleCardProps) {
  const { t } = useTranslation();
  const decisionColor =
    rule.decision === 'allow'
      ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
      : rule.decision === 'deny'
        ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
        : 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-neutral-700';

  // Extract tool name and conditions for display
  const toolName = rule.toolName || rule.toolCategory || '*';
  const pathCondition = rule.conditions.find((c) => c.type === 'path_pattern');

  return (
    <div
      className={`p-3 rounded border ${
        rule.enabled
          ? 'border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'
          : 'border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/50 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${decisionColor}`}>
              {rule.decision.toUpperCase()}
            </span>
            <span className="font-medium text-gray-800 dark:text-white">{rule.name}</span>
          </div>
          {rule.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{rule.description}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('permissions.tool', 'Tool')}:{' '}
              <code className="bg-gray-100 dark:bg-neutral-700 px-1 rounded">{toolName}</code>
            </span>
            {pathCondition && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('permissions.path', 'Path')}:{' '}
                <code className="bg-gray-100 dark:bg-neutral-700 px-1 rounded">
                  {pathCondition.value}
                </code>
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('permissions.usageCount', 'Used')}: {rule.usageCount}x
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
            title={
              rule.enabled ? t('permissions.disable', 'Disable') : t('permissions.enable', 'Enable')
            }
          >
            {rule.enabled ? (
              <EyeIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            ) : (
              <EyeOffIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            )}
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
            title={t('permissions.edit', 'Edit')}
          >
            <EditIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            title={t('permissions.delete', 'Delete')}
          >
            <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Log Entry Component
function LogEntry({ entry }: { entry: PermissionLogEntry }) {
  const decisionColor =
    entry.decision === 'allow'
      ? 'text-green-600 dark:text-green-400'
      : entry.decision === 'deny'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-600 dark:text-gray-400';

  const timeAgo = getTimeAgo(entry.timestamp);

  return (
    <div className="px-3 py-2 rounded bg-gray-50 dark:bg-neutral-800/50 text-sm">
      <div className="flex items-center gap-2">
        <span className={`font-medium ${decisionColor}`}>{entry.decision.toUpperCase()}</span>
        <span className="text-gray-800 dark:text-white">{entry.toolName}</span>
        <span className="text-gray-400">-</span>
        <span className="text-gray-500 dark:text-gray-400 text-xs">{timeAgo}</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
        {entry.reason || `Rule ID: ${entry.ruleId || 'default'}`}
      </div>
    </div>
  );
}

// Rule Modal Component
interface RuleModalProps {
  rule: PermissionRule | null;
  onClose: () => void;
  onSave: (
    rule: Omit<PermissionRule, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ) => Promise<void>;
}

function RuleModal({ rule, onClose, onSave }: RuleModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [toolName, setToolName] = useState(rule?.toolName || '');
  const pathCondition = rule?.conditions.find((c) => c.type === 'path_pattern');
  const [pathPattern, setPathPattern] = useState(pathCondition?.value || '');
  const [decision, setDecision] = useState<PermissionDecision>(rule?.decision || 'allow');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [priority, setPriority] = useState(rule?.priority || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Build conditions array
    const conditions: PermissionCondition[] = [];
    if (pathPattern.trim()) {
      conditions.push({
        type: 'path_pattern',
        operator: 'contains',
        value: pathPattern.trim(),
      });
    }

    setIsSubmitting(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        toolName: toolName.trim() || undefined,
        conditions,
        decision,
        enabled,
        priority,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-50 dark:bg-neutral-800 rounded shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
            {rule ? t('permissions.editRule', 'Edit Rule') : t('permissions.addRule', 'Add Rule')}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('permissions.ruleName', 'Rule Name')} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder={t('permissions.ruleNamePlaceholder', 'e.g., Allow Read in src')}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('permissions.ruleDescription', 'Description')}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder={t('permissions.ruleDescriptionPlaceholder', 'Optional description')}
            />
          </div>

          {/* Tool Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('permissions.toolName', 'Tool Name')}
            </label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Read, Bash, etc."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('permissions.toolNameHelp', 'Leave empty to match all tools')}
            </p>
          </div>

          {/* Path Pattern */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('permissions.pathPattern', 'Path Pattern')}
            </label>
            <input
              type="text"
              value={pathPattern}
              onChange={(e) => setPathPattern(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="src/**, *.ts, etc."
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('permissions.pathPatternHelp', 'Optional glob pattern for file paths')}
            </p>
          </div>

          {/* Decision */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('permissions.decision', 'Decision')}
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="allow"
                  checked={decision === 'allow'}
                  onChange={() => setDecision('allow')}
                  className="text-green-500 focus:ring-green-500"
                />
                <span className="text-sm text-green-600 dark:text-green-400">
                  {t('permissions.allow', 'Allow')}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="deny"
                  checked={decision === 'deny'}
                  onChange={() => setDecision('deny')}
                  className="text-red-500 focus:ring-red-500"
                />
                <span className="text-sm text-red-600 dark:text-red-400">
                  {t('permissions.deny', 'Deny')}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  value="ask"
                  checked={decision === 'ask'}
                  onChange={() => setDecision('ask')}
                  className="text-gray-500 focus:ring-gray-500"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {t('permissions.ask', 'Ask')}
                </span>
              </label>
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('permissions.priority', 'Priority')}
            </label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-white dark:bg-neutral-700 border border-gray-200 dark:border-neutral-600 rounded-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('permissions.priorityHelp', 'Higher priority rules are evaluated first')}
            </p>
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="rule-enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-sky-500 focus:ring-sky-500"
            />
            <label htmlFor="rule-enabled" className="text-sm text-gray-700 dark:text-gray-300">
              {t('permissions.enableRule', 'Enable this rule')}
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Helper function
function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return i18n.t('time.justNow');
  if (seconds < 3600) return i18n.t('time.minutesAgo', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return i18n.t('time.hoursAgo', { count: Math.floor(seconds / 3600) });
  if (seconds < 604800) return i18n.t('time.daysAgo', { count: Math.floor(seconds / 86400) });
  return new Date(timestamp).toLocaleDateString();
}

// Icons
