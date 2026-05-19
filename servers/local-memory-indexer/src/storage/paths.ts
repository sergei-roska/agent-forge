import path from 'node:path';
import { getConfig } from '../config.js';

export function slugify(projectPath: string): string {
  return projectPath
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 128);
}

export function projectDataRoot(projectPath: string): string {
  return path.join(getConfig().dataRoot, slugify(projectPath));
}

export function sqliteDbPath(projectPath: string): string {
  return path.join(projectDataRoot(projectPath), 'state.db');
}

export function lanceDbDir(projectPath: string): string {
  return path.join(projectDataRoot(projectPath), 'lancedb');
}
