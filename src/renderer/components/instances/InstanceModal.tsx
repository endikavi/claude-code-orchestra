import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInstanceStore } from '../../stores/instanceStore';
import { Modal } from '../common/Modal';
import type { ClaudeModel, InstanceMode } from '@shared/types';

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
  const { createInstance } = useInstanceStore();

  const [model, setModel] = useState<ClaudeModel>('sonnet');
  const [planMode, setPlanMode] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User-created instances are always interactive (terminal mode)
  const mode: InstanceMode = 'interactive';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await createInstance({
        projectId,
        model,
        mode,
        planMode,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('instance.failedToCreate'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title={t('instance.newInstance')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
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
        </div>

        {/* Plan Mode */}
        <div>
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
            disabled={isSubmitting}
            className="px-4 py-2 text-sm bg-claude-orange hover:bg-claude-tan text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
