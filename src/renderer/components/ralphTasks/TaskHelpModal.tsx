import { useState } from 'react';
import { Modal } from '../common/Modal';
import { useRalphTaskStore } from '../../stores/ralphTaskStore';
import type { RalphTask } from '@shared/types';

interface TaskHelpModalProps {
  task: RalphTask;
  reason: string;
}

export function TaskHelpModal({ task, reason }: TaskHelpModalProps) {
  const { respondToHelp, clearHelpRequest } = useRalphTaskStore();
  const [response, setResponse] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!response.trim()) return;

    setIsSubmitting(true);
    try {
      await respondToHelp(task.id, response.trim());
    } catch (error) {
      console.error('Failed to respond:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Help Requested" onClose={clearHelpRequest}>
      <div className="space-y-4">
        {/* Task info */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-white text-sm">{task.name}</h4>
          {task.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{task.description}</p>
          )}
        </div>

        {/* Help reason */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Claude needs help:
          </h4>
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
            {reason}
          </div>
        </div>

        {/* Response form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="response"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Your response:
            </label>
            <textarea
              id="response"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Provide guidance or answer the question..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-claude-orange focus:border-transparent resize-none"
              autoFocus
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={clearHelpRequest}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!response.trim() || isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-claude-orange hover:bg-claude-orange/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Sending...' : 'Send & Resume'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
