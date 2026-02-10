import * as tiktoken from 'tiktoken';

type Encoder = {
  encode: (text: string) => { length: number };
};

export class TokenCounter {
  private readonly encoder: Encoder | null;

  constructor(modelName = 'gpt-4') {
    try {
      this.encoder = tiktoken.encoding_for_model(modelName as never) as unknown as Encoder;
    } catch (error) {
      console.error(`Error initializing tiktoken for model ${modelName}:`, error);
      this.encoder = null;
    }
  }

  countTokens(text: unknown): number {
    try {
      if (text === null || text === undefined) {
        return 0;
      }

      const textStr = this.normalizeTokenInput(text);
      if (!textStr) {
        return 0;
      }

      if (this.encoder) {
        return this.encoder.encode(textStr).length;
      }

      // Very rough approximation: ~4 chars per token.
      return Math.ceil(textStr.length / 4);
    } catch (error) {
      console.error('Error counting tokens:', error);
      return 0;
    }
  }

  private normalizeTokenInput(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint' ||
      typeof value === 'symbol'
    ) {
      return String(value);
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value) ?? '';
      } catch {
        return '';
      }
    }

    return '';
  }
}
