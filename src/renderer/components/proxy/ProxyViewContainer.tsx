import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useProxyStore } from '../../stores/proxyStore';
import { ProxyView } from './ProxyView';
import { GlobeIcon, XIcon } from '@renderer/components/icons';

interface ProxyViewContainerProps {
  /** Filter views by instance ID (optional) */
  instanceId?: string;
}

/**
 * Container component that renders proxy views with tabs
 * when there are multiple views open.
 */
export function ProxyViewContainer({ instanceId }: ProxyViewContainerProps) {
  const { t } = useTranslation();
  const { proxyViews, activeProxyViewId, selectProxyView, closeProxyView } = useProxyStore(
    useShallow((s) => ({
      proxyViews: s.proxyViews,
      activeProxyViewId: s.activeProxyViewId,
      selectProxyView: s.selectProxyView,
      closeProxyView: s.closeProxyView,
    }))
  );

  // Get views, optionally filtered by instance
  const views = useMemo(() => {
    const allViews = Array.from(proxyViews.values());
    if (instanceId) {
      return allViews.filter((v) => v.instanceId === instanceId);
    }
    return allViews;
  }, [proxyViews, instanceId]);

  // Get active view
  const activeView = useMemo(() => {
    if (!activeProxyViewId) return views[0];
    return views.find((v) => v.id === activeProxyViewId) || views[0];
  }, [views, activeProxyViewId]);

  if (views.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-neutral-950 text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <GlobeIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('proxy.noViews', 'No preview views open')}</p>
          <p className="text-sm mt-1 opacity-75">
            {t('proxy.noViewsHint', 'Start a dev server and use preview_open to see it here')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs (only show if multiple views) */}
      {views.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-neutral-800 border-b border-gray-200 dark:border-neutral-700 overflow-x-auto">
          {views.map((view) => (
            <button
              key={view.id}
              onClick={() => selectProxyView(view.id)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded text-sm whitespace-nowrap
                ${
                  view.id === activeView?.id
                    ? 'bg-white dark:bg-neutral-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
                }
              `}
            >
              <GlobeIcon className="w-3.5 h-3.5" />
              <span>{view.title || `:${view.port}`}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeProxyView(view.id);
                }}
                className="ml-1 p-0.5 rounded hover:bg-gray-300 dark:hover:bg-neutral-600"
              >
                <XIcon className="w-3 h-3" />
              </button>
            </button>
          ))}
        </div>
      )}

      {/* Active view */}
      {activeView && (
        <div className="flex-1 overflow-hidden">
          <ProxyView key={activeView.id} view={activeView} />
        </div>
      )}
    </div>
  );
}
