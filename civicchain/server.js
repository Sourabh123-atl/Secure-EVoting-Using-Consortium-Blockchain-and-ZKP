'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const DOTENV_PATH = path.join(ROOT, '.env');
if (fs.existsSync(DOTENV_PATH)) {
  for (const line of fs.readFileSync(DOTENV_PATH, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['\"]|['\"]$/g, '');
  }
}

const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.resolve(process.env.CIVICCHAIN_DATA_DIR || path.join(ROOT, 'data'));
const DB_PATH = path.join(DATA_DIR, 'db.json');
const SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_BODY = 1024 * 1024;
const PORT = Number(process.env.PORT || 4173);
const sessions = new Map();
const rateLimits = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const key = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${key}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function isProductionWithoutDemo() {
  const allowDemo = process.env.ALLOW_DEMO_ACCOUNTS === 'true' || process.env.DEMO_MODE === 'true';
  return process.env.NODE_ENV === 'production' && !allowDemo;
}

function defaultDb() {
  const production = isProductionWithoutDemo();
  const now = new Date().toISOString();
  const demoHash = () => hashPassword('CivicChainDemo!26');
  const users = production ? [] : [
    { id: 'usr_admin_demo', email: 'admin@civicchain.local', passwordHash: demoHash(), role: 'ADMIN', name: 'Demo Administrator', status: 'ACTIVE', eligibilityStatus: 'NOT_APPLIED', createdAt: now },
    { id: 'usr_voter_demo', email: 'voter@civicchain.local', passwordHash: demoHash(), role: 'VOTER', name: 'Demo Voter', status: 'ACTIVE', eligibilityStatus: 'APPROVED', createdAt: now },
    { id: 'usr_auditor_demo', email: 'auditor@civicchain.local', passwordHash: demoHash(), role: 'AUDITOR', name: 'Demo Auditor', status: 'ACTIVE', eligibilityStatus: 'NOT_APPLIED', createdAt: now }
  ];
  const elections = production ? [] : [
    {
      id: 'campus-2026', chainElectionId: '20261001', title: 'Campus Council · General Election', shortTitle: 'Campus Council', description: 'A development fixture for demonstrating a privacy-conscious, single-choice election workflow.', purpose: 'Campus governance', constituency: 'Synthetic university community', status: 'OPEN', startTime: '2026-10-01T08:00:00.000Z', endTime: '2026-12-15T16:00:00.000Z', options: [{ id: 'opt-north', name: 'North Hall', description: 'Representatives for campus services.' }, { id: 'opt-grove', name: 'Grove Collective', description: 'Representatives for student wellbeing.' }, { id: 'opt-bridge', name: 'Bridge Forum', description: 'Representatives for academic affairs.' }], eligibilityRoot: null, configurationCommitment: null, results: null, fixture: true, createdAt: now
    },
    {
      id: 'research-society-2026', chainElectionId: '20261115', title: 'Research Society Chair', shortTitle: 'Research Society', description: 'A scheduled fixture showing election setup and publication states.', purpose: 'Society leadership', constituency: 'Synthetic research society members', status: 'SCHEDULED', startTime: '2026-11-15T08:00:00.000Z', endTime: '2026-11-22T16:00:00.000Z', options: [{ id: 'opt-fern', name: 'Fern Group', description: 'Research support and events.' }, { id: 'opt-summit', name: 'Summit Group', description: 'Research funding and mentoring.' }], eligibilityRoot: null, configurationCommitment: null, results: null, fixture: true, createdAt: now
    },
    {
      id: 'engineering-council-2026', chainElectionId: '20260920', title: 'Engineering Council', shortTitle: 'Engineering Council', description: 'A clearly marked sample record for demonstrating result-publication layouts.', purpose: 'Student representation', constituency: 'Synthetic engineering cohort', status: 'RESULTS_PUBLISHED', startTime: '2026-09-01T08:00:00.000Z', endTime: '2026-09-20T16:00:00.000Z', options: [{ id: 'opt-orbit', name: 'Orbit', description: '' }, { id: 'opt-pixel', name: 'Pixel', description: '' }, { id: 'opt-vector', name: 'Vector', description: '' }], results: [{ optionId: 'opt-orbit', optionName: 'Orbit', votes: 42 }, { optionId: 'opt-pixel', optionName: 'Pixel', votes: 31 }, { optionId: 'opt-vector', optionName: 'Vector', votes: 27 }], fixture: true, createdAt: now
    }
  ];
  return {
    schemaVersion: 1,
    users,
    elections,
    eligibilityApplications: [],
    passwordResets: [],
    ballots: [],
    transactions: [],
    auditEvents: [{ id: 'evt_seed', actor: 'system', action: production ? 'INITIALIZED_WITHOUT_DEMO_FIXTURES' : 'DEVELOPMENT_FIXTURES_INITIALIZED', resource: 'seed-data', timestamp: now, outcome: 'INFO', metadata: { fixtureData: !production } }]
  };
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    const db = defaultDb();
    saveDb(db);
    return db;
  }
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!db || db.schemaVersion !== 1 || !Array.isArray(db.users) || !Array.isArray(db.elections)) throw new Error('Unexpected database schema');
    db.passwordResets ||= [];
    db.eligibilityApplications ||= [];
    db.ballots ||= [];
    db.transactions ||= [];
    db.auditEvents ||= [];
    if (isProductionWithoutDemo()) {
      let disabledDemoAccounts = 0;
      for (const account of db.users) {
        if (account.status === 'ACTIVE' && verifyPassword('CivicChainDemo!26', account.passwordHash)) {
          account.status = 'DISABLED';
          disabledDemoAccounts++;
        }
      }
      if (disabledDemoAccounts) {
        saveDb(db);
        console.error(`Disabled ${disabledDemoAccounts} account(s) using the known demo password in production mode.`);
      }
    }
    return db;
  } catch (error) {
    const backup = `${DB_PATH}.corrupt-${Date.now()}`;
    fs.renameSync(DB_PATH, backup);
    const db = defaultDb();
    saveDb(db);
    console.error(`Database file could not be read; moved to ${backup}: ${error.message}`);
    return db;
  }
}

