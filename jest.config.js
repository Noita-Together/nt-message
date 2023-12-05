/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '\\.ts$': ['ts-jest', { useESM: true }],
    '\\.js$': 'babel-jest'
  }
  // transform: {
  //   '\\.js$': 'babel-jest',
  //   '\\.ts$': 'ts-jest'
  // },
  // roots: ['<rootDir>'],
  // extensionsToTreatAsEsm: ['.ts']
};
