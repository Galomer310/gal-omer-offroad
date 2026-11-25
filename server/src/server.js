/**
 * Start the API. Settings come from the environment (see .env.example).
 * In production it refuses to start without the settings that keep it safe,
 * rather than starting with a guessable default.
 */
import crypto from 'node:crypto';
import { createApp } from './app.js';
import { openDb } from './db.js';

const prod = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 8790);

const salt = process.env.IP_SALT ?? (prod ? '' : crypto.randomBytes(16).toString('hex'));
if (prod && (!process.env.DATABASE_URL || salt.length < 24)) {
  console.error('Refusing to start: DATABASE_URL and IP_SALT (24+ characters) are required in production.');
  process.exit(1);
}
const adminToken = process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length >= 24 ? process.env.ADMIN_TOKEN : undefined;
if (process.env.ADMIN_TOKEN && !adminToken) console.warn('ADMIN_TOKEN is shorter than 24 characters: moderation is disabled.');

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? (prod ? '' : 'http://localhost:5190,http://localhost:4190'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const blocked = (process.env.BLOCKED_WORDS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const db = await openDb();
const app = createApp({ db, salt, allowedOrigins, adminToken, blocked });
app.listen(port, () => {
  console.log(`offroad api on :${port} (${process.env.DATABASE_URL ? 'postgres' : 'in-memory pglite'})`);
});