function saveDb(db) {
  const temp = `${DB_PATH}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DB_PATH);
}

let db = loadDb();

function audit(actor, action, resource, outcome = 'SUCCESS', metadata = {}) {
  const safeMetadata = JSON.parse(JSON.stringify(metadata));
  db.auditEvents.unshift({ id: `evt_${crypto.randomUUID()}`, actor: actor || 'anonymous', action, resource, timestamp: new Date().toISOString(), outcome, metadata: safeMetadata });
  db.auditEvents = db.auditEvents.slice(0, 500);
  saveDb(db);
}

function json(res, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  });
  res.end(payload);
}

function parseCookies(req) {
  const out = {};
  for (const item of String(req.headers.cookie || '').split(';')) {
    const index = item.indexOf('=');
    if (index > 0) out[item.slice(0, index).trim()] = decodeURIComponent(item.slice(index + 1).trim());
  }
  return out;
}

function currentUser(req) {
  const token = parseCookies(req).cc_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = db.users.find(item => item.id === session.userId && item.status === 'ACTIVE');
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return user;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, eligibilityStatus: user.eligibilityStatus, createdAt: user.createdAt };
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
    return null;
  }
  return user;
}

function requireRole(user, res, roles) {
  if (!roles.includes(user.role)) {
    json(res, 403, { error: { code: 'FORBIDDEN', message: 'Your account does not have permission to perform this action.' } });
    return false;
  }
  return true;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        const data = JSON.parse(body);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a JSON object.');
        resolve(data);
      } catch (error) {
        reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function rateLimit(key, max = 12, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  let slot = rateLimits.get(key);
  if (!slot || slot.resetAt < now) slot = { count: 0, resetAt: now + windowMs };
  slot.count += 1;
  rateLimits.set(key, slot);
  return slot.count <= max;
}

function validateText(value, max = 180) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function toPublicElection(election, user) {
  const base = {
    id: election.id,
    chainElectionId: election.chainElectionId,
    title: election.title,
    shortTitle: election.shortTitle,
    description: election.description,
    purpose: election.purpose,
    constituency: election.constituency,
    status: election.status,
    startTime: election.startTime,
    endTime: election.endTime,
    options: election.options.map(option => ({ id: option.id, name: option.name, description: option.description })),
    optionCount: election.options.length,
    eligibilityRoot: election.eligibilityRoot,
    configurationCommitment: election.configurationCommitment,
    fixture: Boolean(election.fixture),
    results: election.status === 'RESULTS_PUBLISHED' ? election.results : null,
    voterCanParticipate: Boolean(user && user.role === 'VOTER' && user.eligibilityStatus === 'APPROVED' && election.status === 'OPEN')
  };
  return base;
}

async function rpcCall(url, method, params = []) {
  if (!url) throw new Error('RPC URL not configured');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(2500)
  });
  if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'RPC error');
  return data.result;
}

async function networkStatus() {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || '';
  if (!rpcUrl) return { configured: false, reachable: false, status: 'NOT_CONFIGURED', chainId: null, blockNumber: null, contractAddress: process.env.VOTING_CONTRACT_ADDRESS || null, validators: [] };
  try {
    const [chainId, blockNumber] = await Promise.all([rpcCall(rpcUrl, 'eth_chainId'), rpcCall(rpcUrl, 'eth_blockNumber')]);
    const actualChainId = Number(BigInt(chainId));
    const expectedChainId = process.env.BLOCKCHAIN_CHAIN_ID ? Number(process.env.BLOCKCHAIN_CHAIN_ID) : null;
    const chainMatches = expectedChainId === null || expectedChainId === actualChainId;
    const validatorUrls = String(process.env.VALIDATOR_RPC_URLS || '').split(',').map(v => v.trim()).filter(Boolean);
    const validators = await Promise.all(validatorUrls.map(async (url, index) => {
      try { const height = await rpcCall(url, 'eth_blockNumber'); return { id: `validator-${index + 1}`, reachable: true, blockNumber: Number(BigInt(height)), urlLabel: `Validator ${index + 1}` }; }
      catch { return { id: `validator-${index + 1}`, reachable: false, blockNumber: null, urlLabel: `Validator ${index + 1}` }; }
    }));
    return { configured: true, rpcReachable: true, reachable: chainMatches, chainMatches, expectedChainId, status: chainMatches ? 'RPC_REACHABLE' : 'CHAIN_ID_MISMATCH', chainId: actualChainId, blockNumber: Number(BigInt(blockNumber)), contractAddress: process.env.VOTING_CONTRACT_ADDRESS || null, validators };
  } catch (error) {
    return { configured: true, reachable: false, status: 'UNAVAILABLE', chainId: null, blockNumber: null, contractAddress: process.env.VOTING_CONTRACT_ADDRESS || null, validators: [], error: error.message };
  }
}

function zkStatus() {
  const keyPath = path.resolve(ROOT, process.env.ZK_VERIFICATION_KEY_PATH || 'circuits/build/verification_key.json');
  const wasmPath = path.resolve(ROOT, process.env.ZK_WASM_PATH || 'circuits/build/eligibility_js/eligibility.wasm');
  const zkeyPath = path.resolve(ROOT, process.env.ZK_ZKEY_PATH || 'circuits/build/eligibility_final.zkey');
  let dependency = false;
  try { require.resolve('snarkjs'); dependency = true; } catch {}
  const artifactsPresent = fs.existsSync(keyPath) && fs.existsSync(wasmPath) && fs.existsSync(zkeyPath);
  return { configured: Boolean(dependency && artifactsPresent), dependencyInstalled: dependency, artifactsPresent, verifier: artifactsPresent ? 'Groth16 / Circom' : 'NOT_CONFIGURED', verificationKeyPath: artifactsPresent ? path.relative(ROOT, keyPath) : null };
}

async function verifyProof(publicSignals, proof) {
  const status = zkStatus();
  if (!status.configured) return { available: false, valid: false, reason: 'A real Groth16 verifier and matching circuit artifacts are not configured.' };
  try {
    const snarkjs = require('snarkjs');
    const keyPath = path.resolve(ROOT, process.env.ZK_VERIFICATION_KEY_PATH || 'circuits/build/verification_key.json');
    const verificationKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const valid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
    return { available: true, valid: Boolean(valid), reason: valid ? null : 'The supplied proof did not verify.' };
  } catch (error) {
    return { available: true, valid: false, reason: `Proof verification failed: ${error.message}` };
  }
}

async function submitToChain(election, encryptedBallot, proof, publicSignals) {
  const network = await networkStatus();
  if (!network.reachable) return { available: false, reason: network.status === 'CHAIN_ID_MISMATCH' ? `The RPC is reachable on chain ${network.chainId}, but the configured chain ID is ${network.expectedChainId}.` : 'The configured consortium RPC endpoint is unavailable.' };
  if (!process.env.VOTING_CONTRACT_ADDRESS || !process.env.BLOCKCHAIN_SUBMITTER_PRIVATE_KEY) return { available: false, reason: 'The voting contract address or transaction submitter key is not configured.' };
  let ethers;
  try { ethers = require('ethers'); } catch { return { available: false, reason: 'Install project dependencies to enable the EVM transaction adapter.' }; }
  try {
    const artifactPath = path.join(ROOT, 'artifacts/contracts/VotingContract.sol/VotingContract.json');
    if (!fs.existsSync(artifactPath)) return { available: false, reason: 'Compile and deploy the VotingContract before submitting ballots.' };
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
    const wallet = new ethers.Wallet(process.env.BLOCKCHAIN_SUBMITTER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(process.env.VOTING_CONTRACT_ADDRESS, artifact.abi, wallet);
    const a = [proof.pi_a[0], proof.pi_a[1]];
    const b = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]];
    const c = [proof.pi_c[0], proof.pi_c[1]];
    const tx = await contract.submitBallot(election.chainElectionId, `0x${encryptedBallot}`, a, b, c, publicSignals);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) return { available: true, accepted: false, reason: 'The blockchain transaction did not succeed.', transactionHash: tx.hash };
    return { available: true, accepted: true, transactionHash: tx.hash, blockNumber: Number(receipt.blockNumber), status: 'CONFIRMED' };
  } catch (error) {
    return { available: true, accepted: false, reason: `Blockchain submission failed: ${error.shortMessage || error.message}` };
  }
}

function errorJson(res, status, code, message) {
  json(res, status, { error: { code, message } });
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;
  const user = currentUser(req);

  if (method === 'GET' && pathname === '/api/v1/health') {
    return json(res, 200, { status: 'ok', app: 'CivicChain', mode: process.env.NODE_ENV === 'production' ? 'production-config-required' : 'local-academic-prototype', timestamp: new Date().toISOString() });
  }

  if (method === 'GET' && pathname === '/api/v1/session') {
    return json(res, 200, { authenticated: Boolean(user), user: publicUser(user) });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/register') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    if (!validateText(name, 90) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 200) {
      return errorJson(res, 400, 'VALIDATION_ERROR', 'Enter a name, valid email address, and password of at least 12 characters.');
    }
    if (db.users.some(item => item.email === email)) return errorJson(res, 409, 'ACCOUNT_EXISTS', 'An account with that email already exists.');
    const created = { id: `usr_${crypto.randomUUID()}`, email, name, passwordHash: hashPassword(password), role: 'VOTER', status: 'ACTIVE', eligibilityStatus: 'NOT_APPLIED', createdAt: new Date().toISOString() };
    db.users.push(created);
    saveDb(db);
    audit(created.id, 'ACCOUNT_REGISTERED', created.id, 'SUCCESS', { role: 'VOTER' });
    return json(res, 201, { user: publicUser(created), message: 'Account created. Apply for eligibility before voting.' });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/login') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const ip = req.socket.remoteAddress || 'unknown';
    if (!rateLimit(`login:${ip}`, 10)) return errorJson(res, 429, 'RATE_LIMITED', 'Too many sign-in attempts. Please try again later.');
    const found = db.users.find(item => item.email === email);
    const valid = found && found.status === 'ACTIVE' && verifyPassword(String(body.password || ''), found.passwordHash);
    if (!valid) {
      audit('anonymous', 'LOGIN_FAILED', 'authentication', 'REJECTED', { accountPresent: Boolean(found) });
      return errorJson(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { userId: found.id, expiresAt: Date.now() + SESSION_MS });
    audit(found.id, 'LOGIN_SUCCEEDED', found.id, 'SUCCESS');
    const secure = process.env.NODE_ENV === 'production' || req.socket.encrypted ? '; Secure' : '';
    return json(res, 200, { user: publicUser(found) }, { 'Set-Cookie': `cc_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}` });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/logout') {
    const token = parseCookies(req).cc_session;
    if (token) sessions.delete(token);
    const secure = process.env.NODE_ENV === 'production' || req.socket.encrypted ? '; Secure' : '';
    return json(res, 200, { message: 'Signed out.' }, { 'Set-Cookie': `cc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}` });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/forgot-password') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const genericMessage = 'If the address belongs to a local demo account, a password-reset message has been queued. This prototype does not send real email.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorJson(res, 400, 'VALIDATION_ERROR', 'Enter a valid email address.');
    const found = db.users.find(item => item.email === email && item.status === 'ACTIVE');
    if (!found || isProductionWithoutDemo()) {
      audit('anonymous', 'PASSWORD_RESET_REQUESTED', 'authentication', 'ACCEPTED', { deliveryConfigured: false });
      return json(res, 202, { message: genericMessage });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    db.passwordResets = db.passwordResets.filter(item => !item.usedAt && Date.parse(item.expiresAt) > now).slice(0, 100);
    db.passwordResets.push({ id: `rst_${crypto.randomUUID()}`, userId: found.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 15 * 60 * 1000).toISOString(), usedAt: null });
    saveDb(db);
    const outboxPath = path.join(DATA_DIR, 'mock-mail-outbox.json');
    let outbox = [];
    try { outbox = JSON.parse(fs.readFileSync(outboxPath, 'utf8')); if (!Array.isArray(outbox)) outbox = []; } catch {}
    const baseUrl = String(process.env.APP_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
    outbox.unshift({ to: found.email, subject: 'CivicChain demo password reset', resetUrl: `${baseUrl}/reset-password#token=${token}`, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 15 * 60 * 1000).toISOString(), delivery: 'LOCAL_DEVELOPMENT_MOCK_ONLY' });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tempOutbox = `${outboxPath}.tmp`;
    fs.writeFileSync(tempOutbox, JSON.stringify(outbox.slice(0, 20), null, 2), { mode: 0o600 });
    fs.renameSync(tempOutbox, outboxPath);
    audit('system', 'PASSWORD_RESET_QUEUED', found.id, 'DEVELOPMENT_ONLY', { delivery: 'local-mock-outbox', lifetimeMinutes: 15 });
    return json(res, 202, { message: genericMessage });
  }

  if (method === 'POST' && pathname === '/api/v1/auth/reset-password') {
    const body = await readJson(req);
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (token.length < 40 || token.length > 200 || password.length < 12 || password.length > 200) return errorJson(res, 400, 'VALIDATION_ERROR', 'Provide a valid reset token and a password of at least 12 characters.');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const reset = db.passwordResets.find(item => item.tokenHash === tokenHash && !item.usedAt && Date.parse(item.expiresAt) > Date.now());
    if (!reset) return errorJson(res, 400, 'RESET_TOKEN_INVALID', 'This reset link is invalid, expired or already used. Request a new one.');
    const account = db.users.find(item => item.id === reset.userId && item.status === 'ACTIVE');
    if (!account) return errorJson(res, 400, 'RESET_TOKEN_INVALID', 'This reset link is invalid, expired or already used. Request a new one.');
    account.passwordHash = hashPassword(password);
    reset.usedAt = new Date().toISOString();
    for (const [sessionToken, session] of sessions.entries()) if (session.userId === account.id) sessions.delete(sessionToken);
    saveDb(db);
    audit(account.id, 'PASSWORD_RESET_COMPLETED', account.id, 'SUCCESS');
    return json(res, 200, { message: 'Password updated. Sign in with the new password.' }, { 'Set-Cookie': 'cc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (method === 'GET' && pathname === '/api/v1/overview') {
    const elections = db.elections;
    return json(res, 200, {
      totals: { elections: elections.length, open: elections.filter(e => e.status === 'OPEN').length, scheduled: elections.filter(e => e.status === 'SCHEDULED').length, resultsPublished: elections.filter(e => e.status === 'RESULTS_PUBLISHED').length },
      elections: elections.map(e => toPublicElection(e, user)),
      source: elections.some(e => e.fixture) ? 'LOCAL_DEVELOPMENT_FIXTURES' : 'APPLICATION_DATA',
      network: await networkStatus(),
      cryptography: zkStatus()
    });
  }

  if (method === 'GET' && pathname === '/api/v1/elections') {
    const state = (url.searchParams.get('status') || '').toUpperCase();
    const search = (url.searchParams.get('q') || '').trim().toLowerCase();
    let elections = db.elections;
    if (state && state !== 'ALL') elections = elections.filter(e => e.status === state);
    if (search) elections = elections.filter(e => `${e.title} ${e.description} ${e.purpose} ${e.constituency}`.toLowerCase().includes(search));
    return json(res, 200, { elections: elections.map(e => toPublicElection(e, user)) });
  }

  const electionMatch = pathname.match(/^\/api\/v1\/elections\/([^/]+)$/);
  if (method === 'GET' && electionMatch) {
    const election = db.elections.find(e => e.id === decodeURIComponent(electionMatch[1]));
    if (!election) return errorJson(res, 404, 'NOT_FOUND', 'Election not found.');
    return json(res, 200, { election: toPublicElection(election, user) });
  }

  if (method === 'GET' && pathname === '/api/v1/network') {
    return json(res, 200, { network: await networkStatus(), cryptography: zkStatus(), mode: 'LOCAL_ACADEMIC_PROTOTYPE' });
  }

  if (method === 'GET' && pathname === '/api/v1/crypto/status') {
    return json(res, 200, { cryptography: zkStatus(), network: await networkStatus(), ballotConfidentiality: { mode: 'RSA-OAEP browser encryption utility is available only after key generation', privateKeyExposure: 'No web endpoint exposes the ballot decryption private key.' } });
  }

  const receiptMatch = pathname.match(/^\/api\/v1\/ballots\/([^/]+)\/receipt$/);
  if (method === 'GET' && receiptMatch) {
    const ballot = db.ballots.find(item => item.id === decodeURIComponent(receiptMatch[1]));
    if (!ballot) return errorJson(res, 404, 'RECEIPT_NOT_FOUND', 'No public receipt with that reference is present in this application record.');
    return json(res, 200, { receipt: { reference: ballot.id, electionId: ballot.electionId, transactionHash: ballot.transactionHash, blockNumber: ballot.blockNumber, status: ballot.status, commitment: ballot.commitment, createdAt: ballot.createdAt }, meaning: 'This receipt refers to a contract-confirmed submission in the configured prototype. It does not prove that a voter device displayed or encrypted the intended selection.' });
  }

  if (method === 'GET' && pathname === '/api/v1/crypto/ballot-public-key') {
    const publicKeyPath = path.resolve(ROOT, process.env.BALLOT_ENCRYPTION_PUBLIC_KEY_PATH || 'data/ballot-public.pem');
    if (!fs.existsSync(publicKeyPath)) return errorJson(res, 503, 'BALLOT_KEY_UNAVAILABLE', 'The ballot public key has not been generated. Run npm run keys:generate, then restart the application.');
    return json(res, 200, { publicKeyPem: fs.readFileSync(publicKeyPath, 'utf8'), algorithm: 'RSA-OAEP with SHA-256', mode: 'ACADEMIC_DEMO_ONLY', warning: 'This baseline encryption adapter is not homomorphic and does not provide threshold decryption.' });
  }

  const txVerifyMatch = pathname.match(/^\/api\/v1\/verify\/transaction\/(0x[0-9a-fA-F]{64})$/);
  if (method === 'GET' && txVerifyMatch) {
    const transactionHash = txVerifyMatch[1];
    const network = await networkStatus();
    if (!network.reachable) return json(res, 200, { status: 'UNVERIFIABLE', statusLabel: 'Unable to verify', message: 'No reachable consortium RPC endpoint is configured. The supplied hash has not been treated as a valid ballot.', transactionHash });
    try {
      const receipt = await rpcCall(process.env.BLOCKCHAIN_RPC_URL, 'eth_getTransactionReceipt', [transactionHash]);
      if (!receipt) return json(res, 200, { status: 'PENDING', statusLabel: 'No receipt found yet', message: 'The RPC endpoint did not return a transaction receipt. This may be pending, unknown to this node, or invalid.', transactionHash });
      if (receipt.status !== '0x1') return json(res, 200, { status: 'FAILED', statusLabel: 'Transaction failed', message: 'The chain returned a receipt with a failed execution status.', transactionHash, blockNumber: Number(BigInt(receipt.blockNumber)) });
      const contractConfigured = Boolean(process.env.VOTING_CONTRACT_ADDRESS && String(receipt.to || '').toLowerCase() === process.env.VOTING_CONTRACT_ADDRESS.toLowerCase());
      return json(res, 200, { status: 'UNVERIFIABLE', statusLabel: 'Transaction succeeded; ballot claim not verified', message: contractConfigured ? 'The transaction succeeded at the configured contract address. This baseline does not yet decode and verify the ballot-specific acceptance event, nullifier and proof context, so it does not declare the ballot verified.' : 'The transaction succeeded, but it does not target the configured voting contract. A successful transaction alone is not evidence of an accepted ballot.', transactionHash, blockNumber: Number(BigInt(receipt.blockNumber)), to: receipt.to || null });
    } catch (error) {
      return json(res, 200, { status: 'UNVERIFIABLE', statusLabel: 'Unable to verify', message: `The RPC query failed: ${error.message}`, transactionHash });
    }
  }

  if (method === 'GET' && pathname === '/api/v1/audit') {
    const events = db.auditEvents.slice(0, 100).map(event => ({ ...event, actor: event.actor === 'anonymous' ? 'Public' : event.actor.startsWith('usr_') ? 'Authorized account' : event.actor }));
    return json(res, 200, { events, source: 'LOCAL_APPLICATION_AUDIT_LOG', warning: 'The local file audit log is not an immutable blockchain record.' });
  }

  if (method === 'GET' && pathname === '/api/v1/eligibility/applications') {
    if (!user) return errorJson(res, 401, 'AUTH_REQUIRED', 'Sign in to continue.');
    if (!requireRole(user, res, ['ADMIN', 'ISSUER'])) return;
    return json(res, 200, { applications: db.eligibilityApplications.map(app => ({ id: app.id, userName: app.userName, userEmail: app.userEmail, status: app.status, submittedAt: app.submittedAt, reviewedAt: app.reviewedAt, credentialStatus: app.credentialStatus })) });
  }

  if (method === 'POST' && pathname === '/api/v1/eligibility/apply') {
    const active = requireUser(req, res);
    if (!active) return;
    if (!requireRole(active, res, ['VOTER'])) return;
    if (active.eligibilityStatus === 'APPROVED') return errorJson(res, 409, 'ALREADY_APPROVED', 'Eligibility is already approved for this development account.');
    if (db.eligibilityApplications.some(a => a.userId === active.id && a.status === 'PENDING')) return errorJson(res, 409, 'APPLICATION_PENDING', 'Your eligibility application is already pending review.');
    const body = await readJson(req);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 240) : '';
    const app = { id: `app_${crypto.randomUUID()}`, userId: active.id, userName: active.name, userEmail: active.email, status: 'PENDING', credentialStatus: 'NOT_ISSUED', note, submittedAt: new Date().toISOString(), reviewedAt: null };
    db.eligibilityApplications.push(app);
    active.eligibilityStatus = 'PENDING';
    saveDb(db);
    audit(active.id, 'ELIGIBILITY_APPLICATION_SUBMITTED', app.id, 'SUCCESS');
    return json(res, 201, { application: { id: app.id, status: app.status, submittedAt: app.submittedAt }, user: publicUser(active) });
  }

  const reviewMatch = pathname.match(/^\/api\/v1\/eligibility\/applications\/([^/]+)\/(approve|reject)$/);
  if (method === 'POST' && reviewMatch) {
    const active = requireUser(req, res);
    if (!active) return;
    if (!requireRole(active, res, ['ADMIN', 'ISSUER'])) return;
    const app = db.eligibilityApplications.find(a => a.id === decodeURIComponent(reviewMatch[1]));
    if (!app || app.status !== 'PENDING') return errorJson(res, 404, 'APPLICATION_NOT_PENDING', 'No pending eligibility application matches that reference.');
    const targetUser = db.users.find(u => u.id === app.userId);
    const action = reviewMatch[2];
    app.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    app.credentialStatus = action === 'approve' ? 'ISSUANCE_BLOCKED_NO_CREDENTIAL_ADAPTER' : 'NOT_ISSUED';
    app.reviewedAt = new Date().toISOString();
    if (targetUser) targetUser.eligibilityStatus = app.status;
    saveDb(db);
    audit(active.id, action === 'approve' ? 'ELIGIBILITY_APPLICATION_APPROVED' : 'ELIGIBILITY_APPLICATION_REJECTED', app.id, 'SUCCESS', { credentialIssuance: app.credentialStatus });
    return json(res, 200, { application: { id: app.id, status: app.status, credentialStatus: app.credentialStatus }, warning: action === 'approve' ? 'Eligibility review is recorded, but no privacy-preserving cryptographic credential is issued by this baseline build.' : undefined });
  }

  if (method === 'POST' && pathname === '/api/v1/admin/elections') {
    const active = requireUser(req, res);
    if (!active) return;
    if (!requireRole(active, res, ['ADMIN'])) return;
    const body = await readJson(req);
    if (!validateText(body.title, 150) || !validateText(body.description || 'Election created for research demonstration.', 1200) || !Array.isArray(body.options) || body.options.length < 2 || body.options.length > 20 || !body.options.every(option => validateText(option.name, 120))) {
      return errorJson(res, 400, 'VALIDATION_ERROR', 'Provide a title and between 2 and 20 valid options.');
    }
    const start = new Date(body.startTime);
    const end = new Date(body.endTime);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return errorJson(res, 400, 'INVALID_SCHEDULE', 'Election end time must be after its start time.');
    const id = `election-${crypto.randomBytes(5).toString('hex')}`;
    const election = { id, chainElectionId: String(Date.now()), title: body.title.trim(), shortTitle: body.title.trim().slice(0, 60), description: String(body.description || '').trim(), purpose: String(body.purpose || 'Research demonstration').slice(0, 100), constituency: String(body.constituency || 'Configured eligible group').slice(0, 180), status: 'DRAFT', startTime: start.toISOString(), endTime: end.toISOString(), options: body.options.map((item, index) => ({ id: `opt_${index + 1}_${crypto.randomBytes(3).toString('hex')}`, name: item.name.trim(), description: String(item.description || '').trim().slice(0, 250) })), eligibilityRoot: null, configurationCommitment: null, results: null, fixture: false, createdAt: new Date().toISOString() };
    db.elections.push(election);
    saveDb(db);
    audit(active.id, 'ELECTION_CREATED', id, 'SUCCESS', { optionCount: election.options.length });
    return json(res, 201, { election: toPublicElection(election, active), message: 'Draft created. Publication is blocked until a live cryptographic and governance configuration is available.' });
  }

  const syncChainMatch = pathname.match(/^\/api\/v1\/admin\/elections\/([^/]+)\/sync-chain$/);
  if (method === 'POST' && syncChainMatch) {
    const active = requireUser(req, res);
    if (!active) return;
    if (!requireRole(active, res, ['ADMIN'])) return;
    const election = db.elections.find(e => e.id === decodeURIComponent(syncChainMatch[1]));
    if (!election) return errorJson(res, 404, 'NOT_FOUND', 'Election not found.');
    if (!process.env.ELECTION_REGISTRY_ADDRESS || !process.env.BLOCKCHAIN_RPC_URL) return errorJson(res, 503, 'REGISTRY_UNAVAILABLE', 'Configure a reachable ElectionRegistry address before syncing chain state.');
    let ethers;
    try { ethers = require('ethers'); } catch { return errorJson(res, 503, 'DEPENDENCY_UNAVAILABLE', 'Install project dependencies to enable registry reads.'); }
    const artifactPath = path.join(ROOT, 'artifacts/contracts/ElectionRegistry.sol/ElectionRegistry.json');
    if (!fs.existsSync(artifactPath)) return errorJson(res, 503, 'CONTRACT_ARTIFACT_MISSING', 'Compile ElectionRegistry before syncing state.');
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
      const registry = new ethers.Contract(process.env.ELECTION_REGISTRY_ADDRESS, artifact.abi, provider);
      const chainId = BigInt(election.chainElectionId);
      const [root, schedule, chainStatus, commitment] = await Promise.all([
        registry.eligibilityRoot(chainId), registry.electionSchedule(chainId), registry.electionStatus(chainId), registry.electionConfigurationCommitment(chainId)
      ]);
      const statusMap = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'TALLY_EVIDENCE_RECORDED', 'RESULTS_PUBLISHED', 'ARCHIVED', 'CANCELLED'];
      const mappedStatus = statusMap[Number(chainStatus)];
      if (!mappedStatus) return errorJson(res, 502, 'UNKNOWN_CHAIN_STATE', 'The registry returned an unrecognized election state.');
      election.eligibilityRoot = root.toString();
      election.startTime = new Date(Number(schedule[0]) * 1000).toISOString();
      election.endTime = new Date(Number(schedule[1]) * 1000).toISOString();
      election.status = mappedStatus;
      election.configurationCommitment = commitment;
      saveDb(db);
      audit(active.id, 'ELECTION_CHAIN_STATE_SYNCED', election.id, 'SUCCESS', { status: mappedStatus, rootPresent: root !== 0n });
      return json(res, 200, { election: toPublicElection(election, active), chain: { electionId: chainId.toString(), root: root.toString(), status: mappedStatus, configurationCommitment: commitment }, warning: 'This operation mirrors contract state. Review the contract configuration commitment against the intended election settings independently.' });
    } catch (error) {
      return errorJson(res, 502, 'REGISTRY_QUERY_FAILED', `Could not read election state from the registry: ${error.shortMessage || error.message}`);
    }
  }

  const transitionMatch = pathname.match(/^\/api\/v1\/admin\/elections\/([^/]+)\/(validate|publish|close|archive)$/);
  if (method === 'POST' && transitionMatch) {
    const active = requireUser(req, res);
    if (!active) return;
    if (!requireRole(active, res, ['ADMIN'])) return;
    const election = db.elections.find(e => e.id === decodeURIComponent(transitionMatch[1]));
    if (!election) return errorJson(res, 404, 'NOT_FOUND', 'Election not found.');
    const action = transitionMatch[2];
    const transitions = {
      validate: { from: ['DRAFT'], to: 'DRAFT' },
      publish: { from: ['DRAFT'], to: 'SCHEDULED' },
      close: { from: ['OPEN'], to: 'CLOSED' },
      archive: { from: ['RESULTS_PUBLISHED', 'CANCELLED'], to: 'ARCHIVED' }
    };
    if (!transitions[action].from.includes(election.status)) return errorJson(res, 409, 'INVALID_TRANSITION', `Cannot ${action} an election in ${election.status} state.`);
    if (action === 'validate') {
      const crypto = zkStatus();
      const network = await networkStatus();
      return json(res, 200, { valid: false, checks: [{ name: 'Election configuration', status: election.options.length >= 2 ? 'PASS' : 'FAIL' }, { name: 'ZK verifier artifacts', status: crypto.configured ? 'PASS' : 'BLOCKED' }, { name: 'Consortium network', status: network.reachable ? 'PASS' : 'BLOCKED' }], message: 'Validation is descriptive; publication remains blocked until all cryptographic and chain requirements are configured.' });
    }
    return errorJson(res, 501, 'CHAIN_LIFECYCLE_ADAPTER_REQUIRED', 'This lifecycle transition is not performed by a database-only update. Use the documented registry transaction script, then sync the state from the contract.');
  }

  const ballotMatch = pathname.match(/^\/api\/v1\/elections\/([^/]+)\/ballots$/);
  if (method === 'POST' && ballotMatch) {
    const active = requireUser(req, res);
    if (!active) return;
    if (!requireRole(active, res, ['VOTER'])) return;
    const election = db.elections.find(e => e.id === decodeURIComponent(ballotMatch[1]));
    if (!election) return errorJson(res, 404, 'NOT_FOUND', 'Election not found.');
    if (election.status !== 'OPEN') return errorJson(res, 409, 'ELECTION_NOT_OPEN', 'This election is not open for submissions.');
    if (active.eligibilityStatus !== 'APPROVED') return errorJson(res, 403, 'NOT_ELIGIBLE', 'Your eligibility is not approved.');
    const body = await readJson(req);
    if (typeof body.encryptedBallot !== 'string' || !/^(?:[0-9a-fA-F]{2})+$/.test(body.encryptedBallot) || body.encryptedBallot.length < 8 || !body.proof || !Array.isArray(body.publicSignals)) return errorJson(res, 400, 'INVALID_BALLOT_ENVELOPE', 'An encrypted ballot, real proof, and public signals are required.');
    const proofCheck = await verifyProof(body.publicSignals, body.proof);
    if (!proofCheck.available) return errorJson(res, 503, 'ZK_VERIFIER_UNAVAILABLE', proofCheck.reason);
    if (!proofCheck.valid) {
      audit(active.id, 'BALLOT_PROOF_REJECTED', election.id, 'REJECTED');
      return errorJson(res, 400, 'INVALID_PROOF', proofCheck.reason);
    }
    if (String(body.publicSignals[0]) !== String(election.eligibilityRoot) || String(body.publicSignals[1]) !== String(election.chainElectionId)) return errorJson(res, 400, 'PUBLIC_INPUT_MISMATCH', 'The proof does not match the approved election root and election identifier.');
    const chainResult = await submitToChain(election, body.encryptedBallot, body.proof, body.publicSignals);
    if (!chainResult.available) return errorJson(res, 503, 'BLOCKCHAIN_UNAVAILABLE', chainResult.reason);
    if (!chainResult.accepted) return errorJson(res, 502, 'BLOCKCHAIN_REJECTED', chainResult.reason);
    const ballot = { id: `ballot_${crypto.randomUUID()}`, electionId: election.id, encryptedBallot: body.encryptedBallot, commitment: crypto.createHash('sha256').update(Buffer.from(body.encryptedBallot, 'hex')).digest('hex'), transactionHash: chainResult.transactionHash, blockNumber: chainResult.blockNumber, status: chainResult.status, createdAt: new Date().toISOString() };
    db.ballots.push(ballot);
    db.transactions.push({ id: crypto.randomUUID(), electionId: election.id, transactionHash: chainResult.transactionHash, blockNumber: chainResult.blockNumber, status: chainResult.status, createdAt: ballot.createdAt });
    saveDb(db);
    audit('blockchain', 'BALLOT_CONFIRMED', election.id, 'SUCCESS', { transactionHash: chainResult.transactionHash, blockNumber: chainResult.blockNumber });
    return json(res, 201, { receipt: { reference: ballot.id, electionId: election.id, transactionHash: ballot.transactionHash, blockNumber: ballot.blockNumber, status: ballot.status, commitment: ballot.commitment, meaning: 'The encrypted ballot submission was confirmed by the configured contract. The receipt does not prove that a device displayed or encrypted the intended selection.' } });
  }

  if (method === 'GET' && pathname === '/api/v1/admin/dashboard') {
    const active = requireUser(req, res);
    if (!active) return;
    if (!requireRole(active, res, ['ADMIN'])) return;
    const network = await networkStatus();
    return json(res, 200, { users: db.users.length, pendingEligibility: db.eligibilityApplications.filter(a => a.status === 'PENDING').length, elections: db.elections.length, ballotsConfirmed: db.ballots.filter(b => b.status === 'CONFIRMED').length, network, cryptography: zkStatus(), auditEvents: db.auditEvents.slice(0, 10) });
  }

  if (method === 'GET' && pathname === '/api/v1/voter/dashboard') {
    const active = requireUser(req, res);
    if (!active) return;
    if (!requireRole(active, res, ['VOTER'])) return;
    const applications = db.eligibilityApplications.filter(a => a.userId === active.id).map(a => ({ id: a.id, status: a.status, submittedAt: a.submittedAt, credentialStatus: a.credentialStatus }));
    return json(res, 200, { user: publicUser(active), applications, elections: db.elections.map(e => toPublicElection(e, active)), ballots: [], limitations: ['Receipt lookup by account is intentionally not linked to ballot records in this baseline.', 'No credential or real proof is issued by the baseline build.'] });
  }

  if (method === 'GET' && pathname === '/api/v1/results') {
    const elections = db.elections.filter(e => e.status === 'RESULTS_PUBLISHED').map(e => ({ ...toPublicElection(e, user), resultsSource: e.fixture ? 'DEVELOPMENT_FIXTURE' : 'APPLICATION_RECORD' }));
    return json(res, 200, { elections, warning: 'Fixture results are illustrative and are not cryptographically verified tally results.' });
  }

  return errorJson(res, 404, 'NOT_FOUND', 'API route not found.');
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const resolved = path.resolve(PUBLIC_DIR, `.${cleanPath}`);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(resolved, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
      res.writeHead(500); return res.end('Internal server error');
    }
    const ext = path.extname(resolved).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Content-Length': content.length,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (['GET', 'HEAD'].includes(req.method)) {
      if (req.method === 'HEAD') return res.writeHead(200).end();
      const staticPath = path.extname(url.pathname) ? url.pathname : '/';
      serveStatic(req, res, staticPath);
    } else {
      errorJson(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${url.pathname}: ${error.stack || error.message}`);
    if (!res.headersSent) errorJson(res, error.statusCode || 500, error.statusCode === 413 ? 'REQUEST_TOO_LARGE' : 'INTERNAL_ERROR', error.statusCode ? error.message : 'The request could not be completed.');
    else res.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CivicChain local academic prototype listening on http://localhost:${PORT}`);
  console.log(`Data store: ${DB_PATH}`);
  console.log(`ZK verifier: ${zkStatus().configured ? 'configured' : 'not configured — vote submission will not be accepted'}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = { server, hashPassword, verifyPassword };
