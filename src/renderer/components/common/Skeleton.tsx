interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

const shimmerStyle = {
  backgroundImage:
    'linear-gradient(90deg, transparent 0%, var(--color-border-default) 50%, transparent 100%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
};

function SkeletonBase({ className, variant = 'text', width, height }: SkeletonProps) {
  const variantClasses = {
    text: 'rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {
    ...shimmerStyle,
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`bg-[var(--color-bg-elevated)] dark:bg-neutral-800 ${variantClasses[variant]} ${className ?? ''}`}
      style={style}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="p-4 rounded border border-[var(--color-border-default)] bg-white dark:bg-neutral-800">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <SkeletonBase height={16} width="60%" />
          <SkeletonBase height={12} width="85%" />
        </div>
        <SkeletonBase variant="text" height={12} width={48} />
      </div>
      <div className="flex items-center gap-4 mt-3">
        <SkeletonBase height={10} width={64} />
        <SkeletonBase height={10} width={48} />
      </div>
    </div>
  );
}

function SkeletonProjectCard() {
  return (
    <div className="p-2 rounded-md border border-transparent bg-white/50 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <SkeletonBase variant="rectangular" width={4} height={16} className="flex-shrink-0" />
        <SkeletonBase height={14} width="55%" />
      </div>
      <div className="mt-1 pl-3">
        <SkeletonBase height={10} width="75%" />
      </div>
    </div>
  );
}

function SkeletonList({
  count = 5,
  variant = 'conversation',
}: {
  count?: number;
  variant?: 'conversation' | 'project';
}) {
  const Card = variant === 'project' ? SkeletonProjectCard : SkeletonCard;
  return (
    <div className="space-y-2">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} />
      ))}
    </div>
  );
}

export const Skeleton = Object.assign(SkeletonBase, {
  Card: SkeletonCard,
  ProjectCard: SkeletonProjectCard,
  List: SkeletonList,
});
