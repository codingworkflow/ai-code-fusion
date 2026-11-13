const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '../../..');

function transformWithConfig(configFile, filename, source) {
  return execFileSync(
    process.execPath,
    [
      '-e',
      `const babel = require('@babel/core');
       const [configFile, filename, source] = process.argv.slice(1);
       const result = babel.transformSync(source, { configFile, filename, babelrc: false });
       process.stdout.write(result.code);`,
      path.join(root, configFile),
      path.join(root, filename),
      source,
    ],
    { cwd: root, encoding: 'utf8' }
  );
}

describe.each(['babel.config.js', '.babelrc.js'])('%s Babel 8 compatibility', (configFile) => {
  test('parses generic arrow functions in TypeScript without treating them as JSX', () => {
    const code = transformWithConfig(
      configFile,
      'example.ts',
      'const identity = <T>(value: T): T => value;'
    );
    expect(code).toContain('identity');
    expect(code).not.toContain('<T>');
  });

  test.each(['example.tsx', 'example.jsx'])('transforms JSX in %s', (filename) => {
    const code = transformWithConfig(configFile, filename, 'const view = <div>Hello</div>;');
    expect(code).toContain('jsx-runtime');
    expect(code).not.toContain('<div>');
  });
});
