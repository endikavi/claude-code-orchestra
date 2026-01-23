import type { SplitTab } from '@shared/types';
import { TerminalView } from './TerminalView';
import { ShellTerminalView } from './ShellTerminalView';
import { ProxyView, ProxyViewContainer } from '../proxy';
import { useProxyStore } from '../../stores/proxyStore';

interface SplitTerminalViewProps {
  split: SplitTab;
}

function SplitPanel({ type, id }: { type: 'instance' | 'shell' | 'proxy'; id: string }) {
  const { proxyViews } = useProxyStore();

  if (type === 'instance') {
    return <TerminalView key={id} instanceId={id} />;
  }
  if (type === 'shell') {
    return <ShellTerminalView key={id} shellId={id} />;
  }
  if (type === 'proxy') {
    // For proxy, id is the proxyViewId
    const view = proxyViews.get(id);
    if (view) {
      return <ProxyView key={id} view={view} />;
    }
    return <ProxyViewContainer instanceId={id} />;
  }
  return null;
}

export function SplitTerminalView({ split }: SplitTerminalViewProps) {
  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <SplitPanel type={split.leftType} id={split.leftInstanceId} />
      </div>

      {/* Divider */}
      <div className="w-px bg-claude-tan/50 dark:bg-gray-600 flex-shrink-0" />

      {/* Right panel */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <SplitPanel type={split.rightType} id={split.rightInstanceId} />
      </div>
    </div>
  );
}
