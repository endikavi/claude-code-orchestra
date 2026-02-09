import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-3">{icon}</div>
      <h3 className="text-lg font-medium text-neutral-700 dark:text-neutral-300 mb-2">{title}</h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-500 mb-4 max-w-sm">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-3 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-medium rounded-md transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
