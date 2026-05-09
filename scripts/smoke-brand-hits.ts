/**
 * Manual smoke checks for nested brand overlap + bundle heuristics.
 * Run: npx tsx scripts/smoke-brand-hits.ts
 */

import { detectBundle } from "../lib/watches/bundle";
import { listAllBrandHits, stripTradePreferenceSections } from "../lib/watches/parse";

function assert(ok: boolean, msg: string): void {
  if (!ok) {
    console.error(msg);
    process.exit(1);
  }
}

function setEq(a: Set<string>, expected: string[]): void {
  const exp = new Set(expected);
  assert(
    a.size === exp.size && [...a].every((x) => exp.has(x)),
    `Expected {${[...exp].sort().join(", ")}}, got {${[...a].sort().join(", ")}}`,
  );
}

setEq(listAllBrandHits("Grand Seiko Diver SBGA229"), ["Grand Seiko"]);

const dual = listAllBrandHits("Rolex Submariner + Omega Speedmaster");
assert(dual.has("Rolex") && dual.has("Omega"), `Dual-brand title missing hits: ${[...dual].join(", ")}`);

assert(
  detectBundle(
    "Grand Seiko Diver SBGA229",
    "What's Included: Watch, Double box, Papers, GS Rice Paper...",
  ) === false,
  "Single Grand Seiko + accessory commas should not be a bundle",
);

assert(
  detectBundle("Rolex Submariner + Omega Speedmaster") === true,
  "Two brands with + should still detect as bundle/multi-watch signal",
);

assert(
  detectBundle(
    "[WTS] Glashütte Original Seventies Chronograph",
    "I sell a lot of watches but this is my personal piece. References upon request. Happy transactions!",
  ) === false,
  "Seller bio phrases (lot of watches / references / transactions) should not trigger bundle",
);

assert(
  detectBundle(
    "[WTS] Glashütte Original Seventies Chronograph",
    "Selling this at WHOLESALE for $9,800. Full kit, excellent condition.",
  ) === false,
  "Bare wholesale pricing should not trigger bundle (Glashütte Seventies Chronograph)",
);

assert(
  detectBundle("Clearout", "Wholesale lot — three Omega Speedmasters") === true,
  "Wholesale + explicit lot + multi-watch context should still detect bundle",
);

assert(
  detectBundle("Hamilton Khaki", "Selling as a bundle with extras") === true,
  "Lot/bundle keyword should still trigger",
);

const tradeTargetsBlurb = `Excellent condition.

Trades: modern Rolex, AP, or Patek Philippe`;

assert(
  detectBundle("[WTS] Parmigiani Fleurier Tonda PF", tradeTargetsBlurb) === false,
  "Trade preference section must not imply bundle (Parmigiani Tonda PF)",
);

assert(
  detectBundle("[WTS] Rolex GMT-Master II Pepsi", tradeTargetsBlurb) === false,
  "Trade preference section must not imply bundle (GMT Pepsi)",
);

assert(
  listAllBrandHits(
    stripTradePreferenceSections(`[WTS] Rolex GMT-Master II Pepsi\n\n${tradeTargetsBlurb}`),
  ).size === 1,
  "Trade section brands must not count toward multi-brand hits",
);

assert(
  detectBundle("Rolex Submariner + Omega Speedmaster", tradeTargetsBlurb) === true,
  "Real dual-brand sale must still detect bundle with trade footer present",
);

assert(
  detectBundle("Sale post", `Here are 3 watches from my collection.\n\n${tradeTargetsBlurb}`) === true,
  "Explicit multi-watch inventory must still detect bundle above trade section",
);

console.log("smoke-brand-hits: OK");
