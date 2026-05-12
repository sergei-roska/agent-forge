import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectStateStore, createProjectDbPath } from '../src/store/sqlite.js';
import { OllamaClient } from '../src/services/ollama.js';
import { SearchService } from '../src/search/searchService.js';
import { indexProject } from '../src/indexing/projectIndex.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('local vector search flow', () => {
  it('indexes files and returns hybrid matches with fallback embeddings', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'lvsam-project-'));
    tempDirs.push(projectDir);
    await mkdir(join(projectDir, 'src'), { recursive: true });
    await writeFile(
      join(projectDir, 'src', 'alpha.ts'),
      [
        'export function workflowAliases() {',
        "  return ['bashrc', 'zshrc', 'profile'];",
        '}',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(projectDir, 'README.md'),
      'This project documents workflow aliases and shell startup conventions.',
      'utf8',
    );

    const dataDir = join(projectDir, '.index');
    const store = new ProjectStateStore(createProjectDbPath(dataDir));
    const ollama = new OllamaClient('http://127.0.0.1:11434');
    await indexProject(store, ollama, {
      projectPath: projectDir,
      enrich: false,
      force: true,
    });

    const pending = store.listChunksMissingEmbeddings();
    const embedded = await ollama.embed(pending.map((chunk) => chunk.text));
    pending.forEach((chunk, index) => {
      store.updateChunkEmbedding(chunk.chunkId, embedded.vectors[index] ?? [], embedded.model);
    });

    const search = new SearchService(store, ollama);
    const result = await search.searchHybrid('workflow aliases bashrc', 5, 0);
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]?.filePath).toContain('alpha.ts');
    store.close();
  });
});
