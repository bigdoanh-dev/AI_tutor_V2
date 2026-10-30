import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { db, pool, sql, one } from "./db.js";
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(734801)`);
  await tx.execute(
    sql`CREATE TABLE IF NOT EXISTS nexus_migrations(name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz DEFAULT now())`,
  );
  const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
  for (const name of (await readdir(directory))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const body = await readFile(directory + name, "utf8");
    const hash = createHash("sha256").update(body).digest("hex");
    const existing = await one(
      sql`SELECT hash FROM nexus_migrations WHERE name=${name}`,
      tx,
    );
    if (existing && existing.hash !== hash)
      throw new Error(`Migration changed: ${name}`);
    if (!existing) {
      await tx.execute(sql.raw(body));
      await tx.execute(
        sql`INSERT INTO nexus_migrations(name,hash) VALUES (${name},${hash})`,
      );
      console.log(`Applied ${name}`);
    }
  }
});
await pool.end();
