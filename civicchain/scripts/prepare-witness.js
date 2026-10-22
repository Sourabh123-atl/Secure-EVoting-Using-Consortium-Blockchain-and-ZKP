'use strict';

const fs = require('node:fs');
const path = require('node:path');

function main() {
  const credentialPath = path.resolve(process.argv[2] || '.data/credential-private.json');
  const treePath = path.resolve(process.argv[3] || '.data/eligibility-tree-private.json');
  const electionId = String(process.argv[4] || '');
  const outputPath = path.resolve(process.argv[5] || '.data/witness.json');
  if (!/^\d+$/.test(electionId)) throw new Error('Election ID must be a decimal unsigned integer that matches the circuit public input.');
  if (!fs.existsSync(credentialPath) || !fs.existsSync(treePath)) throw new Error('Credential or eligibility tree file is missing.');
  const credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
  if (!credential.secret || !tree.commitments?.length) throw new Error('Credential or tree data is malformed.');
  console.log('Preparing witness by matching the public commitment. The secret stays in this local command; the output file remains private.');
  const { spawnSync } = require('node:child_process');
  const validator = path.join(__dirname, 'validate-witness.js');
  const out = spawnSync(process.execPath, [validator, credentialPath, treePath, electionId, outputPath], { stdio: 'inherit' });
  if (out.status !== 0) process.exit(out.status || 1);
}
main();
