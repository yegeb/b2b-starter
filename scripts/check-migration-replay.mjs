// Migration replay check (CMPE 48A task R3).
//
// The check runs the release migration command, `medusa db:migrate`, against
// disposable databases and proves three things:
//
//   1. Replay. Bootstrap an empty database with `db:migrate`, which runs the
//      initial data seed. Add the demo fixtures. Run `db:migrate` again. Run
//      the fixture script again. Every table keeps its row count and its row
//      content, so every identifier survives, and each command exits with 0.
//      Last, run the seed scripts a second time, as an interrupted run
//      would, and require that they create nothing.
//   2. Failure. A migration script that fails makes `db:migrate` exit with a
//      nonzero status and leaves its record unfinished. The release job relies
//      on this status to stop the rollout.
//   3. Retry. After the cause of the failure is removed, `db:migrate` finishes
//      the work and the database matches a database that the seed filled in a
//      single run. Nothing is duplicated.
//
// The failure in 2 is not a test migration. The check makes the real initial
// data seed fail halfway, because another region already owns the country
// "dk". It does not add a failing migration file to the repository.
//
// Requirements:
//   - REPLAY_CHECK_DATABASE_URL: a PostgreSQL connection with permission to
//     create databases. The check creates uniquely named databases
//     (replay_check_<random>_<scenario>) on that server and drops them when it
//     ends. It does not change any other database.
//   - Dependencies installed with `pnpm install --frozen-lockfile`.
//
// Optional:
//   - REPLAY_CHECK_OUTPUT_DIR: directory for logs, snapshots and summary.json.
//
// The check passes its own secrets and demo passwords to the child processes
// through the environment, generates them at run time and removes them from
// every log. When it ends, also on failure or on SIGINT, SIGTERM or SIGHUP, it
// stops the processes it started and drops the databases it created.

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  diffRowCounts,
  diffSnapshots,
  redact,
  tablesWithRows,
  takeSnapshot,
} from "./lib/migration-replay.mjs"

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const backendDir = join(checkout, "apps/backend")
const medusaBin = join(backendDir, "node_modules/.bin/medusa")

const serverUrl = process.env.REPLAY_CHECK_DATABASE_URL
if (!serverUrl) {
  console.error(
    "Set REPLAY_CHECK_DATABASE_URL to a PostgreSQL connection that can create databases."
  )
  process.exit(2)
}

const runId = randomBytes(6).toString("hex")
const outputDir = process.env.REPLAY_CHECK_OUTPUT_DIR
  ? resolve(process.env.REPLAY_CHECK_OUTPUT_DIR)
  : await mkdtemp(join(tmpdir(), "migration-replay-check-"))
await mkdir(outputDir, { recursive: true })

const demoPasswords = {
  DEMO_MERCHANT_PASSWORD: randomBytes(18).toString("base64url"),
  DEMO_BUYER_A_PASSWORD: randomBytes(18).toString("base64url"),
  DEMO_APPROVER_A_PASSWORD: randomBytes(18).toString("base64url"),
  DEMO_BUYER_B_PASSWORD: randomBytes(18).toString("base64url"),
}
const jwtSecret = randomBytes(32).toString("hex")
const cookieSecret = randomBytes(32).toString("hex")
const serverPassword = new URL(serverUrl).password
const secrets = [
  ...Object.values(demoPasswords),
  jwtSecret,
  cookieSecret,
  serverPassword && decodeURIComponent(serverPassword),
  serverPassword,
]

// Remove variables that could point the commands at another database or API.
const inherited = { ...process.env }
for (const name of Object.keys(inherited)) {
  if (
    name.startsWith("REPLAY_CHECK_") ||
    name.startsWith("DEMO_") ||
    [
      "DATABASE_URL",
      "DB_NAME",
      "REDIS_URL",
      "JWT_SECRET",
      "COOKIE_SECRET",
      "MEDUSA_BACKEND_URL",
    ].includes(name)
  ) {
    delete inherited[name]
  }
}

const databaseUrlFor = (name) => {
  const url = new URL(serverUrl)
  url.pathname = `/${name}`
  return url.href
}

const backendEnv = (databaseUrl) => ({
  ...inherited,
  ...demoPasswords,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: jwtSecret,
  COOKIE_SECRET: cookieSecret,
  STORE_CORS: "http://localhost:8000",
  ADMIN_CORS: "http://localhost:9000",
  AUTH_CORS: "http://localhost:9000",
  NODE_ENV: "development",
})

const children = new Set()
let interrupted = null

function ensureNotInterrupted() {
  if (interrupted) throw new Error(`The check was interrupted by ${interrupted}.`)
}

