const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Campaign", function () {
  let Campaign;
  let campaign;
  let founder, platformWallet, contributor1, contributor2, contributor3;
  
  const GOAL_AMOUNT = ethers.parseEther("10");
  const DURATION = 30 * 24 * 60 * 60; // 30 days in seconds
  
  beforeEach(async function () {
    [founder, platformWallet, contributor1, contributor2, contributor3] = await ethers.getSigners();
    
    Campaign = await ethers.getContractFactory("Campaign");
    const deadline = (await time.latest()) + DURATION;
    
    campaign = await Campaign.deploy(
      founder.address,
      GOAL_AMOUNT,
      deadline,
      "Test Campaign",
      "This is a test campaign for testing purposes",
      "ipfs://QmTest123",
      platformWallet.address
    );
    
    await campaign.waitForDeployment();
  });
  
  describe("Deployment", function () {
    it("Should set correct initial values", async function () {
      expect(await campaign.founder()).to.equal(founder.address);
      expect(await campaign.goalAmount()).to.equal(GOAL_AMOUNT);
      expect(await campaign.title()).to.equal("Test Campaign");
      expect(await campaign.totalRaised()).to.equal(0);
      expect(await campaign.state()).to.equal(0); // Active
    });
    
    it("Should fail with invalid founder", async function () {
      const deadline = (await time.latest()) + DURATION;
      
      await expect(
        Campaign.deploy(
          ethers.ZeroAddress,
          GOAL_AMOUNT,
          deadline,
          "Test",
          "Description",
          "ipfs://test",
          platformWallet.address
        )
      ).to.be.reverted; // OpenZeppelin Ownable uses custom error
    });
    
    it("Should fail with zero goal", async function () {
      const deadline = (await time.latest()) + DURATION;
      
      await expect(
        Campaign.deploy(
          founder.address,
          0,
          deadline,
          "Test",
          "Description",
          "ipfs://test",
          platformWallet.address
        )
      ).to.be.revertedWith("Goal must be greater than 0");
    });
    
    it("Should fail with past deadline", async function () {
      const pastDeadline = (await time.latest()) - 1000;
      
      await expect(
        Campaign.deploy(
          founder.address,
          GOAL_AMOUNT,
          pastDeadline,
          "Test",
          "Description",
          "ipfs://test",
          platformWallet.address
        )
      ).to.be.revertedWith("Deadline must be in future");
    });
  });
  
  describe("Contributions", function () {
    it("Should accept contributions", async function () {
      const contributionAmount = ethers.parseEther("1");
      
      await expect(
        campaign.connect(contributor1).contribute({ value: contributionAmount })
      ).to.emit(campaign, "ContributionReceived")
        .withArgs(contributor1.address, contributionAmount, contributionAmount, await time.latest() + 1);
      
      expect(await campaign.totalRaised()).to.equal(contributionAmount);
      expect(await campaign.contributions(contributor1.address)).to.equal(contributionAmount);
      expect(await campaign.contributorCount()).to.equal(1);
    });
    
    it("Should track multiple contributions from same user", async function () {
      const amount1 = ethers.parseEther("1");
      const amount2 = ethers.parseEther("2");
      
      await campaign.connect(contributor1).contribute({ value: amount1 });
      await campaign.connect(contributor1).contribute({ value: amount2 });
      
      expect(await campaign.contributions(contributor1.address)).to.equal(amount1 + amount2);
      expect(await campaign.contributorCount()).to.equal(1); // Same contributor
    });
    
    it("Should track multiple contributors", async function () {
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("1") });
      await campaign.connect(contributor2).contribute({ value: ethers.parseEther("2") });
      await campaign.connect(contributor3).contribute({ value: ethers.parseEther("3") });
      
      expect(await campaign.contributorCount()).to.equal(3);
      expect(await campaign.totalRaised()).to.equal(ethers.parseEther("6"));
    });
    
    it("Should fail with zero contribution", async function () {
      await expect(
        campaign.connect(contributor1).contribute({ value: 0 })
      ).to.be.revertedWith("Contribution must be > 0");
    });
    
    it("Should fail after deadline", async function () {
      await time.increase(DURATION + 1);
      
      await expect(
        campaign.connect(contributor1).contribute({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Campaign deadline passed");
    });
    
    it("Should fail when paused", async function () {
      await campaign.connect(founder).pause();
      
      await expect(
        campaign.connect(contributor1).contribute({ value: ethers.parseEther("1") })
      ).to.be.reverted;
    });
  });
  
  describe("Reward Tiers", function () {
    beforeEach(async function () {
      // Add reward tiers
      await campaign.connect(founder).addRewardTier(
        ethers.parseEther("1"),
        "Bronze Tier - Thank you card",
        0 // Unlimited
      );
      
      await campaign.connect(founder).addRewardTier(
        ethers.parseEther("5"),
        "Silver Tier - T-shirt",
        10 // Max 10 backers
      );
      
      await campaign.connect(founder).addRewardTier(
        ethers.parseEther("10"),
        "Gold Tier - Exclusive access",
        5 // Max 5 backers
      );
    });
    
    it("Should create reward tiers", async function () {
      expect(await campaign.rewardTierCount()).to.equal(3);
      
      const tier = await campaign.getRewardTier(0);
      expect(tier.minContribution).to.equal(ethers.parseEther("1"));
      expect(tier.description).to.equal("Bronze Tier - Thank you card");
      expect(tier.maxBackers).to.equal(0);
    });
    
    it("Should assign rewards based on contribution", async function () {
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("5") });
      
      const rewards = await campaign.getContributorRewards(contributor1.address);
      expect(rewards.length).to.equal(2); // Bronze and Silver
    });
    
    it("Should respect max backers limit", async function () {
      // Fill silver tier (max 10)
      for (let i = 0; i < 10; i++) {
        const signer = await ethers.provider.getSigner(i);
        await campaign.connect(signer).contribute({ value: ethers.parseEther("5") });
      }
      
      const silverTierBefore = await campaign.getRewardTier(1);
      expect(silverTierBefore.currentBackers).to.equal(10);
      
      // 11th contributor with 5 ETH should get bronze, silver (not counted), and gold tiers
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("5") });
      const rewards = await campaign.getContributorRewards(contributor1.address);
      expect(rewards.length).to.equal(3); // Bronze, Silver (no count increment), Gold qualifies
      
      // Verify silver tier count didn't increase
      const silverTierAfter = await campaign.getRewardTier(1);
      expect(silverTierAfter.currentBackers).to.equal(10); // Still 10, didn't increment
    });
    
    it("Should fail to add tier from non-owner", async function () {
      await expect(
        campaign.connect(contributor1).addRewardTier(
          ethers.parseEther("1"),
          "Test",
          0
        )
      ).to.be.reverted;
    });
  });
  
  describe("Withdrawals", function () {
    beforeEach(async function () {
      // Reach goal
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("6") });
      await campaign.connect(contributor2).contribute({ value: ethers.parseEther("4") });
      
      // Fast forward past deadline
      await time.increase(DURATION + 1);
    });
    
    it("Should allow founder to withdraw after successful campaign", async function () {
      const initialBalance = await ethers.provider.getBalance(founder.address);
      const initialPlatformBalance = await ethers.provider.getBalance(platformWallet.address);
      
      const tx = await campaign.connect(founder).withdraw();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      
      const finalBalance = await ethers.provider.getBalance(founder.address);
      const finalPlatformBalance = await ethers.provider.getBalance(platformWallet.address);
      
      // Check platform fee (2%)
      const expectedFee = (GOAL_AMOUNT * 200n) / 10000n;
      const expectedFounderAmount = GOAL_AMOUNT - expectedFee;
      
      expect(finalPlatformBalance - initialPlatformBalance).to.equal(expectedFee);
      expect(finalBalance - initialBalance + gasCost).to.equal(expectedFounderAmount);
    });
    
    it("Should fail to withdraw before deadline", async function () {
      // Deploy new campaign
      const deadline = (await time.latest()) + DURATION;
      const newCampaign = await Campaign.deploy(
        founder.address,
        GOAL_AMOUNT,
        deadline,
        "Test",
        "Desc",
        "ipfs://test",
        platformWallet.address
      );
      
      await newCampaign.connect(contributor1).contribute({ value: GOAL_AMOUNT });
      
      await expect(
        newCampaign.connect(founder).withdraw()
      ).to.be.revertedWith("Campaign still active");
    });
    
    it("Should fail to withdraw if goal not reached", async function () {
      const deadline = (await time.latest()) + DURATION;
      const newCampaign = await Campaign.deploy(
        founder.address,
        GOAL_AMOUNT,
        deadline,
        "Test",
        "Desc",
        "ipfs://test",
        platformWallet.address
      );
      
      await newCampaign.connect(contributor1).contribute({ value: ethers.parseEther("5") });
      await time.increase(DURATION + 1);
      
      await expect(
        newCampaign.connect(founder).withdraw()
      ).to.be.revertedWith("Goal not reached");
    });
    
    it("Should fail if non-founder tries to withdraw", async function () {
      await expect(
        campaign.connect(contributor1).withdraw()
      ).to.be.reverted;
    });
  });
  
  describe("Refunds", function () {
    beforeEach(async function () {
      // Contribute but don't reach goal
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("3") });
      await campaign.connect(contributor2).contribute({ value: ethers.parseEther("2") });
      
      // Fast forward past deadline
      await time.increase(DURATION + 1);
    });
    
    it("Should allow refund after failed campaign", async function () {
      const initialBalance = await ethers.provider.getBalance(contributor1.address);
      const contributedAmount = ethers.parseEther("3");
      
      const tx = await campaign.connect(contributor1).refund();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      
      const finalBalance = await ethers.provider.getBalance(contributor1.address);
      
      expect(finalBalance - initialBalance + gasCost).to.equal(contributedAmount);
      expect(await campaign.contributions(contributor1.address)).to.equal(0);
    });
    
    it("Should update campaign state to Failed on first refund", async function () {
      expect(await campaign.state()).to.equal(0); // Active
      
      await campaign.connect(contributor1).refund();
      
      expect(await campaign.state()).to.equal(2); // Failed
    });
    
    it("Should fail to refund if goal was reached", async function () {
      // Deploy new campaign and reach goal
      const deadline = (await time.latest()) + DURATION;
      const newCampaign = await Campaign.deploy(
        founder.address,
        GOAL_AMOUNT,
        deadline,
        "Test",
        "Desc",
        "ipfs://test",
        platformWallet.address
      );
      
      await newCampaign.connect(contributor1).contribute({ value: GOAL_AMOUNT });
      await time.increase(DURATION + 1);
      
      await expect(
        newCampaign.connect(contributor1).refund()
      ).to.be.revertedWith("Campaign was successful");
    });
    
    it("Should fail to refund before deadline", async function () {
      const deadline = (await time.latest()) + DURATION;
      const newCampaign = await Campaign.deploy(
        founder.address,
        GOAL_AMOUNT,
        deadline,
        "Test",
        "Desc",
        "ipfs://test",
        platformWallet.address
      );
      
      await newCampaign.connect(contributor1).contribute({ value: ethers.parseEther("5") });
      
      await expect(
        newCampaign.connect(contributor1).refund()
      ).to.be.revertedWith("Campaign still active");
    });
    
    it("Should fail to refund if no contribution", async function () {
      await expect(
        campaign.connect(contributor3).refund()
      ).to.be.revertedWith("No contribution to refund");
    });
  });
  
  describe("View Functions", function () {
    it("Should calculate progress correctly", async function () {
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("5") });
      
      const progress = await campaign.getProgress();
      expect(progress).to.equal(50); // 50% of 10 ETH goal
    });
    
    it("Should return time remaining", async function () {
      const remaining = await campaign.getTimeRemaining();
      expect(remaining).to.be.closeTo(BigInt(DURATION), BigInt(5));
    });
    
    it("Should check if successful", async function () {
      expect(await campaign.isSuccessful()).to.be.false;
      
      await campaign.connect(contributor1).contribute({ value: GOAL_AMOUNT });
      
      expect(await campaign.isSuccessful()).to.be.true;
    });
    
    it("Should get campaign details", async function () {
      const details = await campaign.getCampaignDetails();
      
      expect(details[0]).to.equal(founder.address); // founder
      expect(details[1]).to.equal("Test Campaign"); // title
      expect(details[4]).to.equal(GOAL_AMOUNT); // goalAmount
      expect(details[8]).to.equal(0); // state (Active)
    });
    
    it("Should get contributors list", async function () {
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("1") });
      await campaign.connect(contributor2).contribute({ value: ethers.parseEther("2") });
      
      const contributors = await campaign.getContributors();
      expect(contributors.length).to.equal(2);
      expect(contributors[0]).to.equal(contributor1.address);
      expect(contributors[1]).to.equal(contributor2.address);
    });
  });
  
  describe("State Management", function () {
    it("Should update state to Successful", async function () {
      await campaign.connect(contributor1).contribute({ value: GOAL_AMOUNT });
      await time.increase(DURATION + 1);
      
      await campaign.updateState();
      
      expect(await campaign.state()).to.equal(1); // Successful
    });
    
    it("Should update state to Failed", async function () {
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("5") });
      await time.increase(DURATION + 1);
      
      await campaign.updateState();
      
      expect(await campaign.state()).to.equal(2); // Failed
    });
    
    it("Should fail to update state before deadline", async function () {
      await expect(
        campaign.updateState()
      ).to.be.revertedWith("Campaign still active");
    });
  });
  
  describe("Emergency Controls", function () {
    it("Should allow founder to pause", async function () {
      await campaign.connect(founder).pause();
      
      await expect(
        campaign.connect(contributor1).contribute({ value: ethers.parseEther("1") })
      ).to.be.reverted;
    });
    
    it("Should allow founder to unpause", async function () {
      await campaign.connect(founder).pause();
      await campaign.connect(founder).unpause();
      
      await expect(
        campaign.connect(contributor1).contribute({ value: ethers.parseEther("1") })
      ).to.not.be.reverted;
    });
    
    it("Should allow founder to cancel if no contributions", async function () {
      await campaign.connect(founder).cancelCampaign();
      
      expect(await campaign.state()).to.equal(3); // Cancelled
    });
    
    it("Should fail to cancel with contributions", async function () {
      await campaign.connect(contributor1).contribute({ value: ethers.parseEther("1") });
      
      await expect(
        campaign.connect(founder).cancelCampaign()
      ).to.be.revertedWith("Cannot cancel with contributions");
    });
  });
});
