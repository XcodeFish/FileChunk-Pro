module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/types/**/*.ts', '!**/node_modules/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@platforms/(.*)$': '<rootDir>/src/platforms/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@workers/(.*)$': '<rootDir>/src/workers/$1',
    '^@reactive/(.*)$': '<rootDir>/src/reactive/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1'
  },
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  }
};
