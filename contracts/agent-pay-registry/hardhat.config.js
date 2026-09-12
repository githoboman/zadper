require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const privateKey = process.env.PRIVATE_KEY || "0000000000000000000000000000000000000000000000000000000000000000";

module.exports = {
  solidity: "0.8.24",
  networks: {
    botchain_testnet: {
      url: "https://rpc.bohr.life",
      chainId: 968,
      accounts: [privateKey]
    },
    botchain_mainnet: {
      url: "https://rpc.botchain.ai",
      chainId: 677,
      accounts: [privateKey]
    }
  },
  etherscan: {
    apiKey: {
      botchain_testnet: "empty",
      botchain_mainnet: "empty"
    },
    customChains: [
      {
        network: "botchain_testnet",
        chainId: 968,
        urls: {
          apiURL: "https://scan.bohr.life/api",
          browserURL: "https://scan.bohr.life"
        }
      },
      {
        network: "botchain_mainnet",
        chainId: 677,
        urls: {
          apiURL: "https://scan.botchain.ai/api",
          browserURL: "https://scan.botchain.ai"
        }
      }
    ]
  }
};
