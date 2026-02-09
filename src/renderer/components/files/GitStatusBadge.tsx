interface GitStatusBadgeProps {
  status: string;
  isStaged?: boolean;
}

export function GitStatusBadge({ status, isStaged }: GitStatusBadgeProps) {
  const { label, className } = getBadgeInfo(status, isStaged);

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded ${className}`}
    >
      {label}
    </span>
  );
}

function getBadgeInfo(status: string, isStaged?: boolean): { label: string; className: string } {
  switch (status) {
    case 'M':
      return {
        label: 'M',
        className: isStaged
          ? 'bg-green-500/20 text-green-600 dark:text-green-400'
          : 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
      };
    case 'A':
      return {
        label: 'A',
        className: 'bg-green-500/20 text-green-600 dark:text-green-400',
      };
    case 'D':
      return {
        label: 'D',
        className: 'bg-red-500/20 text-red-600 dark:text-red-400',
      };
    case 'R':
      return {
        label: 'R',
        className: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
      };
    case '?':
      return {
        label: '?',
        className: 'bg-gray-500/20 text-gray-500 dark:text-gray-400',
      };
    default:
      return {
        label: status,
        className: 'bg-gray-500/20 text-gray-500 dark:text-gray-400',
      };
  }
}
