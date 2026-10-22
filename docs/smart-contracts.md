# Smart-contract design

## Contracts

### `ElectionRegistry.sol`

Uses OpenZeppelin `AccessControl` and separate election-admin, credential-issuer and tally-trustee roles. It records a schedule and configuration commitment; publishes a nonzero eligibility root with a monotonically increasing version; enforces state transitions; prevents root updates after the draft/scheduled phase; and exposes getters used by the ballot contract. Early close requires a nonzero reason commitment. `recordTallyEvidence` changes the state to `TallyEvidenceRecorded` and emits commitments, not a claim that a cryptographic tally proof has been verified. Result publication is a separate administrator action.

The contract does not include a separate multi-party governance/voting module. `DEFAULT_ADMIN_ROLE` can grant roles and must be protected with a local test key in this academic setup.

### `VotingContract.sol`

Checks that the registry reports the election open, that the encrypted ballot is nonempty, and that public signals match the accepted root, numeric election ID and nonzero nullifier. It invokes the verifier interface and then sets the per-election nullifier-used mapping and stores the ciphertext in a single transaction. The order of these operations ensures a failed verifier call does not consume the nullifier. `BallotAccepted` includes the election ID, nullifier, index, ballot commitment and ciphertext hash.

The on-chain nullifier is intentionally public to support duplicate checking, but public values and exact transaction timing may create correlation risk. The current contract does not validate encrypted ballot selection range; a genuine ballot-validity proof is a separate required protocol component.

### `TallyRegistry.sol`

Stores references/commitments for tally evidence. It is not a tally engine, threshold decryption protocol or proof verifier. Evidence being recorded must not be presented as cryptographically verified without a separate validator.

### `AcceptingVerifierForTests.sol`

A deliberately permissive test mock. It must never be deployed. It permits contract tests to focus on access control, state and duplicate-nullifier invariants; it gives no evidence about proof soundness.

## Deployment notes

The generated `Groth16Verifier.sol` is produced by the actual `snarkjs` setup workflow and is not checked into the repository. `scripts/deploy-contracts.js` refuses to deploy if generated verifier source is missing. Use a locally managed development chain, generated addresses and distinct disposable keys. This repository does not supply a QBFT genesis file or validator keys.

## Security review checklist

- Compile with a pinned compiler and dependencies.
- Run the contract test suite and actual verifier integration tests.
- Confirm the generated verifier corresponds byte-for-byte in logic to the current circuit artifact.
- Check role grants and admin-key protection.
- Test reverts for invalid states, wrong roots/IDs, duplicate nullifiers, failed proof and early close without reason commitment.
- Review gas/resource bounds for ciphertext storage and proof verification.
- Run a static analyzer such as Slither when available and track every finding.
- Verify that public events leak no unexpected identity or plaintext choice data.
- Audit upgrade and emergency governance before any persistent network use.
