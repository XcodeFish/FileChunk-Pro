module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    browser: true,
    node: true,
    es6: true,
    jest: true
  },
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off', // 修改为off
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'no-console': 'off', // 修改为off
    semi: ['error', 'always'],
    quotes: ['error', 'single'],
    '@typescript-eslint/no-var-requires': 'error'
  },
  overrides: [
    {
      files: ['.eslintrc.js', '*.config.js', 'jest.config.js', 'rollup.config.js'],
      parser: 'espree',
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: null
      }
    },
    {
      files: ['**/tests/**'],
      parserOptions: {
        project: './tsconfig.test.json'
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off'
      }
    },
    {
      files: ['**/platforms/native/react-native-adapter.ts'],
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/triple-slash-reference': 'off'
      }
    },
    {
      files: ['examples/**/*.ts'],
      parserOptions: {
        project: './tsconfig.test.json'
      },
      rules: {
        'no-console': 'off'
      }
    },
    {
      files: ['**/*.html'],
      parser: 'espree',
      plugins: ['html'],
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: null
      }
    }
  ],
  ignorePatterns: ['src/platforms/native/react-native-adapter.ts']
};
