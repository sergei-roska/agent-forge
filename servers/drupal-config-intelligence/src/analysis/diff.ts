import { ActiveStorage } from '../config/activeStorage.js';
import { SyncStorage } from '../config/syncStorage.js';

export interface DiffResult {
  name: string;
  status: 'added' | 'removed' | 'changed' | 'identical' | 'missing_both' | 'active_unavailable' | 'unknown (bootstrap failed)';
  changed_keys: string[];
  risk_level: 'low' | 'medium' | 'high';
  patch?: string; // If include_patch is true
  warning?: string;
  method: 'drush' | 'filesystem_fallback';
}

export class ConfigDiff {
  constructor(private active: ActiveStorage, private sync: SyncStorage) {}

  async compare(configName: string, includePatch: boolean = false): Promise<DiffResult> {
    try {
      const activeData = await this.active.read(configName);
      const syncData = await this.sync.read(configName);

      if (!activeData && !syncData) return { name: configName, status: 'missing_both', changed_keys: [], risk_level: 'low', method: 'drush' };
      if (!activeData) return { name: configName, status: 'added', changed_keys: Object.keys(syncData), risk_level: 'low', method: 'drush' };
      if (!syncData) return { name: configName, status: 'removed', changed_keys: Object.keys(activeData.data), risk_level: 'high', method: 'drush' };

      const activeRaw = activeData.data;
      const changedKeys = this.getChangedKeys(activeRaw, syncData);
      const status = changedKeys.length === 0 ? 'identical' : 'changed';
      const risk = this.assessRisk(configName, changedKeys);

      const result: DiffResult = {
        name: configName,
        status,
        changed_keys: changedKeys,
        risk_level: risk,
        method: 'drush'
      };

      if (includePatch && status === 'changed') {
         result.patch = JSON.stringify({ active: activeRaw, sync: syncData }, null, 2);
      }

      return result;
    } catch (error: any) {
      const syncData = await this.sync.read(configName);
      // IF bootstrap failed, we return 'active_unavailable' instead of 'removed'
      return {
        name: configName,
        status: syncData ? 'active_unavailable' : 'missing_both',
        changed_keys: [],
        risk_level: 'medium',
        warning: `Diff unavailable: Drush bootstrap failed. Error: ${error.message}`,
        method: 'filesystem_fallback'
      };
    }
  }

  private getChangedKeys(a: any, b: any): string[] {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const changed: string[] = [];
    for (const k of keys) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        changed.push(k);
      }
    }
    return changed;
  }

  private assessRisk(name: string, keys: string[]): 'low' | 'medium' | 'high' {
    if (name === 'system.site' || name === 'core.extension') return 'high';
    if (name.startsWith('field.storage.') || name.startsWith('node.type.')) return 'high';
    if (keys.includes('dependencies')) return 'medium';
    return 'low';
  }
}
