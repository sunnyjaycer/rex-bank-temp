import { ethers } from 'hardhat';
import { Contract, ContractFactory } from 'ethers';
import { abi as bankAbi } from '../artifacts/contracts/Bank.sol/Bank.json';
import { abi as tokenAbi } from '../artifacts/contracts/mockTokens/CollateralToken.sol/RICToken.json';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const BANK_ADDRESS = "0xEa3e612ab0f415c87740b140C21B5d7153f4FAC8";
const RIC_ADDRESS = "0xcc9644A61A8Bc5B444612537630A8c20b33fA7da";

async function main(): Promise<void> {

    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;

    [owner, borrower] = await ethers.getSigners();

    console.log("Borrower",borrower.address);

    const rexBank: Contract = new ethers.Contract(
        BANK_ADDRESS,
        bankAbi,
        borrower
    );

    const collateralToken: Contract = new ethers.Contract(
        RIC_ADDRESS,
        tokenAbi,
        borrower
    );

    // Max approve bank for collateral token
    if(await collateralToken.allowance(borrower.address,rexBank.address) != ethers.constants.MaxInt256) {
        console.log("Approving...");
        let aTx = await collateralToken.connect(borrower).approve( BANK_ADDRESS, ethers.constants.MaxInt256 );
        await aTx.wait();
    }
    // Deposit collateral
    console.log("Vault Depositing...");
    let rdTx = await rexBank.connect(borrower).vaultDeposit(
        ethers.utils.parseUnits( "10000" )
    );
    await rdTx.wait();

    console.log("New Vault Amount:", (await rexBank.connect(borrower).getVaultCollateralAmount()).toString());

}
  
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
});

// rexBank deployed to:  
// npx hardhat run scripts/vault-manage-rexbank.ts --network rinkeby