import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { isElectronAvailable } from '../utils/paths';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type DashboardNotification,
  type NotificationType,
  type NotificationPriority,
  type NotificationAction,
  type NotificationPreferences,
  type NotificationFilterOptions,
  type NotificationStats,
  type HookNotificationInput,
} from '@shared/types';
import { DataStore } from './DataStore';

// BrowserWindow type for optional Electron dependency
type BrowserWindowType = import('electron').BrowserWindow;

// Lazy load Electron Notification class
// Returns the Notification constructor or null if not available
function getElectronNotification(): typeof import('electron').Notification | null {
  if (!isElectronAvailable()) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Notification } = require('electron');
    return Notification;
  } catch {
    return null;
  }
}

// Max notifications to keep in memory
const MAX_NOTIFICATIONS = 500;

// Notification expiry cleanup interval (5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// Deduplication window in milliseconds (5 seconds)
const DEDUP_WINDOW_MS = 5000;

export class NotificationManager extends EventEmitter {
  private static instance: NotificationManager | null = null;
  private notifications: Map<string, DashboardNotification> = new Map();
  private preferences: NotificationPreferences;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindowType | null = null;

  // Deduplication cache: key -> timestamp of last notification
  private recentNotifications: Map<string, number> = new Map();

  private constructor() {
    super();
    this.preferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };
    this.startCleanupInterval();
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  /**
   * Set the main window for IPC communication
   */
  public setMainWindow(window: BrowserWindowType): void {
    this.mainWindow = window;
  }

