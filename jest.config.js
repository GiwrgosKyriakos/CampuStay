module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/__tests__/**/*.test.ts?(x)"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/setup.ts"],
  transformIgnorePatterns: ["node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@firebase/.*|firebase/.*))"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};
