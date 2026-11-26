// Storefront build regression check.
//
// The check builds the storefront two times:
//   1. With the Medusa API unavailable. The build must still succeed.
//   2. With a migrated and seeded API. The build must succeed and prerender
//      the seeded product pages.
//
// Requirements:
//   - BUILD_CHECK_DATABASE_URL: a PostgreSQL connection with permission to
//     create databases. The check creates a uniquely named database
//     (build_check_<random>) on that server and drops it when it ends. It does
//     not change any other database.
//   - git and pnpm on PATH, and access to the package registry or store.
//
// Optional:
//   - BUILD_CHECK_OUTPUT_DIR: directory for logs and summary.json.
//   - BUILD_CHECK_REGION: seeded country code for the storefront (default dk).
//
// The check copies the tracked and untracked, not ignored, files of this
// checkout to a temporary directory, installs dependencies there with
// `pnpm install --frozen-lockfile`, and runs every build, migration and the API
// from that copy. It does not change build outputs or `.env` files in this
// checkout. When it ends, also on failure or on SIGINT, SIGTERM or SIGHUP, it
// stops the processes it started, drops the database it created and removes
// the temporary copy.

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { createWriteStream } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..")

const serverUrl = process.env.BUILD_CHECK_DATABASE_URL
if (!serverUrl) {
  console.error(
    "Set BUILD_CHECK_DATABASE_URL to a PostgreSQL connection that can create databases."
  )
  process.exit(2)
}
const databaseName = `build_check_${randomBytes(6).toString("hex")}`
const databaseUrl = new URL(serverUrl)
databaseUrl.pathname = `/${databaseName}`
const region = process.env.BUILD_CHECK_REGION || "dk"
const outputDir = process.env.BUILD_CHECK_OUTPUT_DIR
  ? resolve(process.env.BUILD_CHECK_OUTPUT_DIR)
  : await mkdtemp(join(tmpdir(), "storefront-build-check-"))
await mkdir(outputDir, { recursive: true })

// Remove variables that could point a build at another API or database.
const inherited = { ...process.env }
for (const name of Object.keys(inherited)) {
  if (
    name.startsWith("NEXT_PUBLIC_") ||
    name.startsWith("BUILD_CHECK_") ||
    [
      "MEDUSA_BACKEND_URL",
      "DATABASE_URL",
      "REDIS_URL",
      "JWT_SECRET",
      "COOKIE_SECRET",
    ].includes(name)
  ) {
    delete inherited[name]
  }
}

const root = await mkdtemp(join(tmpdir(), "storefront-build-check-src-"))
const backendDir = join(root, "apps/backend")
const storefrontDir = join(root, "apps/storefront")
const medusaBin = join(backendDir, "node_modules/.bin/medusa")

const backendEnv = {
  ...inherited,
  DATABASE_URL: databaseUrl.href,
  JWT_SECRET: randomBytes(32).toString("hex"),
  COOKIE_SECRET: randomBytes(32).toString("hex"),
  STORE_CORS: "http://localhost:8000",
  ADMIN_CORS: "http://localhost:9000",
  AUTH_CORS: "http://localhost:9000",
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms))

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer()
    server.unref()
    server.on("error", fail)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })
}

const children = new Set()
let interrupted = null

function ensureNotInterrupted() {
  if (interrupted) throw new Error(`The check was interrupted by ${interrupted}.`)
}

// Start a child process that cleanup stops. Refuse to start one after an
// interrupt, so no process outlives the cleanup.
function start(command, args, options) {
  ensureNotInterrupted()
  const child = spawn(command, args, { ...options, detached: true })
  children.add(child)
  child.once("close", () => children.delete(child))
  child.once("error", () => children.delete(child))
  return child
}

