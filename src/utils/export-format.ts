import type { ExportFormat } from '../types/ipc';

const isValidXmlCodePoint = (codePoint: number): boolean =>
  codePoint === 0x9 ||
  codePoint === 0xa ||
  codePoint === 0xd ||
  (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
  (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
  (codePoint >= 0x10000 && codePoint <= 0x10ffff);

export const normalizeExportFormat = (format: unknown): ExportFormat =>
  format === 'xml' ? 'xml' : 'markdown';

export const escapeXmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const sanitizeXmlContent = (value: string): string => {
  let sanitized = '';

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && isValidXmlCodePoint(codePoint)) {
      sanitized += char;
    }
  }

  return sanitized;
};

export const wrapXmlCdata = (value: string): string =>
  `<![CDATA[${sanitizeXmlContent(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;

export const normalizeTokenCount = (value: unknown): number => {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.trunc(numericValue);
};

export const toXmlNumericAttribute = (value: unknown): string =>
  escapeXmlAttribute(String(normalizeTokenCount(value)));
