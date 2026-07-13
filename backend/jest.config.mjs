// ESM-compatible ts-jest config.
// Backend is "type": "module" and imports use explicit .js extensions so tests
// need the same rewriting rules jest applies for ESM.
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    // Strip the .js suffix on relative TS imports so ts-jest can resolve them.
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  clearMocks: true,
};
