import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import type { JiraIssue } from '@shared/types/jira';
import type { Project } from '@shared/types';

interface JiraImportModalProps {
  project: Project;
  onClose: () => void;
  onImported: (count: number) => void;
}

export function JiraImportModal({ project, onClose, onImported }: JiraImportModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: string[];
    errors: string[];
  } | null>(null);

  const projectKey = project.jiraConfig?.projectKey;

  const loadIssues = useCallback(async () => {
    if (!projectKey) {
      setError('Jira project key not configured');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.jira.searchIssues(
        projectKey,
        project.jiraConfig?.importFilter || 'mine'
      );

      if (result.success && result.issues) {
        setIssues(result.issues);
      } else {
        setError(result.error || 'Failed to load issues');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [projectKey, project.jiraConfig?.importFilter]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  const filteredIssues = issues.filter((issue) => {
    if (!filter) return true;
    const searchLower = filter.toLowerCase();
    return (
      issue.key.toLowerCase().includes(searchLower) ||
      issue.fields.summary.toLowerCase().includes(searchLower)
    );
  });

  const toggleSelect = (issueId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(issueId)) {
      newSelected.delete(issueId);
    } else {
      newSelected.add(issueId);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredIssues.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIssues.map((i) => i.id)));
    }
  };

  const handleImport = async () => {
    const issuesToImport = issues.filter((i) => selectedIds.has(i.id));
    if (issuesToImport.length === 0) return;

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const result = await window.electronAPI.jira.importIssues(project.id, issuesToImport);

      if (result.success) {
        setImportResult({
          imported: result.imported || [],
          errors: result.errors || [],
        });

        if (result.imported && result.imported.length > 0) {
          onImported(result.imported.length);
        }
      } else {
        setError(result.error || 'Failed to import issues');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import issues');
    } finally {
      setImporting(false);
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case 'highest':
      case 'critical':
        return 'text-red-500';
      case 'high':
        return 'text-orange-500';
      case 'medium':
        return 'text-yellow-500';
      case 'low':
        return 'text-blue-500';
      case 'lowest':
        return 'text-gray-400';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusColor = (statusCategory?: string) => {
    switch (statusCategory?.toLowerCase()) {
      case 'done':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'indeterminate':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      case 'new':
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400';
    }
  };

  return (
    <Modal title={t('jira.import.title', 'Import from Jira')} onClose={onClose} width="2xl">
      <div className="space-y-4">
        {/* Header Info */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('jira.import.description', 'Select issues to import as Ralph Tasks')}
          </p>
          {projectKey && (
            <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
              {projectKey}
            </span>
          )}
        </div>

        {/* Search/Filter */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('jira.import.searchPlaceholder', 'Search issues...')}
            className="w-full pl-10 pr-3 py-2 text-sm border border-gray-200 dark:border-neutral-600 rounded-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div className="space-y-2">
            {importResult.imported.length > 0 && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  {t('jira.import.successCount', 'Successfully imported {{count}} issues', {
                    count: importResult.imported.length,
                  })}
                </p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                  {importResult.imported.join(', ')}
                </p>
              </div>
            )}
            {importResult.errors.length > 0 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                  {t('jira.import.errorsCount', '{{count}} issues had errors', {
                    count: importResult.errors.length,
                  })}
                </p>
                <ul className="text-xs text-yellow-600 dark:text-yellow-500 mt-1 list-disc list-inside">
                  {importResult.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Issues List */}
        <div className="border border-gray-200 dark:border-neutral-600 rounded-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner className="w-6 h-6 text-gray-400" />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                {t('jira.import.loading', 'Loading issues...')}
              </span>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <InboxIcon className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm">
                {filter
                  ? t('jira.import.noResults', 'No issues match your search')
                  : t('jira.import.noIssues', 'No issues found')}
              </p>
            </div>
          ) : (
            <>
              {/* Select All Header */}
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-600">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filteredIssues.length && filteredIssues.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {selectedIds.size > 0
                    ? t('jira.import.selectedCount', '{{count}} selected', {
                        count: selectedIds.size,
                      })
                    : t('jira.import.selectAll', 'Select all')}
                </span>
              </div>

              {/* Issues */}
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-neutral-700">
                {filteredIssues.map((issue) => (
                  <label
                    key={issue.id}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors ${
                      selectedIds.has(issue.id) ? 'bg-sky-50 dark:bg-sky-900/10' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(issue.id)}
                      onChange={() => toggleSelect(issue.id)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sky-500 focus:ring-sky-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-medium text-blue-600 dark:text-blue-400">
                          {issue.key}
                        </span>
                        {issue.fields.issuetype?.name && (
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-400 rounded">
                            {issue.fields.issuetype.name}
                          </span>
                        )}
                        {issue.fields.priority?.name && (
                          <span
                            className={`text-xs font-medium ${getPriorityColor(issue.fields.priority.name)}`}
                          >
                            {issue.fields.priority.name}
                          </span>
                        )}
                        {issue.fields.status?.name && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(issue.fields.status.statusCategory?.name)}`}
                          >
                            {issue.fields.status.name}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 dark:text-white mt-1 line-clamp-2">
                        {issue.fields.summary}
                      </p>
                      {issue.fields.assignee && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {t('jira.import.assignee', 'Assignee')}:{' '}
                          {issue.fields.assignee.displayName}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-2">
          <button
            type="button"
            onClick={loadIssues}
            disabled={loading}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          >
            {t('common.refresh', 'Refresh')}
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
            >
              {t('common.close', 'Close')}
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedIds.size === 0 || importing}
              className={`px-4 py-2 text-sm rounded-sm transition-colors ${
                selectedIds.size > 0 && !importing
                  ? 'bg-sky-500 hover:bg-sky-600 text-white'
                  : 'bg-gray-300 dark:bg-neutral-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              }`}
            >
              {importing ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  {t('jira.import.importing', 'Importing...')}
                </span>
              ) : (
                t('jira.import.importSelected', 'Import Selected ({{count}})', {
                  count: selectedIds.size,
                })
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
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

function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );
}
