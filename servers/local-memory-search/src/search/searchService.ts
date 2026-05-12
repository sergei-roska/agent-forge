import { DEFAULT_EMBED_MODEL, getServerConfig } from '../config.js';
import { OllamaClient } from '../services/ollama.js';
import { ProjectStateStore } from '../store/sqlite.js';
import type { ChunkRecord, ContextPack, SearchResult } from '../types.js';
import { buildSearchResultId, clamp, cosineSimilarity, tokenize, uniqueStrings } from '../utils.js';

export class SearchService {
  constructor(
    private readonly store: ProjectStateStore,
    private readonly ollama: OllamaClient,
  ) {}

  async searchSemantic(query: string, limit: number, offset: number): Promise<{ results: SearchResult[]; warnings: string[]; backend: string }> {
    const embedded = await this.ollama.embed([query], DEFAULT_EMBED_MODEL);
    const warnings = [...embedded.warnings];
    const queryVector = embedded.vectors[0] ?? [];

    if (queryVector.length === 0) {
      return { results: [], warnings: [...warnings, 'No query embedding could be produced.'], backend: embedded.backend };
    }

    const results = this.store.listChunks()
      .filter((chunk) => Array.isArray(chunk.vector) && chunk.vector.length === queryVector.length)
      .map((chunk) => {
        const semanticScore = cosineSimilarity(queryVector, chunk.vector ?? []);
        return this.buildSearchResult(query, chunk, {
          semanticScore,
          keywordScore: 0,
          hybridScore: semanticScore,
        });
      })
      .filter((result) => Number.isFinite(result.semanticScore))
      .sort((left, right) => {
        if (right.semanticScore !== left.semanticScore) {
          return right.semanticScore - left.semanticScore;
        }
        if (left.filePath !== right.filePath) {
          return left.filePath.localeCompare(right.filePath);
        }
        return left.startLine - right.startLine;
      });

    return {
      results: results.slice(offset, offset + limit),
      warnings,
      backend: embedded.backend,
    };
  }

  searchKeyword(query: string, limit: number, offset: number): { results: SearchResult[]; total: number } {
    const rows = this.store.searchKeyword(query, limit, offset);
    const total = this.store.countKeywordMatches(query);
    const results = rows.map((chunk) => {
      const keywordScore = 1 / (1 + Math.max(0, chunk.keywordRank));
      return this.buildSearchResult(query, chunk, {
        semanticScore: 0,
        keywordScore,
        hybridScore: keywordScore,
      });
    });
    return { results, total };
  }

  async searchHybrid(query: string, limit: number, offset: number, alpha: number = 0.65, rrfK: number = 60): Promise<{
    results: SearchResult[];
    warnings: string[];
    strategy: { semanticWeight: number; keywordWeight: number };
  }> {
    const config = getServerConfig();
    const keyword = this.searchKeyword(query, config.topKBeforeRerank, 0);
    let semanticResults: SearchResult[] = [];
    const warnings: string[] = [];
    let semanticAvailable = true;

    try {
      const semantic = await this.searchSemantic(query, config.topKBeforeRerank, 0);
      semanticResults = semantic.results;
      warnings.push(...semantic.warnings);
      semanticAvailable = semantic.results.length > 0 || semantic.backend !== 'local-hash' || semantic.warnings.length === 0;
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
      semanticAvailable = false;
    }

    if (!semanticAvailable || semanticResults.length === 0) {
      warnings.push('Semantic retrieval unavailable; degraded to keyword-only ranking.');
      return {
        results: keyword.results.slice(offset, offset + limit),
        warnings: uniqueStrings(warnings),
        strategy: {
          semanticWeight: 0,
          keywordWeight: 1,
        },
      };
    }

    const fused = new Map<string, SearchResult>();
    const applyRrf = (results: SearchResult[], weight: number, kind: 'semantic' | 'keyword'): void => {
      results.forEach((result, index) => {
        const current = fused.get(result.chunkId) ?? { ...result };
        const rrfScore = weight * (1 / (rrfK + index + 1));
        current.hybridScore += rrfScore;
        if (kind === 'semantic') {
          current.semanticScore = Math.max(current.semanticScore, result.semanticScore);
        } else {
          current.keywordScore = Math.max(current.keywordScore, result.keywordScore);
        }
        current.score = current.hybridScore;
        fused.set(result.chunkId, current);
      });
    };

    applyRrf(semanticResults, alpha, 'semantic');
    applyRrf(keyword.results, 1 - alpha, 'keyword');

    const fusedResults = [...fused.values()].sort((left, right) => {
      if (right.hybridScore !== left.hybridScore) {
        return right.hybridScore - left.hybridScore;
      }
      if (left.filePath !== right.filePath) {
        return left.filePath.localeCompare(right.filePath);
      }
      return left.startLine - right.startLine;
    });

    return {
      results: fusedResults.slice(offset, offset + limit),
      warnings: uniqueStrings(warnings),
      strategy: {
        semanticWeight: alpha,
        keywordWeight: 1 - alpha,
      },
    };
  }

