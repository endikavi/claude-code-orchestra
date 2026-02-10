import { WebSocketServer, WebSocket } from 'ws';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as http from 'http';
import { IPC_CHANNELS } from '../ipc/channels';
import { getIdeStateManager } from './IdeStateManager';
import type {
  IdeLockFile,
  IdeOpenFileParams,
  IdeOpenDiffParams,
  IdeFileOpenEvent,
  IdeDiffRequestEvent,
} from '@shared/types/ide';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingDiff {
  ws: WebSocket;
  rpcId: string | number;
  resolve: (result: { diff_applied: boolean }) => void;
}

class IdeWebSocketServer {
  private wss: WebSocketServer | null = null;
  private server: http.Server | null = null;
  private port: number = 0;
  private authToken: string = '';
  private lockFilePath: string = '';
  private mainWindow: BrowserWindow | null = null;
  private pendingDiffs: Map<string, PendingDiff> = new Map();
  private started = false;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  async start(): Promise<void> {
    if (this.started) return;

    this.authToken = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      this.server = http.createServer();
      this.wss = new WebSocketServer({
        server: this.server,
        verifyClient: (info: { req: http.IncomingMessage }, cb: (result: boolean) => void) => {
          const authHeader = info.req.headers['x-claude-code-ide-authorization'];
          cb(authHeader === this.authToken);
        },
      });

      this.wss.on('connection', (ws: WebSocket) => {
        console.log('[IdeWS] Claude Code connected');

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as JsonRpcRequest;
            this.handleMessage(ws, message);
          } catch (error) {
            console.error('[IdeWS] Failed to parse message:', error);
          }
        });

        ws.on('close', () => {
          console.log('[IdeWS] Claude Code disconnected');
          // Clean up any pending diffs for this connection
          for (const [requestId, pending] of this.pendingDiffs.entries()) {
            if (pending.ws === ws) {
              this.pendingDiffs.delete(requestId);
            }
          }
        });

