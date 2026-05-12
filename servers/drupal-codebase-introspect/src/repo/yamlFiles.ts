import { listFiles } from '@agent-forge/filesystem-index';
import { readFile } from 'node:fs/promises';
import { load } from 'js-yaml';

export interface YamlData {
  file: string;
  data: any;
}

export class YamlScanner {
  private cache: Record<string, YamlData[]> = {};

  constructor(private rootDir: string) {}

  async scan(extension: string): Promise<YamlData[]> {
    if (this.cache[extension]) {
      return this.cache[extension];
    }

    const files = await listFiles(this.rootDir, {
      include: [`*${extension}`],
    });

    const results: YamlData[] = [];
    for (const f of files) {
      try {
        const raw = await readFile(f.path, 'utf-8');
        const data = load(raw);
        if (data) {
          results.push({ file: f.relativePath, data });
        }
      } catch {
        // Ignore read/parse errors
      }
    }

    this.cache[extension] = results;
    return results;
  }
}
