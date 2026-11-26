// Run the shell steps of the local container preview guide against a stub
// Docker engine, and check that the cleanup removes every resource that the
// guide creates. Run with: node --test tests/local-container-preview-doc.test.mjs

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { fileURLToPath } from "node:url"

const guidePath = fileURLToPath(
  new URL("../docs/local-container-preview.md", import.meta.url)
)

// The stub Docker engine keeps its state in a JSON file. It fails the way
// Docker does when a command refers to a missing resource or removes a
// resource that is still in use.
const stubDocker = String.raw`
import { readFileSync, writeFileSync, appendFileSync } from "node:fs"

const [statePath, logPath, ...args] = process.argv.slice(2)
const state = JSON.parse(readFileSync(statePath, "utf8"))
appendFileSync(logPath, JSON.stringify(["docker", ...args]) + "\n")

const fail = (message) => {
  console.error("stub docker: " + message)
  process.exit(1)
}

const parse = (rest, valueFlags, booleanFlags) => {
  const flags = {}
  const positional = []
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i]
    if (valueFlags.includes(word)) {
      if (i + 1 >= rest.length) fail("missing value for " + word)
      ;(flags[word] ??= []).push(rest[++i])
    } else if (booleanFlags.includes(word)) {
      flags[word] = true
    } else if (word.startsWith("-")) {
      fail("unknown flag " + word)
    } else {
      positional.push(word)
    }
  }
  return { flags, positional }
}

const imageExists = (image) =>
  state.images.includes(image) || state.pulled.includes(image)

const [command, ...rest] = args

if (command === "network" && rest[0] === "create") {
  const { positional } = parse(rest.slice(1), [], [])
  if (positional.length !== 1) fail("network create needs one name")
  if (state.networks.includes(positional[0])) fail("network exists")
  state.networks.push(positional[0])
} else if (command === "network" && rest[0] === "rm") {
  const { positional } = parse(rest.slice(1), [], [])
  if (positional.length === 0) fail("network rm needs a name")
  for (const name of positional) {
    if (!state.networks.includes(name)) fail("no such network " + name)
    if (state.containers.some((container) => container.network === name)) {
      fail("network " + name + " has active endpoints")
    }
    state.networks = state.networks.filter((network) => network !== name)
  }
} else if (command === "run") {
  const { flags, positional } = parse(
    rest,
    ["--name", "--network", "-e", "-p"],
    ["-d", "--rm"]
  )
  const [image] = positional
  if (!image) fail("run needs an image")
  const network = flags["--network"]?.[0]
  if (network && !state.networks.includes(network)) {
    fail("no such network " + network)
  }
  if (!imageExists(image)) {
    if (image.includes(":")) state.pulled.push(image)
    else fail("no such image " + image)
  }
  const name = flags["--name"]?.[0]
  if (name && state.containers.some((container) => container.name === name)) {
    fail("container name in use " + name)
  }
  if (!flags["--rm"]) {
    state.containers.push({
      name: name ?? "anonymous container of " + image,
      image,
      network,
    })
  }
} else if (command === "build") {
  const { flags, positional } = parse(
    rest,
    ["--target", "--network", "--build-arg", "-t"],
    []
  )
  if (positional.length !== 1) fail("build needs one context")
  const network = flags["--network"]?.[0]
  if (network !== undefined && !["default", "host"].includes(network)) {
    fail("build network must be default or host")
  }
  for (const arg of flags["--build-arg"] ?? []) {
    if (!/^[A-Z_]+=.+/.test(arg)) fail("empty build argument " + arg)
  }
  for (const tag of flags["-t"] ?? []) {
    if (!state.images.includes(tag)) state.images.push(tag)
  }
} else if (command === "exec") {
  const [name, ...execArgs] = rest
  if (!state.containers.some((container) => container.name === name)) {
    fail("no such container " + name)
  }
  if (execArgs[0] === "psql") process.stdout.write("pk_stub_publishable\n")
} else if (command === "rm") {
  const { positional } = parse(rest, [], ["-f"])
  if (positional.length === 0) fail("rm needs a name")
  for (const name of positional) {
    if (!state.containers.some((container) => container.name === name)) {
      fail("no such container " + name)
    }
    state.containers = state.containers.filter(
      (container) => container.name !== name
    )
  }
} else if (command === "rmi") {
  const { positional } = parse(rest, [], [])
  if (positional.length === 0) fail("rmi needs a name")
  for (const image of positional) {
    if (!imageExists(image)) fail("no such image " + image)
    if (state.containers.some((container) => container.image === image)) {
      fail("image " + image + " is used by a container")
    }
    state.images = state.images.filter((tag) => tag !== image)
    state.pulled = state.pulled.filter((tag) => tag !== image)
  }
} else {
  fail("unsupported command " + args.join(" "))
}

writeFileSync(statePath, JSON.stringify(state))
`

