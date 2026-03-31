// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockKGST
 * @notice Test token mimicking the real KGST (BEP-20 on BSC mainnet: 0x94be0bbA8E1E303fE998c9360B57b826F1A4f828)
 * @dev For BSC testnet ONLY — has a public faucet so anyone can mint test tokens.
 *      On mainnet, the platform uses the real KGST token instead.
 */
contract MockKGST is ERC20, Ownable {

    uint256 public constant FAUCET_AMOUNT = 10_000 * 1e18; // 10,000 KGST per claim
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    mapping(address => uint256) public lastClaim;

    event FaucetClaim(address indexed user, uint256 amount);

    constructor() ERC20("Kyrgyz Som Token (Test)", "KGST") Ownable(msg.sender) {
        // Mint initial supply to deployer for liquidity / testing
        _mint(msg.sender, 1_000_000 * 1e18);
    }

    /**
     * @notice Anyone can claim test KGST (once per hour)
     */
    function faucet() external {
        require(
            block.timestamp >= lastClaim[msg.sender] + FAUCET_COOLDOWN,
            "Faucet: wait before claiming again"
        );
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        emit FaucetClaim(msg.sender, FAUCET_AMOUNT);
    }

    /**
     * @notice Owner can mint any amount (for test setup)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
