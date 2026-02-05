import type { TeamMember } from '@shared/types';

interface TeamMemberBadgeProps {
  member: TeamMember;
  isLeader?: boolean;
}

export function TeamMemberBadge({ member, isLeader }: TeamMemberBadgeProps) {
  const typeColors: Record<string, string> = {
    'general-purpose': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    Explore: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
    Plan: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    Bash: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  };

  const colorClass =
    typeColors[member.agentType] ||
    'bg-gray-100 text-gray-700 dark:bg-neutral-700 dark:text-gray-300';
  const statusColor =
    member.status === 'active'
      ? 'bg-green-500'
      : member.status === 'idle'
        ? 'bg-yellow-500'
        : 'bg-gray-400';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full ${colorClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
      <span>{member.name}</span>
      {isLeader && (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      )}
      <span className="text-[10px] opacity-60">{member.agentType}</span>
    </span>
  );
}
