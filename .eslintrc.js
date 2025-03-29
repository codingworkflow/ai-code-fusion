module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:prettier/recommended',
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react', 'react-hooks', 'prettier'],
  rules: {
    'no-unused-vars': 'warn',
    'react/react-in-jsx-scope': 'off',
  },
  ignorePatterns: [
    'node_modules/**',
    'build/**',
    'dist/**',
    'src/renderer/bundle.js',
    'src/renderer/index.js',
    '**/*.map',
    '**/*.LICENSE.txt',
  ],
};
