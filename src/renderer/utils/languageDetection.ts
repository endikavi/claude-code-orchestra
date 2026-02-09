// Maps file extensions to Monaco Editor language IDs

const extensionToLanguage: Record<string, string> = {
  // TypeScript / JavaScript
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',

  // Python
  py: 'python',

  // Data formats
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  ini: 'ini',
  cfg: 'ini',

  // Styles
  css: 'css',
  scss: 'scss',
  less: 'less',

  // Markup
  md: 'markdown',
  html: 'html',
  htm: 'html',

  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',

  // Systems languages
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',

  // Scripting
  rb: 'ruby',
  php: 'php',
  sql: 'sql',

  // Special files
  graphql: 'graphql',
  gql: 'graphql',
  dockerfile: 'dockerfile',

  // Frameworks (fallback to html)
  vue: 'html',
  svelte: 'html',
};

// Special filenames (no extension) → language
const filenameToLanguage: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  Dockerfile: 'dockerfile',
  Makefile: 'makefile',
};

/**
 * Detect Monaco language ID from a file path based on its extension or filename.
 */
export function getLanguageFromPath(filePath: string): string {
  const filename = filePath.split('/').pop() || filePath;

  // Check full filename first (for Dockerfile, Makefile, etc.)
  if (filenameToLanguage[filename]) {
    return filenameToLanguage[filename];
  }

  // Check lowercase filename
  const lowerFilename = filename.toLowerCase();
  if (filenameToLanguage[lowerFilename]) {
    return filenameToLanguage[lowerFilename];
  }

  // Extract extension
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) return 'plaintext';

  const ext = filename.slice(dotIndex + 1).toLowerCase();
  return extensionToLanguage[ext] || 'plaintext';
}
