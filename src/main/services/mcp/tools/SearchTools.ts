import { McpToolDefinition } from '@shared/types/mcp';
import { DataStore } from '../../DataStore';
import {
  getVectorIndexService,
  createHybridSearcher,
  getLlamaService,
  getModelDownloader,
} from '../../vectorSearch';
import type { SearchOptions, SearchFilter } from '@shared/types/vectorSearch';

/**
 * Register semantic search MCP tools
 * These tools allow Claude instances to search project documentation using
 * semantic understanding and AI re-ranking
 */
export function registerSearchTools(tools: Map<string, McpToolDefinition>): void {
  const dataStore = DataStore.getInstance();

  // Tool 1: Semantic Search
  tools.set('semantic_search', {
    name: 'semantic_search',
    description:
      'Search project documentation using semantic understanding and AI re-ranking. ' +
      'More accurate than grep for finding conceptually related content. ' +
      'Uses hybrid search (BM25 + vector embeddings) with optional LLM re-ranking for best results. ' +
      'Returns relevant chunks with file paths, line numbers, and relevance scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query describing what you are looking for',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default: 5, max: 20)',
        },
        useReranking: {
          type: 'boolean',
          description: 'Use re-ranking for better accuracy. Default: true',
        },
        rerankStrategy: {
          type: 'string',
          enum: ['none', 'embedding', 'bge-v2-m3', 'jina-v2', 'qwen3'],
          description:
            'Reranking strategy: "embedding" (fast, reliable), "bge-v2-m3" or "jina-v2" (cross-encoder), "qwen3" (legacy). Default: embedding',
        },
        useQueryExpansion: {
          type: 'boolean',
          description:
            'Expand query with alternative phrasings (slower but better recall). Default: false',
        },
        filter: {
          type: 'object',
          description: 'Optional filters to narrow search results',
          properties: {
            filePath: {
              type: 'string',
              description: 'Glob pattern to filter files (e.g., "**/*.md", "docs/**")',
            },
            hasCode: {
              type: 'boolean',
              description: 'Only return chunks containing code blocks',
            },
          },
        },
      },
      required: ['query'],
    },
    handler: async (args, context) => {
      try {
        const project = dataStore.getProjectById(context.projectId);
        if (!project) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { error: 'Project not found', projectId: context.projectId },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Get or create index service for this project
        const indexService = getVectorIndexService(
          context.projectId,
          project.path,
          project.vectorSearchConfig
        );
        await indexService.initialize();

        // Check if index exists
        if (!indexService.hasIndex()) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'Index not found',
                    message:
                      'No search index exists for this project. ' +
                      'Please use the dashboard to index the project first, ' +
                      'or use search_index_status to check the current state.',
                    suggestion:
                      'Index the project via Dashboard > Project Settings > Vector Search',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Build search options
        const options: SearchOptions = {
          query: String(args.query),
          limit: Math.min(Math.max(1, Number(args.limit) || 5), 20),
          useReranking: args.useReranking !== false, // default true
          rerankStrategy: args.rerankStrategy as SearchOptions['rerankStrategy'],
          useQueryExpansion: args.useQueryExpansion === true, // default false
        };

        // Add filter if provided
        if (args.filter && typeof args.filter === 'object') {
          const filter = args.filter as Record<string, unknown>;
          options.filter = {};
          if (filter.filePath && typeof filter.filePath === 'string') {
            options.filter.filePath = filter.filePath;
          }
          if (typeof filter.hasCode === 'boolean') {
            options.filter.hasCode = filter.hasCode;
          }
        }

        // Create searcher and run search
        const searcher = createHybridSearcher(indexService, {
          rerankingEnabled: options.useReranking,
          queryExpansionEnabled: options.useQueryExpansion,
        });

        const response = await searcher.search(options);

        // Format results for Claude
        const formattedResults = response.results.map((r, idx) => ({
          rank: idx + 1,
          filePath: r.chunk.filePath,
          lines: `${r.chunk.startLine}-${r.chunk.endLine}`,
          score: Math.round(r.score * 1000) / 1000,
          headings: r.chunk.metadata.headingPath.join(' > ') || null,
          hasCode: r.chunk.metadata.hasCode,
          codeLanguages:
            r.chunk.metadata.codeLanguages.length > 0 ? r.chunk.metadata.codeLanguages : undefined,
          content: r.chunk.content.slice(0, 500) + (r.chunk.content.length > 500 ? '...' : ''),
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query: options.query,
                  expandedQueries: response.expandedQueries,
                  totalCandidates: response.totalCandidates,
                  returned: formattedResults.length,
                  searchTimeMs: response.searchTimeMs,
                  results: formattedResults,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: error instanceof Error ? error.message : 'Search failed',
                  suggestion: 'Check that models are downloaded and the project is indexed',
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    },
  });

  // Tool 2: Search Index Status
  tools.set('search_index_status', {
    name: 'search_index_status',
    description:
      'Check if semantic search is available for this project. ' +
      'Returns information about the search index and required models. ' +
      'Use this to verify search capabilities before using semantic_search.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async (_args, context) => {
      try {
        const project = dataStore.getProjectById(context.projectId);
        if (!project) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { error: 'Project not found', projectId: context.projectId },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Get index service status
        const indexService = getVectorIndexService(
          context.projectId,
          project.path,
          project.vectorSearchConfig
        );
        await indexService.initialize();

        const hasIndex = indexService.hasIndex();
        const stats = indexService.getStats();

        // Get model status
        const modelDownloader = getModelDownloader();
        const modelStates = modelDownloader.getAllModelStates();

        const embeddingReady =
          modelStates['qwen3-embedding-0.6b']?.status === 'downloaded' ||
          modelStates['qwen3-embedding-0.6b']?.status === 'loaded';
        const rerankerReady =
          modelStates['qwen3-reranker-0.6b']?.status === 'downloaded' ||
          modelStates['qwen3-reranker-0.6b']?.status === 'loaded';

        const searchReady = hasIndex && embeddingReady;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  searchReady,
                  index: {
                    exists: hasIndex,
                    totalFiles: stats.totalFiles,
                    totalChunks: stats.totalChunks,
                    lastIndexedAt: stats.lastIndexedAt
                      ? new Date(stats.lastIndexedAt).toISOString()
                      : null,
                    embeddingModel: stats.embeddingModel,
                    databaseSizeMB: Math.round((stats.databaseSizeBytes / 1024 / 1024) * 10) / 10,
                  },
                  models: {
                    embedding: {
                      id: 'qwen3-embedding-0.6b',
                      ready: embeddingReady,
                      status: modelStates['qwen3-embedding-0.6b']?.status || 'not_downloaded',
                    },
                    reranker: {
                      id: 'qwen3-reranker-0.6b',
                      ready: rerankerReady,
                      status: modelStates['qwen3-reranker-0.6b']?.status || 'not_downloaded',
                      note: 'Optional, improves result quality',
                    },
                  },
                  config: {
                    enabled: project.vectorSearchConfig?.enabled ?? true,
                    useReranking: project.vectorSearchConfig?.useReranking ?? true,
                    useQueryExpansion: project.vectorSearchConfig?.useQueryExpansion ?? false,
                    indexPatterns: project.vectorSearchConfig?.indexPatterns ?? ['**/*.md'],
                  },
                  instructions: searchReady
                    ? 'Search is ready. Use semantic_search to find relevant documentation.'
                    : hasIndex
                      ? 'Index exists but embedding model is not downloaded. Download models via Dashboard.'
                      : 'Project needs to be indexed. Use Dashboard > Project Settings > Vector Search to index.',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: error instanceof Error ? error.message : 'Status check failed' },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    },
  });

  console.log('[MCP] Registered 2 search tools');
}
