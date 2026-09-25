const { ethers } = require('ethers');
require('dotenv').config({ path: '../contracts/agent-pay-registry/.env' });

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.botchain.ai");
  const deployer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log(`Deployer: ${deployer.address}`);
  
  // 3 new independent wallets
  const w1 = ethers.Wallet.createRandom().connect(provider);
  const w2 = ethers.Wallet.createRandom().connect(provider);
  const w3 = ethers.Wallet.createRandom().connect(provider);

  console.log(`Wallet 1: ${w1.address}`);
  console.log(`Wallet 2: ${w2.address}`);
  console.log(`Wallet 3: ${w3.address}`);

  const target = "0x29284e93b68C84A40c89873e567B9e14B95247b7";
  const amount = ethers.parseEther("0.0001");

  console.log("Funding wallets...");
  let tx = await deployer.sendTransaction({ to: w1.address, value: ethers.parseEther("0.001") });
  await tx.wait();
  tx = await deployer.sendTransaction({ to: w2.address, value: ethers.parseEther("0.001") });
  await tx.wait();
  tx = await deployer.sendTransaction({ to: w3.address, value: ethers.parseEther("0.001") });
  await tx.wait();
  console.log("Wallets funded!");

  console.log("Generating 5+ interactions...");
  // Interaction 1: W1 -> target
  tx = await w1.sendTransaction({ to: target, value: amount, data: ethers.hexlify(ethers.toUtf8Bytes("Zadper Agent Payment 1")) });
  await tx.wait();
  console.log(`Tx 1: ${tx.hash}`);

  // Interaction 2: W2 -> target
  tx = await w2.sendTransaction({ to: target, value: amount, data: ethers.hexlify(ethers.toUtf8Bytes("Zadper Agent Payment 2")) });
  await tx.wait();
  console.log(`Tx 2: ${tx.hash}`);

  // Interaction 3: W3 -> target
  tx = await w3.sendTransaction({ to: target, value: amount, data: ethers.hexlify(ethers.toUtf8Bytes("Zadper Agent Payment 3")) });
  await tx.wait();
  console.log(`Tx 3: ${tx.hash}`);

  // Interaction 4: W1 -> W2
  tx = await w1.sendTransaction({ to: w2.address, value: amount, data: ethers.hexlify(ethers.toUtf8Bytes("Agent settling invoice")) });
  await tx.wait();
  console.log(`Tx 4: ${tx.hash}`);

  // Interaction 5: W2 -> W3
  tx = await w2.sendTransaction({ to: w3.address, value: amount, data: ethers.hexlify(ethers.toUtf8Bytes("Agent fee payment")) });
  await tx.wait();
  console.log(`Tx 5: ${tx.hash}`);
  
  // Interaction 6: W3 -> target
  tx = await w3.sendTransaction({ to: target, value: amount, data: ethers.hexlify(ethers.toUtf8Bytes("Final agent fee")) });
  await tx.wait();
  console.log(`Tx 6: ${tx.hash}`);

  console.log("Activity generated!");
}

main().catch(console.error);
