// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import {
    ISuperfluid,
    ISuperToken
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {
    IConstantFlowAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

/**
 * @title BankStorage
 * This contract provides the data structures, variables, and getters for Bank
 */
contract BankStorage {
    /*Variables*/
    // Label for bank (i.e. "rexBank v1.0")
    string public name;
    // Owner (possesses DEFAULT_ADMIN_ROLE)
    address public owner;
    // role identifier for keeper that can make liquidations
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    // role identifier for price updater
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    struct Reserve {
        uint256 collateralBalance;
        uint256 debtBalance;
        uint256 interestRate;
        uint256 collateralizationRatio;
        uint256 liquidationPenalty;
        address oracleContract;
        uint256 period;
    }

    struct Token {
        address tokenAddress;
        string tokenSymbol; // for Tellor _queryID encoding
        uint256 price;
        uint256 priceGranularity;
        uint256 reserveBalance;
        uint256 lastUpdatedAt;
    }

    struct Vault {
        uint256 collateralAmount;
        uint256 debtAmount;
        int96 interestPaymentFlow;
    }

    struct SF {
        ISuperfluid host;
        IConstantFlowAgreementV1 cfa;
    }

    mapping(address => Vault) public vaults;

    int96 recordedOwnerFlow; // such that we can restore flow upon owner rogue deletion

    Token debt;
    Token collateral;
    Reserve reserve;
    SF superfluid;

    /**
     * @dev Getter function for the bank name
     * @return bank name
     */
    function getName() public view returns (string memory) {
        return name;
    }

    /**
     * @dev Getter function for the current interest rate
     * @return interest rate
     */
    function getInterestRate() public view returns (uint256) {
        return reserve.interestRate;
    }

    /**
     * @dev Getter function for the current collateralization ratio
     * @return collateralization ratio
     */
    function getCollateralizationRatio() public view returns (uint256) {
        return reserve.collateralizationRatio;
    }

    /**
     * @dev Getter function for the liquidation penalty
     * @return liquidation penalty
     */
    function getLiquidationPenalty() public view returns (uint256) {
        return reserve.liquidationPenalty;
    }

    /**
     * @dev Getter function for debt token address
     * @return debt token price
     */
    function getDebtTokenAddress() public view returns (address) {
        return debt.tokenAddress;
    }

    /**
     * @dev Getter function for the debt token(reserve) price
     * @return debt token price
     */
    function getDebtTokenPrice() public view returns (uint256) {
        return debt.price;
    }

    /**
     * @dev Getter function for the debt token price granularity
     * @return debt token price granularity
     */
    function getDebtTokenPriceGranularity() public view returns (uint256) {
        return debt.priceGranularity;
    }

    /**
     * @dev Getter function for the debt token last update time
     * @return debt token last update time
     */
    function getDebtTokenLastUpdatedAt() public view returns (uint256) {
        return debt.lastUpdatedAt;
    }

    /**
     * @dev Getter function for debt token address
     * @return debt token price
     */
    function getCollateralTokenAddress() public view returns (address) {
        return collateral.tokenAddress;
    }

    /**
     * @dev Getter function for the collateral token price
     * @return collateral token price
     */
    function getCollateralTokenPrice() public view returns (uint256) {
        return collateral.price;
    }

    /**
     * @dev Getter function for the collateral token price granularity
     * @return collateral token price granularity
     */
    function getCollateralTokenPriceGranularity()
        public
        view
        returns (uint256)
    {
        return collateral.priceGranularity;
    }

    /**
     * @dev Getter function for the collateral token last update time
     * @return collateral token last update time
     */
    function getCollateralTokenLastUpdatedAt() public view returns (uint256) {
        return collateral.lastUpdatedAt;
    }

    /**
     * @dev Getter function for the debt token(reserve) balance
     * @return debt reserve balance
     */
    function getReserveBalance() public view returns (uint256) {
        return reserve.debtBalance;
    }

    /** // don't think tracking this is really necessary
     * @dev Getter function for the debt reserve collateral balance
     * @return collateral reserve balance
     */
    function getReserveCollateralBalance() public view returns (uint256) {
        return reserve.collateralBalance;
    }

    /**
     * @dev Getter function for the user's vault collateral amount
     * @return collateral amount
     */
    function getVaultCollateralAmount(address vaultOwner) public view returns (uint256) {
        return vaults[vaultOwner].collateralAmount;
    }

    /**
     * @dev Getter function for the user's vault debt amount
     * @return debt amount
     */
    function getVaultDebtAmount(address vaultOwner) public view returns (uint256) {
        return vaults[vaultOwner].debtAmount;
    }
    
    /**
     * @dev Getter function for the user's vault interest payment flow rate
     * @return flow rate
     */
    function getVaultInterestPaymentFlowAmount(address vaultOwner) public view returns (int96) {
        return vaults[vaultOwner].interestPaymentFlow;
    }

    /**
     * @dev Getter function for the collateralization ratio (collateral over debt)
     * @return collateralization ratio
     */
    function getVaultCollateralizationRatio(address vaultOwner)
        public
        view
        returns (uint256)
    {
        if (vaults[vaultOwner].debtAmount == 0) {
            return 0;
        } else {
            return
                (((vaults[vaultOwner].collateralAmount * collateral.price) /
                    collateral.priceGranularity) * 10000) /                    // is that 10,000 needed??
                ((vaults[vaultOwner].debtAmount * debt.price) /
                    debt.priceGranularity);
        }
    }
}
