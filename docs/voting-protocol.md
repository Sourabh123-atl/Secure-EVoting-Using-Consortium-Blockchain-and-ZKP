# Voting protocol and election lifecycle

## Protocol phases

1. **Configure:** an authorized election administrator creates a unique ID, title, options, constituency, schedule, tally policy and a configuration commitment.
2. **Enroll eligibility:** an issuer reviews synthetic participants, obtains public credential commitments and builds an eligibility Merkle tree. Private secrets remain with credential holders.
3. **Publish root:** publish the approved root to the registry while the election is in Draft/Scheduled. Root updates are versioned and are locked after opening.
4. **Schedule/open:** validate fields and chain parameters, schedule the election, and open only within its allowed time range.
5. **Prepare ballot:** voter selects an option, reviews it, encrypts it under the election's published public parameters and provides a genuine eligibility proof with root/election/nullifier public signals.
6. **Validate:** verifier checks the proof, the public root and election ID are checked against registry state, the election must be open, and the nullifier must not already be used.
7. **Record:** the contract records the encrypted ballot and nullifier in the same state-changing transaction. A receipt is displayed only after the transaction succeeds and the configured confirmation policy is satisfied.
8. **Close:** close at end time or through a separately authorized early-close path with a nonzero reason commitment.
9. **Tally (integration boundary):** a future threshold tally pipeline aggregates encrypted ballots and obtains authorized decryption shares. Current code does not implement a cryptographically verified tally.
10. **Publish:** only after appropriate verification and governance review should a result be published. The sample contract records tally evidence commitments; it does not itself verify a tally proof.

## Nullifier uniqueness

The intended circuit computes an election-specific nullifier from a voter-held secret, election ID and a domain separator. The `VotingContract` checks `nullifierUsed[electionId][nullifier]` and marks it used in the same transaction that appends a ballot. Because EVM transaction execution is ordered, two valid calls using the same election/nullifier cannot both mutate it from unused to used successfully. This property must be tested against the deployed contract and actual verifier, not inferred from a frontend button state.

## Receipt semantics

A transaction hash proves only that a transaction can be queried on a particular chain. A successful transaction receipt proves execution success on the queried chain. A verified ballot receipt additionally needs the actual configured voting contract, correct `BallotAccepted` event decoding, matching election ID/context, ballot commitment/ciphertext hash, nullifier consistency and finality policy. Even that receipt does not prove that a compromised browser encrypted the option the voter intended. The baseline transaction verifier deliberately returns `UNVERIFIABLE` for a ballot claim until that complete decoder and event verification path exists.

## Current prototype path

The UI permits option selection and accepts a locally generated proof package. The browser encryption utility requires a generated public key. The server refuses ballot acceptance when configured ZK artifacts, contract address, signer and accessible RPC are absent or invalid. Because the initial election fixtures have no on-chain roots and the local chain is not pre-provisioned, the default demo focuses on app navigation, eligibility review, draft creation, state visibility and safe failure messages rather than pretending to cast a cryptographically valid vote.

## Privacy limitations

An encrypted ballot does not hide traffic timing, browser/IP metadata, application session metadata or the public election-specific nullifier. A permissioned ledger may expose exact transaction order. A production protocol should assess relayers or batching, minimize timestamps, isolate account identity from ballot submission and consider a formally assessed mixnet or another suitable privacy layer. The current project does not claim receipt-freeness or coercion resistance.
