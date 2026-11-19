# 02 · Medusa API, worker and Redis

**Assignment.** Backend owns this brief. Use A1–A3 and architecture §2.1. Deliver a process/configuration matrix for Medusa 2.22.7 and a two-API, one-worker proof.

The application config reads the database connection, HTTP origins and signing secrets. It registers company, quote and approval modules. The environment template names `REDIS_URL`. The lockfile resolves Redis implementations of the event bus, workflow engine and locking provider. Package presence alone does not establish runtime configuration. Medusa documents shared mode as the default. Verify the exact configuration types against the pinned release before editing. [Config](../../../apps/backend/medusa-config.ts) · [Environment template](../../../apps/backend/.env.template) · [Lockfile](../../../pnpm-lock.yaml) · [Worker modes](https://docs.medusajs.com/learn/production/worker-mode)

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

**Handoff.** Give 03 the worker subscription and retry behavior. Give 07 the Redis persistence, memory and connection requirements. Give 08 the role variables, start commands, health checks and migration sequence.
