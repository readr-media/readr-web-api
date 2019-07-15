const path = require('path')
const nodeExternals = require('webpack-node-externals');
const webpack = require('webpack')
const { version } = require('../package.json')

module.exports = {
  entry: [ path.resolve(__dirname, '../index.js') ],
  output: {
    path: path.resolve(__dirname, '../dist'),
    publicPath: '/dist/',
    filename: 'index.js',
    library:'readr-site-fe-api',
    libraryTarget: 'commonjs2'    
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/
      },
    ],
  },
  devtool: '#source-map',
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('production'),
        'VERSION': JSON.stringify(version),
      },
    }),
    new webpack.LoaderOptionsPlugin({
      minimize: true
    })    
  ],
  externals: [ nodeExternals() ],
  target: 'node',
  resolve: {
    extensions: [ '.js' ],
    alias: {
      'src': path.resolve(__dirname, '../src'),
    }
  },
}