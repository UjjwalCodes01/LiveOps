const { Client } = require('pg');
const { readdir, readFile } = require('node:fs/promises');
const { join } = require('node:path');

const migrationsDirectory = join(__dirname, '..', 'migrations');
const advisoryLockId = 817240191;

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to run migrations.');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockId]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const files = (await readdir(migrationsDirectory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name));
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDirectory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        process.stdout.write(`Applied ${file}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockId]).catch(() => undefined);
    await client.end();
  }
}

migrate().catch((error) => {
  process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
