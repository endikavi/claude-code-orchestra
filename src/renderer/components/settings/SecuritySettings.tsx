import { useTranslation } from 'react-i18next';
import { IpAccessControl } from './IpAccessControl';
import { AuthSettings } from './AuthSettings';
import { RateLimitSettings } from './RateLimitSettings';
import { AuditLogSettings } from './AuditLogSettings';

export function SecuritySettings() {
  const { t } = useTranslation();

  // Check if we're in web client
  const isWebVersion = (window as unknown as { __WEB_VERSION__?: boolean }).__WEB_VERSION__;
  if (isWebVersion) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        {t('security.notAvailableInWeb')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('security.description')}</p>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          <IpAccessControl />
          <AuthSettings />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <RateLimitSettings />
          <AuditLogSettings />
        </div>
      </div>
    </div>
  );
}
