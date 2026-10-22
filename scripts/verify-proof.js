'use strict';

const fs = require('node:fs');
const path = require('node:path');
const snarkjs = require('snarkjs');

async function main() {
  const packagePath = path.resolve(process.argv[2] || '.data/proof-package.json');
  const keyPath = path.resolve(process.env.ZK_VERIFICATION_KEY_PATH || 'circuits/build/verification_key.json');
  if (!fs.existsSync(packagePath) || !fs.existsSync(keyPath)) throw new Error('Proof package or verification key is missing.');
  const input = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const valid = await snarkjs.groth16.verify(key, input.publicSignals, input.proof);
  console.log(valid ? 'VALID: real Groth16 verification returned true.' : 'INVALID: real Groth16 verification returned false.');
  if (!valid) process.exit(1);
}
main().catch(error => { console.error(error.message); process.exit(1); });
