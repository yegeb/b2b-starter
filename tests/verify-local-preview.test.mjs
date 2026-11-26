// Check that the local preview browser check fails when the preview is not
// running. It needs the repository dependencies and the Playwright browser.
// Run with: node --test tests/verify-local-preview.test.mjs

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { test } from "node:test"

const script = new URL("../scripts/verify-local-preview.mjs", import.meta.url)

// A loopback port that nothing listens on.
const unusedPort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const runCheck = (previewUrl) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script.pathname], {
      env: { ...process.env, PREVIEW_URL: previewUrl },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    child.stdout.on("data", (chunk) => (output += chunk))
    child.stderr.on("data", (chunk) => (output += chunk))
    child.on("error", reject)
    child.on("exit", (code) => resolve({ code, output }))
  })

test(
  "the local preview check fails when the storefront is unavailable",
  { timeout: 180_000 },
  async () => {
    const previewUrl = `http://127.0.0.1:${await unusedPort()}`
    const { code, output } = await runCheck(previewUrl)

    assert.notEqual(code, 0, output)
    assert.match(output, /ERR_CONNECTION_REFUSED/, output)
    assert.match(output, /1 failed/, output)
    assert.match(output, /Local preview browser check failed/, output)
  }
)
