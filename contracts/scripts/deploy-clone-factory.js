const hre = require("hardhat");

async function main() {
  console.log("\n=== Deploying Clone Pattern Factory ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  
  // Check balance
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "POL\n");
  
  // Platform wallet address
  const platformWallet = deployer.address; // Using deployer as platform wallet
  
  // Step 1: Deploy Campaign implementation contract
  console.log("📦 Step 1/3: Deploying Campaign implementation...");
  const CampaignClone = await hre.ethers.getContractFactory("contracts/CampaignClone.sol:Campaign");
  
  const campaignImpl = await CampaignClone.deploy();
  await campaignImpl.waitForDeployment();
  const campaignImplAddress = await campaignImpl.getAddress();
  
  console.log("✅ Campaign implementation deployed to:", campaignImplAddress);
  
  // Get deployment transaction details
  const implDeployTx = campaignImpl.deploymentTransaction();
  const implReceipt = await implDeployTx.wait();
  console.log("   Gas used:", implReceipt.gasUsed.toString());
  console.log("   Block:", implReceipt.blockNumber);
  
  // Step 2: Deploy CampaignFactoryClone
  console.log("\n📦 Step 2/3: Deploying CampaignFactoryClone...");
  const CampaignFactoryClone = await hre.ethers.getContractFactory("CampaignFactoryClone");
  
  const factory = await CampaignFactoryClone.deploy(platformWallet, campaignImplAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  
  console.log("✅ CampaignFactoryClone deployed to:", factoryAddress);
  
  // Get factory deployment details
  const factoryDeployTx = factory.deploymentTransaction();
  const factoryReceipt = await factoryDeployTx.wait();
  console.log("   Gas used:", factoryReceipt.gasUsed.toString());
  console.log("   Block:", factoryReceipt.blockNumber);
  
  // Step 3: Verification info
  console.log("\n📝 Step 3/3: Contract Verification Commands\n");
  
  console.log("Verify Campaign Implementation:");
  console.log(`npx hardhat verify --network polygonAmoy ${campaignImplAddress}`);
  
  console.log("\nVerify Factory:");
  console.log(`npx hardhat verify --network polygonAmoy ${factoryAddress} "${platformWallet}" "${campaignImplAddress}"`);
  
  // Summary
  console.log("\n=== Deployment Summary ===\n");
  console.log("Network:", hre.network.name);
  console.log("Deployer:", deployer.address);
  console.log("Platform Wallet:", platformWallet);
  console.log("\nContracts:");
  console.log("  Campaign Implementation:", campaignImplAddress);
  console.log("  Factory:", factoryAddress);
  
  const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
  const cost = balance - finalBalance;
  console.log("\nDeployment Cost:", hre.ethers.formatEther(cost), "POL");
  console.log("Remaining Balance:", hre.ethers.formatEther(finalBalance), "POL");
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    platformWallet: platformWallet,
    campaignImplementation: campaignImplAddress,
    factory: factoryAddress,
    deploymentCost: hre.ethers.formatEther(cost),
    timestamp: new Date().toISOString(),
    blocks: {
      implementation: implReceipt.blockNumber,
      factory: factoryReceipt.blockNumber
    },
    gasUsed: {
      implementation: implReceipt.gasUsed.toString(),
      factory: factoryReceipt.gasUsed.toString()
    }
  };
  
  console.log("\n💾 Deployment info saved for reference");
  
  return deploymentInfo;
}

main()
  .then((deploymentInfo) => {
    console.log("\n✅ Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
