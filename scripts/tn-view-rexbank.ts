import { ethers } from 'hardhat';
import { Contract, ContractFactory } from 'ethers';
import { abi } from '../artifacts/contracts/Bank.sol/Bank.json';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const BANK_ADDRESS = "0xEa3e612ab0f415c87740b140C21B5d7153f4FAC8";
const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';

async function main(): Promise<void> {

    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;

    [owner,borrower] = await ethers.getSigners();

    const rexBank: Contract = new ethers.Contract(
        BANK_ADDRESS,
        abi,
        borrower
    );

    console.log('Already initialized, providing instance data\n');
    console.log("Name   ", await rexBank.getName());
    console.log("IR     ", (await rexBank.getInterestRate()).toString());
    console.log("CR     ", (await rexBank.getCollateralizationRatio()).toString());
    console.log("LP     ", (await rexBank.getLiquidationPenalty()).toString());
    console.log("Tellor ", TELLOR_ORACLE_ADDRESS);
    console.log("Bank Reserves", (await rexBank.getReserveBalance()).div(ethers.utils.parseUnits("1")).toString());

    console.log("\n- Tokens -")
    console.log("DT Address", await rexBank.getDebtTokenAddress());
    console.log("DT Price", (await rexBank.getDebtTokenPrice()).toString());
    console.log("CT Address", await rexBank.getCollateralTokenAddress());
    console.log("CT Price", (await rexBank.getCollateralTokenPrice()).toString());

    console.log("\n- User -")
    console.log("Vault C Quantity   ", (await rexBank.connect(borrower).getVaultCollateralAmount()).div(ethers.utils.parseUnits("1")).toString() );
    console.log("Vault C Value      ", (await rexBank.connect(borrower).getVaultCollateralAmount()).mul(await rexBank.getCollateralTokenPrice()).div(ethers.utils.parseUnits("1000")).toString() );
    console.log("Vault D Quantity   ", (await rexBank.connect(borrower).getVaultDebtAmount()).div(ethers.utils.parseUnits("1")).toString() );
    console.log("Vault D Value      ", (await rexBank.connect(borrower).getVaultDebtAmount()).mul(await rexBank.getDebtTokenPrice()).div(ethers.utils.parseUnits("1000")).toString() );
    console.log("Vault CR           ", (await rexBank.getVaultCollateralizationRatio(borrower.address)).div(ethers.BigNumber.from("100")).toString(), "%" );

}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
});

// rexBank deployed to:  
// npx hardhat run scripts/view-rexbank.ts --network rinkeby