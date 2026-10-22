# CivicChain

**Secure E-Voting System Using Consortium Blockchain and Zero-Knowledge Proofs**

> Private by design. Verifiable by everyone.

CivicChain is an academic research prototype for exploring a privacy-conscious e-voting architecture. The frontend follows a restrained, cinematic navy design inspired by the supplied visual reference: fine typography, open spacing, minimal navigation and mountain silhouettes. The application is explicit about the difference between a configured cryptographic/network component and a working one.

**Important:** This is not a production election system and must not be used for binding public, governmental, corporate or other high-stakes elections. Blockchain use and zero-knowledge proofs do not on their own establish voter eligibility, coercion resistance, operational integrity, fairness or end-to-end verifiability.

## What is in this repository

- Responsive browser application with public home, election directory and detail pages, login and registration, voter workspace, administrator dashboard, draft-creation form, eligibility-review queue, network status page, auditor view, result list, receipt view and public transaction verifier.
- Node.js HTTP API requiring no runtime packages for the baseline workflows.
- Registration and login with `scrypt` password hashing, an HTTP-only `SameSite=Strict` session cookie, server-side role checks, login rate limiting and safe event logging. A local-only password-reset flow uses a private mock-mail outbox and single-use 15-minute tokens; it sends no real email.
- Persisted, local-only JSON data store for the baseline app. All seeded elections and sample results are marked as development fixtures.
- Solidity contracts for governed election lifecycle, proof-gated ballot acceptance and a non-verified tally-evidence registry.
- Circom source for an eligibility Merkle-membership and election-specific nullifier proof using Poseidon and Groth16.
- CLI utilities to generate a voter-controlled secret/commitment, build an eligibility tree, prepare a private witness, generate a real Groth16 proof package, verify it, and manage a local demo encryption key.
- An optional EVM adapter that only accepts ballots when real proof artifacts and a deployed contract are configured.
- API smoke tests and contract tests (the latter use a mock verifier only to test contract state/duplicate-nullifier behavior and are not cryptographic proof tests).
- Architecture, threat model, voting protocol, cryptography, smart-contract notes, API reference, setup, testing, limitations, acceptance report and university-style project report; proposed PostgreSQL schema.

## Current implementation boundary

The baseline UI, API, authentication, registration, election listing, election draft creation, role checks, eligibility application/review and network-status reporting are implemented. Real ballot acceptance is deliberately blocked by default because the local repository has not been configured with a valid eligibility root, matching Groth16 artifacts and a deployed permissioned chain/contract. It does not fall back to a fake proof or in-memory ledger.

The optional ballot-encryption utility uses browser-side RSA-OAEP/SHA-256 for the demonstration payload. This is **not homomorphic encryption**, does not provide threshold decryption, and is not suitable as the final cryptographic ballot scheme. The private key must be kept offline from the application server; the helper creates a local development key pair only. A production-quality protocol should replace this adapter with an audited, election-specific homomorphic encryption and threshold-tally construction.

The voter eligibility review endpoint does not itself issue a cryptographic credential. Credential and eligibility-tree operations are available as local CLI utilities so their trust boundary stays explicit. The app's admin sync endpoint reads on-chain election state; it does not fabricate contract transactions.

## Requirements

Baseline site/API:

- Node.js 20+ (tested with Node 22 in the authoring environment).
- No npm dependency installation is required for `npm start` or `npm test`.

Optional ZK/contract tools:

- npm dependencies from `package.json` (`snarkjs`, `circom2`, `circomlib`, `circomlibjs`, Hardhat, ethers and OpenZeppelin Contracts).
- Docker/Hyperledger Besu if you want to add the multi-validator network described in the protocol documents. The repository does not contain a pre-configured, bootable four-validator genesis/key bundle because validator identity and genesis material must be generated and protected for the specific demo environment.

## Run the web app

From the project directory:

```bash
npm start
```

Or, without using npm scripts:

```bash
node server.js
```

Open <http://localhost:4173>.

The first startup creates `data/db.json` with clearly identified, synthetic development fixtures. The account data and local audit log are intended for a single local demonstration process, not multi-instance or production use.

