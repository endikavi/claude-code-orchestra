import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { app } from 'electron';
import type { ModelInfo, ModelDownloadProgress, ModelState } from '@shared/types/vectorSearch';
import { VECTOR_MODELS } from '@shared/types/vectorSearch';

// Cache directory for models
const getModelsDir = (): string => {
  const userDataPath = app?.getPath('userData') || process.env.APPDATA || '';
  return path.join(userDataPath, 'models');
};

export class ModelDownloader extends EventEmitter {
  private modelsDir: string;
  private activeDownloads: Map<string, AbortController> = new Map();
  private modelStates: Map<string, ModelState> = new Map();

  constructor() {
    super();
    this.modelsDir = getModelsDir();
    this.ensureModelsDir();
    this.initializeModelStates();
  }

  private ensureModelsDir(): void {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  private initializeModelStates(): void {
    for (const model of VECTOR_MODELS) {
      const modelPath = this.getModelPath(model.id);
      const exists = fs.existsSync(modelPath);
      this.modelStates.set(model.id, {
        id: model.id,
        status: exists ? 'downloaded' : 'not_downloaded',
        downloadedAt: exists ? fs.statSync(modelPath).mtimeMs : undefined,
      });
    }
  }

  getModelPath(modelId: string): string {
    const model = VECTOR_MODELS.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    return path.join(this.modelsDir, model.filename);
  }

  getModelState(modelId: string): ModelState | undefined {
    return this.modelStates.get(modelId);
  }

  getAllModelStates(): Record<string, ModelState> {
    const result: Record<string, ModelState> = {};
    for (const [id, state] of this.modelStates) {
      result[id] = state;
    }
    return result;
  }

  isModelDownloaded(modelId: string): boolean {
    const state = this.modelStates.get(modelId);
    return state?.status === 'downloaded' || state?.status === 'loaded';
  }

  async downloadModel(modelId: string): Promise<string> {
    const model = VECTOR_MODELS.find((m) => m.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const modelPath = this.getModelPath(modelId);

    // Check if already downloaded
    if (fs.existsSync(modelPath)) {
      const stats = fs.statSync(modelPath);
      // Verify size matches expected
      if (Math.abs(stats.size - model.size) < model.size * 0.1) {
        this.updateModelState(modelId, { status: 'downloaded', downloadedAt: stats.mtimeMs });
        return modelPath;
      }
      // Size mismatch, re-download
      fs.unlinkSync(modelPath);
    }

    // Check if already downloading
    if (this.activeDownloads.has(modelId)) {
      throw new Error(`Model ${modelId} is already being downloaded`);
    }

    // Start download
    const abortController = new AbortController();
    this.activeDownloads.set(modelId, abortController);
    this.updateModelState(modelId, { status: 'downloading', progress: 0 });

    try {
      await this.downloadFromHuggingFace(model, modelPath, abortController.signal);
      this.updateModelState(modelId, { status: 'downloaded', downloadedAt: Date.now() });
      return modelPath;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.updateModelState(modelId, { status: 'not_downloaded' });
        // Clean up partial download
        if (fs.existsSync(modelPath + '.partial')) {
          fs.unlinkSync(modelPath + '.partial');
        }
        throw new Error('Download cancelled');
      }
      this.updateModelState(modelId, {
        status: 'error',
        error: (error as Error).message,
      });
      throw error;
    } finally {
      this.activeDownloads.delete(modelId);
    }
  }

  cancelDownload(modelId: string): boolean {
    const controller = this.activeDownloads.get(modelId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  private async downloadFromHuggingFace(
    model: ModelInfo,
    destPath: string,
    signal: AbortSignal
  ): Promise<void> {
    // Build HuggingFace URL
    const url = `https://huggingface.co/${model.huggingFaceRepo}/resolve/main/${model.filename}`;

    return new Promise((resolve, reject) => {
      const partialPath = destPath + '.partial';
      const file = fs.createWriteStream(partialPath);

      const handleError = (error: Error) => {
        file.close();
        if (fs.existsSync(partialPath)) {
          fs.unlinkSync(partialPath);
        }
        reject(error);
      };

      const makeRequest = (requestUrl: string, redirectCount = 0): void => {
        if (redirectCount > 5) {
          handleError(new Error('Too many redirects'));
          return;
        }

        if (signal.aborted) {
          handleError(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          return;
        }

        const parsedUrl = new URL(requestUrl);
        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: {
            'User-Agent': 'Claude-Orchestra/1.0',
          },
        };

        const req = https.get(options, (res) => {
          // Handle redirects
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
            const redirectUrl = res.headers.location;
            if (redirectUrl) {
              makeRequest(redirectUrl, redirectCount + 1);
              return;
            }
          }

          if (res.statusCode !== 200) {
            handleError(new Error(`HTTP ${res.statusCode}: Failed to download ${model.filename}`));
            return;
          }

          const totalBytes = parseInt(res.headers['content-length'] || String(model.size), 10);
          let downloadedBytes = 0;
          let lastProgressUpdate = Date.now();
          let lastDownloadedBytes = 0;

          res.on('data', (chunk: Buffer) => {
            if (signal.aborted) {
              res.destroy();
              handleError(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
              return;
            }

            downloadedBytes += chunk.length;
            file.write(chunk);

            // Update progress every 100ms
            const now = Date.now();
            if (now - lastProgressUpdate >= 100) {
              const elapsed = (now - lastProgressUpdate) / 1000;
              const bytesPerSecond = (downloadedBytes - lastDownloadedBytes) / elapsed;
              const remainingBytes = totalBytes - downloadedBytes;
              const estimatedRemainingMs = (remainingBytes / bytesPerSecond) * 1000;

              const progress: ModelDownloadProgress = {
                modelId: model.id,
                downloadedBytes,
                totalBytes,
                percentage: Math.round((downloadedBytes / totalBytes) * 100),
                speedBps: Math.round(bytesPerSecond),
                estimatedRemainingMs: Math.round(estimatedRemainingMs),
              };

              this.emit('downloadProgress', progress);
              this.updateModelState(model.id, { progress: progress.percentage });

              lastProgressUpdate = now;
              lastDownloadedBytes = downloadedBytes;
            }
          });

          res.on('end', () => {
            file.close(() => {
              // Verify file size
              const stats = fs.statSync(partialPath);
              if (Math.abs(stats.size - totalBytes) > 1024) {
                handleError(new Error('Downloaded file size mismatch'));
                return;
              }

              // Verify SHA256 if provided
              if (model.sha256) {
                const hash = crypto.createHash('sha256');
                const fileContent = fs.readFileSync(partialPath);
                hash.update(fileContent);
                const actualHash = hash.digest('hex');
                if (actualHash.toLowerCase() !== model.sha256.toLowerCase()) {
                  handleError(new Error('SHA256 checksum mismatch'));
                  return;
                }
              }

              // Move to final path
              fs.renameSync(partialPath, destPath);
              resolve();
            });
          });

          res.on('error', handleError);
        });

        req.on('error', handleError);

        // Handle abort
        signal.addEventListener('abort', () => {
          req.destroy();
        });
      };

      makeRequest(url);
    });
  }

  private updateModelState(modelId: string, updates: Partial<ModelState>): void {
    const current = this.modelStates.get(modelId) || { id: modelId, status: 'not_downloaded' };
    const newState = { ...current, ...updates };
    this.modelStates.set(modelId, newState);
    this.emit('modelStateChange', modelId, newState);
  }

  deleteModel(modelId: string): boolean {
    const modelPath = this.getModelPath(modelId);
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
      this.updateModelState(modelId, { status: 'not_downloaded', downloadedAt: undefined });
      return true;
    }
    return false;
  }

  getModelsDirectory(): string {
    return this.modelsDir;
  }
}

// Singleton instance
let instance: ModelDownloader | null = null;

export function getModelDownloader(): ModelDownloader {
  if (!instance) {
    instance = new ModelDownloader();
  }
  return instance;
}
