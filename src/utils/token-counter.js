const tiktoken = require('tiktoken');

class TokenCounter {
  constructor(modelName = 'gpt-4') {
    try {
      this.encoder = tiktoken.encoding_for_model(modelName);
    } catch (error) {
      console.error(`Error initializing tiktoken for model ${modelName}:`, error);
      // Fallback to a simple approximation if tiktoken fails
      this.encoder = null;
    }
  }

  countTokens(text) {
    try {
      // Handle null or undefined text input
      if (text === null || text === undefined) {
        return 0;
      }

      // Convert to string just in case
      const textStr = String(text);

      if (this.encoder) {
        return this.encoder.encode(textStr).length;
      } else {
        // Very rough approximation: ~4 chars per token
        return Math.ceil(textStr.length / 4);
      }
    } catch (error) {
      console.error('Error counting tokens:', error);
      // No fallback here; just return 0
      return 0;
    }
  }
}

module.exports = { TokenCounter };
