import type { SplitTab } from '@shared/types';
import { TerminalView } from './TerminalView';
import { ShellTerminalView } from './ShellTerminalView';

interface SplitTerminalViewProps {
  split: SplitTab;
}

export function SplitTerminalView({ split }: SplitTerminalViewProps) {
  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {split.leftType === 'instance' ? (
          <TerminalView key={split.leftInstanceId} instanceId={split.leftInstanceId} />
        ) : (
          <ShellTerminalView key={split.leftInstanceId} shellId={split.leftInstanceId} />
        )}
      </div>

      {/* Divider */}
      <div className="w-px bg-claude-tan/50 dark:bg-gray-600 flex-shrink-0" />

      {/* Right panel */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {split.rightType === 'instance' ? (
          <TerminalView key={split.rightInstanceId} instanceId={split.rightInstanceId} />
        ) : (
          <ShellTerminalView key={split.rightInstanceId} shellId={split.rightInstanceId} />
        )}
      </div>
    </div>
  );
}
