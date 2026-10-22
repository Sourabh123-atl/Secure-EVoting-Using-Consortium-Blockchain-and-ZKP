# Cryptography and zero-knowledge design

## Eligibility relation in the supplied circuit

The Circom source in `circuits/eligibility.circom` expresses a relation using Poseidon hashing:

1. `leaf = Poseidon(secret)`.
2. The leaf is folded through a fixed-depth-four Merkle path, with each path index constrained to 0 or 1.
3. The computed path root must equal the public `root` input.
4. The nullifier is derived as `Poseidon(secret, electionId, domainSeparator)`.
5. `root` and `electionId` are declared public inputs; `nullifier` is a public output. In a `snarkjs` proof package the public signals include all public inputs and outputs, in the circuit's compiled public-signal order.

The domain separator currently appears as a fixed circuit constant. Treat changes to it, the tree depth, field encoding, Poseidon parameters or public-signal order as a new circuit/protocol version and regenerate every dependent artifact. Never use a proof or verification key with an incompatible circuit build.

## What the proof establishes

Given a correctly compiled circuit, correctly generated trusted-setup artifacts and an authentic approved Merkle root, a valid proof establishes that the prover knows a secret whose Poseidon commitment is a member of the tree and that the public nullifier was correctly computed from that secret and election identifier under the circuit relation.

The proof does **not** by itself establish that the issuer approved the right human, that the voter's device displayed the intended option, that the encrypted ballot contains a permitted selection, that the tally is correct, that the election is coercion-resistant, or that the environment is operationally secure.

## Tree and credential tools

- `scripts/make-credential.js` creates a random synthetic secret file and corresponding public Poseidon commitment.
- `scripts/build-eligibility-tree.js` builds a depth-four tree and writes the root metadata and a private tree/path file. The fixed depth allows up to 16 leaves in this example.
- `scripts/prepare-witness.js` and `scripts/validate-witness.js` prepare the private witness for a given numeric election ID.
- `scripts/prove-eligibility.js` uses the configured `snarkjs` artifacts to generate a Groth16 proof package.
- `scripts/verify-proof.js` runs actual proof verification with the exported verification key.

Private secret and witness files must remain with the credential holder. The commitment file is public input to the issuer process; do not send the private secret or full witness to the issuer.

## Groth16 setup

`scripts/setup-zk.sh` compiles the circuit, creates a local powers-of-tau contribution, runs the Groth16 setup, contributes to the proving key, exports a verification key and generates a Solidity verifier source. This is a reproducible local development exercise, not an audited multi-party ceremony. The entropy is locally generated, and no independent ceremony participants or public transcript review are configured. Do not describe these artifacts as production-grade trust material.

Keep the circuit source, compiler version, `r1cs`, witness generator, proving key, verification key, generated Solidity verifier, artifact hashes and build transcript versioned together. Do not commit production proving secrets, private keys or user witness data. Build artifacts are excluded by `.gitignore`.

## Ballot encryption boundary

When the optional public key is generated, the browser-side helper uses RSA-OAEP with SHA-256 to encrypt a compact choice payload. This is illustrative confidentiality for a demo payload only. It does not support homomorphic aggregation, a threshold decryption process, ballot-validity proofs, mixnets, coercion resistance or a publicly verifiable tally. The private key is a local development artifact and is not delivered by the web API.

A stronger design should select and review an established homomorphic election scheme, define exact option encoding, prove that each ciphertext encodes a valid ballot, aggregate encrypted votes, distribute decryption authority across independent trustees, verify decryption shares and publish a reproducible tally proof. Do not simply replace the algorithm name without updating the protocol and its threat model.

## Validation requirements before calling proof support operational

- Recompile the circuit from source and compare artifact hashes.
- Generate a proof from a known valid synthetic secret and membership path.
- Reject invalid secret, path, root, election ID, field encoding and path direction.
- Reject tampered proof bytes and modified public signals.
- Test wrong circuit/verification-key versions.
- Verify with both `snarkjs` and the generated Solidity verifier.
- Add integration tests that submit a genuine proof to a real locally deployed verifier contract.
- Independently review the circuit constraints for unintended witnesses and public input ordering.

The baseline server returns verifier-unavailable and rejects a vote when artifacts or configuration are missing. No mock verifier is used by the website or its API.
