// Linux container build networking check.
//
// The check runs the Linux path of docs/local-container-preview.md on a Linux
// Docker engine:
//   1. Start a disposable PostgreSQL container on a new Docker network.
//   2. Build the backend image from the repository Dockerfile, migrate and
//      seed the database, and start the backend with its port published only
//      on host loopback (127.0.0.1).
//   3. Build the storefront image with `--network host` against the loopback
//      API, as the documentation tells Linux users to do.
//   4. Confirm that the build reached the API: the image must contain a
//      prerendered page for each seeded product. The storefront build succeeds
//      without the API and renders the pages on demand, so a successful build
//      alone does not prove that the build network works.
//   5. Start the storefront container and confirm that it serves a seeded
//      product page.
//
// Requirements:
//   - Linux, with a Docker engine that runs on this host. Host loopback must be
//     the loopback of the engine, so Docker Desktop is not supported.
//   - Access to Docker Hub and the package registry.
//
// Optional:
//   - CONTAINER_CHECK_OUTPUT_DIR: directory for logs and summary.json.
//
// The check generates all passwords and secrets when it starts. It names every
// container, network and image with a random `b2b-lbc-<id>` prefix. When it
// ends, also on failure or on SIGINT, SIGTERM or SIGHUP, it removes only those
// containers, the network and the two images. It leaves the shared Docker
// build cache and the pulled base images in place.

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDir = process.env.CONTAINER_CHECK_OUTPUT_DIR
  ? resolve(process.env.CONTAINER_CHECK_OUTPUT_DIR)
  : await mkdtemp(join(tmpdir(), "linux-container-build-check-"))
await mkdir(outputDir, { recursive: true })

const id = randomBytes(4).toString("hex")
const prefix = `b2b-lbc-${id}`
const names = {
  network: `${prefix}-net`,
  database: `${prefix}-db`,
  api: `${prefix}-api`,
  storefront: `${prefix}-storefront`,
  migrate: `${prefix}-migrate`,
  manifest: `${prefix}-manifest`,
  backendImage: `${prefix}-backend:check`,
  storefrontImage: `${prefix}-storefront:check`,
}
const region = "gb"
const secret = () => randomBytes(24).toString("hex")
const database = { user: "check", password: secret(), name: "medusa_check" }
const backendSecrets = {
  DATABASE_URL: `postgres://${database.user}:${database.password}@${names.database}:5432/${database.name}?sslmode=disable`,
  JWT_SECRET: secret(),
  COOKIE_SECRET: secret(),
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

// Run a docker command. Secrets go in `env` and reach the containers through
// `-e NAME` arguments, so they do not appear on the command line. Return the
// exit status and the output, and append the output to `log` when given.
function docker(args, { env = {}, log, allowInterrupted = false } = {}) {
  if (!allowInterrupted) ensureNotInterrupted()
  return new Promise((done, fail) => {
    const child = spawn("docker", args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    children.add(child)
    const stream = log ? createWriteStream(log, { flags: "a" }) : null
    stream?.write(`$ docker ${args.join(" ")}\n`)
    const chunks = []
    for (const output of [child.stdout, child.stderr]) {
      output.on("data", (chunk) => {
        chunks.push(chunk)
        stream?.write(chunk)
      })
    }
    child.once("error", (error) => {
      children.delete(child)
      stream?.end()
      fail(error)
    })
    child.once("close", (code, signal) => {
      children.delete(child)
      const status = code ?? (signal ? 128 : 1)
      const output = Buffer.concat(chunks).toString("utf8")
      if (stream) stream.end(() => done({ status, output }))
      else done({ status, output })
    })
  })
}

async function step(name, args, options = {}) {
  const log = join(outputDir, `${name}.log`)
  const result = await docker(args, { ...options, log })
  if (result.status !== 0) {
    throw new Error(`${name} exited with status ${result.status}. See ${log}.`)
  }
  return result.output
}

// Resources the check created or tried to create. Cleanup removes only these.
const created = { containers: [], network: false, images: [] }

async function ensureLinuxEngine() {
  if (process.platform !== "linux") {
    throw new Error(
      `This check needs Linux with a local Docker engine. This host runs ${process.platform}.`
    )
  }
  const { status, output } = await docker([
    "info",
    "--format",
    "{{.OSType}}|{{.OperatingSystem}}",
  ])
  if (status !== 0) {
    throw new Error(`docker info exited with status ${status}: ${output.trim()}`)
  }
  const [osType, operatingSystem] = output.trim().split("|")
  if (osType !== "linux" || /Docker Desktop/i.test(operatingSystem)) {
    throw new Error(
      `This check needs a Linux Docker engine on this host, not "${operatingSystem}" (${osType}).`
    )
  }
  return operatingSystem
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 120; attempt++) {
    ensureNotInterrupted()
    // Check over TCP: the image's initialization server listens only on the
    // Unix socket, so a TCP response means the final server is running.
    const { status } = await docker([
      "exec",
      names.database,
      "pg_isready",
      "-h",
      "127.0.0.1",
      "-U",
      database.user,
      "-d",
      database.name,
    ])
    if (status === 0) return
    await delay(1000)
  }
  throw new Error("PostgreSQL did not become ready within 120 seconds.")
}

async function containerRunning(name) {
  const { status, output } = await docker([
    "inspect",
    "--format",
    "{{.State.Running}}",
    name,
  ])
  return status === 0 && output.trim() === "true"
}

// Wait until `check` returns a value, while the container keeps running.
async function waitForContainer(name, description, timeoutMs, check) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    ensureNotInterrupted()
    if (!(await containerRunning(name))) {
      throw new Error(`The ${description} container stopped. See ${name}.log.`)
    }
    try {
      const result = await check()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await delay(2000)
  }
  throw new Error(
    `The ${description} did not respond within ${timeoutMs / 1000} seconds` +
      (lastError ? `: ${lastError.message}` : ".")
  )
}

