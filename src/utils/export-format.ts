import type { ExportFormat } from '../types/ipc';

const INVALID_XML_CHARACTERS_REGEX =
  /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu; // eslint-disable-line no-control-regex

export const normalizeExportFormat = (format: unknown): ExportFormat =>
  format === 'xml' ? 'xml' : 'markdown';

export const sanitizeXmlContent = (value: string): string =>
  value.replace(INVALID_XML_CHARACTERS_REGEX, '');

export const escapeXmlAttribute = (value: string): string =>
  sanitizeXmlContent(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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
