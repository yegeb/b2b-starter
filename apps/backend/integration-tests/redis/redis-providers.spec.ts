import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { Modules, TransactionHandlerType } from "@medusajs/framework/utils";
import type {
  IEventBusModuleService,
  ILockingModule,
  IWorkflowEngineService,
} from "@medusajs/framework/types";
import Redis from "ioredis";
import { adminHeaders, createAdminUser } from "../utils/admin";
import { describeRuntimeProviders } from "../../src/utils/runtime-providers";

jest.setTimeout(120 * 1000);

// This suite proves the Redis wiring on a disposable Redis. It reads the
// connection string from REDIS_URL, which the `test:integration:redis` script
// requires. The runner loads medusa-config.ts, so the same variable switches the
// application to Redis.
const redisUrl = process.env.REDIS_URL as string;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (check: () => Promise<boolean> | boolean, what: string) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}`);
};

// An async step leaves the transaction in progress, so the engine has to keep
// its checkpoint in its storage until `setStepSuccess` completes the step.
const WORKFLOW_ID = "r1-redis-probe-workflow";
const STEP_ID = "r1-redis-probe-step";
const probeStep = createStep({ name: STEP_ID, async: true }, async () => {});
createWorkflow(WORKFLOW_ID, () => new WorkflowResponse(probeStep()));

const EVENT_QUEUE_COUNTER = "RedisEventBusService:events-queue:id";

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    let redis: Redis;

    const keys = async (pattern: string) => redis.keys(pattern);

    beforeAll(() => {
      redis = new Redis(redisUrl);
    });

    afterAll(async () => {
      await redis.quit();
    });

    it("selects the Redis providers for sessions, events, workflows and locks", () => {
      expect(describeRuntimeProviders(getContainer())).toEqual({
        workerMode: "shared",
        sessionStore: "redis",
        eventBus: {
          module: "@medusajs/medusa/event-bus-redis",
          service: "RedisEventBusService",
        },
        workflowEngine: {
          module: "@medusajs/medusa/workflow-engine-redis",
          service: "WorkflowsModuleService",
          storage: "RedisDistributedTransactionStorage",
        },
        locking: {
          module: "@medusajs/medusa/locking",
          service: "LockingModuleService",
          defaultProvider: "locking-redis",
          providers: [
            {
              resolve: "@medusajs/medusa/locking-redis",
              id: "locking-redis",
              isDefault: true,
            },
          ],
        },
      });
    });

    it("stores an HTTP session in Redis under the sess: prefix", async () => {
      const before = new Set(await keys("sess:*"));
      await createAdminUser(adminHeaders, getContainer(), api);

      const response = await api.post("/auth/session", {}, adminHeaders);
      expect(response.status).toBe(200);
      expect(String(response.headers["set-cookie"])).toContain("connect.sid=");

      const created = (await keys("sess:*")).filter((key) => !before.has(key));
      expect(created).toHaveLength(1);

      const session = JSON.parse((await redis.get(created[0])) as string);
      expect(session.auth_context.actor_type).toBe("user");
      // The default cookie lifetime is ten hours.
      const ttl = await redis.ttl(created[0]);
      expect(ttl).toBeGreaterThan(9.9 * 60 * 60);
      expect(ttl).toBeLessThanOrEqual(10 * 60 * 60);
    });

    it("delivers an event through the Redis event bus queue", async () => {
      const eventBus: IEventBusModuleService = getContainer().resolve(Modules.EVENT_BUS);
      const received: unknown[] = [];
      eventBus.subscribe("r1.redis.probe", async (event) => {
        received.push(event.data);
      });
      // BullMQ numbers every job it adds to the queue with this counter.
      const jobsBefore = Number((await redis.get(EVENT_QUEUE_COUNTER)) ?? 0);

      await eventBus.emit({ name: "r1.redis.probe", data: { marker: "r1" } });

      await waitFor(() => received.length === 1, "the subscriber to receive the event");
      expect(received).toEqual([{ marker: "r1" }]);
      expect(Number(await redis.get(EVENT_QUEUE_COUNTER))).toBe(jobsBefore + 1);
    });

    it("keeps a workflow checkpoint in Redis until the async step completes", async () => {
      const engine: IWorkflowEngineService = getContainer().resolve(Modules.WORKFLOW_ENGINE);
      const transactionId = `r1-redis-${Date.now()}`;

      const { transaction } = await engine.run(WORKFLOW_ID, { transactionId });

      expect(transaction.hasFinished()).toBe(false);
      const checkpointKeys = await keys(`*${transactionId}*`);
      expect(checkpointKeys).not.toHaveLength(0);

      await engine.setStepSuccess({
        idempotencyKey: {
          action: TransactionHandlerType.INVOKE,
          transactionId,
          stepId: STEP_ID,
          workflowId: WORKFLOW_ID,
        },
        stepResponse: new StepResponse("done"),
      });

      // A finished workflow without a retention time leaves no checkpoint behind.
      await waitFor(
        async () => (await keys(`*${transactionId}*`)).length === 0,
        "the finished workflow to clear its Redis checkpoint"
      );
    });

    it("excludes a second owner of the same lock through Redis", async () => {
      const locking: ILockingModule = getContainer().resolve(Modules.LOCKING);
      const key = `r1-redis-lock-${Date.now()}`;

      await locking.acquire(key, { ownerId: "owner-a", expire: 30 });
      expect(await keys("medusa_lock:*")).toContain(`medusa_lock:${key}`);

      await expect(locking.acquire(key, { ownerId: "owner-b" })).rejects.toThrow(
        /Failed to acquire lock/
      );

      await locking.release(key, { ownerId: "owner-a" });
      await expect(
        locking.acquire(key, { ownerId: "owner-b", expire: 30 })
      ).resolves.toBeUndefined();
      await locking.release(key, { ownerId: "owner-b" });
    });
  },
});
