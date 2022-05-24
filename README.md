# Rex-bank

This is Ricochet project for managing fixed-rate collateral-backed lending on with interest paid in real-time via Superfluid stream. This repository contains the core smart contracts and the tests written in *Typescript* using the framework *hardhat* and the *ethers* library.

# Smart Contract Summary
On deployment, the bank _deployer_ specifies the following parameters via constructor:

* **Host:** Superfluid host contract - https://docs.superfluid.finance/superfluid/protocol-developers/networks
* **CFA:** Constant Flow Agreement Resolver - https://docs.superfluid.finance/superfluid/protocol-developers/networks
* **Registration Key:** - Key issued by Superfluid to allow mainnet deployment. Can be blank for test/testnets
* **Owner:** - Owner with DEFAULT_ADMIN_ROLE permissions (doesn't have to be deployer)
* **Interest Rate:** - The annual interest rate the bank charges borrowers
* **Collateralization Ratio:** - The loan-to-value amount borrowers must maintain to avoid a liquidation
* **Liquidation Penalty:** - The fixed fee charged to borrowers who get liquidated
* **Oracle Contract:** - The Tellor oracle contract from which price data will be pulled for RIC and USDC tokens

## Rinkeby Testnet Basic Usage

`Current Testnet Deployment: 0xEa3e612ab0f415c87740b140C21B5d7153f4FAC8`

### Before doing anything
1. Mint yourself some collateral tokens (RIC) [here]()
2. Mint yourself some debt tokens (fUSDC) [here](https://rinkeby.etherscan.io/address/0xbe49ac1eadac65dccf204d4df81d650b50122ab2#writeContract)
3. Upgrade your debt tokens to super debt tokens here
3. Approve rexBank for spending of collateral token
4. Approve rexBank for spending of super debt token (this is important because you could unintentionally face liquidation if this is not done)

### 1. Depositing collateral token
With enough balance and allowance for collateral token, call the below with desired amount
```
vaultDeposit(uint256 amount)
```

### 2. Borrow super debt token
Get correct flow rate that will yield desired borrow amount with below Borrow Amount Formula

```
Borrow Amount Formula:

Desired Borrow Amount * Interest Rate (APR) = Payment Flow Rate (as a yearly rate)

Example:

1000 USDCx * 2% = 20 USDCx/year
```
Head to [Superfluid Dashboard](https://app.superfluid.finance) and start a flow to the rexBank in the proper rate

### 3. Partial Repay / Additional Borrow
Update flow to a higher or lower rate to borrow more or partially repay loan. Use Borrow Amount Formula to reassess targeted new debt amount.

### 4. Full Repay / Self-Liquidate
Cancel your stream to the bank. This will attempt to pull the super debt tokens out of your wallet to repay the loan in full. 

If you:
- Do not have enough super debt tokens in your wallet to repay the loan in full
- or have not approved the rexBank to spend your super debt tokens

You will be liquidated. Otherwise, you will have repaid the loan.

## Working with the Tellor Oracle on Localhost (deprecated)
Initialize the oracle objects and get accounts:
```
let oracle = await TellorMaster.deployed()
let oracleAddress = (web3.utils.toChecksumAddress(oracle.address))
let oracle2 = await new web3.eth.Contract(Tellor.abi, oracleAddress)
let accounts = await web3.eth.getAccounts()
```
Then make a request to the oracle:
```
await web3.eth.sendTransaction({to: oracleAddress, from: accounts[0], gas: 4000000, data: oracle2.methods.requestData("USDT","USDT/USD",1000,0).encodeABI()})
```
Next, submit 5 values through mining:
```
await web3.eth.sendTransaction({to: oracle.address, from: accounts[1],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
await web3.eth.sendTransaction({to: oracle.address, from: accounts[2],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
await web3.eth.sendTransaction({to: oracle.address, from: accounts[3],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
await web3.eth.sendTransaction({to: oracle.address, from: accounts[4],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
await web3.eth.sendTransaction({to: oracle.address, from: accounts[5],gas:4000000, data: oracle2.methods.submitMiningSolution("nonce", 1, 1000000).encodeABI()})
```
Because the Bank contract is UsingTellor, you can get the current data from the oracle using:
```
let vars = await bank.getCurrentValue.call(1)
```
And the price will be contained in `vars[1]`.

And you can update the price with:
```
await bank.updatePrice({from: accounts[0]})
```

## Smoke Testing After Deployment
In addition to the unit tests, you can run these tests manually after the contract has been deployed to confirm everything works correctly through the DApp:

- [ ] Update the debt and collateral token prices
- [ ] As the owner, deposit debt tokens
- [ ] As a borrower, deposit collateral and withdraw some debt
- [ ] - Borrow and repay debt
- [ ] - Add and remove collateral
- [ ] - Repay all the debt and withdraw all collateral
- [ ] With a borrower undercollateralized, liquidate the borrower
- [ ] As the owner, withdraw collateral and debt

