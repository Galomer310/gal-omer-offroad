/**
 * The guestbook and the daily lap board. Small on purpose: two tables, five
 * routes. Everything a visitor sends is untrusted, so every value is cleaned,
 * length-checked here and constrained again in the database.
 *
 * Privacy: the visitor's IP address is never stored. Only a salted hash of
 * it, used for rate limits, so "one message per ten minutes" works without
 * keeping anything that identifies a person.
 */
import crypto from 'node:crypto';
import express from 'express';

const MESSAGE_GAP_MIN = 10; // one message per visitor per 10 minutes
const MESSAGES_PER_HOUR = 60; // flood guard across all visitors
const LAP_GAP_SEC = 15;
const SHOW_MESSAGES = 30;
const LAP_MIN_MS = 8000; // a flat-out lap at top speed is ~7 s of pure distance
const SEGMENT_MIN_MS = 1000; // gates are ~40 m apart; 34 m/s is the top speed
const GATES = 6;

/** Strip control characters and invisible tricks, collapse whitespace, trim. */
export function clean(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ') // control and format chars (incl. bidi overrides)
    .replace(/\s+/g, ' ')
    .trim();
}

/** No links: the guestbook is for people, not for spam. */
export function hasLink(text) {
  return /(https?:|www\.|\b[\w-]+\.(com|net|org|io|co|il|ly|me|app|dev|xyz|ru|info|biz|link|site|top)\b)/i.test(text);
}

/**
 * @param {{ db: import('./db.js').Db, salt: string, allowedOrigins: string[], adminToken?: string, blocked?: string[], now?: () => Date }} opts
 */
export function createApp({ db, salt, allowedOrigins, adminToken, blocked = [] }) {
  const app = express();
  app.disable('x-powered-by');
  // Render (and most hosts) put one proxy in front; trust exactly that one,
  // so req.ip is the visitor and not the proxy, and cannot be spoofed further.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2kb' }));

  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const ipHash = (req) => crypto.createHash('sha256').update(`${salt}:${req.ip ?? ''}`).digest('hex').slice(0, 32);
  const isBlocked = (text) => {
    const t = text.toLowerCase();
    return blocked.some((w) => w && t.includes(w));
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local' });
  });

  /* --- guestbook ----------------------------------------------------------- */
  app.get('/api/messages', async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id, name, body, created_at FROM messages ORDER BY created_at DESC, id DESC LIMIT $1`,
      [SHOW_MESSAGES],
    );
    res.json({ messages: rows });
  });

  app.post('/api/messages', async (req, res) => {
    const name = clean(req.body?.name);
    const body = clean(req.body?.body);
    if (name.length < 1 || name.length > 24) return res.status(400).json({ error: 'name' });
    if (body.length < 1 || body.length > 80) return res.status(400).json({ error: 'body' });
    if (hasLink(name) || hasLink(body)) return res.status(400).json({ error: 'link' });
    if (isBlocked(name) || isBlocked(body)) return res.status(400).json({ error: 'blocked' });

    const hash = ipHash(req);
    const recent = await db.query(
      `SELECT 1 FROM messages WHERE ip_hash = $1 AND created_at > now() - make_interval(mins => $2) LIMIT 1`,
      [hash, MESSAGE_GAP_MIN],
    );
    if (recent.rows.length) return res.status(429).json({ error: 'too-soon', minutes: MESSAGE_GAP_MIN });
    const flood = await db.query(`SELECT count(*)::int AS n FROM messages WHERE created_at > now() - interval '1 hour'`);
    if (flood.rows[0].n >= MESSAGES_PER_HOUR) return res.status(429).json({ error: 'busy' });

    const { rows } = await db.query(
      `INSERT INTO messages (name, body, ip_hash) VALUES ($1, $2, $3) RETURNING id, name, body, created_at`,
      [name, body, hash],
    );
    res.status(201).json({ message: rows[0] });
  });

  // Moderation: only with the admin token, and the route does not exist without one.
  app.delete('/api/messages/:id', async (req, res) => {
    if (!adminToken) return res.sendStatus(404);
    const given = Buffer.from((req.get('authorization') ?? '').replace(/^Bearer /, ''));
    const want = Buffer.from(adminToken);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.sendStatus(401);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id' });
    const r = await db.query(`DELETE FROM messages WHERE id = $1 RETURNING id`, [id]);
    res.status(r.rows.length ? 200 : 404).json({ deleted: r.rows.length });
  });

  /* --- daily lap board ----------------------------------------------------- */
  // "Today" is Israel's day, the same for every visitor wherever they are.
  const TODAY = `(now() AT TIME ZONE 'Asia/Jerusalem')::date`;

  app.get('/api/laps', async (_req, res) => {
    const { rows } = await db.query(
      `SELECT name, ms FROM laps WHERE day = ${TODAY} ORDER BY ms ASC, created_at ASC LIMIT 10`,
    );
    res.json({ laps: rows });
  });

  app.post('/api/laps', async (req, res) => {
    const name = clean(req.body?.name);
    const ms = req.body?.ms;
    const splits = req.body?.splits;
    if (name.length < 1 || name.length > 16 || hasLink(name) || isBlocked(name)) return res.status(400).json({ error: 'name' });
    if (!Number.isInteger(ms) || ms < LAP_MIN_MS || ms > 600000) return res.status(400).json({ error: 'time' });
    // The client sends the time at each gate. A real lap passes all six, in
    // order, and no stretch between two gates can beat the car's top speed.
    if (!Array.isArray(splits) || splits.length !== GATES || !splits.every(Number.isInteger)) {
      return res.status(400).json({ error: 'splits' });
    }
    let prev = 0;
    for (const s of splits) {
      if (s - prev < SEGMENT_MIN_MS) return res.status(400).json({ error: 'splits' });
      prev = s;
    }
    if (Math.abs(prev - ms) > 50) return res.status(400).json({ error: 'splits' });

    const hash = ipHash(req);
    const recent = await db.query(
      `SELECT 1 FROM laps WHERE ip_hash = $1 AND created_at > now() - make_interval(secs => $2) LIMIT 1`,
      [hash, LAP_GAP_SEC],
    );
    if (recent.rows.length) return res.status(429).json({ error: 'too-soon' });

    await db.query(`INSERT INTO laps (name, ms, day, ip_hash) VALUES ($1, $2, ${TODAY}, $3)`, [name, ms, hash]);
    const { rows } = await db.query(
      `SELECT count(*)::int + 1 AS rank FROM laps WHERE day = ${TODAY} AND ms < $1`,
      [ms],
    );
    res.status(201).json({ rank: rows[0].rank });
  });

  app.use((_req, res) => res.status(404).json({ error: 'not-found' }));
  // Express 5 routes async errors here. Never leak a stack trace to a visitor.
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large' || err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad-request' });
    console.error(err);
    res.status(500).json({ error: 'server' });
  });
  return app;
}
