'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildPoseidon } = require('circomlibjs');
async function main() {
  const [credentialPath, treePath, electionId, outputPath] = process.argv.slice(2);
  const credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  const tree = JSON.parse(fs.readFileSync(treePath, 'utf8'));
  const poseidon = await buildPoseidon();
  const commitment = poseidon.F.toString(poseidon([BigInt(credential.secret)]));
  const memberPath = tree.paths[commitment];
  if (!memberPath) throw new Error('Credential commitment is not in the supplied eligibility tree.');
  const witness = { secret: String(credential.secret), pathElements: memberPath.pathElements, pathIndices: memberPath.pathIndices, root: String(tree.root), electionId: String(electionId) };
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), JSON.stringify(witness, null, 2), { mode: 0o600 });
  console.log(`Private witness written to ${path.resolve(outputPath)}. Do not upload this file.`);
}
main().catch(error => { console.error(error.message); process.exit(1); });
