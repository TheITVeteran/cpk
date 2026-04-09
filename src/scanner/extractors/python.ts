/**
 * Python symbol and import extractor (MVP stub).
 *
 * Tier 1 language but not in MVP. Returns empty results for now.
 * Full implementation deferred to post-MVP.
 */
import type ParserType from "web-tree-sitter";
import type { ExtractResult } from "./typescript.js";

export function extractPython(_tree: ParserType.Tree): ExtractResult {
  return { symbols: [], imports: [] };
}
