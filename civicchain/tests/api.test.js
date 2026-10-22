'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'civicchain-test-'));
const port = 47000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
let child;
let childOutput = '';

async function request(route, options = {}) {
  const response = await fetch(`${base}${route}`, options);
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}

before(async () => {
  const env = { ...process.env, PORT: String(port), CIVICCHAIN_DATA_DIR: path.join(tempRoot, 'data'), NODE_ENV: 'test' };
  for (const key of ['BLOCKCHAIN_RPC_URL', 'VOTING_CONTRACT_ADDRESS', 'ELECTION_REGISTRY_ADDRESS', 'BLOCKCHAIN_SUBMITTER_PRIVATE_KEY', 'BLOCKCHAIN_ADMIN_PRIVATE_KEY', 'ZK_VERIFICATION_KEY_PATH', 'ZK_WASM_PATH', 'ZK_ZKEY_PATH']) delete env[key];
  child = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { childOutput += chunk.toString(); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString(); });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited before ready:\n${childOutput}`);
    try {
      const response = await fetch(`${base}/api/v1/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Server failed to start:\n${childOutput}`);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('serves the application and health endpoint', async () => {
  const health = await request('/api/v1/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /CIVICCHAIN/);
  for (const route of ['/privacy', '/forgot-password', '/reset-password', '/elections/campus-2026', '/verify-ballot']) {
    const page = await fetch(`${base}${route}`);
    assert.equal(page.status, 200, `SPA route ${route} should support direct loading`);
    assert.match(await page.text(), /id="app"/);
  }
});

test('returns election data from explicitly labelled development fixtures', async () => {
  const result = await request('/api/v1/overview');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.source, 'LOCAL_DEVELOPMENT_FIXTURES');
  assert.equal(result.body.elections.length, 3);
  assert.ok(result.body.elections.every(election => election.fixture === true));
});

test('rejects privileged dashboard access without a session', async () => {
  const result = await request('/api/v1/admin/dashboard');
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error.code, 'AUTH_REQUIRED');
});

test('registration validates input and rejects a duplicate email', async () => {
  const user = { name: 'Integration Test', email: 'integration@example.test', password: 'A-long-unique-password-26' };
  const created = await request('/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(user) });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.user.role, 'VOTER');
  const duplicate = await request('/api/v1/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(user) });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.body.error.code, 'ACCOUNT_EXISTS');
});

test('login sets an HTTP-only cookie and creates an authenticated session', async () => {
  const result = await request('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@civicchain.local', password: 'CivicChainDemo!26' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.user.role, 'ADMIN');
  const cookie = result.response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const session = await request('/api/v1/session', { headers: { cookie: cookie.split(';')[0] } });
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.user.role, 'ADMIN');
});

test('allows authorized election draft creation but does not fake publication', async () => {
  const login = await request('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@civicchain.local', password: 'CivicChainDemo!26' }) });
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const now = Date.now();
  const created = await request('/api/v1/admin/elections', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ title: 'Integration Election', description: 'Created by automated test.', purpose: 'Test', constituency: 'Synthetic members', startTime: new Date(now + 86400000).toISOString(), endTime: new Date(now + 172800000).toISOString(), options: [{ name: 'Option A' }, { name: 'Option B' }] })
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.election.status, 'DRAFT');
  const publish = await request(`/api/v1/admin/elections/${created.body.election.id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({}) });
  assert.equal(publish.response.status, 501);
  assert.equal(publish.body.error.code, 'CHAIN_LIFECYCLE_ADAPTER_REQUIRED');
  const detail = await request(`/api/v1/elections/${created.body.election.id}`);
  assert.equal(detail.body.election.status, 'DRAFT');
});

test('does not accept a ballot while real proof artifacts are missing', async () => {
  const login = await request('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'voter@civicchain.local', password: 'CivicChainDemo!26' }) });
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const attempt = await request('/api/v1/elections/campus-2026/ballots', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ encryptedBallot: 'ab'.repeat(384), proof: { pi_a: ['1', '2'] }, publicSignals: ['1', '2', '3'] })
  });
  assert.equal(attempt.response.status, 503);
  assert.equal(attempt.body.error.code, 'ZK_VERIFIER_UNAVAILABLE');
});


test('password recovery uses a private development mock outbox and a single-use token', async () => {
  const requestReset = await request('/api/v1/auth/forgot-password', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'voter@civicchain.local' })
  });
  assert.equal(requestReset.response.status, 202);
  assert.match(requestReset.body.message, /does not send real email/i);
  const outboxPath = path.join(tempRoot, 'data', 'mock-mail-outbox.json');
  assert.equal(fs.existsSync(outboxPath), true);
  const outbox = JSON.parse(fs.readFileSync(outboxPath, 'utf8'));
  const resetUrl = new URL(outbox[0].resetUrl);
  const token = new URLSearchParams(resetUrl.hash.slice(1)).get('token');
  assert.ok(token && token.length >= 40);
  const changed = await request('/api/v1/auth/reset-password', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'A-new-unique-password-26' })
  });
  assert.equal(changed.response.status, 200);
  const reused = await request('/api/v1/auth/reset-password', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: 'Another-new-password-26' })
  });
  assert.equal(reused.response.status, 400);
  const oldLogin = await request('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'voter@civicchain.local', password: 'CivicChainDemo!26' }) });
  assert.equal(oldLogin.response.status, 401);
  const newLogin = await request('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'voter@civicchain.local', password: 'A-new-unique-password-26' }) });
  assert.equal(newLogin.response.status, 200);
});


test('production-mode initialization does not seed public demo credentials or elections', async () => {
  const productionPort = 52000 + Math.floor(Math.random() * 1000);
  const productionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'civicchain-production-'));
  const env = { ...process.env, PORT: String(productionPort), CIVICCHAIN_DATA_DIR: path.join(productionRoot, 'data'), NODE_ENV: 'production' };
  for (const key of ['BLOCKCHAIN_RPC_URL', 'VOTING_CONTRACT_ADDRESS', 'ELECTION_REGISTRY_ADDRESS', 'BLOCKCHAIN_SUBMITTER_PRIVATE_KEY', 'BLOCKCHAIN_ADMIN_PRIVATE_KEY', 'ZK_VERIFICATION_KEY_PATH', 'ZK_WASM_PATH', 'ZK_ZKEY_PATH']) delete env[key];
  const productionBase = `http://127.0.0.1:${productionPort}`;
  const productionServer = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  productionServer.stdout.on('data', chunk => { output += chunk.toString(); });
  productionServer.stderr.on('data', chunk => { output += chunk.toString(); });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (productionServer.exitCode !== null) throw new Error(`Production server exited early: ${output}`);
      try { const response = await fetch(`${productionBase}/api/v1/health`); if (response.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, `Production server did not start: ${output}`);
    const overview = await fetch(`${productionBase}/api/v1/overview`).then(r => r.json());
    assert.equal(overview.elections.length, 0);
    assert.equal(overview.source, 'APPLICATION_DATA');
    const login = await fetch(`${productionBase}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@civicchain.local', password: 'CivicChainDemo!26' }) });
    assert.equal(login.status, 401);
  } finally {
    if (productionServer.exitCode === null) {
      productionServer.kill('SIGTERM');
      await new Promise(resolve => productionServer.once('exit', resolve));
    }
    fs.rmSync(productionRoot, { recursive: true, force: true });
  }
});

test('labels transaction references unverifiable when no chain endpoint is configured', async () => {
  const hash = `0x${'a'.repeat(64)}`;
  const result = await request(`/api/v1/verify/transaction/${hash}`);
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, 'UNVERIFIABLE');
});
