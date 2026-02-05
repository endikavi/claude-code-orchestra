import { useState } from 'react';
import { Tabs, type Tab } from '../common/Tabs';
import { ConversationHistory } from '../conversations/ConversationHistory';
import { TaskBoardView } from './TaskBoardView';

interface ProjectContentTabsProps {
  projectId: string;
  onNewConversation: () => void;
}

export function ProjectContentTabs({ projectId, onNewConversation }: ProjectContentTabsProps) {
  const [activeTab, setActiveTab] = useState('tasks');

  const tabs: Tab[] = [
    { id: 'tasks', label: 'Tareas' },
    { id: 'history', label: 'Historial' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'history' ? (
          <ConversationHistory projectId={projectId} onNewConversation={onNewConversation} />
        ) : (
          <TaskBoardView projectId={projectId} />
        )}
      </div>
    </div>
  );
}
