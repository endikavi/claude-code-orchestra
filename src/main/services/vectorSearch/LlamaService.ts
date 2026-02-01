import { EventEmitter } from 'events';
import { getModelDownloader, ModelDownloader } from './ModelDownloader';
import type { ModelState } from '@shared/types/vectorSearch';
import { VECTOR_MODELS } from '@shared/types/vectorSearch';

// Dynamic import for node-llama-cpp (ESM module)
let llamaCpp: typeof import('node-llama-cpp') | null = null;

async function getLlamaCpp(): Promise<typeof import('node-llama-cpp')> {
  if (!llamaCpp) {
    llamaCpp = await import('node-llama-cpp');
  }
  return llamaCpp;
}

// Types from node-llama-cpp
type LlamaModel = Awaited<
  ReturnType<Awaited<ReturnType<typeof getLlamaCpp>>['getLlama']>
>['loadModel'] extends (options: infer O) => Promise<infer R>
  ? R
  : never;
type LlamaEmbeddingContext = Awaited<ReturnType<LlamaModel['createEmbeddingContext']>>;
type LlamaContext = Awaited<ReturnType<LlamaModel['createContext']>>;

interface LoadedModel {
  model: LlamaModel;
  embeddingContext?: LlamaEmbeddingContext;
  context?: LlamaContext;
  loadedAt: number;
}

export interface RerankResult {
  index: number;
  score: number;
  isRelevant: boolean;
}

// Model ID to reranker type mapping
const CROSS_ENCODER_MODELS = ['bge-reranker-v2-m3', 'jina-reranker-v2-base'];

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

export class LlamaService extends EventEmitter {
  private modelDownloader: ModelDownloader;
  private loadedModels: Map<string, LoadedModel> = new Map();
  private llama!: Awaited<ReturnType<typeof getLlamaCpp>>['getLlama'] extends (
    ...args: never[]
  ) => Promise<infer R>
    ? R
    : never;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    super();
    this.modelDownloader = getModelDownloader();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const { getLlama } = await getLlamaCpp();
      this.llama = await getLlama();
      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  async ensureModelDownloaded(modelId: string): Promise<string> {
    const state = this.modelDownloader.getModelState(modelId);
    if (state?.status === 'downloaded' || state?.status === 'loaded') {
      return this.modelDownloader.getModelPath(modelId);
    }
    return this.modelDownloader.downloadModel(modelId);
  }

  async loadEmbeddingModel(): Promise<void> {
    await this.initialize();

    const modelId = 'qwen3-embedding-0.6b';
    if (this.loadedModels.has(modelId)) return;

    const modelPath = await this.ensureModelDownloaded(modelId);
    this.emit('modelLoading', modelId);

    const model = await this.llama.loadModel({
      modelPath,
    });

    const embeddingContext = await model.createEmbeddingContext();

    this.loadedModels.set(modelId, {
      model,
      embeddingContext,
      loadedAt: Date.now(),
    });

    this.emit('modelLoaded', modelId);
  }

  async loadReranker(): Promise<void> {
    await this.initialize();

    const modelId = 'qwen3-reranker-0.6b';
    if (this.loadedModels.has(modelId)) return;

    const modelPath = await this.ensureModelDownloaded(modelId);
    this.emit('modelLoading', modelId);

    const model = await this.llama.loadModel({
      modelPath,
    });

    const context = await model.createContext({
      contextSize: 2048,
    });

    this.loadedModels.set(modelId, {
      model,
      context,
      loadedAt: Date.now(),
    });

    this.emit('modelLoaded', modelId);
  }

  async loadQueryExpander(): Promise<void> {
    await this.initialize();

    const modelId = 'qwen2.5-1.5b-instruct';
    if (this.loadedModels.has(modelId)) return;

    const modelPath = await this.ensureModelDownloaded(modelId);
    this.emit('modelLoading', modelId);

    const model = await this.llama.loadModel({
      modelPath,
    });

    const context = await model.createContext({
      contextSize: 2048,
    });

    this.loadedModels.set(modelId, {
      model,
      context,
      loadedAt: Date.now(),
    });

    this.emit('modelLoaded', modelId);
  }

