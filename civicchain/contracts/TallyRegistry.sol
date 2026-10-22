// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract TallyRegistry is AccessControl {
    bytes32 public constant TALLY_EVIDENCE_PUBLISHER_ROLE = keccak256("TALLY_EVIDENCE_PUBLISHER_ROLE");

    struct TallyEvidence {
        bytes32 ciphertextAggregateCommitment;
        bytes32 proposedResultCommitment;
        bytes32 proofArtifactCommitment;
        uint64 recordedAt;
        bool exists;
    }

    mapping(uint256 => TallyEvidence) private records;

    error InvalidTallyEvidence();
    error EvidenceAlreadyRecorded(uint256 electionId);

    event TallyEvidenceRecorded(uint256 indexed electionId, bytes32 aggregateCommitment, bytes32 proposedResultCommitment, bytes32 proofArtifactCommitment, uint64 recordedAt);

    constructor(address administrator) {
        _grantRole(DEFAULT_ADMIN_ROLE, administrator);
        _grantRole(TALLY_EVIDENCE_PUBLISHER_ROLE, administrator);
    }

    function recordTallyEvidence(
        uint256 electionId,
        bytes32 ciphertextAggregateCommitment,
        bytes32 proposedResultCommitment,
        bytes32 proofArtifactCommitment
    ) external onlyRole(TALLY_EVIDENCE_PUBLISHER_ROLE) {
        if (electionId == 0 || ciphertextAggregateCommitment == bytes32(0) || proposedResultCommitment == bytes32(0) || proofArtifactCommitment == bytes32(0)) revert InvalidTallyEvidence();
        if (records[electionId].exists) revert EvidenceAlreadyRecorded(electionId);
        records[electionId] = TallyEvidence(ciphertextAggregateCommitment, proposedResultCommitment, proofArtifactCommitment, uint64(block.timestamp), true);
        emit TallyEvidenceRecorded(electionId, ciphertextAggregateCommitment, proposedResultCommitment, proofArtifactCommitment, uint64(block.timestamp));
    }

    function getTallyEvidence(uint256 electionId) external view returns (TallyEvidence memory) {
        return records[electionId];
    }
}
