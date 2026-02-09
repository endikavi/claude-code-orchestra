import { useToastStore } from '@renderer/stores/toastStore';
import { CheckIcon, CloseIcon, WarningIcon, InfoIcon } from '@renderer/components/icons';

const typeConfig = {
  success: {
    icon: CheckIcon,
    bg: 'bg-green-50 dark:bg-green-950/50',
    border: 'border-green-500',
    text: 'text-green-800 dark:text-green-200',
  },
  error: {
    icon: CloseIcon,
    bg: 'bg-red-50 dark:bg-red-950/50',
    border: 'border-red-500',
    text: 'text-red-800 dark:text-red-200',
  },
  warning: {
    icon: WarningIcon,
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    border: 'border-amber-500',
    text: 'text-amber-800 dark:text-amber-200',
  },
  info: {
    icon: InfoIcon,
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    border: 'border-blue-500',
    text: 'text-blue-800 dark:text-blue-200',
  },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col-reverse gap-2">
      {toasts.map((toast) => {
        const config = typeConfig[toast.type];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-md border-l-4 shadow-md min-w-[280px] max-w-[400px] animate-slideInRight ${config.bg} ${config.border}`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${config.text}`} />
            <span className={`text-sm flex-1 ${config.text}`}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className={`p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 shrink-0 ${config.text}`}
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
