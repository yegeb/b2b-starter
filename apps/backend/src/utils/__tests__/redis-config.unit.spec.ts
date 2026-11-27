import {
  buildRedisConfig,
  EVENT_BUS_JOB_OPTIONS,
  REDIS_LOCKING_PROVIDER_ID,
  REDIS_PROVIDER_PACKAGES,
} from "../redis-config";

// Not a real credential: a placeholder for the shape of a Redis URL.
const REDIS_URL = "redis://:placeholder@redis.test:6379/0";

describe("buildRedisConfig", () => {
  it.each([{}, { REDIS_URL: "" }, { REDIS_URL: "   " }])(
    "leaves Medusa defaults in place without a usable REDIS_URL (%j)",
    (env) => {
      expect(buildRedisConfig(env)).toEqual({
        enabled: false,
        projectConfig: {},
        modules: {},
      });
    }
  );

  it("points the session store at REDIS_URL", () => {
    const config = buildRedisConfig({ REDIS_URL });

    expect(config.enabled).toBe(true);
    expect(config.projectConfig).toEqual({ redisUrl: REDIS_URL });
  });

  it("registers the Redis event bus with bounded retries", () => {
    const { event_bus } = buildRedisConfig({ REDIS_URL }).modules;

    expect(event_bus).toEqual({
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl: REDIS_URL, jobOptions: EVENT_BUS_JOB_OPTIONS },
    });
    expect(EVENT_BUS_JOB_OPTIONS.attempts).toBeGreaterThan(1);
    expect(EVENT_BUS_JOB_OPTIONS.backoff.delay).toBeGreaterThan(0);
  });

  it("registers the Redis workflow engine under options.redis", () => {
    const { workflows } = buildRedisConfig({ REDIS_URL }).modules;

    expect(workflows).toEqual({
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl: REDIS_URL } },
    });
  });

  it("registers the Redis locking provider as the default", () => {
    const { locking } = buildRedisConfig({ REDIS_URL }).modules;

    expect(locking).toEqual({
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl: REDIS_URL },
          },
        ],
      },
    });
    expect(REDIS_LOCKING_PROVIDER_ID).toBe("locking-redis");
    expect(REDIS_PROVIDER_PACKAGES.lockingProvider).toBe("@medusajs/medusa/locking-redis");
  });

  it("trims whitespace around REDIS_URL", () => {
    expect(buildRedisConfig({ REDIS_URL: `  ${REDIS_URL}\n` }).projectConfig.redisUrl).toBe(
      REDIS_URL
    );
  });
});

describe("medusa-config.ts", () => {
  const loadConfig = (env: Record<string, string | undefined>) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[name];
      }
    }
    try {
      let config: any;
      jest.isolateModules(() => {
        config = require("../../../medusa-config");
      });
      return config;
    } finally {
      process.env = saved;
    }
  };

  it("keeps the in-process providers when REDIS_URL is unset", () => {
    const config = loadConfig({ REDIS_URL: undefined });

    expect(config.projectConfig.redisUrl).toBeUndefined();
    expect(config.modules.event_bus.resolve).toBe("@medusajs/medusa/event-bus-local");
    expect(config.modules.workflows.resolve).toBe("@medusajs/medusa/workflow-engine-inmemory");
    expect(config.modules.locking.options?.providers).toBeUndefined();
  });

  it("uses Redis for sessions, events, workflows and locks when REDIS_URL is set", () => {
    const config = loadConfig({ REDIS_URL });

    expect(config.projectConfig.redisUrl).toBe(REDIS_URL);
    expect(config.modules.event_bus.resolve).toBe("@medusajs/medusa/event-bus-redis");
    expect(config.modules.event_bus.options.redisUrl).toBe(REDIS_URL);
    expect(config.modules.workflows.resolve).toBe("@medusajs/medusa/workflow-engine-redis");
    expect(config.modules.workflows.options.redis.redisUrl).toBe(REDIS_URL);
    expect(config.modules.locking.options.providers).toEqual([
      expect.objectContaining({
        resolve: "@medusajs/medusa/locking-redis",
        id: "locking-redis",
        is_default: true,
      }),
    ]);
  });

  it("keeps the custom business modules registered next to the Redis providers", () => {
    const config = loadConfig({ REDIS_URL });

    expect(Object.keys(config.modules)).toEqual(
      expect.arrayContaining(["company", "quote", "approval", "event_bus", "workflows", "locking"])
    );
  });
});
