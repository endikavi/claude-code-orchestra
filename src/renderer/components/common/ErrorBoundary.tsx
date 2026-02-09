import { Component, ErrorInfo, ReactNode } from 'react';
import i18n from 'i18next';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 bg-red-50 dark:bg-red-900/20 rounded m-3">
          <div className="text-red-600 dark:text-red-400 mb-3">
            <svg
              className="w-16 h-16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-white mb-2">
            {i18n.t('errorBoundary.title')}
          </h2>
          <p className="text-neutral-600 dark:text-neutral-300 mb-3 text-center max-w-md">
            {i18n.t('errorBoundary.description')}
          </p>
          {this.state.error && (
            <details className="mb-3 text-sm text-neutral-500 dark:text-neutral-400 max-w-lg">
              <summary className="cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-200">
                {i18n.t('errorBoundary.errorDetails')}
              </summary>
              <pre className="mt-2 p-2 bg-gray-100 dark:bg-neutral-900 rounded-sm overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              onClick={this.handleRetry}
              className="px-3 py-2 bg-sky-500 text-white rounded-sm hover:bg-sky-600 transition-colors"
            >
              {i18n.t('errorBoundary.tryAgain')}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-2 bg-gray-200 dark:bg-neutral-800 text-neutral-800 dark:text-white rounded-sm hover:bg-gray-300 dark:hover:bg-neutral-700 transition-colors"
            >
              {i18n.t('errorBoundary.reloadPage')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC for wrapping functional components
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}
