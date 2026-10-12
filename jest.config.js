/**
 * Jest config for the pure-TypeScript logic (safety layer, parsers, rules).
 * These suites run without the native runtime — they are the parts fully
 * testable off-device. Native modules are mocked where imported.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
