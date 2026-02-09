// File explorer types for directory listing and file tree

export interface FileTreeEntry {
  name: string;
  path: string; // Relative to project root
  type: 'file' | 'directory';
  children?: FileTreeEntry[];
  gitStatus?: string; // Combined status char (e.g., 'M', 'A', 'D', '?')
}

export interface DirectoryListingResponse {
  entries: FileTreeEntry[];
  truncated: boolean;
  totalCount: number;
}

export interface FileContentResponse {
  content: string | null;
  size: number;
  isBinary: boolean;
}

export interface FileOperationResponse {
  success: boolean;
  error?: string;
}
