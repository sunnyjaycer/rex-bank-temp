import { ethers } from 'hardhat';
import { Contract, ContractFactory } from 'ethers';
import { abi } from '../artifacts/contracts/Bank.sol/Bank.json';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const INTEREST_RATE = 200; // 2%
const COLLATERALIZATION_RATIO = 150;
const LIQUIDATION_PENALTY = 25;
const BANK_NAME = "Test Bank";
const BANK_ADDRESS = "0xEa3e612ab0f415c87740b140C21B5d7153f4FAC8";
const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';

const RIC_ADDRESS = "0xcc9644A61A8Bc5B444612537630A8c20b33fA7da";
const FUSDCX_ADDRESS = "0x0F1D7C55A2B133E000eA10EeC03c774e0d6796e8";

async function main(): Promise<void> {

    let signer: SignerWithAddress;

    [signer] = await ethers.getSigners();

    const rexBank: Contract = new ethers.Contract(
        BANK_ADDRESS,
        abi,
        signer
    );

    async function viewBankInfo() {

        console.log('Already initialized, providing instance data\n');
        console.log("Owner  ", await rexBank._bankFactoryOwner());
        console.log("Name   ", await rexBank.getName());
        console.log("IR     ", (await rexBank.getInterestRate()).toString());
        console.log("CR     ", (await rexBank.getCollateralizationRatio()).toString());
        console.log("LP     ", (await rexBank.getLiquidationPenalty()).toString());
        console.log("Fac Own", await rexBank._bankFactoryOwner());
        console.log("Tellor ", TELLOR_ORACLE_ADDRESS);

        console.log("\n- Tokens -")
        console.log("DT Address", await rexBank.getDebtTokenAddress());
        console.log("DT Price", (await rexBank.getDebtTokenPrice()).toString());
        console.log("CT Address", await rexBank.getCollateralTokenAddress());
        console.log("CT Price", (await rexBank.getCollateralTokenPrice()).toString());
        
    }

    if ( (await rexBank.getInterestRate()).toString() == INTEREST_RATE.toString() ) {
        await viewBankInfo()
    } else {
        console.log('Initializing Bank contract instance variables');

        await rexBank.connect(signer).init(
            signer.address,            // creator
            BANK_NAME,                 
            INTEREST_RATE,             
            COLLATERALIZATION_RATIO,   
            LIQUIDATION_PENALTY, 
            signer.address,            // factory owner (to be made obsolete)
            TELLOR_ORACLE_ADDRESS
        );
        
        console.log('Setting collateral');
        let scTx = await rexBank.connect(signer).setCollateral(
            RIC_ADDRESS,
            "RIC",
            1000,
            54
        )
        await scTx.wait();
        
        console.log('Setting debt');
        let sdTx = await rexBank.connect(signer).setDebt(
            FUSDCX_ADDRESS,
            "fUSDCx",
            1000,
            1000
        )
        await sdTx.wait();

        await viewBankInfo()

    }

}
  
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
});

// rexBank deployed to:  0x0337d15bf3e0B7E337C4f858356B42242dA03CC3
// npx hardhat run scripts/set-rexbank.ts --network rinkeby