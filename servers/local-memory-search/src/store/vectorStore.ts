import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export interface VectorRecord {
  chunk_id: string;
  project_path: string;
  file_path: string;
  start_line: number;
  end_line: number;
  text: string;
  raw_text: string;
  vector: number[];
  language: string;
  node_type?: string | null;
  class_name?: string | null;
  function_name?: string | null;
  symbol_path?: string | null;
  content_hash: string;
  mtime_ns: number;
  last_commit_hash?: string | null;
  tags: string[];
  summary?: string | null;
  schema_version: string;
  indexed_at: number;
}

export class ProjectVectorStore {
  private readonly dbDir: string;
  private readonly tableName = 'chunks';

  constructor(private readonly projectDataDir: string) {
    this.dbDir = join(projectDataDir, 'lancedb');
  }

  private async connect(readonly = false) {
    const lancedb = await import('@lancedb/lancedb');
    await mkdir(this.dbDir, { recursive: true });
    return await lancedb.connect(this.dbDir, { readOnly: readonly });
  }

  async upsertChunks(chunks: VectorRecord[]): Promise<void> {
    if (chunks.length === 0) return;
    const db = await this.connect();
    try {
      let table;
      try {
        table = await db.openTable(this.tableName);
        // LanceDB Node SDK doesn't have a direct upsert in all versions, 
        // using merge/upsert pattern if available or just add + dedupe logic.
        // For Spec 08.1, we'll try to use merge if possible, or overwrite table if it's Phase 2 refresh.
        // However, Spec 08.1 says "upsert by chunk_id".
        await table.merge(chunks, 'chunk_id');
      } catch (err: any) {
        if (err.message.includes('not found')) {
          table = await db.createTable(this.tableName, chunks);
        } else {
          throw err;
        }
      }
    } finally {
      // db.close() is not always required in local lancedb but good practice if available
    }
  }

  async createIndices(): Promise<void> {
    const db = await this.connect();
    const table = await db.openTable(this.tableName);
    
    // ANN Index (IVF-PQ)
    // spec: num_partitions: 256, num_sub_vectors: 96
    await table.createIndex('vector', {
      config: lancedb.Index.ivfPq({
        numPartitions: 256,
        numSubVectors: 96,
        metric: 'cosine'
      }),
      replace: true
    });

    // FTS Index
    await table.createSearchIndex('text', { replace: true });
  }

  async searchSemantic(vector: number[], limit: number, filters?: string): Promise<any[]> {
    const db = await this.connect(true);
    const table = await db.openTable(this.tableName);
    let query = table.vectorSearch(vector).limit(limit).metric('cosine');
    if (filters) {
      query = query.where(filters);
    }
    return await query.toArray();
  }

  async searchFts(text: string, limit: number, filters?: string): Promise<any[]> {
    const db = await this.connect(true);
    const table = await db.openTable(this.tableName);
    let query = table.fullTextSearch(text).limit(limit);
    if (filters) {
      query = query.where(filters);
    }
    return await query.toArray();
  }

  async getChunk(chunkId: string): Promise<VectorRecord | null> {
    const db = await this.connect(true);
    const table = await db.openTable(this.tableName);
    const results = await table.query().where(`chunk_id = '${chunkId}'`).limit(1).toArray();
    return (results[0] as VectorRecord) || null;
  }

  async deleteProject(projectPath: string): Promise<number> {
    const db = await this.connect();
    try {
      const table = await db.openTable(this.tableName);
      // Delete rows matching project_path
      await table.delete(`project_path = '${projectPath}'`);
      return 0; // return deleted count if possible
    } catch {
      return 0;
    }
  }

  async count(): Promise<number> {
    try {
      const db = await this.connect(true);
      const table = await db.openTable(this.tableName);
      return await table.countRows();
    } catch {
      return 0;
    }
  }

  async reset(): Promise<void> {
    await rm(this.dbDir, { recursive: true, force: true });
  }
}

// Re-using the lancedb namespace if needed for types
import * as lancedb from '@lancedb/lancedb';
