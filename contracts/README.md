# Smart Contracts - Decentralized Crowdfunding Platform

This directory contains the Solidity smart contracts for the crowdfunding platform.

## 📁 Structure

```
contracts/
├── contracts/
│   ├── Campaign.sol           # Individual campaign contract
│   └── CampaignFactory.sol    # Factory to create campaigns
├── scripts/
│   └── deploy.js              # Deployment script
├── test/
│   ├── Campaign.test.js       # Campaign contract tests
│   └── CampaignFactory.test.js # Factory contract tests
├── hardhat.config.js          # Hardhat configuration
└── package.json               # Dependencies
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd contracts
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `PRIVATE_KEY`: Your wallet private key (NEVER commit this!)
- `ALCHEMY_API_KEY`: Alchemy API key for RPC
- `POLYGONSCAN_API_KEY`: For contract verification
- `COINMARKETCAP_API_KEY`: (Optional) For gas reporting

### 3. Compile Contracts

```bash
npm run compile
```

### 4. Run Tests

```bash
npm test
```

For coverage report:

```bash
npm run test:coverage
```

### 5. Deploy Contracts

**Local Hardhat Network:**
```bash
npx hardhat node  # In one terminal
npm run deploy    # In another terminal
```

**Polygon Mumbai Testnet:**
```bash
npm run deploy:mumbai
```

**Polygon Mainnet:**
```bash
npm run deploy:polygon
```

**opBNB Testnet:**
```bash
npm run deploy:opbnb-testnet
```

**opBNB Mainnet:**
```bash
npm run deploy:opbnb
```

### 6. Verify Contracts

**Polygon:**
```bash
npx hardhat verify --network polygon <FACTORY_ADDRESS> <PLATFORM_WALLET>
```

**opBNB:**
```bash
npx hardhat verify --network opbnb <FACTORY_ADDRESS> <PLATFORM_WALLET>
```

## 📝 Contract Overview

### Campaign.sol

Individual crowdfunding campaign contract with:
- Escrow functionality
- Reward tier system
- Automatic refunds for failed campaigns
- 2% platform fee
- Pausable emergency stop

**Key Functions:**
- `contribute()` - Make a contribution
- `withdraw()` - Founder withdraws funds (successful campaigns)
- `refund()` - Contributors get refund (failed campaigns)
- `addRewardTier()` - Founder adds reward tiers
- `updateState()` - Update campaign state after deadline

### CampaignFactory.sol

Factory contract to create and manage campaigns:
- Deploys new Campaign instances
- Maintains campaign registry
- Tracks campaigns by founder
- Platform statistics

**Key Functions:**
- `createCampaign()` - Deploy new campaign
- `getCampaigns()` - Get all campaigns (paginated)
- `getCampaignsByFounder()` - Get campaigns by founder
- `getPlatformStats()` - Get platform statistics

## 🧪 Testing

The test suite covers:
- ✅ Contract deployment
- ✅ Campaign creation
- ✅ Contributions and tracking
- ✅ Reward tier assignment
- ✅ Successful withdrawals with platform fees
- ✅ Failed campaign refunds
- ✅ State transitions
- ✅ Access control
- ✅ Emergency pause
- ✅ Edge cases and errors

Run tests with:
```bash
npm test
```

## 🌐 Supported Networks

| Network | Chain ID | Status | Gas Token |
|---------|----------|--------|-----------|
| Polygon Amoy Testnet | 80002 | ✅ Ready | POL |
| Polygon Mainnet | 137 | ✅ Ready | POL |
| opBNB Testnet | 5611 | ✅ Ready | BNB |
| opBNB Mainnet | 204 | ✅ Ready | BNB |
| Hardhat Local | 31337 | ✅ Ready | ETH |

## 💰 Gas Optimization

Contracts are optimized for gas efficiency:
- Solidity 0.8.20 with optimizer (200 runs)
- Efficient storage patterns
- Minimal external calls
- Event emissions for off-chain indexing

**Estimated Gas Costs:**

| Operation | Polygon | opBNB |
|-----------|---------|-------|
| Deploy Factory | ~2M gas ($0.06) | ~2M gas ($0.002) |
| Create Campaign | ~500K gas ($0.015) | ~500K gas ($0.0005) |
| Contribute | ~100K gas ($0.003) | ~100K gas ($0.0001) |
| Withdraw | ~80K gas ($0.0024) | ~80K gas ($0.00008) |

## 📊 Deployment Info

After deployment, contract information is saved to:
- `deployments/deployments.json` - All network deployments
- `deployments/<network>-<chainId>.json` - Individual network config
- `deployments/abi/` - Contract ABIs for frontend integration

## 🔒 Security

Security features:
- OpenZeppelin contracts (Ownable, ReentrancyGuard, Pausable)
- Reentrancy protection on all fund transfers
- Integer overflow protection (Solidity 0.8+)
- Access control on sensitive functions
- Emergency pause mechanism
- Comprehensive test coverage

**Security Checklist:**
- ✅ Reentrancy guards on withdrawals/refunds
- ✅ Checks-effects-interactions pattern
- ✅ SafeMath (built-in Solidity 0.8+)
- ✅ Access control via OpenZeppelin
- ✅ Emergency pause function
- ✅ No delegatecall or selfdestruct
- ✅ Event emissions for transparency

## 🐛 Troubleshooting

**"Insufficient funds" error:**
- Ensure your wallet has enough POL/BNB for gas
- Get testnet tokens from faucets:
  - Polygon Amoy: https://faucet.polygon.technology/
  - opBNB Testnet: https://opbnb-testnet-bridge.bnbchain.org/

**"Invalid nonce" error:**
- Reset your Hardhat network: `npx hardhat clean`
- Or reset MetaMask account nonce in settings

**"Contract verification failed":**
- Ensure all constructor parameters match deployment
- Wait a few minutes for block explorer to index
- Check network name matches exactly

**"Transaction underpriced":**
- Increase gasPrice in `hardhat.config.js`
- Current Polygon: 30 Gwei
- Current opBNB: 1 Gwei

## 📚 Resources

- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- [Polygon Documentation](https://docs.polygon.technology/)
- [opBNB Documentation](https://docs.bnbchain.org/opbnb-docs/)
- [Ethers.js v6](https://docs.ethers.org/v6/)

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Write/update tests
4. Ensure all tests pass
5. Submit a pull request

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Check existing tests for usage examples
- Review documentation in `/docs` folder

---

**Last Updated**: November 14, 2025
**Solidity Version**: 0.8.20
**Hardhat Version**: 2.19.0
