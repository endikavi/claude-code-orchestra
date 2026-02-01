// Type declarations for glob module
declare module 'glob' {
  export interface GlobOptions {
    cwd?: string;
    absolute?: boolean;
    ignore?: string | string[];
    dot?: boolean;
    nodir?: boolean;
    signal?: AbortSignal;
  }

  export function glob(pattern: string | string[], options?: GlobOptions): Promise<string[]>;

  export function globSync(pattern: string | string[], options?: GlobOptions): string[];
}