// Run a command, write its output to a log file and return its exit status.
function run(command, args, { cwd, env, log }) {
  return new Promise((done, fail) => {
    const stream = createWriteStream(log)
    const child = start(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout.pipe(stream, { end: false })
    child.stderr.pipe(stream, { end: false })
    child.on("error", fail)
    child.on("close", (code, signal) => {
      stream.end(() => done(code ?? (signal ? 128 : 1)))
    })
  })
}

// Copy the files git would commit, without ignored build outputs, .env files
// or node_modules.
async function copyCheckout() {
  const log = join(outputDir, "workspace-copy.log")
  const listing = await new Promise((done, fail) => {
    const child = start(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: checkout, stdio: ["ignore", "pipe", "inherit"] }
    )
    const chunks = []
    child.stdout.on("data", (chunk) => chunks.push(chunk))
    child.on("error", fail)
    child.on("close", (code) =>
      code === 0
        ? done(Buffer.concat(chunks).toString("utf8"))
        : fail(new Error(`git ls-files exited with status ${code}.`))
    )
  })
  const files = [...new Set(listing.split("\0").filter(Boolean))]
  let copied = 0
  for (const file of files) {
    try {
      await cp(join(checkout, file), join(root, file), { recursive: true })
      copied++
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }
  await writeFile(log, `Copied ${copied} files from ${checkout} to ${root}.\n`)
}

async function withDatabaseServer(action) {
  const { Client } = createRequire(join(backendDir, "package.json"))("pg")
  const client = new Client({ connectionString: serverUrl })
  await client.connect()
  try {
    return await action(client)
  } finally {
    await client.end()
  }
}

async function step(name, command, args, options) {
  const log = join(outputDir, `${name}.log`)
  const status = await run(command, args, { ...options, log })
  if (status !== 0) {
    throw new Error(`${name} exited with status ${status}. See ${log}.`)
  }
}

// Find the build stage and the route that failed, from the Next.js output.
function analyzeBuildLog(text) {
  const pages = [...text.matchAll(/Generating static pages[^(]*\((\d+)\/(\d+)\)/g)].at(-1)
  const collect = text.match(/Failed to collect page data for (\S+)/)
  const prerender = text.match(/Error occurred prerendering page "([^"]+)"/)
  let failure = null
  if (collect) {
    failure = { stage: "collect page data", route: collect[1] }
  } else if (prerender) {
    failure = { stage: "generate static pages", route: prerender[1] }
  } else if (/Failed to compile/.test(text)) {
    failure = { stage: "compile", route: null }
  } else if (!/Compiled successfully/.test(text)) {
    failure = { stage: "before compile", route: null }
  }
  return {
    compiled: /Compiled successfully/.test(text),
    generatedPages: pages ? Number(pages[1]) : 0,
    totalPages: pages ? Number(pages[2]) : 0,
    failure,
  }
}

async function prerenderedRoutes() {
  try {
    const manifest = JSON.parse(
      await readFile(join(storefrontDir, ".next/prerender-manifest.json"), "utf8")
    )
    return Object.keys(manifest.routes ?? {})
  } catch {
    return []
  }
}

async function buildStorefront(name, env) {
  await rm(join(storefrontDir, ".next"), { recursive: true, force: true })
  const log = join(outputDir, `${name}.log`)
  const status = await run("pnpm", ["--filter", "@b2b-starter/storefront", "build"], {
    cwd: root,
    env: {
      ...inherited,
      NEXT_TELEMETRY_DISABLED: "1",
      MEDUSA_BACKEND_URL: env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
      ...env,
    },
    log,
  })
  const analysis = analyzeBuildLog(await readFile(log, "utf8"))
  const routes = status === 0 ? await prerenderedRoutes() : []
  return {
    name,
    status,
    log,
    ...analysis,
    failure: status === 0 ? null : analysis.failure ?? { stage: "unknown", route: null },
    productPages: routes.filter((route) => /\/products\/[^/]+$/.test(route)).length,
  }
}

async function waitForHealth(url, api) {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (api.exitCode !== null) {
      throw new Error(`The API exited with status ${api.exitCode} before it became healthy.`)
    }
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) return
    } catch {
      // The API is not listening yet.
    }
    await delay(500)
  }
  throw new Error("The API did not become healthy within 120 seconds.")
}

