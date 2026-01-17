import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { webAPI, isAuthenticated, login, logout, connectSocket } from './WebAPIBridge';
import App from '../renderer/App';

// Install webAPI as window.electronAPI for compatibility
(window as unknown as { electronAPI: typeof webAPI }).electronAPI = webAPI;

export function WebApp() {
  const { t } = useTranslation();
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Listen for auth events
    const handleAuthRequired = () => {
      setAuthenticated(false);
      setError('Session expired. Please login again.');
    };

    const handleAuthKicked = (event: Event) => {
      setAuthenticated(false);
      const customEvent = event as CustomEvent<string>;
      setError(customEvent.detail || 'You have been disconnected.');
    };

    // Listen for logout request from TitleBar
    const handleWebLogout = () => {
      void logout().then(() => {
        setAuthenticated(false);
      });
    };

    window.addEventListener('auth:required', handleAuthRequired);
    window.addEventListener('auth:kicked', handleAuthKicked);
    window.addEventListener('web:logout', handleWebLogout);

    // If already authenticated, ensure socket is connected
    if (isAuthenticated()) {
      connectSocket();
    }

    return () => {
      window.removeEventListener('auth:required', handleAuthRequired);
      window.removeEventListener('auth:kicked', handleAuthKicked);
      window.removeEventListener('web:logout', handleWebLogout);
    };
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    void login(password).then((success) => {
      if (success) {
        setAuthenticated(true);
        setPassword('');
      } else {
        setError('Invalid password');
      }

      setLoading(false);
    });
  };

  // Show login screen if not authenticated
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-claude-cream to-claude-light-tan dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-xl p-8">
            {/* Logo/Title */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Orchestra</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('remoteAccess.description')}
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  {t('remoteAccess.password')}
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('remoteAccess.password')}
                  className="w-full px-4 py-3 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-claude-orange focus:border-transparent"
                  autoFocus
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 px-4 text-sm font-medium text-white bg-claude-orange hover:bg-claude-tan rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  'Login'
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
            Orchestra - Remote Access
          </p>
        </div>
      </div>
    );
  }

  // Show main app when authenticated
  return <App />;
}