// Run a command, write its redacted output to a log file and return its exit
// status. A child that the check starts is stopped by cleanup.
function run(command, args, { cwd, env, log }) {
  ensureNotInterrupted()
  return new Promise((done, fail) => {
    const chunks = []
    const child = spawn(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    children.add(child)
    child.stdout.on("data", (chunk) => chunks.push(chunk))
    child.stderr.on("data", (chunk) => chunks.push(chunk))
    child.once("error", (error) => {
      children.delete(child)
      fail(error)
    })
    child.once("close", async (code, signal) => {
      children.delete(child)
      const output = redact(Buffer.concat(chunks).toString("utf8"), secrets)
      const stream = createWriteStream(log)
      stream.end(output, () => done({ code: code ?? (signal ? 128 : 1), output }))
    })
  })
}

async function withClient(connectionString, action) {
  const { Client } = createRequire(join(backendDir, "package.json"))("pg")
  const client = new Client({ connectionString })
  await client.connect()
  try {
    return await action(client)
  } finally {
    await client.end()
  }
}

const databases = []

async function createDatabase(scenario) {
  ensureNotInterrupted()
  const name = `replay_check_${runId}_${scenario}`
  databases.push(name)
  await withClient(serverUrl, (client) => client.query(`CREATE DATABASE "${name}"`))
  return databaseUrlFor(name)
}

const medusa = (name, args, databaseUrl) =>
  run(medusaBin, args, {
    cwd: backendDir,
    env: backendEnv(databaseUrl),
    log: join(outputDir, `${name}.log`),
  })

const snapshot = async (name, databaseUrl) => {
  const result = await withClient(databaseUrl, takeSnapshot)
  await writeFile(
    join(outputDir, `snapshot-${name}.json`),
    `${JSON.stringify(result, null, 2)}\n`
  )
  return result
}

const errors = []
const summary = { runId, scenarios: {} }

const expectExit = (scenario, name, result, expected) => {
  const ok = expected === 0 ? result.code === 0 : result.code !== 0
  summary.scenarios[scenario].exits[name] = result.code
  if (!ok) {
    errors.push(
      `${scenario}: ${name} exited with status ${result.code}, expected ${
        expected === 0 ? "0" : "a nonzero status"
      }. See ${join(outputDir, `${name}.log`)}.`
    )
  }
  return ok
}

const expectNoDifferences = (scenario, label, differences) => {
  summary.scenarios[scenario].comparisons[label] = differences
  for (const difference of differences) {
    errors.push(`${scenario}: ${label}: ${difference}`)
  }
}

// Scenario 1: bootstrap, fixtures, migrate again, fixtures again.
async function replayScenario() {
  const scenario = "replay"
  summary.scenarios[scenario] = { exits: {}, comparisons: {} }
  const databaseUrl = await createDatabase(scenario)

  const bootstrap = await medusa("replay-1-bootstrap", ["db:migrate"], databaseUrl)
  if (!expectExit(scenario, "replay-1-bootstrap", bootstrap, 0)) return null
  const bootstrapped = await snapshot("replay-1-bootstrap", databaseUrl)

  const fixtures = await medusa(
    "replay-2-fixtures",
    ["exec", "./src/scripts/demo-fixtures.ts"],
    databaseUrl
  )
  if (!expectExit(scenario, "replay-2-fixtures", fixtures, 0)) return bootstrapped
  const seeded = await snapshot("replay-2-fixtures", databaseUrl)

  // The fixtures must add data, or the later comparisons prove nothing.
  for (const table of ["company", "employee", "customer", "user"]) {
    if (!seeded.tables[table]?.rows) {
      errors.push(`${scenario}: the fixture script did not add rows to ${table}.`)
    }
  }
  if (seeded.identifiers.product.length === 0) {
    errors.push(`${scenario}: the bootstrap did not create products.`)
  }

  const migrate = await medusa("replay-3-migrate-again", ["db:migrate"], databaseUrl)
  expectExit(scenario, "replay-3-migrate-again", migrate, 0)
  const migrated = await snapshot("replay-3-migrate-again", databaseUrl)
  expectNoDifferences(
    scenario,
    "migrate again against the seeded database",
    diffSnapshots(seeded, migrated)
  )

  const again = await medusa(
    "replay-4-fixtures-again",
    ["exec", "./src/scripts/demo-fixtures.ts"],
    databaseUrl
  )
  expectExit(scenario, "replay-4-fixtures-again", again, 0)
  const rerun = await snapshot("replay-4-fixtures-again", databaseUrl)
  expectNoDifferences(
    scenario,
    "run the fixtures again",
    diffSnapshots(migrated, rerun)
  )

  // Run both seed scripts again, as after an interrupted run. Medusa runs a
  // script again when its record in script_migrations is missing or unfinished.
  // The seed must find its records and create nothing. Only the bookkeeping
  // table may differ, because the new records have new identifiers.
  await withClient(databaseUrl, (client) =>
    client.query(
      `DELETE FROM script_migrations WHERE script_name IN ('initial-data-seed.ts', 'region-store-policies.ts')`
    )
  )
  const reseed = await medusa("replay-5-seed-again", ["db:migrate"], databaseUrl)
  expectExit(scenario, "replay-5-seed-again", reseed, 0)
  if (!/Running migration script .*initial-data-seed\.ts/.test(reseed.output)) {
    errors.push(`${scenario}: the second seed run did not execute the seed script.`)
  }
  const reseeded = await snapshot("replay-5-seed-again", databaseUrl)
  expectNoDifferences(
    scenario,
    "run the seed scripts again",
    diffSnapshots(rerun, reseeded, { ignore: ["script_migrations"] })
  )

  summary.scenarios[scenario].tablesWithRows = tablesWithRows(rerun)
  summary.scenarios[scenario].identifiers = rerun.identifiers
  return bootstrapped
}

// Scenarios 2 and 3: a failed seed, then a retry.
async function retryScenario(reference) {
  const scenario = "retry"
  summary.scenarios[scenario] = { exits: {}, comparisons: {} }
  const databaseUrl = await createDatabase(scenario)

  const schema = await medusa(
    "retry-1-schema",
    ["db:migrate", "--skip-scripts"],
    databaseUrl
  )
  if (!expectExit(scenario, "retry-1-schema", schema, 0)) return

  // Another region owns "dk", so the seed fails when it creates its region.
  await withClient(databaseUrl, async (client) => {
    await client.query(
      `INSERT INTO region (id, name, currency_code) VALUES ('reg_replay_conflict', 'Replay conflict', 'eur')`
    )
    await client.query(
      `UPDATE region_country SET region_id = 'reg_replay_conflict' WHERE iso_2 = 'dk'`
    )
  })

  const failed = await medusa("retry-2-failing-migrate", ["db:migrate"], databaseUrl)
  expectExit(scenario, "retry-2-failing-migrate", failed, 1)
  if (!/already assigned to a region/.test(failed.output)) {
    errors.push(
      `${scenario}: the failing migration did not stop on the planted conflict. See ${join(outputDir, "retry-2-failing-migrate.log")}.`
    )
  }
  const unfinished = await withClient(databaseUrl, async (client) => {
    const { rows } = await client.query(
      `SELECT script_name, finished_at FROM script_migrations WHERE script_name LIKE 'initial-data-seed.%'`
    )
    return rows
  })
  summary.scenarios[scenario].failedRecord = unfinished.map((row) => ({
    script: row.script_name,
    finished: row.finished_at !== null,
  }))
  if (unfinished.length !== 1 || unfinished[0].finished_at !== null) {
    errors.push(
      `${scenario}: the failed seed must leave one unfinished record in script_migrations.`
    )
  }

  await withClient(databaseUrl, async (client) => {
    await client.query(`UPDATE region_country SET region_id = NULL WHERE iso_2 = 'dk'`)
    await client.query(`DELETE FROM region WHERE id = 'reg_replay_conflict'`)
  })

  const retried = await medusa("retry-3-retry-migrate", ["db:migrate"], databaseUrl)
  expectExit(scenario, "retry-3-retry-migrate", retried, 0)
  const after = await snapshot("retry-3-retry-migrate", databaseUrl)
  if (reference) {
    expectNoDifferences(
      scenario,
      "retry matches a single-run bootstrap",
      diffRowCounts(reference, after)
    )
  }

  const again = await medusa("retry-4-migrate-again", ["db:migrate"], databaseUrl)
  expectExit(scenario, "retry-4-migrate-again", again, 0)
  const stable = await snapshot("retry-4-migrate-again", databaseUrl)
  expectNoDifferences(scenario, "migrate again after the retry", diffSnapshots(after, stable))
  summary.scenarios[scenario].identifiers = stable.identifiers
}

let cleanup

// Stop every child process and drop the databases the check created. Run it
// once, after the scenarios or on an interrupt.
function cleanUp() {
  cleanup ??= (async () => {
    await Promise.all(
      [...children].map((child) => {
        try {
          process.kill(-child.pid, "SIGTERM")
        } catch {
          child.kill("SIGTERM")
        }
        return new Promise((done) => child.once("close", done))
      })
    )
    if (databases.length) {
      try {
        await withClient(serverUrl, async (client) => {
          for (const name of databases) {
            await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
          }
        })
      } catch (error) {
        errors.push(
          `Dropping the check databases failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  })()
  return cleanup
}

for (const [signal, status] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129],
]) {
  process.once(signal, async () => {
    interrupted = signal
    console.error(`Interrupted by ${signal}. Cleaning up.`)
    await cleanUp()
    for (const error of errors) console.error(`FAIL: ${error}`)
    process.exit(status)
  })
}

try {
  const reference = await replayScenario()
  await retryScenario(reference)
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error))
} finally {
  await cleanUp()
}

summary.errors = errors
await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)

console.log("Migration replay check")
for (const [scenario, result] of Object.entries(summary.scenarios)) {
  const exits = Object.entries(result.exits)
    .map(([name, code]) => `${name}=${code}`)
    .join(", ")
  console.log(`- ${scenario}: exits ${exits}`)
  for (const [label, differences] of Object.entries(result.comparisons)) {
    console.log(`  ${differences.length ? "DIFF" : "same"}: ${label}`)
  }
}
console.log(`Summary: ${join(outputDir, "summary.json")}`)

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`)
  process.exit(1)
}
console.log("PASS: migrations replay without changes and a failed seed retries cleanly.")
