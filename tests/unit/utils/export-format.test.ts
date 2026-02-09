const {
  normalizeExportFormat,
  escapeXmlAttribute,
  sanitizeXmlContent,
  wrapXmlCdata,
  normalizeTokenCount,
  toXmlNumericAttribute,
} = require('../../../src/utils/export-format');

describe('export-format utils', () => {
  test('normalizeExportFormat should accept xml and fallback to markdown', () => {
    expect(normalizeExportFormat('xml')).toBe('xml');
    expect(normalizeExportFormat('markdown')).toBe('markdown');
    expect(normalizeExportFormat('other')).toBe('markdown');
    expect(normalizeExportFormat(undefined)).toBe('markdown');
  });

  test('escapeXmlAttribute should escape xml-sensitive characters', () => {
    expect(escapeXmlAttribute(`a&b"c'd<e>`)).toBe('a&amp;b&quot;c&apos;d&lt;e&gt;');
  });

  test('sanitizeXmlContent should remove invalid xml characters', () => {
    const value = 'ok\u0001still\u0008valid\u0009newline\u000A';
    expect(sanitizeXmlContent(value)).toBe('okstillvalid\u0009newline\u000A');
  });

  test('wrapXmlCdata should split cdata terminators safely', () => {
    const wrapped = wrapXmlCdata('hello ]]> world');
    expect(wrapped).toContain('<![CDATA[');
    expect(wrapped).toContain(']]]]><![CDATA[>');
    expect(wrapped.endsWith(']]>')).toBe(true);
  });

  test('normalizeTokenCount and toXmlNumericAttribute should coerce invalid inputs to zero', () => {
    expect(normalizeTokenCount(12.8)).toBe(12);
    expect(normalizeTokenCount(-1)).toBe(0);
    expect(normalizeTokenCount('7')).toBe(7);
    expect(normalizeTokenCount('not-a-number')).toBe(0);
    expect(toXmlNumericAttribute('42')).toBe('42');
    expect(toXmlNumericAttribute('bad')).toBe('0');
  });
});
