require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";
const ETHERSCAN_API_KEY =
  process.env.ETHERSCAN_API_KEY ||
  process.env.POLYGONSCAN_API_KEY ||
  process.env.BSCSCAN_API_KEY ||
  "";
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
      {
        version: "0.8.27",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
        },
      },
    ],
  },
  
  networks: {
    hardhat: {
      chainId: 31337,
    },
    
    // Polygon Mumbai Testnet (DEPRECATED - use Amoy)
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      chainId: 80001,
      accounts: [PRIVATE_KEY],
      gasPrice: 30000000000, // 30 Gwei
    },
    
    // Polygon Amoy Testnet (NEW)
    amoy: {
      url: "https://rpc-amoy.polygon.technology/",
      chainId: 80002,
      accounts: [PRIVATE_KEY],
      gasPrice: 30000000000,
    },
    
    // Polygon Mainnet
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      chainId: 137,
      accounts: [PRIVATE_KEY],
      gasPrice: 30000000000, // 30 Gwei
    },
    
    // BSC Testnet (for KGST campaigns)
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: [PRIVATE_KEY],
      gasPrice: 100000000, // 0.1 Gwei (BSC testnet minimum)
    },
    
    // BSC Mainnet (real KGST at 0x94be0bbA8E1E303fE998c9360B57b826F1A4f828)
    bsc: {
      url: "https://bsc-dataseed.bnbchain.org/",
      chainId: 56,
      accounts: [PRIVATE_KEY],
      gasPrice: 3000000000, // 3 Gwei
    },
    
    // opBNB Testnet
    opbnbTestnet: {
      url: "https://opbnb-testnet-rpc.bnbchain.org",
      chainId: 5611,
      accounts: [PRIVATE_KEY],
      gasPrice: 1000000000, // 1 Gwei
    },
    
    // opBNB Mainnet
    opbnb: {
      url: "https://opbnb-mainnet-rpc.bnbchain.org",
      chainId: 204,
      accounts: [PRIVATE_KEY],
      gasPrice: 1000000000, // 1 Gwei
    },
  },
  
  etherscan: {
    // A single key enables Hardhat's Etherscan V2 path for all supported chains.
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "opbnb",
        chainId: 204,
        urls: {
          apiURL: "https://api-opbnb.bscscan.com/api",
          browserURL: "https://opbnbscan.com"
        }
      },
      {
        network: "opbnbTestnet",
        chainId: 5611,
        urls: {
          apiURL: "https://api-opbnb-testnet.bscscan.com/api",
          browserURL: "https://opbnb-testnet.bscscan.com"
        }
      }
    ]
  },
  
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || "",
  },
  
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
};
