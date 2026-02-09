import React from 'react';

interface IconButtonProps {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}

export function IconButton({ onClick, title, children, active, className }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 rounded-md transition-colors flex items-center justify-center ${
        active
          ? 'bg-primary-muted text-primary'
          : 'text-neutral-600 dark:text-neutral-400 hover:bg-gray-200 dark:hover:bg-neutral-800'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
