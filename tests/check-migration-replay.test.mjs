// Unit tests for the comparison helpers of the migration replay check.
// They need no database. Run with: node --test tests/check-migration-replay.test.mjs

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import {
  diffRowCounts,
  diffSnapshots,
  redact,
  tablesWithRows,
} from "../scripts/lib/migration-replay.mjs"

const snapshot = (tables, identifiers = {}) => ({
  tables: Object.fromEntries(
    Object.entries(tables).map(([name, [rows, digest]]) => [name, { rows, digest }])
  ),
  identifiers,
})

test("identical snapshots have no differences", () => {
  const a = snapshot({ product: [8, "a"], store: [1, "b"] }, { store: ["s1 | Default"] })
  const b = snapshot({ product: [8, "a"], store: [1, "b"] }, { store: ["s1 | Default"] })
  assert.deepEqual(diffSnapshots(a, b), [])
})

test("a changed row count is reported with both counts", () => {
  const a = snapshot({ store: [1, "a"] })
  const b = snapshot({ store: [2, "b"] })
  assert.deepEqual(diffSnapshots(a, b), ["Table store changed from 1 to 2 rows."])
})

test("changed content with the same row count is reported", () => {
  const a = snapshot({ region: [1, "a"] })
  const b = snapshot({ region: [1, "b"] })
  assert.deepEqual(diffSnapshots(a, b), [
    "Table region kept 1 rows but their content changed.",
  ])
})

test("a table that appears or disappears is reported", () => {
  const a = snapshot({ product: [1, "a"] })
  const b = snapshot({ product: [1, "a"], company: [0, "x"] })
  assert.deepEqual(diffSnapshots(a, b), ["Table company exists only after."])
  assert.deepEqual(diffSnapshots(b, a), ["Table company exists only before."])
})

test("a changed identifier is reported", () => {
  const a = snapshot({}, { sales_channel: ["sc_1 | Default"] })
  const b = snapshot({}, { sales_channel: ["sc_2 | Default"] })
  const [difference] = diffSnapshots(a, b)
  assert.match(difference, /^Identifiers of sales_channel changed/)
})

test("row counts ignore digests and compare against a reference", () => {
  const reference = snapshot({ store: [1, "a"], product: [8, "a"] })
  const same = snapshot({ store: [1, "z"], product: [8, "z"] })
  const duplicated = snapshot({ store: [2, "z"], product: [8, "z"] })
  assert.deepEqual(diffRowCounts(reference, same), [])
  assert.deepEqual(diffRowCounts(reference, duplicated), [
    "Table store has 2 rows. A single-run bootstrap has 1.",
  ])
})

test("tablesWithRows lists only populated tables", () => {
  assert.deepEqual(tablesWithRows(snapshot({ a: [0, "x"], b: [3, "y"] })), ["b"])
})

test("redact removes every secret and ignores empty ones", () => {
  const text = "password=s3cret token=s3cret other=t0ken"
  assert.equal(
    redact(text, ["s3cret", undefined, "", "t0ken"]),
    "password=<redacted> token=<redacted> other=<redacted>"
  )
})

test("the check refuses to run without a database server", () => {
  const env = { ...process.env }
  delete env.REPLAY_CHECK_DATABASE_URL
  const result = spawnSync(
    process.execPath,
    [new URL("../scripts/check-migration-replay.mjs", import.meta.url).pathname],
    { env, encoding: "utf8" }
  )
  assert.equal(result.status, 2)
  assert.match(result.stderr, /REPLAY_CHECK_DATABASE_URL/)
})
