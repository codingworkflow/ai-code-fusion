import path from 'node:path';

const realFs = jest.requireActual('node:fs') as typeof import('node:fs');
const rendererIndexPath = path.resolve(__dirname, '../../../src/renderer/public/index.html');

const readRendererIndex = () => realFs.readFileSync(rendererIndexPath, 'utf8');

describe('renderer CSP policy', () => {
  it('defines a strict CSP policy without unsafe script/style exceptions', () => {
    const indexHtml = readRendererIndex();
    const cspMatch = indexHtml.match(
      /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/
    );

    expect(cspMatch).not.toBeNull();
    const cspValue = cspMatch?.[1] ?? '';

    expect(cspValue).toContain("default-src 'self'");
    expect(cspValue).toContain("script-src 'self'");
    expect(cspValue).toContain("style-src 'self'");
    expect(cspValue).toContain("object-src 'none'");
    expect(cspValue).toContain("base-uri 'none'");
    expect(cspValue).not.toContain("'unsafe-inline'");
    expect(cspValue).not.toContain("'unsafe-eval'");
  });

  it('loads theme bootstrap from an external script instead of inline script tags', () => {
    const indexHtml = readRendererIndex();

    expect(indexHtml).toContain('<script src="./theme-bootstrap.js"></script>');

    const inlineScriptTags = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    expect(inlineScriptTags).toHaveLength(0);
  });
});
