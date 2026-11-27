// Helpers for the migration replay check (scripts/check-migration-replay.mjs).
// The functions that read a database take a `pg` client. The comparison and
// redaction functions are pure, so tests can run them without a database.

// Identifier queries for the report. Each entry names a table, the columns to
// list and the order. The report shows the identifiers that the replay must
// preserve. The digest comparison below covers every table, so a table that is
// missing from this list is still compared.
export const IDENTIFIER_QUERIES = [
  { key: "store", sql: `SELECT id, name FROM store ORDER BY id` },
  { key: "sales_channel", sql: `SELECT id, name FROM sales_channel ORDER BY id` },
  {
    key: "publishable_api_key",
    sql: `SELECT id, title FROM api_key WHERE type = 'publishable' ORDER BY id`,
  },
  { key: "region", sql: `SELECT id, name FROM region ORDER BY id` },
  { key: "product", sql: `SELECT id, handle FROM product ORDER BY id` },
  { key: "product_variant", sql: `SELECT id, sku FROM product_variant ORDER BY id` },
  { key: "stock_location", sql: `SELECT id, name FROM stock_location ORDER BY id` },
  { key: "shipping_option", sql: `SELECT id, name FROM shipping_option ORDER BY id` },
  { key: "company", sql: `SELECT id, name FROM company ORDER BY id`, optional: true },
  { key: "employee", sql: `SELECT id, company_id FROM employee ORDER BY id`, optional: true },
  { key: "customer", sql: `SELECT id, email FROM customer ORDER BY id` },
  { key: "user", sql: `SELECT id, email FROM "user" ORDER BY id` },
  {
    key: "script_migrations",
    sql: `SELECT script_name, finished_at IS NOT NULL AS finished FROM script_migrations ORDER BY script_name`,
  },
]

const quoteIdentifier = (name) => `"${name.replaceAll('"', '""')}"`

/**
 * Reads the row count and a content digest of every table in the public
 * schema. The digest hashes the text of all rows in a stable order, so it
 * changes when a row is added, removed or changed.
 */
export async function snapshotTables(client) {
  const { rows: tables } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  )
  const result = {}
  for (const { tablename } of tables) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS rows,
              md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest
         FROM ${quoteIdentifier(tablename)} t`
    )
    result[tablename] = { rows: rows[0].rows, digest: rows[0].digest }
  }
  return result
}

/** Lists the identifiers named in IDENTIFIER_QUERIES. Missing tables give null. */
export async function snapshotIdentifiers(client) {
  const result = {}
  for (const { key, sql, optional } of IDENTIFIER_QUERIES) {
    try {
      const { rows } = await client.query(sql)
      result[key] = rows.map((row) => Object.values(row).join(" | "))
    } catch (error) {
      if (optional && error?.code === "42P01") {
        result[key] = null
        continue
      }
      throw error
    }
  }
  return result
}

export async function takeSnapshot(client) {
  return {
    tables: await snapshotTables(client),
    identifiers: await snapshotIdentifiers(client),
  }
}

/**
 * Compares two snapshots and lists every difference. An empty list means that
 * no table changed its row count or content and that no identifier changed.
 * `ignore` names tables and identifier lists that are not compared.
 */
export function diffSnapshots(before, after, { ignore = [] } = {}) {
  const differences = []
  const names = new Set([
    ...Object.keys(before.tables),
    ...Object.keys(after.tables),
  ])
  for (const name of [...names].sort()) {
    if (ignore.includes(name)) continue
    const a = before.tables[name]
    const b = after.tables[name]
    if (!a || !b) {
      differences.push(`Table ${name} exists only ${a ? "before" : "after"}.`)
    } else if (a.rows !== b.rows) {
      differences.push(`Table ${name} changed from ${a.rows} to ${b.rows} rows.`)
    } else if (a.digest !== b.digest) {
      differences.push(`Table ${name} kept ${a.rows} rows but their content changed.`)
    }
  }

  const keys = new Set([
    ...Object.keys(before.identifiers),
    ...Object.keys(after.identifiers),
  ])
  for (const key of [...keys].sort()) {
    if (ignore.includes(key)) continue
    const a = JSON.stringify(before.identifiers[key] ?? null)
    const b = JSON.stringify(after.identifiers[key] ?? null)
    if (a !== b) {
      differences.push(`Identifiers of ${key} changed from ${a} to ${b}.`)
    }
  }
  return differences
}

/**
 * Compares the row count of every table with the counts of a reference
 * snapshot. Use it for two databases that hold the same data under different
 * generated identifiers, so digests and identifiers differ by design.
 */
export function diffRowCounts(reference, actual) {
  const differences = []
  const names = new Set([
    ...Object.keys(reference.tables),
    ...Object.keys(actual.tables),
  ])
  for (const name of [...names].sort()) {
    const expected = reference.tables[name]?.rows
    const found = actual.tables[name]?.rows
    if (expected !== found) {
      differences.push(
        `Table ${name} has ${found ?? "no"} rows. A single-run bootstrap has ${expected ?? "no"}.`
      )
    }
  }
  return differences
}

/** Lists the names of the tables that hold data. */
export const tablesWithRows = (snapshot) =>
  Object.entries(snapshot.tables)
    .filter(([, table]) => table.rows > 0)
    .map(([name]) => name)

/** Replaces each secret in the text, so logs never keep a credential. */
export function redact(text, secrets) {
  let result = text
  for (const secret of secrets) {
    if (secret) {
      result = result.split(secret).join("<redacted>")
    }
  }
  return result
}
