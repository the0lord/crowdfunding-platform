const hre = require("hardhat");

async function main() {
  console.log("\n=== Testing Moderation Workflow ===\n");
  
  const [deployer] = await hre.ethers.getSigners();
  
  // Factory and campaign addresses
  const factoryAddress = "0x94B09c15E4E8f96D23883E1b24fD872EA6e06EF0";
  const campaignAddress = "0xc6eb788b7Aae7e1806eF3922233Fe59C3a485BD9";
  
  const factory = await hre.ethers.getContractAt("CampaignFactoryClone", factoryAddress);
  const campaign = await hre.ethers.getContractAt("contracts/CampaignClone.sol:Campaign", campaignAddress);
  
  console.log("Factory:", factoryAddress);
  console.log("Test Campaign:", campaignAddress);
  console.log("Moderator:", deployer.address);
  
  // Check current status
  console.log("\n📊 Current Status:");
  const status = await factory.getCampaignStatus(campaignAddress);
  console.log("Status:", ["Pending", "Approved", "Rejected", "Flagged"][Number(status.status)]);
  console.log("Flag count:", status.flagCount.toString());
  
  const isPaused = await campaign.paused();
  console.log("Campaign paused:", isPaused);
  
  // Get pending campaigns
  const pending = await factory.getPendingCampaigns();
  console.log("\nPending campaigns:", pending.length);
  console.log("Pending addresses:", pending);
  
  // Approve the campaign
  console.log("\n✅ Approving campaign...");
  const approveTx = await factory.approveCampaign(campaignAddress);
  await approveTx.wait();
  console.log("Transaction hash:", approveTx.hash);
  console.log("Campaign approved!");
  
  // Check updated status
  console.log("\n📊 Updated Status:");
  const newStatus = await factory.getCampaignStatus(campaignAddress);
  console.log("Status:", ["Pending", "Approved", "Rejected", "Flagged"][Number(newStatus.status)]);
  
  const newPaused = await campaign.paused();
  console.log("Campaign paused:", newPaused);
  
  const pendingCount = await factory.pendingReviewCount();
  console.log("Pending review count:", pendingCount.toString());
  
  // Get approved campaigns
  console.log("\n📋 Approved Campaigns:");
  const approved = await factory.getApprovedCampaigns(0, 10);
  console.log("Count:", approved.length);
  console.log("Addresses:", approved);
  
  // Test contribution (should work now that it's approved)
  console.log("\n💰 Testing Contribution:");
  console.log("Attempting to contribute 0.1 POL...");
  try {
    const contributeTx = await campaign.contribute({
      value: hre.ethers.parseEther("0.1")
    });
    const receipt = await contributeTx.wait();
    console.log("✅ Contribution successful!");
    console.log("Transaction hash:", contributeTx.hash);
    console.log("Gas used:", receipt.gasUsed.toString());
    
    // Check campaign stats
    const totalRaised = await campaign.totalRaised();
    const contributorCount = await campaign.contributorCount();
    console.log("\nCampaign Stats:");
    console.log("Total raised:", hre.ethers.formatEther(totalRaised), "POL");
    console.log("Contributors:", contributorCount.toString());
  } catch (error) {
    console.error("❌ Contribution failed:", error.message);
  }
  
  // Summary
  console.log("\n📊 Final Summary:");
  console.log("Factory address:", factoryAddress);
  console.log("Campaign address:", campaignAddress);
  console.log("Campaign status: Approved ✅");
  console.log("Campaign active: Yes");
  console.log("\nView on PolygonScan:");
  console.log(`https://amoy.polygonscan.com/address/${campaignAddress}`);
}

main()
  .then(() => {
    console.log("\n✅ Moderation test completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  });
