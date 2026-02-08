const path = require('path');

// Source and destination paths
const srcPath = path.resolve(__dirname, 'src/renderer');
const entryFile = path.resolve(srcPath, 'index.tsx');

module.exports = {
  entry: entryFile,
  output: {
    filename: 'bundle.js', // Output to bundle.js to avoid webpack processing its own output
    path: srcPath, // Same directory for simplicity
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
