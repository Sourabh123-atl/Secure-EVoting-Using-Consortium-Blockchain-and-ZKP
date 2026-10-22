// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IEligibilityVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[3] calldata publicSignals
    ) external view returns (bool);
}

interface IElectionRegistryView {
    function isElectionOpen(uint256 electionId) external view returns (bool);
    function eligibilityRoot(uint256 electionId) external view returns (uint256);
}

contract VotingContract is AccessControl {
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    IElectionRegistryView public immutable electionRegistry;
    IEligibilityVerifier public immutable eligibilityVerifier;

    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;
    mapping(uint256 => bytes[]) private encryptedBallots;

    error ElectionNotOpen(uint256 electionId);
    error InvalidPublicSignals();
    error DuplicateNullifier(uint256 electionId, uint256 nullifier);
    error InvalidEligibilityProof();
    error EmptyEncryptedBallot();
    error BallotIndexOutOfRange();

    event BallotAccepted(
        uint256 indexed electionId,
        uint256 indexed nullifier,
        uint256 indexed ballotIndex,
        bytes32 ballotCommitment,
        bytes32 ciphertextHash
    );

    constructor(address administrator, address registry, address verifier) {
        _grantRole(DEFAULT_ADMIN_ROLE, administrator);
        _grantRole(GOVERNANCE_ROLE, administrator);
        electionRegistry = IElectionRegistryView(registry);
        eligibilityVerifier = IEligibilityVerifier(verifier);
    }

    function submitBallot(
        uint256 electionId,
        bytes calldata encryptedBallot,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[3] calldata publicSignals
    ) external returns (uint256 ballotIndex) {
        if (!electionRegistry.isElectionOpen(electionId)) revert ElectionNotOpen(electionId);
        if (encryptedBallot.length == 0) revert EmptyEncryptedBallot();
        uint256 root = electionRegistry.eligibilityRoot(electionId);
        uint256 nullifier = publicSignals[2];
        if (publicSignals[0] != root || publicSignals[1] != electionId || nullifier == 0) revert InvalidPublicSignals();
        if (nullifierUsed[electionId][nullifier]) revert DuplicateNullifier(electionId, nullifier);
        if (!eligibilityVerifier.verifyProof(a, b, c, publicSignals)) revert InvalidEligibilityProof();

        nullifierUsed[electionId][nullifier] = true;
        ballotIndex = encryptedBallots[electionId].length;
        encryptedBallots[electionId].push(encryptedBallot);
        bytes32 commitment = keccak256(abi.encodePacked(electionId, nullifier, encryptedBallot));
        emit BallotAccepted(electionId, nullifier, ballotIndex, commitment, keccak256(encryptedBallot));
    }

    function ballotCount(uint256 electionId) external view returns (uint256) {
        return encryptedBallots[electionId].length;
    }

    function encryptedBallotAt(uint256 electionId, uint256 ballotIndex) external view returns (bytes memory) {
        if (ballotIndex >= encryptedBallots[electionId].length) revert BallotIndexOutOfRange();
        return encryptedBallots[electionId][ballotIndex];
    }
}
