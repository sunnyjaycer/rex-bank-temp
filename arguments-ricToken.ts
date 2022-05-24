import { ethers } from 'hardhat';

module.exports = [
    ethers.utils.parseEther('10000000')
];

// npx hardhat verify --network rinkeby --constructor-args arguments-ricToken.ts 0xcc9644A61A8Bc5B444612537630A8c20b33fA7da