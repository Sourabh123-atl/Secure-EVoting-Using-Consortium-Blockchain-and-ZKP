'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('ethers');

async function main() {
  const electionId = process.argv[2];
  const action = process.argv[3];
  const reason = process.argv[4] || '';
  if (!electionId || !['open', 'close'].includes(action)) throw new Error('Usage: node scripts/set-election-state.js <local-election-id> <open|close> [reason-for-early-close]');
  for (const key of ['BLOCKCHAIN_RPC_URL', 'ELECTION_REGISTRY_ADDRESS', 'BLOCKCHAIN_ADMIN_PRIVATE_KEY']) if (!process.env[key]) throw new Error(`${key} must be set in the environment.`);
  const dbPath = path.resolve(process.env.CIVICCHAIN_DATA_DIR || 'data', 'db.json');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const election = db.elections.find(item => item.id === electionId);
  if (!election) throw new Error(`Election ${electionId} does not exist in the local application database.`);
  const artifactPath = path.resolve('artifacts/contracts/ElectionRegistry.sol/ElectionRegistry.json');
  if (!fs.existsSync(artifactPath)) throw new Error('Compile contracts first: npm run contracts:compile');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const wallet = new ethers.Wallet(process.env.BLOCKCHAIN_ADMIN_PRIVATE_KEY, provider);
  const registry = new ethers.Contract(process.env.ELECTION_REGISTRY_ADDRESS, artifact.abi, wallet);
  const chainId = BigInt(election.chainElectionId);
  const reasonCommitment = reason ? ethers.keccak256(ethers.toUtf8Bytes(reason)) : ethers.ZeroHash;
  const tx = action === 'open' ? await registry.openElection(chainId) : await registry.closeElection(chainId, reasonCommitment);
  const receipt = await tx.wait();
  console.log(JSON.stringify({ action, electionId: chainId.toString(), transactionHash: receipt.hash, blockNumber: Number(receipt.blockNumber), warning: 'Run the application admin chain-sync action to mirror actual contract state.' }, null, 2));
}
main().catch(error => { console.error(error.shortMessage || error.message); process.exit(1); });
