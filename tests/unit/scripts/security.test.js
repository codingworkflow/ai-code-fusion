const { __testUtils } = require('../../../scripts/lib/security');

describe('security command validation', () => {
  test('allows absolute Windows executable paths for approved binaries', () => {
    expect(() => __testUtils.assertAllowedExecutable('C:\\repo\\bin\\gitleaks.exe')).not.toThrow();
  });

  test('rejects unsafe traversal in command paths', () => {
    expect(() => __testUtils.assertSafeCommand('../bin/gitleaks')).toThrow('Unsafe command rejected');
  });

  test('rejects shell metacharacters in command paths', () => {
    expect(() => __testUtils.assertSafeCommand('gitleaks;rm -rf /')).toThrow(
      'Unsafe command rejected'
    );
  });
});
