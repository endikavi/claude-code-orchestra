import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import { WarningIcon } from '@renderer/components/icons';

interface UnsavedChangesDialogProps {
  fileName: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({
  fileName,
  onSave,
  onDiscard,
  onCancel,
}: UnsavedChangesDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal title={t('files.unsavedChanges')} onClose={onCancel} width="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <WarningIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('files.unsavedChangesMessage', { name: fileName })}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-neutral-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {t('files.dontSave')}
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-sm rounded bg-primary hover:bg-primary-hover text-white transition-colors"
          >
            {t('files.save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
