import { useState } from 'react';
import { Modal } from '../common/Modal';
import { useRalphTaskStore } from '../../stores/ralphTaskStore';

interface AddTaskModalProps {
  projectId: string;
  onClose: () => void;
}

export function AddTaskModal({ projectId, onClose }: AddTaskModalProps) {
  const { createTask } = useRalphTaskStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await createTask({
        projectId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Nueva tarea" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Nombre
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Implement feature X"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-claude-orange focus:border-transparent"
            autoFocus
            required
          />
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Descripcion (opcional)
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed description of what needs to be done..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-claude-orange focus:border-transparent resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!name.trim() || isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-claude-orange hover:bg-claude-orange/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creando...' : 'Crear tarea'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
