import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, withTransaction } from './db.js';

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const directory = join(process.cwd(), 'migrations');
  const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const found = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
    if (found.rowCount) continue;
    const sql = await readFile(join(directory, file), 'utf8');
    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
    });
    console.log(`Applied migration ${file}`);
  }
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
