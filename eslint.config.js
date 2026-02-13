const js = require('@eslint/js');
const globals = require('globals');
const importPlugin = require('eslint-plugin-import');
const jestPlugin = require('eslint-plugin-jest');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const unusedImportsPlugin = require('eslint-plugin-unused-imports');
const sonarjsPluginModule = require('eslint-plugin-sonarjs');
const unicornPluginModule = require('eslint-plugin-unicorn');
const electronSecurityPlugin = require('./eslint-rules/electron-security');
const sonarjsPlugin = sonarjsPluginModule.default ?? sonarjsPluginModule;
const unicornPlugin = unicornPluginModule.default ?? unicornPluginModule;

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'src/renderer/bundle.js',
      'src/renderer/bundle.js.map',
      'src/renderer/bundle.js.LICENSE.txt',
      'src/renderer/index.js',
      'src/renderer/index.js.map',
      'src/renderer/index.js.LICENSE.txt',
      'src/renderer/output.css',
    ],
  },
  js.configs.recommended,
  {
    files: [
      'scripts/**/*.js',
      '*.config.js',
      'eslint.config.js',
      '.eslintrc.js',
      '.babelrc.js',
      'tests/.eslintrc.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-case-declarations': 'off',
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['scripts/capture-ui-screenshot.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'tests/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'unused-imports': unusedImportsPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
    },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    files: ['src/main/**/*.{js,ts}'],
    plugins: {
      'electron-security': electronSecurityPlugin,
    },
    rules: {
      'electron-security/ipc-channel-namespaced': 'error',
      'electron-security/safe-browser-window-webpreferences': 'error',
    },
  },
  {
    files: ['src/renderer/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'electron-security': electronSecurityPlugin,
    },
    rules: {
      'electron-security/no-electron-import-in-renderer': 'error',
    },
  },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: [
      'src/**/__tests__/**',
      'src/**/*.test.{js,jsx,ts,tsx}',
      'src/**/*.spec.{js,jsx,ts,tsx}',
    ],
    plugins: {
      sonarjs: sonarjsPlugin,
      unicorn: unicornPlugin,
    },
    rules: {
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-ignored-return': 'error',
      'sonarjs/no-inverted-boolean-check': 'error',
      'unicorn/no-array-callback-reference': 'error',
      'unicorn/no-invalid-fetch-options': 'error',
      'unicorn/prefer-array-some': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: [
      'tests/**/*.{js,jsx,ts,tsx}',
      'src/**/__tests__/**/*.{js,jsx,ts,tsx}',
      '**/*.test.{js,jsx,ts,tsx}',
      '**/*.spec.{js,jsx,ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    plugins: {
      jest: jestPlugin,
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
      'no-console': 'off',
      'jest/expect-expect': 'off',
      'jest/no-conditional-expect': 'off',
      'jest/no-standalone-expect': 'off',
    },
  },
];
