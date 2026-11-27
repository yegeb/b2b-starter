import { Modules } from "@medusajs/framework/utils";

/**
 * Redis-backed runtime configuration for Medusa 2.22.7.
 *
 * Medusa only reads `projectConfig.redisUrl` and the Redis module options when
 * the application config sets them. The `REDIS_URL` environment variable alone
 * changes nothing on a self-hosted install (only Medusa Cloud reads it). This
 * builder turns `REDIS_URL` into the four settings that share one Redis:
 *
 * | Concern       | Module key / option                              | Provider package                         |
 * | ------------- | ------------------------------------------------ | ---------------------------------------- |
 * | HTTP sessions | `projectConfig.redisUrl`                         | connect-redis (inside `@medusajs/framework`) |
 * | Event bus     | `modules.event_bus` `options.redisUrl`           | `@medusajs/medusa/event-bus-redis`       |
 * | Workflows     | `modules.workflows` `options.redis.redisUrl`     | `@medusajs/medusa/workflow-engine-redis` |
 * | Locks         | `modules.locking` `options.providers[].options.redisUrl` | `@medusajs/medusa/locking-redis` |
 *
 * Role selection (`MEDUSA_WORKER_MODE=server|worker|shared`) is read by Medusa
 * itself and passed to every module, so it needs no setting here.
 */

/** Package names Medusa resolves for each Redis-backed provider. */
export const REDIS_PROVIDER_PACKAGES = {
  eventBus: "@medusajs/medusa/event-bus-redis",
  workflowEngine: "@medusajs/medusa/workflow-engine-redis",
  locking: "@medusajs/medusa/locking",
  lockingProvider: "@medusajs/medusa/locking-redis",
} as const;

/** The ID of the Redis locking provider. Medusa registers it as `lp_locking-redis`. */
export const REDIS_LOCKING_PROVIDER_ID = "locking-redis";

/**
 * Retry policy for event bus jobs. The module default is a single attempt, so a
 * failed subscriber is logged and never retried. Three attempts with exponential
 * backoff (1 s, then 2 s) bound the retries. BullMQ keeps failed jobs forever by
 * default, so the failed-job history is bounded by age and count.
 */
export const EVENT_BUS_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: true,
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
} as const;

export type RedisRuntimeConfig = {
  /** `true` when `REDIS_URL` is set to a non-blank value. */
  enabled: boolean;
  /** Spread into `defineConfig({ projectConfig })`. Empty when Redis is off. */
  projectConfig: { redisUrl?: string };
  /** Spread into `defineConfig({ modules })`. Empty when Redis is off. */
  modules: Record<string, Record<string, unknown>>;
};

/**
 * Build the Redis settings from the environment.
 *
 * With `REDIS_URL` unset or blank, this returns empty fragments. Medusa then
 * keeps its in-process defaults: a memory session store, the local event bus,
 * the in-memory workflow engine and the in-memory locking provider. That is
 * correct for one process and breaks as soon as a second API or worker starts,
 * so every deployment with more than one process must set `REDIS_URL`.
 */
export function buildRedisConfig(
  env: Record<string, string | undefined> = process.env
): RedisRuntimeConfig {
  const redisUrl = env.REDIS_URL?.trim();

  if (!redisUrl) {
    return { enabled: false, projectConfig: {}, modules: {} };
  }

  return {
    enabled: true,
    projectConfig: { redisUrl },
    modules: {
      [Modules.EVENT_BUS]: {
        resolve: REDIS_PROVIDER_PACKAGES.eventBus,
        options: {
          redisUrl,
          jobOptions: EVENT_BUS_JOB_OPTIONS,
        },
      },
      [Modules.WORKFLOW_ENGINE]: {
        resolve: REDIS_PROVIDER_PACKAGES.workflowEngine,
        options: {
          redis: { redisUrl },
        },
      },
      [Modules.LOCKING]: {
        resolve: REDIS_PROVIDER_PACKAGES.locking,
        options: {
          providers: [
            {
              resolve: REDIS_PROVIDER_PACKAGES.lockingProvider,
              id: REDIS_LOCKING_PROVIDER_ID,
              is_default: true,
              options: { redisUrl },
            },
          ],
        },
      },
    },
  };
}
