import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// This smoke test expects the seeded demo and a Chrome or Chromium executable.
const chrome = process.env.CHROME_PATH
if (!chrome) {
  throw new Error("Set CHROME_PATH to a Chrome or Chromium executable.")
}

const storefront = process.env.PREVIEW_URL || "http://localhost:18000"
const profile = await mkdtemp(join(tmpdir(), "b2b-preview-test-"))
const child = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--disable-background-networking",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket

try {
  let port
  for (let attempt = 0; attempt < 100 && !port; attempt++) {
    try {
      port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]
    } catch {
      await delay(100)
    }
  }
  assert.ok(port, "Chrome did not start")
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${storefront}/gb/store`)}`,
    { method: "PUT" }
  )
  assert.ok(response.ok, "Chrome could not open the storefront")
  const target = await response.json()
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  let nextId = 0
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  }
  const call = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
  await call("Runtime.enable")
  let text = ""
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = await call("Runtime.evaluate", {
      expression: "document.body?.innerText || ''",
      returnByValue: true,
    })
    text = result.result?.result?.value || ""
    if (text.includes("8 products") || text.includes("Couldn't load products")) break
    await delay(500)
  }
  assert.match(text, /8 products/, "The seeded product search did not load")
  assert.match(text, /Ultra-Slim AI Laptop/, "The seeded laptop is missing")
  assert.doesNotMatch(text, /Couldn't load products/, "Product search failed")
  console.log("Local preview browser check passed: eight seeded products loaded.")
} finally {
  socket?.close()
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit")
    child.kill()
    await exited
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
