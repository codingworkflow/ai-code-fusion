const fs = require('fs');
const { isBinaryFile } = require('../../src/utils/file-analyzer');

// Mock fs module
jest.mock('fs');

describe('Binary File Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to create a Buffer with specific content
  const createMockBuffer = (content) => {
    if (typeof content === 'string') {
      return Buffer.from(content);
    } else {
      return Buffer.from(content);
    }
  };

  // Function to create a binary buffer that will trigger detection
  const createBinaryBuffer = () => {
    const buffer = Buffer.alloc(4096);
    // Add NULL bytes and control characters to make it clearly binary
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = i % 32 === 0 ? 0 : i % 8;
    }
    return buffer;
  };

  // Helper to mock the fs file reading operations
  const mockFileContent = (content) => {
    // Create a mock buffer
    const buffer = createMockBuffer(content);

    // Mock fs.openSync
    fs.openSync.mockReturnValue(1); // Return a mock file descriptor

    // Mock fs.readSync to copy our content into the buffer
    // Ignore position parameter by not naming it
    fs.readSync.mockImplementation((fd, buf, offset, length /* position */) => {
      const bytesToCopy = Math.min(buffer.length, length);
      buffer.copy(buf, offset, 0, bytesToCopy);
      return bytesToCopy;
    });

    // Mock fs.closeSync
    fs.closeSync.mockReturnValue(undefined);
  };

  test('should identify normal text files as non-binary', () => {
    // Mock a normal text file
    const textContent =
      'This is a normal text file with some content.\nIt has multiple lines and normal characters.';
    mockFileContent(textContent);

    expect(isBinaryFile('text-file.txt')).toBe(false);
  });

  test('should identify files with NULL bytes as binary', () => {
    // Create a buffer with NULL bytes
    const binaryContent = Buffer.from([65, 66, 67, 0, 68, 69, 70]); // ABC\0DEF
    mockFileContent(binaryContent);

    expect(isBinaryFile('binary-with-null.bin')).toBe(true);
  });

  test('should identify files with high concentration of control characters as binary', () => {
    // Create content with many control characters (not tab, newline, carriage return)
    const controlChars = [];
    for (let i = 0; i < 500; i++) {
      // Add some normal characters
      if (i % 4 === 0) {
        controlChars.push(65 + (i % 26)); // A-Z
      } else {
        // Add control characters (not 9, 10, 13 which are tab, newline, carriage return)
        controlChars.push((i % 8) + 1); // Control characters below 9
      }
    }

    mockFileContent(Buffer.from(controlChars));

    expect(isBinaryFile('control-chars.bin')).toBe(true);
  });

  test('should handle empty files as non-binary', () => {
    // Mock an empty file (0 bytes read)
    fs.openSync.mockReturnValue(1);
    fs.readSync.mockReturnValue(0);
    fs.closeSync.mockReturnValue(undefined);

    expect(isBinaryFile('empty-file.txt')).toBe(false);
  });

  test('should identify image files as binary', () => {
    // Simplified PNG header
    const pngHeader = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d, // Chunk length
      0x49,
      0x48,
      0x44,
      0x52, // "IHDR" chunk
      // Add some more bytes to make it long enough
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x08,
      0x06,
      0x00,
      0x00,
      0x00,
    ]);

    mockFileContent(pngHeader);

    expect(isBinaryFile('image.png')).toBe(true);
  });

  test('should identify PDF files as binary', () => {
    // Create a buffer that will be detected as binary
    const binaryBuffer = createBinaryBuffer();

    // Add PDF header at the beginning
    const pdfSignature = Buffer.from('%PDF-1.5\n%');
    pdfSignature.copy(binaryBuffer, 0);

    mockFileContent(binaryBuffer);

    expect(isBinaryFile('document.pdf')).toBe(true);
  });

  test('should identify executable files as binary', () => {
    // Mock a Windows PE executable header (MZ header)
    const exeHeader = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00,
      0x00,
      // Add more binary data
      0x0b, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    mockFileContent(exeHeader);

    expect(isBinaryFile('program.exe')).toBe(true);
  });

  test('should identify zip files as binary', () => {
    // Zip file header
    const zipHeader = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00,
    ]);

    mockFileContent(zipHeader);

    expect(isBinaryFile('archive.zip')).toBe(true);
  });

  test('should handle text files with low control character ratio as non-binary', () => {
    // Create a larger text file with some control characters, but below the threshold
    const textWithSomeControls = Buffer.alloc(4000);

    // Fill with normal text
    for (let i = 0; i < 3800; i++) {
      textWithSomeControls[i] = 65 + (i % 26); // A-Z
    }

    // Add some control characters (less than 10%)
    for (let i = 3800; i < 4000; i++) {
      // Control characters (not 9, 10, 13)
      textWithSomeControls[i] = (i % 8) + 1;
    }

    mockFileContent(textWithSomeControls);

    expect(isBinaryFile('text-with-some-controls.txt')).toBe(false);
  });

  test('should handle file read errors by treating as binary', () => {
    // Mock a file read error
    fs.openSync.mockImplementation(() => {
      throw new Error('File read error');
    });

    expect(isBinaryFile('error-file.txt')).toBe(true);
  });

  test('should handle binary files with text headers', () => {
    // Many binary files start with text signatures followed by binary content
    const mixedContent = Buffer.alloc(4096);

    // Text header part (first 100 bytes)
    const header = Buffer.from(
      'SVG-XML-Header Version 1.0 - This looks like text but the file is actually binary content after this header'
    );
    header.copy(mixedContent, 0);

    // Binary content - add lots of NULL and control characters
    for (let i = header.length; i < 4096; i++) {
      mixedContent[i] = i % 16 === 0 ? 0 : i % 8; // Add NULLs and control chars
    }

    mockFileContent(mixedContent);

    expect(isBinaryFile('mixed-binary.bin')).toBe(true);
  });
});
