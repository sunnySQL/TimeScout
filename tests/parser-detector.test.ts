import { describe, expect, it } from "vitest";
import {
  detectSold,
  extractCondition,
  extractUsdPriceCents,
  extractWatchType,
} from "@/lib/reddit/browse";
import { detectBundle } from "@/lib/watches/bundle";
import {
  listAllBrandHits,
  parseWatch,
  stripTradePreferenceSections,
} from "@/lib/watches/parse";

function brands(text: string): string[] {
  return [...listAllBrandHits(text)].sort();
}

describe("extractUsdPriceCents", () => {
  it('parses "$6799 shipped" as listing price (679900 cents)', () => {
    expect(extractUsdPriceCents("Omega Seamaster Diver", "$6799 shipped CONUS")).toBe(679900);
  });

  it('parses "$7,600" as 760000 cents', () => {
    expect(extractUsdPriceCents("Omega Speedmaster Professional $7,600")).toBe(760000);
  });

  it("prefers well-formed title price over body typo ($11,00)", () => {
    expect(
      extractUsdPriceCents(
        "[WTS] Omega Speedmaster 38mm $11,000",
        "Edit: price in title is correct — body typo $11,00",
      ),
    ).toBe(1_100_000);
  });

  it("prefers explicit Price: … USD over Shipping: $…", () => {
    const body = [
      "LM Linen Dial",
      "Price: 320USD",
      "Shipping: $50 USD",
    ].join("\n");
    expect(extractUsdPriceCents("[WTS]", body)).toBe(32000);
  });

  it('prefers body "price change: $…" over stale title price', () => {
    expect(
      extractUsdPriceCents(
        "SeikoDials mod — $800",
        "price change: $700 firm\nPayPal F&F preferred.",
      ),
    ).toBe(70000);
  });

  it("parses keycap emoji digits in Tudor-style titles ($3️⃣,1️⃣0️⃣0️⃣)", () => {
    expect(
      extractUsdPriceCents(
        "2024 Tudor Pelagos FXD M.N.24 Full Set $3️⃣,1️⃣0️⃣0️⃣ Shipped",
      ),
    ).toBe(310000);
  });

  it("parses mixed ASCII comma grouping and keycap digits", () => {
    expect(extractUsdPriceCents("[WTS] Omega", "$3,1️⃣0️⃣0️⃣ shipped")).toBe(310000);
  });
});

describe("detectBundle", () => {
  it("Glashütte wholesale pricing alone is not a bundle (canonical GO titles)", () => {
    expect(
      detectBundle(
        "[WTS] Glashütte Original Senator",
        "selling this at WHOLESALE for $9,800 — single piece from AD.",
      ),
    ).toBe(false);
  });

  it("Omega listing with seller bio / r/tudor shout-outs is not a bundle", () => {
    const body = [
      "Posted before at r/tudor — cross-posting here.",
      "I sell a lot of watches and have hundreds of references.",
      "I carry 15+ brands and multiple listings at a time.",
      "This Speedmaster is a one-watch sale; serial blurred.",
    ].join("\n");
    expect(detectBundle("[WTS] Omega Speedmaster Professional Moonwatch", body)).toBe(false);
  });

  it("Parmigiani + trade targets does not bundle", () => {
    const text = stripTradePreferenceSections(`[WTS] Parmigiani Fleurier Tonda PF

Beautiful piece. Full set.

Trades: modern Rolex, AP, or Patek Philippe considered.

Price: $8200 shipped`);
    expect(detectBundle("[WTS] Parmigiani Fleurier Tonda PF", text)).toBe(false);
    expect(brands(text)).toEqual(["Parmigiani Fleurier"]);
  });

  it("Rolex GMT Pepsi + trade targets: single brand after strip", () => {
    const text = stripTradePreferenceSections(`[WTS] Rolex GMT-Master Pepsi

Trades: modern Rolex, AP, or Patek Philippe

Asking $14,500`);
    expect(detectBundle("[WTS] Rolex GMT-Master Pepsi", text)).toBe(false);
    expect(brands(text)).toEqual(["Rolex"]);
  });

  it("Hamilton Murph bracelet + strap kit is not a multi-watch bundle", () => {
    expect(
      detectBundle(
        "[WTS] Hamilton Murph Bracelet Bundle",
        "One Murph on bracelet plus OEM leather strap — single watch, two wear options.",
      ),
    ).toBe(false);
  });

  it("Seiko SARB033 full set + extra strap is not a bundle", () => {
    expect(
      detectBundle(
        "[WTS] Seiko SARB033 Full Set + Extra Black Leather Strap",
        "Includes box and papers; extra strap unused.",
      ),
    ).toBe(false);
  });

  it("Zodiac with boxes/manual/spare links is not a bundle", () => {
    expect(
      detectBundle(
        "[WTS] Zodiac Super Sea Wolf",
        "Comes with inner/outer boxes, manual, warranty card, and extra links.",
      ),
    ).toBe(false);
  });

  it("custom build multi-piece sale with per-unit pricing is a bundle", () => {
    const body = [
      "Built a couple custom pieces — GMT dial swap on SEIKONAUT base.",
      "Asking $160/ea or $300 for both.",
    ].join("\n");
    expect(detectBundle("[WTS] Custom Seiko mods — take your pick", body)).toBe(true);
  });

  it("two Sternglas watches / total price is a bundle", () => {
    expect(
      detectBundle(
        "[WTS] Sternglas Hamburg Chrono & Naos",
        "Selling two Sternglas watches together — $275 total shipped.",
      ),
    ).toBe(true);
  });

  it("collection sale with multiple brands and prices is a bundle", () => {
    const body = [
      "Thinning the collection — Omega AT $4k, Christopher Ward $650,",
      "Breitling Colt $900, Grand Seiko quartz $1.1k, Tudor BB58 $2.8k.",
      "Individual timestamps available.",
    ].join("\n");
    expect(detectBundle("[WTS] Watch collection sale — multiple pieces", body)).toBe(true);
  });
});

