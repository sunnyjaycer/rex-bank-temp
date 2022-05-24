import { ethers } from 'hardhat';
import { Contract, ContractFactory } from 'ethers';
import { fusdc_abi } from './resources/fUSDC.json';
import { fusdcx_abi } from './resources/fUSDCx.json';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const RINKEBY_FUSDC_ADDRESS = "0xbe49ac1EadAc65dccf204D4Df81d650B50122aB2";
const RINKEBY_FUSDCX_ADDRESS = "0x0F1D7C55A2B133E000eA10EeC03c774e0d6796e8";

async function main(): Promise<void> {

    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;
    let user4: SignerWithAddress;

    [owner,user1,user2,user3,user4] = await ethers.getSigners();

    const fUSDC: Contract = new ethers.Contract(
        RINKEBY_FUSDC_ADDRESS,
        fusdc_abi,
        user1
    );

    const fUSDCx: Contract = new ethers.Contract(
        RINKEBY_FUSDCX_ADDRESS,
        fusdcx_abi,
        user1
    );

    //// Minting fUSDC

    let mtx1 = await fUSDC.connect(owner).mint(user1.address, ethers.utils.parseEther("10000000"));
    await mtx1.wait();
    let mtx2 = await fUSDC.connect(owner).mint(user2.address, ethers.utils.parseEther("10000000"));
    await mtx2.wait();
    let mtx3 = await fUSDC.connect(owner).mint(user3.address, ethers.utils.parseEther("10000000"));
    await mtx3.wait();
    let mtx4 = await fUSDC.connect(owner).mint(user4.address, ethers.utils.parseEther("10000000"));
    await mtx4.wait();
    console.log("fUSDC minted")

    //// Approving fUSDCx for wrapping

    let atx1 = await fUSDC.connect(user1).approve(RINKEBY_FUSDCX_ADDRESS,ethers.utils.parseEther("10000001"));
    await atx1.wait();
    let atx2 = await fUSDC.connect(user2).approve(RINKEBY_FUSDCX_ADDRESS,ethers.utils.parseEther("10000001"));
    await atx2.wait();
    let atx3 = await fUSDC.connect(user3).approve(RINKEBY_FUSDCX_ADDRESS,ethers.utils.parseEther("10000001"));
    await atx3.wait();
    let atx4 = await fUSDC.connect(user4).approve(RINKEBY_FUSDCX_ADDRESS,ethers.utils.parseEther("10000001"));
    await atx4.wait();
    console.log("Approved fUSDCx for wrapping")

    //// Wrapping fUSDC to fUSDCx
    
    let wtx1 = await fUSDCx.connect(user1).upgrade(ethers.utils.parseEther("10000000"));
    await wtx1.wait();
    let wtx2 = await fUSDCx.connect(user2).upgrade(ethers.utils.parseEther("10000000"));
    await wtx2.wait();
    let wtx3 = await fUSDCx.connect(user3).upgrade(ethers.utils.parseEther("10000000"));
    await wtx3.wait();
    let wtx4 = await fUSDCx.connect(user4).upgrade(ethers.utils.parseEther("10000000"));
    await wtx4.wait();
    console.log("Wrapping fUSDC to fUSDCx");


}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
});