const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.bohr.life");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  
  const toAddress = "0x29284e93b68C84A40c89873e567B9e14B95247b7";
  const balance = await provider.getBalance(wallet.address);
  
  console.log("Current balance:", ethers.formatEther(balance), "tBOT");
  
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice;
  const gasLimit = 21000n;
  const gasCost = gasPrice * gasLimit;
  
  if (balance <= gasCost) {
    console.log("Insufficient balance to cover gas cost.");
    return;
  }
  
  const amountToSend = balance - gasCost;
  console.log("Sending:", ethers.formatEther(amountToSend), "tBOT");
  
  const tx = await wallet.sendTransaction({
    to: toAddress,
    value: amountToSend,
    gasLimit: gasLimit,
    gasPrice: gasPrice
  });
  
  console.log("Transaction Hash:", tx.hash);
  await tx.wait();
  console.log("Transaction confirmed!");
}

main().catch(console.error);
