// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract RICToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("Ricochet", "RIC") {
        _mint(msg.sender, initialSupply);
    }

    function mint(address mintTo, uint256 mintAmount) external {
        _mint(mintTo, mintAmount);
    }
}
// The default value of decimals is 18. To select a different value for decimals you should overload it.