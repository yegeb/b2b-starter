if (process.env.TEST_TYPE === "integration:http" || process.env.TEST_TYPE === "integration:redis") {
  // The Redis suite may run against a trust-auth disposable PostgreSQL with no password.
  const required = ["DB_HOST", "DB_PORT", "DB_USERNAME"];
  if (process.env.TEST_TYPE === "integration:http") required.push("DB_PASSWORD");
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    // Jest configuration errors do not map to HTTP responses.
    // eslint-disable-next-line @medusajs/use-medusa-error-not-generic-error
    throw new Error(`Integration tests require explicit disposable database settings: ${missing.join(", ")}`);
  }
}

if (process.env.TEST_TYPE === "integration:redis" && !process.env.REDIS_URL) {
  // The Redis suite proves the Redis providers, so it must not run without Redis.
  // eslint-disable-next-line @medusajs/use-medusa-error-not-generic-error
  throw new Error("Redis integration tests require REDIS_URL to point at a disposable Redis instance");
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
  // The build output holds compiled copies of the specs.
  testPathIgnorePatterns: ["/node_modules/", "/.medusa/"],
  setupFiles: ["./integration-tests/setup.js"],
};

if (process.env.TEST_TYPE === "integration:http") {
  module.exports.testMatch = ["**/integration-tests/http/**/*.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:redis") {
  module.exports.testMatch = ["**/integration-tests/redis/**/*.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:modules") {
  module.exports.testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
} else if (process.env.TEST_TYPE === "unit") {
  module.exports.testMatch = ["**/src/**/__tests__/**/*.unit.spec.[jt]s"];
}
