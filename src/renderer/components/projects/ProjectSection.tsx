import React from 'react';
import { useTranslation } from 'react-i18next';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useUIStore } from '../../stores/uiStore';

interface ProjectSectionProps {
  sectionId: string;
  title: string;
  projectCount: number;
  children: React.ReactNode;
  projectIds?: string[];
  isDraggable?: boolean;
  badge?: React.ReactNode;
}

export function ProjectSection({
  sectionId,
  title,
  projectCount,
  children,
  projectIds = [],
  isDraggable = false,
  badge,
}: ProjectSectionProps) {
  const { t } = useTranslation();
  const { collapsedSections, toggleSectionCollapsed } = useUIStore();

  const isCollapsed =
    sectionId === 'local'
      ? collapsedSections.local
      : (collapsedSections.clusters[sectionId] ?? false);

  const handleToggle = () => {
    toggleSectionCollapsed(sectionId);
  };

  return (
    <div className="mb-2">
      {/* Section Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
        title={isCollapsed ? t('sidebar.expandSection') : t('sidebar.collapseSection')}
      >
        <div className="flex items-center gap-2">
          {/* Chevron */}
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="uppercase tracking-wider">{title}</span>
          {badge}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">{projectCount}</span>
      </button>

      {/* Section Content */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
        }`}
      >
        {isDraggable && projectIds.length > 0 ? (
          <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-1 pt-1">{children}</div>
          </SortableContext>
        ) : (
          <div className="space-y-1 pt-1">{children}</div>
        )}
      </div>
    </div>
  );
}

// Sortable wrapper for individual project items
interface SortableProjectItemProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function SortableProjectItem({ id, children, disabled = false }: SortableProjectItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: disabled ? 'default' : 'grab',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
