'use strict';

const appRoot = document.getElementById('app');
const headerActions = document.getElementById('header-actions');
const mainNav = document.querySelector('.main-nav');
const state = { user: null, overview: null, elections: [], network: null, crypto: null, loading: false, lastPath: location.pathname };
const STATUS_LABELS = { DRAFT: 'Draft', SCHEDULED: 'Scheduled', OPEN: 'Open', CLOSED: 'Closed', TALLY_PENDING: 'Tally pending', TALLY_EVIDENCE_RECORDED: 'Tally evidence recorded', RESULTS_PUBLISHED: 'Results published', ARCHIVED: 'Archived', CANCELLED: 'Cancelled', PENDING: 'Pending review', APPROVED: 'Approved', REJECTED: 'Rejected' };

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method: options.method || 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: 'same-origin', cache: 'no-store' });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = data?.error?.code || 'REQUEST_FAILED';
    throw error;
  }
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function fmtDate(value, compact = false) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', compact ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(date);
}

function statusClass(status) {
  if (status === 'OPEN' || status === 'APPROVED' || status === 'CONFIRMED' || status === 'SUCCESS') return 'pill-open';
  if (status === 'SCHEDULED' || status === 'PENDING' || status === 'PROCESSING') return 'pill-upcoming';
  if (status === 'RESULTS_PUBLISHED') return 'pill-published';
  if (status === 'TALLY_EVIDENCE_RECORDED') return 'pill-upcoming';
  if (status === 'FAILED' || status === 'REJECTED' || status === 'UNAVAILABLE' || status === 'NOT_CONFIGURED' || status === 'CHAIN_ID_MISMATCH') return 'pill-blocked';
  return 'pill-closed';
}

function pill(status, label) {
  return `<span class="pill ${statusClass(status)}">${esc(label || STATUS_LABELS[status] || String(status || 'Unknown').replaceAll('_', ' '))}</span>`;
}

