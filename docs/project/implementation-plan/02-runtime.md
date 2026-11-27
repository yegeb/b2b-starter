# 02 · Medusa API, worker and Redis

**Assignment.** Backend owns this brief. Use A1–A3 and architecture §2.1. Deliver a process/configuration matrix for Medusa 2.22.7 and a two-API, one-worker proof.

The application config reads the database connection, HTTP origins and signing secrets. It registers company, quote and approval modules. The environment template names `REDIS_URL`. The lockfile resolves Redis implementations of the event bus, workflow engine and locking provider. Package presence alone does not establish runtime configuration. Medusa documents shared mode as the default. Verify the exact configuration types against the pinned release before editing. [Config](../../../apps/backend/medusa-config.ts) · [Environment template](../../../apps/backend/.env.template) · [Lockfile](../../../pnpm-lock.yaml) · [Worker modes](https://docs.medusajs.com/learn/production/worker-mode)

## Configuration evidence from the installed release

**Observed in source, 19 November 2026.** The frozen install includes package-level `AGENTS.md` files. Inspect the following paths under `node_modules/@medusajs` in the disposable install. Configure each role in the common backend config and supply its mode at launch. [Application config](../../../apps/backend/medusa-config.ts) · [Worker modes](https://docs.medusajs.com/learn/production/worker-mode)

| Concern | Medusa 2.22.7 source | Configuration to implement |
| --- | --- | --- |
| Role | `framework/dist/config/config.js` and `medusa/dist/loaders/index.js` | Set `MEDUSA_WORKER_MODE=server` for API and `worker` for worker. The default is shared. Worker skips HTTP application entry points. Set `admin.disable` for worker and keep Admin assets in the shared image. |
| HTTP sessions | `framework/dist/http/express-loader.js` | Supply `projectConfig.redisUrl` from the private runtime secret. The loader then uses connect-redis with `redisPrefix` plus `sess:`. Its default cookie lifetime is ten hours. Configure identical cookie secret and session prefix across API replicas. |
| Events | `event-bus-redis/AGENTS.md` and service | Register `@medusajs/medusa/event-bus-redis` with `options.redisUrl`. Defaults include queue `events-queue` and one attempt. Specify bounded attempts and backoff. Verify recovery from the durable intent after attempts run out. |
| Workflows | `workflow-engine-redis/AGENTS.md` and loader | Register `@medusajs/medusa/workflow-engine-redis` with `options.redis.redisUrl`. Record the main and job queues and the maximum worker concurrency under the VM memory budget. |
| Locks | `locking/AGENTS.md` and `locking-redis/AGENTS.md` | Register `@medusajs/medusa/locking`. In `options.providers`, set `resolve` to `@medusajs/medusa/locking-redis`, an ID, `is_default: true` and `options.redisUrl`. The in-memory provider otherwise permits process-local locking. |

**Observed at runtime.** The unchanged demo API logged missing Redis configuration and completed the A3 HTTP journey in shared mode. R3 migration replay preserved the eight product IDs, sales channel and publishable-key ID. Compare IDs before and after by querying `product`, `sales_channel` and `api_key.id` in the isolated demo database. Both migration commands exited successfully. A nonzero Job exit must still be exercised in K3. [Local run](01-application.md)

**Observed in a disposable configuration, 19 November 2026.** The trial applied the settings above to a copy of the built backend with PostgreSQL 18.0 and password-protected Redis 7.2.12. The loopback HTTP fixture disabled secure cookies for this test. Use secure cookies on the deployed HTTPS entry point.

| Probe | Reproduction and observed result |
| --- | --- |
| Shared session | Issue a session on API A with `POST /auth/session`. Send its cookie and channel key to `GET /store/customers/me` on A and B. Both returned HTTP 200 and the same buyer ID. After replacing API A, the original cookie again returned 200 and the same buyer. |
| Queue while worker is offline | Register a tagged `customer.created` subscriber in the temporary build. Start two server processes, create a synthetic customer, then start the worker. Only its log contained the marker for `cus_01M7TFR04PQQX8H6STR9J31A38`. |
| Distributed lock | From two `medusa exec` processes, resolve the locking service. Owner A acquired a key with a 20-second lease. While A held it, B attempted the same key with a distinct owner and received an acquisition error. A then released it. |
| Durable workflow | Register an async step in a stored test workflow and start it through the workflow-engine service. The first CLI process exited with the transaction in `invoking`. A fresh process called `setStepSuccess` with the same workflow, transaction, step and invoke action. The following step received the expected reviewed value. |

R2 still requires versioned config and a repeat of these probes on the release image. G5 must exercise VM recovery with PostgreSQL and Redis together. The installed workflow engine stores execution records in PostgreSQL and uses Redis for queues and coordination. Recover both stores against the same synthetic transaction and reconcile business state before replaying effects.

| Process or concern | Proposed responsibility | Evidence to collect |
| --- | --- | --- |
| API replicas | Run the same backend image in server mode. Serve Store, Admin and auth. Use identical JWT and cookie signing material. | Direct requests to both replicas succeed with the same valid session. Also exercise the storefront's bearer-token path. |
| Worker | Run that image in worker mode. Disable the Admin UI for this role. Consume background work without a public Service. | A tagged subscriber executes on the worker while API replicas serve requests. |
| Sessions | Identify the session-store option independently of event bus settings. Verify connection, expiry and behavior on restart. | A real server-side session survives API replacement. Bearer authentication alone cannot prove session sharing. |
| Event bus, durable workflows, locks | Configure the version-supported Redis providers in both roles. Establish effective namespaces, connection counts, retry and expiry settings. | A queued event survives worker restart. A durable workflow resumes. Two contenders cannot hold the same lock simultaneously. |
| Release job | Use separate migration credentials for one job per release. Inspect initial and later migration scripts before replay. | Runtime credentials lack schema ownership. A second migration run preserves the existing sales channel, keys and demo data. |

| ID | Depends on | Backend task and verification |
| --- | --- | --- |
| R1 | A1 | Inspect versioned package defaults and configuration types. Record exact module names, option paths and default behavior for sessions, event bus, workflow engine and locks. Exercise each configuration on isolated Redis. Record effective provider names without credentials. |
| R2 | R1 | Configure role selection, providers and shared secrets. Start two APIs on separate local ports and one worker against the same disposable services. Run each matrix check above, stop and restart one process at a time, and record process-tagged logs and final state. |
| R3 | A2, R1 | Inspect the [migration scripts](../../../apps/backend/src/migration-scripts). Bootstrap an empty demo store, migrate it again and compare row counts and identifiers. Specify how a failed migration prevents a release rollout. |

## R3 release migration contract

**Command.** The release job runs `medusa db:migrate` once for each release digest.
The command applies module migrations, syncs links and runs the migration scripts in `apps/backend/src/migration-scripts`.
The scripts are `initial-data-seed.ts` and `region-store-policies.ts`.
Medusa records a script in `script_migrations` as finished only after the script ends without an error.
After a failure or a killed process, the next run starts the whole script again.

**Replay rule.** A repeat run must not change a seeded database.
Each seed step looks for the record it creates by its natural key and creates it only if the record is missing.
The product step also checks that a product has its variants and its sales channel. It replaces a product that an interrupted run left incomplete.
Natural keys are the sales channel name, the API key title and type, the store name, the region name, the tax region country, the stock location name, the fulfillment set name, the shipping option name, the collection handle, the category name, the option title and the product title.
A retry after a partial failure then completes the missing steps and creates no second copy of a record. [Issue 119](https://github.com/yegeb/b2b-starter/issues/119)

**Failure rule.** The release job must treat any nonzero exit of `medusa db:migrate` as a failed release.
The job does not retry on its own, does not ignore the status and does not continue to a later step.
The rollout order is:

1. Run the migration job with the release digest and wait for it to end.
2. If the exit status is not 0, stop the release. Do not start or update the API Deployment. Do not start or update the worker Deployment. Do not build or deploy the storefront.
3. If the exit status is 0, roll out the API and the worker with the same digest.

The running API and worker keep the previous digest, because no step changed them.
A repair is a new job run. Fix the cause, then run `db:migrate` again.
The retry finishes the unfinished script and leaves the finished records unchanged.
K3 must run this sequence in the cluster with a failing job and show that the Deployments keep their previous digest.

**Local evidence.** `node scripts/check-migration-replay.mjs` runs the sequence on disposable databases. It needs `REPLAY_CHECK_DATABASE_URL`, a PostgreSQL connection that can create databases.

| Scenario | Steps | Pass condition |
| --- | --- | --- |
| Replay | Bootstrap with `db:migrate`. Add the demo fixtures. Run `db:migrate` again. Run the fixtures again. Run both seed scripts again. | Each command exits with 0. Every table keeps its row count and row content, so product, sales channel, publishable key, company, customer and region identifiers do not change. |
| Failure | Make the real seed fail halfway. A region that already owns the country `dk` causes the failure. Run `db:migrate`. | The command exits with a nonzero status. The seed record stays unfinished. The check adds no failing migration file to the repository. |
| Retry | Remove the cause. Run `db:migrate`. Run it once more. | The database matches a database that one run filled. No record exists twice. |
| Interrupted product | Remove the sales channel link of one product, as a process kill during product creation does. Mark the seed scripts as not run. Run `db:migrate`. | The command exits with 0. The same products exist, and each has its variants and its sales channel. The seed replaces the incomplete product. |

The pull request check `Migration replay check` runs this script on a PostgreSQL service container.

**Handoff.** Give 03 the worker subscription and retry behavior. Give 07 the Redis persistence, memory and connection requirements. Give 08 the role variables, start commands, health checks and migration sequence.
