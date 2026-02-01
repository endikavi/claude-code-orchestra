// Available reranking strategies
export type RerankStrategy =
  | 'none' // No reranking, use fusion scores only
  | 'embedding' // Cosine similarity with query embedding
  | 'bge-v2-m3' // BGE Reranker v2 M3 (cross-encoder)
  | 'jina-v2' // Jina Reranker v2 (cross-encoder)
  | 'qwen3'; // Qwen3 Reranker (legacy, known issues)

// Vector search configuration for projects
export interface VectorSearchConfig {
  enabled: boolean;
  useReranking: boolean; // default: true
  rerankStrategy: RerankStrategy; // default: 'embedding'
  useQueryExpansion: boolean; // default: false
  indexPatterns: string[]; // default: ['**/*.md']
  minimumScore: number; // default: 0.05, filter results below this score
}

// Model types
export type ModelType = 'embedding' | 'reranker' | 'queryExpander';

// Model info
export interface ModelInfo {
  id: string;
  name: string;
  type: ModelType;
  filename: string;
  size: number; // bytes
  dimension?: number; // for embedding models
  huggingFaceRepo: string;
  sha256?: string;
}

// Available models - Qwen family for consistency and quality
// See: https://qwenlm.github.io/blog/qwen3-embedding/
export const VECTOR_MODELS: ModelInfo[] = [
  // Embedding models
  {
    id: 'qwen3-embedding-0.6b',
    name: 'Qwen3 Embedding 0.6B',
    type: 'embedding',
    filename: 'Qwen3-Embedding-0.6B-Q8_0.gguf',
    size: 670_367_744, // ~639MB
    dimension: 1024,
    huggingFaceRepo: 'Qwen/Qwen3-Embedding-0.6B-GGUF',
  },
  // Reranker models
  {
    id: 'qwen3-reranker-0.6b',
    name: 'Qwen3 Reranker 0.6B (Legacy)',
    type: 'reranker',
    filename: 'Qwen3-Reranker-0.6B-q8_0.gguf',
    size: 670_367_744, // ~639MB
    huggingFaceRepo: 'Mungert/Qwen3-Reranker-0.6B-GGUF',
  },
  {
    id: 'bge-reranker-v2-m3',
    name: 'BGE Reranker v2-M3',
    type: 'reranker',
    filename: 'bge-reranker-v2-m3-Q8_0.gguf',
    size: 568_000_000, // ~541MB
    huggingFaceRepo: 'gpustack/bge-reranker-v2-m3-GGUF',
  },
  {
    id: 'jina-reranker-v2-base',
    name: 'Jina Reranker v2 Base',
    type: 'reranker',
    filename: 'jina-reranker-v2-base-multilingual-Q8_0.gguf',
    size: 278_000_000, // ~265MB
    huggingFaceRepo: 'gpustack/jina-reranker-v2-base-multilingual-GGUF',
  },
  // Query expander models
  {
    id: 'qwen2.5-1.5b-instruct',
    name: 'Qwen2.5 1.5B Instruct',
    type: 'queryExpander',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: 1_117_320_736, // ~1.04GB
    huggingFaceRepo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
  },
];

// Model status
export type ModelStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'downloaded'
  | 'loading'
  | 'loaded'
  | 'error';

export interface ModelState {
  id: string;
  status: ModelStatus;
  progress?: number; // 0-100 for downloading
  error?: string;
  downloadedAt?: number;
  loadedAt?: number;
}

// Chunk metadata
export interface ChunkMetadata {
  headingPath: string[]; // e.g., ['# Main Title', '## Section', '### Subsection']
  hasCode: boolean;
  codeLanguages: string[];
  wordCount: number;
}

// Document chunk
export interface Chunk {
  id: string;
  filePath: string;
  fileHash: string;
  chunkIndex: number;
  content: string;
  startLine: number;
  endLine: number;
  metadata: ChunkMetadata;
  createdAt: number;
}

// Chunk with embedding
export interface ChunkWithEmbedding extends Chunk {
  embedding: Float32Array | number[];
}

// Index progress
export interface IndexProgress {
  phase: 'scanning' | 'chunking' | 'embedding' | 'storing' | 'complete' | 'error';
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  chunksProcessed: number;
  totalChunks: number;
  percentage: number; // 0-100
  error?: string;
  startedAt: number;
  estimatedRemainingMs?: number;
}

// Index stats
export interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  totalTokens?: number;
  embeddingModel: string;
  embeddingDimension: number;
  lastIndexedAt: number | null;
  indexVersion: number;
  databaseSizeBytes: number;
}