function initials(user) {
  return String(user?.name || user?.email || 'U').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

function renderHeader() {
  const activeRoute = location.pathname;
  document.querySelectorAll('[data-route-link]').forEach(link => {
    const path = new URL(link.href).pathname;
    link.classList.toggle('active', path !== '/' && (activeRoute === path || activeRoute.startsWith(path + '/')));
  });
  if (state.user) {
    headerActions.innerHTML = `<a class="header-user" href="${state.user.role === 'ADMIN' ? '/admin' : state.user.role === 'AUDITOR' ? '/auditor' : '/voter'}"><span class="avatar">${esc(initials(state.user))}</span><span class="user-name">${esc(state.user.name.split(' ')[0])}</span></a><button class="header-cta" data-action="logout" type="button">SIGN OUT</button>`;
  } else {
    headerActions.innerHTML = `<a class="header-login" href="/login">SIGN IN</a><a class="header-cta" href="/register">CREATE ACCOUNT&nbsp; ↗</a>`;
  }
  document.getElementById('current-year').textContent = new Date().getFullYear();
}

function navigate(path, options = {}) {
  if (!options.replace && location.pathname + location.search !== path) history.pushState({}, '', path);
  else if (options.replace) history.replaceState({}, '', path);
  mainNav.classList.remove('open');
  document.querySelector('.mobile-menu-button')?.setAttribute('aria-expanded', 'false');
  renderHeader();
  renderRoute();
  if (!options.keepScroll) window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function toast(title, message, type = '') {
  const region = document.getElementById('toast-region');
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.innerHTML = `<strong>${esc(title)}</strong>${esc(message)}`;
  region.appendChild(item);
  setTimeout(() => item.remove(), 5200);
}

function electionCard(election) {
  const fixture = election.fixture ? '<span class="micro">DEVELOPMENT FIXTURE</span>' : '';
  const action = election.status === 'OPEN' ? 'VIEW ELECTION' : election.status === 'RESULTS_PUBLISHED' ? 'VIEW RESULTS' : 'VIEW DETAILS';
  return `<article class="election-card"><div class="election-card-top">${pill(election.status)}${fixture}</div><h3>${esc(election.title)}</h3><p>${esc(election.description)}</p><div class="election-card-meta"><span>${esc(election.options?.length || election.optionCount || 0)} options · closes ${esc(fmtDate(election.endTime, true))}</span><a href="/elections/${encodeURIComponent(election.id)}">${action} ↗</a></div></article>`;
}

function pageIntro(eyebrow, title, description, action = '') {
  return `<section class="page-intro"><div class="container page-intro-row"><div><div class="eyebrow">${esc(eyebrow)}</div><h1 class="page-title">${title}</h1><p class="lead">${description}</p></div>${action ? `<div class="page-intro-action">${action}</div>` : ''}</div></section>`;
}

function emptyState(title, description, action = '') {
  return `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
}

function renderHome() {
  const elections = state.overview?.elections || [];
  const top = elections.filter(e => ['OPEN', 'SCHEDULED'].includes(e.status)).slice(0, 2);
  const networkStatus = state.overview?.network?.status || 'NOT_CONFIGURED';
  const zk = state.overview?.cryptography?.configured;
  appRoot.innerHTML = `<div class="page home-page">
    <section class="home-hero"><div class="hero-content"><div class="hero-kicker"><span class="line"></span> A NEW STANDARD FOR DIGITAL TRUST</div><h1>Democracy deserves<br><span>verifiable trust.</span></h1><p class="hero-description">A research prototype exploring how privacy-preserving credentials, zero-knowledge proofs and a permissioned consortium ledger can make digital voting more transparent.</p><div class="button-row"><a class="button button-light" href="/elections">EXPLORE ELECTIONS <span class="arrow">↗</span></a><a class="button" style="border-color:rgba(232,239,249,.35);color:#e8eef7" href="/docs">OUR APPROACH</a></div><div class="hero-brandline"><img src="/assets/civicchain-mark.svg" alt="" width="35" height="35"><span class="separator"></span><strong>C I V I C C H A I N</strong></div></div><div class="hero-bottom"><span class="scroll-discover">SCROLL DOWN TO DISCOVER</span><a href="#principles" class="hero-orbit" aria-label="Scroll to principles">⌄</a></div></section>
    <div class="notice-bar"><strong>ACADEMIC RESEARCH PROTOTYPE</strong><span>·</span><span>Live proof verification and blockchain acceptance remain unavailable until configured.</span></div>
    <section class="intro-section" id="principles"><div class="container intro-layout"><div><div class="eyebrow">THE CIVICCHAIN IDEA</div><h2 class="intro-title">Privacy for the voter.<br><em>Proof for the public.</em></h2></div><div class="intro-right"><p>Digital voting should not ask people to choose between keeping their ballot private and being able to verify that an election was handled correctly.</p><p>CivicChain explores a layered approach: separate identity from ballot records, use cryptographic proofs to establish eligibility, and record governed election evidence on a permissioned consortium ledger.</p><a class="text-link" href="/docs">EXPLORE THE METHODOLOGY <span>→</span></a></div></div></section>
    <section class="principles"><div class="container"><div class="grid-3"><article class="principle"><span class="principle-number">01 / PRIVACY</span><h3>Your identity stays off-chain</h3><p>The design separates protected registration data from public election evidence and uses encrypted ballots.</p></article><article class="principle"><span class="principle-number">02 / INTEGRITY</span><h3>Changes should leave evidence</h3><p>Governed lifecycle actions and accepted ledger transactions are intended to be independently inspectable.</p></article><article class="principle"><span class="principle-number">03 / VERIFIABILITY</span><h3>Verify the claim, not the badge</h3><p>Proofs and transaction records must be checked by real verification logic, not a decorative success state.</p></article></div></div></section>
    <section class="steps-section"><div class="container"><div class="steps-heading-row"><div><div class="eyebrow">THE VOTING JOURNEY</div><h2 class="section-heading">A careful process.<br>Evidence at every step.</h2></div><p class="section-copy">Each step has its own responsibility. Authentication alone does not make a person eligible, and a valid eligibility proof does not by itself prove a ballot is well-formed.</p></div><div class="grid-3"><article class="step-card"><span class="step-no">STEP 01 — ENROL</span><h3>Establish eligibility</h3><p>An authorized issuer reviews a synthetic voter record and associates the approved credential with the correct election eligibility set.</p></article><article class="step-card"><span class="step-no">STEP 02 — PROVE & SUBMIT</span><h3>Keep the choice confidential</h3><p>The intended protocol generates a zero-knowledge eligibility proof, an election-scoped nullifier and an encrypted ballot.</p></article><article class="step-card"><span class="step-no">STEP 03 — VERIFY</span><h3>Inspect the record</h3><p>After a real transaction is confirmed, voters and auditors can inspect the relevant record and published tally evidence.</p></article></div></div></section>
    <section class="architecture-section"><div class="container"><div class="architecture-panel"><div><div class="eyebrow" style="color:#9baec7">A LAYERED SECURITY MODEL</div><h3>Not one technology.<br>A set of checks.</h3><p>Blockchain consensus does not establish voter eligibility, and zero-knowledge proofs do not encrypt a ballot. CivicChain keeps these responsibilities distinct.</p><a class="text-link" style="color:#b9d0ef" href="/docs#architecture">READ THE ARCHITECTURE <span>→</span></a></div><div class="architecture-list"><div class="architecture-row"><span>Identity & eligibility</span><span>OFF-CHAIN</span></div><div class="architecture-row"><span>Eligibility statement</span><span>ZK PROOF</span></div><div class="architecture-row"><span>Ballot confidentiality</span><span>ENCRYPTION</span></div><div class="architecture-row"><span>Election state</span><span>SMART CONTRACT</span></div><div class="architecture-row"><span>Shared transaction order</span><span>CONSORTIUM</span></div><div class="architecture-row"><span>Independent inspection</span><span>PUBLIC EVIDENCE</span></div></div></div></div></section>
    <section class="featured-elections"><div class="container"><div class="split-heading"><div><div class="eyebrow">PARTICIPATION</div><h2 class="section-heading">Explore the elections.</h2></div><a class="text-link" href="/elections">ALL ELECTIONS <span>→</span></a></div>${top.length ? `<div class="grid-2">${top.map(electionCard).join('')}</div>` : emptyState('No current elections','When elections are configured, their published state will appear here.')}<p class="micro" style="margin-top:18px">${elections.some(e => e.fixture) ? 'Some listings are seeded development fixtures. They are not live election activity.' : 'Listings are loaded from the application data source.'}</p></div></section>
    <section class="cta-section"><div class="container cta-inner"><div><div class="eyebrow" style="color:#9eb0c7">TRANSPARENCY BY DESIGN</div><h2>Understand what is verified.</h2><p>Review the protocol, its limits, and the evidence available in this build.</p></div><a class="button button-light" href="/verify-ballot">OPEN VERIFICATION <span class="arrow">↗</span></a></div></section>
  </div>`;
}

function renderElections() {
  const elections = state.elections;
  appRoot.innerHTML = `<div class="page">${pageIntro('ELECTION DIRECTORY','A clear view of participation.','Review election rules, participation windows and published results. Every state shown here comes from the application record.')}
    <section class="page-content"><div class="container"><div class="toolbar"><div class="filter-row" id="election-filters"><button class="filter-button active" data-status="ALL">ALL ELECTIONS</button><button class="filter-button" data-status="OPEN">OPEN</button><button class="filter-button" data-status="SCHEDULED">UPCOMING</button><button class="filter-button" data-status="CLOSED">CLOSED</button><button class="filter-button" data-status="RESULTS_PUBLISHED">RESULTS PUBLISHED</button></div><label class="search-field"><span>⌕</span><input id="election-search" type="search" placeholder="Search elections" aria-label="Search elections"></label></div><div id="election-list" class="grid-3">${elections.length ? elections.map(electionCard).join('') : emptyState('No elections available','Create or publish an election through the authorized workflow once the environment is configured.')}</div><p class="micro" style="margin-top:18px">Development fixture data is marked explicitly. Election cards do not imply that blockchain voting is currently enabled.</p></div></section></div>`;
}

function renderElectionDetail(election) {
  if (!election) return renderNotFound('Election not found','This election could not be retrieved from the application data source.');
  const candidateRows = election.options.map((option, i) => `<div class="candidate-row"><span class="candidate-symbol">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(option.name)}</h3><p>${esc(option.description || 'No further option description was supplied.')}</p></div><span class="right-meta">OPTION ${String(i + 1).padStart(2, '0')}</span></div>`).join('');
  let action = '';
  if (election.status === 'OPEN') action = `<a class="button button-dark" href="/elections/${encodeURIComponent(election.id)}/vote">CONTINUE TO BALLOT <span class="arrow">↗</span></a>`;
  else if (election.status === 'RESULTS_PUBLISHED') action = `<a class="button button-dark" href="/results#${encodeURIComponent(election.id)}">VIEW PUBLISHED RESULTS <span class="arrow">↗</span></a>`;
  else action = '<button class="button button-outline" disabled>VOTING NOT OPEN</button>';
  appRoot.innerHTML = `<div class="page"><section class="detail-hero"><div class="container"><a class="text-link" href="/elections" style="margin-bottom:18px">← ALL ELECTIONS</a><div class="detail-layout"><div><div class="eyebrow">ELECTION OVERVIEW ${election.fixture ? '· DEVELOPMENT FIXTURE' : ''}</div><h1 class="page-title">${esc(election.title)}</h1><p class="lead">${esc(election.description)}</p><div class="detail-facts"><div class="detail-fact"><span>Status</span><strong>${esc(STATUS_LABELS[election.status] || election.status)}</strong></div><div class="detail-fact"><span>Opens</span><strong>${esc(fmtDate(election.startTime, true))}</strong></div><div class="detail-fact"><span>Closes</span><strong>${esc(fmtDate(election.endTime, true))}</strong></div></div></div><aside class="detail-aside"><h3>Participation details</h3><p>This election is configured for <strong>${esc(election.constituency)}</strong>. Eligibility must be established separately from account login.</p><p><strong>Purpose</strong><br>${esc(election.purpose)}</p><p><strong>Options</strong><br>${election.options.length} configured choices</p>${action}<p class="micro" style="margin-top:12px">The current baseline has no configured real ZK verifier or consortium contract, so it will not accept a ballot as confirmed.</p></aside></div></div></section><section class="page-content"><div class="container"><div class="grid-2"><div><div class="eyebrow">BALLOT OPTIONS</div><h2 class="section-heading" style="font-size:28px">The choices.</h2><div class="candidate-list">${candidateRows}</div></div><div><div class="eyebrow">VERIFICATION CONTEXT</div><h2 class="section-heading" style="font-size:28px">What can be checked?</h2><div class="section-card"><h3>Election configuration</h3><p class="micro">A published configuration commitment will be available once it is generated and recorded through the governed contract workflow.</p><div class="receipt-row"><span>Configuration commitment</span><span class="mono">${election.configurationCommitment ? esc(election.configurationCommitment) : 'Not published'}</span></div><div class="receipt-row"><span>Eligibility root</span><span class="mono">${election.eligibilityRoot ? esc(election.eligibilityRoot) : 'Not configured'}</span></div><div class="receipt-row"><span>Network transaction</span><span class="mono">Unavailable until a contract is deployed</span></div><a href="/verify-ballot" class="text-link" style="margin-top:18px">OPEN PUBLIC VERIFICATION <span>→</span></a></div></div></div></div></section></div>`;
}

async function renderVoting(electionId) {
  let election;
  try { election = (await api(`/api/v1/elections/${encodeURIComponent(electionId)}`)).election; } catch (error) { return renderNotFound('Election unavailable', error.message); }
  const readiness = await api('/api/v1/crypto/status').catch(() => ({ cryptography: { configured: false }, network: { reachable: false, status: 'UNAVAILABLE' } }));
  const keyReady = await api('/api/v1/crypto/ballot-public-key').then(() => true).catch(() => false);
  const authenticated = Boolean(state.user);
  const eligible = authenticated && state.user.role === 'VOTER' && state.user.eligibilityStatus === 'APPROVED';
  const canSubmit = Boolean(readiness.cryptography?.configured && readiness.network?.reachable && keyReady && election.eligibilityRoot && election.status === 'OPEN' && eligible);
  appRoot.innerHTML = `<div class="page">${pageIntro('PRIVATE BALLOT',esc(election.title),'Review the election, select one option, and check system readiness. A ballot must not be reported as accepted until a real proof verifier and consortium contract confirm it.')}
    <section class="page-content"><div class="container"><div class="vote-stepper"><div class="vote-step active"><span class="step-circle">1</span><b>REVIEW CHOICE</b></div><div class="vote-step"><span class="step-circle">2</span><b>PROVE & ENCRYPT</b></div><div class="vote-step"><span class="step-circle">3</span><b>RECORD & VERIFY</b></div></div><div class="form-layout"><section class="form-panel"><h2>Your ballot</h2><p>Your selection is encrypted in the browser before submission. Supply a proof package generated from your private witness; never upload the witness itself. Submission remains blocked unless the proof artifacts, approved root, ballot public key and consortium contract are configured.</p><form id="ballot-form" data-election-id="${esc(election.id)}"><div class="form-field"><label>Choose one option</label><div class="candidate-list">${election.options.map((option,i)=>`<label class="vote-option"><input type="radio" name="optionId" value="${esc(option.id)}" required><span><strong>${esc(option.name)}</strong><p>${esc(option.description || 'No further option description was supplied.')}</p></span></label>`).join('')}</div></div><div class="form-field"><label for="proof-package">Eligibility proof package (JSON)</label><input id="proof-package" name="proofPackage" type="file" accept=".json,application/json" required><span class="form-help">Upload proof-package.json containing a real Groth16 proof and public signals. Never upload witness.json or credential-private.json.</span></div><label class="inline-check"><input type="checkbox" name="acknowledge" required><span>I have reviewed the election instructions and understand that this is an academic research prototype, not a binding election system.</span></label><div class="button-row"><button type="button" class="button button-outline" data-action="review-ballot">REVIEW SELECTION <span class="arrow">→</span></button><button type="submit" class="button button-dark" ${canSubmit ? '' : 'disabled'}>SUBMIT ENCRYPTED BALLOT <span class="arrow">↗</span></button></div><div id="ballot-feedback" aria-live="polite"></div></form></section><aside><div class="section-card"><div class="eyebrow">READINESS CHECK</div><h3 style="margin-top:14px">Security dependencies</h3><div class="receipt-row"><span>Account</span><span>${authenticated ? esc(state.user.role) : 'Not signed in'}</span></div><div class="receipt-row"><span>Eligibility</span><span>${authenticated ? esc(state.user.eligibilityStatus) : 'Sign-in required'}</span></div><div class="receipt-row"><span>Groth16 verifier</span><span>${readiness.cryptography?.configured ? 'Configured' : 'Not configured'}</span></div><div class="receipt-row"><span>Consortium RPC</span><span>${readiness.network?.reachable ? 'Reachable' : 'Not reachable'}</span></div><div class="receipt-row"><span>Election state</span><span>${esc(election.status)}</span></div><div class="vote-blocked"><strong>${canSubmit ? 'Ready for protocol checks' : 'Submission currently blocked'}</strong><p>${!authenticated ? 'Sign in with an account that has approved eligibility.' : !eligible ? 'This account has no approved voter eligibility status.' : !election.eligibilityRoot ? 'No eligibility root is recorded for this election. Publish and sync an approved root before voting.' : !readiness.cryptography?.configured ? 'A real Groth16 verifier and matching circuit artifacts are missing. CivicChain will not treat a placeholder as a valid proof.' : !keyReady ? 'The ballot encryption public key has not been generated. Run npm run keys:generate and restart the server.' : !readiness.network?.reachable ? 'No reachable consortium RPC endpoint was detected. A local application record is not a blockchain confirmation.' : election.status !== 'OPEN' ? 'The election is not currently open.' : 'Dependencies are configured. The submitted proof and transaction still must verify successfully.'}</p></div></div><div class="security-note"><span class="shield">◇</span><span>Never share your private credential witness. This baseline does not generate or persist a credential witness in browser storage.</span></div></aside></div></div></section></div>`;
}

function renderLogin() {
  appRoot.innerHTML = `<div class="page auth-page"><section class="auth-visual"><div class="eyebrow" style="color:#b0bfd2">A MORE VERIFIABLE PROCESS</div><h1 class="auth-quote">Trust should be earned through evidence.</h1><p>CivicChain explores the boundaries between privacy, integrity and public verification. This local account area is for academic demonstration only.</p></section><section class="auth-form-area"><div class="form-panel"><div class="eyebrow">WELCOME BACK</div><h2 style="margin-top:16px">Sign in to CivicChain.</h2><p>Use your research account to access the relevant workflow.</p><form id="login-form"><div class="form-field"><label for="login-email">Email address</label><input id="login-email" name="email" type="email" autocomplete="username" required placeholder="you@example.edu"></div><div class="form-field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="At least 12 characters"></div><div class="form-footer"><button class="button button-dark" type="submit">SIGN IN <span class="arrow">↗</span></button><a class="text-link" href="/register">CREATE ACCOUNT →</a></div><p class="auth-links"><a href="/forgot-password">FORGOT YOUR PASSWORD?</a></p><div id="login-feedback" aria-live="polite"></div></form><div class="security-note"><span class="shield">◇</span><span>Sessions use an HTTP-only cookie. Do not use these development accounts or this app for real voter identity information.</span></div><p class="auth-links">DEMO ACCOUNTS<br><span class="mono">admin@civicchain.local</span> · <span class="mono">voter@civicchain.local</span><br><span class="micro">Password for seeded accounts: CivicChainDemo!26</span></p></div></section></div>`;
}

function renderRegister() {
  appRoot.innerHTML = `<div class="page auth-page"><section class="auth-visual"><div class="eyebrow" style="color:#b0bfd2">PARTICIPATION STARTS WITH CLARITY</div><h1 class="auth-quote">A private ballot begins with a careful process.</h1><p>Create a synthetic research account, then submit an eligibility application. Account creation does not itself grant voting rights.</p></section><section class="auth-form-area"><div class="form-panel"><div class="eyebrow">NEW ACCOUNT</div><h2 style="margin-top:16px">Create your account.</h2><p>Use synthetic information only in this demonstration.</p><form id="register-form"><div class="form-field"><label for="register-name">Full name</label><input id="register-name" name="name" required maxlength="90" autocomplete="name" placeholder="Alex Morgan"></div><div class="form-field"><label for="register-email">Email address</label><input id="register-email" name="email" type="email" required autocomplete="email" placeholder="you@example.edu"></div><div class="form-field"><label for="register-password">Password</label><input id="register-password" name="password" type="password" minlength="12" required autocomplete="new-password" placeholder="At least 12 characters"><span class="form-help">Use a unique password; seeded demo passwords are public in the project README.</span></div><div class="form-field"><label for="register-confirm">Confirm password</label><input id="register-confirm" name="confirm" type="password" minlength="12" required autocomplete="new-password"></div><label class="inline-check"><input name="synthetic" type="checkbox" required><span>I confirm these are synthetic research details and I understand this is not a production election platform.</span></label><div class="button-row"><button class="button button-dark" type="submit">CREATE ACCOUNT <span class="arrow">↗</span></button></div><div id="register-feedback" aria-live="polite"></div></form><p class="auth-links">ALREADY REGISTERED? <a href="/login">SIGN IN →</a></p></div></section></div>`;
}

function renderForgotPassword() {
  appRoot.innerHTML = `<div class="page auth-page"><section class="auth-visual"><div class="eyebrow" style="color:#b0bfd2">ACCOUNT RECOVERY</div><h1 class="auth-quote">Recovery should be deliberate, not revealing.</h1><p>The local demo uses a private mock-mail outbox. It does not send real email and must not be used for a public deployment.</p></section><section class="auth-form-area"><div class="form-panel"><div class="eyebrow">RESET ACCESS</div><h2 style="margin-top:16px">Request a reset link.</h2><p>Enter the email address associated with your synthetic demo account.</p><form id="forgot-password-form"><div class="form-field"><label for="forgot-email">Email address</label><input id="forgot-email" name="email" type="email" autocomplete="email" required placeholder="you@example.edu"></div><div class="button-row"><button class="button button-dark" type="submit">QUEUE RESET EMAIL <span class="arrow">↗</span></button></div><div id="forgot-feedback" aria-live="polite"></div></form><div class="security-note"><span class="shield">◇</span><span>Local development only: inspect the private file <span class="mono">data/mock-mail-outbox.json</span> on the server machine. Reset tokens expire after 15 minutes.</span></div><p class="auth-links"><a href="/login">RETURN TO SIGN IN →</a></p></div></section></div>`;
}

function renderResetPassword() {
  const tokenFromFragment = new URLSearchParams(location.hash.replace(/^#/, '')).get('token') || '';
  appRoot.innerHTML = `<div class="page auth-page"><section class="auth-visual"><div class="eyebrow" style="color:#b0bfd2">SECURE ACCOUNT RECOVERY</div><h1 class="auth-quote">Use a reset token once, then let it expire.</h1><p>Reset links are single-use and time-limited. A successful password change revokes active sessions for that account.</p></section><section class="auth-form-area"><div class="form-panel"><div class="eyebrow">CHOOSE A NEW PASSWORD</div><h2 style="margin-top:16px">Reset your password.</h2><form id="reset-password-form"><div class="form-field"><label for="reset-token">Reset token</label><input id="reset-token" name="token" required autocomplete="off" spellcheck="false" value="${esc(tokenFromFragment)}" placeholder="Paste the token from the mock-mail outbox"></div><div class="form-field"><label for="reset-password">New password</label><input id="reset-password" name="password" type="password" minlength="12" required autocomplete="new-password" placeholder="At least 12 characters"></div><div class="form-field"><label for="reset-confirm">Confirm new password</label><input id="reset-confirm" name="confirm" type="password" minlength="12" required autocomplete="new-password"></div><div class="button-row"><button class="button button-dark" type="submit">UPDATE PASSWORD <span class="arrow">↗</span></button></div><div id="reset-feedback" aria-live="polite"></div></form><p class="auth-links"><a href="/login">RETURN TO SIGN IN →</a></p></div></section></div>`;
}

function renderPrivacy() {
  appRoot.innerHTML = `<div class="page">${pageIntro('PRIVACY NOTICE','Collect less. Explain every record.','This notice describes the local academic prototype. It is not a substitute for a deployment-specific privacy impact assessment or legal notice.')}<section class="page-content"><div class="container docs-article privacy-article"><section><h2>Information processed</h2><p>The local demo stores synthetic account names, email addresses, password hashes, account roles, eligibility application status, election configuration, safe application audit metadata and transaction/receipt references when actual integration is configured. Do not enter real voter data or identity documents.</p></section><section><h2>Ballot and identity separation</h2><p>The baseline voter dashboard does not display a private choice and the ballot record has no direct user foreign key. The optional browser encryption helper encrypts a small choice payload using RSA-OAEP, but this is not homomorphic encryption or a complete tally protocol. A compromised browser can still observe user choices, and public nullifiers and transaction timing may allow correlation.</p></section><section><h2>Public and off-chain information</h2><p>Election status, public root metadata, transaction details, commitments and contract events may be visible on a configured network and may not be removable after publication. Names, emails, password hashes, secret credentials, private witnesses, private keys and tally shares must remain off chain.</p></section><section><h2>Retention and access</h2><p>The local JSON store persists until the operator resets or removes it. In-memory sessions expire after eight hours and are revoked when the server restarts. Development password-reset messages are held in a local private mock-mail outbox and expire after 15 minutes. The audit file is mutable local storage, not an immutable ledger.</p></section><section><h2>Configuration and limitations</h2><p>No real email is sent by the mock-mail adapter. No claim is made that all activity is anonymous. Confidentiality of ballot content, unlinkability, eligibility, uniqueness, record integrity, tally correctness, verifiability and coercion resistance are distinct properties. Review the <a href="/docs#limitations">known limitations</a> before using the project.</p></section></div></section></div>`;
}

async function renderVoter() {
  if (!state.user) return navigate('/login', { replace: true });
  if (state.user.role !== 'VOTER') return renderNotFound('Voter dashboard unavailable','This dashboard is reserved for voter accounts.');
  const data = await api('/api/v1/voter/dashboard').catch(() => null);
  if (!data) return renderNotFound('Dashboard unavailable','The voter dashboard could not load data from the backend.');
  const elections = data.elections || [];
  appRoot.innerHTML = `<div class="page">${pageIntro('VOTER WORKSPACE','Your participation, clearly recorded.','Review your account status, eligibility workflow and election calendar. This page does not display plaintext ballot selections.')}
  <section class="page-content"><div class="container"><div class="grid-4"><div class="metric"><div class="metric-label">Account status</div><div class="metric-value" style="font-size:22px">${esc(state.user.status)}</div><div class="metric-note">Authenticated user</div></div><div class="metric"><div class="metric-label">Eligibility</div><div class="metric-value" style="font-size:22px">${esc(state.user.eligibilityStatus.replaceAll('_',' '))}</div><div class="metric-note">Separate from login</div></div><div class="metric"><div class="metric-label">Open elections</div><div class="metric-value">${elections.filter(e=>e.status==='OPEN').length}</div><div class="metric-note">From application records</div></div><div class="metric"><div class="metric-label">Receipt history</div><div class="metric-value">0</div><div class="metric-note">No identity-linked receipt history in this baseline</div></div></div><div class="grid-2" style="margin-top:25px"><div class="section-card"><div class="eyebrow">ELIGIBILITY</div><h3 style="margin-top:14px">Registration status</h3><p class="micro">Your account is not a credential. Eligibility review is managed separately by an authorized issuer.</p><div class="receipt-row"><span>Application status</span><span>${esc(state.user.eligibilityStatus)}</span></div><div class="receipt-row"><span>Credential issuance</span><span>Not implemented in baseline</span></div><div class="button-row">${state.user.eligibilityStatus === 'NOT_APPLIED' || state.user.eligibilityStatus === 'REJECTED' ? '<button class="button button-dark" data-action="apply-eligibility">APPLY FOR ELIGIBILITY <span class="arrow">↗</span></button>' : ''}<a class="button button-outline" href="/docs#cryptography">HOW CREDENTIALS WORK</a></div></div><div class="section-card"><div class="eyebrow">ACCOUNT</div><h3 style="margin-top:14px">Your details</h3><div class="receipt-row"><span>Name</span><span>${esc(state.user.name)}</span></div><div class="receipt-row"><span>Email</span><span>${esc(state.user.email)}</span></div><div class="receipt-row"><span>Role</span><span>${esc(state.user.role)}</span></div><div class="receipt-row"><span>Created</span><span>${esc(fmtDate(state.user.createdAt))}</span></div></div></div><div class="split-heading" style="margin-top:42px"><div><div class="eyebrow">ELECTION CALENDAR</div><h2 class="section-heading" style="font-size:28px">Available elections.</h2></div><a class="text-link" href="/elections">EXPLORE ALL <span>→</span></a></div><div class="grid-3">${elections.map(electionCard).join('')}</div><div class="vote-warning" style="margin-top:25px">The baseline currently does not issue a privacy-preserving credential or submit verified ballots. It will not claim a ballot has been accepted while the proof and network dependencies are unavailable.</div></div></section></div>`;
}

async function renderAdmin() {
  if (!state.user) return navigate('/login', { replace: true });
  if (state.user.role !== 'ADMIN') return renderNotFound('Access restricted','The administration area requires an administrator role enforced by the backend.');
  const data = await api('/api/v1/admin/dashboard').catch(() => null);
  const apps = await api('/api/v1/eligibility/applications').catch(() => ({ applications: [] }));
  const electionList = await api('/api/v1/elections').catch(() => ({ elections: [] }));
  if (!data) return renderNotFound('Administration unavailable','Could not retrieve the dashboard from the backend.');
  const network = data.network || {};
  const events = data.auditEvents || [];
  appRoot.innerHTML = `<div class="page">${pageIntro('ADMINISTRATION','Governed actions. Visible evidence.','Manage demonstration elections and eligibility review. Security-critical publication, voting and tally actions stay blocked until their real cryptographic and blockchain dependencies are configured.', '<a class="button button-dark" href="/admin/elections/create">CREATE ELECTION <span class="arrow">↗</span></a>')}
  <section class="page-content"><div class="container"><div class="grid-4"><div class="metric"><div class="metric-label">Total elections</div><div class="metric-value">${data.elections}</div><div class="metric-note">Application records</div></div><div class="metric"><div class="metric-label">Pending eligibility</div><div class="metric-value">${data.pendingEligibility}</div><div class="metric-note">Awaiting issuer review</div></div><div class="metric"><div class="metric-label">Confirmed ballots</div><div class="metric-value">${data.ballotsConfirmed}</div><div class="metric-note">Only confirmed chain records</div></div><div class="metric"><div class="metric-label">Network</div><div class="metric-value" style="font-size:19px">${network.reachable ? 'REACHABLE' : 'UNAVAILABLE'}</div><div class="metric-note">${esc(network.status || 'NOT_CONFIGURED')}</div></div></div><div class="section-card" style="margin-top:25px"><div class="split-heading"><div><div class="eyebrow">ELECTION MANAGEMENT</div><h2 class="section-heading" style="font-size:26px">Election lifecycle.</h2></div><a class="text-link" href="/admin/elections/create">CREATE DRAFT <span>→</span></a></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Election</th><th>State</th><th>Eligibility root</th><th>Action</th></tr></thead><tbody>${(electionList.elections||[]).map(e=>`<tr><td>${esc(e.title)}${e.fixture?'<br><span class="micro">Development fixture</span>':''}<br><span class="micro mono">ID ${esc(e.chainElectionId)}</span></td><td>${pill(e.status)}</td><td>${e.eligibilityRoot?'<span class="mono">'+esc(String(e.eligibilityRoot).slice(0,18))+'…</span>':'Not configured'}</td><td><a class="table-action" href="/admin/elections/${encodeURIComponent(e.id)}">MANAGE ↗</a></td></tr>`).join('')||'<tr><td colspan="4">No elections found.</td></tr>'}</tbody></table></div></div><div class="grid-2" style="margin-top:25px"><div class="section-card"><div class="eyebrow">ELIGIBILITY REVIEW</div><h3 style="margin-top:14px">Applications</h3>${apps.applications.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Applicant</th><th>Status</th><th>Action</th></tr></thead><tbody>${apps.applications.map(item=>`<tr><td>${esc(item.userName)}<br><span class="micro">${esc(item.userEmail)}</span></td><td>${pill(item.status)}</td><td>${item.status==='PENDING' ? `<button class="button button-small button-outline" data-action="review-eligibility" data-id="${esc(item.id)}" data-review="approve">Approve</button> <button class="button button-small button-quiet" data-action="review-eligibility" data-id="${esc(item.id)}" data-review="reject">Reject</button>` : `<span class="micro">Reviewed</span>`}</td></tr>`).join('')}</tbody></table></div>` : emptyState('No pending applications','New eligibility applications appear here when submitted by voter accounts.')}</div><div class="section-card"><div class="eyebrow">SECURITY READINESS</div><h3 style="margin-top:14px">Deployment state</h3><div class="receipt-row"><span>Groth16 verifier</span><span>${data.cryptography.configured ? pill('APPROVED','Configured') : pill('NOT_CONFIGURED','Not configured')}</span></div><div class="receipt-row"><span>RPC endpoint</span><span>${network.reachable ? pill('OPEN','Reachable') : pill('UNAVAILABLE','Unavailable')}</span></div><div class="receipt-row"><span>Voting contract</span><span class="mono">${esc(network.contractAddress || 'Not configured')}</span></div><div class="receipt-row"><span>Environment</span><span>Local academic prototype</span></div><div class="button-row"><a class="button button-outline" href="/network">NETWORK DASHBOARD</a><a class="button button-outline" href="/docs#limitations">KNOWN LIMITATIONS</a></div></div></div><div class="split-heading" style="margin-top:42px"><div><div class="eyebrow">RECENT EVENTS</div><h2 class="section-heading" style="font-size:28px">Audit activity.</h2></div><a class="text-link" href="/auditor">OPEN AUDITOR VIEW <span>→</span></a></div><div class="section-card"><div class="event-list">${events.map(eventRow).join('') || '<p class="micro">No audit events recorded.</p>'}</div><p class="micro" style="margin-top:16px">This local application log is mutable storage, not an immutable blockchain audit record.</p></div></div></section></div>`;
}

async function renderElectionManage(electionId) {
  if (!state.user) return navigate('/login', { replace: true });
  if (state.user.role !== 'ADMIN') return renderNotFound('Access restricted','Only an authorized administrator can manage election configuration.');
  let election;
  try { election = (await api(`/api/v1/elections/${encodeURIComponent(electionId)}`)).election; }
  catch (error) { return renderNotFound('Election unavailable', error.message); }
  appRoot.innerHTML = `<div class="page">${pageIntro('ELECTION MANAGEMENT',esc(election.title),'Lifecycle state must be read from and changed through the consortium contract. This panel will not write a fake scheduled/open state into the application database.')}
  <section class="page-content"><div class="container"><div class="form-layout"><div class="section-card"><div class="eyebrow">CHAIN-SYNCHRONIZED CONFIGURATION</div><h3 style="margin-top:14px">Current election record</h3><div class="receipt-row"><span>Local record ID</span><span class="mono">${esc(election.id)}</span></div><div class="receipt-row"><span>Numeric chain election ID</span><span class="mono">${esc(election.chainElectionId)}</span></div><div class="receipt-row"><span>Lifecycle state</span><span>${pill(election.status)}</span></div><div class="receipt-row"><span>Eligibility root</span><span class="mono">${election.eligibilityRoot?esc(election.eligibilityRoot):'Not synchronized'}</span></div><div class="receipt-row"><span>Configuration commitment</span><span class="mono">${election.configurationCommitment?esc(election.configurationCommitment):'Not synchronized'}</span></div><div class="receipt-row"><span>Start</span><span>${esc(fmtDate(election.startTime))}</span></div><div class="receipt-row"><span>End</span><span>${esc(fmtDate(election.endTime))}</span></div><div class="button-row"><button class="button button-dark" data-action="sync-election-chain" data-id="${esc(election.id)}">SYNC FROM CONTRACT <span class="arrow">↻</span></button><a class="button button-outline" href="/elections/${encodeURIComponent(election.id)}">PUBLIC VIEW</a></div><div id="sync-chain-feedback" aria-live="polite"></div></div><aside><div class="note-panel"><h3>Required external steps</h3><ol><li>Generate voter-controlled credentials and collect only the public commitments.</li><li>Build the eligibility Merkle tree and protect its path data.</li><li>Publish the root and election configuration with <span class="mono">scripts/register-election.js</span>.</li><li>Open/close via <span class="mono">scripts/set-election-state.js</span>.</li><li>Use this page to read the actual contract state back into the public UI.</li></ol><p>The API deliberately blocks database-only lifecycle state changes. A sync is a read, not a contract transaction.</p><a href="/docs#setup" class="text-link">SETUP DOCUMENTATION <span>→</span></a></div></aside></div></div></section></div>`;
}

async function renderCreateElection() {
  if (!state.user) return navigate('/login', { replace: true });
  if (state.user.role !== 'ADMIN') return renderNotFound('Access restricted','Only authorized administrators can configure elections.');
  appRoot.innerHTML = `<div class="page">${pageIntro('ELECTION GOVERNANCE','Create an election draft.','Define the intended ballot and schedule. Publishing will remain blocked until cryptographic parameters, eligibility roots, governance and the deployed consortium contract are configured.')}
  <section class="page-content"><div class="container"><div class="form-layout"><div class="form-panel"><h2>Election configuration</h2><p>Creation saves a DRAFT in the application database. It does not publish anything to the blockchain.</p><form id="create-election-form"><div class="form-field"><label for="election-title">Election title</label><input id="election-title" name="title" required maxlength="150" placeholder="e.g. Research Council Election"></div><div class="form-field"><label for="election-description">Description</label><textarea id="election-description" name="description" maxlength="1200" required placeholder="Describe the purpose and process."></textarea></div><div class="form-grid"><div class="form-field"><label for="election-purpose">Purpose</label><input id="election-purpose" name="purpose" maxlength="100" placeholder="Student representation"></div><div class="form-field"><label for="election-constituency">Eligible group</label><input id="election-constituency" name="constituency" maxlength="180" placeholder="Approved participants"></div><div class="form-field"><label for="election-start">Start time</label><input id="election-start" name="startTime" type="datetime-local" required></div><div class="form-field"><label for="election-end">End time</label><input id="election-end" name="endTime" type="datetime-local" required></div></div><div class="form-field"><label for="election-options">Options (one per line)</label><textarea id="election-options" name="options" required placeholder="North Hall\nGrove Collective\nBridge Forum"></textarea><span class="form-help">Enter between 2 and 20 choices. This prototype supports single-choice options only.</span></div><div class="button-row"><button class="button button-dark" type="submit">SAVE DRAFT <span class="arrow">↗</span></button><a class="button button-outline" href="/admin">CANCEL</a></div><div id="create-election-feedback" aria-live="polite"></div></form></div><aside><div class="note-panel"><h3>Before you publish</h3><ul><li>Validate options and election schedule.</li><li>Authenticate an approved eligibility root.</li><li>Version and publish cryptographic parameters.</li><li>Configure independent tally trustees and publication policy.</li><li>Confirm the verifier and contract are deployed and tested.</li></ul><p>No arbitrary status change should bypass these requirements. The app currently enforces a publication block when these dependencies are unavailable.</p></div></aside></div></div></section></div>`;
}

async function renderNetwork() {
  const data = await api('/api/v1/network').catch(() => null);
  if (!data) return renderNotFound('Network status unavailable','Could not query the application network adapter.');
  const network = data.network || {};
  const validatorCount = network.validators?.length || 0;
  const reachableCount = (network.validators || []).filter(v => v.reachable).length;
  appRoot.innerHTML = `<div class="page"><section class="network-hero"><div class="container"><div class="eyebrow">CONSORTIUM OBSERVABILITY</div><h1 class="page-title">The network, as it is.</h1><p class="lead">Network status is queried from configured RPC endpoints. The dashboard never invents blocks or validator health.</p><div class="network-metrics"><div class="network-metric"><span>Connection</span><strong>${network.reachable ? 'ONLINE' : 'OFFLINE'}</strong><small>${esc(network.status || 'NOT_CONFIGURED')}</small></div><div class="network-metric"><span>Chain ID</span><strong>${network.chainId ?? '—'}</strong><small>${network.configured ? 'From RPC response' : 'No RPC configured'}</small></div><div class="network-metric"><span>Latest block</span><strong>${network.blockNumber ?? '—'}</strong><small>${network.blockNumber === null || network.blockNumber === undefined ? 'Unavailable' : 'Latest observed height'}</small></div><div class="network-metric"><span>Validator endpoints</span><strong>${reachableCount}/${validatorCount}</strong><small>From configured endpoint list</small></div></div></div></section><section class="page-content"><div class="container"><div class="grid-2"><section class="section-card"><div class="eyebrow">NODE OBSERVATIONS</div><h3 style="margin-top:14px">Configured validators</h3>${validatorCount ? `<div class="node-list">${network.validators.map(v=>`<div class="node-row"><div class="node-name"><span class="node-icon">⌘</span><div><strong>${esc(v.urlLabel)}</strong><span>RPC endpoint</span></div></div><span class="status-text ${v.reachable?'ok':'fail'}">${v.reachable?'Reachable':'Unreachable'}</span><span class="block-height micro">${v.blockNumber===null?'—':`Block ${v.blockNumber}`}</span></div>`).join('')}</div>` : emptyState('No validators configured','Set VALIDATOR_RPC_URLS to comma-separated validator RPC endpoints. No node data is fabricated.')}</section><section class="section-card"><div class="eyebrow">DEPLOYMENT CONFIGURATION</div><h3 style="margin-top:14px">Protocol components</h3><div class="receipt-row"><span>Network status</span><span>${pill(network.status || 'NOT_CONFIGURED')}</span></div><div class="receipt-row"><span>Voting contract</span><span class="mono">${esc(network.contractAddress || 'Not configured')}</span></div><div class="receipt-row"><span>Groth16 artifacts</span><span>${data.cryptography?.configured ? pill('OPEN','Configured') : pill('NOT_CONFIGURED','Missing')}</span></div><div class="receipt-row"><span>Application mode</span><span>Local academic prototype</span></div><p class="micro" style="margin-top:17px">A reachable JSON-RPC endpoint does not by itself prove validator independence, correct consensus configuration or election integrity.</p><button class="button button-outline" data-action="refresh-network">REFRESH OBSERVATIONS ↻</button></section></div></div></section></div>`;
}

function eventRow(event) {
  return `<div class="event-row"><time>${esc(fmtDate(event.timestamp, true))}</time><div><strong>${esc(event.action.replaceAll('_',' '))}</strong><span>${esc(event.resource)} · ${esc(event.actor)}</span></div>${pill(event.outcome || 'INFO', event.outcome || 'INFO')}</div>`;
}

async function renderAuditor() {
  const [auditData, overview] = await Promise.all([api('/api/v1/audit').catch(()=>null), api('/api/v1/overview').catch(()=>null)]);
  if (!auditData || !overview) return renderNotFound('Audit view unavailable','Public audit data could not be loaded.');
  const electionRows = overview.elections.map(e=>`<tr><td>${esc(e.title)}${e.fixture?'<br><span class="micro">Development fixture</span>':''}</td><td>${pill(e.status)}</td><td>${e.eligibilityRoot?`<span class="mono">${esc(e.eligibilityRoot)}</span>`:'Not published'}</td><td>${e.configurationCommitment?`<span class="mono">${esc(e.configurationCommitment)}</span>`:'Not published'}</td></tr>`).join('');
  appRoot.innerHTML = `<div class="page">${pageIntro('PUBLIC AUDIT','Inspect the record.','This view exposes non-sensitive application audit events and public election metadata. It does not claim that a local JSON log is immutable or that fixture tallies have been cryptographically verified.')}
  <section class="page-content"><div class="container"><div class="grid-3"><div class="metric"><div class="metric-label">Election records</div><div class="metric-value">${overview.elections.length}</div><div class="metric-note">Including visibly marked fixtures</div></div><div class="metric"><div class="metric-label">Audit events</div><div class="metric-value">${auditData.events.length}</div><div class="metric-note">Local application log</div></div><div class="metric"><div class="metric-label">Independent chain verification</div><div class="metric-value" style="font-size:19px">${overview.network?.reachable?'AVAILABLE':'BLOCKED'}</div><div class="metric-note">${esc(overview.network?.status || 'NOT_CONFIGURED')}</div></div></div><div class="section-card" style="margin-top:24px"><div class="eyebrow">ELECTION METADATA</div><h3 style="margin-top:14px">Published configuration context</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Election</th><th>Status</th><th>Eligibility root</th><th>Configuration commitment</th></tr></thead><tbody>${electionRows}</tbody></table></div></div><div class="section-card" style="margin-top:24px"><div class="split-heading"><div><div class="eyebrow">AUDIT TRAIL</div><h2 class="section-heading" style="font-size:26px">Recent activity.</h2></div><span class="pill">LOCAL APP LOG</span></div><div class="event-list">${auditData.events.map(eventRow).join('') || '<p class="micro">No events recorded.</p>'}</div><p class="vote-warning">${esc(auditData.warning)}</p><div class="button-row"><button class="button button-outline" data-action="export-audit">EXPORT PUBLIC AUDIT JSON <span class="arrow">↗</span></button></div></div></div></section></div>`;
  state.auditData = auditData;
}

async function renderResults() {
  const data = await api('/api/v1/results').catch(()=>null);
  if (!data) return renderNotFound('Results unavailable','No result records could be retrieved.');
  const sections = data.elections.map(e=>`<article class="section-card" id="${esc(e.id)}" style="margin-bottom:18px"><div class="align-end"><div><div class="eyebrow">${e.resultsSource==='DEVELOPMENT_FIXTURE'?'DEVELOPMENT FIXTURE':'APPLICATION RECORD'}</div><h3 style="margin-top:12px;font-size:20px">${esc(e.title)}</h3><p class="micro">Closed ${esc(fmtDate(e.endTime,true))} · ${e.results?.length||0} published options</p></div>${pill(e.status)}</div><div style="margin-top:17px">${(e.results||[]).map(result=>`<div style="display:grid;grid-template-columns:minmax(120px,1fr) 2fr 55px;align-items:center;gap:15px;margin:13px 0"><span style="font-size:11px">${esc(result.optionName)}</span><div style="height:5px;background:#e9edf2"><div style="height:100%;width:${Math.max(0,Math.min(100, (result.votes/Math.max(1,...(e.results||[]).map(r=>r.votes)))*100))}%;background:#6e88a9"></div></div><strong style="font-size:11px;text-align:right">${esc(result.votes)}</strong></div>`).join('')}</div><div class="receipt-row"><span>Tally verification</span><span>${pill('NOT_CONFIGURED','Not cryptographically verified')}</span></div><p class="micro">${e.resultsSource==='DEVELOPMENT_FIXTURE'?'These totals are seeded demo values for layout validation only.':'The application result record has not been verified using a configured tally proof.'}</p></article>`).join('');
  appRoot.innerHTML = `<div class="page">${pageIntro('RESULTS & PUBLICATION','Results with context.','Published totals are shown only when a result record exists. A displayed fixture or database record is not the same as a verified cryptographic tally.')}
  <section class="page-content"><div class="container">${sections || emptyState('No published results','When a result has been published, it will appear here.') }<p class="vote-warning">${esc(data.warning)}</p></div></section></div>`;
}

async function renderReceipt(reference) {
  let data;
  try { data = await api(`/api/v1/ballots/${encodeURIComponent(reference)}/receipt`); }
  catch (error) { return renderNotFound('Receipt unavailable', error.message); }
  const receipt = data.receipt;
  appRoot.innerHTML = `<div class="page">${pageIntro('VOTE RECEIPT','A recorded submission, with a reference.','Review the public receipt fields and their precise meaning. The receipt does not reveal the plaintext selection.')}
  <section class="page-content"><div class="container"><article class="receipt-card"><div class="receipt-icon">✓</div><h2>Submission receipt</h2><p>${esc(data.meaning)}</p><div class="receipt-row"><span>Receipt reference</span><span class="mono">${esc(receipt.reference)}</span></div><div class="receipt-row"><span>Election</span><span>${esc(receipt.electionId)}</span></div><div class="receipt-row"><span>Transaction hash</span><span class="mono">${esc(receipt.transactionHash)}</span></div><div class="receipt-row"><span>Block number</span><span>${esc(receipt.blockNumber)}</span></div><div class="receipt-row"><span>Commitment</span><span class="mono">${esc(receipt.commitment)}</span></div><div class="receipt-row"><span>Chain status</span><span>${pill(receipt.status)}</span></div><div class="receipt-row"><span>Recorded at</span><span>${esc(fmtDate(receipt.createdAt))}</span></div><div class="button-row"><a class="button button-dark" href="/verify-ballot">VERIFY PUBLIC RECORD <span class="arrow">↗</span></a><a class="button button-outline" href="/elections">RETURN TO ELECTIONS</a></div></article></div></section></div>`;
}

async function renderVerify() {
  appRoot.innerHTML = `<div class="page">${pageIntro('PUBLIC VERIFICATION','Check the evidence yourself.','Submit a public transaction hash or receipt reference. CivicChain will distinguish verified records from pending, failed and unverifiable records.')}
  <section class="page-content"><div class="container"><div class="form-layout"><section class="form-panel"><h2>Verify a transaction</h2><p>Use the transaction hash returned by a genuinely confirmed ballot submission. This baseline will not accept a hash as proof without querying the configured network.</p><form id="verify-form"><div class="form-field"><label for="verify-reference">Transaction hash or receipt reference</label><input id="verify-reference" name="reference" required maxlength="180" placeholder="0x…"></div><div class="button-row"><button class="button button-dark" type="submit">VERIFY RECORD <span class="arrow">↗</span></button></div><div id="verify-feedback" aria-live="polite"></div></form><div id="verify-result"></div></section><aside><div class="note-panel"><h3>What does a record prove?</h3><ul><li>A transaction receipt can show whether the chain accepted a call.</li><li>A contract event can show that the contract recorded a commitment.</li><li>A valid eligibility proof supports a different claim from ballot encryption.</li><li>A receipt does not by itself prove that the voter's device displayed the correct choice.</li></ul><p>Independent verification must check the relevant evidence, contract and protocol version.</p></div></aside></div></div></section></div>`;
}

function renderDocs() {
  appRoot.innerHTML = `<div class="page">${pageIntro('DOCUMENTATION CENTRE','Understand the design and its limits.','CivicChain is a research prototype exploring a privacy-preserving voting architecture. The documentation distinguishes the baseline application from security-critical components that still require configuration or integration.')}
  <section class="page-content"><div class="container docs-layout"><nav class="docs-nav" aria-label="Documentation sections"><a href="#architecture">System architecture</a><a href="#voting-protocol">Voting protocol</a><a href="#cryptography">Cryptography</a><a href="#blockchain">Consortium chain</a><a href="#privacy">Privacy model</a><a href="#limitations">Known limitations</a><a href="#setup">Local setup</a></nav><article class="docs-article"><section id="architecture"><div class="eyebrow">01 / ARCHITECTURE</div><h2>Separate concerns and trust boundaries.</h2><p>The intended design separates the web interface, application APIs, off-chain identity and eligibility data, client-side proof generation, ballot encryption, consortium smart contracts, tally trustees and public verification. The local baseline currently provides a Node.js HTTP API and browser interface; it does not silently claim that the optional blockchain and proof adapters are live.</p><div class="code-note">Voter browser → API / eligibility workflow → Circom + Groth16 proof<br>Encrypted ballot → VotingContract → permissioned EVM consortium<br>Published ballot evidence → independent verifier → tally artifact</div></section><section id="voting-protocol"><div class="eyebrow">02 / VOTING PROTOCOL</div><h2>One step does not prove the next.</h2><ol><li>Register a synthetic account and submit an eligibility application.</li><li>An authorized issuer reviews eligibility and publishes a versioned eligibility root.</li><li>The voter generates a zero-knowledge membership proof locally from a private witness.</li><li>The ballot is encrypted under election-specific public parameters and checked for validity.</li><li>The contract verifies the proof, checks election state and rejects a reused election-specific nullifier.</li><li>The voter receives a receipt only after the configured chain-acceptance condition is met.</li><li>After closure, trustees run the defined tally process and publish verification artifacts.</li></ol><p>The baseline includes guarded workflow endpoints and circuit/contract sources, but does not yet issue private credentials, construct a live Merkle root, complete a tally, or record confirmed transactions in a configured consortium network.</p></section><section id="cryptography"><div class="eyebrow">03 / CRYPTOGRAPHY</div><h2>Proofs, secrecy and integrity are different properties.</h2><p>The circuit source defines a Groth16 eligibility statement: the prover knows a secret whose Poseidon commitment is a leaf under an approved Merkle root and computes a nullifier bound to the election identifier. Root and election ID are public inputs; the secret and Merkle path remain witness values.</p><p>Groth16 requires circuit-specific trusted setup. For academic development, the included setup script creates local artifacts and documents their non-production status. A proof is accepted only when the verifier artifacts are present and the real verification function returns true.</p><p>Ballot confidentiality is separate. Public-key encryption can conceal a choice from a public record, but a secure election also needs a valid ballot encoding, protection of decryption authority, well-defined tallying and protection against metadata correlation.</p></section><section id="blockchain"><div class="eyebrow">04 / CONSORTIUM BLOCKCHAIN</div><h2>Permissioned does not mean trustless.</h2><p>The proposed deployment uses Hyperledger Besu with QBFT and distinct validator identities. Four validators are provided as a target for local demonstration, but fault tolerance depends on a correct consensus configuration and configured quorum. A reachable RPC endpoint does not prove validator independence or fairness.</p><p>The Solidity sources separate election registry responsibilities from ballot acceptance. A generated Circom verifier must be deployed and its address wired into the voting contract. No contract address or validator endpoint is pre-filled as though a live network already exists.</p></section><section id="privacy"><div class="eyebrow">05 / PRIVACY MODEL</div><h2>Minimize what the public record reveals.</h2><p>Names, email addresses, passwords, private witnesses and decryption shares must stay off-chain. A nullifier should be unique within an election but domain-separated across elections. Network timing, IP metadata, a compromised voter device, collusion between the issuer and verifier, or a trustee threshold compromise can still weaken privacy.</p></section><section id="limitations"><div class="eyebrow">06 / KNOWN LIMITATIONS</div><h2>What this build does not claim.</h2><ul><li>The local JSON persistence adapter is not PostgreSQL and is intended for a single-process development server.</li><li>Registration, login, session handling, guarded APIs, election draft creation and eligibility review are functional in the local prototype.</li><li>Eligibility approval in the baseline does not issue a cryptographic credential or automatically construct an authenticated Merkle tree.</li><li>The Circom circuit source is supplied, but the required Groth16 build artifacts are generated locally and are not pre-generated or asserted to have been audited.</li><li>No transaction is marked confirmed without a reachable configured RPC, proof verification, and a deployed contract call.</li><li>Threshold ballot decryption, trustee workflows, cryptographically verifiable tally publication, production identity verification, coercion resistance and independent security audit are not complete.</li><li>Fixture elections and their sample totals are clearly labeled and must not be presented as real election outcomes.</li></ul></section><section id="setup"><div class="eyebrow">07 / LOCAL SETUP</div><h2>Run the available prototype.</h2><div class="code-note">node server.js<br># open http://localhost:4173<br><br>npm test<br><br># optional; after npm install and local circuit setup<br>npm run zk:setup<br>npm run contracts:compile</div><p>See the project README for prerequisites, environment variables, test coverage and integration steps.</p><a class="button button-dark" href="/docs#limitations">REVIEW LIMITATIONS <span class="arrow">↗</span></a></section></article></div></section></div>`;
}

function renderNotFound(title, description) {
  appRoot.innerHTML = `<div class="page">${pageIntro('CIVICCHAIN', esc(title), esc(description))}<section class="page-content"><div class="container">${emptyState(title, description, '<a href="/" class="button button-dark">RETURN HOME ↗</a>')}</div></section></div>`;
}

async function renderRoute() {
  const path = decodeURI(location.pathname);
  renderHeader();
  if (path === '/') return renderHome();
  if (path === '/login') return renderLogin();
  if (path === '/register') return renderRegister();
  if (path === '/forgot-password') return renderForgotPassword();
  if (path === '/reset-password') return renderResetPassword();
  if (path === '/privacy') return renderPrivacy();
  if (path === '/elections') return renderElections();
  if (path === '/voter') return renderVoter();
  if (path === '/admin') return renderAdmin();
  if (path === '/admin/elections/create') return renderCreateElection();
  const manageMatch = path.match(/^\/admin\/elections\/([^/]+)$/);
  if (manageMatch) return renderElectionManage(manageMatch[1]);
  if (path === '/network') return renderNetwork();
  if (path === '/auditor') return renderAuditor();
  if (path === '/results') return renderResults();
  if (path === '/verify-ballot') return renderVerify();
  const receiptMatch = path.match(/^\/vote-receipt\/([^/]+)$/);
  if (receiptMatch) return renderReceipt(receiptMatch[1]);
  if (path === '/docs') return renderDocs();
  const voteMatch = path.match(/^\/elections\/([^/]+)\/vote$/);
  if (voteMatch) return renderVoting(voteMatch[1]);
  const electionMatch = path.match(/^\/elections\/([^/]+)$/);
  if (electionMatch) {
    try { const data = await api(`/api/v1/elections/${encodeURIComponent(electionMatch[1])}`); return renderElectionDetail(data.election); }
    catch (error) { return renderNotFound('Election unavailable', error.message); }
  }
  return renderNotFound('Page not found','The page you requested is not available in this application.');
}

function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }
function setFeedback(id, message, type = 'error') {
  const node = document.getElementById(id);
  if (node) node.innerHTML = `<p class="form-${type}">${esc(message)}</p>`;
}

async function handleSubmit(form) {
  if (form.id === 'login-form') {
    const values = formValues(form);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true; button.textContent = 'SIGNING IN…';
    try {
      const data = await api('/api/v1/auth/login', { method: 'POST', body: { email: values.email, password: values.password } });
      state.user = data.user;
      toast('Signed in', `Welcome, ${data.user.name}.`, 'success');
      const target = data.user.role === 'ADMIN' ? '/admin' : data.user.role === 'AUDITOR' ? '/auditor' : '/voter';
      navigate(target);
    } catch (error) { setFeedback('login-feedback', error.message); }
    finally { if (button.isConnected) { button.disabled = false; button.innerHTML = 'SIGN IN <span class="arrow">↗</span>'; } }
  }
  if (form.id === 'register-form') {
    const values = formValues(form);
    if (values.password !== values.confirm) return setFeedback('register-feedback', 'The passwords do not match.');
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    try {
      await api('/api/v1/auth/register', { method: 'POST', body: { name: values.name, email: values.email, password: values.password } });
      toast('Account created', 'Sign in and submit an eligibility application.', 'success');
      navigate('/login');
    } catch (error) { setFeedback('register-feedback', error.message); }
    finally { if (button.isConnected) button.disabled = false; }
  }

  if (form.id === 'forgot-password-form') {
    const values = formValues(form);
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const data = await api('/api/v1/auth/forgot-password', { method: 'POST', body: { email: values.email } });
      setFeedback('forgot-feedback', `${data.message} In development, check the server's private mock-mail outbox.`, 'success');
    } catch (error) { setFeedback('forgot-feedback', error.message); }
    finally { if (button.isConnected) button.disabled = false; }
  }
  if (form.id === 'reset-password-form') {
    const values = formValues(form);
    if (values.password !== values.confirm) return setFeedback('reset-feedback', 'The passwords do not match.');
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const data = await api('/api/v1/auth/reset-password', { method: 'POST', body: { token: values.token, password: values.password } });
      toast('Password updated', data.message, 'success');
      history.replaceState({}, '', '/reset-password');
      navigate('/login', { replace: true });
    } catch (error) { setFeedback('reset-feedback', error.message); }
    finally { if (button.isConnected) button.disabled = false; }
  }
  if (form.id === 'create-election-form') {
    const values = formValues(form);
    const options = values.options.split(/\r?\n/).map(name => name.trim()).filter(Boolean).map(name => ({ name }));
    try {
      const data = await api('/api/v1/admin/elections', { method: 'POST', body: { title: values.title, description: values.description, purpose: values.purpose, constituency: values.constituency, startTime: values.startTime ? new Date(values.startTime).toISOString() : '', endTime: values.endTime ? new Date(values.endTime).toISOString() : '', options } });
      toast('Draft created', data.message, 'success');
      navigate(`/admin/elections/${encodeURIComponent(data.election.id)}`);
    } catch (error) { setFeedback('create-election-feedback', error.message); }
  }
  if (form.id === 'ballot-form') {
    const values = formValues(form);
    const electionId = form.dataset.electionId;
    const feedback = document.getElementById('ballot-feedback');
    if (!values.optionId || values.acknowledge !== 'on') return setFeedback('ballot-feedback','Select one option and confirm the research-prototype notice.');
    const proofFile = values.proofPackage;
    if (!proofFile || typeof proofFile.text !== 'function' || proofFile.size > 512 * 1024) return setFeedback('ballot-feedback','Choose a proof-package.json file under 512 KB. Never upload the private witness.');
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'CHECKING PROOF…';
    try {
      const readiness = await api('/api/v1/crypto/status');
      if (!readiness.cryptography?.configured) throw new Error('Submission stopped: the real Groth16 verifier is not configured.');
      if (!readiness.network?.reachable) throw new Error('Submission stopped: the consortium network is not reachable.');
      const pkg = JSON.parse(await proofFile.text());
      if (pkg.protocol !== 'groth16' || !pkg.proof || !Array.isArray(pkg.publicSignals) || pkg.publicSignals.length !== 3) throw new Error('The selected file is not a valid CivicChain Groth16 proof package.');
      const keyData = await api('/api/v1/crypto/ballot-public-key');
      const pemContent = keyData.publicKeyPem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
      const publicKeyBytes = Uint8Array.from(atob(pemContent), char => char.charCodeAt(0));
      const publicKey = await window.crypto.subtle.importKey('spki', publicKeyBytes.buffer, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
      const plaintext = new TextEncoder().encode(JSON.stringify({ electionId, optionId: values.optionId, protocol: 'CivicChain-demo-ballot-v1' }));
      const encrypted = new Uint8Array(await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, plaintext));
      const encryptedBallot = Array.from(encrypted, byte => byte.toString(16).padStart(2, '0')).join('');
      feedback.innerHTML = '<p class="micro">Encrypted in the browser. Verifying the submitted proof and waiting for the chain response…</p>';
      submitButton.textContent = 'WAITING FOR CONFIRMATION…';
      const result = await api(`/api/v1/elections/${encodeURIComponent(electionId)}/ballots`, { method: 'POST', body: { encryptedBallot, proof: pkg.proof, publicSignals: pkg.publicSignals } });
      toast('Ballot submission confirmed', 'The contract returned a confirmed receipt.', 'success');
      navigate(`/vote-receipt/${encodeURIComponent(result.receipt.reference)}`);
    } catch (error) {
      setFeedback('ballot-feedback', error.message);
      submitButton.disabled = false;
      submitButton.innerHTML = 'SUBMIT ENCRYPTED BALLOT <span class="arrow">↗</span>';
    }
  }
  if (form.id === 'verify-form') {
    const reference = String(formValues(form).reference || '').trim();
    const node = document.getElementById('verify-result');
    const feedback = document.getElementById('verify-feedback');
    feedback.innerHTML = '<p class="micro">Querying the configured record source…</p>';
    try {
      if (/^0x[0-9a-fA-F]{64}$/.test(reference)) {
        const result = await api(`/api/v1/verify/transaction/${encodeURIComponent(reference)}`);
        node.innerHTML = `<div class="verify-result"><h3>${esc(result.statusLabel || 'Verification result')}</h3><p>${esc(result.message)}</p><div class="receipt-row"><span>Transaction</span><span class="mono">${esc(reference)}</span></div><div class="receipt-row"><span>Chain status</span><span>${pill(result.status || 'UNVERIFIABLE')}</span></div>${result.blockNumber !== undefined && result.blockNumber !== null ? `<div class="receipt-row"><span>Block number</span><span>${esc(result.blockNumber)}</span></div>` : ''}</div>`;
        feedback.innerHTML = '';
      } else {
        const message = 'This is not a transaction hash. Receipt-reference lookup is not available in the baseline without a configured chain submission record.';
        feedback.innerHTML = `<p class="form-error">${esc(message)}</p>`;
        node.innerHTML = '';
      }
    } catch (error) {
      feedback.innerHTML = `<p class="form-error">${esc(error.message)}</p>`;
      node.innerHTML = '';
    }
  }
}

