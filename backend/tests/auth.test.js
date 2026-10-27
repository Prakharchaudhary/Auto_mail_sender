import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_EMAIL = 'Admin@Example.com';
process.env.ADMIN_PASSWORD = 'correct horse battery';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.CRON_SECRET = 'cron-secret-value';

const { default: app } = await import('../src/app.js');

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

const login = (base, body) => fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('login accepts only the configured admin (email is case-insensitive)', async () => {
  await withServer(async (base) => {
    const ok = await login(base, { email: 'admin@example.com', password: 'correct horse battery' });
    assert.equal(ok.status, 200);
    assert.ok((await ok.json()).token);

    assert.equal((await login(base, { email: 'admin@example.com', password: 'wrong' })).status, 401);
    assert.equal((await login(base, { email: 'someone@else.com', password: 'correct horse battery' })).status, 401);
  });
});

test('registration is disabled', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/auth/register`, { method: 'POST' });
    assert.equal(response.status, 403);
  });
});