// The host port that Docker published for a container port. The check fails
// unless Docker published it on 127.0.0.1 only.
async function loopbackPort(name, containerPort) {
  const output = await step(`${name}-port`, ["port", name, `${containerPort}/tcp`])
  const bindings = output.trim().split("\n").filter(Boolean)
  const match = bindings.length === 1 && bindings[0].match(/^127\.0\.0\.1:(\d+)$/)
  if (!match) {
    throw new Error(
      `${name} must publish port ${containerPort} only on 127.0.0.1, not on: ${bindings.join(", ")}`
    )
  }
  return Number(match[1])
}

async function publishableKey() {
  const output = await step("publishable-key", [
    "exec",
    names.database,
    "psql",
    "-U",
    database.user,
    "-d",
    database.name,
    "-t",
    "-A",
    "-c",
    "SELECT token FROM api_key WHERE type = 'publishable' AND revoked_at IS NULL AND deleted_at IS NULL LIMIT 1",
  ])
  const key = output.trim()
  if (!/^pk_\w+$/.test(key)) {
    throw new Error("The seed did not create a publishable API key.")
  }
  return key
}

async function seededProducts(apiUrl, key) {
  const response = await fetch(`${apiUrl}/store/products?fields=handle,title&limit=100`, {
    headers: { "x-publishable-api-key": key },
  })
  if (!response.ok) {
    throw new Error(`Listing the seeded products failed with HTTP ${response.status}.`)
  }
  const { products } = await response.json()
  if (!products?.length) throw new Error("The seed did not create any products.")
  return products
}

async function prerenderedRoutes() {
  created.containers.push(names.manifest)
  const output = await step("storefront-prerender-manifest", [
    "run",
    "--rm",
    "--name",
    names.manifest,
    "--network",
    "none",
    names.storefrontImage,
    "cat",
    ".next/prerender-manifest.json",
  ])
  const json = output.slice(output.indexOf("{"))
  return Object.keys(JSON.parse(json).routes ?? {})
}

async function saveLogs(name) {
  const { output } = await docker(["logs", name], { allowInterrupted: true })
  await writeFile(join(outputDir, `${name}.log`), output)
}

