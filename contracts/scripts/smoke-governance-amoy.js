const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const STATE_LABELS = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForState(dao, proposalId, expectedState, options = {}) {
  const {
    maxAttempts = 40,
    delayMs = 15000,
    extraCheck = async () => true,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const state = Number(await dao.state(proposalId));
    const eta = Number(await dao.proposalEta(proposalId));
    const now = Math.floor(Date.now() / 1000);

    console.log(
      `Attempt ${attempt}: state=${STATE_LABELS[state]} eta=${eta ? new Date(eta * 1000).toISOString() : "n/a"}`
    );

    if (state === expectedState && (await extraCheck({ eta, now, state }))) {
      return;
    }

    await sleep(delayMs);
  }

  throw new Error(`Timed out waiting for state ${STATE_LABELS[expectedState]}`);
}

async function main() {
  const deployment = loadJson(path.join(__dirname, "..", "deployments", "amoy", "kgst-platform.json"));
  const daoAbi = loadJson(path.join(__dirname, "..", "deployments", "abi", "CrowdfundDAO.json"));
  const govAbi = loadJson(path.join(__dirname, "..", "deployments", "abi", "GovernanceToken.json"));
  const rpcUrl = process.env.POLYGON_RPC_URL || "https://rpc-amoy.polygon.technology/";
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("PRIVATE_KEY is missing from contracts/.env");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const dao = new ethers.Contract(deployment.contracts.CrowdfundDAO, daoAbi, wallet);
  const gov = new ethers.Contract(deployment.contracts.GovernanceToken, govAbi, wallet);
  const votingPower = await gov.getVotes(wallet.address);

  console.log("Wallet:", wallet.address);
  console.log("Voting power:", ethers.formatEther(votingPower), "GOV");

  const title = `Governance smoke ${Date.now()}`;
  const description = `On-chain governance smoke test executed at ${new Date().toISOString()}`;
  const targets = [deployment.contracts.CrowdfundDAO];
  const values = [0n];
  const calldatas = [dao.interface.encodeFunctionData("governanceSignal")];

  console.log("Creating proposal...");
  const createTx = await dao.proposeWithMetadata(targets, values, calldatas, title, description, 0);
  const createReceipt = await createTx.wait();
  const createdLog = createReceipt.logs
    .map((log) => {
      try {
        return dao.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log) => log && log.name === "ProposalCreatedWithMetadata");

  if (!createdLog) {
    throw new Error("Failed to parse proposal creation log");
  }

  const proposalId = createdLog.args.proposalId;
  console.log("Proposal ID:", proposalId.toString());
  console.log("Create Tx:", createReceipt.hash);

  console.log("Waiting for Active...");
  await waitForState(dao, proposalId, 1);

  console.log("Casting vote...");
  const voteTx = await dao.castVoteWithReason(proposalId, 1, "Smoke test approval");
  const voteReceipt = await voteTx.wait();
  console.log("Vote Tx:", voteReceipt.hash);

  console.log("Waiting for Succeeded...");
  await waitForState(dao, proposalId, 4);

  console.log("Queueing proposal...");
  const descriptionHash = ethers.id(description);
  const queueTx = await dao.queue(targets, values, calldatas, descriptionHash);
  const queueReceipt = await queueTx.wait();
  console.log("Queue Tx:", queueReceipt.hash);

  console.log("Waiting for queued timelock expiry...");
  await waitForState(dao, proposalId, 5, {
    maxAttempts: 30,
    delayMs: 10000,
    extraCheck: async ({ eta, now }) => eta > 0 && now >= eta,
  });

  console.log("Executing proposal...");
  const executeTx = await dao.execute(targets, values, calldatas, descriptionHash);
  const executeReceipt = await executeTx.wait();
  console.log("Execute Tx:", executeReceipt.hash);

  const signalLog = executeReceipt.logs
    .map((log) => {
      try {
        return dao.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log) => log && log.name === "GovernanceSignalExecuted");

  if (signalLog) {
    console.log(
      "Signal executed at:",
      new Date(Number(signalLog.args.timestamp) * 1000).toISOString(),
      "block",
      signalLog.args.blockNumber.toString()
    );
  }

  const finalState = Number(await dao.state(proposalId));
  console.log("Final State:", STATE_LABELS[finalState]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});