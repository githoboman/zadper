import { describe, expect, it } from "vitest";
import { normalizeAddress } from "../src/hash.js";

describe("normalizeAddress", () => {
  const bare = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

  it("strips a lower-case hash- prefix", () => {
    expect(normalizeAddress(`hash-${bare}`)).toBe(bare);
  });

  it("lower-cases so an upper-case prefix and body canonicalize", () => {
    expect(normalizeAddress(`HASH-${bare.toUpperCase()}`)).toBe(bare);
  });

  it("trims surrounding whitespace before stripping", () => {
    expect(normalizeAddress(`  hash-${bare}\n`)).toBe(bare);
  });

  it("is idempotent on an already-normalized value", () => {
    expect(normalizeAddress(bare)).toBe(bare);
  });

  it("leaves a bare hash untouched apart from case", () => {
    expect(normalizeAddress(bare.toUpperCase())).toBe(bare);
  });
});
