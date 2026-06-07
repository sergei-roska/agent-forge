/**
 * Exact technical-identifier extraction (Spec 08.2 §2.3 step 1).
 *
 * Detects camelCase, snake_case, PascalCase, dotted paths, error codes, and
 * version strings. The extracted identifiers feed the Exact Identifier Boost
 * (step 3) so precise technical terms are not lost in semantic fuzziness.
 */
const PATTERNS: RegExp[] = [
  /\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\b/g,        // camelCase
  /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b/g,        // PascalCase
  /\b[a-zA-Z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+\b/g,   // snake_case
  /\b[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+\b/g, // dotted.path
  /\b[A-Z]{2,}(?:[._-]?[0-9]+)+\b/g,               // error codes e.g. E2BIG, HTTP404
  /\b[A-Z]{3,}\b/g,                                 // ALLCAPS tokens e.g. ENOENT, TODO
  /\bv?\d+\.\d+(?:\.\d+)?(?:-[a-zA-Z0-9.]+)?\b/g,   // version strings 1.2.3, v0.27.2
];

export function extractTechnicalIdentifiers(query: string): string[] {
  const found = new Set<string>();

  for (const pattern of PATTERNS) {
    for (const m of query.matchAll(pattern)) {
      const tok = m[0];
      if (tok.length >= 2) found.add(tok);
    }
  }

  // Double-quoted phrases are treated as exact identifiers verbatim.
  for (const m of query.matchAll(/"([^"]+)"/g)) {
    const phrase = m[1]?.trim();
    if (phrase && phrase.length >= 2) found.add(phrase);
  }

  return [...found];
}
