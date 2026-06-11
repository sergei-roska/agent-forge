import type { MetadataFilters } from '../search/types.js';
import { SCHEMA_VERSION } from '../constants.js';

/** Escape a single-quoted SQL string literal for LanceDB / DataFusion predicates. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Parse an ISO 8601 datetime to epoch nanoseconds (matches the indexer's mtime_ns). */
export function isoToEpochNs(iso: string): number | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return ms * 1_000_000;
}

/**
 * Build the LanceDB WHERE predicate.
 *
 * The mandatory `project_path = ? AND schema_version = ?` filter is
 * non-negotiable (Spec 08.2 §3.1 / §6 Isolation). Optional metadata filters
 * (§3.1 table) are appended with AND.
 */
export function buildWherePredicate(
  projectPath: string,
  filters?: MetadataFilters,
): string {
  const clauses: string[] = [
    `project_path = ${sqlLiteral(projectPath)}`,
    `schema_version = ${sqlLiteral(SCHEMA_VERSION)}`,
  ];

  if (filters?.language) {
    clauses.push(`language = ${sqlLiteral(filters.language)}`);
  }

  if (filters?.file_extensions?.length) {
    const ors = filters.file_extensions.map((ext) => {
      const clean = ext.startsWith('.') ? ext : `.${ext}`;
      return `file_path LIKE ${sqlLiteral(`%${clean}`)}`;
    });
    clauses.push(`(${ors.join(' OR ')})`);
  }

  if (filters?.path_prefix) {
    clauses.push(`file_path LIKE ${sqlLiteral(`${filters.path_prefix}%`)}`);
  }

  if (filters?.updated_after) {
    const ns = isoToEpochNs(filters.updated_after);
    if (ns !== null) clauses.push(`mtime_ns >= ${ns}`);
  }

  if (filters?.class_name) {
    clauses.push(`class_name = ${sqlLiteral(filters.class_name)}`);
  }

  if (filters?.function_name) {
    clauses.push(`function_name = ${sqlLiteral(filters.function_name)}`);
  }

  if (filters?.last_commit_hash) {
    clauses.push(`last_commit_hash = ${sqlLiteral(filters.last_commit_hash)}`);
  }

  if (filters?.tags?.length) {
    // LanceDB exposes array_has_any for list columns.
    const tagList = filters.tags.map(sqlLiteral).join(', ');
    clauses.push(`array_has_any(tags, [${tagList}])`);
  }

  return clauses.join(' AND ');
}
