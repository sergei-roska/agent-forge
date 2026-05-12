import { DEFAULT_EMBED_MODEL, getServerConfig } from '../config.js';
import { OllamaClient } from '../services/ollama.js';
import { ProjectStateStore } from '../store/sqlite.js';
import { ProjectVectorStore, VectorRecord } from '../store/vectorStore.js';
import { extractTechnicalIdentifiers } from './IdentifierExtractor.js';
import type { ChunkRecord, ContextPack, SearchResult } from '../types.js';
import { buildSearchResultId, clamp, uniqueStrings } from '../utils.js';

export class SearchService {
  constructor(
    private readonly store: ProjectStateStore,
    private readonly vectorStore: ProjectVectorStore,
    private readonly ollama: OllamaClient,
  ) {}

  async searchHybrid(query: string, limit: number, offset: number, alpha: number = 0.65, rrfK: number = 60): Promise<{
    results: SearchResult[];
    warnings: string[];
  }> {
    const config = getServerConfig();
    const warnings: string[] = [];
    
    // 1. Semantic Search
    let semanticMatches: any[] = [];
    try {
      const embedded = await this.ollama.embed([query], DEFAULT_EMBED_MODEL);
      warnings.push(...embedded.warnings);
      const queryVector = embedded.vectors[0] || [];
      if (queryVector.length > 0) {
        semanticMatches = await this.vectorStore.searchSemantic(queryVector, config.topKBeforeRerank);
      }
    } catch (err: any) {
      warnings.push(`Semantic search failed: ${err.message}`);
    }

    // 2. Keyword Search (using LanceDB FTS)
    let keywordMatches: any[] = [];
    try {
      keywordMatches = await this.vectorStore.searchFts(query, config.topKBeforeRerank);
    } catch (err: any) {
      warnings.push(`Keyword search failed: ${err.message}`);
    }

    // 3. Identifier Boost
    const identifiers = extractTechnicalIdentifiers(query);
    const identifierBoostedIds = new Set<string>();
    // Small boost for exact identifier matches in file paths or text
    
    // 4. RRF Fusion
    const fused = new Map<string, { result: SearchResult; semanticRank?: number; keywordRank?: number }>();
    
    semanticMatches.forEach((m, i) => {
      const chunkId = m.chunk_id;
      fused.set(chunkId, { 
        result: this.mapVectorToSearchResult(query, m), 
        semanticRank: i + 1 
      });
    });

    keywordMatches.forEach((m, i) => {
      const chunkId = m.chunk_id;
      const existing = fused.get(chunkId);
      if (existing) {
        existing.keywordRank = i + 1;
      } else {
        fused.set(chunkId, { 
          result: this.mapVectorToSearchResult(query, m), 
          keywordRank: i + 1 
        });
      }
    });

    const results: SearchResult[] = [];
    for (const [chunkId, data] of fused.entries()) {
      let rrfScore = 0;
      if (data.semanticRank !== undefined) {
        rrfScore += alpha * (1 / (rrfK + data.semanticRank));
      }
      if (data.keywordRank !== undefined) {
        rrfScore += (1 - alpha) * (1 / (rrfK + data.keywordRank));
      }

      // Exact Identifier Boost
      let boost = 0;
      for (const id of identifiers) {
        if (data.result.filePath.includes(id) || data.result.excerpt.includes(id)) {
          boost += 0.05;
        }
      }

      data.result.score = rrfScore + boost;
      data.result.hybridScore = rrfScore + boost;
      results.push(data.result);
    }

    results.sort((a, b) => b.score - a.score);

    // 5. Relevance Gap Filtering (Spec 08.2 §2.4)
    // If the top score is significantly higher than others, filter out the tail.
    const filteredResults = this.applyRelevanceGap(results);

    return {
      results: filteredResults.slice(offset, offset + limit),
      warnings: uniqueStrings(warnings)
    };
  }

  private applyRelevanceGap(results: SearchResult[]): SearchResult[] {
    if (results.length < 2) return results;
    const topScore = results[0].score;
    // Simple gap: remove everything below 20% of top score if top score is high
    if (topScore > 0.1) {
      return results.filter(r => r.score > topScore * 0.2);
    }
    return results;
  }

  private mapVectorToSearchResult(query: string, m: any): SearchResult {
    return {
      resultId: buildSearchResultId(query, m.chunk_id),
      chunkId: m.chunk_id,
      filePath: m.file_path,
      language: m.language,
      startLine: m.start_line,
      endLine: m.end_line,
      score: 0, 
      semanticScore: 0,
      keywordScore: 0,
      hybridScore: 0,
      summary: m.summary || '',
      tags: m.tags || [],
      excerpt: m.text.slice(0, 500)
    };
  }

  async getChunkNeighbors(chunkId: string, hops: number): Promise<ChunkRecord[]> {
    const main = await this.vectorStore.getChunk(chunkId);
    if (!main) return [];
    
    // For now, we'll just get chunks from the same file in order
    // In a more advanced version, we'd use LanceDB to find chunks by filePath + line proximity
    const db = await (import('@lancedb/lancedb').then(m => m.connect(join(this.vectorStore['projectDataDir'], 'lancedb'))));
    const table = await db.openTable('chunks');
    const results = await table.query()
      .where(`file_path = '${main.file_path}' AND start_line >= ${main.start_line - 500} AND start_line <= ${main.start_line + 500}`)
      .toArray();
    
    return (results as any[]).map(r => ({
      chunkId: r.chunk_id,
      filePath: r.file_path,
      absolutePath: '', // absolute path not stored in vec store for privacy/portability
      language: r.language,
      startLine: r.start_line,
      endLine: r.end_line,
      text: r.text,
      summary: r.summary,
      tags: r.tags || [],
      contentHash: r.content_hash,
      createdAt: '',
      updatedAt: ''
    }));
  }
}
