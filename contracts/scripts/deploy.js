const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n🚀 Starting deployment...\n");
  
  // Get network info
  const network = hre.network.name;
  const chainId = hre.network.config.chainId;
  console.log(`📡 Network: ${network} (Chain ID: ${chainId})`);
  
  // Get deployer
  const [deployer] = await hre.ethers.getSigners();
  console.log(`👤 Deployer: ${deployer.address}`);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} ${network === 'polygon' || network === 'amoy' || network === 'mumbai' ? 'POL' : 'BNB'}\n`);
  
  // Platform wallet (for testing, use deployer; in production, use dedicated wallet)
  const platformWallet = process.env.PLATFORM_WALLET || deployer.address;
  console.log(`🏦 Platform Wallet: ${platformWallet}\n`);
  
  // Deploy CampaignFactory
  console.log("📝 Deploying CampaignFactory...");
  const CampaignFactory = await hre.ethers.getContractFactory("CampaignFactory");
  const factory = await CampaignFactory.deploy(platformWallet);
  
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  
  console.log(`✅ CampaignFactory deployed to: ${factoryAddress}`);
  
  // Get deployment transaction
  const deployTx = factory.deploymentTransaction();
  if (deployTx) {
    const receipt = await deployTx.wait();
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`💵 Deployment cost: ${hre.ethers.formatEther(receipt.gasUsed * deployTx.gasPrice)} ${network === 'polygon' || network === 'amoy' || network === 'mumbai' ? 'POL' : 'BNB'}`);
  }
  
  // Save deployment info
  const deploymentInfo = {
    network: network,
    chainId: chainId,
    factoryAddress: factoryAddress,
    platformWallet: platformWallet,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: deployTx ? deployTx.blockNumber : 'unknown',
    transactionHash: deployTx ? deployTx.hash : 'unknown'
  };
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save to deployments.json
  const deploymentsFile = path.join(deploymentsDir, "deployments.json");
  let deployments = {};
  
  if (fs.existsSync(deploymentsFile)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsFile, "utf8"));
  }
  
  deployments[chainId] = deploymentInfo;
  fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
  
  console.log(`\n💾 Deployment info saved to: ${deploymentsFile}`);
  
  // Save individual network file
  const networkFile = path.join(deploymentsDir, `${network}-${chainId}.json`);
  fs.writeFileSync(networkFile, JSON.stringify(deploymentInfo, null, 2));
  
  console.log(`💾 Network config saved to: ${networkFile}`);
  
  // Save ABI
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "CampaignFactory.sol", "CampaignFactory.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  const abiDir = path.join(deploymentsDir, "abi");
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(abiDir, "CampaignFactory.json"),
    JSON.stringify(artifact.abi, null, 2)
  );
  
  const campaignArtifactPath = path.join(__dirname, "..", "artifacts", "contracts", "Campaign.sol", "Campaign.json");
  const campaignArtifact = JSON.parse(fs.readFileSync(campaignArtifactPath, "utf8"));
  
  fs.writeFileSync(
    path.join(abiDir, "Campaign.json"),
    JSON.stringify(campaignArtifact.abi, null, 2)
  );
  
  console.log(`💾 ABIs saved to: ${abiDir}`);
  
  // Verification instructions
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\n📋 To verify on block explorer, run:");
    console.log(`npx hardhat verify --network ${network} ${factoryAddress} ${platformWallet}`);
  }
  
  console.log("\n✨ Deployment complete!\n");
  
  // Return deployment info for scripts
  return deploymentInfo;
}

// Execute if run directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
