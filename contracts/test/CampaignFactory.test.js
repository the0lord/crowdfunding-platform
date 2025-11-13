const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CampaignFactory", function () {
  let CampaignFactory, factory;
  let Campaign;
  let owner, platformWallet, founder1, founder2, contributor1, contributor2;
  
  beforeEach(async function () {
    // Get signers
    [owner, platformWallet, founder1, founder2, contributor1, contributor2] = await ethers.getSigners();
    
    // Deploy factory
    CampaignFactory = await ethers.getContractFactory("CampaignFactory");
    factory = await CampaignFactory.deploy(platformWallet.address);
    await factory.waitForDeployment();
    
    Campaign = await ethers.getContractFactory("Campaign");
  });
  
  describe("Deployment", function () {
    it("Should set the correct platform wallet", async function () {
      expect(await factory.platformWallet()).to.equal(platformWallet.address);
    });
    
    it("Should set the correct owner", async function () {
      expect(await factory.owner()).to.equal(owner.address);
    });
    
    it("Should initialize with zero campaigns", async function () {
      expect(await factory.getCampaignCount()).to.equal(0);
    });
  });
  
  describe("Campaign Creation", function () {
    it("Should create a new campaign", async function () {
      const goalAmount = ethers.parseEther("10");
      const durationDays = 30;
      const title = "Test Campaign";
      const description = "This is a test campaign";
      const imageURI = "ipfs://test";
      
      const tx = await factory.connect(founder1).createCampaign(
        goalAmount,
        durationDays,
        title,
        description,
        imageURI
      );
      
      const receipt = await tx.wait();
      
      // Check event
      const event = receipt.logs.find(log => {
        try {
          return factory.interface.parseLog(log).name === "CampaignCreated";
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      
      // Check campaign count
      expect(await factory.getCampaignCount()).to.equal(1);
      
      // Check founder campaigns
      const founderCampaigns = await factory.getCampaignsByFounder(founder1.address);
      expect(founderCampaigns.length).to.equal(1);
    });
    
    it("Should fail with invalid goal amount", async function () {
      await expect(
        factory.connect(founder1).createCampaign(
          0, // Invalid
          30,
          "Test",
          "Description",
          "ipfs://test"
        )
      ).to.be.revertedWith("Goal must be > 0");
    });
    
    it("Should fail with invalid duration", async function () {
      await expect(
        factory.connect(founder1).createCampaign(
          ethers.parseEther("10"),
          0, // Invalid
          "Test",
          "Description",
          "ipfs://test"
        )
      ).to.be.revertedWith("Invalid duration");
      
      await expect(
        factory.connect(founder1).createCampaign(
          ethers.parseEther("10"),
          366, // Too long
          "Test",
          "Description",
          "ipfs://test"
        )
      ).to.be.revertedWith("Invalid duration");
    });
    
    it("Should fail with empty title", async function () {
      await expect(
        factory.connect(founder1).createCampaign(
          ethers.parseEther("10"),
          30,
          "", // Empty
          "Description",
          "ipfs://test"
        )
      ).to.be.revertedWith("Invalid title length");
    });
    
    it("Should create multiple campaigns", async function () {
      await factory.connect(founder1).createCampaign(
        ethers.parseEther("10"),
        30,
        "Campaign 1",
        "Description 1",
        "ipfs://test1"
      );
      
      await factory.connect(founder1).createCampaign(
        ethers.parseEther("20"),
        60,
        "Campaign 2",
        "Description 2",
        "ipfs://test2"
      );
      
      await factory.connect(founder2).createCampaign(
        ethers.parseEther("15"),
        45,
        "Campaign 3",
        "Description 3",
        "ipfs://test3"
      );
      
      expect(await factory.getCampaignCount()).to.equal(3);
      
      const founder1Campaigns = await factory.getCampaignsByFounder(founder1.address);
      expect(founder1Campaigns.length).to.equal(2);
      
      const founder2Campaigns = await factory.getCampaignsByFounder(founder2.address);
      expect(founder2Campaigns.length).to.equal(1);
    });
  });
  
  describe("Campaign Queries", function () {
    beforeEach(async function () {
      // Create some campaigns
      for (let i = 0; i < 5; i++) {
        await factory.connect(founder1).createCampaign(
          ethers.parseEther((10 + i).toString()),
          30,
          `Campaign ${i}`,
          `Description ${i}`,
          `ipfs://test${i}`
        );
      }
    });
    
    it("Should get campaigns with pagination", async function () {
      const campaigns = await factory.getCampaigns(0, 3);
      expect(campaigns.length).to.equal(3);
      
      const campaigns2 = await factory.getCampaigns(3, 3);
      expect(campaigns2.length).to.equal(2);
    });
    
    it("Should get recent campaigns", async function () {
      const recent = await factory.getRecentCampaigns(3);
      expect(recent.length).to.equal(3);
      
      // Most recent should be last created
      const allCampaigns = await factory.getCampaigns(0, 5);
      expect(recent[0]).to.equal(allCampaigns[4]);
    });
    
    it("Should validate campaign addresses", async function () {
      const campaigns = await factory.getCampaigns(0, 1);
      expect(await factory.isValidCampaign(campaigns[0])).to.be.true;
      expect(await factory.isValidCampaign(ethers.ZeroAddress)).to.be.false;
    });
  });
  
  describe("Platform Management", function () {
    it("Should update platform wallet", async function () {
      const newWallet = contributor1.address;
      
      await factory.connect(owner).updatePlatformWallet(newWallet);
      
      expect(await factory.platformWallet()).to.equal(newWallet);
    });
    
    it("Should fail to update platform wallet from non-owner", async function () {
      await expect(
        factory.connect(founder1).updatePlatformWallet(contributor1.address)
      ).to.be.reverted;
    });
    
    it("Should fail to update to zero address", async function () {
      await expect(
        factory.connect(owner).updatePlatformWallet(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid wallet address");
    });
  });
  
  describe("Platform Statistics", function () {
    it("Should return accurate platform stats", async function () {
      // Create campaigns
      await factory.connect(founder1).createCampaign(
        ethers.parseEther("10"),
        30,
        "Campaign 1",
        "Description",
        "ipfs://test"
      );
      
      const stats = await factory.getPlatformStats();
      expect(stats[0]).to.equal(1); // totalCampaigns
      expect(stats[1]).to.equal(1); // activeCampaigns
      expect(stats[2]).to.equal(0); // successfulCampaigns
    });
  });
});
