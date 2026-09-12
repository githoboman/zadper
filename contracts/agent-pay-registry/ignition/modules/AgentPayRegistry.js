const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("AgentPayRegistry", (m) => {
  const registry = m.contract("AgentPayRegistry");
  return { registry };
});
