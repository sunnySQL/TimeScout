/**
 * Lazy model loader. Reads JSON model files from the models/ directory once,
 * caches in memory. Models are ~100–700 KB each; total footprint ~1.2 MB.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TfidfModel } from "./tfidf";
import type { LogRegModel } from "./logistic";

export type ModelBundle = TfidfModel & LogRegModel;

const cache = new Map<string, ModelBundle>();

function modelsDir(): string {
  return join(process.cwd(), "models");
}

export function loadModel(name: string): ModelBundle | null {
  const cached = cache.get(name);
  if (cached) return cached;

  try {
    const raw = readFileSync(join(modelsDir(), `${name}.json`), "utf8");
    const model = JSON.parse(raw) as ModelBundle;
    cache.set(name, model);
    return model;
  } catch {
    return null;
  }
}
