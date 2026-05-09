/**
 * Local brand disambiguator.
 *
 * Uses the existing regex/dictionary brand list from lib/watches/parse.ts
 * as a candidate generator, then scores each candidate with the trained
 * binary model (correct_brand vs wrong_brand). Returns the highest-scoring
 * candidate above the threshold.
 *
 * This design avoids 93-way classification and handles the long tail of
 * rare brands by reusing the curated dictionary.
 */

import { normalizeText } from "../features";
import { transform } from "../tfidf";
import { predict, type Prediction } from "../logistic";
import { loadModel } from "../loader";

/**
 * Canonical brand names extracted from lib/watches/parse.ts.
 * We only need the names here since regex candidacy was already checked.
 * Import the full list lazily from parseWatch exports.
 */
import { parseWatch } from "../../watches/parse";

export function classifyBrand(
  title: string,
  body?: string | null,
): Prediction | null {
  const model = loadModel("brand_disambiguator");
  if (!model) return null;

  // The existing regex parser produces a candidate brand
  const regexResult = parseWatch(title);
  if (regexResult.brand) {
    // Regex already found a brand — score it for disambiguation
    const text = normalizeText(title, body);
    const input = `${text} __BRAND__ ${regexResult.brand.toLowerCase()}`;
    const vec = transform(model, input);
    const pred = predict(model, vec);

    // Only surface if model agrees it's correct
    if (pred.label === "correct_brand") {
      return {
        label: regexResult.brand,
        confidence: pred.confidence,
        probabilities: pred.probabilities,
      };
    }
    return null;
  }

  // No regex match — try all known brand names as candidates and pick the
  // highest-scoring one. This is expensive (93 inference calls) but we're
  // only here when regex failed, and each call is sub-millisecond.
  const text = normalizeText(title, body);
  const brands = getKnownBrands();
  let best: Prediction | null = null;

  for (const brand of brands) {
    // Quick heuristic pre-filter: skip brands whose name doesn't appear
    // anywhere in the normalized text. Text is already lowercased.
    // This cuts 90%+ of candidates before model inference.
    const brandLower = brand.toLowerCase();
    if (!text.includes(brandLower)) continue;

    const input = `${text} __BRAND__ ${brand.toLowerCase()}`;
    const vec = transform(model, input);
    const pred = predict(model, vec);

    if (pred.label !== "correct_brand") continue;
    if (!best || pred.confidence > best.confidence) {
      best = {
        label: brand,
        confidence: pred.confidence,
        probabilities: pred.probabilities,
      };
    }
  }

  return best;
}

let _knownBrands: string[] | null = null;

function getKnownBrands(): string[] {
  if (_knownBrands) return _knownBrands;

  // Hardcoded from the BRANDS array in lib/watches/parse.ts.
  // If that list changes, regenerate by running:
  //   node -e "const {BRAND_NAMES} = require('./lib/watches/parse'); console.log(JSON.stringify(BRAND_NAMES))"
  _knownBrands = [
    "Grand Seiko", "Apple", "Jaeger-LeCoultre", "Audemars Piguet",
    "Patek Philippe", "Vacheron Constantin", "A. Lange & Söhne",
    "IWC", "Panerai", "TAG Heuer", "Bell & Ross", "G-Shock",
    "Rolex", "Tudor", "Omega", "Grandeur", "Seiko", "Certina",
    "Cartier", "Breitling", "Hamilton", "Longines", "Tissot",
    "Zenith", "Hublot", "Oris", "Blancpain", "Chopard", "Piaget",
    "Sinn", "Nomos", "Montblanc", "Citizen", "Casio", "Orient",
    "Bulova", "Mido", "Zodiac", "Doxa", "F.P. Journe",
    "H. Moser & Cie.", "Richard Mille", "MB&F", "Bulgari",
    "Ulysse Nardin", "Bremont", "Christopher Ward", "Monta",
    "Farer", "Halios", "Baltic", "Lorier", "Zelos", "Unimatic",
    "Serica", "Formex", "Marathon", "Traska", "Squale", "Glycine",
    "Gucci", "Zeppelin", "Junghans", "Laco", "Stowa", "Fortis",
    "Yema", "Nivada Grenchen", "Maurice Lacroix", "Raymond Weil",
    "Frederique Constant", "Mühle-Glashütte", "Ball", "Movado",
    "Rado", "Alpina", "Eterna", "Sangin", "Fears", "Nodus",
    "Girard-Perregaux", "Glashütte", "Studio Underd0g", "Heron", "CWC",
    "Vostok", "Victorinox", "Sigma", "Vulcain", "WISE", "Enicar",
    "Crepas", "Alcadus", "Autodromo", "Anordain", "Kurono",
    "Hemel", "Dan Henry", "Henry Archer", "Ginault", "Lorus",
    "Timex",
  ];

  return _knownBrands;
}
