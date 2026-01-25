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
      <div className="flex flex-col overflow-y-auto max-h-[400px] min-w-[180px] border-r border-claude-tan/30 dark:border-gray-700 pr-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-lg mb-1 text-left ${
              activeTab === tab.id
                ? 'bg-claude-orange/20 text-claude-orange border-l-2 border-claude-orange'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-gray-800 dark:hover:text-white'
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
    <div className="flex border-b border-claude-tan/30 dark:border-gray-700 mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === tab.id
              ? 'border-claude-orange text-claude-orange'
              : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
