const fs = require('fs');
const path = require('path');
const { isImageFile } = require('./file-analyzer');

class ContentProcessor {
  constructor(tokenCounter) {
    this.tokenCounter = tokenCounter;
  }

  processFile(filePath, relativePath, options = {}) {
    try {
      // Show token count if requested (default is true)
      const showTokenCount = options.showTokenCount !== false;
      
      // Get file stats
      const stats = fs.statSync(filePath);
      const fileSizeInKB = (stats.size / 1024).toFixed(2);
      
      // Check if this is an image file
      if (isImageFile(filePath)) {
        // For image files, show metadata instead of content
        // Calculate tokens based on file size (same calculation as in FileAnalyzer)
        const tokenCount = Math.max(50, Math.ceil(stats.size / 4));
        
        const headerContent = showTokenCount
          ? `${relativePath} (${tokenCount} tokens)`
          : `${relativePath}`;
          
        const formattedContent =
          `######\n` +
          `${headerContent}\n` +
          `######\n\n` +
          `[IMAGE FILE]\n` +
          `File Type: ${path.extname(filePath).replace('.', '').toUpperCase()}\n` +
          `Size: ${fileSizeInKB} KB\n\n`;
          
        return formattedContent;
      }
      
      // For text files, process normally
      const content = fs.readFileSync(filePath, { encoding: 'utf-8', flag: 'r' });
      const tokenCount = this.tokenCounter.countTokens(content);

      const headerContent = showTokenCount
        ? `${relativePath} (${tokenCount} tokens)`
        : `${relativePath}`;

      const formattedContent =
        `######\n` + `${headerContent}\n` + `######\n\n` + `\`\`\`\n${content}\n\`\`\`\n\n`;

      return formattedContent;
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
      return null;
    }
  }

  readAnalysisFile(analysisPath) {
    const filesToProcess = [];

    try {
      const content = fs.readFileSync(analysisPath, { encoding: 'utf-8', flag: 'r' });
      const lines = content.split('\n').map((line) => line.trim());

      // Process pairs of lines (path and token count)
      for (let i = 0; i < lines.length - 1; i += 2) {
        if (i + 1 >= lines.length) {
          break;
        }

        const path = lines[i].trim();
        if (path.startsWith('Total tokens:')) {
          break;
        }

        try {
          const tokens = parseInt(lines[i + 1].trim());
          // Clean up the path
          const cleanPath = path.replace(/\\/g, '/').trim();
          filesToProcess.push({ path: cleanPath, tokens });
        } catch (error) {
          console.warn(`Failed to parse line ${i}:`, error);
          continue;
        }
      }
    } catch (error) {
      console.error(`Error reading analysis file ${analysisPath}:`, error);
    }

    return filesToProcess;
  }
}

module.exports = { ContentProcessor };
