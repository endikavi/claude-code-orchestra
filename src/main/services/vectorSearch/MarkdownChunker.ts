import * as crypto from 'crypto';
import type { Chunk, ChunkMetadata } from '@shared/types/vectorSearch';

interface ChunkOptions {
  maxTokens?: number; // Target chunk size in tokens (approximate)
  overlapTokens?: number; // Overlap between chunks
  minTokens?: number; // Minimum chunk size
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxTokens: 512,
  overlapTokens: 50,
  minTokens: 50,
};

interface ParsedSection {
  heading: string | null;
  headingLevel: number;
  content: string;
  startLine: number;
  endLine: number;
  codeBlocks: CodeBlock[];
}

interface CodeBlock {
  language: string;
  content: string;
  startLine: number;
  endLine: number;
}

// Approximate token count (4 chars per token on average)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if content has meaningful text beyond just headers/formatting.
 * Filters out chunks that are just "## Heading\n\n" with no real content.
 */
function hasSignificantContent(content: string): boolean {
  // Remove markdown headers
  let stripped = content.replace(/^#{1,6}\s+.+$/gm, '');
  // Remove code block markers (but keep content)
  stripped = stripped.replace(/^```\w*$/gm, '');
  // Remove horizontal rules
  stripped = stripped.replace(/^[-*_]{3,}$/gm, '');
  // Remove empty lines and whitespace
  stripped = stripped.replace(/\s+/g, ' ').trim();

  // Require at least 30 chars of actual content
  return stripped.length >= 30;
}

// Generate deterministic chunk ID
function generateChunkId(filePath: string, chunkIndex: number): string {
  const hash = crypto.createHash('sha256');
  hash.update(`${filePath}:${chunkIndex}`);
  return hash.digest('hex').substring(0, 16);
}

// Calculate file hash for change detection
export function calculateFileHash(content: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex').substring(0, 16);
}

// Parse markdown into sections by headings
function parseMarkdownSections(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];

  let currentSection: ParsedSection = {
    heading: null,
    headingLevel: 0,
    content: '',
    startLine: 1,
    endLine: 1,
    codeBlocks: [],
  };

  let inCodeBlock = false;
  let codeBlockStart = 0;
  let codeBlockLang = '';
  let codeBlockContent = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for code block markers
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        // Start of code block
        inCodeBlock = true;
        codeBlockStart = lineNum;
        codeBlockLang = line.substring(3).trim();
        codeBlockContent = '';
      } else {
        // End of code block
        inCodeBlock = false;
        currentSection.codeBlocks.push({
          language: codeBlockLang,
          content: codeBlockContent,
          startLine: codeBlockStart,
          endLine: lineNum,
        });
      }
      currentSection.content += line + '\n';
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += line + '\n';
      currentSection.content += line + '\n';
      continue;
    }

    // Check for heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section if it has content
      if (currentSection.content.trim()) {
        currentSection.endLine = lineNum - 1;
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        heading: headingMatch[2].trim(),
        headingLevel: headingMatch[1].length,
        content: line + '\n',
        startLine: lineNum,
        endLine: lineNum,
        codeBlocks: [],
      };
    } else {
      currentSection.content += line + '\n';
    }
  }

  // Save last section
  if (currentSection.content.trim()) {
    currentSection.endLine = lines.length;
    sections.push(currentSection);
  }

  return sections;
}

// Build heading path from sections
function buildHeadingPath(sections: ParsedSection[], currentIndex: number): string[] {
  const path: string[] = [];
  const currentSection = sections[currentIndex];
  const currentLevel = currentSection.headingLevel;

  // Add current heading if exists
  if (currentSection.heading) {
    // Look back for parent headings
    for (let i = currentIndex - 1; i >= 0; i--) {
      const section = sections[i];
      if (section.heading && section.headingLevel < currentLevel) {
        path.unshift(`${'#'.repeat(section.headingLevel)} ${section.heading}`);
        // Keep looking for higher-level headings
        if (section.headingLevel === 1) break;
      }
    }
    path.push(`${'#'.repeat(currentLevel)} ${currentSection.heading}`);
  }

  return path;
}

// Split a section into smaller chunks if needed
function splitSectionIntoChunks(
  section: ParsedSection,
  options: Required<ChunkOptions>
): { content: string; startLine: number; endLine: number }[] {
  const tokens = estimateTokens(section.content);

  // If section fits in one chunk, return as-is
  if (tokens <= options.maxTokens) {
    return [
      {
        content: section.content,
        startLine: section.startLine,
        endLine: section.endLine,
      },
    ];
  }

  // Split by paragraphs (double newlines)
  const paragraphs = section.content.split(/\n\n+/);
  const chunks: { content: string; startLine: number; endLine: number }[] = [];
  let currentChunk = '';
  let chunkStartLine = section.startLine;
  let currentLine = section.startLine;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    const currentTokens = estimateTokens(currentChunk);

    // If paragraph alone exceeds max, split by sentences
    if (paraTokens > options.maxTokens) {
      // Save current chunk first
      if (currentChunk.trim()) {
        const paraLines = currentChunk.split('\n').length;
        chunks.push({
          content: currentChunk.trim(),
          startLine: chunkStartLine,
          endLine: currentLine - 1,
        });
      }

      // Split large paragraph by sentences
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
      currentChunk = '';
      chunkStartLine = currentLine;

      for (const sentence of sentences) {
        if (estimateTokens(currentChunk + sentence) > options.maxTokens && currentChunk) {
          chunks.push({
            content: currentChunk.trim(),
            startLine: chunkStartLine,
            endLine: currentLine,
          });
          // Add overlap
          const overlapText = currentChunk.slice(-options.overlapTokens * 4);
          currentChunk = overlapText + sentence;
          chunkStartLine = currentLine;
        } else {
          currentChunk += sentence;
        }
      }
    } else if (currentTokens + paraTokens > options.maxTokens) {
      // Would exceed max, start new chunk
      if (currentChunk.trim()) {
        const paraLines = currentChunk.split('\n').length;
        chunks.push({
          content: currentChunk.trim(),
          startLine: chunkStartLine,
          endLine: currentLine - 1,
        });
      }
      // Add overlap from previous chunk
      const overlapText = currentChunk.slice(-options.overlapTokens * 4);
      currentChunk = overlapText + para + '\n\n';
      chunkStartLine = currentLine;
    } else {
      currentChunk += para + '\n\n';
    }

    currentLine += para.split('\n').length + 1;
  }

  // Don't forget last chunk
  if (currentChunk.trim() && estimateTokens(currentChunk) >= options.minTokens) {
    chunks.push({
      content: currentChunk.trim(),
      startLine: chunkStartLine,
      endLine: section.endLine,
    });
  }

  return chunks;
}

export function chunkMarkdown(
  content: string,
  filePath: string,
  options: ChunkOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const fileHash = calculateFileHash(content);
  const sections = parseMarkdownSections(content);
  const chunks: Chunk[] = [];

  let chunkIndex = 0;

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    const section = sections[sectionIndex];
    const headingPath = buildHeadingPath(sections, sectionIndex);
    const subChunks = splitSectionIntoChunks(section, opts);

    for (const subChunk of subChunks) {
      // Skip chunks that only contain headers without meaningful content
      if (!hasSignificantContent(subChunk.content)) {
        continue;
      }

      // Detect code in this chunk
      const codeBlocksInChunk = section.codeBlocks.filter(
        (cb) => cb.startLine >= subChunk.startLine && cb.endLine <= subChunk.endLine
      );
      const hasCode = codeBlocksInChunk.length > 0 || /```/.test(subChunk.content);
      const codeLanguages = [
        ...new Set(codeBlocksInChunk.map((cb) => cb.language).filter((l) => l)),
      ];

      // Also detect inline code patterns for language hints
      if (!hasCode) {
        const inlineCodeMatches = subChunk.content.match(/`[^`]+`/g);
        if (inlineCodeMatches && inlineCodeMatches.length > 3) {
          // Likely contains code references
        }
      }

      const metadata: ChunkMetadata = {
        headingPath,
        hasCode,
        codeLanguages,
        wordCount: subChunk.content.split(/\s+/).length,
      };

      chunks.push({
        id: generateChunkId(filePath, chunkIndex),
        filePath,
        fileHash,
        chunkIndex,
        content: subChunk.content,
        startLine: subChunk.startLine,
        endLine: subChunk.endLine,
        metadata,
        createdAt: Date.now(),
      });

      chunkIndex++;
    }
  }

  return chunks;
}

// Utility to extract code languages from markdown
export function extractCodeLanguages(content: string): string[] {
  const matches = content.matchAll(/```(\w+)/g);
  const languages = new Set<string>();
  for (const match of matches) {
    if (match[1]) {
      languages.add(match[1].toLowerCase());
    }
  }
  return Array.from(languages);
}

// Count words in text
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}
