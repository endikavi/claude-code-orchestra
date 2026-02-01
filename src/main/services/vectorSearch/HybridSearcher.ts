import { getLlamaService, LlamaService } from './LlamaService';
import { VectorIndexService } from './VectorIndexService';
import { createReranker, Reranker, RerankResult } from './Rerankers';
import type {
  SearchResult,
  SearchOptions,
  SearchResponse,
  SearchPipelineConfig,
  RRFFusionConfig,
  BlendConfig,
  RerankStrategy,
} from '@shared/types/vectorSearch';

// RRF (Reciprocal Rank Fusion) score calculation
function rrfScore(rank: number, k: number = 60): number {
  return 1 / (k + rank);
}

// Merge results from multiple search strategies using RRF
function mergeWithRRF(
  resultSets: { results: SearchResult[]; weight: number }[],
  config: RRFFusionConfig
): SearchResult[] {
  const scoreMap = new Map<string, { result: SearchResult; score: number }>();

  for (const { results, weight } of resultSets) {
    for (let rank = 0; rank < results.length; rank++) {
      const result = results[rank];
      const chunkId = result.chunk.id;

      // Calculate RRF score with weight
      let score = rrfScore(rank + 1, config.k) * weight;

      // Add top-rank bonus for first few results
      if (rank < 3) {
        score += config.topRankBonus;
      }

      const existing = scoreMap.get(chunkId);
      if (existing) {
        // Accumulate scores from multiple retrievers
        existing.score += score;
        // Merge individual scores
        if (result.bm25Score && !existing.result.bm25Score) {
          existing.result.bm25Score = result.bm25Score;
        }
        if (result.vectorScore && !existing.result.vectorScore) {
          existing.result.vectorScore = result.vectorScore;
        }
      } else {
        scoreMap.set(chunkId, { result: { ...result }, score });
      }
    }
  }

  // Sort by combined score
  const merged = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ result, score }) => ({
      ...result,
      score,
    }));

  return merged;
}

// Position-aware blending of RRF and reranker scores
function blendScores(
  results: SearchResult[],
  rerankerResults: RerankResult[],
  config: BlendConfig
): SearchResult[] {
  // Create a map of reranker scores by chunk ID
  const rerankerScoreMap = new Map<number, { score: number; isRelevant: boolean }>();
  for (const rr of rerankerResults) {
    rerankerScoreMap.set(rr.index, { score: rr.score, isRelevant: rr.isRelevant });
  }

  return results.map((result, index) => {
    const rerankerData = rerankerScoreMap.get(index);
    if (!rerankerData) return result;

    // Determine blend weight based on position
    let rrfWeight: number;
    if (index < 3) {
      rrfWeight = config.top1to3RrfWeight;
    } else if (index < 10) {
      rrfWeight = config.top4to10RrfWeight;
    } else {
      rrfWeight = config.top11PlusRrfWeight;
    }

    const rerankerWeight = 1 - rrfWeight;

    // Blend the scores
    const blendedScore = result.score * rrfWeight + rerankerData.score * rerankerWeight;

    return {
      ...result,
      score: blendedScore,
      rerankerScore: rerankerData.score,
    };
  });
}

export class HybridSearcher {
  private indexService: VectorIndexService;
  private llamaService: LlamaService;
  private config: SearchPipelineConfig;
  private reranker: Reranker | null = null;

  constructor(indexService: VectorIndexService, config?: Partial<SearchPipelineConfig>) {
    this.indexService = indexService;
    this.llamaService = getLlamaService();
    this.config = {
      bm25Enabled: true,
      vectorEnabled: true,
      rerankingEnabled: true,
      rerankStrategy: 'embedding',
      queryExpansionEnabled: false,
      maxCandidates: 10,
      finalLimit: 5,
      minimumScore: 0.05,
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
      ...config,
    };

    // Create reranker based on configured strategy
    if (this.config.rerankingEnabled && this.config.rerankStrategy !== 'none') {
      this.reranker = createReranker(this.config.rerankStrategy, this.llamaService);
    }
  }

