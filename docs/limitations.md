# Limitations and prohibited claims

## Current implementation status

| Area | Status | Interpretation |
|---|---|---|
| Responsive visual UI and route handling | Implemented | Client routes are rendered by the static SPA |
| Basic account registration/login | Implemented for local demo | Local JSON store; in-memory session map; synthetic fixtures |
| Password hashing and cookie session | Implemented baseline controls | Not a full production identity service; no MFA or secure recovery email workflow |
| Role gates and eligibility-review UI/API | Partial | Basic roles/review queue; review does not issue a ZK credential |
| Election listing and draft creation | Implemented | Seeded records are explicit fixtures; contract publication needs adapter |
| Circom eligibility circuit source and CLI | Source included, not built by default | Real artifacts depend on optional toolchain and independent review |
| Generated Solidity Groth16 verifier | Generated locally only | Not committed; requires reproducible local setup and proof integration test |
| EVM ballot contract | Source included | Needs generated verifier and deployed registry; contract tests use a test-only mock |
| Consortium blockchain | Not packaged as a bootable four-validator network | No QBFT genesis or validator identities included |
| Browser ballot encryption | Optional RSA-OAEP utility | Not homomorphic; not a final election encryption scheme |
| Ballot validity proof | Not implemented | Circuit proves eligibility membership/nullifier only |
| Threshold decryption / tally proof | Not implemented | Tally records are evidence references, not a verified tally protocol |
| End-to-end receipt verifier | Partial | Transaction lookup works when RPC exists; ballot event/proof context not fully decoded |
| PostgreSQL persistence | Schema proposal only | Baseline persistence is JSON, single-process local demo |
| Formal audit, legal review, coercion resistance | Not implemented | No high-stakes election use |

## Claims that must not be made

Do not describe this prototype as unhackable, fully anonymous, coercion-resistant, fair by construction, production-ready, independently audited, mathematically guaranteed, or suitable for binding elections. Do not say a ballot is verified because a UI animation completed, a transaction returned a hash, a fixture says `OPEN`, an admin uploaded JSON, or the database contains a result record.

## Key residual gaps

1. Replace the local JSON store with a migrated relational database and robust concurrency controls.
2. Harden authentication, MFA, recovery, session storage, global rate limits and operational monitoring.
3. Complete credential issuance and revocation governance.
4. Complete a repeatable consortium-network deployment and validate QBFT assumptions.
5. Audit the circuit, setup ceremony, public input order and generated verifier.
6. Replace demo RSA encryption with reviewed homomorphic encryption, ballot-validity proofs and threshold decryption.
7. Implement public event/receipt verification and an independent tally verification procedure.
8. Build threat-driven integration tests, audit contracts and dependencies, test accessibility and conduct external reviews.
9. Develop a protocol for coercion resistance, device compromise and metadata protection if those are required goals.

The safest current use is a controlled academic demonstration of the design boundaries, app workflows and a locally reproduced proof experiment after setup. It is not suitable for conducting a real election.
