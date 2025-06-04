import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { babel } from '@rollup/plugin-babel';
import { terser } from 'rollup-plugin-terser';
import path from 'path';
import pkg from './package.json';

// 处理路径别名
const resolveAlias = nodeResolve({
  extensions: ['.ts', '.js'],
  customResolveOptions: {
    moduleDirectory: 'src',
    paths: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@platforms': path.resolve(__dirname, 'src/platforms'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@workers': path.resolve(__dirname, 'src/workers'),
      '@reactive': path.resolve(__dirname, 'src/reactive'),
      '@types': path.resolve(__dirname, 'src/types')
    }
  }
});

// 处理外部依赖
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {})
];

// 处理全局模块(UMD格式使用)
const globals = {
  rxjs: 'rxjs',
  'spark-md5': 'SparkMD5',
  pako: 'pako'
};

// 公共插件
const plugins = [
  typescript({
    useTsconfigDeclarationDir: true,
    tsconfig: './tsconfig.json'
  }),
  resolveAlias,
  commonjs(),
  babel({
    babelHelpers: 'bundled',
    extensions: ['.ts', '.js'],
    presets: ['@babel/preset-env', '@babel/preset-typescript']
  })
];

// 根据环境添加压缩插件
const pluginsWithMinify = [
  ...plugins,
  terser({
    output: {
      comments: false
    }
  })
];

// 基础配置对象
const baseConfig = {
  input: 'src/index.ts',
  external
};

// 各种输出格式配置
export default [
  // ESM格式
  {
    ...baseConfig,
    output: {
      file: pkg.module,
      format: 'es',
      sourcemap: true
    },
    plugins
  },

  // CommonJS格式
  {
    ...baseConfig,
    output: {
      file: pkg.main,
      format: 'cjs',
      sourcemap: true
    },
    plugins
  },

  // UMD格式(未压缩)
  {
    ...baseConfig,
    external: [], // UMD包含所有依赖
    output: {
      file: 'dist/umd/filechunk-pro.js',
      format: 'umd',
      name: 'FileChunkPro',
      sourcemap: true,
      globals
    },
    plugins
  },

  // UMD格式(压缩版)
  {
    ...baseConfig,
    external: [], // UMD包含所有依赖
    output: {
      file: 'dist/umd/filechunk-pro.min.js',
      format: 'umd',
      name: 'FileChunkPro',
      sourcemap: true,
      globals
    },
    plugins: pluginsWithMinify
  }
];
