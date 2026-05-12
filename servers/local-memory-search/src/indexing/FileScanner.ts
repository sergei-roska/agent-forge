import { readdir, stat, readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { sha256, toRelativePath, ensureInsideProject } from '../utils.js';
import ignore from 'ignore';

export interface ScannedFile {
  filePath: string;
  absolutePath: string;
  sizeBytes: number;
  mtimeNs: number;
  contentHash: string;
}

export class FileScanner {
  private ig = ignore();

  constructor(private projectPath: string, private excludeGlobs: string[] = []) {
    this.ig.add(excludeGlobs);
    this.ig.add(['.git', 'node_modules', 'vendor', 'dist', 'build', '.next']);
  }

  async scan(): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];
    await this.walk(this.projectPath, results);
    return results;
  }

  private async walk(currentPath: string, results: ScannedFile[]) {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      const relativePath = toRelativePath(this.projectPath, fullPath);

      if (this.ig.ignores(relativePath)) continue;

      if (entry.isDirectory()) {
        await this.walk(fullPath, results);
      } else if (entry.isFile()) {
        const stats = await stat(fullPath);
        // Using mtimeMs as a proxy for mtimeNs since JS doesn't have native mtimeNs easily
        const mtimeNs = Math.floor(stats.mtimeMs * 1_000_000); 
        
        // Basic filter for size
        if (stats.size > 512 * 1024) continue; 

        const content = await readFile(fullPath);
        if (content.includes(0)) continue; // skip binary

        results.push({
          filePath: relativePath,
          absolutePath: fullPath,
          sizeBytes: stats.size,
          mtimeNs,
          contentHash: sha256(content.toString())
        });
      }
    }
  }
}
