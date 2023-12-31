const path = require('path');
const keysTransformer = require('ts-transformer-keys/transformer').default;
const webpackFilters = require('./webpackFilters');
const nodeExternals = require('webpack-node-externals');
const UtilsService = require('./_tools');

const rootPackageNodeModules = path.resolve(UtilsService.findRootWorkspacePath(process.cwd()), 'node_modules')

const modules_setup = [rootPackageNodeModules];

// console.log(modules_setup)s;

module.exports = {
  entry: `${process.cwd()}/src/index.ts`,
  mode: 'development',
  target: 'node',
  devtool: 'inline-source-map',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'rws.server.js',
  },
  resolve: {
    modules: modules_setup,
    extensions: ['.ts', '.js', '.node'],  
    alias: {
      
    }
  },
  context: process.cwd(),
  module: {
    rules: [
      {
        test: /\.(ts|js)$/,
        use: [                       
          {
            loader: 'ts-loader',
            options: {
              allowTsInNodeModules: true,
              configFile: path.resolve(process.cwd() + '/tsconfig.json'),
              // compilerOptions: {
              //   paths: {
              //     '*': [rootPackageNodeModules + '/*']
              //   }
              // }
            }
          }
        ],
        exclude: /node_modules\/(?!rws-js-server)/,
      },       
      {
          test: /\.node$/,
          use: 'node-loader',
      }        
    ],
  },
  plugins: [
  ],
  stats: {
    warningsFilter: webpackFilters,
  },
  externals: [nodeExternals()],
};