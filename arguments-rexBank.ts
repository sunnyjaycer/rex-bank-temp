const INTEREST_RATE = 200; // 2%
const COLLATERALIZATION_RATIO = 150;
const LIQUIDATION_PENALTY = 25;
const BANK_NAME = "Test Bank";
const BANK_ADDRESS = "0xEa3e612ab0f415c87740b140C21B5d7153f4FAC8";
const RINKEBY_TELLOR_ORACLE_ADDRESS = '0x18431fd88adF138e8b979A7246eb58EA7126ea16';
const RIC_ADDRESS = "0xcc9644A61A8Bc5B444612537630A8c20b33fA7da";
const FUSDCX_ADDRESS = "0x0F1D7C55A2B133E000eA10EeC03c774e0d6796e8";

module.exports = [
    "0xeD5B5b32110c3Ded02a07c8b8e97513FAfb883B6", // host
    "0xF4C5310E51F6079F601a5fb7120bC72a70b96e2A", // CFA
    "",                                           // reg key
    "0xc41876DAB61De145093b6aA87417326B24Ae4ECD", // owner
    BANK_NAME,                               
    INTEREST_RATE,
    COLLATERALIZATION_RATIO,
    LIQUIDATION_PENALTY,
    RINKEBY_TELLOR_ORACLE_ADDRESS,                // oracle
];

// npx hardhat verify --network rinkeby --constructor-args arguments-rexBank.ts 0xEa3e612ab0f415c87740b140C21B5d7153f4FAC8