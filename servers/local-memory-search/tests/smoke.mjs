import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ProjectStateStore, createProjectDbPath } from '../dist/store/sqlite.js';
import { OllamaClient } from '../dist/services/ollama.js';
import { SearchService } from '../dist/search/searchService.js';
import { indexProject } from '../dist/indexing/projectIndex.js';

async function main() {
  const projectDir = await mkdtemp(join(tmpdir(), 'lvsam-smoke-'));
  const dataDir = join(projectDir, '.index');
  try {
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

    const store = new ProjectStateStore(createProjectDbPath(dataDir));
    const ollama = new OllamaClient('http://127.0.0.1:11434');
    await indexProject(store, ollama, {
      projectPath: projectDir,
      force: true,
      enrich: false,
    });

    const pending = store.listChunksMissingEmbeddings();
    const embedded = await ollama.embed(pending.map((chunk) => chunk.text));
    pending.forEach((chunk, index) => {
      const vector = embedded.vectors[index];
      if (!vector) {
        throw new Error(`Missing vector for chunk ${chunk.chunkId}`);
      }
      store.updateChunkEmbedding(chunk.chunkId, vector, embedded.model);
    });

    const search = new SearchService(store, ollama);
    const result = await search.searchHybrid('workflow aliases bashrc', 5, 0);
    if (result.results.length === 0) {
      throw new Error('Hybrid search returned no results.');
    }
    if (!result.results.some((item) => item.filePath.includes('alpha.ts'))) {
      throw new Error(`Expected alpha.ts in results, got: ${result.results.map((item) => item.filePath).join(', ')}`);
    }

    console.log('Smoke test passed.');
    store.close();
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
