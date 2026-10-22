'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const privatePath = path.join(dataDir, 'ballot-private.pem');
const publicPath = path.join(dataDir, 'ballot-public.pem');
if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) {
  console.error('A ballot key already exists. Move both existing files to a secure backup before rotating keys.');
  process.exit(1);
}
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
fs.writeFileSync(privatePath, privateKey, { mode: 0o600, flag: 'wx' });
fs.writeFileSync(publicPath, publicKey, { mode: 0o644, flag: 'wx' });
console.log(`Public ballot key written to ${path.relative(root, publicPath)}`);
console.log(`Private demo decryption key written to ${path.relative(root, privatePath)} (keep offline; not exposed by the web API).`);
console.log('This RSA-OAEP development adapter is not homomorphic, threshold-based, or production election cryptography.');
