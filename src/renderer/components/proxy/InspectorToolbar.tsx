import { useTranslation } from 'react-i18next';
import { useProxyStore } from '../../stores/proxyStore';

// Inline icons
function CrosshairIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <line x1="12" y1="2" x2="12" y2="6" strokeWidth={2} />
      <line x1="12" y1="18" x2="12" y2="22" strokeWidth={2} />
      <line x1="2" y1="12" x2="6" y2="12" strokeWidth={2} />
      <line x1="18" y1="12" x2="22" y2="12" strokeWidth={2} />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

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
              ? 'bg-claude-orange text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
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
              ? 'bg-claude-orange text-white'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
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