const summary = { engine: null, steps: [], errors: [] }
const record = (name, details = {}) => summary.steps.push({ name, ...details })
let cleanup

// Save the container logs, then remove the containers, network and images the
// check created. Run it once, after the check or on an interrupt.
function cleanUp() {
  cleanup ??= (async () => {
    for (const child of children) child.kill("SIGTERM")
    for (const name of created.containers) {
      await saveLogs(name).catch(() => {})
    }
    const removals = [
      ...created.containers.map((name) => ["rm", "--force", "--volumes", name]),
      ...(created.network ? [["network", "rm", names.network]] : []),
      ...created.images.map((image) => ["image", "rm", "--force", image]),
    ]
    for (const args of removals) {
      const { status, output } = await docker(args, { allowInterrupted: true }).catch(
        (error) => ({ status: 1, output: error.message })
      )
      // A resource that a failed command did not create is already absent.
      if (status !== 0 && !/no such|not found/i.test(output)) {
        summary.errors.push(`docker ${args.join(" ")} failed: ${output.trim()}`)
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
    for (const error of summary.errors) console.error(`FAIL: ${error}`)
    process.exit(status)
  })
}

try {
  summary.engine = await ensureLinuxEngine()

  // 1. Disposable database on an isolated network.
  created.network = true
  await step("network-create", ["network", "create", names.network])
  created.containers.push(names.database)
  await step("database-start", [
    "run",
    "--detach",
    "--name",
    names.database,
    "--network",
    names.network,
    "--env",
    "POSTGRES_USER",
    "--env",
    "POSTGRES_PASSWORD",
    "--env",
    "POSTGRES_DB",
    "postgres:16-alpine",
  ], {
    env: {
      POSTGRES_USER: database.user,
      POSTGRES_PASSWORD: database.password,
      POSTGRES_DB: database.name,
    },
  })

  // 2. Backend image, migration with the initial seed, and the API published
  // only on host loopback.
  created.images.push(names.backendImage)
  await step("backend-image", [
    "build",
    "--progress",
    "plain",
    "--target",
    "backend",
    "--tag",
    names.backendImage,
    checkout,
  ])
  await waitForDatabase()
  const backendEnv = ["--env", "DATABASE_URL", "--env", "JWT_SECRET", "--env", "COOKIE_SECRET"]
  created.containers.push(names.migrate)
  await step("backend-migrate", [
    "run",
    "--rm",
    "--name",
    names.migrate,
    "--network",
    names.network,
    ...backendEnv,
    names.backendImage,
    "pnpm",
    "exec",
    "medusa",
    "db:migrate",
  ], { env: backendSecrets })
  const key = await publishableKey()

  const apiPort = await freePort()
  const storefrontPort = await freePort()
  const browserApiUrl = `http://localhost:${apiPort}`
  const storefrontUrl = `http://localhost:${storefrontPort}`
  created.containers.push(names.api)
  await step("backend-start", [
    "run",
    "--detach",
    "--name",
    names.api,
    "--network",
    names.network,
    "--publish",
    `127.0.0.1:${apiPort}:9000`,
    "--env",
    "NODE_ENV=development",
    ...backendEnv,
    "--env",
    `STORE_CORS=${storefrontUrl}`,
    "--env",
    `ADMIN_CORS=${browserApiUrl}`,
    "--env",
    `AUTH_CORS=${storefrontUrl},${browserApiUrl}`,
    names.backendImage,
  ], { env: backendSecrets })
  if ((await loopbackPort(names.api, 9000)) !== apiPort) {
    throw new Error(`${names.api} is not published on 127.0.0.1:${apiPort}.`)
  }
  const apiUrl = `http://127.0.0.1:${apiPort}`
  await waitForContainer(names.api, "backend", 180_000, async () => {
    const response = await fetch(`${apiUrl}/health`)
    return response.ok
  })
  const products = await seededProducts(apiUrl, key)
  record("backend", { published: `127.0.0.1:${apiPort}`, products: products.length })

  // 3. Storefront image built on the host network against the loopback API.
  created.images.push(names.storefrontImage)
  const buildLog = await step("storefront-image", [
    "build",
    "--progress",
    "plain",
    "--target",
    "storefront",
    "--network",
    "host",
    "--build-arg",
    `MEDUSA_BACKEND_URL=${apiUrl}`,
    "--build-arg",
    `NEXT_PUBLIC_MEDUSA_BACKEND_URL=${browserApiUrl}`,
    "--build-arg",
    `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${key}`,
    "--build-arg",
    `NEXT_PUBLIC_DEFAULT_REGION=${region}`,
    "--build-arg",
    `NEXT_PUBLIC_BASE_URL=${storefrontUrl}`,
    "--tag",
    names.storefrontImage,
    checkout,
  ])

  // 4. The build must have reached the API and prerendered every product.
  const staticPathFailures = [
    ...buildLog.matchAll(/Failed to generate static paths for ([^:]+):/g),
  ].map((match) => match[1])
  const routes = await prerenderedRoutes()
  const productRoutes = routes.filter((route) => route.startsWith(`/${region}/products/`))
  const missing = products.filter(
    (product) => !routes.includes(`/${region}/products/${product.handle}`)
  )
  record("storefront-image", {
    network: "host",
    buildBackend: apiUrl,
    staticPathFailures,
    prerenderedProductPages: productRoutes.length,
    missingProductPages: missing.map((product) => product.handle),
  })
  if (staticPathFailures.length) {
    throw new Error(
      `The storefront build could not reach the API for: ${staticPathFailures.join(", ")}.`
    )
  }
  if (missing.length) {
    throw new Error(
      `The storefront image has no prerendered page for ${missing.length} of ` +
        `${products.length} seeded products.`
    )
  }

  // 5. The storefront container serves a seeded product page.
  created.containers.push(names.storefront)
  await step("storefront-start", [
    "run",
    "--detach",
    "--name",
    names.storefront,
    "--network",
    names.network,
    "--publish",
    `127.0.0.1:${storefrontPort}:8000`,
    "--env",
    `MEDUSA_BACKEND_URL=http://${names.api}:9000`,
    "--env",
    "REVALIDATE_SECRET",
    names.storefrontImage,
  ], { env: { REVALIDATE_SECRET: secret() } })
  const laptop = products.find((product) => /Ultra-Slim AI Laptop/.test(product.title))
  if (!laptop) throw new Error("The seed did not create the Ultra-Slim AI Laptop.")
  const pageUrl = `http://127.0.0.1:${storefrontPort}/${region}/products/${laptop.handle}`
  const page = await waitForContainer(names.storefront, "storefront", 120_000, async () => {
    const response = await fetch(pageUrl, { redirect: "manual" })
    if (response.status >= 500) return null
    return {
      status: response.status,
      cache: response.headers.get("x-nextjs-cache"),
      html: await response.text(),
    }
  })
  record("storefront-response", { url: pageUrl, status: page.status, cache: page.cache })
  if (page.status !== 200) {
    throw new Error(`${pageUrl} returned HTTP ${page.status}, not 200.`)
  }
  if (!page.html.includes("Ultra-Slim AI Laptop")) {
    throw new Error(`${pageUrl} does not show the seeded Ultra-Slim AI Laptop.`)
  }
} catch (error) {
  summary.errors.push(error instanceof Error ? error.message : String(error))
} finally {
  await cleanUp()
}

console.log("Linux container build networking check")
console.log(`- Docker engine: ${summary.engine ?? "unknown"}`)
for (const { name, ...details } of summary.steps) {
  console.log(`- ${name}: ${JSON.stringify(details)}`)
}
await writeFile(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`)
console.log(`Logs and summary: ${outputDir}`)

if (summary.errors.length) {
  for (const error of summary.errors) console.error(`FAIL: ${error}`)
  process.exit(1)
}
console.log(
  "PASS: the storefront image built with --network host against the loopback API " +
    "and served a seeded product page."
)