### Seeded accounts

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@civicchain.local` | `CivicChainDemo!26` |
| Voter | `voter@civicchain.local` | `CivicChainDemo!26` |
| Auditor | `auditor@civicchain.local` | `CivicChainDemo!26` |

These credentials are public development fixtures. They are seeded only when `NODE_ENV` is not `production`; a fresh production-mode store starts without accounts or election fixtures. On loading an existing store in production mode, any active account still using the published demo password is disabled. A newly registered user always receives the `VOTER` role; privileged roles cannot be chosen in the registration form.

### Environment variables

Copy `.env.example` to `.env` and change values only when configuring an optional adapter. The server reads the local `.env` file without a third-party parser. Leaving the blockchain/ZK variables empty is the expected baseline state. When configuration is missing, the application displays the component as not configured and refuses to claim acceptance.

Key variables:

- `PORT`: HTTP server port (default `4173`).
- `CIVICCHAIN_DATA_DIR`: optional path for local JSON persistence (used by the test suite to isolate data).
- `BLOCKCHAIN_RPC_URL`: JSON-RPC endpoint for a running EVM network.
- `ELECTION_REGISTRY_ADDRESS`, `VOTING_CONTRACT_ADDRESS`: deployed contract addresses.
- `BLOCKCHAIN_ADMIN_PRIVATE_KEY`: optional registry configuration signer for CLI scripts.
- `BLOCKCHAIN_SUBMITTER_PRIVATE_KEY`: optional ballot-transaction signer.
- `ZK_VERIFICATION_KEY_PATH`, `ZK_WASM_PATH`, `ZK_ZKEY_PATH`: matching, generated Groth16 artifacts.
- `BALLOT_ENCRYPTION_PUBLIC_KEY_PATH`: public key used by the browser encryption helper.
- `VALIDATOR_RPC_URLS`: comma-separated validator RPC endpoints for status observations.

The app deliberately does not ship real keys. Keys in a local research environment should be rotated and treated as disposable.

## Run the tests

```bash
npm test
```

This executes the dependency-free API integration tests. They start a temporary server with an isolated data directory and verify health, static delivery, seeded fixtures, role protection, registration, password login/session cookies, election draft creation, blocked lifecycle transitions, blocked proof verification and honest transaction-verification states.

Optional contract tests:

```bash
npm install
npm run contracts:compile
npm run contracts:test
```

The contract test mock always accepts a proof and exists solely to test state/role/nullifier invariants. It must never be deployed as the election verifier. Real circuit-proof tests require the generated verifier artifacts from the ZK setup step.

## Optional cryptography workflow

Install the declared dependencies in a development environment:

```bash
npm install
npm run zk:setup
npm run keys:generate
```

The ZK setup compiles `circuits/eligibility.circom`, generates a local powers-of-tau contribution and circuit-specific Groth16 artifacts, exports the verification key and writes `contracts/Groth16Verifier.sol`. This is a **local development setup**, not an independently audited multi-party ceremony. Do not treat its parameters as production-grade trusted setup material.

### Generate a synthetic private credential

```bash
node scripts/make-credential.js .data/alex-credential-private.json .data/alex-credential-commitment.json
```

Keep the private credential file under the voter's control. Submit only the public commitment to the issuer. The public commitment is a Poseidon hash of the secret; the issuer can add it to the eligibility set without receiving the secret.

Build a tree from a JSON list of commitment strings or objects containing `commitment`:

```json
{
  "commitments": ["12345", "67890"]
}
```

```bash
node scripts/build-eligibility-tree.js .data/commitments.json .data/eligibility-tree-private.json data/eligibility-root.json
```

This fixed-depth example supports up to 16 commitments. It writes a public root metadata file and a private tree/path file. Protect the private file; Merkle paths reveal set structure and should be distributed carefully.

Prepare a witness for the actual numeric on-chain election ID:

```bash
node scripts/prepare-witness.js .data/alex-credential-private.json .data/eligibility-tree-private.json 20261022 .data/witness.json
```

The election ID must match the on-chain numeric ID, not the local text ID such as `campus-2026`. Generate a real proof package and independently verify it:

```bash
node scripts/prove-eligibility.js .data/witness.json .data/proof-package.json
node scripts/verify-proof.js .data/proof-package.json
```

The output package includes the Groth16 proof and public signals, not the private witness. The browser's ballot form accepts this proof package, encrypts the selection client-side, and submits only when the configured verifier, matching root, public key and contract/network preconditions are available. The initial seeded elections do not have a chain root and are not ready for on-chain voting.

## Optional contract workflow

1. Start a permissioned EVM network and deploy contracts in an environment appropriate for a development test.
2. Run `npm run contracts:compile` after `npm run zk:setup` has generated `contracts/Groth16Verifier.sol`.
3. Deploy with `npm run contracts:deploy:local` against a supported local RPC endpoint. The script writes addresses to `data/deployed-contracts.json`.
4. Set the addresses and appropriate development-only keys in `.env`.
5. Create an election draft in the administrator interface, configure a future time window, collect synthetic public commitments and generate the eligibility root.
6. Register that election/root on-chain using `node scripts/register-election.js <local-election-id> [eligibility-root.json]`.
7. Use `node scripts/set-election-state.js <local-election-id> open` when the configured start window permits. Use `close` after the closing policy is satisfied (the contract requires a reason commitment for early close).
8. In the admin election management panel, select **Sync from contract**. The panel reads contract state; it does not make the transaction itself.

`register-election.js` requires `BLOCKCHAIN_RPC_URL`, `ELECTION_REGISTRY_ADDRESS`, `BLOCKCHAIN_ADMIN_PRIVATE_KEY`, a matching draft in `data/db.json`, a future start time, and an eligibility root file. A deployer/admin private key is sensitive; use only disposable local test keys.

## Main routes

| Route | Purpose |
|---|---|
| `/` | Cinematic public homepage and system overview |
| `/login`, `/register` | Authentication and account creation |
| `/forgot-password`, `/reset-password` | Development-only mock-mail account recovery |
| `/privacy` | Privacy notice and retention/metadata explanation |
| `/elections` | Searchable election directory |
| `/elections/:id` | Election detail and options |
| `/elections/:id/vote` | Ballot interface, proof-package upload and readiness checks |
| `/vote-receipt/:reference` | Public-safe receipt detail after actual contract acceptance |
| `/verify-ballot` | Query a transaction against a configured RPC |
| `/results` | Published result records, with fixture status made explicit |
| `/voter` | Voter account/eligibility workspace |
| `/admin` | Admin dashboard and eligibility-review workflow |
| `/admin/elections/create` | Draft creation |
| `/admin/elections/:id` | Election management and chain-state sync |
| `/network` | Actual configured RPC and validator observations |
| `/auditor` | Public metadata and local audit-event view |
| `/docs` | In-app protocol/limitations reference |

## Repository structure

```text
civicchain/
├── server.js
├── package.json
├── .env.example
├── public/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── assets/
├── contracts/
│   ├── ElectionRegistry.sol
│   ├── VotingContract.sol
│   ├── TallyRegistry.sol
│   └── mocks/AcceptingVerifierForTests.sol
├── circuits/eligibility.circom
├── scripts/
├── database/schema.sql
├── tests/
└── docs/
```

## Important security limitations

- Local file persistence is not PostgreSQL, not transactional across multiple server instances, and not a suitable production data store.
- The credential review workflow is not yet wired to browser-held secret enrollment and contract-managed credential revocation.
- The supplied circuit proves eligibility-set membership and nullifier computation, not ballot-choice validity. The contract also does not provide a full encrypted tally or proof of correct decryption.
- The RSA-OAEP helper is an encryption boundary, not a homomorphic election protocol; tallying is not implemented as a verified end-to-end threshold process.
- A browser UI is not independent verification. The receipt verifier currently reports transaction-level facts and intentionally refuses to declare a ballot-specific event independently verified when the event decoder/protocol proof path is not complete.
- The local application audit file can be altered by a machine operator. On-chain event verification is required for stronger evidence.
- The local password-reset mock mail is not an email delivery integration; use only synthetic demo accounts.
- There is no four-validator genesis/private-key bundle checked into this repository. A consortium deployment must generate separate validator identities and configure a valid QBFT genesis for its own environment.
- The project has not been independently audited, formally verified, or assessed against election-specific law or coercion-resistance requirements.

See `docs/acceptance-report.md` for the current implementation status and `docs/limitations.md` for the residual-risk assessment.

## Docker

A baseline app image and Compose file are provided:

```bash
docker compose up --build
```

The app is available at <http://localhost:4173>, with its local JSON data in the `civicchain-data` named volume. The image itself has no required npm runtime dependencies. The optional `postgres-scaffold` profile can start a PostgreSQL service for planning the migration:

```bash
docker compose --profile postgres-scaffold up --build
```

**Important:** the running API still uses JSON persistence; the PostgreSQL service is not wired into it. The Compose file does not start Besu validators because a correct QBFT genesis and validator identities must be generated for the target lab. Docker build/run was not executed in the authoring environment, so the files are provided but not reported as tested. Do not expose the development configuration publicly.

## Password recovery and privacy notice

The local demo implements a single-use, 15-minute password reset token and invalidates existing sessions after a successful change. Since no external mail credentials/provider are configured, requests for known local accounts are written to `data/mock-mail-outbox.json` with file permissions restricted to the local process owner. Open the reset link in that file on the development machine. The app does not return the token in the API response and does not send email. This mock adapter is disabled under `NODE_ENV=production`; deployers must connect an actual secure email-delivery integration before enabling real account recovery.

The `/privacy` page describes what the current prototype stores and the remaining metadata leakage concerns.
