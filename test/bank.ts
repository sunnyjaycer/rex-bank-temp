// parseUnits - number in wei (second param with more control over denomination)
// parseEther - number in wei (gives bignumber)
// formatUnits - number in ethers
// chai assertion suite - https://www.chaijs.com/

import { network, ethers, web3 } from 'hardhat';
import { increaseTime, uintTob32 } from "./helpers";
import { assert, expect } from 'chai';

import { Bank, RICToken, TellorPlayground, USDToken, UsingTellor } from "../typechain-types";
import { dtInstance2Abi } from "./artifacts/DAIABI.js"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from 'ethers';

import { Framework, SuperToken } from "@superfluid-finance/sdk-core";
import deployFramework from "@superfluid-finance/ethereum-contracts/scripts/deploy-framework.js";
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");
const TellorPlaygroundABI = require('usingtellor/artifacts/contracts/TellorPlayground.sol/TellorPlayground.json');

describe("Bank", function () {
  const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const KEEPER_ROLE = ethers.utils.solidityKeccak256(["string"], ["KEEPER_ROLE"]);
  const REPORTER_ROLE = ethers.utils.solidityKeccak256(["string"], ["REPORTER_ROLE"]);

  const DAYS_IN_A_YEAR = ethers.BigNumber.from(365);
  const BIGNUMBER_10000 = ethers.BigNumber.from(10000);
  const SECONDS_IN_A_YEAR = ethers.BigNumber.from(31536000);

  const TEN_ETH_PER_YEAR_FLOW_RATE = ethers.BigNumber.from(317097919837);

  const INTEREST_RATE = 200; // 2%
  const COLLATERALIZATION_RATIO = 150;
  const LIQUIDATION_PENALTY = 25;
  const BANK_NAME = "Test Bank";
  const TELLOR_ORACLE_ADDRESS = '0xACC2d27400029904919ea54fFc0b18Bf07C57875';
  const RIC_QUERY_ID = "0x6e5122118ce52cc9b97c359c1f174a3c21c71d810f7addce3484cc28e0be0f29";
  const RIC_QUERY_DATA = "0x00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000953706f745072696365000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003726963000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000037573640000000000000000000000000000000000000000000000000000000000";
  const INITIAL_BALANCE = "20000";
  let tellorNonce = 0;
  let depositAmount: BigNumber;
  let largeDepositAmount: BigNumber;
  let withdrawAmount;
  let borrowAmount: BigNumber;
  let largeBorrowAmount: BigNumber;
  let smallBorrowAmount: BigNumber;

  let deployer: SignerWithAddress;    // admin
  let randomUser: SignerWithAddress;
  let randomUser2: SignerWithAddress;
  let randomUser3: SignerWithAddress;
  let randomUser4: SignerWithAddress;
  let randomUser5: SignerWithAddress;
  let randomUser6: SignerWithAddress;
  let randomUser7: SignerWithAddress;
  let randomUser8: SignerWithAddress;
  let bankFactoryOwnerUser: SignerWithAddress;
  let user_directory: { [key: string]: string } = {};

  let sf: any;
  let superSigner: any;

  let CT2;
  let DT2;
  let ctInstance2: RICToken;
  let dtInstance2: any;
  let dtInstance2x: SuperToken;
  let bankInstance2: Bank;
  let bank2;
  let tp: TellorPlayground;
  let tellor: UsingTellor;

  const errorHandler = (err:any) => {
    if (err) throw err;
  };

  before (async function () {

    // get signers
    [deployer, randomUser, randomUser2, randomUser3, randomUser4, randomUser5, randomUser6,
      randomUser7, randomUser8, bankFactoryOwnerUser] = await ethers.getSigners();
    user_directory[deployer.address] = "Admin";
    user_directory[randomUser.address] = "randomUser";
    user_directory[randomUser2.address] = "randomUser2";
    user_directory[randomUser3.address] = "randomUser3";
    user_directory[randomUser4.address] = "randomUser4";
    user_directory[randomUser5.address] = "randomUser5";
    user_directory[randomUser6.address] = "randomUser6";
    user_directory[randomUser7.address] = "randomUser7";
    user_directory[randomUser8.address] = "randomUser8";
    user_directory[bankFactoryOwnerUser.address] = "bankFactoryOwnerUser";

    // Deploy SF Framework
    await deployFramework(
      (error:any) => {
        if (error) throw error;
      },
      {web3,from:deployer.address, newTestResolver:true}
    )

    sf = await Framework.create({
      networkName: "custom",
      provider: web3,
      dataMode: "WEB3_ONLY",
      resolverAddress: process.env.RESOLVER_ADDRESS, //this is how you get the resolver address
      protocolReleaseVersion: "test",
    })

    // Set a "super signer" for getting flow rate operations
    superSigner = await sf.createSigner({
      signer: deployer,
      provider: web3
    });

    //// Set up collateral token

    CT2 = await ethers.getContractFactory("RICToken");
    ctInstance2 = await CT2.connect(deployer).deploy(ethers.utils.parseUnits("100000000000000000000"));
    await ctInstance2.deployed();

    //// Set up debt token, both ERC20 and wrapped super token

    //deploy a fake erc20 debt token
    let fDtInstance2Address = await deployTestToken(errorHandler, [":", "fUSDC"], {
      web3,
      from: deployer.address,
    });
    //deploy a fake erc20 wrapper super token around the debt token
    let fDtInstance2xAddress = await deploySuperToken(errorHandler, [":", "fUSDC"], {
        web3,
        from: deployer.address,
    });

    //use the framework to get the debt super token
    dtInstance2x = await sf.loadSuperToken("fUSDCx");
    
    console.log("deploying debt token instance");
    //get the contract object for the erc20 debt token
    let dtInstance2Address = dtInstance2x.underlyingToken.address;
    dtInstance2 = new ethers.Contract(dtInstance2Address, dtInstance2Abi, deployer);

    //// set up oracle

		const TellorPlayground = await ethers.getContractFactory("TellorPlayground");
		tp = await TellorPlayground.deploy();
		await tp.deployed();
    const usingTellor = await ethers.getContractFactory("UsingTellor");
    tellor = await usingTellor.deploy(tp.address);
    await tellor.deployed();

    //// Set up bank

    console.log("deploying bank instance");
    bank2 = (await ethers.getContractFactory("Bank", deployer));

    // - Order of Arguments - 
    // ISuperfluid host,
    // IConstantFlowAgreementV1 cfa,
    // string memory registrationKey,
    // address _owner,                      // makes it easy to deploy permissions to a multisig
    // string memory bankName,
    // uint256 interestRate,                // 150 = 150%
    // uint256 collateralizationRatio,
    // uint256 liquidationPenalty,
    // address payable oracleContract

    bankInstance2 = await bank2.deploy(
      sf.settings.config.hostAddress,  // supposed to be SF host
      sf.settings.config.cfaV1Address, // supposed to be SF CFA Resolver address
      (""),                            // reigstration key
      deployer.address,                // owner
      BANK_NAME,
      INTEREST_RATE,
      COLLATERALIZATION_RATIO,
      LIQUIDATION_PENALTY,
      tp.address                       // Tellor playground oracle contract
    );
    await bankInstance2.deployed();

    await bankInstance2.setDebt(
      dtInstance2x.address, 
      "usdc",
      1000, // granularity (with a granularity of 1000, if the price is stored as 250, then the real price is 250/1000 = 0.25 )
      1000  // initial price
    );
    await bankInstance2.setCollateral(
      ctInstance2.address, 
      "ric",
      1000, // granularity
      1000  // initial price
    );
    depositAmount = ethers.utils.parseUnits("100");
    largeDepositAmount = ethers.utils.parseUnits("5000");
    withdrawAmount = ethers.utils.parseUnits("50");
    borrowAmount = ethers.utils.parseUnits("66");
    largeBorrowAmount = ethers.utils.parseUnits("75");
    smallBorrowAmount = ethers.utils.parseUnits("20");

    // set keepers
    await bankInstance2.addKeeper(randomUser3.address);
    await bankInstance2.addKeeper(randomUser4.address);
    //set updaters
    await bankInstance2.addReporter(randomUser5.address);
    await bankInstance2.addReporter(randomUser6.address);

    console.log("Bank Address:", bankInstance2.address);
    console.log("Bank Owner:", await bankInstance2.connect(deployer).owner());

    console.log("+++++++++++++ SET UP COMPLETE +++++++++++++")

    await setTokenBalances1();

  })

    /**
   * Sets up user 2, 3, 4 with 20,000 Super Debt Tokens from the admin's original balance of 100,000 at minting
   * Admin approves bank for spending of Super Debt Tokens
   * User 2, 3, 4 approves bank for spending of collateral tokens
   */
  async function setTokenBalances1() {
      //// Set up initial token balances

      //  A non-admin has a positive balance (20,000)
      await ctInstance2.connect(randomUser2).mint(randomUser2.address, ethers.utils.parseUnits(INITIAL_BALANCE).toString());
      await dtInstance2.connect(deployer).mint(randomUser2.address, ethers.utils.parseUnits(INITIAL_BALANCE));
      await ctInstance2.connect(randomUser3).mint(randomUser3.address, ethers.utils.parseUnits(INITIAL_BALANCE).toString());
      await dtInstance2.connect(deployer).mint(randomUser3.address, ethers.utils.parseUnits(INITIAL_BALANCE));
      await ctInstance2.connect(randomUser4).mint(randomUser4.address, ethers.utils.parseUnits(INITIAL_BALANCE).toString());
      await dtInstance2.connect(deployer).mint(randomUser4.address, ethers.utils.parseUnits(INITIAL_BALANCE));
    
      //  The admin has a positive balance (20,000)
      await ctInstance2.transfer(deployer.address, ethers.utils.parseUnits(INITIAL_BALANCE)); 
      await dtInstance2.connect(deployer).mint(deployer.address, ethers.utils.parseUnits(INITIAL_BALANCE));

      // approve DTx to transfer DT
      await dtInstance2.connect(randomUser2).approve(dtInstance2x.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
      await dtInstance2.connect(randomUser3).approve(dtInstance2x.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
      await dtInstance2.connect(randomUser4).approve(dtInstance2x.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
      await dtInstance2.connect(deployer).approve(dtInstance2x.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));

      // users and admin upgrade 20,000 tokens
      const dtUpgradeOperation = dtInstance2x.upgrade({
        amount: ethers.utils.parseEther("20000").toString()
      });
      await dtUpgradeOperation.exec(randomUser2);
      await dtUpgradeOperation.exec(randomUser3);
      await dtUpgradeOperation.exec(randomUser4);
      await dtUpgradeOperation.exec(deployer);

      // Admin approves bank for spending of Super Debt Tokens
      const dtxApproveOperation = dtInstance2x.approve({
        receiver: bankInstance2.address,
        amount: ethers.utils.parseEther("10000000000000000000000000000000000000").toString()
      });
      await dtxApproveOperation.exec(deployer);

      // Users approve bank for spending of collateral tokens
      await ctInstance2.connect(randomUser2).approve(bankInstance2.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
      await ctInstance2.connect(randomUser3).approve(bankInstance2.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
      await ctInstance2.connect(randomUser4).approve(bankInstance2.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));

      await logTokenBalances([randomUser2, randomUser3, randomUser4, deployer]);
      
      console.log("+++++++++++++ TOKEN BALANCES SET ++++++++++++");
  }

  /**
   * resets a users token balance to 20k for either collateral token or debt super token
   * @param user The signer that's having balance reset
   * @param token "super debt token" || "collateral token"
   */
  async function resetTokenBalance(user:SignerWithAddress, token:string) {
    if (token == "super debt token") {
      // get difference from target and current
      let currentDebtXBalance = await dtInstance2x.balanceOf({
        account: user.address,
        providerOrSigner: deployer
      })
      // negative -> over 20K | positive -> under 20K
      let debtXDiff = ethers.BigNumber.from(ethers.utils.parseEther("20000")).sub(ethers.BigNumber.from(currentDebtXBalance));
      if ( debtXDiff.gt(ethers.BigNumber.from("0")) ) { // if there's a deficit
        // mint and upgrade to the user
        await dtInstance2.connect(deployer).mint(user.address, debtXDiff.toString());
        const dtUpgradeOperation = dtInstance2x.upgrade({
          amount: debtXDiff.toString()
        });
        await dtUpgradeOperation.exec(user);
      } else if ( debtXDiff.lt(ethers.BigNumber.from("0")) ) { // if there's an excess
        // transfer them to randomUser (garbage account)
        const excessTransfer = dtInstance2x.transfer({
          receiver: randomUser.address,
          amount: (debtXDiff.mul(-1)).toString()
        })
        await excessTransfer.exec(user)
      }

    } else if (token == "collateral token") {
      // get difference from target and current
      let currentCollatBalance = await ctInstance2.connect(user).balanceOf(user.address);
      // if collatDiff positive: less collateral tokens than necessary
      // if collatDiff negative: more collateral tokens than necessary
      let collatDiff = ethers.BigNumber.from(ethers.utils.parseEther("20000")).sub(ethers.BigNumber.from(currentCollatBalance));

      if ( collatDiff.gt(ethers.BigNumber.from("0")) ) { 
        // mint tokens to the user to bridge deficit
        await ctInstance2.connect(user).mint(user.address,collatDiff.toString());
      } else if ( collatDiff.lt(ethers.BigNumber.from("0")) ) {
        // if there is more collat tokens than necessary, transfer them to randomUser (garbage account)
        await ctInstance2.connect(user).transfer(randomUser.address, (collatDiff.mul(-1)).toString());
      }
    }
  }

  async function rewindToBaseState(users:any[]) {
    console.log("+++++++++++++ RESETTING STATE ++++++++++++");

    await changeCollateralPrice(1000);
    
    // loop through users
    for (let i = 0; i < users.length; ++i) {
      // reset debt token balance to 20k
      await resetTokenBalance(users[i], "super debt token");
      // set max approval for repay of loan
      const dtxApproveOperation = dtInstance2x.approve({
        receiver: bankInstance2.address,
        amount: ethers.utils.parseEther("1000000000000000000000").toString()
      });
      await dtxApproveOperation.exec(users[i]);

      // see if flow to bank is positive and delete flow if so
      const userFlowRate = await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: users[i].address,
        receiver: bankInstance2.address,
        providerOrSigner: superSigner
      });
      if (parseInt(userFlowRate.flowRate) > 0) {
        await ( await sf.cfaV1.deleteFlow({
          sender: users[i].address,
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address
        }) ).exec( users[i] );
      }
      // vault withdraw all collateral (all users except deployer)
      if ( users[i] != deployer ) {
        await bankInstance2.connect(users[i]).vaultWithdraw(await bankInstance2.connect(users[i]).getVaultCollateralAmount(users[i].address));
      }
      // reset collateral and debt balance
      await resetTokenBalance(users[i], "collateral token");
      await resetTokenBalance(users[i], "super debt token");

      // set approval back to zero if not admin
      if (users[i].address != deployer.address) {
        const dtxDisapproveOperation = dtInstance2x.approve({
          receiver: bankInstance2.address,
          amount: ethers.utils.parseEther("0").toString()
        });
        await dtxDisapproveOperation.exec(users[i]);
      }
    }

    // deployer withdraws liquidity and has token balance reset
    await bankInstance2.connect(deployer).reserveWithdraw(await bankInstance2.connect(deployer).getReserveBalance());
    await resetTokenBalance(deployer, "super debt token");

    // assert bank netflow is zero
    expect( await sf.cfaV1.getNetFlow({
      superToken: dtInstance2x.address,
      account: bankInstance2.address,
      providerOrSigner: superSigner
    }) ).to.equal("0")

    // sweep all deployer (bankFactoryOwner) balances to randomUser (trash account)
    await ctInstance2.connect(deployer).transfer(randomUser.address, await ctInstance2.connect(deployer).balanceOf(deployer.address));

    let toLog = users;
    toLog.push(bankInstance2);
    await logTokenBalances(toLog);
    await logFlows([randomUser2,randomUser3]);

    console.log("+++++++++++++ STATE RESET ✅ ++++++++++++");

  }

  async function logTokenBalances(user:any[]) {
    console.log("===== Token Balances ====="); 
    for (let i = 0; i < user.length; ++i) {
      if (user[i].address == bankInstance2.address ) {
        console.log("rexBank");
      } else {
        console.log(user_directory[ user[i].address ]);
      }
      console.log("    Collateral Token Balance: ", parseInt( await ctInstance2.connect(deployer).balanceOf(user[i].address))/(10**18) );
      console.log("    Debt Token Balance: ", parseInt( await dtInstance2.connect(deployer).balanceOf(user[i].address) )/(10**18) );
      console.log("    Debt Super Token Balance: ", 
        parseInt( await dtInstance2x.balanceOf({
          account: user[i].address,
          providerOrSigner: deployer
        }) )/(10**18)
      );
    }
    console.log("==========================\n");
  }

  async function logNetflowForEntities(user:SignerWithAddress[]) {
    console.log("===== Netflow Rates ====="); 
    for (let i = 0; i < user.length; ++i) {
      const flowRate = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: user[i].address,
        providerOrSigner: superSigner
      });
      console.log(user_directory[ user[i].address ], "Net Flow Rate: ", flowRate);
    }
    console.log("==========================\n");
  }

  async function logFlows(user:SignerWithAddress[]) {
    console.log("========== Annual Flow Rates =========="); 
    for (let i = 0; i < user.length; ++i) {
      const userFlowRate = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: user[i].address,
        providerOrSigner: superSigner
      });
      console.log(user_directory[ user[i].address ], "Net Flow Rate:\t", ( parseInt(userFlowRate) * 31536000 / (10**18) ).toFixed(2) );
    }
    const bankFlowRate = await sf.cfaV1.getFlow({
      superToken: dtInstance2x.address,
      sender: bankInstance2.address,
      receiver: deployer.address,
      providerOrSigner: superSigner
    });
    console.log("Bank Revenue Flow Rate:\t", ( parseInt(bankFlowRate.flowRate) * 31536000 / (10**18) ).toFixed(2) );
    console.log("======================================\n");
  }

  /** Returns the 2-hour stream deposit of the provided flow rate.
   * Toggle gwei or units by inputing "gwei" or "units as second param"
   */
  async function getStreamDeposit(flowRate:BigNumber,denom:string) {
    return flowRate.mul( 60*60*2 );
  }

  /** Returns whether the debt recorded in the user's vault is as expected
   * user: user who's debt is to be checked
   * expectedDebt: expected debt to be compared to actual debt of user
   * precision: how precise for comparison
   */
  async function checkDebt(user:SignerWithAddress,expectedDebt:BigNumber, precision: number) {
    const contractRecordedDebt = await bankInstance2.getVaultDebtAmount(user.address);
    return parseFloat(ethers.utils.formatUnits(contractRecordedDebt)).toFixed(precision) == parseFloat(ethers.utils.formatUnits(expectedDebt)).toFixed(precision);
  }

  /** Returns whether the Super Debt Token reserves recorded in the contract is as expected
   * expectedReserves: expected debt to be compared to actual debt of user
   * precision: how precise for comparison
   */
  async function checkReserves(expectedReserves:BigNumber, precision: number) {
    const contractRecordedReserveBalance = await bankInstance2.connect(deployer).getReserveBalance();
    return parseFloat(ethers.utils.formatUnits(contractRecordedReserveBalance)).toFixed(precision) == parseFloat(ethers.utils.formatUnits(expectedReserves)).toFixed(precision);
  }

  async function changeCollateralPrice(newPrice:number) {
      // set collateral token price down to a quarter of what it was (from 1000 to 250) (user's overall collateral value becomes 1250 while loan is 1000)      
      await tp.connect(randomUser).submitValue(RIC_QUERY_ID,uintTob32(newPrice),tellorNonce,RIC_QUERY_DATA);
      tellorNonce++;

      // Call update to set price in rexBank contract
      await bankInstance2.updateCollateralPrice();
  }

  // kinda lost its purpose after I discovered closeTo
  async function closeEnough(x:BigNumber, y:BigNumber, precision:number) {
    return parseFloat(ethers.utils.formatUnits(x)).toFixed(precision) == parseFloat(ethers.utils.formatUnits(y)).toFixed(precision);
  }

  xit('SF happy path', async function () {

    // approve DTx to transfer DT
    await dtInstance2.connect(randomUser2).approve(dtInstance2x.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
    await dtInstance2.connect(deployer).approve(dtInstance2x.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));

    // Admin and user approves bank to spend debt super token for reserve deposit and repayment respectively
    const dtxApproveOperation = dtInstance2x.approve({
      receiver: bankInstance2.address,
      amount: ethers.utils.parseEther("10000000000000000000000000000000000000").toString()
    });
    await dtxApproveOperation.exec(deployer);
    await dtxApproveOperation.exec(randomUser2);

    // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
    await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

    await logTokenBalances([randomUser2, deployer]);

    // User approves spending of collateral token and debt token by bank contract
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
    await ctInstance2.connect(randomUser2).approve(bankInstance2.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));

    // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
    await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

    await logTokenBalances([randomUser2, deployer]);

    console.log("Starting off with borrow:")
    // User starts stream of 20 dtInstance2x/year to bank
    await ( await sf.cfaV1.createFlow({
      receiver: bankInstance2.address,
      superToken: dtInstance2x.address,
      flowRate: "634195839675",
    }) ).exec( randomUser2 );


    // Check balance of dtx in borrower
    console.log("1000 Borrow Amount should be reflected");
    await logTokenBalances([randomUser2, deployer]);
    await logFlows([deployer,randomUser2]);

    // Update stream to 10 dtInstance2x/year (repay 500 in debt)
    await ( await sf.cfaV1.updateFlow({
      receiver: bankInstance2.address,
      superToken: dtInstance2x.address,
      flowRate: "317097919837",
    }) ).exec( randomUser2 );

    // Check balance of dtx in borrower and bank
    console.log("500 repay should be reflected");
    await logTokenBalances([randomUser2, deployer]);
    await logFlows([deployer,randomUser2]);

    // Update stream to 40 dtInstance2x/year (borrow additional 1500)
    await ( await sf.cfaV1.updateFlow({
      receiver: bankInstance2.address,
      superToken: dtInstance2x.address,
      flowRate: "1268391679350",
    }) ).exec( randomUser2 );

    // Check balance of dtx in borrower and bank
    console.log("1500 extra borrow should be reflected");
    await logTokenBalances([randomUser2, deployer]);
    await logFlows([deployer,randomUser2]);


    // Delte stream (repay of 1500 in debt)
    await ( await sf.cfaV1.deleteFlow({
      sender: randomUser2.address,
      receiver: bankInstance2.address,
      by: randomUser2.address,
      superToken: dtInstance2x.address,
    }) ).exec( randomUser2 );

    // Check balance of dtx in borrower and bank
    console.log("Total repay should be reflected");
    await logTokenBalances([randomUser2, deployer]);
    await logFlows([deployer,randomUser2]);

  });

  context("getter/setter and permissions", function () {

    it('should create bank with correct parameters', async function () {
      const interestRate = await bankInstance2.getInterestRate();
      const collateralizationRatio = await bankInstance2.getCollateralizationRatio();
      const liquidationPenalty = await bankInstance2.getLiquidationPenalty();
      const reserveBalance = await bankInstance2.getReserveBalance();
      const reserveCollateralBalance = await bankInstance2.getReserveCollateralBalance();

      const isAdmin = await bankInstance2.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
      const isKeeper1 = await bankInstance2.hasRole(KEEPER_ROLE, randomUser3.address);
      const isKeeper2 = await bankInstance2.hasRole(KEEPER_ROLE, randomUser4.address);
      const isReporter1 = await bankInstance2.hasRole(REPORTER_ROLE, randomUser5.address);
      const isReporter2 = await bankInstance2.hasRole(REPORTER_ROLE, randomUser6.address);
      const dtAddress = await bankInstance2.getDebtTokenAddress();
      const ctAddress = await bankInstance2.getCollateralTokenAddress();
      const name = await bankInstance2.getName();
  
      assert.ok(isAdmin);
      assert.ok(isKeeper1);
      assert.ok(isKeeper2);
      assert.ok(isReporter1);
      assert.ok(isReporter2);
      assert.equal(name, BANK_NAME);
      assert(interestRate.eq(ethers.BigNumber.from(INTEREST_RATE)),"incorrect IR");
      assert(collateralizationRatio.eq(ethers.BigNumber.from(COLLATERALIZATION_RATIO)),"incorrect CR");
      assert(liquidationPenalty.eq(ethers.BigNumber.from(LIQUIDATION_PENALTY)),"incorrect LiqPen");
      assert(reserveBalance.eq(ethers.constants.Zero),"incorrect ResBal");
      assert(reserveCollateralBalance.eq(ethers.constants.Zero),"Collat Bal != 0");
      assert(dtAddress == dtInstance2x.address,"incorrect DT address");
      assert(ctAddress == ctInstance2.address,"incorrect CT address");
    });

    it('only admin role should add / remove new roles', async function () {
      const admin = await bankInstance2.getRoleMember(DEFAULT_ADMIN_ROLE, 0);
      assert((await bankInstance2.getRoleMemberCount(KEEPER_ROLE)).eq(ethers.constants.Two));
      assert((await bankInstance2.getRoleMemberCount(REPORTER_ROLE)).eq(ethers.constants.Two));
  
      // user not in role adds keeper
      await expect(bankInstance2.connect(randomUser7).addKeeper(randomUser8.address))
        .to.be.revertedWith("AccessControl");
      await expect(bankInstance2.connect(randomUser7).addReporter(randomUser8.address))
        .to.be.revertedWith("AccessControl");
  
      // keeper adds another keeper
      let keeper = (await bankInstance2.getRoleMember(KEEPER_ROLE, 0));
      let keeperSigner = await ethers.getSigner(keeper);
      await expect(bankInstance2.connect(keeperSigner).addKeeper(randomUser8.address)).to.be.revertedWith("AccessControl");
  
      // reporter adds another reporter  
      let reporter = await bankInstance2.getRoleMember(REPORTER_ROLE, 0);
      let reporterSigner = await ethers.getSigner(reporter);
      await expect(bankInstance2.connect(reporterSigner).addReporter(randomUser8.address)).to.be.revertedWith("AccessControl");
  
      // admin adds new keeper
      let adminSigner = await ethers.getSigner(admin);
      await bankInstance2.connect(adminSigner).addKeeper(randomUser8.address);
      assert((await bankInstance2.getRoleMemberCount(KEEPER_ROLE)).eq(ethers.BigNumber.from(3)));
  
      // admin adds new reporter
      await bankInstance2.connect(adminSigner).addReporter(randomUser8.address);
      assert((await bankInstance2.getRoleMemberCount(REPORTER_ROLE)).eq(ethers.BigNumber.from(3)));
  
      // keeper removes keeper
      keeper = (await bankInstance2.getRoleMember(KEEPER_ROLE, 0));
      keeperSigner = await ethers.getSigner(keeper);
      const removeKeeper = await bankInstance2.getRoleMember(KEEPER_ROLE, 1);
      await expect(bankInstance2.connect(keeperSigner).revokeKeeper(removeKeeper)).to.be.revertedWith("AccessControl");
  
      // reporter removes reporter
      reporter = await bankInstance2.getRoleMember(REPORTER_ROLE, 0);
      reporterSigner = await ethers.getSigner(reporter);
      const removeReporter = await bankInstance2.getRoleMember(REPORTER_ROLE, 1);
      await expect(bankInstance2.connect(reporterSigner).revokeReporter(removeReporter)).to.be.revertedWith("AccessControl");
  
      // admin removes keeper and updater
      await bankInstance2.connect(adminSigner).revokeKeeper(removeKeeper);
      await bankInstance2.connect(adminSigner).revokeReporter(removeReporter);
  
      assert((await bankInstance2.getRoleMemberCount(KEEPER_ROLE)).eq(ethers.BigNumber.from(2)));
      assert((await bankInstance2.getRoleMemberCount(REPORTER_ROLE)).eq(ethers.BigNumber.from(2)));
    });

    it('transferring ownership', async function () {

      await bankInstance2.connect(deployer).transferOwnership(randomUser2.address);

      assert(await bankInstance2.owner() == randomUser2.address, "owner state not changed");
      assert(await bankInstance2.hasRole(DEFAULT_ADMIN_ROLE,randomUser2.address) == true, "DEFAULT_ADMIN_ROLE not changed");

      await bankInstance2.connect(randomUser2).transferOwnership(randomUser3.address);

      assert(await bankInstance2.owner() == randomUser3.address, "owner state not changed (second)");
      assert(await bankInstance2.hasRole(DEFAULT_ADMIN_ROLE,randomUser3.address) == true, "DEFAULT_ADMIN_ROLE not changed (second)");
      
      await bankInstance2.connect(randomUser3).transferOwnership(randomUser4.address);

      assert(await bankInstance2.owner() == randomUser4.address, "owner state not changed (third)");
      assert(await bankInstance2.hasRole(DEFAULT_ADMIN_ROLE,randomUser4.address) == true, "DEFAULT_ADMIN_ROLE not changed (third)");

      await bankInstance2.connect(randomUser4).transferOwnership(deployer.address);

      assert(await bankInstance2.owner() == deployer.address, "owner state not changed (back to deployer)");
      assert(await bankInstance2.hasRole(DEFAULT_ADMIN_ROLE,deployer.address) == true, "DEFAULT_ADMIN_ROLE not changed (back to deployer)");

    })

  })

  context("reserve deposit/withdraw", function () {

    it('should allow admin to deposit reserves', async function () {
      const dtxApproveOperation = dtInstance2x.approve({
        receiver: bankInstance2.address,
        amount: depositAmount.toString()
      })
      await dtxApproveOperation.exec(deployer)
      await bankInstance2.connect(deployer).reserveDeposit(depositAmount);

      const reserveBalance = await bankInstance2.getReserveBalance();
      assert(reserveBalance.eq(depositAmount));

      const tokenBalance = await dtInstance2x.balanceOf({
        account: bankInstance2.address,
        providerOrSigner: deployer
      })
      
      assert(ethers.BigNumber.from(tokenBalance).eq(depositAmount),"Incorrect DTx balance");

      await rewindToBaseState([deployer]);
    });

    it('should allow admin to withdraw reserves', async function () {

      //- Before state
      const origDTxBalAdmin = await dtInstance2x.balanceOf({
        account: deployer.address,
        providerOrSigner: deployer
      })

      const origReserveBalance = await bankInstance2.getReserveBalance();
      //-

      //- Action
      await bankInstance2.connect(deployer).reserveWithdraw(ethers.BigNumber.from(origReserveBalance));
      //-

      //- After state
      const newDTxBalAdmin = await dtInstance2x.balanceOf({
        account: deployer.address,
        providerOrSigner: deployer
      })

      const newReserveBalance = await bankInstance2.getReserveBalance();
      //-

      //- Assertions
      assert( // Admin balance increased by amount of reserves withdrawn
        ethers.BigNumber.from(origDTxBalAdmin).add(origReserveBalance).eq(
          ethers.BigNumber.from(newDTxBalAdmin)
        ),
        "Admin balance didn't increase by amount of reserves withdrawn"
      );

      assert( // recorded reserves are zeroed out
        newReserveBalance.eq(ethers.BigNumber.from("0")),
        "reserves not zeroed out"
      );

    });

    it('should not allow non-admin to deposit reserves', async function () {
      await expect(bankInstance2.connect(randomUser2).reserveDeposit(ethers.utils.parseUnits("100"))).to.be.revertedWith("AccessControl");
    });
  
    it('should not allow non-admin to withdraw reserves', async function () {
      await expect(bankInstance2.connect(randomUser2).reserveWithdraw(ethers.utils.parseUnits("100"))).to.be.revertedWith("AccessControl");
    });
  
  })

  context("vault deposit/withdraw", function () {

    it('should allow user to withdraw collateral from vault', async function () {
      // await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
      // let user2Allowance = await ctInstance2.allowance(randomUser2.address, bankInstance2.address);
  
      await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
      await bankInstance2.connect(randomUser2).vaultWithdraw(depositAmount);
  
      const collateralAmount = await bankInstance2.getVaultCollateralAmount(randomUser2.address);
      const debtAmount = await bankInstance2.getVaultDebtAmount(randomUser2.address);
      const tokenBalance = await ctInstance2.balanceOf(bankInstance2.address);
      assert(collateralAmount.eq(ethers.constants.Zero));
      assert(debtAmount.eq(ethers.constants.Zero));
      assert(tokenBalance.eq(ethers.constants.Zero));

      await rewindToBaseState([randomUser2,deployer]);
    });

    it('should not allow user to withdraw more collateral than they have in vault', async function () {
      await ctInstance2.connect(randomUser2).approve(bankInstance2.address, depositAmount);
      await bankInstance2.connect(randomUser2).vaultDeposit(depositAmount);
      await expect(bankInstance2.connect(randomUser2).vaultWithdraw(largeDepositAmount)).to.be.revertedWith("CANNOT WITHDRAW MORE COLLATERAL");

      await rewindToBaseState([randomUser2]);
    });

  })

  context("create borrow checks", function () {

    it("should not be able to stream to bank with incorrect super token")

    it("should not be able to borrow when no reserves are available", async function () {

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await ctInstance2.connect(randomUser2).approve(bankInstance2.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // User starts stream of 20 dtInstance2x/year to bank but should fail because there is not collateral
      try {
        await ( await sf.cfaV1.createFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: "634195839675",
        }) ).exec( randomUser2 );
      } catch (e) {
        console.log("Errored out as expected - should not be able to borrow when no reserves are available");
      }

      await rewindToBaseState([randomUser2, deployer]);

    })

    it("should not be able to borrow if not enough collateral", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      const dtxApproveOperation = dtInstance2x.approve({
        receiver: bankInstance2.address,
        amount: ethers.utils.parseEther("10000000000000000000000000000000000000").toString()
      });
      await dtxApproveOperation.exec(deployer);
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("15000"));

      // User depsits 1000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await ctInstance2.connect(randomUser2).approve(bankInstance2.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("1000"));

      // User starts stream of 20 dtInstance2x/year to bank (borrow 1000) but should fail because there is not enough collateral
      let erroredOut = false;
      try {
        await ( await sf.cfaV1.createFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
        }) ).exec( randomUser2 );
      } catch (e) {
        console.log("error out as expected");
        erroredOut = true;
      }
      expect(erroredOut,"DID NOT error out as expected").to.be.true;

      await rewindToBaseState([randomUser2, deployer]);

    })

    it("should not be able to borrow if not enough collateral after price change", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      const dtxApproveOperation = dtInstance2x.approve({
        receiver: bankInstance2.address,
        amount: ethers.utils.parseEther("10000000000000000000000000000000000000").toString()
      });
      await dtxApproveOperation.exec(deployer);
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("15000"));

      await changeCollateralPrice(250);

      // User depsits 1000 USD worth of ctInstance2
      await ctInstance2.connect(randomUser2).approve(bankInstance2.address, ethers.utils.parseEther("10000000000000000000000000000000000000"));
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("4000")); // 4000 * 0.25 = 1000

      // User starts stream of 20 dtInstance2x/year to bank (borrow 1000) but should fail because there is not enough collateral
      let erroredOut = false;
      try {
        await ( await sf.cfaV1.createFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
        }) ).exec( randomUser2 );
      } catch (e) {
        console.log("error out as expected");
        erroredOut = true;
      }
      expect(erroredOut,"DID NOT error out as expected").to.be.true;

      await rewindToBaseState([randomUser2, deployer]);

    });

    it("should be able to borrow correct amount", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // Original DT balance (in gwei)
      const origDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });

      console.log("Before")
      // Interest rate payment of 20 DTx/year -> 1000 DTx loan (20/2% = 1000)
      await logTokenBalances([randomUser2, deployer]);
      // log flow rate changes
      await logFlows([randomUser2]);

      // start flow of 20 DTx/year
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      console.log("After")
      // Interest rate payment of 20 DTx/year -> 1000 DTx loan (20/2% = 1000)
      await logTokenBalances([randomUser2, deployer]);
      // log flow rate changes
      await logFlows([randomUser2]);

      const strDep = await getStreamDeposit(TEN_ETH_PER_YEAR_FLOW_RATE.mul(2), "wei");
      const newDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });

      const randomUser2FlowRate = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: randomUser2.address,
        providerOrSigner: superSigner
      });
      const bankOwnerFlowRate = await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      });
      const bankNetFlow = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: bankInstance2.address,
        providerOrSigner: superSigner
      });

      // correct balance changes (down to 4 decimals)
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origDTxBal).add(ethers.utils.parseUnits("1000")), // 1000 is expected borrow amount 
          ethers.BigNumber.from(newDTxBal).add(strDep), 
          4
        ) ) == true
      );

      // assert owner income is equal to user's outflow
      assert.equal(parseInt(randomUser2FlowRate), -parseInt(bankOwnerFlowRate.flowRate), "outflow != inflow");
      // assert bank net flow is zero
      assert.equal(bankNetFlow,"0", "non net-zero");

      assert(
        ( await closeEnough(
          ethers.BigNumber.from(
              await bankInstance2.connect(randomUser2).getReserveBalance() 
          ),
          ethers.BigNumber.from(ethers.utils.parseUnits("9000")),
          4
        ) ) == true,
        "incorrect debt change"
      );

      await rewindToBaseState([randomUser2, deployer]);

    })

  });

  context("update repay checks", function () {

    it("should not be able to repay if not enough balance", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      // User transfers away almost all his/her super tokens so there's nothing left for repay
      const dtxTransferOperation = dtInstance2x.transfer({
        receiver: randomUser.address,
        amount: ethers.utils.parseEther("14500").toString()
      });
      await dtxTransferOperation.exec( randomUser2 );

      // update flow to 10 DTx/year -> 500 DTx (10/2% = 500) -> 500 - 1000 = -500 repay
      try {
        await ( await sf.cfaV1.updateFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: TEN_ETH_PER_YEAR_FLOW_RATE,
        }) ).exec( randomUser2 );
      } catch (e) {
        console.log("Errored out as expected - should not be able to repay if user doesn't have enough debt token balance for repay");
      }

      await rewindToBaseState([randomUser2, deployer]);

    });

    it("should not be able to repay if not enough allowance", async function () {
  
        // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
        await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));
  
        // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
        await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));
  
        // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
        await ( await sf.cfaV1.createFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
        }) ).exec( randomUser2 );
  
        // User cancels approval
        const dtxTransferOperation = dtInstance2x.approve({
          receiver: bankInstance2.address,
          amount: ethers.utils.parseEther("0").toString()
        });
        await dtxTransferOperation.exec( randomUser2 );
  
        // update flow to 10 DTx/year -> 500 DTx (10/2% = 500) -> 500 - 1000 = -500 repay
        try {
          await ( await sf.cfaV1.updateFlow({
            receiver: bankInstance2.address,
            superToken: dtInstance2x.address,
            flowRate: TEN_ETH_PER_YEAR_FLOW_RATE,
          }) ).exec( randomUser2 );
        } catch (e) {
          console.log("Errored out as expected - should not be able to repay if user doesn't have enough allowance repay");
        }

        await rewindToBaseState([randomUser2, deployer]);

    })
 
    it("should be able to repay proper amounts", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // User approves bank to spend debt tokens for repay
      const dtxTransferOperation = dtInstance2x.approve({
        receiver: bankInstance2.address,
        amount: ethers.utils.parseEther("10000000000000000").toString()
      });
      await dtxTransferOperation.exec( randomUser2 );

      // Original DT balance (in gwei)
      const origDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });
      
      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      const strDep = await getStreamDeposit(TEN_ETH_PER_YEAR_FLOW_RATE.mul(2), "wei");
      const newDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });

      // log balances
      await logTokenBalances([randomUser2, deployer]);
      // log flow rate changes
      await logFlows([randomUser2]);

      const randomUser2FlowRate = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: randomUser2.address,
        providerOrSigner: superSigner
      });
      const bankOwnerFlowRate = await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      });
      const bankNetFlow = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: bankInstance2.address,
        providerOrSigner: superSigner
      });

      // correct balance changes (down to 4 decimals)
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origDTxBal).add(ethers.utils.parseUnits("1000")), // 1000 is expected borrow amount 
          ethers.BigNumber.from(newDTxBal).add(strDep), 
          4
        ) ) == true
      );

      // assert owner income is equal to user's outflow
      assert.equal(parseInt(randomUser2FlowRate), -parseInt(bankOwnerFlowRate.flowRate), "outflow != inflow");
      // assert bank net flow is zero
      assert.equal(bankNetFlow,"0", "non net-zero");

      // correct debt changes
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(
              await bankInstance2.connect(randomUser2).getReserveBalance() 
          ),
          ethers.BigNumber.from(ethers.utils.parseUnits("9000")),
          4
        ) ) == true,
        "Incorrect reserve balance!"
      );

      //// Update stream to borrow more

      // Interest rate payment of 10 DTx/year -> 500 DTx loan (10/2% = 500) -> -500 repay
      await sf.cfaV1.updateFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE,
      }).exec( randomUser2 );

      const newStrDep = await getStreamDeposit(TEN_ETH_PER_YEAR_FLOW_RATE, "wei");
      const newNewDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });

      // Interest rate payment of 20 DTx/year -> 1000 DTx loan (20/2% = 1000)
      await logTokenBalances([randomUser2, deployer]);
      // log flow rate changes
      await logFlows([randomUser2]);

      const newRandomUser2FlowRate = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: randomUser2.address,
        providerOrSigner: superSigner
      });
      const newBankOwnerFlowRate = await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      });
      const newBankNetFlow = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: bankInstance2.address,
        providerOrSigner: superSigner
      });

      // correct balance changes (down to 2 decimals) - decrease of 500 (from 1000 to 500)
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(newDTxBal).add(strDep).sub(ethers.utils.parseUnits("500")), // 500 is expected borrow amount (prev 1000)
          ethers.BigNumber.from(newNewDTxBal).add(newStrDep), 
          4
        ) ) == true,
        "Incorrect loaned out amount change"
      );

      assert(
        ( await checkDebt(
            randomUser2,
            ethers.BigNumber.from(ethers.utils.parseUnits("500")),
            4
        ) ) == true,
        "Incorrect recorded debt amount"
      );

      // assert owner income is equal to user's outflow
      assert.equal(parseInt(newRandomUser2FlowRate), -parseInt(newBankOwnerFlowRate.flowRate), "outflow != inflow");
      // assert bank net flow is zero
      assert.equal(newBankNetFlow,"0", "non net-zero");

      // correct debt changes (should have increased by 500 from 9500)
      assert(
        ( await checkReserves(
          ethers.BigNumber.from(ethers.utils.parseUnits("9500")),
          4
        ) ) == true,
        "Incorrect reserve change"
      );

      await rewindToBaseState([randomUser2, deployer]);

    })
  });

  context("update borrow checks", function () {

    it("should not be able to borrow more if not enough reserves (caused by reserveWithdraw)", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      // Admin reserve withdraws bank reserves
      await bankInstance2.connect(deployer).reserveWithdraw(ethers.utils.parseEther("9000"));

      // update flow to 30 DTx/year -> 1500 DTx (30/2% = 1500) -> 1500 - 1000 = 500 borrow
      try {
        await ( await sf.cfaV1.updateFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(3),
        }) ).exec( randomUser2 );
      } catch (e) {
        console.log("Errored out as expected - should not be able to repay if not enough debt tokens in reserve");
      }

      await rewindToBaseState([randomUser2, deployer]);

    })

    it("should not be able to borrow more if not enough reserves (caused by other borrowers)", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));
      console.log('1');
      console.log("CT Bal U2",await ctInstance2.balanceOf(randomUser2.address));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));
      console.log('2');
      // Disruptive user deposits 20000 worth of ctInstance2 
      console.log("CT Bal U3",await ctInstance2.balanceOf(randomUser3.address));
      await bankInstance2.connect(randomUser3).vaultDeposit(ethers.utils.parseEther("20000"));

      console.log("main user about to borrow");
      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      console.log("disruptive user about to borrow");
      // User 3 borrows a lot so there's none left for borrowing
      // start flow of 180 DTx/year -> 9000 DTx (180/2% = 9000) -> +9000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(18),
      }) ).exec( randomUser3 );

      console.log("entering try catch");
      // update flow to 30 DTx/year -> 1500 DTx (30/2% = 1500) -> 1500 - 1000 = 500 borrow
      try {
        await ( await sf.cfaV1.updateFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(3),
        }) ).exec( randomUser2 );
      } catch (e) {
        console.log("Errored out as expected - should not be able to repay if not enough debt tokens in reserve");
      }

      await rewindToBaseState([randomUser2, randomUser3, deployer]);

    })

    it("should not be able to borrow more if not enough collateral (borrow into undercollateralization)", async function () {
      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("1500"));

      console.log("main user about to borrow");
      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      console.log("entering try catch");
      // update flow to 40 DTx/year -> 2000 DTx (40/2% = 2000) -> 2000 - 1000 = 1000 extra borrow
      try {
        await ( await sf.cfaV1.updateFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(4),
        }) ).exec( randomUser2 );
      } catch (e) {
        console.log("Errored out as expected - should not be able to borrow into undercollateralization");
      }

      await rewindToBaseState([randomUser2, deployer]);
    });

    it("should not be able to borrow more if not enough collateral caused by price change (borrow into undercollateralization)", async function () {

      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("3000"));

      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 USD loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      // collateral price from 3000 to 1500
      await changeCollateralPrice(500);

      // update flow to 30 DTx/year -> 1000 DTx (30/2% = 1500) -> +1500 USD loan
      let revert = false;
      try{
        await sf.cfaV1.updateFlow({
          receiver: bankInstance2.address,
          superToken: dtInstance2x.address,
          flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(3),
        }).exec( randomUser2 );
      } catch (e) {
        console.log("revert as expected");
        revert = true;
      }
      expect(revert,"DID NOT revert as expected").to.be.true;

      await rewindToBaseState([randomUser2, deployer]);
    });

    it("should be able to borrow in correct amounts", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity

      // Original DT balance (in gwei)
      const origDTxBalv0 = await dtInstance2x.balanceOf({
        account: deployer.address,
        providerOrSigner: deployer
      });
      console.log("Balance of deployer before reserveDeposit", origDTxBalv0);

      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // Original DT balance (in gwei)
      const origDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });
      
      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      const strDep = await getStreamDeposit(TEN_ETH_PER_YEAR_FLOW_RATE.mul(2), "wei");
      const newDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });

      // log balances
      await logTokenBalances([randomUser2, deployer]);
      // log flow rate changes
      await logFlows([randomUser2]);

      const randomUser2FlowRate = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: randomUser2.address,
        providerOrSigner: superSigner
      });
      const bankOwnerFlowRate = await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      });
      const bankNetFlow = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: bankInstance2.address,
        providerOrSigner: superSigner
      });

      // correct balance changes (down to 4 decimals)
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origDTxBal).add(ethers.utils.parseUnits("1000")), // 1000 is expected borrow amount 
          ethers.BigNumber.from(newDTxBal).add(strDep), 
          4
        ) ) == true,
        "Incorrect loaned out amount change"
      );

      // assert owner income is equal to user's outflow
      assert.equal(parseInt(randomUser2FlowRate), -parseInt(bankOwnerFlowRate.flowRate), "outflow != inflow");
      // assert bank net flow is zero
      assert.equal(bankNetFlow,"0", "non net-zero");

      // correct debt changes
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(
              await bankInstance2.connect(randomUser2).getReserveBalance() 
          ),
          ethers.BigNumber.from(ethers.utils.parseUnits("9000")),
          4
        ) ) == true,
        "Incorrect reserve change"
      );

    });

    // not stand-alone, must run previous test before this
    it("should be able to borrow more in correct amounts", async function () {
      //// Update stream to borrow more

      // Original DT balance (in gwei)
      const origDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });

      // Interest rate payment of 30 DTx/year -> 1500 DTx loan (30/2% = 1500)
      await sf.cfaV1.updateFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(3),
      }).exec( randomUser2 );

      //// Grabbing data post-action

      const prevStrDep = await getStreamDeposit(TEN_ETH_PER_YEAR_FLOW_RATE.mul(2), "wei");
      const strDep = await getStreamDeposit(TEN_ETH_PER_YEAR_FLOW_RATE.mul(3), "wei");
      const newDTxBal = await dtInstance2x.balanceOf({
        account: randomUser2.address,
        providerOrSigner: randomUser2
      });

      // Interest rate payment of 20 DTx/year -> 1000 DTx loan (20/2% = 1000)
      await logTokenBalances([randomUser2, deployer]);
      // log flow rate changes
      await logFlows([randomUser2]);

      const newRandomUser2FlowRate = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: randomUser2.address,
        providerOrSigner: superSigner
      });
      const newBankOwnerFlowRate = await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      });
      const newBankNetFlow = await sf.cfaV1.getNetFlow({
        superToken: dtInstance2x.address,
        account: bankInstance2.address,
        providerOrSigner: superSigner
      });

      //// Post-action assertions

      // correct balance changes (down to 4 decimals) - increase of 500 (from 1000 to 1500)
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origDTxBal).add(prevStrDep).add(ethers.utils.parseUnits("500")), // 1500 is expected borrow amount (prev 1000)
          ethers.BigNumber.from(newDTxBal).add(strDep), 
          4
        ) ) == true,
        "Incorrect loaned out amount change"
      );

      // assert owner income is equal to user's outflow
      assert.equal(parseInt(newRandomUser2FlowRate), -parseInt(newBankOwnerFlowRate.flowRate), "outflow != inflow");
      // assert bank net flow is zero
      assert.equal(newBankNetFlow,"0", "non net-zero");

      // correct debt changes (should have fallen by 500 from 9000)
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(
              await bankInstance2.connect(randomUser2).getReserveBalance() 
          ),
          ethers.BigNumber.from(ethers.utils.parseUnits("8500")),
          4
        ) ) == true,
        "Incorrect reserve change"
      );

      // await rewindToBaseState([randomUser2, deployer]);

    })

    it("successful withdrawal while borrowing", async function () {

      // Original User CT balance (in gwei)
      const origCTBalUser = await ctInstance2.balanceOf(randomUser2.address);

      // Original Bank CT balance (in gwei)
      const origCTBalBank = await ctInstance2.balanceOf(bankInstance2.address);

      // Original recorded vault amount
      const origUserVaultAmount = await bankInstance2.getVaultCollateralAmount(randomUser2.address);

      // withdraw 1000 | for user, new collateral = 4000 & debt = 1500
      await bankInstance2.connect(randomUser2).vaultWithdraw(ethers.utils.parseEther("1000"))

      // Original User CT balance (in gwei)
      const newCTBalUser = await ctInstance2.balanceOf(randomUser2.address);

      // Original Bank CT balance (in gwei)
      const newCTBalBank = await ctInstance2.balanceOf(bankInstance2.address);

      // Original recorded vault amount
      const newUserVaultAmount = await bankInstance2.getVaultCollateralAmount(randomUser2.address);

      // User balance should increase
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origCTBalUser).add(ethers.utils.parseEther("1000")),
          ethers.BigNumber.from(newCTBalUser),
          4
        ) ) == true,
        "User - incorrect collateral token balance change"
      )
      
      // Bank balance should decrease
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origCTBalBank).sub(ethers.utils.parseEther("1000")),
          ethers.BigNumber.from(newCTBalBank),
          4
        ) ) == true,
        "Bank - incorrect collateral token balance change"
      )

      // recorded vault amount should have decreased
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origUserVaultAmount).sub(ethers.utils.parseEther("1000")),
          ethers.BigNumber.from(newUserVaultAmount),
          4
        ) ) == true,
        "User - incorrect vault collateral amount change"
      )
      
            
    })

    it("successful deposit while borrowing", async function () {

      // Original User CT balance (in gwei)
      const origCTBalUser = await ctInstance2.balanceOf(randomUser2.address);

      // Original Bank CT balance (in gwei)
      const origCTBalBank = await ctInstance2.balanceOf(bankInstance2.address);

      // Original recorded vault amount
      const origUserVaultAmount = await bankInstance2.getVaultCollateralAmount(randomUser2.address);

      // withdraw 1000 | for user, new collateral = 5000 & debt = 1500
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("1000"))

      // Original User CT balance (in gwei)
      const newCTBalUser = await ctInstance2.balanceOf(randomUser2.address);

      // Original Bank CT balance (in gwei)
      const newCTBalBank = await ctInstance2.balanceOf(bankInstance2.address);

      // Original recorded vault amount
      const newUserVaultAmount = await bankInstance2.getVaultCollateralAmount(randomUser2.address);

      // User balance should decrease
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origCTBalUser).sub(ethers.utils.parseEther("1000")),
          ethers.BigNumber.from(newCTBalUser),
          4
        ) ) == true,
        "User - incorrect collateral token balance change"
      );
      
      // Bank balance should increase
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origCTBalBank).add(ethers.utils.parseEther("1000")),
          ethers.BigNumber.from(newCTBalBank),
          4
        ) ) == true,
        "Bank - incorrect collateral token balance change"
      );

      // recorded vault amount should have decreased
      assert(
        ( await closeEnough(
          ethers.BigNumber.from(origUserVaultAmount).add(ethers.utils.parseEther("1000")),
          ethers.BigNumber.from(newUserVaultAmount),
          4
        ) ) == true,
        "User - incorrect vault collateral amount change"
      );

      await rewindToBaseState([randomUser2,deployer]);

    })

  })

  context("delete checks", function () {

    it("should face liquidation if not enough allowance", async function () {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      // log balances
      await logTokenBalances([randomUser2, deployer, bankInstance2]);
      // log flow rate changes
      await logFlows([randomUser2]);

      // Delete flow
      await ( await sf.cfaV1.deleteFlow({
        sender: randomUser2.address,
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address
      }) ).exec( randomUser2 );

      // log balances
      await logTokenBalances([randomUser2, deployer, bankInstance2]);
      // log flow rate changes
      await logFlows([randomUser2]);

      //// Liquidation checks

      // expect super app to not be jailed (shouldn't revert in deleteFlow callback)
      expect(await sf.host.hostContract.connect(deployer).isAppJailed(bankInstance2.address)).to.equal(false,"App is jailed!");

      // expect 25% liquidation penalty to be reflected in borrower's collateral amount state -> users collateral falls from 5000 to 5000 - (1000 * 1.25) = 3750
      expect(await bankInstance2.getVaultCollateralAmount(randomUser2.address)).to.closeTo(ethers.utils.parseEther("3750"), ethers.utils.parseEther("0.0001"));

      // expect liquidated collateral to be transferred from bank to bankOwner (deployer) 1000 * 1.25 = 1250
      expect(await ctInstance2.connect(deployer).balanceOf(deployer.address)).to.closeTo(ethers.utils.parseEther("1250"), ethers.utils.parseEther("0.0001"));

      // expect owner revenue stream is zero
      expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal("0", "interest revenue stream not cancelled")

      // expect borrower payment stream is zero
      expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: randomUser2.address,
        receiver: bankInstance2.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal("0", "interest payment stream not cancelled")

      await rewindToBaseState([randomUser2,deployer]);

    })

    it("should face liquidation if not enough balance", async function () {
      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // User approves bank to pull debt tokens for repay
      const dtxApproveOperation = await dtInstance2x.approve({
        receiver: bankInstance2.address,
        amount: ethers.utils.parseEther("100000000000000000000000").toString()
      });
      await dtxApproveOperation.exec( randomUser2 );

      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      // log balances
      await logTokenBalances([randomUser2, deployer, bankInstance2]);
      // log flow rate changes
      await logFlows([randomUser2]);

      // User transfers away almost all his/her super tokens so there's nothing left for repay
      const dtxTransferOperation = dtInstance2x.transfer({
        receiver: bankFactoryOwnerUser.address,
        amount: ethers.utils.parseEther("20000").toString()
      });
      await dtxTransferOperation.exec( randomUser2 );

      // Delete flow
      await ( await sf.cfaV1.deleteFlow({
        sender: randomUser2.address,
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address
      }) ).exec( randomUser2 );

      // log balances
      await logTokenBalances([randomUser2, deployer, bankInstance2]);
      // log flow rate changes
      await logFlows([randomUser2]);

      //// Liquidation checks

      // expect super app to not be jailed (shouldn't revert in deleteFlow callback)
      expect(await sf.host.hostContract.connect(deployer).isAppJailed(bankInstance2.address)).to.equal(false,"App is jailed!");

      // expect 25% liquidation penalty to be reflected in borrower's collateral amount state -> users collateral falls from 5000 to 5000 - (1000 * 1.25) = 3750
      expect(await bankInstance2.getVaultCollateralAmount(randomUser2.address)).to.closeTo(ethers.utils.parseEther("3750"), ethers.utils.parseEther("0.0001"));

      // expect liquidated collateral to be transferred from bank to bankOwner (deployer) 1000 * 1.25 = 1250
      expect(await ctInstance2.connect(deployer).balanceOf(deployer.address)).to.closeTo(ethers.utils.parseEther("1250"), ethers.utils.parseEther("0.0001"));

      // expect owner revenue stream is zero
      expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal("0", "interest revenue stream not cancelled")

      // expect borrower payment stream is zero
      expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: randomUser2.address,
        receiver: bankInstance2.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal("0", "interest payment stream not cancelled")

      await rewindToBaseState([randomUser2,deployer]);

    })

    it("should be able to repay proper amounts", async function () {
      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // User approves bank to pull debt tokens for repay
      const dtxApproveOperation = await dtInstance2x.approve({
        receiver: bankInstance2.address,
        amount: ethers.utils.parseEther("100000000000000000000000").toString()
      });
      await dtxApproveOperation.exec( randomUser2 );

      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      // log balances
      await logTokenBalances([randomUser2, deployer, bankInstance2]);
      // log flow rate changes
      await logFlows([randomUser2]);

      // Delete flow
      await ( await sf.cfaV1.deleteFlow({
        sender: randomUser2.address,
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address
      }) ).exec( randomUser2 );

      // log balances
      await logTokenBalances([randomUser2, deployer, bankInstance2]);
      // log flow rate changes
      await logFlows([randomUser2]);

      //// Assertions
      
      // User balance returns to original balance of 20k
      expect(await dtInstance2x.balanceOf({account:randomUser2.address,providerOrSigner:randomUser2})).to.closeTo(ethers.utils.parseEther("20000"),ethers.utils.parseEther("0.0001"),"incorrect user balance after repay");
      // Bank's balance returns to original balance of 10k
      expect(await dtInstance2x.balanceOf({account:bankInstance2.address,providerOrSigner:randomUser2})).to.closeTo(ethers.utils.parseEther("10000"),ethers.utils.parseEther("0.0001"),"banks actual liquidity incorrect");
      // Bank's recorded reserves are back at original balance of 10k
      expect(await bankInstance2.connect(deployer).getReserveBalance()).to.closeTo(ethers.utils.parseEther("10000"),ethers.utils.parseEther("0.0001"),"recorded reserve balance not restored");

      // expect owner revenue stream is zero
      expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal("0", "interest revenue stream not cancelled")

      // expect borrower payment stream is zero
      expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: randomUser2.address,
        receiver: bankInstance2.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal("0", "interest payment stream not cancelled")   
      
      await rewindToBaseState([randomUser2,deployer]);

    })

  });

  context("liquidation", function () {

    xit("tellor experimentation", async function () {
      console.log("Initial Collateral Price", await bankInstance2.getCollateralTokenPrice());
      console.log("Oracle Address", await bankInstance2.tellor());
      console.log("Plygnd Address", tp.address);

      await tp.connect(randomUser2).submitValue(RIC_QUERY_ID,uintTob32(150),0,RIC_QUERY_DATA);

      await bankInstance2.connect(deployer).updateCollateralPrice();

      console.log("Current Collateral Price", await bankInstance2.getCollateralTokenPrice());


    })

    it("successful liquidation", async function() {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      // set collateral token price down to a quarter of what it was (from 1000 to 250) (user's overall collateral value becomes 1250 while loan is 1000)      
      await tp.connect(randomUser2).submitValue(RIC_QUERY_ID,uintTob32(250),tellorNonce,RIC_QUERY_DATA);
      tellorNonce++;
      // old collateral value = 5000 * 1000    = 5000000
      // new collateral value = 5000 * 250     = 1250000
      // current debt value   = 1000 * 1000    = 1000000
      // expected collateral  = 1000000 * 1.50 = 1500000

      // Call update to set price in rexBank contract
      await bankInstance2.updateCollateralPrice();

      console.log("Required CR", await bankInstance2.getCollateralizationRatio());
      console.log("Current CR", await bankInstance2.getVaultCollateralizationRatio(randomUser2.address));

      // Liquidate and assert expectations
      await bankInstance2.liquidate(randomUser2.address,"0x")

      //// Liquidation checks

      // expect 25% liquidation penalty to be reflected in borrower's collateral amount state -> users collateral falls from 5000 to 5000 - (1000 * (1000/250) * 1.25) = 0
      await expect(await bankInstance2.getVaultCollateralAmount(randomUser2.address)).to.closeTo(ethers.utils.parseEther("0"), ethers.utils.parseEther("0.0001"));

      // expect liquidated collateral to be transferred from bank to bankOwner (deployer) 1000 * 1.25 * 1000/250 = 5000
      await expect(await ctInstance2.connect(deployer).balanceOf(deployer.address)).to.closeTo(ethers.utils.parseEther("5000"), ethers.utils.parseEther("0.0001"));

      // expect owner revenue stream is zero
      await expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal("0", "interest revenue stream not cancelled")

      // expect borrower payment stream is zero
      await expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: randomUser2.address,
        receiver: bankInstance2.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal("0", "interest payment stream not cancelled")
      
      await rewindToBaseState([randomUser2,deployer]);

    });

    it("failed liquidation", async function() {

      // Admin deposits 10,000 dtInstance2x to bank as initial lending liquidity
      await bankInstance2.connect(deployer).reserveDeposit(ethers.utils.parseEther("10000"));

      // User depsits 5000 worth of ctInstance2 (at start, ctInstance2 is worth 1000, just as dtInstance2 is)
      await bankInstance2.connect(randomUser2).vaultDeposit(ethers.utils.parseEther("5000"));

      // start flow of 20 DTx/year -> 1000 DTx (20/2% = 1000) -> +1000 loan
      await ( await sf.cfaV1.createFlow({
        receiver: bankInstance2.address,
        superToken: dtInstance2x.address,
        flowRate: TEN_ETH_PER_YEAR_FLOW_RATE.mul(2),
      }) ).exec( randomUser2 );

      // set collateral token price down to a quarter of what it was (from 1000 to 250) (user's overall collateral value becomes 1250 while loan is 1000)      
      await tp.connect(randomUser2).submitValue(RIC_QUERY_ID,uintTob32(500),tellorNonce,RIC_QUERY_DATA);
      tellorNonce++;
      // old collateral value      = 5000 * 1000    = 5000000
      // new collateral value      = 5000 * 500     = 2500000
      // current debt value        = 1000 * 1000    = 1000000
      // expected collateral value = 1000000 * 1.50 = 1500000

      // Call update to set price in rexBank contract
      await bankInstance2.connect(deployer).updateCollateralPrice();

      // Liquidate and assert expectations
      try {
        // For some reason this doesn't work. I really didn't have the patience to debug, so the try/catch is a makeshift workaround.
        await expect( await bankInstance2.liquidate(randomUser2.address,"0x" ) ).to.be.revertedWith('VAULT NOT UNDERCOLLATERALIZED');
      } catch (e) {
        expect(e.toString()).to.equal("Error: VM Exception while processing transaction: reverted with reason string 'VAULT NOT UNDERCOLLATERALIZED'");
      }

      //// Liquidation checks

      // expect collateral recorded to be unchanged
      await expect(await bankInstance2.getVaultCollateralAmount(randomUser2.address)).to.closeTo(ethers.utils.parseEther("5000"), ethers.utils.parseEther("0.0001"));

      // no release of collateral
      await expect(await ctInstance2.connect(deployer).balanceOf(deployer.address)).to.closeTo(ethers.utils.parseEther("0"), ethers.utils.parseEther("0.0001"));

      // expect owner revenue stream to remain
      await expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: bankInstance2.address,
        receiver: deployer.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal(TEN_ETH_PER_YEAR_FLOW_RATE.mul(2), "interest revenue stream not cancelled")

      // expect borrower payment stream to remain
      await expect( (await sf.cfaV1.getFlow({
        superToken: dtInstance2x.address,
        sender: randomUser2.address,
        receiver: bankInstance2.address,
        providerOrSigner: superSigner
      })).flowRate ).to.equal(TEN_ETH_PER_YEAR_FLOW_RATE.mul(2), "interest payment stream not cancelled")
      
      await rewindToBaseState([randomUser2,deployer])

    });

  })

});