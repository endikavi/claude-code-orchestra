# Semantic Search - Tuning Guide

This document describes the semantic search configuration options and provides benchmarks to help you choose the optimal settings.

## Quick Start (Recommended Defaults)

The default configuration is optimized for the best balance of speed, accuracy, and reliability:

```typescript
{
  enabled: true,
  useReranking: true,
  rerankStrategy: 'embedding',  // Fast and reliable
  useQueryExpansion: false,     // Disabled by default (adds latency)
  minimumScore: 0.05,           // Filter very low relevance results
  indexPatterns: ['**/*.md', '**/*.ts', '**/*.tsx']
}
```

**Why `embedding` as default?**

| Criteria | embedding | bge/jina | qwen3 |
|----------|-----------|----------|-------|
| Speed | ~1s | ~0.3-0.5s | ~6s |
| Score range | 0.4-0.5 | 0.06-0.09 | ~0.31 (broken) |
| Discrimination | Excellent | Good | None |
| Extra download | No | Yes (~300-500MB) | Yes (~600MB) |
| Reliability | Stable | Stable | Unstable |

**Key reasons:**
1. **No extra download** - Uses the embedding model already required for indexing
2. **Higher scores** - Produces scores in 0.4-0.5 range (easier to interpret)
3. **Good discrimination** - Clear difference between relevant and irrelevant results
4. **Reliable** - Works consistently with llama.cpp

---

## Reranking Strategies

| Strategy | Speed | Quality | Model Required | Notes |
|----------|-------|---------|----------------|-------|
| `none` | Fastest (~30ms) | Basic | None | Uses only BM25 + vector fusion |
| `embedding` | Fast (~1-2s) | Good | qwen3-embedding-0.6b | **Recommended default** |
| `bge-v2-m3` | Slow (~3-5s) | Variable | bge-reranker-v2-m3 | Cross-encoder, needs separate model |
| `jina-v2` | Slow (~3-5s) | Variable | jina-reranker-v2-base | Cross-encoder, needs separate model |
| `qwen3` | Very Slow (~6-7s) | Poor | qwen3-reranker-0.6b | Legacy, known issues with llama.cpp |

### When to use each strategy

**`none`** - Use when:
- You need the fastest possible response
- Your queries are very specific (exact term matching)
- You're doing batch operations

**`embedding`** - Use when:
- You want good quality with reasonable speed (default)
- You're doing conceptual/semantic queries
- You want consistent, predictable results

**`bge-v2-m3` / `jina-v2`** - Use when:
- You need more precise document matching (they find exact files better)
- You've downloaded the additional model (~300-500MB)
- You want faster reranking after initial model load (~300ms vs ~1s)
- **Important**: Lower your `minimumScore` to 0.03 (these produce lower scores)

**`qwen3`** - Not recommended:
- Known issues with llama.cpp produce uniform scores
- Kept for backwards compatibility and debugging

---

## Benchmark Results

Tests performed on a project with 277 files, 2287 chunks indexed.

### Query 1: "How does ProcessManager handle instances"

| Strategy | Time | Top Result | Top Scores | Verdict |
|----------|------|------------|------------|---------|
| none | 30ms | roadmap.md | 0.083, 0.082 | Basic |
| **embedding** | **1427ms** | handlers.ts | **0.499, 0.492** | Good scores |
| bge-v2-m3 | 1961ms | **ProcessManager.ts** | 0.072, 0.070 | Best match |
| jina-v2 | 1495ms | roadmap.md | 0.071, 0.069 | OK |
| qwen3 | 6500ms | varies | 0.311, 0.311 | Broken |

### Query 2: "authentication and security"

| Strategy | Time | Top Result | Top Scores | Verdict |
|----------|------|------------|------------|---------|
| none | 29ms | security-model.md | 0.106, 0.083 | Good match |
| embedding | 884ms | remote-access.md | 0.477, 0.471 | High scores, OK match |
| **bge-v2-m3** | **473ms** | **security-model.md** | 0.087, 0.073 | **Best match** |
| **jina-v2** | **259ms** | **security-model.md** | 0.086, 0.072 | **Best match** |
| qwen3 | 6262ms | varies | 0.312, 0.311 | Broken |