const workDir = mkdtempSync(join(tmpdir(), "preview-guide-"))
after(() => rmSync(workDir, { recursive: true, force: true }))

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`

// Runs the guide's shell blocks in order, as one shell session, with stub
// docker, pnpm and node commands first on PATH.
const runGuide = (guide) => {
  const dir = mkdtempSync(join(workDir, "run-"))
  const binDir = join(dir, "bin")
  const statePath = join(dir, "state.json")
  const logPath = join(dir, "calls.log")
  const stubPath = join(dir, "docker-stub.mjs")
  mkdirSync(binDir)
  writeFileSync(
    statePath,
    JSON.stringify({ containers: [], networks: [], images: [], pulled: [] })
  )
  writeFileSync(logPath, "")
  writeFileSync(stubPath, stubDocker)

  const executable = (name, body) => {
    const path = join(binDir, name)
    writeFileSync(path, `#!/bin/sh\n${body}\n`)
    chmodSync(path, 0o755)
  }
  executable(
    "docker",
    `exec ${quote(process.execPath)} ${quote(stubPath)} ${quote(statePath)} ${quote(logPath)} "$@"`
  )
  for (const name of ["pnpm", "node"]) {
    executable(
      name,
      `printf '%s\\n' "$(printf '%s ' ${name} "$@")" >> ${quote(logPath)}`
    )
  }

  const script = [...guide.matchAll(/^```sh\n([\s\S]*?)^```$/gm)]
    .map(([, block]) => block)
    .join("\n")
  const result = spawnSync("sh", ["-eu", "-c", script], {
    cwd: dir,
    encoding: "utf8",
    env: { PATH: `${binDir}:${process.env.PATH}`, HOME: dir },
  })

  return {
    status: result.status,
    stderr: result.stderr,
    state: JSON.parse(readFileSync(statePath, "utf8")),
    calls: readFileSync(logPath, "utf8").split("\n").filter(Boolean),
  }
}

const guide = readFileSync(guidePath, "utf8").replaceAll("\r\n", "\n")
const run = runGuide(guide)

test("the guide's commands run in order without an error", () => {
  assert.equal(run.status, 0, run.stderr)
})

test("the guide creates the preview containers, network and images", () => {
  const dockerCalls = run.calls
    .filter((line) => line.startsWith("["))
    .map((line) => JSON.parse(line))
  const named = (command, flag) =>
    dockerCalls
      .filter(([, sub]) => sub === command)
      .flatMap((call) => {
        const index = call.indexOf(flag)
        return index >= 0 ? [call[index + 1]] : []
      })
      .sort()

  assert.deepEqual(named("run", "--name"), [
    "b2b-preview-api",
    "b2b-preview-db",
    "b2b-preview-storefront",
  ])
  assert.deepEqual(named("network", "create"), ["b2b-preview-net"])
  assert.deepEqual(named("build", "-t"), [
    "b2b-preview-backend",
    "b2b-preview-storefront",
  ])
})

test("the cleanup leaves no preview container, network or image", () => {
  assert.deepEqual(run.state.containers, [])
  assert.deepEqual(run.state.networks, [])
  assert.deepEqual(run.state.images, [])
})

test("the guide keeps the shared PostgreSQL image", () => {
  assert.deepEqual(run.state.pulled, ["postgres:16-alpine"])
})

test("the guide runs the browser check against the preview", () => {
  assert.ok(
    run.calls.includes("node scripts/verify-local-preview.mjs "),
    run.calls.join("\n")
  )
})

test("a guide without the cleanup step leaves the preview resources", () => {
  const cleanupStep = guide.indexOf("7. Remove the preview.")
  assert.ok(cleanupStep > 0)
  const leftover = runGuide(guide.slice(0, cleanupStep))

  assert.equal(leftover.status, 0, leftover.stderr)
  assert.deepEqual(leftover.state.containers.map(({ name }) => name).sort(), [
    "b2b-preview-api",
    "b2b-preview-db",
    "b2b-preview-storefront",
  ])
  assert.deepEqual(leftover.state.networks, ["b2b-preview-net"])
  assert.deepEqual(leftover.state.images.sort(), [
    "b2b-preview-backend",
    "b2b-preview-storefront",
  ])
})
