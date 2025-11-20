const hre = require("hardhat");

async function main() {
  console.log("\n📊 Checking Factory State...\n");
  
  const factoryAddress = "0x329689BDa0286dE58E2339f8783F8400bfe435e1";
  const [deployer] = await hre.ethers.getSigners();
  
  console.log(`👤 Wallet: ${deployer.address}`);
  
  const CampaignFactory = await hre.ethers.getContractAt("CampaignFactory", factoryAddress);
  
  // Check basic info
  const owner = await CampaignFactory.owner();
  const campaignCount = await CampaignFactory.getCampaignCount();
  const platformWallet = await CampaignFactory.platformWallet();
  
  console.log(`\n📋 Factory Info:`);
  console.log(`   Owner: ${owner}`);
  console.log(`   Platform Wallet: ${platformWallet}`);
  console.log(`   Total Campaigns: ${campaignCount}`);
  
  // Check if wallet is blacklisted
  const isBlacklisted = await CampaignFactory.blacklistedFounders(deployer.address);
  console.log(`   Is Blacklisted: ${isBlacklisted}`);
  
  // Check pending campaigns
  const founderCampaigns = await CampaignFactory.getCampaignsByFounder(deployer.address);
  console.log(`   Your Campaigns: ${founderCampaigns.length}`);
  
  console.log("\n✨ Factory is operational!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