async function publishableKey(url, email, password) {
  const login = await fetch(`${url}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!login.ok) throw new Error(`Admin login failed with HTTP ${login.status}.`)
  const { token } = await login.json()
  const response = await fetch(`${url}/admin/api-keys?type=publishable&limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Listing API keys failed with HTTP ${response.status}.`)
  const { api_keys: keys } = await response.json()
  if (!keys?.length) throw new Error("The seed did not create a publishable API key.")
  return keys[0].token
}

function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  const signalGroup = (signal) => {
    try {
      process.kill(-child.pid, signal)
    } catch {
      child.kill(signal)
    }
  }
  return new Promise((done) => {
    const timer = setTimeout(() => signalGroup("SIGKILL"), 10_000)
    child.once("exit", () => {
      clearTimeout(timer)
      done()
    })
    signalGroup("SIGTERM")
  })
}

const results = []
const errors = []
let databaseCreation = null
let cleanup

// Stop every child process, drop the database the check created and remove
// the temporary copy. Run it once, after the checks or on an interrupt.
function cleanUp() {
  cleanup ??= (async () => {
    await Promise.all([...children].map(stop))
    if (databaseCreation) {
      try {
        await databaseCreation.catch(() => {})
        await withDatabaseServer((client) =>
          client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
        )
      } catch (error) {
        errors.push(
          `Dropping the check database ${databaseName} failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
    await rm(root, { recursive: true, force: true })
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
  await copyCheckout()
  await step("workspace-install", "pnpm", ["install", "--frozen-lockfile"], {
    cwd: root,
    env: inherited,
  })

  // 1. API unavailable: point the build at a port where nothing listens.
  const unusedPort = await freePort()
  results.push(
    await buildStorefront("storefront-api-unavailable", {
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: `http://127.0.0.1:${unusedPort}`,
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_unavailable_api_check",
      NEXT_PUBLIC_DEFAULT_REGION: region,
    })
  )

  // 2. Seeded API available.
  ensureNotInterrupted()
  databaseCreation = withDatabaseServer((client) =>
    client.query(`CREATE DATABASE "${databaseName}"`)
  )
  await databaseCreation
  await step("backend-migrate", medusaBin, ["db:migrate"], { cwd: backendDir, env: backendEnv })
  await step("backend-build", "pnpm", ["--filter", "@b2b-starter/backend", "build"], {
    cwd: root,
    env: backendEnv,
  })
  const email = `build-check-${randomBytes(6).toString("hex")}@example.com`
  const password = randomBytes(24).toString("hex")
  await step("backend-admin-user", medusaBin, ["user", "-e", email, "-p", password], {
    cwd: backendDir,
    env: backendEnv,
  })

  const apiPort = await freePort()
  const apiUrl = `http://localhost:${apiPort}`
  const apiLog = createWriteStream(join(outputDir, "backend-start.log"))
  const api = start(medusaBin, ["start", "--port", String(apiPort)], {
    cwd: join(backendDir, ".medusa/server"),
    env: { ...backendEnv, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  const apiFailed = new Promise((_, fail) => api.once("error", fail))
  apiFailed.catch(() => {})
  api.stdout.pipe(apiLog)
  api.stderr.pipe(apiLog)
  await Promise.race([waitForHealth(apiUrl, api), apiFailed])

  results.push(
    await buildStorefront("storefront-api-available", {
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: apiUrl,
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: await publishableKey(apiUrl, email, password),
      NEXT_PUBLIC_DEFAULT_REGION: region,
    })
  )
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error))
} finally {
  await cleanUp()
}

for (const result of results) {
  if (result.status !== 0) {
    const where = result.failure.route ? ` for ${result.failure.route}` : ""
    errors.push(
      `${result.name} exited with status ${result.status} at stage "${result.failure.stage}"${where}.`
    )
  }
}
const available = results.find((result) => result.name === "storefront-api-available")
if (available?.status === 0 && available.productPages === 0) {
  errors.push("storefront-api-available did not prerender any seeded product page.")
}

console.log("Storefront build regression check")
for (const result of results) {
  const where = result.failure
    ? `, failed at "${result.failure.stage}"${result.failure.route ? ` for ${result.failure.route}` : ""}`
    : ""
  console.log(
    `- ${result.name}: exit ${result.status}, ${result.generatedPages}/${result.totalPages} pages, ` +
      `${result.productPages} product pages${where}. Log: ${result.log}`
  )
}
await writeFile(
  join(outputDir, "summary.json"),
  `${JSON.stringify({ region, results, errors }, null, 2)}\n`
)
console.log(`Summary: ${join(outputDir, "summary.json")}`)

if (errors.length) {
  for (const error of errors) console.error(`FAIL: ${error}`)
  process.exit(1)
}
console.log("PASS: both storefront builds succeeded.")
