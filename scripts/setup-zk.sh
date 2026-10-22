#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p circuits/build
npx circom2 circuits/eligibility.circom --r1cs --wasm --sym -l node_modules -o circuits/build
npx snarkjs powersoftau new bn128 14 circuits/build/pot14_0000.ptau -v
ENTROPY_ONE="$(node -e 'console.log(require("crypto").randomBytes(64).toString("hex"))')"
npx snarkjs powersoftau contribute circuits/build/pot14_0000.ptau circuits/build/pot14_0001.ptau --name="CivicChain local development contribution" -e="$ENTROPY_ONE"
unset ENTROPY_ONE
npx snarkjs powersoftau prepare phase2 circuits/build/pot14_0001.ptau circuits/build/pot14_final.ptau -v
npx snarkjs groth16 setup circuits/build/eligibility.r1cs circuits/build/pot14_final.ptau circuits/build/eligibility_0000.zkey
ENTROPY_TWO="$(node -e 'console.log(require("crypto").randomBytes(64).toString("hex"))')"
npx snarkjs zkey contribute circuits/build/eligibility_0000.zkey circuits/build/eligibility_final.zkey --name="CivicChain local development zkey contribution" -e="$ENTROPY_TWO"
unset ENTROPY_TWO
npx snarkjs zkey export verificationkey circuits/build/eligibility_final.zkey circuits/build/verification_key.json
npx snarkjs zkey export solidityverifier circuits/build/eligibility_final.zkey contracts/Groth16Verifier.sol
printf '\nGenerated development artifacts in circuits/build and contracts/Groth16Verifier.sol\n'
printf 'This local setup is for research and functional testing only. It is not a public multi-party trusted ceremony.\n'
