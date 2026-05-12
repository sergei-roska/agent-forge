import { SearchService } from './SearchService.js';
import { ProjectStateStore } from '../store/sqlite.js';
import { ContextPack, SearchResult } from '../types.js';

export class ContextPacker {
  constructor(
    private searchService: SearchService,
    private store: ProjectStateStore
  ) {}

  async pack(
    query: string,
    results: SearchResult[],
    options: {
      maxFiles: number;
      maxChars: number;
      includeNeighbors: boolean;
      neighborHops: number;
    }
  ): Promise<ContextPack> {
    const selectedFiles = new Set<string>();
    const excerpts: ContextPack['excerpts'] = [];
    const files = new Map<string, { chunkIds: string[]; charCount: number }>();
    let usedChars = 0;
    let truncated = false;

    // Sort results by score just in case
    const sortedResults = [...results].sort((a, b) => b.score - a.score);

    for (const result of sortedResults) {
      if (!selectedFiles.has(result.filePath) && selectedFiles.size >= options.maxFiles) {
        continue;
      }

      const chunks = options.includeNeighbors
        ? await this.searchService.getChunkNeighbors(result.chunkId, options.neighborHops)
        : [await this.searchService['vectorStore'].getChunk(result.chunkId)].filter(Boolean) as any[];

      selectedFiles.add(result.filePath);

      for (const chunk of chunks) {
        if (excerpts.some(e => e.chunkId === (chunk.chunk_id || chunk.chunkId))) {
          continue;
        }

        const text = chunk.text || chunk.raw_text;
        const nextSize = usedChars + text.length;

        if (nextSize > options.maxChars) {
          truncated = true;
          break;
        }

        usedChars = nextSize;
        excerpts.push({
          chunkId: chunk.chunk_id || chunk.chunkId,
          filePath: chunk.file_path || chunk.filePath,
          startLine: chunk.start_line || chunk.startLine,
          endLine: chunk.end_line || chunk.endLine,
          text: text,
          summary: chunk.summary,
          tags: chunk.tags || []
        });

        const f = chunk.file_path || chunk.filePath;
        const entry = files.get(f) ?? { chunkIds: [], charCount: 0 };
        entry.chunkIds.push(chunk.chunk_id || chunk.chunkId);
        entry.charCount += text.length;
        files.set(f, entry);
      }

      if (truncated) break;
    }

    return {
      summary: `Assembled ${excerpts.length} chunks across ${files.size} files.`,
      files: Array.from(files.entries()).map(([filePath, data]) => ({
        filePath,
        chunkIds: data.chunkIds,
        charCount: data.charCount
      })),
      excerpts,
      budget: {
        maxChars: options.maxChars,
        usedChars
      },
      truncated,
      warnings: []
    };
  }
}
