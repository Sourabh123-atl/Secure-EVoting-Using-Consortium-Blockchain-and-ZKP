'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  const verifierSource = path.resolve(__dirname, '../contracts/Groth16Verifier.sol');
  if (!fs.existsSync(verifierSource)) throw new Error('Missing contracts/Groth16Verifier.sol. Run npm run zk:setup before deploying.');
  const Registry = await ethers.getContractFactory('ElectionRegistry');
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();
  const Verifier = await ethers.getContractFactory('Groth16Verifier');
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const Voting = await ethers.getContractFactory('VotingContract');
  const voting = await Voting.deploy(deployer.address, await registry.getAddress(), await verifier.getAddress());
  await voting.waitForDeployment();
  const Tally = await ethers.getContractFactory('TallyRegistry');
  const tally = await Tally.deploy(deployer.address);
  await tally.waitForDeployment();
  const deployed = {
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    electionRegistry: await registry.getAddress(),
    eligibilityVerifier: await verifier.getAddress(),
    votingContract: await voting.getAddress(),
    tallyRegistry: await tally.getAddress(),
    deployedAt: new Date().toISOString(),
    warning: 'Local development deployment. Use independent keys and an audited setup for any real election.'
  };
  const out = path.resolve(__dirname, '../data/deployed-contracts.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(deployed, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(deployed, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
