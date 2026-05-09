/**
 * Best-effort parser for watch listing titles.
 *
 * This is deliberately conservative: we'd rather return `null` than a wrong
 * brand or reference. Raw fields are always preserved on the listing row so
 * we can re-parse later as the dictionary grows.
 */

export type ParsedWatch = {
  brand: string | null;
  reference: string | null;
};

type BrandEntry = {
  canonical: string;
  /** Patterns (case-insensitive) that identify the brand in a title. */
  patterns: RegExp[];
  /** Reference patterns tried in order after the brand matches. */
  refPatterns?: RegExp[];
};

const WORD_BOUNDARY_START = "(?:^|[^a-z0-9])";
const WORD_BOUNDARY_END = "(?:$|[^a-z0-9])";

function wordPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${WORD_BOUNDARY_START}${escaped}${WORD_BOUNDARY_END}`, "i");
}

const GENERIC_REF_FALLBACK: RegExp[] = [
  /\b\d{4,6}[A-Z]{0,4}(?:-\d{1,4})?\b/,
];

/** Ordered longest-first so "Grand Seiko" beats "Seiko". */
const BRANDS: BrandEntry[] = [
  {
    canonical: "Grand Seiko",
    patterns: [wordPattern("grand seiko"), wordPattern("gs")],
    refPatterns: [/\b[A-Z]{2,4}\d{3,4}[A-Z0-9]*\b/],
  },
  {
    canonical: "Apple",
    // Never match bare "apple" — avoids fruit / prose. Require "apple watch".
    patterns: [/\bapple\s+watch\b/i],
  },
  {
    canonical: "Jaeger-LeCoultre",
    patterns: [
      wordPattern("jaeger-lecoultre"),
      wordPattern("jaeger lecoultre"),
      wordPattern("jlc"),
    ],
    refPatterns: [/\bQ?\d{7}\b/],
  },
  {
    canonical: "Audemars Piguet",
    patterns: [wordPattern("audemars piguet"), wordPattern("audemars"), wordPattern("ap")],
    refPatterns: [
      /\b\d{5,6}(?:ST|SC|OR|BC|BA|IP|CE|BI)(?:\.[A-Z0-9]+)*\b/,
      /\b\d{5,6}\b/,
    ],
  },
  {
    canonical: "Patek Philippe",
    // Do not use bare "pp" — matches PayPal shorthand (PP F&F, PP G&S, etc.).
    patterns: [wordPattern("patek philippe"), wordPattern("patek")],
    refPatterns: [
      /\b\d{4,5}\/\d+[A-Z]+(?:-\d{3})?\b/,
      /\b\d{4,5}[A-Z]?\b/,
    ],
  },
  {
    canonical: "Vacheron Constantin",
    patterns: [wordPattern("vacheron constantin"), wordPattern("vacheron"), wordPattern("vc")],
    refPatterns: [/\b\d{4,5}[A-Z]?\/\d+[A-Z0-9-]+\b/, /\b\d{4,6}[A-Z]?\b/],
  },
  {
    canonical: "A. Lange & Söhne",
    patterns: [
      wordPattern("a. lange & söhne"),
      wordPattern("a lange sohne"),
      wordPattern("lange sohne"),
      wordPattern("a. lange"),
      wordPattern("a lange"),
    ],
    refPatterns: [/\b\d{3}\.\d{3}\b/],
  },
  {
    canonical: "IWC",
    patterns: [wordPattern("iwc schaffhausen"), wordPattern("iwc")],
    refPatterns: [/\bIW\d{6}\b/i],
  },
  {
    canonical: "Parmigiani Fleurier",
    patterns: [wordPattern("parmigiani fleurier"), wordPattern("parmigiani")],
    refPatterns: [/\bPFC\d{3}(?:-\d+)+/i],
  },
  {
    canonical: "Panerai",
    patterns: [wordPattern("officine panerai"), wordPattern("panerai")],
    refPatterns: [/\bPAM\s*0*\d{3,5}\b/i],
  },
  {
    canonical: "TAG Heuer",
    patterns: [wordPattern("tag heuer"), wordPattern("tag-heuer")],
    refPatterns: [/\b[A-Z]{2,4}\d{4}[A-Z]?(?:\.[A-Z]{2}\d{4})?\b/],
  },
  {
    canonical: "Bell & Ross",
    patterns: [wordPattern("bell & ross"), wordPattern("bell ross"), wordPattern("bell and ross")],
    refPatterns: [/\bBR[\s-]?\w{2,}[-\s]?\w+\b/i],
  },
  {
    canonical: "G-Shock",
    patterns: [wordPattern("g-shock"), wordPattern("gshock")],
    refPatterns: [/\b[A-Z]{1,4}-?\d{3,5}[A-Z0-9-]*\b/],
  },
  {
    canonical: "Rolex",
    patterns: [
      wordPattern("rolex"),
      // Model names that are unambiguously Rolex-owned. Safe to match even
      // when the word "Rolex" is missing from the title.
      wordPattern("submariner"),
      wordPattern("gmt-master"),
      wordPattern("gmt master"),
      wordPattern("daytona"),
      wordPattern("datejust"),
      wordPattern("day-date"),
      wordPattern("day date"),
      wordPattern("sea-dweller"),
      wordPattern("sea dweller"),
      wordPattern("deepsea"),
      wordPattern("yacht-master"),
      wordPattern("yacht master"),
      wordPattern("sky-dweller"),
      wordPattern("sky dweller"),
      wordPattern("air-king"),
      wordPattern("air king"),
      wordPattern("milgauss"),
      wordPattern("oyster perpetual"),
      wordPattern("pearlmaster"),
      wordPattern("cellini"),
    ],
    refPatterns: [/\b\d{4,6}[A-Z]{0,4}(?:-\d{4})?\b/],
  },
  {
    canonical: "Tudor",
    patterns: [wordPattern("tudor")],
    refPatterns: [/\b\d{4,6}[A-Z]{0,3}(?:-\d{4})?\b/],
  },
  {
    canonical: "Omega",
    patterns: [wordPattern("omega"), wordPattern("0mega")],
    refPatterns: [
      /\b\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{3}\b/,
      /\b\d{3,4}\.\d{3,4}\b/,
    ],
  },
  {
    canonical: "Grandeur",
    patterns: [
      // JDM dress line — own facet / subtitle, not generic "Seiko".
      /\b(?:seiko\s+grandeur|grandeur\s+seiko)\b/i,
      // Titles often say only "Grandeur" (no "Seiko"). Avoid English "the grandeur …".
      /(?<!\bthe\s)\bgrandeur\b/i,
    ],
    refPatterns: [/\b[A-Z]{2,4}\d{3,4}[A-Z0-9]*\b/],
  },
  {
    canonical: "Seiko",
    patterns: [wordPattern("seiko")],
    refPatterns: [/\b[A-Z]{2,4}\d{3,4}[A-Z0-9]*\b/, /\b\d{4}-\d{4}\b/],
  },
  { canonical: "Certina", patterns: [wordPattern("certina")] },
  { canonical: "Cartier", patterns: [wordPattern("cartier")], refPatterns: [/\bW[A-Z0-9]{6,8}\b/i] },
  {
    canonical: "Breitling",
    patterns: [
      wordPattern("breitling"),
      // Common model-only titles on WTS (e.g. "Colt Chronograph Automatic").
      /\bcolt\s+chronograph\b/i,
    ],
    refPatterns: [/\b[A-Z]{1,2}\d{4,8}[A-Z0-9]*\b/],
  },
  { canonical: "Hamilton", patterns: [wordPattern("hamilton")], refPatterns: [/\bH\d{8}\b/i] },
  { canonical: "Longines", patterns: [wordPattern("longines")], refPatterns: [/\bL\d\.\d{3}\.\d\.\d{2}\.\d\b/i] },
  { canonical: "Tissot", patterns: [wordPattern("tissot")], refPatterns: [/\bT\d{3}\.\d{3}\.\d{2}\.\d{3}\.\d{2}\b/i] },
  { canonical: "Zenith", patterns: [wordPattern("zenith")] },
  { canonical: "Hublot", patterns: [wordPattern("hublot")] },
  { canonical: "Oris", patterns: [wordPattern("oris")] },
  { canonical: "Blancpain", patterns: [wordPattern("blancpain")] },
  { canonical: "Chopard", patterns: [wordPattern("chopard")] },
  { canonical: "Piaget", patterns: [wordPattern("piaget")] },
  { canonical: "Sinn", patterns: [wordPattern("sinn")] },
  { canonical: "Nomos", patterns: [wordPattern("nomos glashütte"), wordPattern("nomos glashutte"), wordPattern("nomos")] },
  { canonical: "Montblanc", patterns: [wordPattern("montblanc")] },
  { canonical: "Citizen", patterns: [wordPattern("citizen")] },
  { canonical: "Casio", patterns: [wordPattern("casio")] },
  { canonical: "Orient", patterns: [wordPattern("orient")] },
  { canonical: "Bulova", patterns: [wordPattern("bulova")] },
  { canonical: "Mido", patterns: [wordPattern("mido")] },
  { canonical: "Zodiac", patterns: [wordPattern("zodiac")] },
  { canonical: "Doxa", patterns: [wordPattern("doxa")] },

  // Haute horlogerie / indie — common on Reddit WTS.
  {
    canonical: "F.P. Journe",
    patterns: [
      wordPattern("f.p. journe"),
      wordPattern("f p journe"),
      wordPattern("fp journe"),
      wordPattern("fpjourne"),
      wordPattern("journe"),
      wordPattern("fpj"),
    ],
  },
  {
    canonical: "H. Moser & Cie.",
    patterns: [
      wordPattern("h. moser & cie"),
      wordPattern("h moser"),
      wordPattern("moser & cie"),
      wordPattern("moser cie"),
      wordPattern("moser"),
    ],
  },
  { canonical: "Richard Mille", patterns: [wordPattern("richard mille")] },
  { canonical: "MB&F", patterns: [wordPattern("mb&f"), wordPattern("mb f")] },
  { canonical: "Bulgari", patterns: [wordPattern("bulgari"), wordPattern("bvlgari")] },
  { canonical: "Ulysse Nardin", patterns: [wordPattern("ulysse nardin")] },
  { canonical: "Bremont", patterns: [wordPattern("bremont")] },
  {
    canonical: "Christopher Ward",
    patterns: [wordPattern("christopher ward")],
  },
  { canonical: "Monta", patterns: [wordPattern("monta")] },
  { canonical: "Farer", patterns: [wordPattern("farer")] },
  { canonical: "Favre Leuba", patterns: [wordPattern("favre leuba"), wordPattern("fave leuba")] },
  { canonical: "Halios", patterns: [wordPattern("halios")] },
  { canonical: "Baltic", patterns: [wordPattern("baltic")] },
  { canonical: "Lorier", patterns: [wordPattern("lorier")] },
  { canonical: "Zelos", patterns: [wordPattern("zelos"), wordPattern("swordfish")] },
  { canonical: "Unimatic", patterns: [wordPattern("unimatic")] },
  { canonical: "Serica", patterns: [wordPattern("serica")] },
  { canonical: "Formex", patterns: [wordPattern("formex")] },
  { canonical: "Marathon", patterns: [wordPattern("marathon")] },
  { canonical: "Traska", patterns: [wordPattern("traska")] },
  { canonical: "Squale", patterns: [wordPattern("squale")] },
  { canonical: "Sternglas", patterns: [wordPattern("sternglas")] },
  { canonical: "Glycine", patterns: [wordPattern("glycine")] },
  { canonical: "Gucci", patterns: [wordPattern("gucci")] },
  { canonical: "Zeppelin", patterns: [wordPattern("zeppelin")] },
  { canonical: "Junghans", patterns: [wordPattern("junghans")] },
  { canonical: "Laco", patterns: [wordPattern("laco")] },
  { canonical: "Stowa", patterns: [wordPattern("stowa")] },
  { canonical: "Fortis", patterns: [wordPattern("fortis")] },
  { canonical: "Yema", patterns: [wordPattern("yema")] },
  { canonical: "Nivada Grenchen", patterns: [wordPattern("nivada grenchen"), wordPattern("nivada")] },
  { canonical: "Maurice Lacroix", patterns: [wordPattern("maurice lacroix")] },
  { canonical: "Raymond Weil", patterns: [wordPattern("raymond weil")] },
  { canonical: "Frederique Constant", patterns: [wordPattern("frederique constant")] },
  { canonical: "Mühle-Glashütte", patterns: [wordPattern("mühle-glashütte"), wordPattern("muhle glashutte"), wordPattern("mühle"), wordPattern("muhle")] },
  { canonical: "Ball", patterns: [wordPattern("ball watch"), wordPattern("ball company")] },
  { canonical: "Movado", patterns: [wordPattern("movado")] },
  { canonical: "Rado", patterns: [wordPattern("rado")] },
  { canonical: "Alpina", patterns: [wordPattern("alpina")] },
  { canonical: "Eterna", patterns: [wordPattern("eterna")] },
  { canonical: "Sangin", patterns: [wordPattern("sangin")] },
  { canonical: "Fears", patterns: [wordPattern("fears")] },
  { canonical: "Nodus", patterns: [wordPattern("nodus")] },
  {
    canonical: "Girard-Perregaux",
    patterns: [wordPattern("girard-perregaux"), wordPattern("girard perregaux")],
  },
  {
    canonical: "Glashütte",
    patterns: [
      wordPattern("glashütte original"),
      wordPattern("glashutte original"),
      wordPattern("glashütte"),
      wordPattern("glashutte"),
    ],
  },
  {
    canonical: "Studio Underd0g",
    patterns: [wordPattern("studio underd0g"), wordPattern("studio underdog")],
  },
  { canonical: "Heron", patterns: [wordPattern("heron watch")] },
  { canonical: "CWC", patterns: [wordPattern("cwc")] },
  { canonical: "Vostok", patterns: [wordPattern("vostok")] },
  { canonical: "Victorinox", patterns: [wordPattern("victorinox"), wordPattern("swiss army")] },
  { canonical: "Sigma", patterns: [wordPattern("sigma-valmon"), wordPattern("sigma valmon")] },
  { canonical: "Vulcain", patterns: [wordPattern("vulcain")] },
  // Thai microbrand; do NOT use wordPattern("wise") — /i would match English "wise".
  {
    canonical: "WISE",
    patterns: [
      // Avoid matching the payment app in OP comments ("Payment: Wise/Revolut").
      wordPattern("wise adamascus"),
      wordPattern("adamascus"),
      /\bAD\d{3,5}[A-Z]\b/i,
    ],
    refPatterns: [/\bAD\d{3,5}[A-Z]\b/i],
  },
  { canonical: "Enicar", patterns: [wordPattern("enicar")] },
  { canonical: "Crepas", patterns: [wordPattern("crepas")] },
  { canonical: "Alcadus", patterns: [wordPattern("alcadus")] },
  { canonical: "Autodromo", patterns: [wordPattern("autodromo")] },
  { canonical: "Anordain", patterns: [wordPattern("anordain")] },
  { canonical: "Kurono", patterns: [wordPattern("kurono tokyo"), wordPattern("kurono")] },
  { canonical: "Hemel", patterns: [wordPattern("hemel")] },
  { canonical: "Dan Henry", patterns: [wordPattern("dan henry")] },
  { canonical: "Henry Archer", patterns: [/\bhenry\s+archer\b/i] },
  { canonical: "Ginault", patterns: [wordPattern("ginault")] },
  { canonical: "Lorus", patterns: [wordPattern("lorus")] },
  // Timex owns the Giorgio Galli sub-line; bucket both together.
  {
    canonical: "Timex",
    patterns: [wordPattern("timex"), wordPattern("giorgio galli")],
  },
];

/**
 * Reference prefixes that uniquely identify a brand when the brand name is
 * missing from the title. Reddit WTS posts often look like
 *   "[WTS] SBDL103 - Night Vision, Solar, LNIB"
 * so this rescues that case.
 *
 * Keep this list conservative: only prefixes we're very confident belong to
 * exactly one brand go here.
 */
const REFERENCE_BRAND_HINTS: Array<{
  canonical: string;
  re: RegExp;
}> = [
  // Grand Seiko: SBG*, SLG*, SBGN/SBGR/SBGA/SBGH/SBGJ/SBGW/SBGM/SBGX/SBGE/SBGV/SBGY
  { canonical: "Grand Seiko", re: /\bSBG[A-Z]\d{3,4}[A-Z]?\b/i },
  { canonical: "Grand Seiko", re: /\bSLG[A-Z]\d{3,4}[A-Z]?\b/i },
  // Seiko modern refs
  { canonical: "Seiko", re: /\bSLA\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSPB\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSBDC\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSBDJ\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSBDL\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSBDY\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSBSA\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSRPD\d{2,3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSRPE\d{2,3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSRPH\d{2,3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSSC\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSARY\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSARB\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSARX\d{3}[A-Z]?\b/i },
  { canonical: "Seiko", re: /\bSNR\d{3}[A-Z]?\b/i },
];

const YEAR_RE = /^(?:19|20)\d{2}$/;
const NOISE_TOKENS = new Set([
  "mm",
  "box",
  "papers",
  "new",
  "used",
  "unworn",
  "vintage",
  "mint",
  "automatic",
  "quartz",
  "chronograph",
  "dial",
  "steel",
  "gold",
  "rose",
  "white",
  "black",
  "blue",
  "green",
  "silver",
  "full",
  "set",
  "sapphire",
  "titanium",
  "ref",
  "reference",
]);

/** Single match exec (patterns may include `g` from callers; we only need the first hit). */
function execOne(re: RegExp, title: string): RegExpExecArray | null {
  const flags = re.flags.includes("g") ? re.flags.replace(/g/g, "") : re.flags;
  return new RegExp(re.source, flags).exec(title);
}

/**
 * Indices where the rest of the text reads as comparison / analogy / nickname
 * prose (e.g. after "vs", "looks like a …", "aka Baby Grand Seiko"). Brand
 * matches at or after these points are ignored for bundle co-occurrence and
 * heavily penalized in `parseWatch` so the for-sale watch wins over a name-drop.
 */
function comparisonZoneStarts(title: string): number[] {
  const starts = new Set<number>();
  const triggers = [
    /\b(?:vs\.?|versus)\b/gi,
    /\blooks\s+like\s+(?:a|an|the)\s/gi,
    /\blooks\s+just\s+like\s+(?:a|an|the)\s/gi,
    /\bsimilar\s+to\s+(?:a|an|the)\s/gi,
    /\bcompared\s+to\s+(?:a|an|the)\s/gi,
    /\bcompared\s+with\s+(?:a|an|the)\s/gi,
    /\bhomage\s+to\s+(?:a|an|the)\s/gi,
    /\bnot\s+(?:a\s+)?(?:real|genuine)\s+/gi,
    /\baka\b/gi,
    /\balso\s+known\s+as\b/gi,
    /\bknown\s+as\b/gi,
    /\bnicknamed\b/gi,
    /\bnickname\b/gi,
    /\bcalled\b/gi,
  ];
  for (const re of triggers) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(title)) !== null) {
      if (m.index !== undefined) starts.add(m.index);
    }
  }
  return [...starts].sort((a, b) => a - b);
}

function matchIsInComparisonTail(matchIndex: number, zoneStarts: number[]): boolean {
  return zoneStarts.some((z) => matchIndex >= z);
}

/** Half-open intervals [start, end). */
function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function earliestMatchForBrand(title: string, b: BrandEntry): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const p of b.patterns) {
    const m = execOne(p, title);
    if (!m || m.index === undefined) continue;
    const idx = m.index;
    const len = m[0].length;
    if (best === null || idx < best.index || (idx === best.index && len > best.length)) {
      best = { index: idx, length: len };
    }
  }
  return best;
}

function scoreBrandPosition(
  title: string,
  matchIndex: number,
  matchLength: number,
  zoneStarts: number[],
): number {
  let score = Math.max(4, matchLength) * 2;
  if (matchIndex < 52) score += 22;
  if (matchIsInComparisonTail(matchIndex, zoneStarts)) score -= 95;
  return score;
}

/**
 * Remove trade-preference blocks (desired swap targets), not offered inventory.
 * Lines starting with common trade headers are dropped until a blank line or a
 * line that looks like a new listing section (price, asking, etc.).
 *
 * Used before brand co-occurrence / bundle heuristics so "Trades: Rolex, AP"
 * does not false-trigger multi-watch detection.
 */
export function stripTradePreferenceSections(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let skip = false;

  const tradeHeader =
    /^\s*(?:trades?\s*:|trade\s+interests?\s*:|open\s+to\s+trades\b|will\s+consider\s+trades\b|trades\s+may\s+be\s+considered\b)/i;

  const resumeSaleSection =
    /^\s*(?:price|asking|payment|shipping|included|condition|notes|details|spec(?:ifications)?|dimensions|what'?s\s+included|timestamp|imgur)\s*:/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!skip && tradeHeader.test(line)) {
      skip = true;
      continue;
    }
    if (skip) {
      if (trimmed === "") {
        skip = false;
        continue;
      }
      if (resumeSaleSection.test(line) || /^\$\s*\d/.test(trimmed)) {
        skip = false;
        kept.push(line);
        continue;
      }
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n");
}

/**
 * Return every brand from the dictionary whose pattern(s) match the title,
 * excluding matches that only appear in a comparison / analogy / nickname tail.
 * Used by bundle detection to decide whether a listing mentions 2+ brands.
 *
 * Overlap rule: if two matches share any character (nested substring brands like
 * "Seiko" inside "Grand Seiko"), keep only the longer span so bundle logic
 * does not see false multi-brand hits from one watch title.
 *
 * Examples:
 * - `Grand Seiko Diver` → {"Grand Seiko"} only (not Seiko).
 * - `Rolex Submariner + Omega Speedmaster` → both brands (non-overlapping).
 */
export function listAllBrandHits(rawTitle: string): Set<string> {
  const title = (rawTitle || "").trim();
  if (!title) return new Set();
  const zones = comparisonZoneStarts(title);
  type SpanHit = { canonical: string; start: number; end: number };
  const raw: SpanHit[] = [];
  for (const b of BRANDS) {
    const em = earliestMatchForBrand(title, b);
    if (!em) continue;
    if (matchIsInComparisonTail(em.index, zones)) continue;
    raw.push({
      canonical: b.canonical,
      start: em.index,
      end: em.index + em.length,
    });
  }

  raw.sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    if (a.start !== b.start) return a.start - b.start;
    return a.canonical.localeCompare(b.canonical);
  });

  const kept: SpanHit[] = [];
  for (const h of raw) {
    const hLen = h.end - h.start;
    const swallowedByLonger = kept.some(
      (k) =>
        rangesOverlap(h.start, h.end, k.start, k.end) &&
        k.end - k.start >= hLen,
    );
    if (!swallowedByLonger) kept.push(h);
  }

  return new Set(kept.map((k) => k.canonical));
}

export function parseWatch(rawTitle: string): ParsedWatch {
  const title = (rawTitle || "").trim();
  if (!title) return { brand: null, reference: null };

  const zones = comparisonZoneStarts(title);
  type Cand = { entry: BrandEntry; score: number; index: number; order: number };
  const cands: Cand[] = [];
  let order = 0;
  for (const b of BRANDS) {
    const em = earliestMatchForBrand(title, b);
    if (!em) {
      order++;
      continue;
    }
    const score = scoreBrandPosition(title, em.index, em.length, zones);
    cands.push({ entry: b, score, index: em.index, order });
    order++;
  }

  let brand: BrandEntry | null = null;
  if (cands.length > 0) {
    cands.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.index !== b.index) return a.index - b.index;
      return a.order - b.order;
    });
    brand = cands[0]!.entry;
  }

  if (!brand) {
    // Reference-only fallback: infer brand from a known reference prefix.
    for (const hint of REFERENCE_BRAND_HINTS) {
      const m = title.match(hint.re);
      if (m) {
        return { brand: hint.canonical, reference: m[0].toUpperCase() };
      }
    }
    return { brand: null, reference: null };
  }

  const afterBrand = stripBrandMention(title, brand);
  const reference = findReference(afterBrand, brand.refPatterns ?? GENERIC_REF_FALLBACK);

  return { brand: brand.canonical, reference };
}

function stripBrandMention(title: string, brand: BrandEntry): string {
  let out = title;
  for (const p of brand.patterns) {
    out = out.replace(new RegExp(p.source, p.flags.includes("g") ? p.flags : p.flags + "g"), " ");
  }
  return out;
}

function findReference(text: string, patterns: RegExp[]): string | null {
  for (const pat of patterns) {
    const m = text.match(pat);
    if (!m) continue;
    const candidate = m[0].trim();
    if (isNoise(candidate)) continue;
    return candidate.toUpperCase();
  }
  return null;
}

function isNoise(token: string): boolean {
  const t = token.toLowerCase();
  if (YEAR_RE.test(t)) return true;
  if (NOISE_TOKENS.has(t)) return true;
  if (/^\d{1,3}mm$/i.test(t)) return true;
  return false;
}
