// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract AcceptingVerifierForTests {
    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[3] calldata) external pure returns (bool) {
        return true;
    }
}
