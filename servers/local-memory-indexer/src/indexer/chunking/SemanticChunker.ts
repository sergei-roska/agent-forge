import { DEFAULT_MAX_CHUNK_CHARS } from '../../constants.js';

export interface TextChunk {
  start_line: number; // 1-based
  end_line: number;
  raw_text: string;
}

const SENTENCE_END = /[.!?]\s+|[\n]/;

/**
 * Paragraph-aware chunker for prose text (md, txt, rst, html, xml).
 *
 * Strategy: split into paragraphs (double newline), accumulate into chunks
 * up to maxChars. If a single paragraph exceeds maxChars, split at sentence
 * boundaries. Approximates the Max-Min semantic grouping described in §2.2.3
 * without requiring an embedding model at parse time.
 */
export class SemanticChunker {
  private readonly maxChars: number;

  constructor(opts: { maxChars?: number } = {}) {
    this.maxChars = opts.maxChars ?? DEFAULT_MAX_CHUNK_CHARS;
  }

  chunk(text: string): TextChunk[] {
    const paragraphs = this.splitParagraphs(text);
    const chunks: TextChunk[] = [];
    let buffer: string[] = [];
    let bufferLength = 0;
    let bufferStart = 1;
    let currentLine = 1;

    for (const { text: para, startLine } of paragraphs) {
      const neededSpace = buffer.length > 0 ? bufferLength + 2 + para.length : para.length;

      if (neededSpace <= this.maxChars) {
        if (buffer.length === 0) bufferStart = startLine;
        buffer.push(para);
        bufferLength = neededSpace;
      } else {
        // Flush current buffer
        if (buffer.length > 0) {
          const raw = buffer.join('\n\n');
          const endLine = startLine - 1;
          chunks.push({ start_line: bufferStart, end_line: endLine, raw_text: raw });
        }

        // Handle oversized single paragraph
        if (para.length > this.maxChars) {
          const subChunks = this.splitBySentences(para, startLine);
          chunks.push(...subChunks);
          buffer = [];
          bufferLength = 0;
          const lastChunk = subChunks.at(-1);
          currentLine = lastChunk ? lastChunk.end_line + 1 : startLine;
        } else {
          buffer = [para];
          bufferLength = para.length;
          bufferStart = startLine;
        }
      }

      currentLine = startLine + para.split('\n').length;
    }

    if (buffer.length > 0) {
      const raw = buffer.join('\n\n');
      chunks.push({ start_line: bufferStart, end_line: currentLine, raw_text: raw });
    }

    return chunks;
  }

  private splitParagraphs(text: string): { text: string; startLine: number }[] {
    const result: { text: string; startLine: number }[] = [];
    let lineNum = 1;

    for (const block of text.split(/\n{2,}/)) {
      const trimmed = block.trim();
      if (trimmed) result.push({ text: trimmed, startLine: lineNum });
      lineNum += block.split('\n').length + 1; // +1 for the separator
    }

    return result;
  }

  private splitBySentences(para: string, startLine: number): TextChunk[] {
    const chunks: TextChunk[] = [];
    let cursor = 0;
    let lineOffset = 0;

    while (cursor < para.length) {
      const slice = para.slice(cursor, cursor + this.maxChars);
      const cut = this.findSentenceBoundary(slice);
      const segment = slice.slice(0, cut).trim();

      if (segment) {
        const segLines = segment.split('\n').length;
        chunks.push({
          start_line: startLine + lineOffset,
          end_line: startLine + lineOffset + segLines - 1,
          raw_text: segment,
        });
        lineOffset += segLines;
      }

      cursor += cut;
    }

    return chunks;
  }

  private findSentenceBoundary(text: string): number {
    if (text.length <= this.maxChars) return text.length;
    // Search backwards from the end for a sentence boundary
    for (let i = text.length - 1; i > text.length / 2; i--) {
      if (/[.!?]/.test(text[i]!) && (text[i + 1] === ' ' || text[i + 1] === '\n')) {
        return i + 1;
      }
    }
    // Fall back to last whitespace
    for (let i = text.length - 1; i > text.length / 2; i--) {
      if (/\s/.test(text[i]!)) return i;
    }
    return text.length;
  }
}

/** Strip HTML/XML tags, decode common entities, then chunk. */
export function stripMarkup(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
