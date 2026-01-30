import React, { useEffect, useRef } from 'react';

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
      className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 animate-fadeIn"
      onClick={handleOverlayClick}
    >
      <div
        className={`bg-gray-50 dark:bg-neutral-900 rounded shadow-xl w-full ${widthClasses[width]} mx-4 animate-slideIn max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-neutral-700 flex-shrink-0">
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
