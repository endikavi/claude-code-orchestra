import { getLlamaService, LlamaService } from './LlamaService';

/**
 * Result from a reranking operation
 */
export interface RerankResult {
  index: number;
  score: number; // 0-1, higher is more relevant
  isRelevant: boolean;
}

/**
 * Available reranking strategies
 */
export type RerankStrategy =
  | 'none' // No reranking, use fusion scores only
  | 'embedding' // Cosine similarity with query embedding
  | 'bge-v2-m3' // BGE Reranker v2 M3 (cross-encoder)
  | 'jina-v2' // Jina Reranker v2 (cross-encoder)
  | 'qwen3'; // Qwen3 Reranker (current, known issues with llama.cpp)

/**
 * Interface for all rerankers
 */
export interface Reranker {
  readonly name: RerankStrategy;
  readonly displayName: string;
  readonly requiresModel: boolean;
  readonly modelId?: string;

  /**
   * Rerank documents by relevance to query
   * @param query The search query
   * @param documents Array of document contents to rerank
   * @returns Array of rerank results with scores
   */
  rerank(query: string, documents: string[]): Promise<RerankResult[]>;

  /**
   * Check if the reranker is ready to use
   */
  isReady(): Promise<boolean>;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Embedding-based reranker using cosine similarity
 * Uses the same embedding model to compute query-document similarity
 */
export class EmbeddingReranker implements Reranker {
  readonly name: RerankStrategy = 'embedding';
  readonly displayName = 'Embedding Similarity';
  readonly requiresModel = true;
  readonly modelId = 'qwen3-embedding-0.6b';

  private llamaService: LlamaService;

  constructor(llamaService?: LlamaService) {
    this.llamaService = llamaService || getLlamaService();
  }

  isReady(): Promise<boolean> {
    return Promise.resolve(this.llamaService.isModelLoaded(this.modelId));
  }

  async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
    if (documents.length === 0) return [];

    const startTime = Date.now();

    // Generate query embedding
    const queryEmbedding = await this.llamaService.embed(query);

    // Generate document embeddings in batch
    const docEmbeddings = await this.llamaService.embedBatch(documents);

    // Calculate cosine similarities
    const results: RerankResult[] = docEmbeddings.map((docEmb, index) => {
      const similarity = cosineSimilarity(queryEmbedding, docEmb);
      return {
        index,
        score: (similarity + 1) / 2, // Normalize from [-1,1] to [0,1]
        isRelevant: similarity > 0.5,
      };
    });

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const elapsed = Date.now() - startTime;
    console.log(`[EmbeddingReranker] Reranked ${documents.length} documents in ${elapsed}ms`);

    return results;
  }
}

/**
 * Qwen3 Reranker (LLM-based, current implementation)
 * Known issues: llama.cpp doesn't properly support this model, scores are often uniform
 */
export class Qwen3Reranker implements Reranker {
  readonly name: RerankStrategy = 'qwen3';
  readonly displayName = 'Qwen3 Reranker (Legacy)';
  readonly requiresModel = true;
  readonly modelId = 'qwen3-reranker-0.6b';

  private llamaService: LlamaService;

  constructor(llamaService?: LlamaService) {
    this.llamaService = llamaService || getLlamaService();
  }

  isReady(): Promise<boolean> {
    return Promise.resolve(this.llamaService.isModelLoaded(this.modelId));
  }

  async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
    // Delegate to LlamaService's existing rerank method
    return this.llamaService.rerank(query, documents);
  }
}

/**
 * BGE Reranker v2 M3 (cross-encoder)
 * More reliable than Qwen3 with llama.cpp
 */
export class BGEReranker implements Reranker {
  readonly name: RerankStrategy = 'bge-v2-m3';
  readonly displayName = 'BGE Reranker v2-M3';
  readonly requiresModel = true;
  readonly modelId = 'bge-reranker-v2-m3';

  private llamaService: LlamaService;

  constructor(llamaService?: LlamaService) {
    this.llamaService = llamaService || getLlamaService();
  }

  isReady(): Promise<boolean> {
    return Promise.resolve(this.llamaService.isModelLoaded(this.modelId));
  }

  async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
    // Use the cross-encoder rerank method from LlamaService
    return this.llamaService.rerankCrossEncoder(query, documents, this.modelId);
  }
}

/**
 * Jina Reranker v2 (cross-encoder)
 * Alternative cross-encoder option
 */
export class JinaReranker implements Reranker {
  readonly name: RerankStrategy = 'jina-v2';
  readonly displayName = 'Jina Reranker v2';
  readonly requiresModel = true;
  readonly modelId = 'jina-reranker-v2-base';

  private llamaService: LlamaService;

  constructor(llamaService?: LlamaService) {
    this.llamaService = llamaService || getLlamaService();
  }

  isReady(): Promise<boolean> {
    return Promise.resolve(this.llamaService.isModelLoaded(this.modelId));
  }

  async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
    // Use the cross-encoder rerank method from LlamaService
    return this.llamaService.rerankCrossEncoder(query, documents, this.modelId);
  }
}

/**
 * Factory to create rerankers based on strategy
 */
export function createReranker(
  strategy: RerankStrategy,
  llamaService?: LlamaService
): Reranker | null {
  const service = llamaService || getLlamaService();

  switch (strategy) {
    case 'none':
      return null;
    case 'embedding':
      return new EmbeddingReranker(service);
    case 'qwen3':
      return new Qwen3Reranker(service);
    case 'bge-v2-m3':
      return new BGEReranker(service);
    case 'jina-v2':
      return new JinaReranker(service);
    default:
      console.warn(`[Rerankers] Unknown strategy: ${strategy as string}, using embedding`);
      return new EmbeddingReranker(service);
  }
}

/**
 * Get info about available reranking strategies
 */
export function getAvailableStrategies(): {
  strategy: RerankStrategy;
  displayName: string;
  requiresModel: boolean;
  modelId?: string;
}[] {
  return [
    { strategy: 'none', displayName: 'None (Fastest)', requiresModel: false },
    {
      strategy: 'embedding',
      displayName: 'Embedding Similarity',
      requiresModel: true,
      modelId: 'qwen3-embedding-0.6b',
    },
    {
      strategy: 'bge-v2-m3',
      displayName: 'BGE Reranker v2-M3',
      requiresModel: true,
      modelId: 'bge-reranker-v2-m3',
    },
    {
      strategy: 'jina-v2',
      displayName: 'Jina Reranker v2',
      requiresModel: true,
      modelId: 'jina-reranker-v2-base',
    },
    {
      strategy: 'qwen3',
      displayName: 'Qwen3 Reranker (Legacy)',
      requiresModel: true,
      modelId: 'qwen3-reranker-0.6b',
    },
  ];
}