appRoot.addEventListener('click', async event => {
  const filter = event.target.closest('[data-status]');
  if (filter) {
    document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('active', button === filter));
    const status = filter.dataset.status;
    const query = document.getElementById('election-search')?.value || '';
    try { state.elections = (await api(`/api/v1/elections?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`)).elections; updateElectionList(); }
    catch (error) { toast('Could not filter elections', error.message, 'error'); }
  }
  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) return;
  const action = actionNode.dataset.action;
  if (action === 'toggle-menu') {
    const open = mainNav.classList.toggle('open');
    actionNode.setAttribute('aria-expanded', String(open));
  }
  if (action === 'logout') {
    try { await api('/api/v1/auth/logout', { method: 'POST', body: {} }); } catch {}
    state.user = null;
    toast('Signed out', 'Your session has been closed.', 'success');
    navigate('/');
  }
  if (action === 'apply-eligibility') {
    try {
      await api('/api/v1/eligibility/apply', { method: 'POST', body: { note: 'Synthetic development account applying for eligibility review.' } });
      state.user.eligibilityStatus = 'PENDING';
      toast('Application submitted', 'The application is awaiting issuer review.', 'success');
      renderRoute();
    } catch (error) { toast('Application not submitted', error.message, 'error'); }
  }
  if (action === 'review-eligibility') {
    const decision = actionNode.dataset.review;
    const applicationId = actionNode.dataset.id;
    const title = decision === 'approve' ? 'Approve eligibility review?' : 'Reject eligibility review?';
    const copy = decision === 'approve' ? 'This records an issuer decision only. It does not issue a cryptographic credential in the baseline build.' : 'The application will be marked rejected in the local application record.';
    const confirmed = await askConfirm(title, copy, decision === 'approve' ? 'RECORD APPROVAL' : 'RECORD REJECTION');
    if (!confirmed) return;
    try {
      const data = await api(`/api/v1/eligibility/applications/${encodeURIComponent(applicationId)}/${decision}`, { method: 'POST', body: {} });
      toast('Review recorded', data.warning || `Application marked ${decision}d.`, 'success');
      renderAdmin();
    } catch (error) { toast('Review failed', error.message, 'error'); }
  }
  if (action === 'sync-election-chain') {
    const button = actionNode;
    button.disabled = true;
    const previous = button.innerHTML;
    button.textContent = 'READING CONTRACT…';
    try {
      const result = await api(`/api/v1/admin/elections/${encodeURIComponent(button.dataset.id)}/sync-chain`, { method: 'POST', body: {} });
      toast('Chain state synchronized', result.warning || 'The application now reflects the contract-reported state.', 'success');
      renderElectionManage(button.dataset.id);
    } catch (error) {
      setFeedback('sync-chain-feedback', error.message);
      toast('Chain sync unavailable', error.message, 'error');
      button.disabled = false;
      button.innerHTML = previous;
    }
  }
  if (action === 'refresh-network') {
    toast('Refreshing', 'Querying configured RPC endpoints.', '');
    renderNetwork();
  }
  if (action === 'review-ballot') {
    const form = document.getElementById('ballot-form');
    const selected = form?.querySelector('input[name="optionId"]:checked');
    const note = document.getElementById('ballot-feedback');
    if (!selected) return setFeedback('ballot-feedback', 'Select an option before reviewing the ballot.');
    const label = selected.closest('.vote-option')?.querySelector('strong')?.textContent || selected.value;
    if (note) note.innerHTML = `<div class="verify-result"><h3>Selection preview</h3><p>Your current selection is <strong>${esc(label)}</strong>. It has not been submitted, encrypted or recorded.</p></div>`;
  }
  if (action === 'export-audit') {
    if (!state.auditData) state.auditData = await api('/api/v1/audit').catch(()=>null);
    if (!state.auditData) return toast('Export unavailable', 'Could not load audit data.', 'error');
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), source: 'LOCAL_APPLICATION_AUDIT_LOG', ...state.auditData }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'civicchain-public-audit.json'; link.click(); URL.revokeObjectURL(link.href);
  }
});

