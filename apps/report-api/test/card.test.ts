import { existsSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createReportApp } from "../src/app.js";
import {
  bundledCardFontFiles,
  renderVerdictCardPng,
  renderVerdictCardSvg,
  type VerdictCardData
} from "../src/card.js";
import { acceptDecisionRecord, createVerdictSubmission } from "./verdictSubmission.js";

const dangerVerdict: VerdictCardData = {
  aspect: "DANGER",
  subjectShortHash: "ab12cd34",
  flags: [
    { code: "UNVERIFIED_CONTRACT", message: "Contract bytecode has not been verified on-chain" },
    { code: "HIGH_MINT_AUTHORITY", message: "Mint authority is held by an EOA" }
  ],
  notChecked: ["Liquidity lock", "Team wallet concentration"],
  decisionTxHash: "4".repeat(64),
  policyHash: "5".repeat(64)
};

const clearVerdict: VerdictCardData = {
  aspect: "CLEAR",
  subjectShortHash: "ef56ab78",
  flags: [],
  notChecked: ["Audit history"],
  decisionTxHash: "6".repeat(64),
  policyHash: "7".repeat(64)
};

const cautionVerdict: VerdictCardData = {
  aspect: "CAUTION",
  subjectShortHash: "cc99dd00",
  flags: [{ code: "UNAUDITED", message: "No formal audit found" }],
  notChecked: [],
  decisionTxHash: "8".repeat(64),
  policyHash: "9".repeat(64)
};

const dangerSubmission = createVerdictSubmission({
  signals: {
    mintBurnEnabled: true,
    publicMintEntrypoint: true,
    holderCount: 1,
    topHolderPct: 100,
    contractAgeBlocks: 100,
    lpHolderCount: 1,
    liquidityDepth: null
  }
});

describe("renderVerdictCardSvg", () => {
  it("DANGER card contains the aspect word", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).toContain("DANGER");
    expect(svg).toContain("AGENTPAY · CHECK RESULT");
    expect(svg).not.toContain("TRUST SIGNAL");
  });

  it("DANGER card contains the subject short hash", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).toContain("ab12cd34");
  });

  it("DANGER card contains the first flag message", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).toContain("Contract bytecode has not been verified on-chain");
  });

  it("DANGER card contains the honest footer", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).toContain("automated evidence flags, not financial advice");
  });

  it("DANGER card contains the decision tx hash", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).toContain("4".repeat(64));
  });

  it("DANGER card contains the policy hash", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).toContain("5".repeat(64));
  });

  it("CLEAR card contains the CLEAR aspect word", () => {
    const svg = renderVerdictCardSvg(clearVerdict);
    expect(svg).toContain("CLEAR");
  });

  it("CAUTION card contains the CAUTION aspect word", () => {
    const svg = renderVerdictCardSvg(cautionVerdict);
    expect(svg).toContain("CAUTION");
  });

  it("card with no flags still renders valid SVG", () => {
    const svg = renderVerdictCardSvg(clearVerdict);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("notChecked items appear in the card", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).toContain("Liquidity lock");
  });

  it("escapes script-like card text", () => {
    const svg = renderVerdictCardSvg({
      ...dangerVerdict,
      flags: [{ code: "UNTRUSTED", message: "</text><script>alert(1)</script>" }]
    });

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("marks a flag row with a colored edge rather than a dot", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).not.toContain("<circle");
    expect(svg).toContain(`fill="#c5253b"`);
  });

  it("Proven on Bot Chain line appears in the card with correct casing and tx hash", () => {
    const svg = renderVerdictCardSvg(dangerVerdict);
    expect(svg).toContain("PROVEN ON CASPER");
    expect(svg).toContain(dangerVerdict.decisionTxHash);
  });
});

