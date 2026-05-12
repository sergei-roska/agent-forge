export interface FileFingerprint {
  filePath: string;
  size: number;
  mtimeMs: number;
  contentHash: string;
}

export interface ChunkRecord {
  chunkId: string;
  filePath: string;
  absolutePath: string;
  language: string;
  startLine: number;
  endLine: number;
  text: string;
  summary: string;
  tags: string[];
  contentHash: string;
  lastCommitHash: string | null;
  embeddingModel: string | null;
  vector: number[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  resultId: string;
  chunkId: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  score: number;
  semanticScore: number;
  keywordScore: number;
  hybridScore: number;
  summary: string;
  tags: string[];
  excerpt: string;
}

export interface ContextPack {
  summary: string;
  files: Array<{
    filePath: string;
    chunkIds: string[];
    charCount: number;
  }>;
  excerpts: Array<{
    chunkId: string;
    filePath: string;
    startLine: number;
    endLine: number;
    text: string;
    summary: string;
    tags: string[];
  }>;
  budget: {
    maxChars: number;
    usedChars: number;
  };
  truncated: boolean;
  warnings: string[];
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  backend: string;
  warnings: string[];
}

export interface EnrichmentResult {
  summary: string;
  tags: string[];
  backend: string;
  warnings: string[];
}

export interface RerankResult {
  orderedChunkIds: string[];
  backend: string;
  warnings: string[];
}
