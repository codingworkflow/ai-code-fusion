const path = require('path');

const rendererSourcePath = path.resolve(__dirname, 'src/renderer');
const rendererBuildPath = path.resolve(__dirname, 'dist/renderer');
const entryFile = path.resolve(rendererSourcePath, 'index.tsx');

module.exports = {
  entry: entryFile,
  output: {
    filename: 'bundle.js',
    path: rendererBuildPath,
  },
  // Increase the node options to allow more stack space
  node: {
    global: true,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    fallback: {
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
    },
  },
  devtool: 'source-map',
};
