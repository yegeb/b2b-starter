// Check that the local container preview guide removes every Docker resource
// that it creates. Run with: node --test tests/local-container-preview-doc.test.mjs

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const guide = readFileSync(
  new URL("../docs/local-container-preview.md", import.meta.url),
  "utf8"
)

// Each shell command in the guide, with line continuations joined.
const commands = [...guide.matchAll(/```sh\n([\s\S]*?)```/g)]
  .flatMap(([, block]) => block.replace(/\\\n\s*/g, " ").split("\n"))
  .map((line) => line.trim())
  .filter(Boolean)

const argumentsOf = (prefix) =>
  commands
    .filter((command) => command.startsWith(`${prefix} `))
    .flatMap((command) => command.slice(prefix.length).trim().split(/\s+/))
    .filter((word) => !word.startsWith("-"))

const created = {
  containers: commands
    .filter((command) => command.startsWith("docker run "))
    .flatMap((command) => command.match(/--name (\S+)/)?.[1] ?? []),
  networks: argumentsOf("docker network create"),
  images: commands
    .filter((command) => command.startsWith("docker build "))
    .map((command) => command.match(/ -t (\S+)/)?.[1]),
}

const removed = {
  containers: argumentsOf("docker rm"),
  networks: argumentsOf("docker network rm"),
  images: argumentsOf("docker rmi"),
}

const sorted = (values) => [...values].sort()

test("the guide creates the expected preview resources", () => {
  assert.deepEqual(sorted(created.containers), [
    "b2b-preview-api",
    "b2b-preview-db",
    "b2b-preview-storefront",
  ])
  assert.deepEqual(created.networks, ["b2b-preview-net"])
  assert.deepEqual(sorted(created.images), [
    "b2b-preview-backend",
    "b2b-preview-storefront",
  ])
})

test("every container without a name is removed when it stops", () => {
  const unnamed = commands.filter(
    (command) => command.startsWith("docker run ") && !command.includes("--name ")
  )
  assert.ok(unnamed.length > 0)
  for (const command of unnamed) {
    assert.match(command, /^docker run --rm /, command)
  }
})

test("the cleanup removes every container, network and image the guide creates", () => {
  for (const kind of ["containers", "networks", "images"]) {
    assert.deepEqual(sorted(removed[kind]), sorted(created[kind]), kind)
  }
})

test("the cleanup removes the containers before their network", () => {
  const index = (prefix) =>
    commands.findIndex((command) => command.startsWith(`${prefix} `))
  assert.ok(index("docker rm") >= 0)
  assert.ok(index("docker rm") < index("docker network rm"))
})
