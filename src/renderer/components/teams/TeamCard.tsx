import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TeamMemberBadge } from './TeamMemberBadge';
import type { TrackedTeam } from '@shared/types';

interface TeamCardProps {
  team: TrackedTeam;
}

export function TeamCard({ team }: TeamCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  const elapsed = useMemo(() => {
    const diff = Date.now() - team.createdAt;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('context.time.justNow');
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }, [team.createdAt, t]);

  return (
    <div className="bg-white dark:bg-neutral-800 rounded border border-gray-200 dark:border-neutral-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-neutral-700/50 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className="h-4 w-4 text-sky-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
            {team.name}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
            {team.members.length} {t('teams.members')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500">{elapsed}</span>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-neutral-700 p-3 space-y-2">
          {team.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{team.description}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {team.members.map((member, idx) => (
              <TeamMemberBadge key={member.agentId || idx} member={member} isLeader={idx === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
