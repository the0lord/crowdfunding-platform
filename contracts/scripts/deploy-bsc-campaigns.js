const hre = require("hardhat");
const fs = require("fs");

/**
 * Deploy Campaign contracts + MockKGST to BSC Testnet
 * 
 * On mainnet, replace MockKGST address with real KGST:
 * 0x94be0bbA8E1E303fE998c9360B57b826F1A4f828
 */
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  
  console.log("=".repeat(60));
  console.log("KGST CROWDFUNDING — BSC DEPLOYMENT");
  console.log("=".repeat(60));
  console.log(`Network:  ${network}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} BNB`);
  console.log("");

  let kgstAddress;

  // ─────────────────────── 1. KGST Token ───────────────────────
  if (network === "bsc") {
    // Mainnet: use the REAL KGST token
    kgstAddress = "0x94be0bbA8E1E303fE998c9360B57b826F1A4f828";
    console.log("1. Using REAL KGST token:", kgstAddress);
  } else {
    // Testnet / local: deploy MockKGST
    console.log("1. Deploying MockKGST...");
    const MockKGST = await hre.ethers.getContractFactory("MockKGST");
    const mockKgst = await MockKGST.deploy();
    await mockKgst.waitForDeployment();
    kgstAddress = await mockKgst.getAddress();
    console.log("   MockKGST deployed to:", kgstAddress);
  }

  // ─────────────────────── 2. Campaign Implementation ───────────
  console.log("\n2. Deploying Campaign implementation (for clones)...");
  const Campaign = await hre.ethers.getContractFactory("contracts/CampaignClone.sol:Campaign");
  const campaignImpl = await Campaign.deploy();
  await campaignImpl.waitForDeployment();
  const campaignImplAddr = await campaignImpl.getAddress();
  console.log("   Campaign implementation:", campaignImplAddr);

  // ─────────────────────── 3. CampaignFactoryClone ──────────────
  console.log("\n3. Deploying CampaignFactoryClone...");
  const CampaignFactoryClone = await hre.ethers.getContractFactory("CampaignFactoryClone");
  const factory = await CampaignFactoryClone.deploy(
    deployer.address,       // platformWallet (receives fees)
    campaignImplAddr,       // campaign implementation
    kgstAddress             // payment token (KGST)
  );
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("   CampaignFactoryClone:", factoryAddr);

  // ─────────────────────── Summary ──────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("BSC DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  KGST Token:       ${kgstAddress} ${network === "bsc" ? "(REAL)" : "(MOCK)"}`);
  console.log(`  Campaign Impl:    ${campaignImplAddr}`);
  console.log(`  CampaignFactory:  ${factoryAddr}`);
  console.log("=".repeat(60));

  // Save deployment info
  const deployDir = `./deployments`;
  if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const deployment = {
    network,
    chainId: Number(chainId),
    deployer: deployer.address,
    contracts: {
      KGST: kgstAddress,
      CampaignImplementation: campaignImplAddr,
      CampaignFactory: factoryAddr,
    },
    isRealKGST: network === "bsc",
    realKGSTAddress: "0x94be0bbA8E1E303fE998c9360B57b826F1A4f828",
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    `${deployDir}/bsc-${chainId}.json`,
    JSON.stringify(deployment, null, 2)
  );
  console.log(`\nSaved to deployments/bsc-${chainId}.json`);

  // Export ABIs
  const abiDir = `${deployDir}/abi`;
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

  const campaignArtifact = await hre.artifacts.readArtifact("contracts/CampaignClone.sol:Campaign");
  const factoryArtifact = await hre.artifacts.readArtifact("CampaignFactoryClone");
  const mockKgstArtifact = await hre.artifacts.readArtifact("MockKGST");

  fs.writeFileSync(`${abiDir}/Campaign.json`, JSON.stringify(campaignArtifact.abi, null, 2));
  fs.writeFileSync(`${abiDir}/CampaignFactory.json`, JSON.stringify(factoryArtifact.abi, null, 2));
  fs.writeFileSync(`${abiDir}/MockKGST.json`, JSON.stringify(mockKgstArtifact.abi, null, 2));
  console.log("ABIs exported to deployments/abi/");

  // Verify on explorer (if not local)
  if (network !== "hardhat" && network !== "localhost") {
    console.log("\nWaiting 15s before verification...");
    await new Promise(r => setTimeout(r, 15000));

    const toVerify = [
      { address: campaignImplAddr, args: [], name: "Campaign" },
      { address: factoryAddr, args: [deployer.address, campaignImplAddr, kgstAddress], name: "CampaignFactoryClone" },
    ];

    if (network !== "bsc") {
      toVerify.unshift({ address: kgstAddress, args: [], name: "MockKGST" });
    }

    for (const c of toVerify) {
      try {
        console.log(`Verifying ${c.name}...`);
        await hre.run("verify:verify", { address: c.address, constructorArguments: c.args });
        console.log(`  ✅ ${c.name} verified`);
      } catch (err) {
        console.log(`  ⚠️  ${c.name}: ${err.message.slice(0, 80)}`);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
