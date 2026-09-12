const ethers = require('ethers');
const wallet = ethers.Wallet.createRandom();
const fs = require('fs');
fs.writeFileSync('../../contracts/agent-pay-registry/.env', `PRIVATE_KEY=${wallet.privateKey.substring(2)}`);
console.log('Address:', wallet.address);
