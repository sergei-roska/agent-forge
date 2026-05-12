import type { ChunkRecord } from '../types.js';
import { buildChunkId, detectLanguage, nowIso, sha256 } from '../utils.js';

export interface ChunkOptions {
  projectPath: string;
  absolutePath: string;
  filePath: string;
  text: string;
  chunkLines: number;
  overlapLines: number;
  summaryByRange?: Map<string, { summary: string; tags: string[] }>;
  lastCommitHash?: string | null;
}

export function chunkFile(options: ChunkOptions): ChunkRecord[] {
  const {
    projectPath,
    absolutePath,
    filePath,
    text,
    chunkLines,
    overlapLines,
    summaryByRange,
    lastCommitHash = null,
  } = options;

  const lines = text.split('\n');
  const createdAt = nowIso();
  const chunks: ChunkRecord[] = [];
  const language = detectLanguage(filePath);
  let start = 0;

  while (start < lines.length) {
    const end = Math.min(lines.length, start + chunkLines);
    const slice = lines.slice(start, end).join('\n').trimEnd();
    if (slice.trim().length > 0) {
      const startLine = start + 1;
      const endLine = end;
      const contentHash = sha256(slice);
      const rangeKey = `${startLine}:${endLine}`;
      const enrich = summaryByRange?.get(rangeKey);
      chunks.push({
        chunkId: buildChunkId(projectPath, filePath, startLine, endLine, contentHash),
        filePath,
        absolutePath,
        language,
        startLine,
        endLine,
        text: slice,
        summary: enrich?.summary ?? slice.split('\n').find((line) => line.trim().length > 0)?.trim().slice(0, 180) ?? '',
        tags: enrich?.tags ?? [language],
        contentHash,
        lastCommitHash,
        embeddingModel: null,
        vector: null,
        createdAt,
        updatedAt: createdAt,
      });
    }

    if (end >= lines.length) {
      break;
    }
    start = Math.max(end - overlapLines, start + 1);
  }

  return chunks;
}
