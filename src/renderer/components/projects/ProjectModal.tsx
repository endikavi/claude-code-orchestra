import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../../stores/projectStore';
import { useUIStore } from '../../stores/uiStore';
import { useConversationStore } from '../../stores/conversationStore';
import { Modal } from '../common/Modal';
import { ImportSessionsModal } from '../conversations/ImportSessionsModal';

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

  const existingProject = editingProject ? projects.find((p) => p.id === editingProject) : null;

  const [name, setName] = useState(existingProject?.name || '');
  const [path, setPath] = useState(existingProject?.path || '');
  const [description, setDescription] = useState(existingProject?.description || '');
  const [color, setColor] = useState(existingProject?.color || PROJECT_COLORS[0]);
  const [skipPermissions, setSkipPermissions] = useState(existingProject?.skipPermissions || false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const { loadConversations } = useConversationStore();

  const isEditing = !!existingProject;

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
      if (isEditing && existingProject) {
        await updateProject({
          ...existingProject,
          name: name.trim(),
          path: path.trim(),
          description: description.trim() || undefined,
          color,
          skipPermissions,
        });
      } else {
        await createProject({
          name: name.trim(),
          path: path.trim(),
          description: description.trim() || undefined,
          color,
          skipPermissions,
        });
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
    </Modal>
  );
}