  /**
   * Start periodic cleanup of expired notifications
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredNotifications();
    }, CLEANUP_INTERVAL);
  }

  /**
   * Clean up expired notifications
   */
  private cleanupExpiredNotifications(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, notification] of this.notifications) {
      if (notification.expiresAt && notification.expiresAt < now) {
        this.notifications.delete(id);
        cleaned++;
      }
    }

    // Also trim to max size
    if (this.notifications.size > MAX_NOTIFICATIONS) {
      const sorted = [...this.notifications.entries()].sort(
        (a, b) => b[1].createdAt - a[1].createdAt
      );
      const toKeep = sorted.slice(0, MAX_NOTIFICATIONS);
      this.notifications = new Map(toKeep);
      cleaned += sorted.length - MAX_NOTIFICATIONS;
    }

    if (cleaned > 0) {
      console.log(`[NotificationManager] Cleaned up ${cleaned} notifications`);
    }

    // Also clean up old deduplication entries
    const dedupNow = Date.now();
    for (const [key, timestamp] of this.recentNotifications) {
      if (dedupNow - timestamp > DEDUP_WINDOW_MS) {
        this.recentNotifications.delete(key);
      }
    }
  }

  /**
   * Generate a deduplication key for a notification
   */
  private getDeduplicationKey(params: {
    type: NotificationType;
    instanceId?: string;
    projectId?: string;
  }): string {
    return `${params.type}:${params.instanceId || ''}:${params.projectId || ''}`;
  }

  /**
   * Check if a notification should be deduplicated (skip creation)
   */
  private shouldDeduplicate(key: string): boolean {
    const lastTime = this.recentNotifications.get(key);
    const now = Date.now();

    if (lastTime && now - lastTime < DEDUP_WINDOW_MS) {
      return true; // Duplicate within window
    }

    this.recentNotifications.set(key, now);
    return false;
  }

  /**
   * Get project name from DataStore, with fallback
   */
  private getProjectName(projectId?: string): string {
    if (!projectId) return 'Unknown Project';
    try {
      const dataStore = DataStore.getInstance();
      const project = dataStore.getProjectById(projectId);
      return project?.name || 'Unknown Project';
    } catch {
      return 'Unknown Project';
    }
  }

  /**
   * Build a default title based on notification type and project name
   */
  private buildDefaultTitle(type: NotificationType, projectName: string): string {
    switch (type) {
      case 'task_completed':
        return `Task Completed - ${projectName}`;
      case 'task_error':
        return `Error - ${projectName}`;
      case 'permission_request':
        return `Permission Required - ${projectName}`;
      case 'instance_stopped':
        return `Instance Stopped - ${projectName}`;
      case 'instance_started':
        return `Instance Started - ${projectName}`;
      case 'tool_blocked':
        return `Tool Blocked - ${projectName}`;
      case 'collaboration_alert':
        return `Collaboration Alert - ${projectName}`;
      default:
        return `Claude - ${projectName}`;
    }
  }

  /**
   * Build a default message based on notification type
   */
  private buildDefaultMessage(
    type: NotificationType,
    projectName: string,
    instanceId?: string
  ): string {
    const instanceRef = instanceId ? ` (${instanceId.substring(0, 8)}...)` : '';
    switch (type) {
      case 'task_completed':
        return `A task has completed for ${projectName}${instanceRef}`;
      case 'task_error':
        return `An error occurred in ${projectName}${instanceRef}`;
      case 'permission_request':
        return `Claude needs permission to continue${instanceRef}`;
      case 'instance_stopped':
        return `Instance has stopped for ${projectName}${instanceRef}`;
      case 'instance_started':
        return `Instance has started for ${projectName}${instanceRef}`;
      default:
        return `Notification from ${projectName}${instanceRef}`;
    }
  }

  /**
   * Destroy the notification manager
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.notifications.clear();
    NotificationManager.instance = null;
  }

  /**
   * Update notification preferences
   */
  public setPreferences(prefs: Partial<NotificationPreferences>): void {
    this.preferences = { ...this.preferences, ...prefs };
    this.emit('preferences:changed', this.preferences);
  }

  /**
   * Get notification preferences
   */
  public getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Check if notifications are currently allowed (respects DND)
   */
  private isNotificationAllowed(): boolean {
    if (!this.preferences.enabled) return false;

    if (this.preferences.doNotDisturb) return false;

    if (this.preferences.doNotDisturbSchedule?.enabled) {
      const now = new Date();
      const hour = now.getHours();
      const { startHour, endHour } = this.preferences.doNotDisturbSchedule;

      if (startHour <= endHour) {
        // Same day schedule (e.g., 9-17)
        if (hour >= startHour && hour < endHour) return false;
      } else {
        // Overnight schedule (e.g., 22-6)
        if (hour >= startHour || hour < endHour) return false;
      }
    }

    return true;
  }

  /**
   * Check if a specific notification type should show
   */
  private shouldShowType(type: NotificationType): {
    enabled: boolean;
    native: boolean;
    sound: boolean;
  } {
    const typePrefs = this.preferences.typePreferences[type];
    if (!typePrefs) {
      return { enabled: true, native: false, sound: false };
    }
    return typePrefs;
  }

  /**
   * Create a new notification
   */
  public create(params: {
    type: NotificationType;
    priority?: NotificationPriority;
    title: string;
    message: string;
    instanceId?: string;
    projectId?: string;
    sessionId?: string;
    actionRequired?: boolean;
    actions?: NotificationAction[];
    metadata?: Record<string, unknown>;
    expiresInMs?: number;
    skipDeduplication?: boolean;
  }): DashboardNotification | null {
    // Check for deduplication (unless explicitly skipped)
    if (!params.skipDeduplication) {
      const dedupKey = this.getDeduplicationKey({
        type: params.type,
        instanceId: params.instanceId,
        projectId: params.projectId,
      });

      if (this.shouldDeduplicate(dedupKey)) {
        console.log(`[NotificationManager] Skipping duplicate notification: ${dedupKey}`);
        return null;
      }
    }

    const notification: DashboardNotification = {
      id: randomUUID(),
      type: params.type,
      priority: params.priority || 'normal',
      title: params.title,
      message: params.message,
      instanceId: params.instanceId,
      projectId: params.projectId,
      sessionId: params.sessionId,
      actionRequired: params.actionRequired || false,
      actions: params.actions,
      metadata: params.metadata,
      read: false,
      dismissed: false,
      createdAt: Date.now(),
      expiresAt: params.expiresInMs ? Date.now() + params.expiresInMs : undefined,
    };

    this.notifications.set(notification.id, notification);

    // Check if we should show this notification
    if (this.isNotificationAllowed()) {
      const typePrefs = this.shouldShowType(params.type);

      if (typePrefs.enabled) {
        // Send to renderer
        if (this.preferences.showInAppNotifications) {
          this.sendToRenderer('notification:new', notification);
        }

        // Show native notification
        if (this.preferences.showNativeNotifications && typePrefs.native) {
          this.showNativeNotification(notification);
        }

        // Emit event for other handlers
        this.emit('notification:created', notification);
      }
    }

    return notification;
  }

  /**
   * Show a native OS notification
   */
  private showNativeNotification(notification: DashboardNotification): void {
    const ElectronNotification = getElectronNotification();

    // Skip native notifications in headless mode
    if (!ElectronNotification) {
      console.log('[NotificationManager] Native notifications not available in headless mode');
      return;
    }

    if (!ElectronNotification.isSupported()) {
      console.log('[NotificationManager] Native notifications not supported');
      return;
    }

    const nativeNotification = new ElectronNotification({
      title: notification.title,
      body: notification.message,
      urgency: notification.priority === 'urgent' ? 'critical' : 'normal',
      silent: !this.preferences.playSound,
    });

    nativeNotification.on('click', () => {
      // Bring main window to front
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.focus();
      }

      // Emit click event
      this.emit('notification:clicked', notification);
      this.sendToRenderer('notification:clicked', notification.id);
    });

    nativeNotification.show();
  }

  /**
   * Send event to renderer process
   */
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  /**
   * Handle notification from Claude CLI hook
   */
  public handleHookNotification(
    input: HookNotificationInput | null | undefined,
    instanceId?: string,
    projectId?: string
  ): DashboardNotification | null {
    // Map hook notification type to dashboard type
    let type: NotificationType = 'custom';
    let priority: NotificationPriority = 'normal';

    // Handle null/undefined input gracefully
    const level = input?.level;
    const inputType = input?.type;

    if (level === 'error') {
      type = 'task_error';
      priority = 'high';
    } else if (level === 'warning') {
      priority = 'normal';
    }

    if (inputType === 'permission_request') {
      type = 'permission_request';
      priority = 'high';
    }

    // Get project name for context-rich notifications
    const projectName = this.getProjectName(projectId);

    // Build informative title and message
    const title = input?.title || this.buildDefaultTitle(type, projectName);
    const message = input?.message || this.buildDefaultMessage(type, projectName, instanceId);

    return this.create({
      type,
      priority,
      title,
      message,
      instanceId,
      projectId,
      sessionId: input?.session_id,
      actionRequired: type === 'permission_request',
      metadata: { projectName },
    });
  }

  /**
   * Mark a notification as read
   */
  public markRead(id: string): boolean {
    const notification = this.notifications.get(id);
    if (!notification) return false;

    notification.read = true;
    this.sendToRenderer('notification:updated', notification);
    this.emit('notification:read', notification);
    return true;
  }

  /**
   * Mark all notifications as read
   */
  public markAllRead(): number {
    let count = 0;
    for (const notification of this.notifications.values()) {
      if (!notification.read) {
        notification.read = true;
        count++;
      }
    }

    if (count > 0) {
      this.sendToRenderer('notification:allRead');
      this.emit('notification:allRead');
    }

    return count;
  }

  /**
   * Dismiss a notification
   */
  public dismiss(id: string): boolean {
    const notification = this.notifications.get(id);
    if (!notification) return false;

    notification.dismissed = true;
    this.sendToRenderer('notification:dismissed', id);
    this.emit('notification:dismissed', notification);
    return true;
  }

  /**
   * Delete a notification
   */
  public delete(id: string): boolean {
    const deleted = this.notifications.delete(id);
    if (deleted) {
      this.sendToRenderer('notification:deleted', id);
      this.emit('notification:deleted', id);
    }
    return deleted;
  }

  /**
   * Clear all notifications
   */
  public clearAll(): void {
    this.notifications.clear();
    this.sendToRenderer('notification:cleared');
    this.emit('notification:cleared');
  }

  /**
   * Get a notification by ID
   */
  public get(id: string): DashboardNotification | undefined {
    return this.notifications.get(id);
  }

  /**
   * Get all notifications with optional filtering
   */
  public getAll(options: NotificationFilterOptions = {}): DashboardNotification[] {
    let results = [...this.notifications.values()];

    // Apply filters
    if (options.types?.length) {
      results = results.filter((n) => options.types!.includes(n.type));
    }

    if (options.priorities?.length) {
      results = results.filter((n) => options.priorities!.includes(n.priority));
    }

    if (options.projectId) {
      results = results.filter((n) => n.projectId === options.projectId);
    }

    if (options.instanceId) {
      results = results.filter((n) => n.instanceId === options.instanceId);
    }

    if (options.unreadOnly) {
      results = results.filter((n) => !n.read);
    }

    if (options.startDate) {
      results = results.filter((n) => n.createdAt >= options.startDate!);
    }

    if (options.endDate) {
      results = results.filter((n) => n.createdAt <= options.endDate!);
    }

    // Sort by created date (newest first)
    results.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get notification statistics
   */
  public getStats(): NotificationStats {
    const stats: NotificationStats = {
      total: this.notifications.size,
      unread: 0,
      byType: {} as Record<NotificationType, number>,
      byPriority: {} as Record<NotificationPriority, number>,
    };

    for (const notification of this.notifications.values()) {
      if (!notification.read) {
        stats.unread++;
      }

      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
      stats.byPriority[notification.priority] = (stats.byPriority[notification.priority] || 0) + 1;
    }

    return stats;
  }

  /**
   * Create convenience notification methods
   */
  public notifyPermissionRequest(
    instanceId: string,
    projectId: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): DashboardNotification | null {
    const projectName = this.getProjectName(projectId);
    return this.create({
      type: 'permission_request',
      priority: 'high',
      title: `Permission Required - ${projectName}`,
      message: `Claude wants to use ${toolName}`,
      instanceId,
      projectId,
      actionRequired: true,
      metadata: { toolName, toolInput, projectName },
      actions: [
        { id: 'approve', label: 'Approve', type: 'primary', action: 'approve_permission' },
        { id: 'deny', label: 'Deny', type: 'danger', action: 'deny_permission' },
      ],
    });
  }

  public notifyTaskCompleted(
    instanceId: string,
    projectId: string,
    sessionId?: string,
    costUsd?: number
  ): DashboardNotification | null {
    const projectName = this.getProjectName(projectId);
    const costInfo = costUsd ? ` Cost: $${costUsd.toFixed(4)}` : '';
    return this.create({
      type: 'task_completed',
      priority: 'normal',
      title: `Task Completed - ${projectName}`,
      message: `Task finished successfully.${costInfo}`,
      instanceId,
      projectId,
      sessionId,
      metadata: { costUsd, projectName },
    });
  }

  public notifyTaskError(
    instanceId: string,
    projectId: string,
    error: string
  ): DashboardNotification | null {
    const projectName = this.getProjectName(projectId);
    return this.create({
      type: 'task_error',
      priority: 'high',
      title: `Error - ${projectName}`,
      message: error,
      instanceId,
      projectId,
      metadata: { projectName },
    });
  }

  public notifyToolBlocked(
    instanceId: string,
    projectId: string,
    toolName: string,
    reason: string
  ): DashboardNotification | null {
    const projectName = this.getProjectName(projectId);
    return this.create({
      type: 'tool_blocked',
      priority: 'normal',
      title: `Tool Blocked - ${projectName}`,
      message: `${toolName} was blocked: ${reason}`,
      instanceId,
      projectId,
      metadata: { toolName, reason, projectName },
    });
  }

  public notifyInstanceStarted(
    instanceId: string,
    projectId: string,
    projectName?: string
  ): DashboardNotification | null {
    const resolvedProjectName = projectName || this.getProjectName(projectId);
    return this.create({
      type: 'instance_started',
      priority: 'low',
      title: `Instance Started - ${resolvedProjectName}`,
      message: `New Claude instance started for ${resolvedProjectName}`,
      instanceId,
      projectId,
      expiresInMs: 30000, // 30 seconds
      metadata: { projectName: resolvedProjectName },
    });
  }

  public notifyInstanceStopped(
    instanceId: string,
    projectId: string,
    reason?: string
  ): DashboardNotification | null {
    const projectName = this.getProjectName(projectId);
    return this.create({
      type: 'instance_stopped',
      priority: 'low',
      title: `Instance Stopped - ${projectName}`,
      message: reason || `Claude instance has stopped for ${projectName}`,
      instanceId,
      projectId,
      metadata: { reason, projectName },
    });
  }

  public notifyCollaborationAlert(
    instanceId: string,
    projectId: string,
    conflictFiles: string[]
  ): DashboardNotification | null {
    const projectName = this.getProjectName(projectId);
    return this.create({
      type: 'collaboration_alert',
      priority: 'normal',
      title: `Collaboration Alert - ${projectName}`,
      message: `Another instance may be modifying: ${conflictFiles.slice(0, 3).join(', ')}${conflictFiles.length > 3 ? '...' : ''}`,
      instanceId,
      projectId,
      metadata: { conflictFiles, projectName },
    });
  }

  public notifySystem(
    title: string,
    message: string,
    priority: NotificationPriority = 'normal'
  ): DashboardNotification | null {
    return this.create({
      type: 'system',
      priority,
      title,
      message,
      skipDeduplication: true, // System notifications should always go through
    });
  }
}

// Export singleton getter
export function getNotificationManager(): NotificationManager {
  return NotificationManager.getInstance();
}
