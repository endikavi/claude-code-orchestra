import { useTranslation } from 'react-i18next';
import { useTeamStore } from '../../stores/teamStore';
import { TeamCard } from './TeamCard';

interface TeamPanelProps {
  onClose?: () => void;
}

export function TeamPanel({ onClose }: TeamPanelProps) {
  const { t } = useTranslation();
  const { getAllTeams, getTeamCount, getTotalMembers, isLoading } = useTeamStore();
  const teams = getAllTeams();
  const teamCount = getTeamCount();
  const totalMembers = getTotalMembers();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-neutral-700 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('teams.title')}</h3>
          {teamCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-semibold bg-sky-500 text-white rounded-full">
              {teamCount}
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-sm hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
          >
            <svg
              className="h-5 w-5 text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Stats bar */}
      {teamCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-neutral-800 text-xs text-gray-500 dark:text-gray-400">
          <span>
            {teamCount} {t('teams.teamsCount')}
          </span>
          <span>
            {totalMembers} {t('teams.membersTotal')}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-sky-500 border-t-transparent rounded-full" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('teams.empty')}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('teams.emptyHint')}</p>
          </div>
        ) : (
          teams.map((team) => <TeamCard key={team.name} team={team} />)
        )}
      </div>
    </div>
  );
}
