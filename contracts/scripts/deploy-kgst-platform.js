const hre = require("hardhat");

function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return parsed;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const isDemoNetwork = ["hardhat", "localhost", "amoy"].includes(network);
  const votingDelayBlocks = parseNumber(process.env.DAO_VOTING_DELAY_BLOCKS, isDemoNetwork ? 1 : 7200);
  const votingPeriodBlocks = parseNumber(process.env.DAO_VOTING_PERIOD_BLOCKS, isDemoNetwork ? 40 : 36000);
  const proposalThresholdGov = process.env.DAO_PROPOSAL_THRESHOLD_GOV || "100";
  const proposalThreshold = hre.ethers.parseEther(proposalThresholdGov);
  const quorumPercent = parseNumber(process.env.DAO_QUORUM_PERCENT, 4);
  const minDelay = parseNumber(process.env.DAO_TIMELOCK_DELAY_SECONDS, isDemoNetwork ? 60 : 172800);
  const bootstrapGovAmount = hre.ethers.parseEther(process.env.DAO_BOOTSTRAP_GOV_AMOUNT || "1000");

  console.log("Deploying KGST Platform contracts with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "POL");
  console.log("Network:", network);
  console.log("Governance settings:", {
    votingDelayBlocks,
    votingPeriodBlocks,
    proposalThresholdGov,
    quorumPercent,
    minDelay,
    bootstrapGovAmount: hre.ethers.formatEther(bootstrapGovAmount),
  });
  console.log("---");

  // ─────────────────────── 1. Deploy UserRegistry ───────────────────────
  console.log("\n1. Deploying UserRegistry...");
  const UserRegistry = await hre.ethers.getContractFactory("UserRegistry");
  const userRegistry = await UserRegistry.deploy(deployer.address);
  await userRegistry.waitForDeployment();
  const userRegistryAddr = await userRegistry.getAddress();
  console.log("   UserRegistry deployed to:", userRegistryAddr);

  // ─────────────────────── 2. Deploy KGST Token ─────────────────────────
  console.log("\n2. Deploying KGST Token...");
  const KGST = await hre.ethers.getContractFactory("KGST");
  const kgst = await KGST.deploy(deployer.address);
  await kgst.waitForDeployment();
  const kgstAddr = await kgst.getAddress();
  console.log("   KGST deployed to:", kgstAddr);

  // Link KGST to UserRegistry
  console.log("   Setting UserRegistry on KGST...");
  const setRegistryTx = await kgst.setUserRegistry(userRegistryAddr);
  await setRegistryTx.wait();
  console.log("   UserRegistry linked.");

  // ─────────────────────── 3. Deploy GovernanceToken ────────────────────
  console.log("\n3. Deploying GovernanceToken (GOV)...");
  const GovernanceToken = await hre.ethers.getContractFactory("GovernanceToken");
  const govToken = await GovernanceToken.deploy(deployer.address);
  await govToken.waitForDeployment();
  const govTokenAddr = await govToken.getAddress();
  console.log("   GovernanceToken deployed to:", govTokenAddr);

  // ─────────────────────── 4. Deploy TimelockController ─────────────────
  console.log("\n4. Deploying TimelockController...");
  const TimelockController = await hre.ethers.getContractFactory("TimelockController");
  const timelock = await TimelockController.deploy(
    minDelay,
    [],
    [],
    deployer.address     // admin
  );
  await timelock.waitForDeployment();
  const timelockAddr = await timelock.getAddress();
  console.log("   TimelockController deployed to:", timelockAddr);

  // ─────────────────────── 5. Deploy CrowdfundDAO ───────────────────────
  console.log("\n5. Deploying CrowdfundDAO...");
  const CrowdfundDAO = await hre.ethers.getContractFactory("CrowdfundDAO");
  const dao = await CrowdfundDAO.deploy(
    govTokenAddr,
    timelockAddr,
    votingDelayBlocks,
    votingPeriodBlocks,
    proposalThreshold,
    quorumPercent
  );
  await dao.waitForDeployment();
  const daoAddr = await dao.getAddress();
  const daoDeployReceipt = await dao.deploymentTransaction().wait();
  console.log("   CrowdfundDAO deployed to:", daoAddr);

  // ─────────────────────── 6. Configure Roles ───────────────────────────
  console.log("\n6. Configuring roles...");

  // Grant BRIDGE_ROLE on KGST to deployer (later: bridge service wallet)
  const BRIDGE_ROLE = await kgst.BRIDGE_ROLE();
  const grantBridgeTx = await kgst.grantRole(BRIDGE_ROLE, deployer.address);
  await grantBridgeTx.wait();
  console.log("   BRIDGE_ROLE granted to deployer (placeholder for bridge service)");

  // Grant BACKEND_ROLE on UserRegistry to deployer
  const BACKEND_ROLE = await userRegistry.BACKEND_ROLE();
  const grantBackendTx = await userRegistry.grantRole(BACKEND_ROLE, deployer.address);
  await grantBackendTx.wait();
  console.log("   BACKEND_ROLE granted to deployer");

  // Grant MINTER_ROLE on GovernanceToken to deployer
  const MINTER_ROLE = await govToken.MINTER_ROLE();
  const grantMinterTx = await govToken.grantRole(MINTER_ROLE, deployer.address);
  await grantMinterTx.wait();
  console.log("   MINTER_ROLE granted to deployer");

  if (bootstrapGovAmount > 0n) {
    const bootstrapMintTx = await govToken.mint(deployer.address, bootstrapGovAmount, "bootstrap_governance");
    await bootstrapMintTx.wait();
    const delegateTx = await govToken.delegate(deployer.address);
    await delegateTx.wait();
    console.log("   Bootstrap GOV minted and delegated to deployer");
  }

  // Grant TimelockController proposer & executor roles to DAO
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  const grantProposerTx = await timelock.grantRole(PROPOSER_ROLE, daoAddr);
  await grantProposerTx.wait();
  const grantExecutorTx = await timelock.grantRole(EXECUTOR_ROLE, daoAddr);
  await grantExecutorTx.wait();
  console.log("   DAO granted PROPOSER_ROLE and EXECUTOR_ROLE on TimelockController");

  const renounceAdminTx = await timelock.renounceRole(ADMIN_ROLE, deployer.address);
  await renounceAdminTx.wait();
  console.log("   Timelock admin role renounced by deployer");

  // ─────────────────────── Summary ──────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("KGST PLATFORM DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  UserRegistry:       ${userRegistryAddr}`);
  console.log(`  KGST Token:         ${kgstAddr}`);
  console.log(`  GovernanceToken:    ${govTokenAddr}`);
  console.log(`  TimelockController: ${timelockAddr}`);
  console.log(`  CrowdfundDAO:       ${daoAddr}`);
  console.log(`  DAO deployment block: ${daoDeployReceipt.blockNumber}`);
  console.log("=".repeat(60));

  // Save addresses to file
  const fs = require("fs");
  const addresses = {
    network,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    contracts: {
      UserRegistry: userRegistryAddr,
      KGST: kgstAddr,
      GovernanceToken: govTokenAddr,
      TimelockController: timelockAddr,
      CrowdfundDAO: daoAddr,
    },
    governance: {
      votingDelayBlocks,
      votingPeriodBlocks,
      proposalThreshold: proposalThreshold.toString(),
      quorumPercent,
      minDelaySeconds: minDelay,
      bootstrapGovAmount: bootstrapGovAmount.toString(),
    },
    deploymentBlock: daoDeployReceipt.blockNumber,
    deployedAt: new Date().toISOString(),
  };

  const deployDir = `./deployments/${network}`;
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  fs.writeFileSync(
    `${deployDir}/kgst-platform.json`,
    JSON.stringify(addresses, null, 2)
  );
  console.log(`\nAddresses saved to ${deployDir}/kgst-platform.json`);

  fs.writeFileSync(
    `./deployments/${network}-${addresses.chainId}.json`,
    JSON.stringify(addresses, null, 2)
  );
  console.log(`Addresses saved to deployments/${network}-${addresses.chainId}.json`);

  // Export ABIs
  const abiDir = `./deployments/abi`;
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir, { recursive: true });

  const artifacts = ["UserRegistry", "KGST", "GovernanceToken", "CrowdfundDAO"];
  for (const name of artifacts) {
    const artifact = await hre.artifacts.readArtifact(name);
    fs.writeFileSync(`${abiDir}/${name}.json`, JSON.stringify(artifact.abi, null, 2));
  }
  console.log("ABIs exported to deployments/abi/");

  // Verify contracts on Polygonscan (if not local)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\nWaiting 30s before verification...");
    await new Promise(r => setTimeout(r, 30000));

    const contracts = [
      { address: userRegistryAddr, args: [deployer.address], name: "UserRegistry" },
      { address: kgstAddr, args: [deployer.address], name: "KGST" },
      { address: govTokenAddr, args: [deployer.address], name: "GovernanceToken" },
      { address: timelockAddr, args: [minDelay, [], [], deployer.address], name: "TimelockController" },
      {
        address: daoAddr,
        args: [govTokenAddr, timelockAddr, votingDelayBlocks, votingPeriodBlocks, proposalThreshold, quorumPercent],
        name: "CrowdfundDAO"
      },
    ];

    for (const contract of contracts) {
      try {
        console.log(`Verifying ${contract.name}...`);
        await hre.run("verify:verify", {
          address: contract.address,
          constructorArguments: contract.args,
        });
        console.log(`  ✅ ${contract.name} verified`);
      } catch (err) {
        console.log(`  ⚠️  ${contract.name} verification failed: ${err.message}`);
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
