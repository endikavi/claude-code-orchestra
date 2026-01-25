import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import * as https from 'https';
import { IPC_CHANNELS } from '../ipc/channels';

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

/**
 * Service for handling application updates.
 * Supports both electron-updater (for packaged apps) and
 * manual GitHub release checking (for dev/portable installations).
 */
export class UpdateService {
  private static instance: UpdateService | null = null;
  private mainWindow: BrowserWindow | null = null;
  private isPackaged: boolean;
  private checkInProgress = false;

  // GitHub repo info
  private readonly owner = 'endikavi';
  private readonly repo = 'claude-code-orchestra';

  private constructor() {
    this.isPackaged = app.isPackaged;
    this.setupAutoUpdater();
    this.setupIpcHandlers();
  }

  public static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService();
    }
    return UpdateService.instance;
  }

  public setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private setupAutoUpdater(): void {
    // Configure auto-updater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set GitHub as the update provider
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: this.owner,
      repo: this.repo,
    });

    // Event handlers
    autoUpdater.on('checking-for-update', () => {
      console.log('[UpdateService] Checking for update...');
      this.sendToRenderer('update:checking');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      console.log('[UpdateService] Update available:', info.version);
      this.sendToRenderer('update:available', {
        version: info.version,
        releaseNotes: info.releaseNotes,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      console.log('[UpdateService] No update available. Current version:', info.version);
      this.sendToRenderer('update:not-available', {
        version: info.version,
      });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.sendToRenderer('update:progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      console.log('[UpdateService] Update downloaded:', info.version);
      this.sendToRenderer('update:downloaded', {
        version: info.version,
      });

      // Show dialog to user
      if (this.mainWindow) {
        dialog
          .showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: `Version ${info.version} has been downloaded.`,
            detail: 'The update will be installed when you restart the application.',
            buttons: ['Restart Now', 'Later'],
            defaultId: 0,
          })
          .then((result) => {
            if (result.response === 0) {
              autoUpdater.quitAndInstall();
            }
          });
      }
    });

    autoUpdater.on('error', (error: Error) => {
      console.error('[UpdateService] Update error:', error.message);
      this.sendToRenderer('update:error', {
        message: error.message,
      });
    });
  }

  private setupIpcHandlers(): void {
    // Check for updates
    ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async (): Promise<UpdateCheckResult> => {
      return this.checkForUpdates();
    });

    // Download update (for auto-updater)
    ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async (): Promise<void> => {
      if (this.isPackaged) {
        await autoUpdater.downloadUpdate();
      }
    });

    // Install update (quit and install)
    ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, (): void => {
      if (this.isPackaged) {
        autoUpdater.quitAndInstall();
      }
    });

    // Get current version
    ipcMain.handle(IPC_CHANNELS.UPDATE_GET_VERSION, (): string => {
      return app.getVersion();
    });
  }

  /**
   * Check for updates - uses electron-updater for packaged apps,
   * falls back to GitHub API for development builds.
   */
  public async checkForUpdates(): Promise<UpdateCheckResult> {
    if (this.checkInProgress) {
      return {
        updateAvailable: false,
        currentVersion: app.getVersion(),
        latestVersion: app.getVersion(),
      };
    }

    this.checkInProgress = true;

    try {
      const currentVersion = app.getVersion();

      if (this.isPackaged) {
        // Use electron-updater for packaged apps
        const result = await autoUpdater.checkForUpdates();

        if (result && result.updateInfo) {
          const updateAvailable = this.compareVersions(currentVersion, result.updateInfo.version);

          return {
            updateAvailable,
            currentVersion,
            latestVersion: result.updateInfo.version,
            releaseNotes:
              typeof result.updateInfo.releaseNotes === 'string'
                ? result.updateInfo.releaseNotes
                : undefined,
            releaseUrl: `https://github.com/${this.owner}/${this.repo}/releases/tag/v${result.updateInfo.version}`,
            publishedAt: result.updateInfo.releaseDate,
          };
        }
      }

      // Fall back to GitHub API check (for dev builds or if auto-updater fails)
      return this.checkGitHubRelease(currentVersion);
    } catch (error) {
      console.error('[UpdateService] Error checking for updates:', error);

      // Try GitHub API as fallback
      try {
        return await this.checkGitHubRelease(app.getVersion());
      } catch {
        return {
          updateAvailable: false,
          currentVersion: app.getVersion(),
          latestVersion: app.getVersion(),
        };
      }
    } finally {
      this.checkInProgress = false;
    }
  }

  /**
   * Check GitHub releases API directly.
   * Used for dev builds and as a fallback.
   */
  private async checkGitHubRelease(currentVersion: string): Promise<UpdateCheckResult> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.owner}/${this.repo}/releases/latest`,
        method: 'GET',
        headers: {
          'User-Agent': `Orchestra/${currentVersion}`,
          Accept: 'application/vnd.github.v3+json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 404) {
              // No releases yet
              resolve({
                updateAvailable: false,
                currentVersion,
                latestVersion: currentVersion,
              });
              return;
            }

            if (res.statusCode !== 200) {
              reject(new Error(`GitHub API returned ${res.statusCode}`));
              return;
            }

            const release = JSON.parse(data) as {
              tag_name: string;
              body: string;
              html_url: string;
              published_at: string;
            };

            const latestVersion = release.tag_name.replace(/^v/, '');
            const updateAvailable = this.compareVersions(currentVersion, latestVersion);

            resolve({
              updateAvailable,
              currentVersion,
              latestVersion,
              releaseNotes: release.body,
              releaseUrl: release.html_url,
              publishedAt: release.published_at,
            });
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }

  /**
   * Compare semantic versions.
   * Returns true if latestVersion > currentVersion.
   */
  private compareVersions(current: string, latest: string): boolean {
    // Remove 'v' prefix and pre-release suffix for comparison
    const cleanCurrent = current.replace(/^v/, '').split('-')[0];
    const cleanLatest = latest.replace(/^v/, '').split('-')[0];

    const currentParts = cleanCurrent.split('.').map(Number);
    const latestParts = cleanLatest.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const currentPart = currentParts[i] || 0;
      const latestPart = latestParts[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    // If versions are equal, check pre-release
    // A release version is newer than a pre-release
    const currentHasPrerelease = current.includes('-');
    const latestHasPrerelease = latest.includes('-');

    if (currentHasPrerelease && !latestHasPrerelease) {
      return true; // current is pre-release, latest is stable
    }

    return false;
  }

  /**
   * Send event to renderer process.
   */
  private sendToRenderer(channel: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * Check for updates on app startup (with delay).
   */
  public scheduleStartupCheck(delayMs = 30000): void {
    setTimeout(() => {
      this.checkForUpdates()
        .then((result) => {
          if (result.updateAvailable) {
            this.sendToRenderer('update:startup-available', result);
          }
        })
        .catch((error) => {
          console.error('[UpdateService] Startup update check failed:', error);
        });
    }, delayMs);
  }
}

export const updateService = UpdateService.getInstance();
