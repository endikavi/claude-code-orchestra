import React, { useEffect, useRef } from 'react';

interface MenuItem {
  label?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  type?: 'separator';
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }

      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-claude-beige dark:bg-gray-800 border border-claude-tan/30 dark:border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[160px] animate-fadeIn"
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => {
        if (item.type === 'separator') {
          return (
            <div key={index} className="my-1 border-t border-claude-tan/30 dark:border-gray-700" />
          );
        }

        return (
          <button
            key={index}
            onClick={() => {
              item.onClick?.();
              onClose();
            }}
            className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors ${
              item.danger
                ? 'text-red-500 dark:text-red-400 hover:bg-red-500/20'
                : 'text-gray-700 dark:text-gray-300 hover:bg-claude-tan/20 dark:hover:bg-gray-700'
            }`}
          >
            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
