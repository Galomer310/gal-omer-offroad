/**
 * One small interface over two databases:
 *  - Postgres (Neon in production) when DATABASE_URL is set;
 *  - PGlite, an in-memory Postgres, otherwise: local development and tests
 *    need nothing installed, and run the very same SQL.
 *
 * The schema is created on start with IF NOT EXISTS, so there is no migration
 * tool to run: two tables, and the constraints live in the database, not only
 * in the request handlers.
 */
import pg from 'pg';

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS messages (
    id          serial PRIMARY KEY,
    name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 24),
    body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 80),
    ip_hash     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS messages_created ON messages (created_at DESC);
  CREATE INDEX IF NOT EXISTS messages_ip ON messages (ip_hash, created_at DESC);

  CREATE TABLE IF NOT EXISTS laps (
    id          serial PRIMARY KEY,
    name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 16),
    ms          integer NOT NULL CHECK (ms BETWEEN 8000 AND 600000), -- same floor as app.js LAP_MIN_MS
    day         date NOT NULL,
    ip_hash     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS laps_day ON laps (day, ms);
  CREATE INDEX IF NOT EXISTS laps_ip ON laps (ip_hash, created_at DESC);
`;

/**
 * @typedef {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>, close: () => Promise<void> }} Db
 */

/** @returns {Promise<Db>} */
export async function openDb(url = process.env.DATABASE_URL) {
  if (url) {
    const pool = new pg.Pool({
      connectionString: url,
      max: 5,
      // Neon requires TLS; a local Postgres usually does not offer it.
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true },
    });
    await pool.query(SCHEMA);
    return { query: (sql, params) => pool.query(sql, params), close: () => pool.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(SCHEMA);
  return { query: (sql, params) => db.query(sql, params), close: () => db.close() };
}
