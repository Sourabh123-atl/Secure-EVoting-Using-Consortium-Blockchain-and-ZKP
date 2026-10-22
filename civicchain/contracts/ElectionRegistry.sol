// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ElectionRegistry is AccessControl {
    bytes32 public constant ELECTION_ADMIN_ROLE = keccak256("ELECTION_ADMIN_ROLE");
    bytes32 public constant CREDENTIAL_ISSUER_ROLE = keccak256("CREDENTIAL_ISSUER_ROLE");
    bytes32 public constant TALLY_TRUSTEE_ROLE = keccak256("TALLY_TRUSTEE_ROLE");

    enum Status { Draft, Scheduled, Open, Closed, TallyEvidenceRecorded, ResultsPublished, Archived, Cancelled }

    struct Election {
        uint64 startTime;
        uint64 endTime;
        uint256 eligibilityRoot;
        bytes32 configurationCommitment;
        Status status;
        bool exists;
    }

    mapping(uint256 => Election) private elections;
    mapping(uint256 => uint64) public eligibilityRootVersion;

    error ElectionAlreadyExists(uint256 electionId);
    error ElectionNotFound(uint256 electionId);
    error InvalidSchedule();
    error InvalidState(Status current, Status expected);
    error InvalidRoot();
    error RootLocked();
    error ElectionNotReady();

    event ElectionCreated(uint256 indexed electionId, uint64 startTime, uint64 endTime, bytes32 configurationCommitment);
    event EligibilityRootPublished(uint256 indexed electionId, uint256 indexed root, uint64 version);
    event ElectionStateChanged(uint256 indexed electionId, Status previousStatus, Status newStatus, bytes32 reasonCommitment);
    event TallyEvidenceRecorded(uint256 indexed electionId, bytes32 indexed tallyCommitment, bytes32 proofArtifactCommitment);
    event ResultsPublished(uint256 indexed electionId);

    constructor(address administrator) {
        _grantRole(DEFAULT_ADMIN_ROLE, administrator);
        _grantRole(ELECTION_ADMIN_ROLE, administrator);
        _grantRole(CREDENTIAL_ISSUER_ROLE, administrator);
    }

    function createElection(
        uint256 electionId,
        uint64 startTime,
        uint64 endTime,
        bytes32 configurationCommitment
    ) external onlyRole(ELECTION_ADMIN_ROLE) {
        if (elections[electionId].exists) revert ElectionAlreadyExists(electionId);
        if (electionId == 0 || startTime <= block.timestamp || endTime <= startTime || configurationCommitment == bytes32(0)) revert InvalidSchedule();
        elections[electionId] = Election({
            startTime: startTime,
            endTime: endTime,
            eligibilityRoot: 0,
            configurationCommitment: configurationCommitment,
            status: Status.Draft,
            exists: true
        });
        emit ElectionCreated(electionId, startTime, endTime, configurationCommitment);
    }

    function publishEligibilityRoot(uint256 electionId, uint256 root) external onlyRole(CREDENTIAL_ISSUER_ROLE) {
        Election storage election = elections[electionId];
        if (!election.exists) revert ElectionNotFound(electionId);
        if (election.status != Status.Draft && election.status != Status.Scheduled) revert RootLocked();
        if (root == 0) revert InvalidRoot();
        election.eligibilityRoot = root;
        uint64 version = ++eligibilityRootVersion[electionId];
        emit EligibilityRootPublished(electionId, root, version);
    }

    function scheduleElection(uint256 electionId) external onlyRole(ELECTION_ADMIN_ROLE) {
        Election storage election = _election(electionId);
        if (election.status != Status.Draft) revert InvalidState(election.status, Status.Draft);
        if (election.eligibilityRoot == 0 || election.configurationCommitment == bytes32(0)) revert ElectionNotReady();
        election.status = Status.Scheduled;
        emit ElectionStateChanged(electionId, Status.Draft, Status.Scheduled, bytes32(0));
    }

    function openElection(uint256 electionId) external onlyRole(ELECTION_ADMIN_ROLE) {
        Election storage election = _election(electionId);
        if (election.status != Status.Scheduled) revert InvalidState(election.status, Status.Scheduled);
        if (block.timestamp < election.startTime || block.timestamp >= election.endTime || election.eligibilityRoot == 0) revert ElectionNotReady();
        election.status = Status.Open;
        emit ElectionStateChanged(electionId, Status.Scheduled, Status.Open, bytes32(0));
    }

    function closeElection(uint256 electionId, bytes32 reasonCommitment) external onlyRole(ELECTION_ADMIN_ROLE) {
        Election storage election = _election(electionId);
        if (election.status != Status.Open) revert InvalidState(election.status, Status.Open);
        if (block.timestamp < election.endTime && reasonCommitment == bytes32(0)) revert ElectionNotReady();
        election.status = Status.Closed;
        emit ElectionStateChanged(electionId, Status.Open, Status.Closed, reasonCommitment);
    }

    function recordTallyEvidence(uint256 electionId, bytes32 tallyCommitment, bytes32 proofArtifactCommitment) external onlyRole(TALLY_TRUSTEE_ROLE) {
        Election storage election = _election(electionId);
        if (election.status != Status.Closed) revert InvalidState(election.status, Status.Closed);
        if (tallyCommitment == bytes32(0) || proofArtifactCommitment == bytes32(0)) revert ElectionNotReady();
        election.status = Status.TallyEvidenceRecorded;
        emit ElectionStateChanged(electionId, Status.Closed, Status.TallyEvidenceRecorded, tallyCommitment);
        emit TallyEvidenceRecorded(electionId, tallyCommitment, proofArtifactCommitment);
    }

    function publishResults(uint256 electionId) external onlyRole(ELECTION_ADMIN_ROLE) {
        Election storage election = _election(electionId);
        if (election.status != Status.TallyEvidenceRecorded) revert InvalidState(election.status, Status.TallyEvidenceRecorded);
        election.status = Status.ResultsPublished;
        emit ElectionStateChanged(electionId, Status.TallyEvidenceRecorded, Status.ResultsPublished, bytes32(0));
    }

    function cancelElection(uint256 electionId, bytes32 reasonCommitment) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Election storage election = _election(electionId);
        if (election.status == Status.Open || election.status == Status.Closed || election.status == Status.TallyEvidenceRecorded || election.status == Status.ResultsPublished || reasonCommitment == bytes32(0)) revert ElectionNotReady();
        Status previous = election.status;
        election.status = Status.Cancelled;
        emit ElectionStateChanged(electionId, previous, Status.Cancelled, reasonCommitment);
    }

    function isElectionOpen(uint256 electionId) external view returns (bool) {
        Election storage election = elections[electionId];
        return election.exists && election.status == Status.Open && block.timestamp >= election.startTime && block.timestamp < election.endTime;
    }

    function eligibilityRoot(uint256 electionId) external view returns (uint256) {
        return _election(electionId).eligibilityRoot;
    }

    function electionConfigurationCommitment(uint256 electionId) external view returns (bytes32) {
        return _election(electionId).configurationCommitment;
    }

    function electionSchedule(uint256 electionId) external view returns (uint64 startTime, uint64 endTime) {
        Election storage election = _election(electionId);
        return (election.startTime, election.endTime);
    }

    function electionStatus(uint256 electionId) external view returns (Status) {
        return _election(electionId).status;
    }

    function _election(uint256 electionId) private view returns (Election storage election) {
        election = elections[electionId];
        if (!election.exists) revert ElectionNotFound(electionId);
    }
}
