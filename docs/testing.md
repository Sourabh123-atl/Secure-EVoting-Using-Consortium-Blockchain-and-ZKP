# Testing strategy and current test coverage

## Baseline automated tests

Run:

```bash
npm test
```

The dependency-free test suite starts an isolated server and checks:

1. Static home page and health endpoint.
2. Labeling of seeded demo elections as fixtures.
3. Unauthorized access rejection on admin dashboard.
4. Registration validation and duplicate email rejection.
5. HTTP-only, SameSite session cookie and authenticated session lookup.
6. Authorized draft creation while lifecycle publication stays unavailable without a chain adapter.
7. Ballot rejection when real ZK artifacts are missing.
8. `UNVERIFIABLE` status when no RPC endpoint is configured.

## Contract tests

Run after installing the optional dependency set and generating a verifier contract:

```bash
npm run contracts:compile
npm run contracts:test
```

`tests/contracts/ElectionVoting.test.js` tests role/state behavior and duplicate-nullifier rejection. It deploys `AcceptingVerifierForTests`, which always returns true. It is not a cryptographic test and must never be used in a real deployment. The tests cannot establish proof soundness until integration tests use the genuine generated Groth16 verifier and an actual proof from the compiled circuit.

## Required additional integration tests

- Generate a genuine witness/proof with a valid eligible commitment and verify it in `snarkjs` and Solidity.
- Reject modified proof, root, election ID, nullifier, domain separator and circuit version.
- Verify a root cannot change once the election opens.
- Test duplicate submissions in sequential and competing concurrent transactions.
- Verify a contract event using the deployed contract ABI and ensure the receipt matches an actual successful transaction.
- Simulate RPC timeout, transaction replacement, validator quorum loss and server restart.
- Test no private witness, selection, private key or recovery token is logged or returned.
- Run static analysis and browser accessibility checks.
- Exercise the full lifecycle, including closing, tally verification with a real protocol, publication and audit export.

## Last verified by this package build

- `node --check` succeeds for the server, browser script and the checked-in JavaScript scripts.
- `npm test` passes the ten baseline API tests in the authoring environment.
- Optional contract compilation/tests and Circom/Groth16 setup were not executed because the corresponding optional npm packages/tools were not installed in the authoring runtime. Do not infer those results from the baseline tests.

## Docker checks

`Dockerfile` and `docker-compose.yml` are included. Neither `docker build` nor `docker compose up` was executed in the authoring environment, so treat Docker behavior as unverified until the commands succeed on the target host. The `postgres-scaffold` profile does not change application persistence; the API still uses JSON until a PostgreSQL adapter is implemented.