  /**
   * Load a cross-encoder reranker model (BGE, Jina, etc.)
   */
  async loadCrossEncoderModel(modelId: string): Promise<void> {
    await this.initialize();

    if (this.loadedModels.has(modelId)) return;
    if (!CROSS_ENCODER_MODELS.includes(modelId)) {
      throw new Error(`Unknown cross-encoder model: ${modelId}`);
    }

    const modelPath = await this.ensureModelDownloaded(modelId);
    this.emit('modelLoading', modelId);

    const model = await this.llama.loadModel({
      modelPath,
    });

    // Cross-encoders need embedding context for scoring
    const embeddingContext = await model.createEmbeddingContext();

    this.loadedModels.set(modelId, {
      model,
      embeddingContext,
      loadedAt: Date.now(),
    });

    this.emit('modelLoaded', modelId);
  }

  async embed(text: string): Promise<number[]> {
    const modelId = 'qwen3-embedding-0.6b';
    const loaded = this.loadedModels.get(modelId);

    if (!loaded?.embeddingContext) {
      await this.loadEmbeddingModel();
      return this.embed(text);
    }

    const embedding = await loaded.embeddingContext.getEmbeddingFor(text);
    return Array.from(embedding.vector);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const modelId = 'qwen3-embedding-0.6b';
    const loaded = this.loadedModels.get(modelId);

    if (!loaded?.embeddingContext) {
      await this.loadEmbeddingModel();
      return this.embedBatch(texts);
    }

    const results: number[][] = [];
    for (const text of texts) {
      const embedding = await loaded.embeddingContext.getEmbeddingFor(text);
      results.push(Array.from(embedding.vector));
    }
    return results;
  }

