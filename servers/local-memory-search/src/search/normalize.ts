import { extractTechnicalIdentifiers } from './IdentifierExtractor.js';

/**
 * Minimal English stop-word list. Stripped from the KEYWORD path only — the
 * semantic path uses the full query (Spec 08.2 §2.3 step 1).
 */
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in',
  'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the',
  'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was', 'will',
  'with', 'how', 'what', 'where', 'when', 'why', 'do', 'does', 'i', 'me',
]);

export interface NormalizedQuery {
  /** Original, trimmed query — used for the semantic (vector) path. */
  semantic: string;
  /** Lowercased, stop-word-stripped, identifiers preserved — used for FTS. */
  keyword: string;
  /** Lowercased tokens (for SQLite LIKE fallback term matching). */
  terms: string[];
  /** Exact technical identifiers for the boost step. */
  identifiers: string[];
}

export function normalizeQuery(raw: string): NormalizedQuery {
  const semantic = raw.trim();
  const identifiers = extractTechnicalIdentifiers(semantic);
  const lowerIds = new Set(identifiers.map((i) => i.toLowerCase()));

  const lowered = semantic.toLowerCase();
  const tokens = lowered.split(/[^a-z0-9_.]+/i).filter(Boolean);

  // Keep identifiers even if they would otherwise be a stop word; drop stop words.
  const kept = tokens.filter((t) => lowerIds.has(t) || !STOP_WORDS.has(t));

  return {
    semantic,
    keyword: kept.join(' '),
    terms: [...new Set(tokens.filter((t) => t.length > 1))],
    identifiers,
  };
}
