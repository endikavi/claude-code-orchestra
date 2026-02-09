import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type {
  FileTreeEntry,
  DirectoryListingResponse,
  FileContentResponse,
  FileOperationResponse,
} from '@shared/types';
import { getGitStatusManager } from './GitStatusManager';

const MAX_ENTRIES = 500;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const COMMAND_TIMEOUT = 3000;

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'ico',
  'webp',
  'bmp',
  'tiff',
  'svg',
  'mp3',
  'mp4',
  'wav',
  'ogg',
  'flac',
  'avi',
  'mov',
  'mkv',
  'webm',
  'zip',
  'tar',
  'gz',
  'bz2',
  'xz',
  'rar',
  '7z',
  'exe',
  'dll',
  'so',
  'dylib',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'otf',
  'pdf',
  'sqlite',
  'db',
  'node',
  'o',
  'a',
  'lib',
  'class',
  'pyc',
  'pyo',
]);

// Directories to always exclude
const ALWAYS_EXCLUDE = new Set(['.git']);

/**
 * FileExplorerService - Lists directory contents with git status integration
 */
export class FileExplorerService {
  private static instance: FileExplorerService;
  private globCache: Map<string, { files: string[]; timestamp: number }> = new Map();
  private readonly GLOB_TTL = 30000; // 30 seconds

  private constructor() {}

  static getInstance(): FileExplorerService {
    if (!FileExplorerService.instance) {
      FileExplorerService.instance = new FileExplorerService();
    }
    return FileExplorerService.instance;
  }

  /**
   * List contents of a directory (single level, lazy loading)
   */
  async listDirectory(
    projectPath: string,
    relativePath: string = '',
    respectGitignore: boolean = true
  ): Promise<DirectoryListingResponse> {
    const fullPath = relativePath ? path.join(projectPath, relativePath) : projectPath;

    if (!fs.existsSync(fullPath)) {
      return { entries: [], truncated: false, totalCount: 0 };
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      return { entries: [], truncated: false, totalCount: 0 };
    }

    // Read directory entries
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(fullPath, { withFileTypes: true });
    } catch {
      return { entries: [], truncated: false, totalCount: 0 };
    }

    // Filter out always-excluded dirs
    dirEntries = dirEntries.filter((e) => !ALWAYS_EXCLUDE.has(e.name));

    // Get gitignored files if needed
    let ignoredSet: Set<string> | null = null;
    if (respectGitignore) {
      ignoredSet = await this.getGitIgnored(projectPath, fullPath, dirEntries);
    }

    // Build entries
    let entries: FileTreeEntry[] = [];
    for (const dirent of dirEntries) {
      const entryRelPath = relativePath ? `${relativePath}/${dirent.name}` : dirent.name;

      // Skip gitignored entries
      if (ignoredSet && ignoredSet.has(dirent.name)) {
        continue;
      }

      const type = dirent.isDirectory() ? 'directory' : 'file';
      entries.push({
        name: dirent.name,
        path: entryRelPath,
        type,
      });
    }

    const totalCount = entries.length;
    const truncated = totalCount > MAX_ENTRIES;

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Truncate if needed
    if (truncated) {
      entries = entries.slice(0, MAX_ENTRIES);
    }

    // Merge git status into entries
    this.mergeGitStatus(projectPath, entries);