// Search result
export interface SearchResult {
  chunk: Chunk;
  score: number; // Combined/final score
  bm25Score?: number;
  vectorScore?: number;
  rerankerScore?: number;
  highlights?: string[]; // Highlighted snippets
}

// Search options
export interface SearchOptions {
  query: string;
  limit?: number; // default: 5
  useReranking?: boolean; // default: true
  rerankStrategy?: RerankStrategy; // override default strategy
  useQueryExpansion?: boolean; // default: false
  minimumScore?: number; // filter results below this score
  filter?: SearchFilter;
}

// Search filter
export interface SearchFilter {
  filePath?: string; // Glob pattern
  hasCode?: boolean;
  codeLanguages?: string[];
}

// Search response
export interface SearchResponse {
  results: SearchResult[];
  query: string;
  expandedQueries?: string[];
  totalCandidates: number;
  searchTimeMs: number;
  rerankStrategy?: RerankStrategy; // Which strategy was used
  phases: {
    bm25TimeMs?: number;
    vectorTimeMs?: number;
    fusionTimeMs?: number;
    rerankTimeMs?: number;
    queryExpansionTimeMs?: number;
  };
}

// Index status for a project
export interface ProjectIndexStatus {
  projectId: string;
  isIndexing: boolean;
  hasIndex: boolean;
  stats?: IndexStats;
  progress?: IndexProgress;
  lastError?: string;
}

// Model download progress
export interface ModelDownloadProgress {
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
  speedBps?: number; // bytes per second
  estimatedRemainingMs?: number;
}

// IPC events for vector search
export interface VectorSearchIpcChannels {
  // Operations (renderer -> main)
  'vector:indexStart': (projectId: string) => void;
  'vector:indexCancel': (projectId: string) => void;
  'vector:indexClear': (projectId: string) => void;
  'vector:indexStatus': (projectId: string) => ProjectIndexStatus;
  'vector:search': (projectId: string, options: SearchOptions) => SearchResponse;
  'vector:modelDownload': (modelId: string) => void;
  'vector:modelStatus': () => Record<string, ModelState>;
  'vector:modelCancelDownload': (modelId: string) => void;

  // Events (main -> renderer)
  'vector:indexProgress': (projectId: string, progress: IndexProgress) => void;
  'vector:indexComplete': (projectId: string, stats: IndexStats) => void;
  'vector:indexError': (projectId: string, error: string) => void;
  'vector:modelProgress': (modelId: string, progress: ModelDownloadProgress) => void;
  'vector:modelStatusChange': (modelId: string, state: ModelState) => void;
}

// RRF Fusion config
export interface RRFFusionConfig {
  k: number; // Constant for RRF formula, default: 60
  originalQueryWeight: number; // Weight multiplier for original query, default: 2
  topRankBonus: number; // Bonus for top-ranked results, default: 0.05
}

// Position-aware blend config
export interface BlendConfig {
  top1to3RrfWeight: number; // default: 0.75
  top4to10RrfWeight: number; // default: 0.60
  top11PlusRrfWeight: number; // default: 0.40
}

// Full search pipeline config
export interface SearchPipelineConfig {
  bm25Enabled: boolean;
  vectorEnabled: boolean;
  rerankingEnabled: boolean;
  rerankStrategy: RerankStrategy; // Which reranker to use
  queryExpansionEnabled: boolean;
  maxCandidates: number; // Max results to keep after fusion, default: 30
  finalLimit: number; // Final results to return, default: 5
  minimumScore: number; // Filter results below this score, default: 0.05
  rrf: RRFFusionConfig;
  blend: BlendConfig;
}

// Default search pipeline config
export const DEFAULT_SEARCH_PIPELINE_CONFIG: SearchPipelineConfig = {
  bm25Enabled: true,
  vectorEnabled: true,
  rerankingEnabled: true,
  rerankStrategy: 'embedding', // Safe default that works reliably
  queryExpansionEnabled: false,
  maxCandidates: 30,
  finalLimit: 5,
  minimumScore: 0.05, // Filter very low relevance results
  rrf: {
    k: 60,
    originalQueryWeight: 2,
    topRankBonus: 0.05,
  },
  blend: {
    top1to3RrfWeight: 0.75,
    top4to10RrfWeight: 0.6,
    top11PlusRrfWeight: 0.4,
  },
};

// Default vector search config for projects
export const DEFAULT_VECTOR_SEARCH_CONFIG: VectorSearchConfig = {
  enabled: true,
  useReranking: true,
  rerankStrategy: 'embedding', // Safe default that works reliably
  useQueryExpansion: false,
  indexPatterns: ['**/*.md'],
  minimumScore: 0.05,
};
