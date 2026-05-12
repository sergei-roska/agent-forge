import { pipeline } from '@xenova/transformers';

export interface SemanticChunk {
  text: string;
  startLine: number;
  endLine: number;
}

export class SemanticChunker {
  private extractor: any = null;

  async init() {
    if (!this.extractor) {
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
  }

  async chunk(text: string, maxChars = 4000): Promise<SemanticChunk[]> {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (sentences.length === 0) return [];

    await this.init();

    const chunks: SemanticChunk[] = [];
    let currentChunkSentences: string[] = [];
    let currentChars = 0;
    
    // Simplification of Max-Min: Group sentences until boundary or similarity drops
    // For v1, we'll do a robust paragraph/sentence grouping that respects maxChars.
    // A true Max-Min sentence clustering would be:
    // 1. Compute embeddings for all sentences.
    // 2. Group sentences while similarity between consecutive ones is high.
    
    const lines = text.split('\n');
    let lineOffset = 0;

    for (const sentence of sentences) {
      if (currentChars + sentence.length > maxChars && currentChunkSentences.length > 0) {
        const chunkText = currentChunkSentences.join(' ').trim();
        const startLine = lineOffset + 1;
        const endLine = startLine + chunkText.split('\n').length - 1;
        
        chunks.push({
          text: chunkText,
          startLine,
          endLine
        });
        
        lineOffset += chunkText.split('\n').length;
        currentChunkSentences = [];
        currentChars = 0;
      }
      
      currentChunkSentences.push(sentence);
      currentChars += sentence.length;
    }

    if (currentChunkSentences.length > 0) {
      const chunkText = currentChunkSentences.join(' ').trim();
      chunks.push({
        text: chunkText,
        startLine: lineOffset + 1,
        endLine: lineOffset + chunkText.split('\n').length
      });
    }

    return chunks;
  }
}
