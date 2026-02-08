import { TokenCounter } from '../utils/token-counter';

// Mock the tiktoken import
jest.mock('tiktoken', () => ({
  encoding_for_model: jest.fn().mockImplementation(() => ({
    encode: jest.fn().mockImplementation((text) => {
      // Simple mock that returns an array with length roughly proportional to text length
      // Handle null/undefined case
      if (!text) return [];
      return Array(Math.ceil(text.length / 4)).fill(0);
    }),
  })),
}));

describe('TokenCounter', () => {
  let tokenCounter;

  beforeEach(() => {
    tokenCounter = new TokenCounter();
  });

  test('countTokens returns expected token count for a string', () => {
    const text = 'This is a test string for token counting';
    const count = tokenCounter.countTokens(text);

    // Our mock implementation will return text length / 4 rounded up
    expect(count).toBe(Math.ceil(text.length / 4));
  });

  test('countTokens returns 0 for empty string', () => {
    const count = tokenCounter.countTokens('');
    expect(count).toBe(0);
  });

  test('countTokens handles null or undefined', () => {
    expect(tokenCounter.countTokens(null)).toBe(0);
    expect(tokenCounter.countTokens(undefined)).toBe(0);
  });
});
