import type { AstMetadata } from '../chunking/AstChunker.js';

export interface EnrichResult {
  summary: string;
  tags: string[];
  /** Ready-to-embed text: [SUMMARY]\n…\n[TAGS]\n…\n[CODE]\n… */
  enriched_text: string;
}

const PROMPT_TEMPLATE = (meta: AstMetadata, code: string) => `You are a code indexing assistant. Analyze the following ${meta.language ?? 'code'} snippet and respond with exactly two sections:

[SUMMARY]
One sentence describing what this code does.

[TAGS]
Comma-separated technical tags (language, patterns, libraries, key identifiers). Max 10 tags.

[CODE]
${code}`;

const SECTION_SUMMARY = /\[SUMMARY\]\s*([\s\S]*?)(?=\[TAGS\]|\[CODE\]|$)/i;
const SECTION_TAGS    = /\[TAGS\]\s*([\s\S]*?)(?=\[CODE\]|$)/i;

/**
 * Optional pre-embedding enrichment via granite4:3b-h (or any Ollama model).
 * Produces a summary + tags that are prepended to the embedding input.
 * If the model is unavailable or the call fails, returns null — caller skips enrichment.
 */
export class GraniteEnricher {
  private modelAvailable: boolean | null = null; // null = not yet checked

  constructor(
    private readonly model: string,
    private readonly baseUrl: string,
  ) {}

  async enrich(rawText: string, astMetadata: AstMetadata): Promise<EnrichResult | null> {
    if (!(await this.checkAvailable())) return null;

    const prompt = PROMPT_TEMPLATE(astMetadata, rawText.slice(0, 2000));

    let responseText: string;
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt, stream: false }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { response?: string };
      responseText = json.response ?? '';
    } catch {
      return null;
    }

    return this.parseResponse(responseText, rawText);
  }

  private parseResponse(response: string, rawText: string): EnrichResult | null {
    const summaryMatch = SECTION_SUMMARY.exec(response);
    const tagsMatch    = SECTION_TAGS.exec(response);

    const summary = summaryMatch?.[1]?.trim() ?? '';
    const tagsRaw = tagsMatch?.[1]?.trim() ?? '';
    const tags = tagsRaw
      .split(/[,\n]+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t.length < 60)
      .slice(0, 10);

    if (!summary && tags.length === 0) return null;

    const enriched_text = [
      summary ? `[SUMMARY]\n${summary}` : '',
      tags.length ? `[TAGS]\n${tags.join(', ')}` : '',
      `[CODE]\n${rawText}`,
    ]
      .filter(Boolean)
      .join('\n');

    return { summary, tags, enriched_text };
  }

  private async checkAvailable(): Promise<boolean> {
    if (this.modelAvailable !== null) return this.modelAvailable;

    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) { this.modelAvailable = false; return false; }
      const json = (await res.json()) as { models?: { name: string }[] };
      this.modelAvailable =
        json.models?.some((m) => m.name === this.model || m.name.startsWith(this.model.split(':')[0]!)) ?? false;
    } catch {
      this.modelAvailable = false;
    }

    return this.modelAvailable;
  }
}