        ws.on('error', (error) => {
          console.error('[IdeWS] WebSocket error:', error);
        });
      });

      // Listen on random port, localhost only
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server!.address();
        if (typeof address === 'object' && address !== null) {
          this.port = address.port;
        }
        this.started = true;

        // Write lock file
        this.writeLockFile();

        console.log(`[IdeWS] IDE WebSocket server started on 127.0.0.1:${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('[IdeWS] Server error:', error);
        reject(error);
      });
    });
  }

  stop(): void {
    if (!this.started) return;

    this.removeLockFile();

    if (this.wss) {
      // Close all connections
      for (const client of this.wss.clients) {
        client.close();
      }
      this.wss.close();
      this.wss = null;
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.pendingDiffs.clear();
    this.started = false;
  }

  resolveDiff(requestId: string, applied: boolean): void {
    const pending = this.pendingDiffs.get(requestId);
    if (!pending) {
      console.warn(`[IdeWS] No pending diff for request ${requestId}`);
      return;
    }

    this.pendingDiffs.delete(requestId);

    // Send the JSON-RPC response
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id: pending.rpcId,
      result: { diff_applied: applied },
    };

    if (pending.ws.readyState === WebSocket.OPEN) {
      pending.ws.send(JSON.stringify(response));
    }
  }

  private handleMessage(ws: WebSocket, message: JsonRpcRequest): void {
    if (message.jsonrpc !== '2.0') {
      this.sendError(ws, message.id ?? null, -32600, 'Invalid Request');
      return;
    }

    const { method, params, id } = message;

    switch (method) {
      case 'openFile':
        this.handleOpenFile(ws, id ?? null, params as IdeOpenFileParams);
        break;
      case 'openDiff':
        this.handleOpenDiff(ws, id ?? null, params as IdeOpenDiffParams);
        break;
      case 'getWorkspaceFolders':
        this.handleGetWorkspaceFolders(ws, id ?? null);
        break;
      case 'getOpenEditors':
        this.handleGetOpenEditors(ws, id ?? null);
        break;
      case 'getCurrentSelection':
        this.handleGetCurrentSelection(ws, id ?? null);
        break;
      case 'getDiagnostics':
        this.handleGetDiagnostics(ws, id ?? null);
        break;
      default:
        this.sendError(ws, id ?? null, -32601, `Method not found: ${method}`);
    }
  }

  private handleOpenFile(
    ws: WebSocket,
    id: string | number | null,
    params: IdeOpenFileParams
  ): void {
    const event: IdeFileOpenEvent = {
      filePath: params.filePath,
      line: params.line,
      column: params.column,
    };

    // Track in state manager
    getIdeStateManager().addOpenEditor(params.filePath);

    // Emit to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.IDE_FILE_OPENED, event);
    }

    this.sendResult(ws, id, true);
  }

  private handleOpenDiff(
    ws: WebSocket,
    id: string | number | null,
    params: IdeOpenDiffParams
  ): void {
    if (id === null) {
      // Notifications (no id) can't be deferred
      return;
    }

    const requestId = crypto.randomUUID();

    const event: IdeDiffRequestEvent = {
      requestId,
      filePath: params.filePath,
      oldContent: params.oldContent,
      newContent: params.newContent,
      tab_name: params.tab_name,
    };

    // Store pending diff for later resolution
    this.pendingDiffs.set(requestId, {
      ws,
      rpcId: id,
      resolve: () => {}, // Not used - we send directly via resolveDiff
    });

    // Emit to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.IDE_DIFF_REQUESTED, event);
    }

    // Don't send a response yet - it will be sent when the user accepts/rejects
  }

  private handleGetWorkspaceFolders(ws: WebSocket, id: string | number | null): void {
    const folders = getIdeStateManager().getWorkspaceFolders();
    this.sendResult(ws, id, folders);
  }

  private handleGetOpenEditors(ws: WebSocket, id: string | number | null): void {
    const editors = getIdeStateManager().getOpenEditors();
    this.sendResult(ws, id, editors);
  }

  private handleGetCurrentSelection(ws: WebSocket, id: string | number | null): void {
    const selection = getIdeStateManager().getCurrentSelection();
    this.sendResult(ws, id, selection);
  }

  private handleGetDiagnostics(ws: WebSocket, id: string | number | null): void {
    const diagnostics = getIdeStateManager().getDiagnostics();
    this.sendResult(ws, id, diagnostics);
  }

  private sendResult(ws: WebSocket, id: string | number | null, result: unknown): void {
    if (id === null) return; // Notifications don't get responses

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private sendError(
    ws: WebSocket,
    id: string | number | null,
    code: number,
    message: string
  ): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private writeLockFile(): void {
    const ideDir = path.join(os.homedir(), '.claude', 'ide');

    // Create directory if it doesn't exist
    if (!fs.existsSync(ideDir)) {
      fs.mkdirSync(ideDir, { recursive: true });
    }

    this.lockFilePath = path.join(ideDir, `${this.port}.lock`);

    const lockData: IdeLockFile = {
      pid: process.pid,
      port: this.port,
      auth: this.authToken,
      version: 1,
    };

    fs.writeFileSync(this.lockFilePath, JSON.stringify(lockData, null, 2));
    console.log(`[IdeWS] Lock file written: ${this.lockFilePath}`);
  }

  private removeLockFile(): void {
    if (this.lockFilePath && fs.existsSync(this.lockFilePath)) {
      try {
        fs.unlinkSync(this.lockFilePath);
        console.log(`[IdeWS] Lock file removed: ${this.lockFilePath}`);
      } catch (error) {
        console.error('[IdeWS] Failed to remove lock file:', error);
      }
    }
  }
}

// Singleton
let instance: IdeWebSocketServer | null = null;

export function getIdeWebSocketServer(): IdeWebSocketServer {
  if (!instance) {
    instance = new IdeWebSocketServer();
  }
  return instance;
}
