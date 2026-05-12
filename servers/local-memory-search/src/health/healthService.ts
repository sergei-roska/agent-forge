import { ProjectStateStore } from '../store/sqlite.js';
import { ProjectVectorStore } from '../store/vectorStore.js';

export async function healthCheck(projectDataDir: string, verbose: boolean, ollamaHealth: { ok: boolean; models: string[]; warning?: string }): Promise<{
  status: 'ok' | 'degraded';
  version: string;
  indexPath: string;
  dbBackend: string;
  embeddingBackend: string;
  uptimeSeconds: number;
  warnings: string[];
  details?: Record<string, unknown>;
}> {
  const warnings: string[] = [];
  const vectorStore = new ProjectVectorStore(projectDataDir);
  
  const vectorCount = await vectorStore.count();
  
  if (!ollamaHealth.ok) {
    warnings.push(`Ollama unavailable: ${ollamaHealth.warning ?? 'unknown error'}`);
  }

  const response: {
    status: 'ok' | 'degraded';
    version: string;
    indexPath: string;
    dbBackend: string;
    embeddingBackend: string;
    uptimeSeconds: number;
    warnings: string[];
    details?: Record<string, unknown>;
  } = {
    status: warnings.length > 0 ? 'degraded' : 'ok',
    version: '1.0.0',
    indexPath: projectDataDir,
    dbBackend: 'sqlite+lancedb',
    embeddingBackend: ollamaHealth.ok ? 'ollama' : 'fallback',
    uptimeSeconds: Math.floor(process.uptime()),
    warnings,
    details: verbose
      ? {
          vectorCount,
          ollamaModels: ollamaHealth.models,
        }
      : undefined,
  };

  return response;
}

export async function doctorIndex(store: ProjectStateStore, vectorStore: ProjectVectorStore, autoFix: boolean): Promise<{
  healthy: boolean;
  checks: Array<{ name: string; status: 'ok' | 'warning' | 'error'; detail: string }>;
  issues: string[];
  autoFixed: string[];
  suggestedActions: string[];
}> {
  const checks: Array<{ name: string; status: 'ok' | 'warning' | 'error'; detail: string }> = [];
  const issues: string[] = [];
  const autoFixed: string[] = [];
  const suggestedActions: string[] = [];

  // 1. Check SQLite queue stats
  const pendingCount = store.getPendingChunks(store.getProjectMeta('project_path') || '', 1000000).length;
  checks.push({
    name: 'sqlite-queue',
    status: pendingCount > 0 ? 'warning' : 'ok',
    detail: `${pendingCount} chunks pending embedding in SQLite.`,
  });

  // 2. Check LanceDB
  const vectorCount = await vectorStore.count();
  checks.push({
    name: 'lancedb-count',
    status: 'ok',
    detail: `${vectorCount} chunks available in vector store.`,
  });

  return {
    healthy: issues.length === 0,
    checks,
    issues,
    autoFixed,
    suggestedActions,
  };
}