describe("/card routes", () => {
  it("POST /card returns an id", async () => {
    const app = createReportApp({ decisionRecordVerifier: acceptDecisionRecord });
    const response = await request(app)
      .post("/card")
      .send(dangerSubmission)
      .expect(200);

    expect(response.body.id).toBeTruthy();
    expect(typeof response.body.id).toBe("string");
  });

  it("GET /card/:id.svg returns 200 with image/svg+xml and contains the aspect word", async () => {
    const app = createReportApp({ decisionRecordVerifier: acceptDecisionRecord });
    const postRes = await request(app)
      .post("/card")
      .send(dangerSubmission)
      .expect(200);

    const { id } = postRes.body as { id: string };

    const svgRes = await request(app)
      .get(`/card/${id}.svg`)
      .buffer(true)
      .expect(200);

    expect(svgRes.headers["content-type"]).toMatch(/image\/svg\+xml/);
    expect(svgRes.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(svgRes.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(svgRes.headers["x-content-type-options"]).toBe("nosniff");
    const svgBody = svgRes.text ?? svgRes.body?.toString?.() ?? "";
    expect(svgBody).toContain("DANGER");
  });

  it("rejects script-like text that is not part of the committed verdict", async () => {
    const app = createReportApp({ decisionRecordVerifier: acceptDecisionRecord });
    await request(app)
      .post("/card")
      .send({
        ...dangerSubmission,
        card: {
          ...dangerSubmission.card,
          flags: [{ code: "UNTRUSTED", message: "</text><script>alert(1)</script>" }]
        }
      })
      .expect(400, { error: "invalid_card" });
  });

  it("GET /card/:id.png returns 200 for a known id", async () => {
    const app = createReportApp({ decisionRecordVerifier: acceptDecisionRecord });
    const postRes = await request(app)
      .post("/card")
      .send(createVerdictSubmission())
      .expect(200);

    const { id } = postRes.body as { id: string };

    const pngRes = await request(app)
      .get(`/card/${id}.png`)
      .expect(200);

    // Either PNG or SVG fallback is acceptable
    const ct = pngRes.headers["content-type"] as string;
    expect(ct === "image/png" || ct.includes("image/svg+xml")).toBe(true);
  }, 10_000);

  it("GET /card/:id.svg returns 404 for unknown id", async () => {
    const app = createReportApp();
    await request(app)
      .get("/card/nonexistent-id.svg")
      .expect(404);
  });

  it("GET /card/:id.png returns 404 for unknown id", async () => {
    const app = createReportApp();
    await request(app)
      .get("/card/nonexistent-id.png")
      .expect(404);
  });

  it("POST /card with same data returns the same id (deterministic)", async () => {
    const app = createReportApp({ decisionRecordVerifier: acceptDecisionRecord });
    const first = await request(app).post("/card").send(dangerSubmission).expect(200);
    const second = await request(app).post("/card").send(dangerSubmission).expect(200);
    expect(first.body.id).toBe(second.body.id);
  });

  it("rejects malformed or oversized card payloads", async () => {
    const app = createReportApp({ decisionRecordVerifier: acceptDecisionRecord });

    await request(app)
      .post("/card")
      .send({
        ...dangerSubmission,
        card: { ...dangerSubmission.card, aspect: "UNKNOWN" }
      })
      .expect(400, { error: "invalid_card" });
    await request(app)
      .post("/card")
      .send({
        ...dangerSubmission,
        card: {
          ...dangerSubmission.card,
          flags: [{ code: "A", message: "x".repeat(501) }]
        }
      })
      .expect(400, { error: "invalid_card" });
  });

  it("rejects a card when the Bot Chain record does not match", async () => {
    const app = createReportApp({
      decisionRecordVerifier: async () => ({
        verified: false,
        reason: "record_arguments_mismatch"
      })
    });

    await request(app)
      .post("/card")
      .send(dangerSubmission)
      .expect(422, {
        error: "card_not_verified",
        reason: "record_arguments_mismatch"
      });
  });

  it("does not store a card when Bot Chain verification is unavailable", async () => {
    const app = createReportApp({
      decisionRecordVerifier: async () => ({
        verified: false,
        reason: "record_verification_unavailable"
      })
    });

    await request(app)
      .post("/card")
      .send(dangerSubmission)
      .expect(503, { error: "card_verification_unavailable" });
  });

  it("does not store a card when verification is not configured", async () => {
    const app = createReportApp({ decisionRecordVerifier: null });

    await request(app)
      .post("/card")
      .send(dangerSubmission)
      .expect(503, { error: "card_verification_unavailable" });
  });
});

// The production host has no fonts and no fontconfig. resvg drops every text
// node when it cannot resolve a family, so a card renders as a silent, wordless
// rectangle. These tests pin the card to fonts the repository ships.

/** Pixels within `tolerance` of `target`, inside the row band `[top, bottom)`. */
function countPixelsNear(
  pixels: Buffer,
  width: number,
  target: [number, number, number],
  band: { top: number; bottom: number },
  tolerance = 60
): number {
  let found = 0;
  for (let y = band.top; y < band.bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        Math.abs(pixels[offset] - target[0]) <= tolerance &&
        Math.abs(pixels[offset + 1] - target[1]) <= tolerance &&
        Math.abs(pixels[offset + 2] - target[2]) <= tolerance
      ) {
        found += 1;
      }
    }
  }
  return found;
}

describe("verdict card fonts", () => {
  it("renders the verdict word without any host fonts installed", () => {
    const svg = renderVerdictCardSvg(clearVerdict);

    // Reproduce the production host exactly: repository fonts only.
    const rendered = new Resvg(svg, {
      fitTo: { mode: "width", value: 600 },
      font: { fontFiles: bundledCardFontFiles(), loadSystemFonts: false }
    }).render();

    // The CLEAR word is drawn at font-size 48 in #156e47, below the accent bar
    // and above the divider. Nothing else in that band uses the primary colour.
    const glyphPixels = countPixelsNear(
      Buffer.from(rendered.pixels),
      rendered.width,
      [21, 110, 71],
      { top: 50, bottom: 95 }
    );

    expect(glyphPixels).toBeGreaterThan(400);
  });

  it("ships every font family the card asks for", () => {
    const files = bundledCardFontFiles();

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(existsSync(file)).toBe(true);
    }
  });

  it("rejects instead of returning SVG bytes when a render fails", async () => {
    await expect(renderVerdictCardPng("<svg not-valid")).rejects.toThrow();
  });

  it("draws every character in the card with a bundled font", () => {
    const svg = renderVerdictCardSvg(clearVerdict);
    const characters = new Set<string>();
    for (const [, content] of svg.matchAll(/<text\b[^>]*>([^<]*)</g)) {
      for (const character of content.trim()) {
        if (character !== " ") characters.add(character);
      }
    }

    expect(characters.size).toBeGreaterThan(20);

    const missing = [...characters].filter((character) => !rendersGlyph(character));
    expect(missing).toEqual([]);
  });
});

/**
 * True when a bundled font covers `character`. resvg draws an unmapped
 * codepoint as a tofu box, so a character that renders identically to an
 * unassigned private-use codepoint has no glyph.
 */
function rendersGlyph(character: string): boolean {
  const probe = (text: string): Buffer => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60">` +
      `<text x="8" y="44" font-family="Archivo" font-size="36">${escapeXml(text)}</text></svg>`;
    return Buffer.from(
      new Resvg(svg, {
        font: { fontFiles: bundledCardFontFiles(), loadSystemFonts: false, defaultFontFamily: "Archivo" }
      }).render().pixels
    );
  };
  // U+E000 is private use and unassigned in both bundled families, so it
  // always renders as the tofu box that marks a missing glyph.
  return !probe(character).equals(probe("\uE000"));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
