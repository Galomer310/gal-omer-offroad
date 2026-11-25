/**
 * API tests against a real (in-memory) Postgres: PGlite runs the same SQL,
 * constraints and time-zone maths as Neon will. Each test gets a fresh server
 * on a random port and talks to it over HTTP, as the browser does.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, clean, hasLink } from '../src/app.js';
import { openDb } from '../src/db.js';

let server;
let base;
let db;
const ORIGIN = 'http://localhost:5190';
const ADMIN = 'x'.repeat(30);

before(async () => {
  db = await openDb(''); // force PGlite
  const app = createApp({ db, salt: 'test-salt', allowedOrigins: [ORIGIN], adminToken: ADMIN, blocked: ['badword'] });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await db.close();
});

/** Each call can pretend to be a different visitor via X-Forwarded-For (one trusted proxy). */
const call = (path, { method = 'GET', body, ip = '203.0.113.1', headers = {} } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, Origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const lap = (ms) => {
  // Six evenly spaced gate times ending exactly at ms.
  const splits = Array.from({ length: 6 }, (_, i) => Math.round(((i + 1) * ms) / 6));
  splits[5] = ms;
  return splits;
};

test('clean() strips control and bidi characters and collapses spaces', () => {
  assert.equal(clean('  hi\u0000 there‮!  \n'), 'hi there !');
  assert.equal(clean(42), '');
});

test('hasLink() catches links but not ordinary words', () => {
  assert.ok(hasLink('see https://x.y'));
  assert.ok(hasLink('go to www.spam'));
  assert.ok(hasLink('buy at cheap-stuff.com now'));
  assert.ok(!hasLink('great work, see you at the summit'));
  assert.ok(!hasLink('שלום גל, אתר מעולה'));
});

test('health answers', async () => {
  const r = await call('/api/health');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('CORS: allowed origin is echoed, others are not', async () => {
  const ok = await call('/api/messages');
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const other = await call('/api/messages', { headers: { Origin: 'https://evil.example' } });
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('a message is stored, cleaned, and listed newest first', async () => {
  let r = await call('/api/messages', { method: 'POST', body: { name: '  Dana ', body: 'Lovely  desert!' }, ip: '198.51.100.1' });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).message.body, 'Lovely desert!');
  r = await call('/api/messages', { method: 'POST', body: { name: 'נועה', body: 'אתר מקסים' }, ip: '198.51.100.2' });
  assert.equal(r.status, 201);
  const list = (await (await call('/api/messages')).json()).messages;
  assert.equal(list[0].name, 'נועה');
  assert.equal(list[1].name, 'Dana');
  assert.ok(!('ip_hash' in list[0]), 'the IP hash never leaves the server');
});

test('messages: bad input is refused', async () => {
  const cases = [
    [{ name: '', body: 'hi' }, 'name'],
    [{ name: 'a'.repeat(25), body: 'hi' }, 'name'],
    [{ name: 'Dan', body: '' }, 'body'],
    [{ name: 'Dan', body: 'b'.repeat(81) }, 'body'],
    [{ name: 'Dan', body: 'visit https://spam.example' }, 'link'],
    [{ name: 'Dan', body: 'what a BadWord thing' }, 'blocked'],
    [{ name: { x: 1 }, body: 'hi' }, 'name'],
  ];
  let ip = 10;
  for (const [body, error] of cases) {
    const r = await call('/api/messages', { method: 'POST', body, ip: `192.0.2.${ip++}` });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal((await r.json()).error, error);
  }
});

test('messages: one per visitor per ten minutes', async () => {
  const ip = '198.51.100.50';
  assert.equal((await call('/api/messages', { method: 'POST', body: { name: 'A', body: 'first' }, ip })).status, 201);
  const second = await call('/api/messages', { method: 'POST', body: { name: 'A', body: 'second' }, ip });
  assert.equal(second.status, 429);
  // A different visitor is not affected.
  assert.equal((await call('/api/messages', { method: 'POST', body: { name: 'B', body: 'hello' }, ip: '198.51.100.51' })).status, 201);
});

test('messages: oversized and malformed bodies get a clean 400', async () => {
  const big = await fetch(base + '/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', body: 'y'.repeat(5000) }),
  });
  assert.equal(big.status, 400);
  const bad = await fetch(base + '/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'bad-request' });
});

test('moderation: delete needs the admin token', async () => {
  const r = await call('/api/messages', { method: 'POST', body: { name: 'Spammer', body: 'remove me' }, ip: '198.51.100.90' });
  const { id } = (await r.json()).message;
  assert.equal((await call(`/api/messages/${id}`, { method: 'DELETE' })).status, 401);
  assert.equal((await call(`/api/messages/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer wrong-token-wrong-token-wrong' } })).status, 401);
  const ok = await call(`/api/messages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ADMIN}` } });
  assert.equal(ok.status, 200);
  const list = (await (await call('/api/messages')).json()).messages;
  assert.ok(!list.some((m) => m.id === id));
});

test('laps: a plausible lap is ranked on today’s board', async () => {
  let r = await call('/api/laps', { method: 'POST', body: { name: 'Gal', ms: 31500, splits: lap(31500) }, ip: '198.51.100.120' });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).rank, 1);
  r = await call('/api/laps', { method: 'POST', body: { name: 'Ido', ms: 28000, splits: lap(28000) }, ip: '198.51.100.121' });
  assert.equal((await r.json()).rank, 1);
  const board = (await (await call('/api/laps')).json()).laps;
  assert.deepEqual(board.slice(0, 2).map((l) => l.name), ['Ido', 'Gal']);
});

test('laps: impossible or malformed laps are refused', async () => {
  const cases = [
    { name: 'Fast', ms: 5000, splits: lap(5000) }, // faster than the car can go
    { name: 'Skip', ms: 30000, splits: [1000, 1500, 20000, 25000, 30000] }, // a gate missing
    { name: 'Jump', ms: 30000, splits: [5000, 5500, 15000, 20000, 25000, 30000] }, // 0.5 s between two gates
    { name: 'Lie', ms: 30000, splits: lap(40000) }, // splits do not add up to the time
    { name: 'Float', ms: 30000.5, splits: lap(30000) },
    { name: '', ms: 30000, splits: lap(30000) },
  ];
  let ip = 200;
  for (const body of cases) {
    const r = await call('/api/laps', { method: 'POST', body, ip: `192.0.2.${ip++}` });
    assert.equal(r.status, 400, body.name);
  }
});

test('laps: one submission per visitor per 15 seconds', async () => {
  const ip = '198.51.100.140';
  assert.equal((await call('/api/laps', { method: 'POST', body: { name: 'A', ms: 40000, splits: lap(40000) }, ip })).status, 201);
  assert.equal((await call('/api/laps', { method: 'POST', body: { name: 'A', ms: 39000, splits: lap(39000) }, ip })).status, 429);
});

test('the database itself refuses what the API would refuse', async () => {
  await assert.rejects(db.query(`INSERT INTO messages (name, body, ip_hash) VALUES ('', 'x', 'h')`));
  await assert.rejects(db.query(`INSERT INTO laps (name, ms, day, ip_hash) VALUES ('x', 100, current_date, 'h')`));
});

test('unknown routes are a JSON 404, never a stack trace', async () => {
  const r = await call('/api/nope');
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: 'not-found' });
});
