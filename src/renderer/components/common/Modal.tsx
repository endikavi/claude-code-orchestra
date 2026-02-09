import React, { useEffect, useRef } from 'react';
import { CloseIcon } from '@renderer/components/icons';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export function Modal({ title, onClose, children, width = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
    '3xl': 'max-w-5xl',
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-[var(--color-bg-overlay)] flex items-center justify-center z-50 animate-fadeIn"
      onClick={handleOverlayClick}
    >
      <div
        className={`bg-[var(--color-bg-subtle)] dark:bg-neutral-900 rounded-lg shadow-xl w-full ${widthClasses[width]} mx-4 animate-slideIn max-h-[90vh] flex flex-col border border-[var(--color-border-default)]`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-default)] flex-shrink-0">
          <h2 className="text-lg font-semibold text-neutral-800 dark:text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
