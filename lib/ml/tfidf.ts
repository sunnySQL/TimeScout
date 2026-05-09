/**
 * Pure-TS port of sklearn TfidfVectorizer.transform().
 *
 * Given a vocabulary map (term → index) and IDF weights, converts a text
 * string into a sparse TF-IDF vector. Matches sklearn's behavior:
 *   1. Tokenize into n-grams (from the vocabulary, not recomputed)
 *   2. Count term frequencies
 *   3. Multiply by IDF (sublinear TF: tf = 1 + log(raw_tf))
 *   4. L2-normalize
 */

export type TfidfModel = {
  vocabulary: Record<string, number>;
  idf: number[];
  preprocessing: {
    ngram_range: [number, number];
  };
};

/**
 * Sparse vector: Map<featureIndex, value>. Avoids allocating a dense
 * array of 12,000+ floats for a 50-word listing.
 */
export type SparseVec = Map<number, number>;

/**
 * Generate unigrams and bigrams from whitespace-split tokens, matching
 * sklearn's default analyzer (which lowercases and extracts word tokens).
 * The vocabulary acts as a filter: we only emit n-grams that appear in it.
 */
function extractNgrams(
  text: string,
  vocab: Record<string, number>,
  ngramRange: [number, number],
): Map<number, number> {
  const counts = new Map<number, number>();
  const tokens = text.split(/\s+/).filter(Boolean);

  for (let n = ngramRange[0]; n <= ngramRange[1]; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const gram = tokens.slice(i, i + n).join(" ");
      const idx = vocab[gram];
      if (idx !== undefined) {
        counts.set(idx, (counts.get(idx) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function transform(model: TfidfModel, text: string): SparseVec {
  const counts = extractNgrams(
    text,
    model.vocabulary,
    model.preprocessing.ngram_range,
  );

  // Sublinear TF: tf = 1 + log(raw_tf)
  const vec: SparseVec = new Map();
  let norm = 0;
  for (const [idx, rawTf] of counts) {
    const tf = 1 + Math.log(rawTf);
    const tfidf = tf * model.idf[idx];
    vec.set(idx, tfidf);
    norm += tfidf * tfidf;
  }

  // L2 normalization
  if (norm > 0) {
    const invNorm = 1 / Math.sqrt(norm);
    for (const [idx, val] of vec) {
      vec.set(idx, val * invNorm);
    }
  }

  return vec;
}
