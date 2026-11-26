// Storefront build regression check.
//
// The check builds the storefront two times:
//   1. With the Medusa API unavailable. The build must still succeed.
//   2. With a migrated and seeded API. The build must succeed and prerender
//      the seeded product pages.
//
// Requirements:
//   - BUILD_CHECK_DATABASE_URL: a disposable PostgreSQL database for this
//     check only. The check migrates and seeds it. Never use a shared or
//     demo database.
//   - Installed workspace dependencies (`pnpm install --frozen-lockfile`).
//
// Optional:
//   - BUILD_CHECK_OUTPUT_DIR: directory for logs and summary.json.
//   - BUILD_CHECK_REGION: seeded country code for the storefront (default dk).
//
// The check stops the API process it starts and replaces the storefront and
// backend build outputs. It leaves the seed data and a generated admin user in
// the disposable database. It does not drop the database.

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const backendDir = join(root, "apps/backend")
const storefrontDir = join(root, "apps/storefront")
const medusaBin = join(backendDir, "node_modules/.bin/medusa")

const databaseUrl = process.env.BUILD_CHECK_DATABASE_URL
if (!databaseUrl) {
  console.error(
    "Set BUILD_CHECK_DATABASE_URL to a disposable PostgreSQL database for this check."
  )
  process.exit(2)
}
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

const backendEnv = {
  ...inherited,
  DATABASE_URL: databaseUrl,
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

// Run a command, write its output to a log file and return its exit status.
function run(command, args, { cwd, env, log }) {
  return new Promise((done, fail) => {
    const stream = createWriteStream(log)
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
    child.stdout.pipe(stream, { end: false })
    child.stderr.pipe(stream, { end: false })
    child.on("error", fail)
    child.on("close", (code, signal) => {
      stream.end(() => done(code ?? (signal ? 128 : 1)))
    })
  })
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
    env: { ...inherited, NEXT_TELEMETRY_DISABLED: "1", ...env },
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
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise((done) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
    child.once("exit", () => {
      clearTimeout(timer)
      done()
    })
    child.kill("SIGTERM")
  })
}

const results = []
const errors = []
let api

try {
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
  api = spawn(medusaBin, ["start", "--port", String(apiPort)], {
    cwd: join(backendDir, ".medusa/server"),
    env: { ...backendEnv, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  api.stdout.pipe(apiLog)
  api.stderr.pipe(apiLog)
  await waitForHealth(apiUrl, api)

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
  await stop(api)
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
