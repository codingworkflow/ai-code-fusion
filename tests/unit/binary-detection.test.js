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

  test('should identify JPEG files as binary', () => {
    // Create a JPEG file header
    const jpegHeader = Buffer.from([
      0xff,
      0xd8,
      0xff,
      0xe0, // JPEG SOI marker and APP0 marker
      0x00,
      0x10, // APP0 length
      0x4a,
      0x46,
      0x49,
      0x46,
      0x00, // 'JFIF\0'
      0x01,
      0x01, // Version
      0x00, // Units
      0x00,
      0x01,
      0x00,
      0x01, // Density
      0x00,
      0x00, // Thumbnail
    ]);

    mockFileContent(jpegHeader);

    expect(isBinaryFile('image.jpg')).toBe(true);
  });

  test('should identify GIF files as binary', () => {
    // Create a GIF file header
    const gifHeader = Buffer.from([
      0x47,
      0x49,
      0x46,
      0x38,
      0x39,
      0x61, // 'GIF89a'
      0x01,
      0x00,
      0x01,
      0x00, // Width and height (1x1)
      0x80,
      0x00,
      0x00, // Flags and background color
    ]);

    mockFileContent(gifHeader);

    expect(isBinaryFile('animation.gif')).toBe(true);
  });

  test('should identify WebP files as binary', () => {
    // Create a WebP file header
    const webpHeader = Buffer.from([
      0x52,
      0x49,
      0x46,
      0x46, // 'RIFF'
      0x24,
      0x00,
      0x00,
      0x00, // File size - 4 (36 bytes)
      0x57,
      0x45,
      0x42,
      0x50, // 'WEBP'
      0x56,
      0x50,
      0x38,
      0x20, // 'VP8 '
    ]);

    mockFileContent(webpHeader);

    expect(isBinaryFile('image.webp')).toBe(true);
  });

  test('should identify SQLite database files as binary', () => {
    // Create a SQLite database header
    const sqliteHeader = Buffer.from([
      0x53,
      0x51,
      0x4c,
      0x69,
      0x74,
      0x65,
      0x20,
      0x66,
      0x6f,
      0x72,
      0x6d,
      0x61,
      0x74,
      0x20,
      0x33,
      0x00, // 'SQLite format 3\0'
    ]);

    mockFileContent(sqliteHeader);

    expect(isBinaryFile('database.sqlite')).toBe(true);
  });

  test('should identify font files as binary', () => {
    // Create a TTF font header
    const ttfHeader = Buffer.from([
      0x00,
      0x01,
      0x00,
      0x00, // TTF version 1.0
      0x00,
      0x04, // Four tables
      0x00,
      0x00,
      0x00,
      0x00, // Header
      0x00,
      0x00,
      0x00,
      0x00, // More header data
      0x00,
      0x00,
      0x00,
      0x00, // More header data
    ]);

    mockFileContent(ttfHeader);

    expect(isBinaryFile('font.ttf')).toBe(true);
  });

  test('should identify Office document files as binary', () => {
    // Create an Office document header (simplified DOCX/ZIP header)
    const docxHeader = Buffer.from([
      0x50,
      0x4b,
      0x03,
      0x04, // ZIP signature
      0x14,
      0x00,
      0x06,
      0x00, // Version and flags
      0x08,
      0x00,
      0x00,
      0x00, // Compression method and file time
      0x00,
      0x00,
      0x00,
      0x00, // CRC32
      0x00,
      0x00,
      0x00,
      0x00, // Compressed size
      0x00,
      0x00,
      0x00,
      0x00, // Uncompressed size
    ]);

    mockFileContent(docxHeader);

    expect(isBinaryFile('document.docx')).toBe(true);
  });
});
