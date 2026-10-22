pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

template MerkleMembership(depth) {
    signal input leaf;
    signal input root;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal running[depth + 1];
    component hashes[depth];

    running[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        hashes[i] = Poseidon(2);
        hashes[i].inputs[0] <== (1 - pathIndices[i]) * running[i] + pathIndices[i] * pathElements[i];
        hashes[i].inputs[1] <== pathIndices[i] * running[i] + (1 - pathIndices[i]) * pathElements[i];
        running[i + 1] <== hashes[i].out;
    }
    running[depth] === root;
}

template Eligibility(depth) {
    signal input secret;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input root;
    signal input electionId;
    signal output nullifier;

    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== secret;

    component membership = MerkleMembership(depth);
    membership.leaf <== leafHasher.out;
    membership.root <== root;
    for (var i = 0; i < depth; i++) {
        membership.pathElements[i] <== pathElements[i];
        membership.pathIndices[i] <== pathIndices[i];
    }

    component nullifierHasher = Poseidon(3);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== electionId;
    nullifierHasher.inputs[2] <== 89439063479961018389042598430721922609;
    nullifier <== nullifierHasher.out;
}

component main {public [root, electionId]} = Eligibility(4);
