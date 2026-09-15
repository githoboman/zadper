import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Exclude test files that reference removed CSPR-specific modules
    // (botChainEvidence.ts, csprName.ts, liveEvidence.ts) which were
    // deleted during the Bot Chain EVM migration.
    exclude: [
      "test/csprCloud.test.ts",
      "test/csprName.test.ts",
      "test/resolve.test.ts",
      "test/csprName-route.test.ts",
      "**/node_modules/**"
    ]
  }
});
