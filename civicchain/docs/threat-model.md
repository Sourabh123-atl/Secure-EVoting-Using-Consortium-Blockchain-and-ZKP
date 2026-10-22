# Threat model and residual risk

## Assets

1. Voter account credentials and session secrets.
2. Voter eligibility secrets and Merkle witnesses.
3. Plaintext choices before encryption.
4. Election configuration, root and cryptographic artifact integrity.
5. Accepted encrypted ballot records and nullifier uniqueness.
6. Tally trustee key shares and result evidence.
7. Administrative authority, validator identities and audit evidence.

## Adversaries

- An unauthenticated remote user or credential-stuffing attacker.
- A registered but ineligible participant.
- A malicious or compromised ordinary administrator.
- A compromised eligibility issuer or voter device.
- A blockchain RPC operator, validator or quorum of colluding validators.
- A dishonest or unavailable tally trustee.
- A malicious dependency maintainer or operator with filesystem access.
- An observer attempting to correlate ballot timing, network metadata and public nullifiers.

## Threat register

| Threat | Likely impact | Current control / test | Residual risk and follow-up |
|---|---|---|---|
| Weak or stolen password | Account takeover | `scrypt` password hashing; login rate limit; HTTP-only cookie | Add MFA, breached-password checks, email recovery hardening and production monitoring |
| Role escalation through registration | Unauthorized admin operations | Registration creates `VOTER` only; server checks role | Add comprehensive authorization matrix tests for every privileged endpoint |
| Session token theft | Account takeover | HTTP-only, SameSite=Strict cookie; in-memory session; no localStorage token | Use TLS, rotation, shared session store, CSRF model review, CSP report-only rollout and session revocation tooling |
| Duplicate ballot | Inflated count | Contract maps `nullifierUsed[electionId][nullifier]`; state mutation is atomic in one transaction | Contract compilation and real-verifier integration must be run; test across chain/RPC failures |
| Forged eligibility proof | Unauthorized ballot | Circuit source + generated verifier boundary; ballot API refuses if verifier artifacts are unavailable | Proof artifacts are not generated in repository; circuit and verification key require independent review |
| Wrong root/election context | Cross-election replay or fake membership | Public signals checked against contract root and election ID | Requires actual verifier bytecode matching the circuit; add integration test with a genuine proof |
| Malicious eligibility root | Unauthorized or omitted voters | Registry root updates only before opening; root versions emitted | Governance and issuer are trusted; require multi-party approval, published inclusion/appeal procedure and transparency tooling |
| Administrator changes election after voting starts | Rule manipulation | Contract locks root after Draft/Scheduled and has explicit state transitions | Other off-chain configuration fields need commitments and comparison; deployment admin key compromise remains serious |
| Ciphertext tampering | Invalid ballot payload | Contract emits ciphertext hash; intended client encrypts before submission | Current RSA-OAEP is not homomorphic and there is no ballot-validity proof. Replace with reviewed scheme and validity proof |
| Linking voter to ballot | Privacy loss | No voter foreign key is added to ballot record; election-specific nullifier | Timing, IP address, wallet/signer, exact transaction order and public nullifier can leak correlations; need batch/relay/privacy analysis |
| Plaintext selection leaked by app server | Privacy loss | Browser encrypts payload when optional key exists; baseline does not store plaintext choice | A compromised client can capture the choice. RSA private key lifecycle and tally handling are not a complete threshold protocol |
| Fake result totals | Election outcome manipulation | Fixture results labelled; tally evidence contract only records commitments and does not call them cryptographically verified | No fully verified tally/decryption proof exists; publication must remain a research integration boundary |
| Compromised validator/quorum | Ledger censoring or invalid consensus | Permissioned network concept and multi-validator target | No genesis bundle is included. Consensus security depends on actual QBFT configuration, independence, quorum and key protection |
| JSON store tampering or race | Integrity/availability failure | Atomic temp-file rename for basic save; tests isolate store | Not transactional across processes; replace with PostgreSQL, migrations, backups and concurrency control |
| RPC or chain unavailable | Vote state uncertainty | API reports unreachable/pending/unverifiable instead of fabricating acceptance | Need durable transaction queue, confirmation/finality policy and safe recovery for production |
| Log leakage | Privacy compromise | Audit metadata omits passwords/proof witness/keys in normal flows | Review all logging in deployment; apply retention/access limits and structured redaction |
| Denial of service | Service unavailable | Request body limit and login rate limiting | Add global/IP/user rate limits, reverse proxy limits, timeouts and observability |
| Insecure dependency/supply chain | RCE or cryptographic weakness | Dependencies pinned by compatible version ranges, no production claim | Lockfile, dependency audit, signature/checksum process and independent review remain required |
| Coercion or vote buying | Voter forced to reveal/change choice | No coercion-resistant claim is made | The design does not provide receipt-freeness or coercion resistance; use a different rigorously assessed protocol if required |

## Security principles

- Treat browser input, proof JSON, uploaded files, transaction hashes, addresses and RPC responses as untrusted.
- Do not expose private witnesses, plaintext ballot choices, private keys, session cookies or decryption shares in logs, URLs or telemetry.
- Do not publish result totals unless the chosen tally protocol has been executed and independently verified.
- Do not infer eligibility from successful login.
- Distinguish UI status, API acceptance, transaction inclusion, execution success and the chosen chain finality threshold.

## What this threat model does not cover

It is not a formal verification, a penetration-test report, a legal assessment, a privacy-impact assessment or an election certification. Real deployment would require independent cryptographic review, contract audit, operational exercises, accessibility evaluation, applicable legal analysis and governance review.
