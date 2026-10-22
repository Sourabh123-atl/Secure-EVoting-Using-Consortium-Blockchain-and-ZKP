'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');

async function main() {
  const localId = process.argv[2];
  const rootFile = path.resolve(process.argv[3] || 'data/eligibility-root.json');
  const dbPath = path.resolve(process.env.CIVICCHAIN_DATA_DIR || 'data', 'db.json');
  if (!localId || !fs.existsSync(dbPath) || !fs.existsSync(rootFile)) throw new Error('Usage: node scripts/register-election.js <local-election-id> [eligibility-root.json]');
  for (const key of ['BLOCKCHAIN_RPC_URL', 'ELECTION_REGISTRY_ADDRESS', 'BLOCKCHAIN_ADMIN_PRIVATE_KEY']) if (!process.env[key]) throw new Error(`${key} must be set in the environment.`);
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const election = db.elections.find(item => item.id === localId);
  if (!election) throw new Error(`Election ${localId} does not exist in the local application database.`);
  const rootDoc = JSON.parse(fs.readFileSync(rootFile, 'utf8'));
  const root = BigInt(rootDoc.root);
  if (root <= 0n) throw new Error('Eligibility root must be a non-zero field element.');
  const startTime = Math.floor(new Date(election.startTime).getTime() / 1000);
  const endTime = Math.floor(new Date(election.endTime).getTime() / 1000);
  if (startTime <= Math.floor(Date.now() / 1000) || endTime <= startTime) throw new Error('The start time must be in the future and the end time must follow it.');
  const options = election.options.map(({ id, name, description }) => ({ id, name, description }));
  const commitmentPayload = JSON.stringify({ localElectionId: election.id, electionId: election.chainElectionId, title: election.title, startTime, endTime, options, eligibilityRoot: root.toString() });
  const configurationCommitment = ethers.keccak256(ethers.toUtf8Bytes(commitmentPayload));
  const artifactPath = path.resolve('artifacts/contracts/ElectionRegistry.sol/ElectionRegistry.json');
  if (!fs.existsSync(artifactPath)) throw new Error('Compile contracts first: npm run contracts:compile');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BLOCKCHAIN_ADMIN_PRIVATE_KEY, provider);
  const registry = new ethers.Contract(process.env.ELECTION_REGISTRY_ADDRESS, artifact.abi, wallet);
  const id = BigInt(election.chainElectionId);
  const create = await registry.createElection(id, startTime, endTime, configurationCommitment);
  const createReceipt = await create.wait();
  const publish = await registry.publishEligibilityRoot(id, root);
  const rootReceipt = await publish.wait();
  const schedule = await registry.scheduleElection(id);
  const scheduleReceipt = await schedule.wait();
  console.log(JSON.stringify({ electionId: id.toString(), createTransaction: createReceipt.hash, rootTransaction: rootReceipt.hash, scheduleTransaction: scheduleReceipt.hash, eligibilityRoot: root.toString(), configurationCommitment, note: 'Sync this real contract state into the app using the admin chain-sync action.' }, null, 2));
}

main().catch(error => { console.error(error.shortMessage || error.message); process.exit(1); });
