/** @type {import('ts-jest').JestConfigWithTsJest} */
// Jest config for Estonia company data pipeline unit tests (parsers, mappers, prioritisation).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  maxWorkers: 1,
};