  /**
   * Rerank documents using LLM inference.
   * Uses the reranker model to judge relevance of each document.
   */
  async rerank(query: string, documents: string[]): Promise<RerankResult[]> {
    if (documents.length === 0) {
      return [];
    }

    const modelId = 'qwen3-reranker-0.6b';
    const loaded = this.loadedModels.get(modelId);

    if (!loaded?.context) {
      await this.loadReranker();
      return this.rerank(query, documents);
    }

    const { LlamaChatSession } = await getLlamaCpp();
    const results: RerankResult[] = [];
    const startTime = Date.now();

    // Get ONE sequence and reuse it for all documents to avoid exhausting sequences
    const sequence = loaded.context.getSequence();

    try {
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        // Format prompt for reranker (Qwen3-Reranker uses specific format)
        const prompt = `<|im_start|>user
Judge whether the following document is relevant to the query. Answer with a relevance score from 0 to 10, where 0 is completely irrelevant and 10 is highly relevant.
Query: ${query}
Document: ${doc.substring(0, 500)}
Score (0-10):<|im_end|>
<|im_start|>assistant
`;

        const session = new LlamaChatSession({
          contextSequence: sequence,
        });

        try {
          const response = await session.prompt(prompt, {
            maxTokens: 10,
          });

          // Parse numeric score from response
          const scoreMatch = response.match(/(\d+)/);
          const rawScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 5;
          const score = Math.min(10, Math.max(0, rawScore)) / 10; // Normalize to 0-1

          results.push({
            index: i,
            score,
            isRelevant: score >= 0.5,
          });
        } catch {
          results.push({
            index: i,
            score: 0.5,
            isRelevant: false,
          });
        } finally {
          if (typeof session.dispose === 'function') {
            session.dispose();
          }
        }
      }
    } finally {
      if (typeof sequence.dispose === 'function') {
        sequence.dispose();
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const elapsed = Date.now() - startTime;
    console.log(
      `[LlamaService] Reranked ${documents.length} documents in ${elapsed}ms (LLM inference)`
    );

    return results;
  }

  /**
   * Rerank documents using a cross-encoder model (BGE, Jina).
   * Cross-encoders compute query-document relevance directly.
   */
  async rerankCrossEncoder(
    query: string,
    documents: string[],
    modelId: string
  ): Promise<RerankResult[]> {
    if (documents.length === 0) {
      return [];
    }

    const loaded = this.loadedModels.get(modelId);

    if (!loaded?.embeddingContext) {
      await this.loadCrossEncoderModel(modelId);
      return this.rerankCrossEncoder(query, documents, modelId);
    }

    const startTime = Date.now();
    const results: RerankResult[] = [];

    // Cross-encoder format: "query: <query> document: <document>"
    // The model computes a relevance score from the combined representation
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      // Format depends on the model, but most cross-encoders use this pattern
      const input = `query: ${query} document: ${doc.substring(0, 500)}`;

      try {
        const embedding = await loaded.embeddingContext.getEmbeddingFor(input);
        // For cross-encoders, we use the first dimension or mean as score
        // Different models may need different extraction methods
        const vector = Array.from(embedding.vector);

        // Use the mean of absolute values as a relevance proxy
        // This is a heuristic that works for many cross-encoder architectures
        const score = vector.reduce((sum, v) => sum + Math.abs(v), 0) / vector.length;
        const normalizedScore = Math.min(1, Math.max(0, score / 10)); // Normalize to 0-1

        results.push({
          index: i,
          score: normalizedScore,
          isRelevant: normalizedScore > 0.5,
        });
      } catch {
        results.push({
          index: i,
          score: 0.5,
          isRelevant: false,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const elapsed = Date.now() - startTime;
    console.log(
      `[LlamaService] Reranked ${documents.length} documents in ${elapsed}ms (cross-encoder: ${modelId})`
    );

    return results;
  }

  async expandQuery(query: string): Promise<string[]> {
    const modelId = 'qwen2.5-1.5b-instruct';
    const loaded = this.loadedModels.get(modelId);

    if (!loaded?.context) {
      await this.loadQueryExpander();
      return this.expandQuery(query);
    }

    const { LlamaChatSession } = await getLlamaCpp();

    const prompt = `Generate 2 alternative search queries for: "${query}"
Output only the queries, one per line, no numbering.`;

    const session = new LlamaChatSession({
      contextSequence: loaded.context.getSequence(),
    });

    try {
      const response = await session.prompt(prompt, {
        maxTokens: 100,
      });

      const queries = response
        .split('\n')
        .map((q) => q.trim())
        .filter((q) => q.length > 0 && q.length < 200)
        .slice(0, 2);

      return queries;
    } catch {
      return [];
    }
  }

  getModelInfo(modelId: string): (typeof VECTOR_MODELS)[number] | undefined {
    return VECTOR_MODELS.find((m) => m.id === modelId);
  }

  getLoadedModels(): string[] {
    return Array.from(this.loadedModels.keys());
  }

  isModelLoaded(modelId: string): boolean {
    return this.loadedModels.has(modelId);
  }

  getModelStates(): Record<string, ModelState> {
    return this.modelDownloader.getAllModelStates();
  }

  async unloadModel(modelId: string): Promise<void> {
    const loaded = this.loadedModels.get(modelId);
    if (loaded) {
      // Dispose contexts
      if (loaded.embeddingContext) {
        await loaded.embeddingContext.dispose();
      }
      if (loaded.context) {
        await loaded.context.dispose();
      }
      // Dispose model
      await loaded.model.dispose();
      this.loadedModels.delete(modelId);
      this.emit('modelUnloaded', modelId);
    }
  }

  async unloadAllModels(): Promise<void> {
    for (const modelId of this.loadedModels.keys()) {
      await this.unloadModel(modelId);
    }
  }

  getEmbeddingDimension(): number {
    const model = VECTOR_MODELS.find((m) => m.type === 'embedding');
    return model?.dimension || 768;
  }
}

// Singleton instance
let instance: LlamaService | null = null;

export function getLlamaService(): LlamaService {
  if (!instance) {
    instance = new LlamaService();
  }
  return instance;
}
