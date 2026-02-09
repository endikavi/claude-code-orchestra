import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CopyIcon,
  DocumentTextIcon,
  TerminalIcon,
  CrosshairIcon,
} from '@renderer/components/icons';
import type { ElementInfo, ContextMenuAction } from '@shared/types/devtools';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface DevToolsContextMenuProps {
  position: ContextMenuPosition | null;
  element: ElementInfo | null;
  onAction: (action: ContextMenuAction) => void;
  onClose: () => void;
}

export function DevToolsContextMenu({
  position,
  element,
  onAction,
  onClose,
}: DevToolsContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<ContextMenuPosition | null>(null);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (!position || !menuRef.current) {
      setAdjustedPosition(null);
      return;
    }

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth - 10) {
      x = Math.max(10, viewportWidth - rect.width - 10);
    }

    // Adjust vertical position
    if (y + rect.height > viewportHeight - 10) {
      y = Math.max(10, viewportHeight - rect.height - 10);
    }

    setAdjustedPosition({ x, y });
  }, [position]);

  // Close on click outside or escape
  useEffect(() => {
    if (!position) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [position, onClose]);

  const handleAction = useCallback(
    (action: ContextMenuAction) => {
      onAction(action);
      onClose();
    },
    [onAction, onClose]
  );

  if (!position) return null;

  const displayPos = adjustedPosition || position;

  // Format element info for display
  const elementLabel = element
    ? `<${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
        element.classNames.length > 0 ? `.${element.classNames.slice(0, 2).join('.')}` : ''
      }>`
    : null;

  const menuItems: Array<{
    action: ContextMenuAction;
    label: string;
    icon: React.ReactNode;
    disabled?: boolean;
    divider?: boolean;
  }> = [
    {
      action: 'copy-html',
      label: t('devtools.contextMenu.copyHtml', 'Copy HTML'),
      icon: <CopyIcon className="w-4 h-4" />,
      disabled: !element,
    },
    {
      action: 'copy-text',
      label: t('devtools.contextMenu.copyText', 'Copy text content'),
      icon: <DocumentTextIcon className="w-4 h-4" />,
      disabled: !element || !element.textContent,
    },
    {
      action: 'send-to-terminal',
      label: t('devtools.contextMenu.sendToTerminal', 'Send to terminal'),
      icon: <TerminalIcon className="w-4 h-4" />,
      disabled: !element,
      divider: true,
    },
    {
      action: 'inspect',
      label: t('devtools.contextMenu.inspect', 'Inspect element'),
      icon: <CrosshairIcon className="w-4 h-4" />,
      disabled: !element,
    },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-48 py-1 bg-white dark:bg-neutral-800 rounded shadow-lg border border-gray-200 dark:border-neutral-700"
      style={{ left: displayPos.x, top: displayPos.y }}
    >
      {/* Element label */}
      {elementLabel && (
        <div className="px-3 py-1.5 text-xs font-mono text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-neutral-700 truncate">
          {elementLabel}
        </div>
      )}

      {/* Menu items */}
      {menuItems.map((item, index) => (
        <div key={item.action}>
          {item.divider && index > 0 && (
            <div className="my-1 border-t border-gray-200 dark:border-neutral-700" />
          )}
          <button
            onClick={() => handleAction(item.action)}
            disabled={item.disabled}
            className={`
              w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left
              ${
                item.disabled
                  ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700'
              }
            `}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

// Hook to manage context menu state
export function useDevToolsContextMenu() {
  const [contextMenu, setContextMenu] = useState<{
    position: ContextMenuPosition | null;
    element: ElementInfo | null;
  }>({
    position: null,
    element: null,
  });

  const showContextMenu = useCallback(
    (position: ContextMenuPosition, element: ElementInfo | null) => {
      setContextMenu({ position, element });
    },
    []
  );

  const hideContextMenu = useCallback(() => {
    setContextMenu({ position: null, element: null });
  }, []);

  return {
    contextMenuPosition: contextMenu.position,
    contextMenuElement: contextMenu.element,
    showContextMenu,
    hideContextMenu,
  };
}
