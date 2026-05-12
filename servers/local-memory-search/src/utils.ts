import { createHash, randomUUID } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createRunId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_./:-]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function toRelativePath(projectPath: string, absolutePath: string): string {
  return relative(projectPath, absolutePath).split(sep).join('/');
}

export function ensureInsideProject(projectPath: string, targetPath: string): string {
  const resolvedProject = resolve(projectPath);
  const resolvedTarget = resolve(targetPath);
  if (resolvedTarget !== resolvedProject && !resolvedTarget.startsWith(`${resolvedProject}${sep}`)) {
    throw new Error(`Path escapes project root: ${targetPath}`);
  }
  return resolvedTarget;
}

export function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regex = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${regex}$`);
}

export function matchesAnyPattern(value: string, patterns: string[] = []): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => wildcardToRegExp(pattern).test(value));
}

export function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.twig')) return 'twig';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.sh')) return 'shell';
  return 'text';
}

export function buildChunkId(
  projectPath: string,
  filePath: string,
  startLine: number,
  endLine: number,
  contentHash: string,
): string {
  return sha256(`${projectPath}\n${filePath}\n${startLine}\n${endLine}\n${contentHash.slice(0, 16)}`);
}

export function buildSearchResultId(query: string, chunkId: string): string {
  return sha256(`${query}\n${chunkId}`);
}

export function normalizeVector(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  if (norm === 0) {
    return vector;
  }
  const denominator = Math.sqrt(norm);
  return vector.map((value) => value / denominator);
}
