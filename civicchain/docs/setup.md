# Setup and local demonstration

## Baseline web application

Requirements: Node.js 20 or newer. No `npm install` is required for the baseline app or API tests.

```bash
npm start
# open http://localhost:4173
```

The app creates a local `data/db.json` on first run. Use `CIVICCHAIN_DATA_DIR=/path/to/local-demo-data` to choose another location. Do not share real voter information or treat that store as a secure multi-user deployment.

Development accounts (all synthetic):

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@civicchain.local` | `CivicChainDemo!26` |
| Voter | `voter@civicchain.local` | `CivicChainDemo!26` |
| Auditor | `auditor@civicchain.local` | `CivicChainDemo!26` |

Do not use these accounts or credentials in a network reachable by other people.

## Optional circuit and contract tooling

Install Node dependencies in a development environment first:

```bash
npm install
npm run zk:setup
npm run keys:generate
```

The ZK setup requires a compatible Circom compiler, `circomlib`, `circomlibjs` and `snarkjs` versions. It performs a local development setup and produces files under `circuits/build/` plus generated `contracts/Groth16Verifier.sol`. The artifacts are intentionally ignored by Git.

Prepare synthetic commitments, build the private tree, generate witness, prove and verify according to `../README.md`. A proof is bound to the exact circuit and numeric election identifier. Keep private credential and witness files out of the public web directory and version control.

To compile and test contracts:

```bash
npm run contracts:compile
npm run contracts:test
```

The contract tests require Hardhat and OpenZeppelin packages. Their mock verifier is test-only. After compiling the generated verifier, start a local EVM RPC and configure `.env` using disposable local keys. Deploying the current contracts is not equivalent to running a permissioned consortium or a complete election protocol.

## Optional Besu / consortium network

This repository does not include a validated QBFT genesis, validator keystores or a four-node Compose bundle. Generate distinct validator identities and a network-specific genesis using the Besu version and documented QBFT tooling chosen for the research environment. Restrict RPC ports, avoid exposing admin APIs, persist data volumes and document node membership and failure assumptions. Confirm the intended quorum/finality behavior with fault-injection tests before describing network health as operational.

## Environment variables

See `.env.example`. Keep secrets in a private local environment file; do not commit it. Use separate development/test values for chain ID, contract addresses, RPC endpoints, ballot private keys and admin signers. Set `BLOCKCHAIN_RPC_URL`, verifier artifact paths and deployed contract addresses only when those components actually exist. A variable being present is not proof that the configured service is trustworthy or healthy.

## Reset

Stop the app, back up any local demo state you need, and remove the chosen data directory to reinitialize the seeded fixture store. Never use this reset procedure on valuable user data. Restarting the server revokes in-memory sessions.
