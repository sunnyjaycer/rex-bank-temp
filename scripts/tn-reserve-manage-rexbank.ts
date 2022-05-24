import { ethers } from 'hardhat';
import { Contract, ContractFactory } from 'ethers';
import { abi as bankAbi } from '../artifacts/contracts/Bank.sol/Bank.json';
import { abi as tokenAbi } from '../artifacts/contracts/mockTokens/CollateralToken.sol/RICToken.json';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const BANK_ADDRESS = "0xEa3e612ab0f415c87740b140C21B5d7153f4FAC8";
const FUSDCX_ADDRESS = "0x0F1D7C55A2B133E000eA10EeC03c774e0d6796e8";

const DEPOSIT_AMOUNT = "1000";

async function main(): Promise<void> {

    let owner: SignerWithAddress;

    [owner] = await ethers.getSigners();

    const rexBank: Contract = new ethers.Contract(
        BANK_ADDRESS,
        bankAbi,
        owner
    );

    const debtToken: Contract = new ethers.Contract(
        FUSDCX_ADDRESS,
        tokenAbi,
        owner
    );

    // Max approve bank for debt token
    if(await debtToken.allowance(owner.address,rexBank.address) != ethers.constants.MaxInt256) {
        console.log("Approving...");
        let aTx = await debtToken.connect(owner).approve( BANK_ADDRESS, ethers.constants.MaxInt256 );
        await aTx.wait();
    }
    // Owner deposits reserve liquidity
    console.log("Reserve Depositing...");
    let rdTx = await rexBank.connect(owner).reserveDeposit(
        ethers.utils.parseUnits( DEPOSIT_AMOUNT )
    );
    await rdTx.wait();

    console.log("Reserves Amount:", await rexBank.connect(owner).getReserveBalance());

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
// npx hardhat run scripts/reserve-manage-rexbank.ts --network rinkeby