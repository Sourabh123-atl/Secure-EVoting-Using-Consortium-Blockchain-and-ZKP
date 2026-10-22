'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildPoseidon } = require('circomlibjs');

async function main() {
  const privateOut = path.resolve(process.argv[2] || '.data/credential-private.json');
  const publicOut = path.resolve(process.argv[3] || '.data/credential-commitment.json');
  const secret = BigInt(`0x${crypto.randomBytes(31).toString('hex')}`);
  const poseidon = await buildPoseidon();
  const commitment = poseidon.F.toString(poseidon([secret]));
  fs.mkdirSync(path.dirname(privateOut), { recursive: true });
  fs.mkdirSync(path.dirname(publicOut), { recursive: true });
  fs.writeFileSync(privateOut, JSON.stringify({ secret: secret.toString(), note: 'Private credential witness. Never upload this file to the application server.' }, null, 2), { mode: 0o600 });
  fs.writeFileSync(publicOut, JSON.stringify({ commitment, protocol: 'Poseidon(secret)', note: 'Public eligibility leaf commitment; contains no account name or email.' }, null, 2), { mode: 0o600 });
  console.log(`Private credential written to ${privateOut}`);
  console.log(`Public commitment written to ${publicOut}`);
  console.log('Keep the private credential in the voter-controlled environment. Submit only the public commitment to the eligibility issuer.');
}

main().catch(error => { console.error(error.message); process.exit(1); });
