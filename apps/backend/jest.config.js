if (process.env.TEST_TYPE === "integration:http") {
  const required = ["DB_HOST", "DB_PORT", "DB_USERNAME", "DB_PASSWORD"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    // Jest configuration errors do not map to HTTP responses.
    // eslint-disable-next-line @medusajs/use-medusa-error-not-generic-error
    throw new Error(`HTTP integration tests require explicit disposable database settings: ${missing.join(", ")}`);
  }
}

const { loadEnv } = require("@medusajs/framework/utils");
loadEnv("test", process.cwd());

module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        module: { type: "commonjs", ignoreDynamic: true },
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          target: "es2022",
        },
      },
    ],
  },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["dist/"],
  setupFiles: ["./integration-tests/setup.js"],
};

if (process.env.TEST_TYPE === "integration:http") {
  module.exports.testMatch = ["**/integration-tests/http/**/*.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:modules") {
  module.exports.testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
} else if (process.env.TEST_TYPE === "unit") {
  module.exports.testMatch = ["**/src/**/__tests__/**/*.unit.spec.[jt]s"];
}
