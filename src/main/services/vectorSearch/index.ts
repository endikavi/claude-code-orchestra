// Vector Search Services
export { ModelDownloader, getModelDownloader } from './ModelDownloader';
export { LlamaService, getLlamaService } from './LlamaService';
export {
  chunkMarkdown,
  calculateFileHash,
  extractCodeLanguages,
  countWords,
} from './MarkdownChunker';
export {
  VectorIndexService,
  getVectorIndexService,
  closeVectorIndexService,
} from './VectorIndexService';
export { HybridSearcher, createHybridSearcher } from './HybridSearcher';
export {
  createReranker,
  getAvailableStrategies,
  EmbeddingReranker,
  Qwen3Reranker,
  BGEReranker,
  JinaReranker,
  type Reranker,
  type RerankResult,
  type RerankStrategy,
} from './Rerankers';
