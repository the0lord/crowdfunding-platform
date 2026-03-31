const hre = require("hardhat");
const fs = require("fs");

/**
 * Deploy remaining BSC contracts (Campaign impl + Factory)
 * MockKGST already deployed at 0x1523a1328E35782eBe096B1d12BBd9d302f3406C
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} BNB`);

  const kgstAddress = "0x1523a1328E35782eBe096B1d12BBd9d302f3406C";
  console.log(`\nUsing MockKGST (already deployed): ${kgstAddress}`);

  // 1. Campaign Implementation
  console.log("\nDeploying Campaign implementation...");
  const Campaign = await hre.ethers.getContractFactory("contracts/CampaignClone.sol:Campaign");
  const campaignImpl = await Campaign.deploy();
  await campaignImpl.waitForDeployment();
  const campaignImplAddr = await campaignImpl.getAddress();
  console.log("  Campaign implementation:", campaignImplAddr);

  // 2. CampaignFactoryClone
  console.log("\nDeploying CampaignFactoryClone...");
  const Factory = await hre.ethers.getContractFactory("CampaignFactoryClone");
  const factory = await Factory.deploy(
    deployer.address,
    campaignImplAddr,
    kgstAddress
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("  CampaignFactoryClone:", factoryAddr);

  // Summary
  const balAfter = await hre.ethers.provider.getBalance(deployer.address);
  console.log("\n" + "=".repeat(50));
  console.log("BSC TESTNET DEPLOYMENT COMPLETE");
  console.log("=".repeat(50));
  console.log(`  MockKGST:         ${kgstAddress}`);
  console.log(`  Campaign Impl:    ${campaignImplAddr}`);
  console.log(`  CampaignFactory:  ${factoryAddr}`);
  console.log(`  Gas spent:        ${hre.ethers.formatEther(balance - balAfter)} BNB`);
  console.log("=".repeat(50));

  // Save deployment
  const deployDir = "./deployments";
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });
  
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  fs.writeFileSync(`${deployDir}/bsc-${chainId}.json`, JSON.stringify({
    network: "bscTestnet",
    chainId: Number(chainId),
    deployer: deployer.address,
    contracts: {
      KGST: kgstAddress,
      CampaignImplementation: campaignImplAddr,
      CampaignFactory: factoryAddr,
    },
    isRealKGST: false,
    deployedAt: new Date().toISOString(),
  }, null, 2));
  console.log(`\nSaved to deployments/bsc-${chainId}.json`);

  // Export ABIs
  const abiDir = `${deployDir}/abi`;
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });
  
  const campaignArt = await hre.artifacts.readArtifact("contracts/CampaignClone.sol:Campaign");
  const factoryArt = await hre.artifacts.readArtifact("CampaignFactoryClone");
  const mockKgstArt = await hre.artifacts.readArtifact("MockKGST");
  
  fs.writeFileSync(`${abiDir}/Campaign.json`, JSON.stringify(campaignArt.abi, null, 2));
  fs.writeFileSync(`${abiDir}/CampaignFactory.json`, JSON.stringify(factoryArt.abi, null, 2));
  fs.writeFileSync(`${abiDir}/MockKGST.json`, JSON.stringify(mockKgstArt.abi, null, 2));
  console.log("ABIs exported.");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