### Query 3: "IPC communication between processes"

| Strategy | Time | Top Result | Top Scores | Verdict |
|----------|------|------------|------------|---------|
| none | 30ms | ipc-channels-ref.md | 0.110, 0.109 | Good match |
| **embedding** | **1146ms** | preload.ts | **0.480, 0.479** | High scores |
| bge-v2-m3 | ~500ms | ipc-channels.md | 0.07x | Good match |
| jina-v2 | ~300ms | ipc-channels.md | 0.07x | Good match |
| qwen3 | 6387ms | varies | 0.312, 0.311 | Broken |

### Key Findings

1. **Embedding produces highest scores** (0.4-0.5) with good discrimination
2. **BGE/Jina find more precise matches** but with lower scores (0.06-0.09)
3. **BGE/Jina are faster** when the model is already loaded (~300-500ms)
4. **qwen3 is broken**: All scores converge to ~0.311 due to llama.cpp issues
5. **Cross-encoders need lower minimumScore** (use 0.03 instead of 0.05)

---

## Configuration Options

### `minimumScore` (default: 0.05)

Filters out results below this score threshold. Useful for removing noise.

```typescript
// Only return results with score >= 0.1
{ minimumScore: 0.1 }
```

**Recommendations:**
- `0.05` - Default, includes most potentially relevant results
- `0.1` - Stricter, fewer but more relevant results
- `0.2` - Very strict, only highly relevant results

### `useQueryExpansion` (default: false)

Generates alternative phrasings of your query to improve recall. Adds ~2-3s latency.

```typescript
// Enable query expansion (slower but better recall)
{ useQueryExpansion: true }
```

**When to enable:**
- Searching for concepts that might be described differently
- When initial searches return too few results
- For exploratory searches

### `indexPatterns` (default: ['**/*.md'])

Glob patterns for files to index.

```typescript
// Index markdown, TypeScript, and config files
{ indexPatterns: ['**/*.md', '**/*.ts', '**/*.tsx', '**/*.json'] }
```

**Common patterns:**
- `**/*.md` - Documentation only
- `**/*.ts` - TypeScript source
- `docs/**` - Only docs folder
- `src/**/*.{ts,tsx}` - Source code only

---

## Troubleshooting

### Slow searches (>5s)

1. Check which reranking strategy is being used
2. Switch to `embedding` if using `qwen3` or cross-encoders
3. Disable reranking entirely for fastest results: `{ useReranking: false }`

### Uniform scores (all ~0.3)

This indicates the qwen3 reranker issue. Switch to `embedding` strategy:

```typescript
{ rerankStrategy: 'embedding' }
```

### No results returned

1. Check that the project is indexed (use `search_index_status`)
2. Lower the `minimumScore` threshold
3. Verify your `indexPatterns` include the files you expect

### Results not relevant

1. Try enabling query expansion: `{ useQueryExpansion: true }`
2. Rephrase your query to be more specific
3. Use English queries for best results (the embedding model is optimized for English)

---

## API Usage

### Via MCP Tool

```typescript
semantic_search({
  query: "how does authentication work",
  limit: 10,
  useReranking: true,
  rerankStrategy: "embedding",
  filter: {
    filePath: "docs/**"  // Only search in docs folder
  }
})
```

### Via Dashboard

Project Settings > Vector Search > Configure reranking options

---

## Model Requirements

| Strategy | Required Model | Size | Download |
|----------|---------------|------|----------|
| embedding | qwen3-embedding-0.6b | ~639MB | Auto (required for indexing) |
| bge-v2-m3 | bge-reranker-v2-m3 | ~541MB | Dashboard > Models |
| jina-v2 | jina-reranker-v2-base | ~265MB | Dashboard > Models |
| qwen3 | qwen3-reranker-0.6b | ~639MB | Dashboard > Models |

The `embedding` strategy reuses the embedding model, so no additional download is needed.
