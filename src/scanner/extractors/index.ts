/**
 * Language extractor dispatcher.
 * Maps grammar names to extraction functions.
 */
import type ParserType from "web-tree-sitter";
import { extractGo } from "./go.js";
import { extractPython } from "./python.js";
import { type ExtractResult, extractTypeScript } from "./typescript.js";

export type { ExtractResult, ExtractedSymbol, ExtractedImport } from "./typescript.js";

/**
 * Run the appropriate extractor for a grammar.
 * Returns empty results for unsupported or stub grammars.
 */
export function extract(grammarName: string, tree: ParserType.Tree): ExtractResult {
  switch (grammarName) {
    case "typescript":
    case "tsx":
    case "javascript":
      return extractTypeScript(tree);
    case "python":
      return extractPython(tree);
    case "go":
      return extractGo(tree);
    default:
      return { symbols: [], imports: [] };
  }
}