appRoot.addEventListener('submit', event => {
  const form = event.target;
  if (!form.matches('form')) return;
  event.preventDefault();
  handleSubmit(form);
});

function updateElectionList() {
  const container = document.getElementById('election-list');
  if (!container) return;
  container.innerHTML = state.elections.length ? state.elections.map(electionCard).join('') : emptyState('No matching elections','Try a different search term or status filter.');
}

let pendingConfirmResolver = null;
function askConfirm(title, copy, confirmText) {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-copy').textContent = copy;
  document.getElementById('dialog-confirm').textContent = confirmText;
  return new Promise(resolve => {
    pendingConfirmResolver = resolve;
    dialog.showModal();
  });
}
document.getElementById('confirm-dialog').addEventListener('close', () => {
  const confirmed = document.getElementById('confirm-dialog').returnValue === 'confirm';
  if (pendingConfirmResolver) pendingConfirmResolver(confirmed);
  pendingConfirmResolver = null;
});

document.addEventListener('input', event => {
  if (event.target.id !== 'election-search') return;
  clearTimeout(event.target._searchTimer);
  event.target._searchTimer = setTimeout(async () => {
    const status = document.querySelector('.filter-button.active')?.dataset.status || 'ALL';
    try { state.elections = (await api(`/api/v1/elections?status=${encodeURIComponent(status)}&q=${encodeURIComponent(event.target.value)}`)).elections; updateElectionList(); }
    catch (error) { toast('Search unavailable', error.message, 'error'); }
  }, 180);
});

window.addEventListener('popstate', () => { renderHeader(); renderRoute(); });
document.addEventListener('click', event => {
  const link = event.target.closest('a[href]');
  if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  if (url.pathname === location.pathname && url.hash) return;
  if (url.pathname !== '/api/' && !url.pathname.startsWith('/assets/') && !url.pathname.endsWith('.svg')) {
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  }
});

async function bootstrap() {
  try {
    const [session, overview, elections] = await Promise.all([api('/api/v1/session'), api('/api/v1/overview'), api('/api/v1/elections')]);
    state.user = session.user;
    state.overview = overview;
    state.network = overview.network;
    state.crypto = overview.cryptography;
    state.elections = elections.elections;
  } catch (error) {
    appRoot.innerHTML = `<div class="page-content"><div class="container">${emptyState('CivicChain API is unavailable', 'Start the local Node server and reload this page. The interface will not invent backend records.', '<button class="button button-dark" data-action="retry-bootstrap">RETRY CONNECTION ↻</button>')}</div></div>`;
    return;
  }
  renderHeader();
  await renderRoute();
}

appRoot.addEventListener('click', event => {
  const retry = event.target.closest('[data-action="retry-bootstrap"]');
  if (retry) bootstrap();
});

bootstrap();
