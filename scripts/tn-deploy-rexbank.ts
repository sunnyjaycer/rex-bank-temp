import { ethers } from 'hardhat';
import { Contract, ContractFactory } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const INTEREST_RATE = 200; // 2%
const COLLATERALIZATION_RATIO = 150;
const LIQUIDATION_PENALTY = 25;
const BANK_NAME = "Test Bank";
const RINKEBY_TELLOR_ORACLE_ADDRESS = '0x18431fd88adF138e8b979A7246eb58EA7126ea16';
const FUSDCX_ADDRESS = "0x0F1D7C55A2B133E000eA10EeC03c774e0d6796e8";

const current_BANK_ADDRESS = "0x636e84425A94af73F4B16818B270B82B71d164C7";
const current_RIC_ADDRESS = "0x41F28b8e7C5F060288B2559e7b254E2F523cB9ce";

async function main(): Promise<void> {

    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;
    let user4: SignerWithAddress;

    [owner, user1, user2, user3, user4 ] = await ethers.getSigners();

    // Hardhat always runs the compile task when running scripts through it.
    // If this runs in a standalone fashion you may want to call compile manually
    // to make sure everything is compiled
    // await run("compile");
    // We get the contract to deploy

    //// Deploying rexBank

    const bankFactory: ContractFactory = await ethers.getContractFactory(
      'Bank',
    );
    const rexBank: Contract = await bankFactory.deploy(
        "0xeD5B5b32110c3Ded02a07c8b8e97513FAfb883B6", // host
        "0xF4C5310E51F6079F601a5fb7120bC72a70b96e2A", // CFA
        "",                                           // reg key
        "0xc41876DAB61De145093b6aA87417326B24Ae4ECD", // owner
        BANK_NAME,                               
        INTEREST_RATE,
        COLLATERALIZATION_RATIO,
        LIQUIDATION_PENALTY,
        RINKEBY_TELLOR_ORACLE_ADDRESS,                // oracle
    );
    await rexBank.deployed();
    console.log('rexBank deployed to: ', rexBank.address, '\n');

    //// Deploying collateral token

    const collatTokenFactory: ContractFactory = await ethers.getContractFactory(
      'RICToken',
    );
    const collatToken: Contract = await collatTokenFactory.deploy(
      ethers.utils.parseEther("10000000")
    );
    await collatToken.deployed();
    console.log('RIC Mock Collateral Token deployed to: ', collatToken.address); 
    console.log('Owner now has 10,000,000 tokens\n');

    //// Setting other users up with collateral tokens
    
    await collatToken.connect(user1).mint(user1.address,ethers.utils.parseEther("10000000"));
    await collatToken.connect(user2).mint(user2.address,ethers.utils.parseEther("10000000"));
    await collatToken.connect(user3).mint(user3.address,ethers.utils.parseEther("10000000"));
    await collatToken.connect(user4).mint(user4.address,ethers.utils.parseEther("10000000"));

    console.log('Four adjacent accounts have 10,000,000 tokens\n');

    //// Setting debt and collateral tokens

    console.log('Setting collateral\n');
    let scTx = await rexBank.connect(owner).setCollateral(
        collatToken.address,
        "RIC",
        1000,
        54
    )
    await scTx.wait();
    
    console.log('Setting debt\n');
    let sdTx = await rexBank.connect(owner).setDebt(
        FUSDCX_ADDRESS,
        "fUSDCx",
        1000,
        1000
    )
    await sdTx.wait();

    //// Viewing results

    console.log('Already initialized, providing instance data\n');
    console.log("Owner  ", await rexBank.owner());
    console.log("Name   ", await rexBank.getName());
    console.log("IR     ", (await rexBank.getInterestRate()).toString());
    console.log("CR     ", (await rexBank.getCollateralizationRatio()).toString());
    console.log("LP     ", (await rexBank.getLiquidationPenalty()).toString());
    console.log("Fac Own", await rexBank.owner());
    console.log("Tellor ", RINKEBY_TELLOR_ORACLE_ADDRESS);

    console.log("\n- Tokens -")
    console.log("DT Address", await rexBank.getDebtTokenAddress());
    console.log("DT Price", (await rexBank.getDebtTokenPrice()).toString());
    console.log("CT Address", await rexBank.getCollateralTokenAddress());
    console.log("CT Price", (await rexBank.getCollateralTokenPrice()).toString());
    
  }
  
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
});

// rexBank deployed to:  0xEa3e612ab0f415c87740b140C21B5d7153f4FAC8
// npx hardhat run scripts/deploy-rexbank.ts --network rinkeby