  async retrieveContextPack(
    query: string,
    maxFiles: number,
    maxChars: number,
    includeNeighbors: boolean,
    neighborHops: number,
  ): Promise<ContextPack> {
    const hybrid = await this.searchHybrid(query, getServerConfig().topKBeforeRerank, 0);
    const reranked = await this.ollama.rerank(query, hybrid.results);
    const orderedIds = reranked.orderedChunkIds;
    const reordered = orderedIds
      .map((id) => hybrid.results.find((result) => result.chunkId === id))
      .filter((result): result is SearchResult => Boolean(result));

    const selectedFiles = new Set<string>();
    const excerpts: ContextPack['excerpts'] = [];
    const files = new Map<string, { chunkIds: string[]; charCount: number }>();
    let usedChars = 0;
    let truncated = false;

    for (const result of reordered) {
      if (!selectedFiles.has(result.filePath) && selectedFiles.size >= maxFiles) {
        continue;
      }
      const baseChunk = this.store.getChunk(result.chunkId);
      if (!baseChunk) {
        continue;
      }
      const chunks = includeNeighbors
        ? this.store.listNeighborChunks(result.filePath, result.chunkId, neighborHops)
        : [baseChunk];

      selectedFiles.add(result.filePath);
      for (const chunk of chunks) {
        if (excerpts.some((item) => item.chunkId === chunk.chunkId)) {
          continue;
        }
        const text = chunk.text.trim();
        const nextSize = usedChars + text.length;
        if (nextSize > maxChars) {
          truncated = true;
          break;
        }
        usedChars = nextSize;
        excerpts.push({
          chunkId: chunk.chunkId,
          filePath: chunk.filePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          text,
          summary: chunk.summary,
          tags: chunk.tags,
        });
        const fileEntry = files.get(chunk.filePath) ?? { chunkIds: [], charCount: 0 };
        fileEntry.chunkIds.push(chunk.chunkId);
        fileEntry.charCount += text.length;
        files.set(chunk.filePath, fileEntry);
      }

      if (truncated) {
        break;
      }
    }

    return {
      summary: excerpts.length > 0
        ? `Built a context pack with ${excerpts.length} excerpt(s) across ${files.size} file(s).`
        : 'No context could be assembled from the current index.',
      files: [...files.entries()].map(([filePath, value]) => ({
        filePath,
        chunkIds: value.chunkIds,
        charCount: value.charCount,
      })),
      excerpts,
      budget: {
        maxChars,
        usedChars,
      },
      truncated,
      warnings: uniqueStrings([...hybrid.warnings, ...reranked.warnings]),
    };
  }

  private buildSearchResult(
    query: string,
    chunk: ChunkRecord,
    scores: {
      semanticScore: number;
      keywordScore: number;
      hybridScore: number;
    },
  ): SearchResult {
    const excerpt = chunk.text.split('\n').slice(0, 12).join('\n');
    const resultId = buildSearchResultId(query, chunk.chunkId);
    const lexicalHits = tokenize(query).filter((token) => {
      const haystack = `${chunk.filePath}\n${chunk.summary}\n${chunk.text}`.toLowerCase();
      return haystack.includes(token.toLowerCase());
    });
    const semanticTerms = chunk.tags.slice(0, 8);

    this.store.recordMatchAudit({
      resultId,
      chunkId: chunk.chunkId,
      query,
      semanticScore: scores.semanticScore,
      keywordScore: scores.keywordScore,
      hybridScore: scores.hybridScore,
      lexicalHits,
      semanticTerms,
    });

    return {
      resultId,
      chunkId: chunk.chunkId,
      filePath: chunk.filePath,
      language: chunk.language,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      score: scores.hybridScore,
      semanticScore: scores.semanticScore,
      keywordScore: scores.keywordScore,
      hybridScore: scores.hybridScore,
      summary: chunk.summary,
      tags: chunk.tags,
      excerpt,
    };
  }
}
