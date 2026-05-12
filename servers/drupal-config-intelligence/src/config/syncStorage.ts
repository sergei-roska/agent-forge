import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfigFile, listConfigNames } from '@agent-forge/filesystem-index';

export class SyncStorage {
  private syncDir: string | null = null;

  constructor(private rootDir: string) {
    this.syncDir = this.findSyncDir();
  }

  private findSyncDir(): string | null {
    const candidates = [
       join(this.rootDir, 'config/sync'),
       join(this.rootDir, 'web/sites/default/files/config/sync'),
       join(this.rootDir, 'web/sites/default/config/sync'),
    ];
    for (const c of candidates) {
       if (existsSync(c)) return c;
    }
    return null;
  }

  getSyncDir(): string | null {
    return this.syncDir;
  }

  async read(name: string): Promise<any | null> {
    if (!this.syncDir) return null;
    try {
      const result = await loadConfigFile(this.syncDir, name);
      return result?.data || null;
    } catch {
      return null;
    }
  }

  async list(prefix?: string): Promise<string[]> {
    if (!this.syncDir) return [];
    try {
      const names = await listConfigNames(this.syncDir);
      return prefix ? names.filter(n => n.startsWith(prefix)) : names;
    } catch {
      return [];
    }
  }
}
