// Run the browser regression tests against a freshly migrated backend.
//
// The script migrates and seeds the database named by E2E_DATABASE_URL,
// creates a synthetic Admin user, starts the backend, creates synthetic
// companies, employees, carts and a quote through the HTTP APIs, starts the
// storefront, and runs Playwright. It stops every process it started.
//
// The storefront server reaches the backend through a separate URL, like a
// container that uses an internal host name, while the browser uses the public
// URL. A proxy on the server-side URL records each request it forwards, so the
// tests can check which requests the storefront server made.
//
// E2E_DATABASE_URL must point to a disposable database. Never use a shared
// or demo database: the run adds data to it.

import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { createServer, request } from "node:http"
import { createInterface } from "node:readline"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createFixtures } from "./fixtures.mjs"

const e2eDir = join(dirname(fileURLToPath(import.meta.url)), "..")
const repoDir = join(e2eDir, "..", "..")
const backendDir = join(repoDir, "apps", "backend")
const storefrontDir = join(repoDir, "apps", "storefront")

const databaseUrl = process.env.E2E_DATABASE_URL
if (!databaseUrl) {
  console.error(
    "Set E2E_DATABASE_URL to a disposable PostgreSQL database for the browser tests."
  )
  process.exit(2)
}

const backendPort = Number(process.env.E2E_BACKEND_PORT || 9100)
const storefrontPort = Number(process.env.E2E_STOREFRONT_PORT || 8100)
const serverBackendPort = backendPort + 1
const backendUrl = `http://127.0.0.1:${backendPort}`
const serverBackendUrl = `http://127.0.0.1:${serverBackendPort}`
const storefrontUrl = `http://localhost:${storefrontPort}`
const runId = Date.now().toString(36)
const secret = () => randomBytes(24).toString("hex")

const admin = {
  email: `e2e-admin-${runId}@example.test`,
  password: secret(),
}

const backendEnv = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: databaseUrl,
  JWT_SECRET: secret(),
  COOKIE_SECRET: secret(),
  STORE_CORS: storefrontUrl,
  ADMIN_CORS: `${backendUrl},http://localhost:${backendPort}`,
  AUTH_CORS: `${storefrontUrl},${backendUrl},http://localhost:${backendPort}`,
}

const children = []
const servers = []

const run = (command, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options })
    child.on("error", reject)
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`))
    )
  })

const start = (name, command, args, options) => {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    ...options,
  })
  for (const [stream, target] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    createInterface({ input: stream }).on("line", (line) =>
      target.write(`[${name}] ${line}\n`)
    )
  }
  children.push(child)
  return child
}

// Forward requests on the server-side URL to the backend and record the
// method, path and Origin header of each one. Browsers send an Origin header on
// cross-origin requests, so a recorded Origin shows that the server-side URL
// reached the browser.
const startServerBackendProxy = (logPath) =>
  new Promise((resolve, reject) => {
    writeFileSync(logPath, "")
    const server = createServer((incoming, outgoing) => {
      appendFileSync(
        logPath,
        `${JSON.stringify({
          method: incoming.method,
          path: incoming.url,
          origin: incoming.headers.origin ?? null,
        })}\n`
      )
      const upstream = request(
        {
          host: "127.0.0.1",
          port: backendPort,
          method: incoming.method,
          path: incoming.url,
          headers: incoming.headers,
        },
        (response) => {
          outgoing.writeHead(response.statusCode, response.headers)
          response.pipe(outgoing)
        }
      )
      upstream.on("error", (error) => {
        outgoing.writeHead(502, { "content-type": "text/plain" })
        outgoing.end(`The e2e proxy could not reach the backend: ${error.message}`)
      })
      incoming.pipe(upstream)
    })
    server.on("error", reject)
    server.listen(serverBackendPort, "127.0.0.1", () => {
      servers.push(server)
      resolve()
    })
  })

const stopAll = () => {
  for (const server of servers) {
    server.close()
    server.closeAllConnections()
  }
  for (const child of children) {
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGTERM")
      } catch {
        // The process group has already exited.
      }
    }
  }
}

const waitFor = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" })
      if (response.status < 500) {
        return
      }
      lastError = new Error(`${url} returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message}`)
}

process.on("SIGINT", () => {
  stopAll()
  process.exit(130)
})
process.on("SIGTERM", () => {
  stopAll()
  process.exit(143)
})

try {
  console.log("Migrating and seeding the e2e database")
  await run("pnpm", ["exec", "medusa", "db:migrate"], {
    cwd: backendDir,
    env: backendEnv,
  })
  await run(
    "pnpm",
    ["exec", "medusa", "user", "-e", admin.email, "-p", admin.password],
    { cwd: backendDir, env: backendEnv }
  )

  console.log(`Starting the backend on ${backendUrl}`)
  start(
    "backend",
    "pnpm",
    ["exec", "medusa", "develop", "-H", "127.0.0.1", "-p", String(backendPort)],
    { cwd: backendDir, env: backendEnv }
  )
  await waitFor(`${backendUrl}/health`, 180_000)

  console.log("Creating synthetic fixtures")
  const fixtures = await createFixtures({ backendUrl, admin, runId })

  const stateDir = join(e2eDir, ".e2e")
  mkdirSync(stateDir, { recursive: true })
  const serverBackendLog = join(stateDir, "server-backend-requests.jsonl")

  console.log(`Forwarding the storefront server's requests from ${serverBackendUrl}`)
  await startServerBackendProxy(serverBackendLog)

  console.log(`Starting the storefront on ${storefrontUrl}`)
  start(
    "storefront",
    "pnpm",
    ["exec", "next", "dev", "-p", String(storefrontPort)],
    {
      cwd: storefrontDir,
      env: {
        ...process.env,
        MEDUSA_BACKEND_URL: serverBackendUrl,
        NEXT_PUBLIC_MEDUSA_BACKEND_URL: backendUrl,
        NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: fixtures.publishableKey,
        NEXT_PUBLIC_BASE_URL: storefrontUrl,
        NEXT_PUBLIC_DEFAULT_REGION: "dk",
        REVALIDATE_SECRET: secret(),
      },
    }
  )
  await waitFor(`${storefrontUrl}/dk`, 300_000)

  const fixturesPath = join(stateDir, "fixtures.json")
  writeFileSync(fixturesPath, JSON.stringify({ ...fixtures, admin }, null, 2))

  console.log("Running Playwright")
  await run("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], {
    cwd: e2eDir,
    env: {
      ...process.env,
      E2E_BACKEND_URL: backendUrl,
      E2E_SERVER_BACKEND_LOG: serverBackendLog,
      E2E_STOREFRONT_URL: storefrontUrl,
      E2E_FIXTURES: fixturesPath,
    },
  })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  stopAll()
}
