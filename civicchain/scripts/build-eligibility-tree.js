'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildPoseidon } = require('circomlibjs');

async function main() {
  const inputPath = path.resolve(process.argv[2] || '.data/commitments.json');
  const privateTreePath = path.resolve(process.argv[3] || '.data/eligibility-tree-private.json');
  const publicRootPath = path.resolve(process.argv[4] || 'data/eligibility-root.json');
  const depth = 4;
  if (!fs.existsSync(inputPath)) throw new Error(`Commitment input not found: ${inputPath}`);
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const values = Array.isArray(raw) ? raw : raw.commitments;
  if (!Array.isArray(values) || values.length < 1 || values.length > 2 ** depth) throw new Error(`Supply 1 to ${2 ** depth} commitments.`);
  const commitments = values.map(value => String(typeof value === 'object' ? value.commitment : value));
  if (new Set(commitments).size !== commitments.length) throw new Error('Duplicate commitment found.');
  const poseidon = await buildPoseidon();
  const hashPair = (left, right) => poseidon.F.toString(poseidon([BigInt(left), BigInt(right)]));
  const leaves = [...commitments];
  while (leaves.length < 2 ** depth) leaves.push('0');
  const levels = [leaves];
  for (let level = 0; level < depth; level++) {
    const current = levels[level];
    const next = [];
    for (let i = 0; i < current.length; i += 2) next.push(hashPair(current[i], current[i + 1]));
    levels.push(next);
  }
  const root = levels[depth][0];
  const paths = {};
  for (let leafIndex = 0; leafIndex < commitments.length; leafIndex++) {
    const pathElements = [];
    const pathIndices = [];
    let index = leafIndex;
    for (let level = 0; level < depth; level++) {
      pathElements.push(levels[level][index ^ 1]);
      pathIndices.push(index & 1);
      index = Math.floor(index / 2);
    }
    paths[commitments[leafIndex]] = { index: leafIndex, pathElements, pathIndices };
  }
  fs.mkdirSync(path.dirname(privateTreePath), { recursive: true });
  fs.mkdirSync(path.dirname(publicRootPath), { recursive: true });
  fs.writeFileSync(privateTreePath, JSON.stringify({ depth, root, commitments, paths, levels }, null, 2), { mode: 0o600 });
  fs.writeFileSync(publicRootPath, JSON.stringify({ root, depth, leafCount: commitments.length, hash: 'Poseidon', generatedAt: new Date().toISOString() }, null, 2), { mode: 0o644 });
  console.log(`Eligibility root: ${root}`);
  console.log(`Private tree/path data written to ${privateTreePath}`);
  console.log(`Public root metadata written to ${publicRootPath}`);
  console.log('Publish the root through the authorized contract workflow before opening an election. The private tree may reveal eligibility-set membership and must be access-controlled.');
}

main().catch(error => { console.error(error.message); process.exit(1); });
