module.exports = {
  presets: ['@babel/preset-env', '@babel/preset-typescript'],
  overrides: [
    {
      test: /\.[jt]sx$/,
      presets: [['@babel/preset-react', { runtime: 'automatic' }]],
    },
  ],
  plugins: [],
};
