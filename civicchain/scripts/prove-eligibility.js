'use strict';

const fs = require('node:fs');
const path = require('node:path');
const snarkjs = require('snarkjs');

async function main() {
  const inputPath = path.resolve(process.argv[2] || '.data/witness.json');
  const outputPath = path.resolve(process.argv[3] || '.data/proof-package.json');
  const wasmPath = path.resolve(process.env.ZK_WASM_PATH || 'circuits/build/eligibility_js/eligibility.wasm');
  const zkeyPath = path.resolve(process.env.ZK_ZKEY_PATH || 'circuits/build/eligibility_final.zkey');
  if (![inputPath, wasmPath, zkeyPath].every(fs.existsSync)) throw new Error('Witness, circuit WASM, or proving key is missing. Run npm run zk:setup and prepare the private witness first.');
  const witness = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, wasmPath, zkeyPath);
  const packageData = { protocol: 'groth16', circuit: 'eligibility-v1-depth-4', proof, publicSignals, generatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(packageData, null, 2), { mode: 0o600 });
  console.log(`Proof package written to ${outputPath}. It excludes the private witness.`);
  console.log(`Public signals: ${JSON.stringify(publicSignals)}`);
}
main().catch(error => { console.error(error.message); process.exit(1); });
