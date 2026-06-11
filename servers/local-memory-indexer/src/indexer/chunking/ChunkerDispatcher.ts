import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { AstChunker } from './AstChunker.js';
import { SemanticChunker, stripMarkup } from './SemanticChunker.js';
import { parseDocument } from './DocumentParser.js';
import { FingerprintsRepo } from '../../storage/repositories/FingerprintsRepo.js';
import { ChunksQueueRepo } from '../../storage/repositories/ChunksQueueRepo.js';
import { IndexRunsRepo } from '../../storage/repositories/IndexRunsRepo.js';
import { computeChunkIdFromText } from '../../identity/chunkId.js';
import { ErrorCode } from '../../errors/codes.js';
import { SCHEMA_VERSION, DEFAULT_MAX_CHUNK_CHARS, MAX_PARSE_RETRIES } from '../../constants.js';

// ── Extension routing table (spec §2.2.3) ────────────────────────────────────

const AST_EXTENSIONS = new Set([
  'ts', 'tsx', 'mts', 'cts',
  'js', 'jsx', 'mjs', 'cjs',
  'py', 'go', 'rs', 'java', 'cpp', 'cc', 'cxx', 'hpp', 'c', 'h',
]);

const SEMANTIC_EXTENSIONS = new Set([
  'md', 'txt', 'rst', 'markdown',
]);

const MARKUP_EXTENSIONS = new Set([
  'html', 'htm', 'xml', 'svg',
]);

const DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'docx',
]);

type ChunkerType = 'ast' | 'semantic' | 'markup' | 'document' | 'skip';

function routeExtension(ext: string): ChunkerType {
  if (AST_EXTENSIONS.has(ext))      return 'ast';
  if (SEMANTIC_EXTENSIONS.has(ext)) return 'semantic';
  if (MARKUP_EXTENSIONS.has(ext))   return 'markup';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  return 'skip';
}

// ── Priority helpers ──────────────────────────────────────────────────────────

const MS_24H = 24 * 60 * 60 * 1000;

function computePriority(runPriority: number, mtimeNs: number | bigint): number {
  if (runPriority === 3) return 3; // user_focus overrides everything
  const mtimeMs = Number(mtimeNs) / 1_000_000;
  if (Date.now() - mtimeMs < MS_24H) return 2; // recent
  return runPriority; // background (1)
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export interface DispatchStats {
  files_processed: number;
  files_skipped: number;
  files_errored: number;
  chunks_created: number;
  warnings: string[];
}

export class ChunkerDispatcher {
  private readonly fps: FingerprintsRepo;
  private readonly chunksRepo: ChunksQueueRepo;
  private readonly runsRepo: IndexRunsRepo;
  private readonly ast: AstChunker;
  private readonly semantic: SemanticChunker;

  constructor(
    private readonly db: Database.Database,
    private readonly projectPath: string,
  ) {
    this.fps = new FingerprintsRepo(db);
    this.chunksRepo = new ChunksQueueRepo(db);
    this.runsRepo = new IndexRunsRepo(db);
    this.ast = new AstChunker();
    this.semantic = new SemanticChunker();
  }

  async dispatch(runId: string, runPriority: number): Promise<DispatchStats> {
    const pending = this.fps.getPendingParse(this.projectPath);
    const stats: DispatchStats = {
      files_processed: 0,
      files_skipped: 0,
      files_errored: 0,
      chunks_created: 0,
      warnings: [],
    };

    for (const fp of pending) {
      if (fp.retry_count !== undefined && fp.retry_count >= MAX_PARSE_RETRIES) {
        stats.files_skipped++;
        continue;
      }

      try {
        const count = await this.processFile(fp.file_path, fp.mtime_ns ?? 0, runPriority);
        this.fps.updateStatus(this.projectPath, fp.file_path, 'parsed');
        stats.files_processed++;
        stats.chunks_created += count;
      } catch (err) {
        this.fps.incrementRetry(this.projectPath, fp.file_path);
        const msg = `[${ErrorCode.PHASE1_PARSE_ERROR}] ${fp.file_path}: ${err instanceof Error ? err.message : String(err)}`;
        stats.warnings.push(msg);
        stats.files_errored++;

        // Re-read retry_count after increment
        const updated = this.fps.getByPath(this.projectPath, fp.file_path);
        if ((updated?.retry_count ?? 0) >= MAX_PARSE_RETRIES) {
          this.fps.updateStatus(this.projectPath, fp.file_path, 'parse_error');
        }
      }

      // Checkpoint progress to index_runs periodically
      if ((stats.files_processed + stats.files_errored) % 50 === 0) {
        this.runsRepo.update(runId, {
          files_parsed: stats.files_processed,
          chunks_created: stats.chunks_created,
          updated_at: Date.now(),
        });
      }
    }

    // Final checkpoint
    this.runsRepo.update(runId, {
      files_parsed: stats.files_processed,
      chunks_created: stats.chunks_created,
      warnings: JSON.stringify(stats.warnings),
      updated_at: Date.now(),
    });

    return stats;
  }

  private async processFile(
    filePath: string,
    mtimeNs: number | bigint,
    runPriority: number,
  ): Promise<number> {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const route = routeExtension(ext);

    if (route === 'skip') return 0;

    const priority = computePriority(runPriority, mtimeNs);
    const now = Date.now();

    if (route === 'ast') {
      const rawChunks = await this.ast.chunkFile(filePath);
      const rows = rawChunks.map((c) => {
        const { chunk_id, content_hash } = computeChunkIdFromText({
          project_path: this.projectPath,
          file_path: filePath,
          start_line: c.start_line,
          end_line: c.end_line,
          raw_text: c.raw_text,
        });
        return {
          chunk_id,
          project_path: this.projectPath,
          file_path: filePath,
          start_line: c.start_line,
          end_line: c.end_line,
          raw_text: c.raw_text.slice(0, DEFAULT_MAX_CHUNK_CHARS),
          content_hash,
          ast_metadata: JSON.stringify(c.ast_metadata),
          embedding_status: 'pending' as const,
          priority,
          created_at: now,
          updated_at: now,
          schema_version: SCHEMA_VERSION,
        };
      });
      this.chunksRepo.insertBatch(rows);
      return rows.length;
    }

    // Semantic / markup / document → read text, then chunk
    let text: string;

    if (route === 'document') {
      const extracted = await parseDocument(filePath);
      if (!extracted) return 0;
      text = extracted;
    } else {
      text = fs.readFileSync(filePath, 'utf8');
      if (route === 'markup') text = stripMarkup(text);
    }

    const textChunks = this.semantic.chunk(text);
    const rows = textChunks.map((c) => {
      const { chunk_id, content_hash } = computeChunkIdFromText({
        project_path: this.projectPath,
        file_path: filePath,
        start_line: c.start_line,
        end_line: c.end_line,
        raw_text: c.raw_text,
      });
      return {
        chunk_id,
        project_path: this.projectPath,
        file_path: filePath,
        start_line: c.start_line,
        end_line: c.end_line,
        raw_text: c.raw_text.slice(0, DEFAULT_MAX_CHUNK_CHARS),
        content_hash,
        ast_metadata: JSON.stringify({ language: ext, node_type: 'text_block' }),
        embedding_status: 'pending' as const,
        priority,
        created_at: now,
        updated_at: now,
        schema_version: SCHEMA_VERSION,
      };
    });
    this.chunksRepo.insertBatch(rows);
    return rows.length;
  }
}
