const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CivicChain election and ballot invariants', function () {
  async function deployOpenElection() {
    const [admin, voter] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory('ElectionRegistry');
    const registry = await Registry.deploy(admin.address);
    await registry.waitForDeployment();
    const MockVerifier = await ethers.getContractFactory('AcceptingVerifierForTests');
    const verifier = await MockVerifier.deploy();
    await verifier.waitForDeployment();
    const Voting = await ethers.getContractFactory('VotingContract');
    const voting = await Voting.deploy(admin.address, await registry.getAddress(), await verifier.getAddress());
    await voting.waitForDeployment();
    const latest = await ethers.provider.getBlock('latest');
    const start = latest.timestamp + 20;
    const end = start + 3600;
    const electionId = 42;
    const root = 12345;
    const commitment = ethers.keccak256(ethers.toUtf8Bytes('test configuration'));
    await registry.createElection(electionId, start, end, commitment);
    await registry.publishEligibilityRoot(electionId, root);
    await registry.scheduleElection(electionId);
    await ethers.provider.send('evm_setNextBlockTimestamp', [start]);
    await registry.openElection(electionId);
    return { admin, voter, registry, verifier, voting, electionId, root };
  }

  it('rejects election creation by an unprivileged account', async function () {
    const [admin, other] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory('ElectionRegistry');
    const registry = await Registry.deploy(admin.address);
    await expect(registry.connect(other).createElection(2, 2000000000, 2000001000, ethers.keccak256(ethers.toUtf8Bytes('config')))).to.be.reverted;
  });

  it('enforces election state and a published eligibility root before opening', async function () {
    const [admin] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory('ElectionRegistry');
    const registry = await Registry.deploy(admin.address);
    const latest = await ethers.provider.getBlock('latest');
    await registry.createElection(5, latest.timestamp + 50, latest.timestamp + 500, ethers.keccak256(ethers.toUtf8Bytes('config')));
    await expect(registry.scheduleElection(5)).to.be.reverted;
  });

  it('stores an accepted encrypted ballot and atomically rejects duplicate nullifiers', async function () {
    const ctx = await deployOpenElection();
    const publicSignals = [ctx.root, ctx.electionId, 7001];
    const proof = { a: [1, 2], b: [[3, 4], [5, 6]], c: [7, 8] };
    await ctx.voting.connect(ctx.voter).submitBallot(ctx.electionId, '0x123456', proof.a, proof.b, proof.c, publicSignals);
    expect(await ctx.voting.ballotCount(ctx.electionId)).to.equal(1);
    expect(await ctx.voting.nullifierUsed(ctx.electionId, 7001)).to.equal(true);
    await expect(ctx.voting.connect(ctx.voter).submitBallot(ctx.electionId, '0x123456', proof.a, proof.b, proof.c, publicSignals)).to.be.revertedWithCustomError(ctx.voting, 'DuplicateNullifier');
  });

  it('rejects a proof whose public root or election context does not match', async function () {
    const ctx = await deployOpenElection();
    const proof = { a: [1, 2], b: [[3, 4], [5, 6]], c: [7, 8] };
    await expect(ctx.voting.submitBallot(ctx.electionId, '0x123456', proof.a, proof.b, proof.c, [999, ctx.electionId, 2])).to.be.revertedWithCustomError(ctx.voting, 'InvalidPublicSignals');
    await expect(ctx.voting.submitBallot(ctx.electionId, '0x123456', proof.a, proof.b, proof.c, [ctx.root, ctx.electionId + 1, 3])).to.be.revertedWithCustomError(ctx.voting, 'InvalidPublicSignals');
  });
});
