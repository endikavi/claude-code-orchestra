// Notification priority levels
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

// Notification types
export type NotificationType =
  | 'permission_request' // Claude needs permission for an action
  | 'task_completed' // Task/instance completed
  | 'task_error' // Task/instance errored
  | 'tool_blocked' // Hook blocked a tool use
  | 'instance_started' // New instance started
  | 'instance_stopped' // Instance stopped
  | 'context_ready' // Context fetched and ready
  | 'collaboration_alert' // Another instance working on same files
  | 'system' // General system notification
  | 'custom'; // Custom notification from skill/hook

// Notification payload
export interface DashboardNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  instanceId?: string;
  projectId?: string;
  sessionId?: string;
  actionRequired?: boolean; // If true, notification persists until action
  actions?: NotificationAction[];
  metadata?: Record<string, unknown>;
  read: boolean;
  dismissed: boolean;
  createdAt: number;
  expiresAt?: number; // Auto-dismiss after this time
}

// Notification action button
export interface NotificationAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger';
  action: NotificationActionType;
  payload?: Record<string, unknown>;
}

// Available notification actions
export type NotificationActionType =
  | 'approve_permission'
  | 'deny_permission'
  | 'view_instance'
  | 'view_project'
  | 'dismiss'
  | 'open_url'
  | 'custom';

// Notification preferences
export interface NotificationPreferences {
  enabled: boolean;
  showNativeNotifications: boolean;
  showInAppNotifications: boolean;
  playSound: boolean;
  soundVolume: number; // 0-100

  // Per-type preferences
  typePreferences: {
    [K in NotificationType]?: {
      enabled: boolean;
      native: boolean;
      sound: boolean;
    };
  };

  // Do not disturb
  doNotDisturb: boolean;
  doNotDisturbSchedule?: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number; // 0-23
  };
}

// Default notification preferences
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  showNativeNotifications: true,
  showInAppNotifications: true,
  playSound: false,
  soundVolume: 50,
  typePreferences: {
    permission_request: { enabled: true, native: true, sound: true },
    task_completed: { enabled: true, native: true, sound: false },
    task_error: { enabled: true, native: true, sound: true },
    tool_blocked: { enabled: true, native: true, sound: false },
    instance_started: { enabled: false, native: false, sound: false },
    instance_stopped: { enabled: true, native: false, sound: false },
    context_ready: { enabled: false, native: false, sound: false },
    collaboration_alert: { enabled: true, native: true, sound: false },
    system: { enabled: true, native: true, sound: false },
    custom: { enabled: true, native: false, sound: false },
  },
  doNotDisturb: false,
};

// Hook notification input (from Claude CLI Notification hook)
export interface HookNotificationInput {
  session_id: string;
  type?: string;
  title?: string;
  message: string;
  level?: 'info' | 'warning' | 'error';
}

// Notification filter options
export interface NotificationFilterOptions {
  types?: NotificationType[];
  priorities?: NotificationPriority[];
  projectId?: string;
  instanceId?: string;
  unreadOnly?: boolean;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
}

// Notification stats
export interface NotificationStats {
  total: number;
  unread: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
}
