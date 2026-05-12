export function extractTechnicalIdentifiers(query: string): string[] {
  // Extract words that look like camelCase, PascalCase, or snake_case, or have paths
  // Also include quoted strings
  const regex = /([a-z0-9]+[A-Z][a-z0-9]+|[a-z0-9]+_[a-z0-9]+|[a-z0-9]+\.[a-z0-9]+|\/[a-z0-9]+)/g;
  const matches = query.match(regex) || [];
  
  // Also extract words in quotes
  const quotesMatch = query.match(/"([^"]+)"/g);
  if (quotesMatch) {
    matches.push(...quotesMatch.map(q => q.replace(/"/g, '')));
  }

  return [...new Set(matches.filter(m => m.length > 2))];
}
