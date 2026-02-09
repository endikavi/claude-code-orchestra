import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  vertical?: boolean;
}

export function Tabs({ tabs, activeTab, onChange, vertical = false }: TabsProps) {
  if (vertical) {
    return (
      <div className="flex flex-col overflow-y-auto max-h-[400px] min-w-[180px] border-r border-gray-200 dark:border-neutral-700 pr-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-2 py-2 text-sm font-medium transition-colors rounded mb-1 text-left ${
              activeTab === tab.id
                ? 'bg-primary-muted text-primary border-l-2 border-primary'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800/50 hover:text-neutral-800 dark:hover:text-white'
            }`}
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex border-b border-gray-200 dark:border-neutral-700 mb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:border-gray-300 dark:hover:border-neutral-600'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
