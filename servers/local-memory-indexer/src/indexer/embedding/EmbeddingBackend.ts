export interface EmbeddingBackend {
  readonly name: 'ollama' | 'transformers_js';
  readonly batchSize: number;

  /** Embed a batch of texts. Returns one vector per text. */
  embed(texts: string[]): Promise<number[][]>;

  /** Returns true if the backend is operational. */
  healthCheck(): Promise<boolean>;
}
