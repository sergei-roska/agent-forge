import { ProjectStateStore } from '../store/sqlite.js';
import { ProjectVectorStore, VectorRecord } from '../store/vectorStore.js';
import { OllamaClient } from '../services/ollama.js';
import { getServerConfig, DEFAULT_EMBED_MODEL, SCHEMA_VERSION } from '../config.js';

export class EmbedConsumer {
  private isPaused = false;

  constructor(
    private store: ProjectStateStore,
    private vectorStore: ProjectVectorStore,
    private ollama: OllamaClient
  ) {}

  async run(projectPath: string, runId: string, batchSize = 10) {
    this.isPaused = false;
    const config = getServerConfig();

    this.store.updateRun(runId, { phase: 'embedding', status: 'running' });

    while (!this.isPaused) {
      const pending = this.store.getPendingChunks(projectPath, batchSize);
      if (pending.length === 0) break;

      try {
        const texts = pending.map(c => c.raw_text);
        const embedResult = await this.ollama.embed(texts, DEFAULT_EMBED_MODEL);

        const vectorRecords: VectorRecord[] = pending.map((c, i) => {
          const ast = JSON.parse(c.ast_metadata || '{}');
          return {
            chunk_id: c.chunk_id,
            project_path: c.project_path,
            file_path: c.file_path,
            start_line: c.start_line,
            end_line: c.end_line,
            text: c.raw_text, // or enriched_text if available
            raw_text: c.raw_text,
            vector: embedResult.vectors[i],
            language: ast.language || 'text',
            node_type: ast.node_type || 'text_block',
            class_name: ast.class_name,
            function_name: ast.function_name,
            symbol_path: ast.symbol_path,
            content_hash: c.content_hash,
            mtime_ns: 0, // Should be passed from file scan if needed
            schema_version: SCHEMA_VERSION,
            indexed_at: Date.now(),
            tags: [], // Could be added from enrich
          };
        });

        await this.vectorStore.upsertChunks(vectorRecords);
        this.store.markChunksEmbedded(pending.map(c => c.chunk_id));

        const run = this.store.getRun(runId);
        if (run) {
          const embeddedCount = (run.chunksEmbedded || 0) + pending.length;
          this.store.updateRun(runId, { chunksEmbedded: embeddedCount });
        }
      } catch (err) {
        console.error('Phase 2 batch error:', err);
        // Mark chunks as error? 
        this.isPaused = true;
        this.store.updateRun(runId, { status: 'error', error: String(err) });
        throw err;
      }
    }

    if (!this.isPaused) {
      this.store.updateRun(runId, { status: 'completed', phase: 'completed' });
      // Trigger IVF-PQ index build after large batches if needed
      await this.vectorStore.createIndices();
    }
  }

  pause() {
    this.isPaused = true;
  }
}
