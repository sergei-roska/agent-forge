import { findDrupalPhpFiles, scanPhpFile, PhpMatch } from '@agent-forge/filesystem-index';

export class PhpScanner {
  private cache: PhpMatch[] | null = null;
  
  constructor(private rootDir: string) {}

  async scan(): Promise<PhpMatch[]> {
    if (this.cache) {
      return this.cache;
    }

    const files = await findDrupalPhpFiles(this.rootDir);
    const results: PhpMatch[] = [];

    // Scan all files in parallel with a concurrency limit
    const BATCH_SIZE = 50;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(f => scanPhpFile(f.path, f.relativePath))
      );
      results.push(...batchResults.flat());
    }

    this.cache = results;
    return results;
  }
}