    return { entries, truncated, totalCount };
  }

  /**
   * Get set of gitignored file names in a directory
   */
  private async getGitIgnored(
    projectPath: string,
    dirPath: string,
    dirEntries: fs.Dirent[]
  ): Promise<Set<string>> {
    const ignored = new Set<string>();

    // Check if project is a git repo
    const gitDir = path.join(projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return ignored;
    }

    // Build relative paths for each entry
    const names = dirEntries.map((e) => {
      const rel = path.relative(projectPath, path.join(dirPath, e.name));
      return e.isDirectory() ? `${rel}/` : rel;
    });

    if (names.length === 0) return ignored;

    try {
      const result = await new Promise<string>((resolve, reject) => {
        const proc = spawn('git', ['check-ignore', '--stdin'], {
          cwd: projectPath,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });

        let stdout = '';
        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        const timeout = setTimeout(() => {
          proc.kill();
          resolve('');
        }, COMMAND_TIMEOUT);

        proc.on('close', () => {
          clearTimeout(timeout);
          resolve(stdout);
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        // Write paths to stdin
        proc.stdin.write(names.join('\n'));
        proc.stdin.end();
      });

      // Parse output: each line is a matched (ignored) path
      const ignoredPaths = result.trim().split('\n').filter(Boolean);
      for (const ignoredPath of ignoredPaths) {
        const name = path.basename(ignoredPath.replace(/\/$/, ''));
        ignored.add(name);
      }
    } catch {
      // git check-ignore may fail for various reasons, just return empty set
    }

    return ignored;
  }

  /**
   * Validate that resolved path stays within projectPath (path traversal protection)
   */
  private validatePath(projectPath: string, relativePath: string): string {
    const resolved = path.resolve(projectPath, relativePath);
    if (
      !resolved.startsWith(path.resolve(projectPath) + path.sep) &&
      resolved !== path.resolve(projectPath)
    ) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  /**
   * Check if a file is binary based on extension and content
   */
  private isBinaryFile(filePath: string, buffer?: Buffer): boolean {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    if (BINARY_EXTENSIONS.has(ext)) return true;
    if (buffer) {
      for (let i = 0; i < Math.min(buffer.length, 8192); i++) {
        if (buffer[i] === 0) return true;
      }
    }
    return false;
  }

  /**
   * Read file contents with size limit and binary detection
   */
  readFile(projectPath: string, relativePath: string): FileContentResponse {
    const fullPath = this.validatePath(projectPath, relativePath);
    const stat = fs.statSync(fullPath);
    const size = stat.size;

    if (size > MAX_FILE_SIZE) {
      return { content: null, size, isBinary: false };
    }

    const buffer = fs.readFileSync(fullPath);
    const isBinary = this.isBinaryFile(fullPath, buffer);

    if (isBinary) {
      return { content: null, size, isBinary: true };
    }

    return { content: buffer.toString('utf-8'), size, isBinary: false };
  }

  /**
   * Write content to an existing file
   */
  writeFile(projectPath: string, relativePath: string, content: string): FileOperationResponse {
    const fullPath = this.validatePath(projectPath, relativePath);
    fs.writeFileSync(fullPath, content, 'utf-8');
    return { success: true };
  }

  /**
   * Create a new file or directory
   */
  createEntry(
    projectPath: string,
    relativePath: string,
    type: 'file' | 'directory',
    content?: string
  ): FileOperationResponse {
    const fullPath = this.validatePath(projectPath, relativePath);
    if (fs.existsSync(fullPath)) {
      return { success: false, error: 'Entry already exists' };
    }
    if (type === 'directory') {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      // Ensure parent directory exists
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content ?? '', 'utf-8');
    }
    return { success: true };
  }

  /**
   * Rename/move a file or directory
   */
  renameEntry(projectPath: string, oldPath: string, newPath: string): FileOperationResponse {
    const fullOldPath = this.validatePath(projectPath, oldPath);
    const fullNewPath = this.validatePath(projectPath, newPath);
    if (!fs.existsSync(fullOldPath)) {
      return { success: false, error: 'Source entry does not exist' };
    }
    if (fs.existsSync(fullNewPath)) {
      return { success: false, error: 'Destination already exists' };
    }
    // Ensure parent directory of destination exists
    const parentDir = path.dirname(fullNewPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.renameSync(fullOldPath, fullNewPath);
    return { success: true };
  }

  /**
   * Delete a file or directory (recursive for directories)
   */
  deleteEntry(projectPath: string, relativePath: string): FileOperationResponse {
    const fullPath = this.validatePath(projectPath, relativePath);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: 'Entry does not exist' };
    }
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    return { success: true };
  }

  /**
   * Get all files in a project (for quick open / fuzzy search)
   */
  async globFiles(projectPath: string): Promise<string[]> {
    const cached = this.globCache.get(projectPath);
    if (cached && Date.now() - cached.timestamp < this.GLOB_TTL) {
      return cached.files;
    }

    let files: string[];
    const gitDir = path.join(projectPath, '.git');

    if (fs.existsSync(gitDir)) {
      files = await new Promise<string[]>((resolve) => {
        const proc = spawn('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
          cwd: projectPath,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });

        let stdout = '';
        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        const timeout = setTimeout(() => {
          proc.kill();
          resolve([]);
        }, 10000);

        proc.on('close', () => {
          clearTimeout(timeout);
          resolve(stdout.trim().split('\n').filter(Boolean));
        });

        proc.on('error', () => {
          clearTimeout(timeout);
          resolve([]);
        });
      });
    } else {
      files = this.recursiveScan(projectPath, '', 5);
    }

    this.globCache.set(projectPath, { files, timestamp: Date.now() });
    return files;
  }

  private recursiveScan(basePath: string, relativePath: string, maxDepth: number): string[] {
    if (maxDepth <= 0) return [];
    const fullPath = relativePath ? path.join(basePath, relativePath) : basePath;

    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const results: string[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const entryRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isFile()) {
          results.push(entryRel);
        } else if (entry.isDirectory()) {
          results.push(...this.recursiveScan(basePath, entryRel, maxDepth - 1));
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Merge git status badges into file tree entries
   */
  private mergeGitStatus(projectPath: string, entries: FileTreeEntry[]): void {
    const gitStatusManager = getGitStatusManager();
    const status = gitStatusManager.getStatusByPath(projectPath);
    const gitFiles = status?.files;

    if (!gitFiles || gitFiles.length === 0) return;

    // Build a map of path -> status for quick lookup
    const statusMap = new Map<string, string>();
    for (const file of gitFiles) {
      // Determine the primary status to show
      let badge = '';
      if (file.indexStatus === '?' && file.workTreeStatus === '?') {
        badge = '?';
      } else if (file.indexStatus !== ' ' && file.indexStatus !== '?') {
        badge = file.indexStatus; // Staged status
      } else if (file.workTreeStatus !== ' ' && file.workTreeStatus !== '?') {
        badge = file.workTreeStatus; // Unstaged status
      }
      if (badge) {
        statusMap.set(file.path, badge);
      }
    }

    // Apply to entries
    for (const entry of entries) {
      if (entry.type === 'file') {
        const status = statusMap.get(entry.path);
        if (status) {
          entry.gitStatus = status;
        }
      } else if (entry.type === 'directory') {
        // Check if any git file is under this directory
        for (const [filePath] of statusMap) {
          if (filePath.startsWith(entry.path + '/')) {
            entry.gitStatus = 'M'; // Directory contains modified files
            break;
          }
        }
      }
    }
  }
}

// Singleton accessor
let fileExplorerServiceInstance: FileExplorerService | null = null;

export function getFileExplorerService(): FileExplorerService {
  if (!fileExplorerServiceInstance) {
    fileExplorerServiceInstance = FileExplorerService.getInstance();
  }
  return fileExplorerServiceInstance;
}
