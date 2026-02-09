import { useTranslation } from 'react-i18next';
import { useProxyStore } from '../../stores/proxyStore';
import { CrosshairIcon, TerminalIcon } from '@renderer/components/icons';

interface InspectorToolbarProps {
  viewId: string;
}

export function InspectorToolbar({ viewId }: InspectorToolbarProps) {
  const { t } = useTranslation();
  const { getDevToolsState, toggleInspector, toggleConsolePanel, getConsoleCounts } =
    useProxyStore();

  const devToolsState = getDevToolsState(viewId);
  const counts = getConsoleCounts(viewId);

  return (
    <div className="flex items-center gap-1 px-1">
      {/* Inspector toggle */}
      <button
        onClick={() => toggleInspector(viewId)}
        className={`
          p-1.5 rounded transition-colors
          ${
            devToolsState.inspectorEnabled
              ? 'bg-sky-500 text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
          }
        `}
        title={t(
          'devtools.inspector.toggle',
          devToolsState.inspectorEnabled ? 'Disable inspector' : 'Enable inspector'
        )}
      >
        <CrosshairIcon className="w-4 h-4" />
      </button>

      {/* Console toggle */}
      <button
        onClick={() => toggleConsolePanel(viewId)}
        className={`
          relative p-1.5 rounded transition-colors
          ${
            devToolsState.consolePanelOpen
              ? 'bg-sky-500 text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
          }
        `}
        title={t(
          'devtools.console.toggle',
          devToolsState.consolePanelOpen ? 'Hide console' : 'Show console'
        )}
      >
        <TerminalIcon className="w-4 h-4" />

        {/* Badge for errors/warnings when console is closed */}
        {!devToolsState.consolePanelOpen && (counts.error > 0 || counts.warn > 0) && (
          <span
            className={`
            absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center
            text-[9px] font-bold rounded-full
            ${counts.error > 0 ? 'bg-red-500 text-white' : 'bg-yellow-500 text-yellow-900'}
          `}
          >
            {counts.error > 0 ? counts.error : counts.warn}
          </span>
        )}
      </button>
    </div>
  );
}
