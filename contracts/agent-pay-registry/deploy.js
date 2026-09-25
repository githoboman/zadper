const fs = require('fs');
const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.botchain.ai");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  console.log("Deploying from address:", wallet.address);
  
  const artifactPath = "./artifacts/contracts/AgentPayRegistry.sol/AgentPayRegistry.json";
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  console.log("Sending deployment transaction...");
  const contract = await factory.deploy(wallet.address);
  await contract.waitForDeployment();
  
  const address = await contract.getAddress();
  console.log("Deployed successfully to:", address);
}

main().catch(console.error);
