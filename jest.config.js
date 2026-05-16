/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'apps/**/src/**/*.ts',
    'libs/**/src/**/*.ts',
    '!**/*.spec.ts',
    '!**/index.ts',
    '!**/main.ts',
    '!**/lambda.ts',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@forge-core/common(.*)$': '<rootDir>/libs/common/src$1',
    '^@forge-core/core(.*)$': '<rootDir>/libs/core/src$1',
    '^@forge-core/channels(.*)$': '<rootDir>/libs/channels/src$1',
  },
};