  async search(options: SearchOptions): Promise<SearchResponse> {
    const startTime = Date.now();
    const phases: SearchResponse['phases'] = {};

    const {
      query,
      limit = this.config.finalLimit,
      useReranking,
      rerankStrategy,
      useQueryExpansion,
      minimumScore,
      filter,
    } = options;

    // Override config with options if provided
    const doReranking = useReranking ?? this.config.rerankingEnabled;
    const doQueryExpansion = useQueryExpansion ?? this.config.queryExpansionEnabled;
    const minScore = minimumScore ?? this.config.minimumScore;

    // Determine which reranker to use (option overrides config)
    let activeReranker = this.reranker;
    let activeStrategy: RerankStrategy = this.config.rerankStrategy;

    if (rerankStrategy && rerankStrategy !== this.config.rerankStrategy) {
      // Create a different reranker for this request
      activeReranker = createReranker(rerankStrategy, this.llamaService);
      activeStrategy = rerankStrategy;
    }

    // Step 1: Query expansion (optional)
    let queries = [query];
    let expandedQueries: string[] | undefined;

    if (doQueryExpansion) {
      const qeStart = Date.now();
      try {
        const expanded = await this.llamaService.expandQuery(query);
        if (expanded.length > 0) {
          expandedQueries = expanded;
          queries = [query, ...expanded];
        }
      } catch (error) {
        console.error('Query expansion failed:', error);
      }
      phases.queryExpansionTimeMs = Date.now() - qeStart;
    }

    // Step 2: Run BM25 and vector search for each query
    const allResultSets: { results: SearchResult[]; weight: number }[] = [];

    for (let qIdx = 0; qIdx < queries.length; qIdx++) {
      const q = queries[qIdx];
      // Original query gets higher weight
      const weight = qIdx === 0 ? this.config.rrf.originalQueryWeight : 1;

      // BM25 Search
      if (this.config.bm25Enabled) {
        const bm25Start = Date.now();
        try {
          const bm25Results = await this.indexService.searchBM25(
            q,
            this.config.maxCandidates,
            filter
          );
          allResultSets.push({ results: bm25Results, weight });
          if (qIdx === 0) {
            phases.bm25TimeMs = Date.now() - bm25Start;
          }
        } catch (error) {
          console.error('BM25 search failed:', error);
        }
      }

      // Vector Search
      if (this.config.vectorEnabled) {
        const vecStart = Date.now();
        try {
          const queryEmbedding = await this.llamaService.embed(q);
          const vectorResults = await this.indexService.searchVector(
            queryEmbedding,
            this.config.maxCandidates,
            filter
          );
          allResultSets.push({ results: vectorResults, weight });
          if (qIdx === 0) {
            phases.vectorTimeMs = Date.now() - vecStart;
          }
        } catch (error) {
          console.error('Vector search failed:', error);
        }
      }
    }

    // Step 3: RRF Fusion
    const fusionStart = Date.now();
    let fusedResults = mergeWithRRF(allResultSets, this.config.rrf);
    // Keep top N candidates for reranking
    fusedResults = fusedResults.slice(0, this.config.maxCandidates);
    phases.fusionTimeMs = Date.now() - fusionStart;

    // Step 4: Re-ranking (optional)
    let usedStrategy: RerankStrategy | undefined;

    if (doReranking && activeReranker && fusedResults.length > 0) {
      const rerankStart = Date.now();
      try {
        const documents = fusedResults.map((r) => r.chunk.content);
        const rerankerResults = await activeReranker.rerank(query, documents);

        // Blend RRF scores with reranker scores
        fusedResults = blendScores(fusedResults, rerankerResults, this.config.blend);

        // Re-sort by blended score
        fusedResults.sort((a, b) => b.score - a.score);

        phases.rerankTimeMs = Date.now() - rerankStart;
        usedStrategy = activeStrategy;
      } catch (error) {
        console.error('Re-ranking failed:', error);
      }
    }

    // Step 5: Filter by minimum score
    if (minScore > 0) {
      fusedResults = fusedResults.filter((r) => r.score >= minScore);
    }

    // Step 6: Return top results
    const finalResults = fusedResults.slice(0, limit);

    return {
      results: finalResults,
      query,
      expandedQueries,
      totalCandidates: fusedResults.length,
      searchTimeMs: Date.now() - startTime,
      rerankStrategy: usedStrategy,
      phases,
    };
  }

  // Simple search without query expansion or reranking
  async quickSearch(query: string, limit: number = 5): Promise<SearchResult[]> {
    const response = await this.search({
      query,
      limit,
      useReranking: false,
      useQueryExpansion: false,
    });
    return response.results;
  }

  // Full pipeline search with all features
  async deepSearch(query: string, limit: number = 10): Promise<SearchResponse> {
    return this.search({
      query,
      limit,
      useReranking: true,
      useQueryExpansion: true,
    });
  }

  updateConfig(config: Partial<SearchPipelineConfig>): void {
    const oldStrategy = this.config.rerankStrategy;
    this.config = { ...this.config, ...config };

    // Recreate reranker if strategy changed
    if (config.rerankStrategy && config.rerankStrategy !== oldStrategy) {
      if (this.config.rerankingEnabled && this.config.rerankStrategy !== 'none') {
        this.reranker = createReranker(this.config.rerankStrategy, this.llamaService);
      } else {
        this.reranker = null;
      }
    }
  }

  getConfig(): SearchPipelineConfig {
    return { ...this.config };
  }

  getRerankerInfo(): { strategy: RerankStrategy; displayName: string } | null {
    if (!this.reranker) return null;
    return {
      strategy: this.reranker.name,
      displayName: this.reranker.displayName,
    };
  }
}

export function createHybridSearcher(
  indexService: VectorIndexService,
  config?: Partial<SearchPipelineConfig>
): HybridSearcher {
  return new HybridSearcher(indexService, config);
}