describe("stripTradePreferenceSections / listAllBrandHits", () => {
  it("strips trade headers so swap targets are not inventory brands", () => {
    const raw = `[WTS] Parmigiani Fleurier

Trades: Rolex, AP, Patek

Price: $5000`;
    const stripped = stripTradePreferenceSections(raw);
    expect(stripped).not.toMatch(/\bAP\b/);
    expect(brands(stripped)).toEqual(["Parmigiani Fleurier"]);
  });
});

describe("parseWatch", () => {
  it("Seiko Gold Tank 5933-5080", () => {
    const p = parseWatch("[WTS] Seiko Gold Tank 5933-5080");
    expect(p.brand).toBe("Seiko");
    expect(p.reference).toBe("5933-5080");
  });

  it("Omega Geneve 166.0168", () => {
    const p = parseWatch("[WTS] Omega Geneve 166.0168");
    expect(p.brand).toBe("Omega");
    expect(p.reference).toBe("166.0168");
  });

  it("Omega Seamaster 166.0167", () => {
    const p = parseWatch("[WTS] Omega Seamaster 166.0167");
    expect(p.brand).toBe("Omega");
    expect(p.reference).toBe("166.0167");
  });

  it("IWC Big Pilot Heritage IW501004", () => {
    const p = parseWatch("[WTS] IWC Big Pilot Heritage IW501004");
    expect(p.brand).toBe("IWC");
    expect(p.reference).toBe("IW501004");
  });

  it("Parmigiani Fleurier PFC912-1020001-100182", () => {
    const p = parseWatch("[WTS] Parmigiani Fleurier PFC912-1020001-100182");
    expect(p.brand).toBe("Parmigiani Fleurier");
    expect(p.reference).toBe("PFC912-1020001-100182");
  });

  it('maps typo "Fave Leuba" to Favre Leuba', () => {
    const p = parseWatch("[WTS] Fave Leuba Sea King automatic");
    expect(p.brand).toBe("Favre Leuba");
  });

  it("canonical Glashütte: Original spelling variants", () => {
    expect(parseWatch("[WTS] Glashütte Original Senator Panorama").brand).toBe("Glashütte");
    expect(parseWatch("[WTS] Glashutte Original Seventies").brand).toBe("Glashütte");
  });

  it("canonical Glashütte: bare town spelling", () => {
    expect(parseWatch("[WTS] Glashütte Sixties Chronograph").brand).toBe("Glashütte");
    expect(parseWatch("[WTS] Glashutte Sixties Chronograph").brand).toBe("Glashütte");
  });

  it("Nomos Glashütte stays Nomos; Mühle-Glashütte stays Mühle-Glashütte", () => {
    expect(parseWatch("[WTS] Nomos Glashütte Orion 39").brand).toBe("Nomos");
    expect(parseWatch("[WTS] Mühle-Glashütte S.A.R. Flieger").brand).toBe("Mühle-Glashütte");
    expect(parseWatch("[WTS] Muhle Glashutte Terrasport").brand).toBe("Mühle-Glashütte");
  });
});

describe("extractCondition / extractWatchType", () => {
  it("Brand new 2025 Omega: unworn, not vintage watch-type", () => {
    const title = "[WTS] Omega Seamaster 300 — Brand new 2025 full set";
    expect(extractCondition(title, "")).toBe("unworn");
    expect(extractWatchType(title, "")).toBeNull();
  });

  it('does not treat "Vintage Style" strap marketing as vintage era', () => {
    const text =
      "Seiko Turtle SRPE03 on Vintage Style Waffle Strap — excellent condition.";
    expect(extractWatchType(text, "")).toBeNull();
  });

  it("Zodiac with crown/running issue language maps to fair", () => {
    const body =
      "Zodiac Aerospace GMT — serious running issues and crown doesn't screw down reliably.";
    expect(extractCondition("[WTS] Zodiac Aerospace GMT", body)).toBe("fair");
  });

  it("1969 Omega Seamaster reads as vintage era", () => {
    const title = "[WTS] 1969 Omega Seamaster Cosmic crosshair dial";
    expect(extractWatchType(title, "")).toBe("vintage");
  });
});

describe("detectSold", () => {
  it("detects [SOLD] in OP comment", () => {
    expect(
      detectSold({
        title: "[WTS] Tudor Black Bay 58",
        flair: null,
        opCommentText: "[SOLD] Thanks everyone!",
      }),
    ).toBe(true);
  });

  it('detects "sold to u/…" in OP comment', () => {
    expect(
      detectSold({
        title: "[WTS] Seiko SPB143",
        flair: "WTS",
        opCommentText: "sold to u/BuyerMcBuyface — appreciate the smooth deal",
      }),
    ).toBe(true);
  });
});
