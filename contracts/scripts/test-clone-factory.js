const hre = require("hardhat");

async function main() {
  console.log("\n=== Testing Clone Factory ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Testing with account:", deployer.address);
  
  // Factory address
  const factoryAddress = "0x94B09c15E4E8f96D23883E1b24fD872EA6e06EF0";
  const implementationAddress = "0x8C47384c12e563D2B19ff7bc7C205602A1c62Bf3";
  
  console.log("Factory address:", factoryAddress);
  console.log("Implementation address:", implementationAddress);
  
  // Get factory contract
  const factory = await hre.ethers.getContractAt("CampaignFactoryClone", factoryAddress);
  
  // Check initial state
  console.log("\n📊 Factory State:");
  const campaignCount = await factory.getCampaignCount();
  console.log("Total campaigns:", campaignCount.toString());
  
  // Campaign parameters
  const goalAmount = hre.ethers.parseEther("1.0"); // 1 POL
  const durationDays = 30;
  const title = "Test Campaign via Clone Pattern";
  const description = "This is a test campaign created using EIP-1167 minimal proxy pattern for gas efficiency.";
  const imageURI = "ipfs://QmTest123456789";
  
  console.log("\n📝 Creating Campaign:");
  console.log("Goal:", hre.ethers.formatEther(goalAmount), "POL");
  console.log("Duration:", durationDays, "days");
  console.log("Title:", title);
  
  // Estimate gas
  console.log("\n⛽ Estimating gas...");
  try {
    const gasEstimate = await factory.createCampaign.estimateGas(
      goalAmount,
      durationDays,
      title,
      description,
      imageURI
    );
    console.log("Gas estimate:", gasEstimate.toString());
    console.log("Gas estimate (formatted):", Number(gasEstimate).toLocaleString());
    
    // Create campaign
    console.log("\n🚀 Creating campaign...");
    const tx = await factory.createCampaign(
      goalAmount,
      durationDays,
      title,
      description,
      imageURI,
      {
        gasLimit: gasEstimate * 120n / 100n // 20% buffer
      }
    );
    
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("\n✅ Campaign created!");
    console.log("Block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());
    console.log("Gas used (formatted):", Number(receipt.gasUsed).toLocaleString());
    
    // Find campaign address from events
    const event = receipt.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed && parsed.name === "CampaignCreated";
      } catch (e) {
        return false;
      }
    });
    
    if (event) {
      const parsedEvent = factory.interface.parseLog(event);
      const campaignAddress = parsedEvent.args.campaign;
      console.log("\n📍 Campaign Address:", campaignAddress);
      console.log("View on PolygonScan:");
      console.log(`https://amoy.polygonscan.com/address/${campaignAddress}`);
      
      // Get campaign details
      console.log("\n📋 Campaign Details:");
      const campaign = await hre.ethers.getContractAt("contracts/CampaignClone.sol:Campaign", campaignAddress);
      
      const founder = await campaign.founder();
      const goal = await campaign.goalAmount();
      const deadline = await campaign.deadline();
      const state = await campaign.state();
      
      console.log("Founder:", founder);
      console.log("Goal:", hre.ethers.formatEther(goal), "POL");
      console.log("Deadline:", new Date(Number(deadline) * 1000).toISOString());
      console.log("State:", state);
      
      // Check moderation status
      const status = await factory.getCampaignStatus(campaignAddress);
      console.log("\n🛡️ Moderation Status:");
      console.log("Status:", ["Pending", "Approved", "Rejected", "Flagged"][Number(status.status)]);
      console.log("Flag count:", status.flagCount.toString());
      
      // Calculate gas savings
      console.log("\n💰 Gas Savings Analysis:");
      console.log("Clone deployment gas:", Number(receipt.gasUsed).toLocaleString());
      console.log("Full deployment gas (estimated): ~2,100,000");
      console.log("Gas saved:", (2100000 - Number(receipt.gasUsed)).toLocaleString());
      console.log("Savings percentage:", ((1 - Number(receipt.gasUsed) / 2100000) * 100).toFixed(1) + "%");
    }
    
    // Get updated factory state
    console.log("\n📊 Updated Factory State:");
    const newCampaignCount = await factory.getCampaignCount();
    console.log("Total campaigns:", newCampaignCount.toString());
    
    const pendingCount = await factory.pendingReviewCount();
    console.log("Pending review:", pendingCount.toString());
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main()
  .then(() => {
    console.log("\n✅ Test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  });
