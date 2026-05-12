import { createRunId, nowIso, sha256, toRelativePath, ensureInsideProject } from '../utils.js';
import { ProjectStateStore } from '../store/sqlite.js';
import { FileScanner } from './FileScanner.js';
import { AstChunker } from './AstChunker.js';
import { SemanticChunker } from './SemanticChunker.js';
import { getServerConfig } from '../config.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface IndexProjectArgs {
  projectPath: string;
  runId?: string;
  force?: boolean;
  includeGlobs?: string[];
  excludeGlobs?: string[];
  maxFileSizeKb?: number;
  priority?: 'user_focus' | 'recent' | 'background';
}

export async function runPhase1(
  store: ProjectStateStore,
  args: IndexProjectArgs
): Promise<string> {
  const config = getServerConfig();
  const runId = args.runId ?? createRunId('index');
  const projectPath = resolve(args.projectPath);

  store.startRun({
    runId,
    projectPath,
    phase: 'discovery',
    status: 'running',
    startedAt: nowIso(),
    updatedAt: nowIso(),
    schemaVersion: config.schemaVersion
  });

  const scanner = new FileScanner(projectPath, args.excludeGlobs);
  const astChunker = new AstChunker();
  const semanticChunker = new SemanticChunker();

  const files = await scanner.scan();
  store.updateRun(runId, { filesDiscovered: files.length });

  let filesParsed = 0;
  let chunksCreated = 0;

  for (const file of files) {
    const previous = store.getFingerprint(projectPath, file.filePath);
    const isChanged = args.force || !previous || 
                      previous.content_hash_sha256 !== file.contentHash || 
                      previous.mtime_ns !== file.mtimeNs;

    if (!isChanged && previous.status === 'parsed') {
      continue;
    }

    try {
      const text = (await readFile(file.absolutePath)).toString();
      const ext = file.filePath.split('.').pop() ? `.${file.filePath.split('.').pop()}` : '';
      
      // Mark old chunks as stale
      store.markChunksStale(projectPath, file.filePath);

      let astChunks = astChunker.chunk(text, ext);
      let finalChunks: any[] = [];

      if (astChunks.length === 0) {
        // Fallback to semantic or line-based
        const sChunks = await semanticChunker.chunk(text);
        finalChunks = sChunks.map(c => ({
          ...c,
          nodeType: 'text_block'
        }));
      } else {
        finalChunks = astChunks;
      }

      for (const chunk of finalChunks) {
        store.upsertQueueChunk({
          chunkId: sha256(`${projectPath}:${file.filePath}:${chunk.startLine}:${chunk.endLine}:${sha256(chunk.text).slice(0, 16)}`),
          projectPath,
          filePath: file.filePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          rawText: chunk.text,
          contentHash: sha256(chunk.text),
          astMetadata: {
            language: ext.slice(1),
            node_type: chunk.nodeType,
            class_name: chunk.className,
            function_name: chunk.functionName,
            symbol_path: chunk.symbolPath
          },
          status: 'pending',
          priority: args.priority === 'user_focus' ? 3 : 1,
          schemaVersion: config.schemaVersion
        });
        chunksCreated++;
      }

      store.upsertFingerprint({
        projectPath,
        filePath: file.filePath,
        sizeBytes: file.sizeBytes,
        mtimeNs: file.mtimeNs,
        contentHash: file.contentHash,
        status: 'parsed',
        schemaVersion: config.schemaVersion
      });

      filesParsed++;
      if (filesParsed % 10 === 0) {
        store.updateRun(runId, { filesParsed, chunksCreated });
      }
    } catch (err) {
      store.upsertFingerprint({
        projectPath,
        filePath: file.filePath,
        sizeBytes: file.sizeBytes,
        mtimeNs: file.mtimeNs,
        contentHash: file.contentHash,
        status: 'parse_error',
        schemaVersion: config.schemaVersion
      });
    }
  }

  store.updateRun(runId, { 
    filesParsed, 
    chunksCreated, 
    status: 'completed',
    phase: 'discovery' 
  });

  return runId;
}
