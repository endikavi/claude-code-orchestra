import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissionStore } from '../../stores/permissionStore';
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
  } = usePermissionStore();

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
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500" />
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

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 10h16M4 14h16M4 18h16"
      />
    </svg>
  );
}

function EyeIcon({ className }: { className?: string }) {
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

function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
